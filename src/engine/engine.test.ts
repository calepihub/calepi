import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  analyzeSiteGeometry,
  buildSiteVerticesFromDimensions,
  calculatePolygonArea,
  calculatePolygonPerimeter,
  checkImplantationFeasibility,
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

  const xlsxBuf = generateProjectXLSXBuffer(withUnits, 6);
  const wb = XLSX.read(xlsxBuf, { type: 'array' });
  assert.deepEqual(wb.SheetNames, [
    'Resumo Executivo',
    'Quantitativos',
    'Orçamento Analítico',
    'Curva ABC',
    'Cronograma Físico-Fin',
    'Quadro de Cargas',
    'Pontos MEP',
  ]);

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


