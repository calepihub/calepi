import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  analyzeSiteGeometry,
  buildSiteVerticesFromDimensions,
  calculatePolygonArea,
  calculatePolygonPerimeter,
  checkImplantationFeasibility,
  clampOpeningOffsetToWall,
  findBestHostWallForOpening,
  getFurnitureWorldRect,
  getOpeningWorldPosition,
  rectsOverlap,
  round2,
} from './geometry';
import {
  autoDistributeUnitsAcrossFloors,
  createBlankProject,
  createDefaultDemoProject,
  generateParametricUnitLayout,
} from './parametricGenerator';
import {
  calculateDrainageSizing,
  calculateElectricalSizing,
  calculateHydraulicSizing,
  calculateRainwaterSizing,
  evaluateAccessibility,
  evaluateUrbanCompliance,
  runCompatibilityAnalysis,
} from './engineering';
import {
  buildConstructionSchedule,
  calculateAnalyticalBreakdown,
  calculateBudgetSummary,
  calculateInvestorROI,
  calculateQuantities,
  compareConstructionMethodsForTypology,
  syncBudgetWithQuantities,
} from './quantitiesAndBudget';
import { applySinapiRJToBudget, SINAPI_RJ_CATALOG } from './sinapiRJ';
import { buildElevationData, buildJoinerySchedule, buildSpecialSystemsSummary } from './cadDrawings';
import {
  generateAnalyticalBudgetAndSchedulePDFBlob,
  generateCompleteProjectZIPBlob,
  generateMemorialDOCXBlob,
  generateMemorialPDFBlob,
  generateProjectDXF,
  generateProjectXLSXBuffer,
  TECHNICAL_SHEETS,
} from './exporters';
import { generateAllMemorials } from './memorialGenerator';
import { autoPopulateLandscaping } from './landscaping';
import {
  getNormalizedSanitaryFixtures,
  syncFinishesToTypologyRooms,
} from './finishesCatalog';
import {
  computeDrainageRouting,
  computeElectricalRouting,
  computeHydraulicRouting,
  getQdcPosition,
} from './mepRouting';

test('Geometry: Shoelace polygon area & perimeter for 12x25m site', () => {
  const verts = buildSiteVerticesFromDimensions(12, 12, 25, 25);
  assert.equal(calculatePolygonArea(verts), 300);
  assert.equal(calculatePolygonPerimeter(verts), 74);
});

test('Zero-Data Startup: createBlankProject starts strictly empty with no pre-created units or professionals', () => {
  const blank = createBlankProject({
    name: 'Residencial Botafogo',
    client: '',
    municipality: 'Rio de Janeiro',
    state: 'RJ',
    front: 12,
    depth: 25,
    floorsCount: 2,
    methodId: 'alvenaria_convencional',
  });

  assert.equal(blank.name, 'Residencial Botafogo');
  assert.equal(blank.state, 'RJ');
  assert.equal(blank.unitTypes.length, 0);
  assert.equal(blank.floors.length, 2);
  assert.equal(blank.floors.reduce((s, f) => s + f.units.length, 0), 0);
  assert.equal(blank.structuralElements.length, 0);
  assert.equal(blank.rainwaterElements.length, 0);
  assert.equal(blank.urbanRules.length, 0);
  assert.equal(blank.professionals.length, 0);
  assert.equal((blank.capturedRenders ?? []).length, 0);
  assert.equal(blank.budgetSettings.region, 'Rio de Janeiro (RJ)');

  const qty = calculateQuantities(blank);
  assert.equal(qty.summary.totalUnits, 0);
  assert.equal(qty.summary.totalBuiltAreaM2, 0);
  const bdg = calculateBudgetSummary(blank, qty);
  assert.equal(bdg.grandTotalCost, 0);
});

test('Acceptance Test Project (Section 34): 300m2 site, 2 floors, 12 units across 3 typologies fit cleanly', () => {
  const project = createDefaultDemoProject();
  const siteAnalysis = analyzeSiteGeometry(project.site);
  assert.equal(siteAnalysis.calculatedArea, 300);
  assert.equal(siteAnalysis.hasAreaDivergence, false);

  assert.equal(project.floors.length, 2);
  const totalUnits = project.floors.reduce((s, f) => s + f.units.length, 0);
  assert.equal(totalUnits, 12);
  assert.equal(project.unitTypes.length, 3);

  // Tipologias: 20m2, 25m2, 30m2
  assert.equal(project.unitTypes[0].targetArea, 20);
  assert.equal(project.unitTypes[1].targetArea, 25);
  assert.equal(project.unitTypes[2].targetArea, 30);

  for (const floor of project.floors) {
    const imp = checkImplantationFeasibility(project.site, floor.units, project.unitTypes);
    assert.equal(imp.fitsInBuildableArea, true);
    assert.equal(imp.outOfBoundsUnitIds.length, 0);
    assert.equal(imp.overlappingUnitPairs.length, 0);
  }

  const clashes = runCompatibilityAnalysis(project);
  assert.equal(clashes.filter((c) => c.severity === 'CRITICO').length, 0);
  assert.equal(clashes.filter((c) => c.severity === 'ATENCAO').length, 0);
});

test('Engineering: Electrical, Hydraulic, Drainage & Rainwater explicit non-hallucination checks', () => {
  const project = createDefaultDemoProject();
  const elec = calculateElectricalSizing(project);
  assert.equal(elec.totalUnits, 12);
  assert.ok(elec.totalInstalledKVA > 0);
  assert.ok(elec.totalDemandKVA > 0);

  const hyd = calculateHydraulicSizing(project);
  assert.equal(hyd.estimatedPopulation, 24);
  assert.equal(hyd.dailyConsumptionLiters, 24 * 150);
  assert.equal(hyd.recommendedTotalReservoirLiters, 24 * 150 * 2);

  const drain = calculateDrainageSizing(project);
  assert.equal(drain.length, 3);
  for (const d of drain) {
    assert.equal(d.slopeIssues.length, 0);
  }

  // Rainwater must NOT assume rainfall intensity when not provided
  const rain = calculateRainwaterSizing(project);
  assert.equal(rain.status, 'pendente_dados_pluviometricos');
  assert.equal(rain.flowLMin, null);
});

test('Urbanism & Accessibility: never auto-approves unverified municipal rules', () => {
  const project = createDefaultDemoProject();
  const urban = evaluateUrbanCompliance(project);
  assert.ok(urban.length >= 3);
  // Demo project has municipality = 'Não informado', so rules must require technical confirmation or show nao_informado
  for (const r of urban) {
    assert.notEqual(r.status, 'atendido');
  }

  const acc = evaluateAccessibility(project);
  assert.ok(acc.some((i) => i.id === 'acc-unit-exist' && i.status === 'NAO_ATENDIDO'));
});

test('Quantities, Budget, SINAPI-RJ regimes, CAD Elevations & AutoCAD DXF export', () => {
  const project = createDefaultDemoProject();
  const qty = calculateQuantities(project);
  assert.equal(qty.summary.totalUnits, 12);
  assert.equal(qty.summary.totalPrivateAreaM2, 300); // 4*20 + 4*25 + 4*30 = 80+100+120 = 300m2
  assert.ok(qty.summary.totalWallNetAreaM2 > 100);

  const bdg = calculateBudgetSummary(project, qty);
  assert.equal(bdg.unquotedCount, bdg.lines.length); // no invented prices before user applies SINAPI-RJ!
  assert.equal(bdg.grandTotalCost, 0);

  // Applying SINAPI-RJ Com Desoneração vs Sem Desoneração
  const deson = applySinapiRJToBudget(project, qty, 'desonerado');
  const pDeson = { ...project, ...deson };
  const sumDeson = calculateBudgetSummary(pDeson, qty);
  assert.ok(sumDeson.directTotalCost > 0);
  assert.equal(sumDeson.unquotedCount, 0);
  assert.ok(pDeson.budgetEntries.every((e) => Boolean(e.sinapiCode)));
  assert.ok(pDeson.budgetEntries.some((e) => e.code === 'ESP-01' && e.sinapiCode === '98298'));

  const naoDeson = applySinapiRJToBudget(project, qty, 'nao_desonerado');
  const pNaoDeson = { ...project, ...naoDeson };
  const sumNaoDeson = calculateBudgetSummary(pNaoDeson, qty);
  assert.ok(sumNaoDeson.directTotalCost > sumDeson.directTotalCost);

  // Preserves custom manual entry & sinapiCode on syncBudgetWithQuantities
  const customEntry = {
    id: 'bdg-custom-1',
    code: 'EXT-99',
    description: 'Muro de divisa RJ',
    discipline: 'Obras Externas',
    category: 'servico' as const,
    unit: 'm²',
    quantity: 50,
    unitPrice: 120,
    lossFactorPercent: 0,
    supplier: 'Manual',
    sourceBase: 'Manual',
    notes: '',
  };
  const synced = syncBudgetWithQuantities(
    { ...pDeson, budgetEntries: [...pDeson.budgetEntries, customEntry] },
    qty,
  );
  assert.ok(synced.some((e) => e.code === 'EXT-99' && e.unitPrice === 120));
  assert.ok(synced.some((e) => e.code === 'ARQ-01' && e.sinapiCode === '87519'));

  const comp = compareConstructionMethodsForTypology(project.unitTypes[1]);
  assert.equal(comp.length, 5);
  assert.ok(comp[0].costEstimate.includes('SINAPI-RJ'));

  const mems = generateAllMemorials(project);
  assert.equal(mems.length, 10);
  assert.ok(mems[0].content.includes('300 m²'));

  const joinery = buildJoinerySchedule(project);
  assert.ok(joinery.length >= 2);
  const elev = buildElevationData(project, 'frontal');
  assert.equal(elev.floors.length, 2);
  assert.ok(elev.totalHeight > 5);

  // Special Systems (CFTV, Antena/TV, Internet/Dados, Wi-Fi 6, Interfone) & Sheet E06
  assert.ok(TECHNICAL_SHEETS.some((s) => s.id === 'E06' && s.discipline === 'Elétrica'));
  const specials = buildSpecialSystemsSummary(project);
  assert.equal(specials.totalUnits, 12);
  assert.ok(specials.rj45Points >= 12);
  assert.ok(specials.tvPoints >= 12);
  assert.ok(specials.wifiApPoints >= 12);
  assert.ok(specials.cftvCommonCameras >= 6);
  assert.equal(specials.backboneItems.length, 6);

  const dxf = generateProjectDXF(project, 0);
  assert.ok(dxf.includes('SECTION'));
  assert.ok(dxf.includes('TERRENO'));
  assert.ok(dxf.includes('PAREDES_EXT'));
  assert.ok(dxf.includes('ESPECIAIS'));
  assert.ok(dxf.includes('SANITARIA'));
  assert.ok(dxf.includes('LWPOLYLINE'));
  assert.ok(dxf.includes('ARC'));
  assert.ok(dxf.includes('EIXOS'));
  assert.ok(dxf.includes('COTAS'));
  assert.ok(dxf.includes('EOF'));
});

