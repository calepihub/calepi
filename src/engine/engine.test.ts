import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSiteGeometry,
  buildSiteVerticesFromDimensions,
  calculatePolygonArea,
  calculatePolygonPerimeter,
  checkImplantationFeasibility,
} from './geometry';
import {
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
  calculateBudgetSummary,
  calculateQuantities,
  compareConstructionMethodsForTypology,
  syncBudgetWithQuantities,
} from './quantitiesAndBudget';
import { applySinapiRJToBudget } from './sinapiRJ';
import { buildElevationData, buildJoinerySchedule, buildSpecialSystemsSummary } from './cadDrawings';
import { generateProjectDXF, TECHNICAL_SHEETS } from './exporters';
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