test('Clash detection catches furniture overlap and missing power', () => {
  const ut = generateParametricUnitLayout({
    code: 'TEST-1',
    name: 'Test Unit',
    width: 4.0,
    depth: 5.0,
    ceilingHeight: 2.8,
    bedrooms: 0,
    hasLaundry: false,
    hasBalcony: false,
    hasMezzanine: false,
    accessible: false,
    extWallThickness: 0.15,
    intWallThickness: 0.1,
    constructionSystem: 'alvenaria_convencional',
  });
  const project = createDefaultDemoProject();
  // Move cama to overlap with mesa intentionally (avoiding nested items like espelho/chuveiro)
  const cama = ut.furniture.find((f) => f.category === 'cama');
  const mesa = ut.furniture.find((f) => f.category === 'mesa');
  assert.ok(cama && mesa);
  cama.x = mesa.x;
  cama.y = mesa.y;
  project.unitTypes = [ut];

  const clashes = runCompatibilityAnalysis(project);
  assert.ok(clashes.some((c) => c.severity === 'CRITICO' && c.disciplines.includes('Mobiliário')));
});

test('Blank project auto-prices with SINAPI-RJ after distributing units and generates analytical WBS, 7-sheet XLSX, PDFs, DOCX, and ZIP', async () => {
  const blank = createBlankProject({
    name: 'Residencial Zero Test',
    client: '',
    municipality: '',
    state: '',
    front: 12,
    depth: 25,
    floorsCount: 2,
    methodId: 'alvenaria_convencional',
  });

  // Blank UF stays empty (never forced to RJ) while budget regime defaults to SINAPI-RJ desonerado
  assert.equal(blank.state, '');
  assert.equal(blank.budgetSettings.sinapiRegime, 'desonerado');

  const ut = generateParametricUnitLayout({
    code: 'TIPO-A',
    name: 'Kitnet 20m2',
    width: 4.0,
    depth: 5.0,
    ceilingHeight: 2.8,
    bedrooms: 0,
    hasLaundry: true,
    hasBalcony: false,
    hasMezzanine: false,
    accessible: false,
    extWallThickness: 0.15,
    intWallThickness: 0.1,
    constructionSystem: 'alvenaria_convencional',
  });

  const withUnits = autoDistributeUnitsAcrossFloors(
    { ...blank, unitTypes: [ut] },
    ut.id,
  );
  const placedCount = withUnits.floors.reduce((s, f) => s + f.units.length, 0);
  assert.ok(placedCount > 0);

  const qty = calculateQuantities(withUnits);
  for (const requiredCode of ['PRE-01', 'PRE-02', 'FUN-01', 'IMP-01', 'COB-01']) {
    assert.ok(qty.items.some((i) => i.code === requiredCode), `Missing ${requiredCode}`);
    assert.ok(SINAPI_RJ_CATALOG[requiredCode], `Missing SINAPI_RJ_CATALOG entry for ${requiredCode}`);
  }

  const budget = calculateBudgetSummary(withUnits, qty);
  assert.equal(budget.unquotedCount, 0);
  assert.ok(budget.grandTotalCost > 0);

  const analytical = calculateAnalyticalBreakdown(budget, withUnits);
  assert.ok(analytical.totalMaterialCost > 0);
  assert.ok(analytical.totalLaborCost > 0);
  assert.ok(Math.abs(analytical.totalMaterialCost + analytical.totalLaborCost - budget.directTotalCost) < 1);
  assert.ok(analytical.stageSummaries.length >= 4);

  const schedule = buildConstructionSchedule(budget.grandTotalCost, 6);
  assert.equal(schedule.months, 6);
  assert.ok(Math.abs(schedule.cumulativeTotals[5] - budget.grandTotalCost) < 0.1);

  const xlsxBuf = await generateProjectXLSXBuffer(withUnits, 6);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(xlsxBuf) as unknown as ArrayBuffer);
  assert.deepEqual(
    wb.worksheets.map((ws) => ws.name),
    [
      'Resumo Executivo',
      'Quantitativos',
      'Orçamento Analítico',
      'Curva ABC',
      'Cronograma Físico-Fin',
      'Quadro de Cargas',
      'Pontos MEP',
    ],
  );

  const budgetPdf = generateAnalyticalBudgetAndSchedulePDFBlob(withUnits, 6);
  assert.ok(budgetPdf.size > 2000);

  const memorialPdf = generateMemorialPDFBlob(withUnits);
  assert.ok(memorialPdf.size > 2000);

  const memorialDocx = await generateMemorialDOCXBlob(withUnits);
  assert.ok(memorialDocx.size > 3000);

  const zipBlob = await generateCompleteProjectZIPBlob(withUnits);
  const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
  const files = Object.keys(zip.files);
  assert.ok(files.some((f) => f.includes('09 — Orçamento/Orcamento_Analitico_Cronograma_SINAPI_RJ.pdf')));
  assert.ok(files.some((f) => f.includes('07 — Memorial descritivo/Memorial_Descritivo_Executivo.pdf')));
});

test('Fixed door widths (80/60/70cm), all 3 entrySide orientations, Drywall SINAPI-RJ, and conditional Mezzanine >= 3.0m', () => {
  const entries: Array<'frente' | 'lateral_direita' | 'lateral_esquerda'> = [
    'frente',
    'lateral_direita',
    'lateral_esquerda',
  ];

  // 1. Fixed widths & 0 clashes across all 3 entrySide orientations for studio (0) and 1-bedroom (1)
  for (const bedrooms of [0, 1]) {
    for (const entrySide of entries) {
      const ut = generateParametricUnitLayout({
        code: `UT-${bedrooms}-${entrySide}`,
        name: `Unidade ${bedrooms}Q ${entrySide}`,
        width: 4.5,
        depth: 6.2,
        ceilingHeight: 2.8,
        bedrooms,
        hasLaundry: true,
        hasBalcony: false,
        hasMezzanine: true, // MUST be forced false because ceilingHeight < 3.0m
        accessible: false,
        extWallThickness: 0.15,
        intWallThickness: 0.1,
        constructionSystem: 'alvenaria_convencional',
        entrySide,
        internalPartitionType: 'alvenaria',
      });

      assert.equal(ut.hasMezzanine, false, 'Mezzanine must be blocked when ceilingHeight < 3.0m');
      assert.equal(ut.mezzanine, undefined);

      const p1 = ut.openings.find((o) => o.code === 'P1');
      const p2 = ut.openings.find((o) => o.code === 'P2');
      assert.ok(p1 && p2);
      assert.equal(p1.width, 0.8);
      assert.equal(p2.width, 0.6);

      if (bedrooms === 1) {
        const p3 = ut.openings.find((o) => o.code === 'P3');
        assert.ok(p3);
        assert.equal(p3.width, 0.7);
      }

      const blank = createBlankProject({
        name: 'Teste Orientação',
        client: '',
        municipality: 'Rio de Janeiro',
        state: 'RJ',
        front: 12,
        depth: 25,
        floorsCount: 1,
        methodId: 'alvenaria_convencional',
      });
      const withUnit = autoDistributeUnitsAcrossFloors({ ...blank, unitTypes: [ut] }, ut.id);
      const clashes = runCompatibilityAnalysis(withUnit);
      assert.equal(
        clashes.filter((c) => c.severity === 'CRITICO').length,
        0,
        `Unexpected CRITICO clash for bedrooms=${bedrooms}, entrySide=${entrySide}: ${JSON.stringify(clashes)}`,
      );
      assert.equal(
        clashes.filter((c) => c.severity === 'ATENCAO').length,
        0,
        `Unexpected ATENCAO clash for bedrooms=${bedrooms}, entrySide=${entrySide}: ${JSON.stringify(clashes)}`,
      );
    }
  }

  // 2. Drywall partition emits ARQ-03 (96359) and reduces ALV-01 masonry blocks vs Alvenaria
  const makeForPartition = (internalPartitionType: 'alvenaria' | 'drywall') => {
    const ut = generateParametricUnitLayout({
      code: 'PART-1',
      name: `Kit ${internalPartitionType}`,
      width: 4.0,
      depth: 5.5,
      ceilingHeight: 2.8,
      bedrooms: 1,
      hasLaundry: false,
      hasBalcony: false,
      hasMezzanine: false,
      accessible: false,
      extWallThickness: 0.15,
      intWallThickness: internalPartitionType === 'drywall' ? 0.095 : 0.1,
      constructionSystem: 'alvenaria_convencional',
      entrySide: 'lateral_direita',
      internalPartitionType,
    });
    const p = createBlankProject({
      name: 'Teste Drywall',
      client: '',
      municipality: 'Rio de Janeiro',
      state: 'RJ',
      front: 12,
      depth: 25,
      floorsCount: 1,
      methodId: 'alvenaria_convencional',
    });
    return autoDistributeUnitsAcrossFloors({ ...p, unitTypes: [ut] }, ut.id);
  };

  const projAlv = makeForPartition('alvenaria');
  const projDry = makeForPartition('drywall');
  const qtyAlv = calculateQuantities(projAlv);
  const qtyDry = calculateQuantities(projDry);

  assert.ok(qtyDry.items.some((i) => i.code === 'ARQ-03'));
  assert.ok(!qtyAlv.items.some((i) => i.code === 'ARQ-03'));
  const blocksAlv = qtyAlv.items.find((i) => i.code === 'ALV-01')?.netQuantity ?? 0;
  const blocksDry = qtyDry.items.find((i) => i.code === 'ALV-01')?.netQuantity ?? 0;
  assert.ok(blocksDry < blocksAlv, 'Drywall internal partitions must reduce ALV-01 masonry block count');

  // 3. Conditional Mezzanine when ceilingHeight >= 3.0m with Blondel staircase & 0 floors added
  const utMez = generateParametricUnitLayout({
    code: 'MEZ-1',
    name: 'Kit Pé-Direito Alto + Mezanino',
    width: 4.2,
    depth: 6.2,
    ceilingHeight: 3.6,
    bedrooms: 0,
    hasLaundry: false,
    hasBalcony: false,
    hasMezzanine: true,
    accessible: false,
    extWallThickness: 0.15,
    intWallThickness: 0.095,
    constructionSystem: 'alvenaria_convencional',
    entrySide: 'frente',
    internalPartitionType: 'drywall',
    mezzanineZone: 'sobre_banho_cozinha',
    mezzanineElevationM: 2.2,
    mezzanineCoverageRatio: 0.42,
    mezzanineUsage: 'dormitorio',
    mezzanineStructureType: 'metalica_madeira',
    mezzanineStairLayout: 'reta',
    mezzanineStairSide: 'esquerda',
  });

  assert.equal(utMez.hasMezzanine, true);
  assert.ok(utMez.mezzanine?.enabled);
  const stair = utMez.furniture.find((f) => f.category === 'escada');
  assert.ok(stair && stair.stairSpec);
  assert.ok(stair.stairSpec.blondelSumM >= 0.6 && stair.stairSpec.blondelSumM <= 0.66);

  const blankMez = createBlankProject({
    name: 'Residencial Mezanino',
    client: '',
    municipality: 'Rio de Janeiro',
    state: 'RJ',
    front: 12,
    depth: 25,
    floorsCount: 1,
    methodId: 'alvenaria_convencional',
  });
  const projMez = autoDistributeUnitsAcrossFloors({ ...blankMez, unitTypes: [utMez] }, utMez.id);
  // Mezzanine NEVER counts as an additional floor
  assert.equal(projMez.floors.length, 1);

  const mezClashes = runCompatibilityAnalysis(projMez);
  assert.equal(
    mezClashes.filter((c) => c.severity === 'CRITICO').length,
    0,
    `Unexpected CRITICO clash in mezzanine layout: ${JSON.stringify(mezClashes)}`,
  );

  const qtyMez = calculateQuantities(projMez);
  assert.ok(qtyMez.items.some((i) => i.code === 'MEZ-01'));
  assert.ok(qtyMez.items.some((i) => i.code === 'ESC-01'));
  const bdgMez = calculateBudgetSummary(projMez, qtyMez);
  assert.equal(bdgMez.unquotedCount, 0);

  const dxfMez = generateProjectDXF(projMez, 0);
  assert.ok(dxfMez.includes('PAREDES_INT_DRYWALL'));
  assert.ok(dxfMez.includes('MEZANINO'));
  assert.ok(dxfMez.includes('ESCADA'));
});

import {
  createDefaultImplantationConfig,
  detectSharedWallsAndGaps,
  generateImplantationUnits,
  getLotBoundarySegments,
  normalizeSiteData,
  replicateGroundFloorToAllFloors,
  setProjectFloorCount,
  validateImplantation,
} from './implantation';
import { generateTechnicalSheetPDFBlob } from './exporters';
import { buildSheetTabulations } from './cadDrawings';
import type { ImplantationConfig, Project } from '../types/project';

function makeQuickUnitType(code: string, width: number, depth: number, entrySide: 'frente' | 'lateral_direita' | 'lateral_esquerda' = 'frente') {
  return generateParametricUnitLayout({
    code,
    name: `Modelo ${code}`,
    width,
    depth,
    ceilingHeight: 2.8,
    bedrooms: 0,
    hasLaundry: true,
    hasBalcony: false,
    hasMezzanine: false,
    accessible: false,
    extWallThickness: 0.15,
    intWallThickness: 0.1,
    constructionSystem: 'alvenaria_convencional',
    entrySide,
    internalPartitionType: 'alvenaria',
  });
}

test('Implantation Scenarios 1-5: Isolated, Geminated (0m), Separated (1.5m), Asymmetric Left/Right, and Rear Cluster', () => {
  const ut = makeQuickUnitType('KIT-A', 4.0, 5.0, 'frente');
  const baseBlank = createBlankProject({
    name: 'Residencial Implantação Teste',
    client: 'Cliente Teste',
    municipality: 'Niterói',
    state: 'RJ',
    front: 12,
    depth: 25,
    floorsCount: 1,
    methodId: 'alvenaria_convencional',
    measurementUnit: 'm',
    streetSide: 'baixo',
  });
  const baseProj = { ...baseBlank, unitTypes: [ut] };

  // Scenario 1: Single isolated kitnet in central / frontal / fundos zones
  for (const zone of ['frontal', 'centralizada', 'fundos'] as const) {
    const cfg = {
      ...createDefaultImplantationConfig(baseProj),
      primaryZone: zone,
      layoutPattern: 'isolada' as const,
      totalUnitsTarget: 1,
      couplingMode: 'separadas' as const,
      interUnitSpacingM: 1.5,
    };
    const units = generateImplantationUnits(baseProj, cfg, baseProj.floors[0].id);
    assert.equal(units.length, 1);
    const pZone = {
      ...baseProj,
      implantation: cfg,
      floors: [{ ...baseProj.floors[0], units }],
    };
    const rep = validateImplantation(pZone);
    assert.equal(rep.isValid, true, `Zone ${zone} should be valid: ${JSON.stringify(rep.issues)}`);
    assert.equal(rep.criticalCount, 0);
  }

  // Scenario 2: Geminated kitnets touching at 0.00m (shared wall, zero overlap alert)
  const cfgGem = {
    ...createDefaultImplantationConfig(baseProj),
    primaryZone: 'lado_esquerdo' as const,
    layoutPattern: 'sequencia' as const,
    totalUnitsTarget: 3,
    leftCount: 3,
    rightCount: 0,
    couplingMode: 'geminadas' as const,
    interUnitSpacingM: 0,
  };
  const gemUnits = generateImplantationUnits(baseProj, cfgGem, baseProj.floors[0].id);
  assert.equal(gemUnits.length, 3);
  const pGem = {
    ...baseProj,
    implantation: cfgGem,
    floors: [{ ...baseProj.floors[0], units: gemUnits }],
  };
  const repGem = validateImplantation(pGem);
  assert.equal(repGem.isValid, true, `Geminated should be valid: ${JSON.stringify(repGem.issues)}`);
  assert.equal(repGem.sharedWalls.length, 2);
  assert.ok(!repGem.issues.some((i) => i.code === 'OVERLAP'));
  assert.ok(!repGem.issues.some((i) => i.code === 'SPACING_MISMATCH'));

  // Scenario 3: Separated kitnets with 1.50m gap
  const cfgSep = {
    ...createDefaultImplantationConfig(baseProj),
    primaryZone: 'lado_esquerdo' as const,
    layoutPattern: 'sequencia' as const,
    totalUnitsTarget: 3,
    couplingMode: 'separadas' as const,
    interUnitSpacingM: 1.5,
  };
  const sepUnits = generateImplantationUnits(baseProj, cfgSep, baseProj.floors[0].id);
  const pSep = {
    ...baseProj,
    implantation: cfgSep,
    floors: [{ ...baseProj.floors[0], units: sepUnits }],
  };
  const repSep = validateImplantation(pSep);
  assert.equal(repSep.isValid, true, `Separated should be valid: ${JSON.stringify(repSep.issues)}`);
  assert.equal(repSep.sharedWalls.length, 0);
  assert.equal(repSep.metrics.minMeasuredInterUnitGapM, 1.5);

  // Scenario 4: Asymmetric distribution (3 left + 1 right, AND 2 left + 0 right without forcing right)
  const cfgAsym = {
    ...createDefaultImplantationConfig(baseProj),
    primaryZone: 'ambos_lados' as const,
    layoutPattern: 'ambos_lados' as const,
    totalUnitsTarget: 4,
    leftCount: 3,
    rightCount: 1,
    couplingMode: 'geminadas' as const,
  };
  const asymUnits = generateImplantationUnits(baseProj, cfgAsym, baseProj.floors[0].id);
  assert.equal(asymUnits.filter((u) => u.zoneSide === 'esquerdo').length, 3);
  assert.equal(asymUnits.filter((u) => u.zoneSide === 'direito').length, 1);

  const cfgOneSide = {
    ...cfgAsym,
    totalUnitsTarget: 2,
    leftCount: 2,
    rightCount: 0,
  };
  const oneSideUnits = generateImplantationUnits(baseProj, cfgOneSide, baseProj.floors[0].id);
  assert.equal(oneSideUnits.filter((u) => u.zoneSide === 'esquerdo').length, 2);
  assert.equal(oneSideUnits.filter((u) => u.zoneSide === 'direito').length, 0);

  // Scenario 5: Rear cluster + clear front gate access
  const cfgRear = {
    ...createDefaultImplantationConfig(baseProj),
    primaryZone: 'fundos' as const,
    layoutPattern: 'conjunto_fundos' as const,
    totalUnitsTarget: 2,
    couplingMode: 'geminadas' as const,
  };
  const rearUnits = generateImplantationUnits(baseProj, cfgRear, baseProj.floors[0].id);
  const pRear = {
    ...baseProj,
    implantation: cfgRear,
    floors: [{ ...baseProj.floors[0], units: rearUnits }],
  };
  const repRear = validateImplantation(pRear);
  assert.equal(repRear.isValid, true);
  assert.ok((repRear.metrics.realSetbacksMeasured.front ?? 0) > 10);
});

test('Implantation Scenarios 6-10: Mixed Typologies, Street-Side Rotation, Live Propagation, Serialization, Validation Errors & SINAPI/DXF/PDF Integrity', () => {
  const utSmall = makeQuickUnitType('KIT-P', 3.6, 5.0, 'frente');
  const utLarge = makeQuickUnitType('KIT-G', 4.4, 6.0, 'frente');
  const blank = createBlankProject({
    name: 'Residencial Misto Avançado',
    client: 'Construtora Carioca',
    municipality: 'Rio de Janeiro',
    state: 'RJ',
    front: 24,
    depth: 18,
    floorsCount: 1,
    methodId: 'alvenaria_convencional',
    measurementUnit: 'cm',
    streetSide: 'esquerda',
  });

  // Custom boundary conditions across all 4 edges + vehicle gate
  blank.site.boundaries = {
    front: { condition: 'aberta', heightM: 0, hasNeighborBuilding: false, notes: 'Rua' },
    back: { condition: 'compartilhada', heightM: 2.4, hasNeighborBuilding: true, notes: 'Vizinho fundos' },
    left: { condition: 'murada', heightM: 2.2, hasNeighborBuilding: false, notes: 'Muro bloco' },
    right: { condition: 'cerca', heightM: 1.6, hasNeighborBuilding: false, notes: 'Gradil' },
  };
  blank.site.accesses = [
    { id: 'g1', label: 'Portão Social', type: 'pedestre', side: 'front', offsetM: 0.8, widthM: 1.1, enabled: true },
    { id: 'g2', label: 'Portão Garagem', type: 'veiculo', side: 'front', offsetM: 7.5, widthM: 3.2, enabled: true },
  ];

  const baseMixed = { ...blank, unitTypes: [utSmall, utLarge] };
  const cfgMixed: ImplantationConfig = {
    ...createDefaultImplantationConfig(baseMixed),
    primaryZone: 'ambos_lados',
    layoutPattern: 'personalizada',
    totalUnitsTarget: 4,
    modelMode: 'misto_repeticao',
    couplingMode: 'mista',
    groups: [
      {
        id: 'grp-1',
        label: 'Bloco Esq Geminado',
        zone: 'lado_esquerdo',
        count: 2,
        unitTypeId: utSmall.id,
        coupling: 'geminadas',
        spacingM: 0,
        mirroredRule: 'nenhuma',
        shareWallWithNeighbor: true,
        entranceOrientation: 'frente',
      },
      {
        id: 'grp-2',
        label: 'Bloco Dir Separado',
        zone: 'lado_direito',
        count: 2,
        unitTypeId: utLarge.id,
        coupling: 'separadas',
        spacingM: 1.6,
        mirroredRule: 'nenhuma',
        shareWallWithNeighbor: false,
        entranceOrientation: 'frente',
      },
    ],
  };

  const mixedUnits = generateImplantationUnits(baseMixed, cfgMixed, baseMixed.floors[0].id);
  assert.equal(mixedUnits.length, 4);
  const projMixed: Project = {
    ...baseMixed,
    implantation: cfgMixed,
    floors: [{ ...baseMixed.floors[0], units: mixedUnits }],
  };

  // Scenario 6 & 7: Street-side 'esquerda' boundary mapping + live propagation to quantities/CAD/DXF/PDF
  const segs = getLotBoundarySegments(projMixed.site);
  const frontSeg = segs.find((s) => s.side === 'front');
  assert.ok(frontSeg && frontSeg.a.x === 0 && frontSeg.b.x === 0);
  const repMixed = validateImplantation(projMixed);
  assert.equal(repMixed.isValid, true, `Mixed project should be valid: ${JSON.stringify(repMixed.issues)}`);
  assert.equal(repMixed.sharedWalls.length, 1);

  const qtyMixed = calculateQuantities(projMixed);
  assert.equal(qtyMixed.summary.totalUnits, 4);
  assert.equal(qtyMixed.summary.totalPrivateAreaM2, round2(2 * (3.6 * 5.0) + 2 * (4.4 * 6.0)));
  const bdgMixed = calculateBudgetSummary(projMixed, qtyMixed);
  assert.ok(bdgMixed.grandTotalCost > 0);

  const tabs = buildSheetTabulations(projMixed);
  assert.equal(tabs.areaRows.length, 2);

  const dxfMixed = generateProjectDXF(projMixed, 0);
  assert.ok(dxfMixed.includes('DIVISA_COMPARTILHADA'));
  assert.ok(dxfMixed.includes('DIVISA_CERCA'));
  assert.ok(dxfMixed.includes('PAREDES_GEMINADAS'));
  assert.ok(dxfMixed.includes('ACESSOS'));

  const pdfA02 = generateTechnicalSheetPDFBlob(projMixed, 'A02', 0);
  assert.ok(pdfA02.size > 2000);

  // Scenario 8: JSON serialization round-trip + legacy project compatibility
  const roundTrip = JSON.parse(JSON.stringify(projMixed)) as typeof projMixed;
  assert.equal(roundTrip.site.measurementUnit, 'cm');
  assert.equal(roundTrip.site.streetSide, 'esquerda');
  assert.equal(roundTrip.implantation?.groups.length, 2);
  const demoLegacy = createDefaultDemoProject();
  assert.equal(normalizeSiteData(demoLegacy.site).streetSide, 'baixo');
  assert.equal(validateImplantation(demoLegacy).criticalCount, 0);

  // Scenario 9: Explicit validation error detection
  // 9A. Out of bounds + Blocked Gate
  const badOutAndGate = structuredClone(projMixed);
  badOutAndGate.floors[0].units[0].x = -0.4; // outside lot + blocks front gate at x=0!
  badOutAndGate.floors[0].units[0].y = 1.0;
  const repBadA = validateImplantation(badOutAndGate);
  assert.ok(repBadA.issues.some((i) => i.code === 'OUT_OF_BOUNDS'));
  assert.ok(repBadA.issues.some((i) => i.code === 'BLOCKED_ACCESS'));

  // 9B. Count divergence + Overlap + Separated units touching
  const badOverlap = structuredClone(projMixed);
  badOverlap.implantation!.totalUnitsTarget = 6; // mismatch with 4
  badOverlap.implantation!.couplingMode = 'separadas';
  badOverlap.implantation!.interUnitSpacingM = 1.5;
  badOverlap.floors[0].units[1].x = badOverlap.floors[0].units[0].x;
  badOverlap.floors[0].units[1].y = badOverlap.floors[0].units[0].y + 1.0; // physical overlap
  const repBadB = validateImplantation(badOverlap);
  assert.ok(repBadB.issues.some((i) => i.code === 'COUNT_DIVERGENCE'));
  assert.ok(repBadB.issues.some((i) => i.code === 'OVERLAP'));

  // 9C. Shared wall with opening conflict & corridor conflict
  const utFrontDoor = makeQuickUnitType('KIT-DOOR', 4.0, 5.0, 'frente');
  const pBack = createBlankProject({
    name: 'Conflito Parede',
    client: '',
    municipality: '',
    state: 'RJ',
    front: 12,
    depth: 25,
    floorsCount: 1,
    methodId: 'alvenaria_convencional',
  });
  const projConflict = {
    ...pBack,
    unitTypes: [utFrontDoor],
    implantation: {
      ...createDefaultImplantationConfig(pBack),
      couplingMode: 'geminadas' as const,
      totalUnitsTarget: 2,
      circulation: {
        ...createDefaultImplantationConfig(pBack).circulation,
        corridorWidthM: 2.0,
      },
    },
    floors: [
      {
        ...pBack.floors[0],
        corridorWidth: 2.0,
        units: [
          {
            id: 'u1',
            unitNumber: '101',
            unitTypeId: utFrontDoor.id,
            floorId: pBack.floors[0].id,
            x: 1.5,
            y: 3.0,
            rotationDeg: 0,
            mirrored: false,
          },
          {
            id: 'u2',
            unitNumber: '102',
            unitTypeId: utFrontDoor.id,
            floorId: pBack.floors[0].id,
            // Touches bottom edge of u1 where u1 has J1/P1 front openings -> SHARED_WALL_CONFLICT
            x: 1.5,
            y: 8.0,
            rotationDeg: 0,
            mirrored: false,
          },
          {
            id: 'u3',
            unitNumber: '103',
            unitTypeId: utFrontDoor.id,
            floorId: pBack.floors[0].id,
            // Corridor between u1 (maxX=5.5) and u3 (x=6.6) = 1.10m < 2.0m -> CORRIDOR_CONFLICT
            x: 6.6,
            y: 3.0,
            rotationDeg: 0,
            mirrored: false,
          },
        ],
      },
    ],
  };
  const { sharedWalls: swConflict } = detectSharedWallsAndGaps(
    projConflict.floors[0].units,
    projConflict.unitTypes,
  );
  assert.equal(swConflict.length, 1);
  assert.ok(swConflict[0].conflictingOpenings.length > 0);
  const repConflict = validateImplantation(projConflict);
  assert.ok(repConflict.issues.some((i) => i.code === 'SHARED_WALL_CONFLICT'));
  assert.ok(repConflict.issues.some((i) => i.code === 'CORRIDOR_CONFLICT'));
  // Honest municipal notice (never approves municipal zoning without rules)
  assert.ok(repConflict.municipalValidationNote.includes('não implica aprovação'));
});

test('Front Boundary Wall (Muro Frontal): defaults strictly to murada with 2.0m height', () => {
  const demo = createDefaultDemoProject();
  assert.equal(demo.site.boundaries?.front.condition, 'murada');
  assert.equal(demo.site.boundaries?.front.heightM, 2.0);

  const blank = createBlankProject({
    name: 'Muro Frontal Teste',
    client: '',
    municipality: 'Niterói',
    state: 'RJ',
    front: 12,
    depth: 25,
    floorsCount: 1,
    methodId: 'alvenaria_convencional',
  });
  assert.equal(blank.site.boundaries?.front.condition, 'murada');
  assert.equal(blank.site.boundaries?.front.heightM, 2.0);

  // Legacy site without explicit boundaries also normalizes front to murada
  const norm = normalizeSiteData({
    ...blank.site,
    boundaries: undefined,
  });
  assert.equal(norm.boundaries.front.condition, 'murada');
  assert.equal(norm.boundaries.front.heightM, 2.0);
});

test('Ergonomic Interior Layout Matrix: zero overlapping furniture, zero blocked doors, 100% BFS room reachability, fixed door widths', () => {
  const matrix: Array<{
    w: number;
    d: number;
    bedrooms: 0 | 1;
    hasLaundry: boolean;
    hasMezzanine: boolean;
    ceilingH: number;
    entrySide: 'frente' | 'lateral_direita' | 'lateral_esquerda';
    mezzanineUsage?: 'dormitorio' | 'home_office';
  }> = [
    { w: 3.0, d: 4.8, bedrooms: 0, hasLaundry: true, hasMezzanine: false, ceilingH: 2.8, entrySide: 'frente' },
    { w: 3.4, d: 5.2, bedrooms: 0, hasLaundry: true, hasMezzanine: false, ceilingH: 2.8, entrySide: 'lateral_direita' },
    { w: 3.8, d: 5.5, bedrooms: 1, hasLaundry: true, hasMezzanine: false, ceilingH: 2.8, entrySide: 'lateral_esquerda' },
    { w: 4.5, d: 6.2, bedrooms: 1, hasLaundry: true, hasMezzanine: true, ceilingH: 3.4, entrySide: 'frente', mezzanineUsage: 'home_office' },
    { w: 4.2, d: 5.8, bedrooms: 0, hasLaundry: false, hasMezzanine: true, ceilingH: 3.5, entrySide: 'lateral_direita' },
  ];

  const baseProj = createBlankProject({
    name: 'Matriz Ergonômica',
    client: '',
    municipality: 'Rio de Janeiro',
    state: 'RJ',
    front: 12,
    depth: 25,
    floorsCount: 1,
    methodId: 'alvenaria_convencional',
  });

  matrix.forEach((cfg, idx) => {
    const ut = generateParametricUnitLayout({
      code: `MTX-${idx + 1}`,
      name: `Matriz ${idx + 1}`,
      width: cfg.w,
      depth: cfg.d,
      ceilingHeight: cfg.ceilingH,
      bedrooms: cfg.bedrooms,
      hasLaundry: cfg.hasLaundry,
      hasBalcony: false,
      hasMezzanine: cfg.hasMezzanine,
      mezzanineUsage: cfg.mezzanineUsage,
      accessible: false,
      extWallThickness: 0.15,
      intWallThickness: 0.1,
      constructionSystem: 'alvenaria_convencional',
      entrySide: cfg.entrySide,
      internalPartitionType: 'alvenaria',
    });

    // Fixed mandatory door widths: entrada=0.80, banheiro=0.60, quarto=0.70
    const entryDoor = ut.openings.find((o) => o.type === 'porta' && o.role === 'entrada');
    const bathDoor = ut.openings.find((o) => o.type === 'porta' && o.role === 'banheiro');
    assert.ok(entryDoor && entryDoor.width === 0.8, `Entrada width mismatch on MTX-${idx + 1}`);
    assert.ok(bathDoor && bathDoor.width === 0.6, `Banheiro width mismatch on MTX-${idx + 1}`);
    if (cfg.bedrooms > 0) {
      const bedDoor = ut.openings.find((o) => o.type === 'porta' && o.role === 'quarto');
      assert.ok(bedDoor && bedDoor.width === 0.7, `Quarto width mismatch on MTX-${idx + 1}`);
    }

    // Zero ground-level furniture-to-furniture overlaps (respecting nested fixtures like box+chuveiro, bancada+cooktop, rack_tv+tv, espelho+lavatorio)
    const groundItems = ut.furniture.filter((f) => (f.elevationM ?? 0) < 0.5 && f.category !== 'luminaria');
    for (let i = 0; i < groundItems.length; i++) {
      for (let j = i + 1; j < groundItems.length; j++) {
        const pair = [groundItems[i].category, groundItems[j].category].sort().join('+');
        if (
          pair === 'bancada+cooktop' ||
          pair === 'box+chuveiro' ||
          pair === 'espelho+lavatorio' ||
          pair === 'rack_tv+tv' ||
          pair === 'armario+tv'
        ) {
          continue;
        }
        const ra = getFurnitureWorldRect(groundItems[i]);
        const rb = getFurnitureWorldRect(groundItems[j]);
        assert.equal(
          rectsOverlap(ra, rb, 0.03),
          false,
          `MTX-${idx + 1}: "${groundItems[i].name}" overlaps "${groundItems[j].name}"`,
        );
      }
    }

    // Run engineering clash check (door swings + furniture + grid BFS reachability)
    const testProj: Project = {
      ...baseProj,
      unitTypes: [ut],
      floors: [
        {
          ...baseProj.floors[0],
          units: [
            {
              id: `u-${idx}`,
              unitNumber: '101',
              unitTypeId: ut.id,
              floorId: baseProj.floors[0].id,
              x: 2.0,
              y: 3.0,
              rotationDeg: 0,
              mirrored: false,
            },
          ],
        },
      ],
    };
    const clashes = runCompatibilityAnalysis(testProj);
    const furClashes = clashes.filter((c) => c.id.startsWith('clash-fur-'));
    const doorClashes = clashes.filter((c) => c.id.startsWith('clash-door-'));
    const accessClashes = clashes.filter((c) => c.id.startsWith('clash-access-'));
    assert.equal(furClashes.length, 0, `MTX-${idx + 1} furniture clashes: ${JSON.stringify(furClashes)}`);
    assert.equal(doorClashes.length, 0, `MTX-${idx + 1} door clashes: ${JSON.stringify(doorClashes)}`);
    assert.equal(accessClashes.length, 0, `MTX-${idx + 1} unreachable rooms: ${JSON.stringify(accessClashes)}`);
  });
});

test('Landscaping & Leisure: autoPopulateLandscaping avoids building footprints and syncs with SINAPI-RJ quantities', () => {
  const proj = createDefaultDemoProject();
  const populated = autoPopulateLandscaping(proj);

  assert.ok(populated.surfaceZones.length >= 1);
  assert.ok(populated.plants.length >= 2);

  // Verify plants stay inside lot and outside ground-floor unit footprints
  const utMap = new Map(proj.unitTypes.map((u) => [u.id, u]));
  const groundUnits = proj.floors[0].units.map((inst) => {
    const ut = utMap.get(inst.unitTypeId)!;
    return { x: inst.x, y: inst.y, width: ut.width, depth: ut.depth };
  });
  for (const pl of populated.plants) {
    const insideUnit = groundUnits.some(
      (r) => pl.x > r.x + 0.05 && pl.x < r.x + r.width - 0.05 && pl.y > r.y + 0.05 && pl.y < r.y + r.depth - 0.05,
    );
    assert.equal(insideUnit, false, `Plant ${pl.id} overlaps building footprint`);
  }

  const withLandscaping: Project = {
    ...proj,
    landscaping: populated,
    renderSettings: {
      ...proj.renderSettings,
      roofShape: 'duas_aguas',
    },
  };
  const qty = calculateQuantities(withLandscaping);
  assert.ok(qty.items.some((q) => q.code === 'EXT-01' && q.discipline === 'Paisagismo'));
  assert.ok(qty.items.some((q) => q.code === 'PAI-03' && q.discipline === 'Paisagismo'));
  const cobItem = qty.items.find((q) => q.code === 'COB-01');
  assert.ok(cobItem && cobItem.calculationMemory.includes('1.16'));

  const applied = applySinapiRJToBudget(withLandscaping, qty, 'desonerado');
  const paisagismoBudget = applied.budgetEntries.filter((e) => e.code === 'EXT-01' || e.code.startsWith('PAI-'));
  assert.ok(paisagismoBudget.every((e) => e.unitPrice !== null && e.unitPrice > 0));
});

test('Finishes, Sanitary Ware, Metals, Showers, Drains & Roof specs sync to rooms, quantities, and memorials', () => {
  const base = createDefaultDemoProject();
  const customProj: Project = {
    ...base,
    renderSettings: {
      ...base.renderSettings,
      wallExteriorFinish: 'tijolinho_aparente',
      wallInteriorFinish: 'cimento_queimado',
      wetWallBathroom: 'azulejo_metro',
      wetWallKitchen: 'porcelanato_acetinado',
      floorMaterial: 'madeira_carvalho',
      wetFloorMaterial: 'porcelanato_antiderrapante',
      baseboardType: 'poliestireno_branco_10cm',
      ceilingType: 'forro_madeira_cumaru',
      roofShape: 'duas_aguas',
      roofMaterial: 'ceramica_terracota',
      interiorDoorMaterial: 'madeira_verniz_natural',
      glassType: 'temperado_fume',
    },
    hydraulicConfig: {
      ...base.hydraulicConfig,
      sanitaryFixtures: {
        ...getNormalizedSanitaryFixtures(base),
        toiletType: 'convencional_valvula',
        sanitaryWareColor: 'preto_fosco',
        showerType: 'ducha_aquecedor_gas',
        washbasinType: 'pia_esculpida_porcelanato',
        washbasinFaucet: 'monocomando_mesa',
        kitchenSinkType: 'quartzo_cuba_esculpida',
        kitchenFaucet: 'monocomando_gourmet_extensivel',
        laundryTubType: 'inox_embutida',
        drainType: 'ralo_linear_oculto',
        metalsFinish: 'preto_fosco',
      },
    },
  };

  const syncedProj = syncFinishesToTypologyRooms(customProj);

  const allRooms = syncedProj.unitTypes.flatMap((u) => u.rooms);
  const bwcRoom = allRooms.find((r) => r.category === 'banheiro');
  const dryRoom = allRooms.find(
    (r) => r.category !== 'banheiro' && r.category !== 'cozinha' && r.category !== 'area_servico',
  );
  assert.ok(bwcRoom && dryRoom);
  assert.ok(bwcRoom.finishes.floor.includes('Antiderrapante'));
  assert.ok(bwcRoom.finishes.wall.includes('Azulejo Metrô'));
  assert.ok(dryRoom.finishes.floor.includes('Madeira Carvalho'));
  assert.ok(dryRoom.finishes.ceiling.includes('Madeira Nobre'));

  const qty = calculateQuantities(syncedProj);
  const san01 = qty.items.find((i) => i.code === 'SAN-01');
  const lou01 = qty.items.find((i) => i.code === 'LOU-01');
  const lou05 = qty.items.find((i) => i.code === 'LOU-05');
  assert.ok(san01 && san01.description.includes('Ralo Linear Inox Oculto'));
  assert.ok(lou01 && lou01.description.includes('Preto Fosco'));
  assert.ok(lou01 && lou01.description.includes('Válvula na Parede'));
  assert.ok(lou05 && lou05.description.includes('Ducha Parede AQ/AF'));

  const memorials = generateAllMemorials(syncedProj);
  const archMem = memorials.find((m) => m.key === 'arquitetonico');
  assert.ok(archMem);
  assert.ok(archMem.content.includes('10. COBERTURA E ESQUADRIAS'));
  assert.ok(archMem.content.includes('11. CADERNO DE ACABAMENTOS'));
  assert.ok(archMem.content.includes('Telhado Aparente Duas Águas'));
  assert.ok(archMem.content.includes('Tijolinho Aparente Terracota'));
  assert.ok(archMem.content.includes('Preto Fosco'));
  assert.ok(archMem.content.includes('Ducha Parede AQ/AF'));
  assert.ok(archMem.content.includes('Ralo Linear Inox Oculto'));
});

test('Mezzanine Overhaul: 100% interior containment, 10/20/30/50% & dimension sizing, sleeping upstairs / living downstairs, metallic/wood structure', () => {
  // 1. Test 10%, 20%, 30%, 50% and exact dimensions with balcony enabled (must stay 100% inside interior perimeter)
  const ratios = [0.1, 0.2, 0.3, 0.5];
  for (const ratio of ratios) {
    const utPct = generateParametricUnitLayout({
      code: `MZ-${Math.round(ratio * 100)}`,
      name: `Kit Mezanino ${Math.round(ratio * 100)}%`,
      width: 4.5,
      depth: 7.0,
      ceilingHeight: 3.8,
      bedrooms: 1,
      hasLaundry: true,
      hasBalcony: true,
      hasMezzanine: true,
      accessible: false,
      extWallThickness: 0.15,
      intWallThickness: 0.095,
      constructionSystem: 'alvenaria_convencional',
      entrySide: 'frente',
      mezzanineZone: 'sobre_banho_cozinha',
      mezzanineElevationM: 2.25,
      mezzanineSizingMode: 'percent',
      mezzanineCoverageRatio: ratio,
      mezzanineUsage: 'dormitorio',
      mezzanineStructureType: 'metalica_madeira',
    });

    assert.ok(utPct.mezzanine?.enabled);
    // 100% inside interior walls and never over balcony (depth 7.0 - 1.25 balcony = 5.75 - halfWall 0.075)
    assert.ok(utPct.mezzanine.x >= 0.07);
    assert.ok(utPct.mezzanine.y >= 0.07);
    assert.ok(utPct.mezzanine.x + utPct.mezzanine.width <= utPct.width - 0.07);
    assert.ok(utPct.mezzanine.y + utPct.mezzanine.depth <= utPct.depth - 1.25 - 0.07);

    // Interior bathroom walls must stop at mezzanine elevationM (never slice through upper bed!)
    const bwcWalls = utPct.walls.filter((w) => !w.isExternal && w.code.includes('BWC'));
    assert.ok(bwcWalls.length >= 2);
    assert.ok(bwcWalls.every((w) => w.height <= 2.25), 'BWC interior walls must never pierce the mezzanine');

    // Stair arrives at mezzanine edge without cutting under/into the slab
    const mezStair = utPct.furniture.find((f) => f.category === 'escada');
    assert.ok(mezStair && mezStair.y >= utPct.mezzanine.y + utPct.mezzanine.depth - 0.1);

    // Program separation: ground floor becomes SALA with zero duplicate ground bed; bed is upstairs
    const groundSala = utPct.rooms.find((r) => r.code === 'SALA' && r.category === 'sala');
    assert.ok(groundSala, 'Ground floor main room must become SALA when mezzanine hosts sleeping');
    const beds = utPct.furniture.filter((f) => f.category === 'cama');
    assert.equal(beds.length, 1, 'Must have exactly 1 bed (upstairs only, no duplicate ground bed)');
    assert.ok((beds[0].elevationM ?? 0) >= 2.2, 'Bed must sit on top of the mezzanine deck');

    // Upstairs electrical points generated
    assert.ok(utPct.electricalPoints.some((ep) => ep.code === 'IL-MEZ'));
    assert.ok(utPct.electricalPoints.some((ep) => ep.code === 'TB-MEZ-1'));
  }

  // 2. Exact dimensions mode clamped strictly inside interior area + Madeira Estrutural
  const utDim = generateParametricUnitLayout({
    code: 'MZ-DIM',
    name: 'Mezanino Madeira Sob Medida',
    width: 4.0,
    depth: 6.0,
    ceilingHeight: 3.7,
    bedrooms: 0,
    hasLaundry: false,
    hasBalcony: false,
    hasMezzanine: true,
    accessible: false,
    extWallThickness: 0.15,
    intWallThickness: 0.095,
    constructionSystem: 'alvenaria_convencional',
    entrySide: 'frente',
    mezzanineZone: 'sobre_banho_cozinha',
    mezzanineElevationM: 2.15,
    mezzanineSizingMode: 'dimensions',
    mezzanineCustomWidthM: 3.0,
    mezzanineCustomDepthM: 2.4,
    mezzanineUsage: 'dormitorio_home_office',
    mezzanineStructureType: 'madeira_estrutural',
  });
  assert.ok(utDim.mezzanine);
  assert.equal(utDim.mezzanine.width, 3.0);
  assert.equal(utDim.mezzanine.depth, 2.4);
  assert.equal(utDim.mezzanine.structureType, 'madeira_estrutural');

  const base = createBlankProject({
    name: 'Edifício Mezanino Sob Medida',
    client: '',
    municipality: 'Rio de Janeiro',
    state: 'RJ',
    front: 12,
    depth: 25,
    floorsCount: 1,
    methodId: 'alvenaria_convencional',
  });
  const projDim = autoDistributeUnitsAcrossFloors({ ...base, unitTypes: [utDim] }, utDim.id);
  const qtyDim = calculateQuantities(projDim);
  const mez01 = qtyDim.items.find((i) => i.code === 'MEZ-01');
  assert.ok(mez01 && mez01.description.includes('Madeira Estrutural'));

  const memDim = generateAllMemorials(projDim).find((m) => m.key === 'arquitetonico');
  assert.ok(memDim && memDim.content.includes('Madeira Estrutural') && memDim.content.includes('100% interno'));

  // 3. Engineering validation catches out-of-bounds mezzanine and tight under-clearance
  const violatedProj: Project = {
    ...projDim,
    unitTypes: projDim.unitTypes.map((u) =>
      u.mezzanine
        ? {
            ...u,
            mezzanine: {
              ...u.mezzanine,
              elevationM: 1.85,
              x: -0.2,
              width: u.width + 0.5,
            },
          }
        : u,
    ),
  };
  const violClashes = runCompatibilityAnalysis(violatedProj);
  assert.ok(violClashes.some((c) => c.id.startsWith('clash-mez-bounds-') && c.severity === 'CRITICO'));
  assert.ok(violClashes.some((c) => c.id.startsWith('clash-mez-under-') && c.severity === 'CRITICO'));
});

test('10-Stage SINAPI-RJ EAP Budget & Investor ROI viability metrics', () => {
  const proj = createDefaultDemoProject();
  proj.budgetSettings.landCost = 180000;
  proj.budgetSettings.monthlyRentPerUnit = 1600;
  proj.budgetSettings.vacancyRatePercent = 5;
  proj.budgetSettings.adminFeePercent = 8;
  proj.budgetSettings.monthlyCondoCostPerUnit = 100;

  const qty = calculateQuantities(proj);
  const sinapi = applySinapiRJToBudget(proj, qty, 'desonerado');
  const priced = { ...proj, ...sinapi };
  const budget = calculateBudgetSummary(priced, qty);
  const analytical = calculateAnalyticalBreakdown(budget, priced);

  assert.ok(analytical.stageSummaries.length >= 8);
  const roi = calculateInvestorROI(priced, budget.grandTotalCost);
  assert.equal(roi.totalUnits, 12);
  assert.equal(roi.totalInvestment, round2(180000 + budget.grandTotalCost));
  assert.ok(roi.netMonthlyIncome > 0);
  assert.ok(roi.annualYieldPercent > 0);
  assert.ok(roi.paybackMonths !== null && roi.paybackMonths > 12);
});

test('2D/3D Furniture Rotation Sync: getFurnitureWorldRect swaps bounding dimensions at 90/270 deg and handles 45 deg', () => {
  const baseItem = {
    id: 'fur-rot-1',
    roomId: 'room-1',
    name: 'Cama Casal',
    category: 'cama' as const,
    x: 1.0,
    y: 2.0,
    width: 1.4,
    depth: 1.9,
    height: 0.55,
    rotationDeg: 0,
    elevationM: 0,
  };

  const r0 = getFurnitureWorldRect({ ...baseItem, rotationDeg: 0 });
  assert.equal(r0.width, 1.4);
  assert.equal(r0.depth, 1.9);

  const r90 = getFurnitureWorldRect({ ...baseItem, rotationDeg: 90 });
  assert.equal(r90.width, 1.9);
  assert.equal(r90.depth, 1.4);

  const r180 = getFurnitureWorldRect({ ...baseItem, rotationDeg: 180 });
  assert.equal(r180.width, 1.4);
  assert.equal(r180.depth, 1.9);

  const r270 = getFurnitureWorldRect({ ...baseItem, rotationDeg: -90 });
  assert.equal(r270.width, 1.9);
  assert.equal(r270.depth, 1.4);

  const r45 = getFurnitureWorldRect({ ...baseItem, rotationDeg: 45 });
  assert.ok(r45.width > 2.3 && r45.depth > 2.3);
});

test('Área de Serviço without internal Tanque: Washing Machine only (AF-05, ES-MAQ, TUE-MAQ) and no LOU-04 in quantities', () => {
  const ut = generateParametricUnitLayout({
    code: 'AS-MAQ',
    name: 'Kit A.S. Máquina Exclusiva',
    width: 4.0,
    depth: 5.5,
    ceilingHeight: 2.8,
    bedrooms: 0,
    hasLaundry: true,
    hasBalcony: false,
    hasMezzanine: false,
    accessible: false,
    extWallThickness: 0.15,
    intWallThickness: 0.1,
    constructionSystem: 'alvenaria_convencional',
    entrySide: 'frente',
  });

  // Zero tanque anywhere inside the unit
  assert.equal(ut.furniture.filter((f) => f.category === 'tanque').length, 0);
  assert.equal(ut.waterPoints.filter((w) => w.category === 'tanque').length, 0);
  assert.equal(ut.drainagePoints.filter((d) => d.category === 'tanque').length, 0);

  // Washing machine present with AF-05, ES-MAQ and TUE-MAQ aligned
  const maq = ut.furniture.find((f) => f.category === 'maquina_lavar');
  const wpMaq = ut.waterPoints.find((w) => w.code === 'AF-05');
  const dpMaq = ut.drainagePoints.find((d) => d.code === 'ES-MAQ');
  const epMaq = ut.electricalPoints.find((e) => e.code === 'TUE-MAQ');
  assert.ok(maq && wpMaq && dpMaq && epMaq);
  assert.equal(wpMaq.category, 'maquina_lavar');
  assert.equal(dpMaq.category, 'maquina_lavar');

  const blank = createBlankProject({
    name: 'Residencial Sem Tanque',
    client: '',
    municipality: 'Rio de Janeiro',
    state: 'RJ',
    front: 12,
    depth: 25,
    floorsCount: 1,
    methodId: 'alvenaria_convencional',
  });
  const proj = autoDistributeUnitsAcrossFloors({ ...blank, unitTypes: [ut] }, ut.id);

  // Zero compatibility clashes and zero LOU-04 (Tanque) in quantities
  const clashes = runCompatibilityAnalysis(proj);
  assert.equal(clashes.filter((c) => c.severity === 'CRITICO').length, 0);
  const qty = calculateQuantities(proj);
  assert.equal(qty.items.some((i) => i.code === 'LOU-04'), false);

  // Moving electrical/water/drainage points directly propagates to engineering reports and DXF
  const salaRoom = ut.rooms.find((r) => r.category === 'sala_quarto' || r.category === 'sala');
  assert.ok(salaRoom);
  epMaq.x = round2(salaRoom.x + 0.4);
  epMaq.y = round2(salaRoom.y + 0.4);
  epMaq.powerVA = 1800;
  wpMaq.x = round2(ut.width - 0.5);
  dpMaq.x = round2(ut.width - 0.5);
  dpMaq.slopePercent = 2.5;

  const elecRep = calculateElectricalSizing(proj);
  const hydRep = calculateHydraulicSizing(proj);
  const drainRep = calculateDrainageSizing(proj);
  assert.ok(elecRep.totalInstalledKVA > 0);
  assert.ok(hydRep.byUnitType[0].sumWeightsCold > 0);
  assert.ok(hydRep.byUnitType[0].probableFlowColdLs > 0);
  assert.equal(drainRep[0].slopeIssues.length, 0);
  const dxf = generateProjectDXF(proj, 0);
  assert.ok(dxf.includes('TUE-MAQ'));
});

test('QDC-01 explicit board, Kitnet Simples default profile (4 circuits + AF only + external CG-01), and shortest-path routing', () => {
  const ut = generateParametricUnitLayout({
    code: 'KIT-SIMP',
    name: 'Kitnet Simples Otimizada',
    width: 4.0,
    depth: 5.5,
    ceilingHeight: 2.8,
    bedrooms: 0,
    hasLaundry: true,
    hasBalcony: false,
    hasMezzanine: false,
    accessible: false,
    extWallThickness: 0.15,
    intWallThickness: 0.1,
    constructionSystem: 'alvenaria_convencional',
    entrySide: 'frente',
  });

  // 1. Default profile is 'simples' with explicit QDC-01 placed outside BWC dry wall
  assert.equal(ut.mepProfile, 'simples');
  const qdc = ut.electricalPoints.find((e) => e.category === 'quadro_luz');
  const bath = ut.rooms.find((r) => r.category === 'banheiro');
  assert.ok(qdc && bath, 'QDC-01 and BWC must exist');
  assert.equal(qdc.code, 'QDC-01');
  assert.equal(qdc.circuitId, 'GERAL');
  assert.ok(qdc.y > bath.y + bath.depth, 'QDC-01 must sit on dry wall outside BWC wet area');
  assert.equal(getQdcPosition(ut).existsInModel, true);

  // 2. Lean 4 load circuits + single telecom point NET-01, zero hot water, external CG-01
  const loadCircuits = new Set(
    ut.electricalPoints.filter((e) => e.category !== 'quadro_luz' && e.category !== 'dados').map((e) => e.circuitId),
  );
  assert.deepEqual([...loadCircuits].sort(), ['C1-ILUM', 'C2-TUG', 'C3-COZ', 'C4-CHUV']);
  const specialPts = ut.electricalPoints.filter((e) => e.category === 'dados' || e.category === 'wifi_ap' || e.category === 'cftv');
  assert.equal(specialPts.length, 1);
  assert.equal(specialPts[0].code, 'NET-01');
  assert.equal(ut.waterPoints.filter((w) => w.waterType === 'quente').length, 0);
  const cg = ut.drainagePoints.find((d) => d.code === 'CG-01');
  assert.ok(cg && cg.y < 0, 'CG-01 should sit outside unit footprint in simples mode');

  // 3. Blank project defaults hasHotWaterHeating = false & electrical sizing excludes GERAL with zero missing-QDC warning
  const blank = createBlankProject({
    name: 'Kitnet Simples Obra',
    client: '',
    municipality: 'Rio de Janeiro',
    state: 'RJ',
    front: 12,
    depth: 25,
    floorsCount: 1,
    methodId: 'alvenaria_convencional',
  });
  assert.equal(blank.hydraulicConfig.hasHotWaterHeating, false);

  const proj = autoDistributeUnitsAcrossFloors({ ...blank, unitTypes: [ut] }, ut.id);
  const elecBefore = calculateElectricalSizing(proj);
  const unitElecBefore = elecBefore.byUnitType[0];
  assert.ok(unitElecBefore);
  assert.equal(unitElecBefore.circuits.some((c) => c.circuitId === 'GERAL'), false);
  assert.equal(unitElecBefore.warnings.some((w) => w.includes('Quadro de Luz')), false);

  const routeBefore = computeElectricalRouting(ut);
  const hydRoute = computeHydraulicRouting(ut);
  const drainRoute = computeDrainageRouting(ut);
  assert.ok(routeBefore.totalConduitM > 0 && hydRoute.totalColdPipeM > 0 && drainRoute.totalDrainPipeM > 0);
  assert.equal(hydRoute.totalHotPipeM, 0);

  const qtyBefore = calculateQuantities(proj);
  const ele04Before = qtyBefore.items.find((i) => i.code === 'ELE-04');
  assert.ok(ele04Before);

  // 4. Moving QDC-01 to the far opposite front corner increases routed length, ΔV% circuit length, and ELE-04 quantity
  qdc.x = round2(ut.width - 0.35);
  qdc.y = round2(ut.depth - 0.35);
  const routeAfter = computeElectricalRouting(ut);
  assert.ok(routeAfter.totalConduitM > routeBefore.totalConduitM, 'Moving QDC away from wet core must increase conduit run');

  const elecAfter = calculateElectricalSizing(proj);
  const unitElecAfter = elecAfter.byUnitType[0];
  assert.ok(unitElecAfter);
  const chuvBefore = unitElecBefore.circuits.find((c) => c.circuitId === 'C4-CHUV');
  const chuvAfter = unitElecAfter.circuits.find((c) => c.circuitId === 'C4-CHUV');
  assert.ok(chuvBefore && chuvAfter && chuvAfter.estimatedLengthM > chuvBefore.estimatedLengthM);

  const qtyAfter = calculateQuantities(proj);
  const ele04After = qtyAfter.items.find((i) => i.code === 'ELE-04');
  assert.ok(ele04After && ele04After.netQuantity > ele04Before.netQuantity);

  // 5. DXF export includes QDC-01
  const dxf = generateProjectDXF(proj, 0);
  assert.ok(dxf.includes('QDC-01'));
});

test('Any door or window can be dragged/repositioned onto any external or internal wall cleanly', () => {
  const ut = generateParametricUnitLayout({
    code: 'OP-MOVE',
    name: 'Kit Reposição Esquadrias',
    width: 4.0,
    depth: 5.5,
    ceilingHeight: 2.8,
    bedrooms: 0,
    hasLaundry: true,
    hasBalcony: false,
    hasMezzanine: false,
    accessible: false,
    extWallThickness: 0.15,
    intWallThickness: 0.1,
    constructionSystem: 'alvenaria_convencional',
    entrySide: 'frente',
  });

  const p1 = ut.openings.find((o) => o.code === 'P1');
  const j1 = ut.openings.find((o) => o.code === 'J1');
  assert.ok(p1 && j1);
  const origP1Wall = p1.wallId;

  // Drag P1 over to the right exterior wall (x ≈ ut.width, y ≈ 3.8)
  const rightSnap = findBestHostWallForOpening(
    { x: ut.width - 0.05, y: 3.8 },
    ut.walls,
    p1.width,
    p1.wallId,
    3.5,
    0.05,
  );
  assert.ok(rightSnap);
  assert.notEqual(rightSnap.wall.id, origP1Wall);
  assert.ok(Math.abs(rightSnap.wall.start.x - ut.width) < 0.05 && Math.abs(rightSnap.wall.end.x - ut.width) < 0.05);

  p1.wallId = rightSnap.wall.id;
  p1.offsetAlongWall = rightSnap.offsetAlongWall;
  const p1Pos = getOpeningWorldPosition(rightSnap.wall, p1);
  assert.ok(Math.abs(p1Pos.center.x - ut.width) < 0.05);

  // Drag J1 onto the left exterior wall (x ≈ 0, y ≈ 3.5)
  const leftSnap = findBestHostWallForOpening(
    { x: 0.08, y: 3.5 },
    ut.walls,
    j1.width,
    j1.wallId,
    3.5,
    0.05,
  );
  assert.ok(leftSnap);
  assert.ok(Math.abs(leftSnap.wall.start.x) < 0.05 && Math.abs(leftSnap.wall.end.x) < 0.05);
  j1.wallId = leftSnap.wall.id;
  j1.offsetAlongWall = leftSnap.offsetAlongWall;

  // Hysteresis check: sliding slightly off-axis (0.15m) along the new wall stays on that wall
  const slideSameWall = findBestHostWallForOpening(
    { x: 0.15, y: 4.1 },
    ut.walls,
    j1.width,
    j1.wallId,
    3.5,
    0.05,
  );
  assert.ok(slideSameWall);
  assert.equal(slideSameWall.wall.id, j1.wallId);

  // Move J1 onto an internal partition wall as well
  const intWall = ut.walls.find((w) => !w.isExternal);
  assert.ok(intWall);
  const clampedOff = clampOpeningOffsetToWall(
    Math.hypot(intWall.end.x - intWall.start.x, intWall.end.y - intWall.start.y),
    j1.width,
    99,
    0.05,
  );
  assert.ok(clampedOff >= 0);

  // Verify quantities, engineering, elevations, and DXF work after moving openings
  const blank = createBlankProject({
    name: 'Kit Esquadrias Livres',
    client: '',
    municipality: 'Rio de Janeiro',
    state: 'RJ',
    front: 12,
    depth: 25,
    floorsCount: 1,
    methodId: 'alvenaria_convencional',
  });
  const proj = autoDistributeUnitsAcrossFloors({ ...blank, unitTypes: [ut] }, ut.id);
  const clashes = runCompatibilityAnalysis(proj);
  assert.ok(Array.isArray(clashes));
  const qty = calculateQuantities(proj);
  assert.ok(qty.items.length > 0);
  const dxf = generateProjectDXF(proj, 0);
  assert.ok(dxf.includes('P1') && dxf.includes('J1'));
});

test('Floor count scaling and ground-floor unit replication work accurately across pavimentos', () => {
  const ut = makeQuickUnitType('KIT-REP', 4.0, 5.5, 'frente');
  const blank = createBlankProject({
    name: 'Residencial Multi-Andares',
    client: '',
    municipality: 'Rio de Janeiro',
    state: 'RJ',
    front: 14,
    depth: 25,
    floorsCount: 1,
    methodId: 'alvenaria_convencional',
  });
  const baseProj: Project = { ...blank, unitTypes: [ut] };
  const cfg: ImplantationConfig = {
    ...createDefaultImplantationConfig(baseProj),
    primaryZone: 'lado_esquerdo',
    layoutPattern: 'sequencia',
    totalUnitsTarget: 3,
    couplingMode: 'geminadas',
  };
  const groundUnits = generateImplantationUnits(baseProj, cfg, baseProj.floors[0].id);
  const p1: Project = {
    ...baseProj,
    implantation: cfg,
    floors: [{ ...baseProj.floors[0], units: groundUnits }],
  };
  assert.equal(p1.floors.length, 1);
  assert.equal(p1.floors[0].units.length, 3);

  // Scale up to 3 floors with automatic ground-floor replication
  const p3 = setProjectFloorCount(p1, 3, true);
  assert.equal(p3.floors.length, 3);
  assert.equal(p3.floors[0].name, 'Térreo');
  assert.equal(p3.floors[1].name, '1º Pavimento');
  assert.equal(p3.floors[2].name, '2º Pavimento');
  assert.equal(p3.floors[0].elevation, 0);
  assert.ok(p3.floors[1].elevation > 0 && p3.floors[2].elevation > p3.floors[1].elevation);
  assert.equal(p3.floors[1].units.length, 3);
  assert.equal(p3.floors[2].units.length, 3);
  assert.equal(p3.floors[1].units[0].floorId, p3.floors[1].id);
  assert.equal(p3.floors[1].units[0].unitNumber, '201');
  assert.equal(p3.floors[2].units[2].unitNumber, '303');

  // Modify ground floor to 4 units and replicate explicitly to upper floors
  const cfg4 = { ...cfg, totalUnitsTarget: 4 };
  const ground4 = generateImplantationUnits(p3, cfg4, p3.floors[0].id);
  const p3ModifiedGround: Project = {
    ...p3,
    floors: p3.floors.map((fl, i) => (i === 0 ? { ...fl, units: ground4 } : fl)),
  };
  const p3Synced = replicateGroundFloorToAllFloors(p3ModifiedGround);
  assert.equal(p3Synced.floors[1].units.length, 4);
  assert.equal(p3Synced.floors[2].units.length, 4);

  // Scale down to 2 floors
  const p2 = setProjectFloorCount(p3Synced, 2, true);
  assert.equal(p2.floors.length, 2);
  assert.equal(p2.floors.reduce((s, f) => s + f.units.length, 0), 8);

  const qty = calculateQuantities(p2);
  assert.equal(qty.summary.totalUnits, 8);
});



