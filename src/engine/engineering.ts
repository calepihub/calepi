import {
  analyzeSiteGeometry,
  checkImplantationFeasibility,
  getFurnitureWorldRect,
  getOpeningWorldPosition,
  getRoomArea,
  rectsOverlap,
  round2,
  round3,
} from './geometry';
import { validateImplantation } from './implantation';
import type {
  Project,
  RuleEvaluationStatus,
  UnitType,
} from '../types/project';

// ============================================================================
// 1. ELECTRICAL SIZING ENGINE (Traceable, NBR 5410-aligned methodology)
// ============================================================================
export interface CircuitSummary {
  circuitId: string;
  description: string;
  voltage: 127 | 220;
  totalPowerVA: number;
  currentA: number;
  recommendedBreakerA: number;
  conductorMm2: number;
  conduitMm: number;
  estimatedLengthM: number;
  voltageDropPercent: number;
  voltageDropOk: boolean;
  pointCount: number;
  methodology: string;
}

export interface UnitElectricalReport {
  unitTypeId: string;
  unitTypeName: string;
  installedPowerVA: number;
  lightingAndTugVA: number;
  tuePowerVA: number;
  demandFactorApplied: number;
  demandPowerVA: number;
  demandMethodology: string;
  circuits: CircuitSummary[];
  warnings: string[];
}

export interface ProjectElectricalReport {
  byUnitType: UnitElectricalReport[];
  totalUnits: number;
  totalInstalledKVA: number;
  totalDemandKVA: number;
  diversityNote: string;
  pendingItems: string[];
}

const STANDARD_BREAKERS = [10, 16, 20, 25, 32, 40, 50, 63];

function pickBreaker(designCurrent: number): number {
  const required = designCurrent * 1.15;
  return STANDARD_BREAKERS.find((b) => b >= required) ?? 63;
}

export function calculateElectricalSizing(project: Project): ProjectElectricalReport {
  const byUnitType: UnitElectricalReport[] = [];
  const pendingItems: string[] = [];

  for (const ut of project.unitTypes) {
    const circuitMap = new Map<string, typeof ut.electricalPoints>();
    for (const pt of ut.electricalPoints) {
      const key = pt.circuitId || 'SEM-CIRCUITO';
      const arr = circuitMap.get(key) ?? [];
      arr.push(pt);
      circuitMap.set(key, arr);
    }

    const circuits: CircuitSummary[] = [];
    const warnings: string[] = [];
    let installedPowerVA = 0;
    let lightingAndTugVA = 0;
    let tuePowerVA = 0;

    for (const [circuitId, pts] of circuitMap.entries()) {
      const voltage = pts[0]?.voltage ?? 127;
      const totalPowerVA = pts.reduce((s, p) => s + (p.powerVA || 0), 0);
      const avgPf =
        pts.length > 0
          ? pts.reduce((s, p) => s + (p.powerFactor || 0.9), 0) / pts.length
          : 0.9;
      const powerW = totalPowerVA * avgPf;
      const currentA = round2(totalPowerVA / Math.max(1, voltage));
      const conductorMm2 = Math.max(...pts.map((p) => p.conductorSectionMm2 || 1.5), 1.5);
      const conduitMm = Math.max(...pts.map((p) => p.conduitDiameterMm || 20), 20);
      const recommendedBreakerA = pickBreaker(currentA);

      // Estimate average circuit run from unit center/board
      const estimatedLengthM = round2(Math.max(6, ut.width + ut.depth + 3));
      // Copper conductivity gamma = 56 m/(ohm*mm2); single-phase/bi-phase factor 200
      const voltageDropPercent = round2(
        (200 * estimatedLengthM * currentA) / (56 * conductorMm2 * voltage),
      );
      const voltageDropOk = voltageDropPercent <= 4.0;

      if (!voltageDropOk) {
        warnings.push(
          `Circuito ${circuitId} (${ut.code}): queda de tensão estimada ${voltageDropPercent}% excede 4,0%. Aumentar seção do condutor.`,
        );
      }
      if (circuitId === 'SEM-CIRCUITO') {
        warnings.push(`Há ${pts.length} ponto(s) sem circuito atribuído em ${ut.code}.`);
      }

      const isLightingOrTug = pts.every(
        (p) =>
          p.category === 'iluminacao_teto' ||
          p.category === 'arandela' ||
          p.category === 'interruptor' ||
          p.category === 'tomada_baixa' ||
          p.category === 'tomada_media' ||
          p.category === 'tomada_alta' ||
          p.category === 'tomada_tug' ||
          p.category === 'dados' ||
          p.category === 'tv' ||
          p.category === 'antena_tv' ||
          p.category === 'wifi_ap' ||
          p.category === 'cftv' ||
          p.category === 'rack_ti' ||
          p.category === 'interfone',
      );
      if (isLightingOrTug) lightingAndTugVA += totalPowerVA;
      else tuePowerVA += totalPowerVA;

      installedPowerVA += totalPowerVA;

      circuits.push({
        circuitId,
        description: pts.map((p) => p.label).slice(0, 2).join(' + '),
        voltage,
        totalPowerVA,
        currentA,
        recommendedBreakerA,
        conductorMm2,
        conduitMm,
        estimatedLengthM,
        voltageDropPercent,
        voltageDropOk,
        pointCount: pts.length,
        methodology: `I = S / V = ${totalPowerVA} / ${voltage} = ${currentA}A; ΔV% = (200·L·I)/(56·S_mm²·V) com L=${estimatedLengthM}m, γ=56 (cobre).`,
      });
    }

    // Demand factor (explicitly documented; user must validate with local utility norm e.g. CPFL/Enel/Cemig)
    const demandFactorApplied = installedPowerVA > 0 ? 0.8 : 0;
    const demandPowerVA = round2(lightingAndTugVA * 0.65 + tuePowerVA * 0.85);

    if (ut.electricalPoints.length === 0) {
      pendingItems.push(`Tipologia ${ut.code} não possui pontos elétricos cadastrados.`);
    }

    byUnitType.push({
      unitTypeId: ut.id,
      unitTypeName: ut.name,
      installedPowerVA,
      lightingAndTugVA,
      tuePowerVA,
      demandFactorApplied,
      demandPowerVA,
      demandMethodology:
        'Demanda estimada por tipologia = 0,65·(Ilum+TUG) + 0,85·(TUE). Confirmar fator de demanda coletivo conforme norma da concessionária local.',
      circuits,
      warnings,
    });
  }

  let totalUnits = 0;
  let sumInstalledVA = 0;
  let sumDemandVA = 0;

  for (const fl of project.floors) {
    for (const inst of fl.units) {
      totalUnits += 1;
      const rep = byUnitType.find((r) => r.unitTypeId === inst.unitTypeId);
      if (rep) {
        sumInstalledVA += rep.installedPowerVA;
        sumDemandVA += rep.demandPowerVA;
      }
    }
  }

  // Collective diversity factor (must be explicitly noted as preliminary estimate)
  const collectiveFactor = totalUnits >= 10 ? 0.62 : totalUnits >= 4 ? 0.72 : 0.85;
  const totalDemandKVA = round2((sumDemandVA * collectiveFactor) / 1000);

  if (totalUnits === 0) {
    pendingItems.push('Nenhuma unidade implantada nos pavimentos para cálculo de demanda global.');
  }

  return {
    byUnitType,
    totalUnits,
    totalInstalledKVA: round2(sumInstalledVA / 1000),
    totalDemandKVA,
    diversityNote: `Fator de diversidade coletivo preliminar adotado: ${collectiveFactor} para ${totalUnits} unidades. Requer validação pela norma da concessionária local de energia e responsável técnico.`,
    pendingItems,
  };
}

// ============================================================================
// 2. HYDRAULIC SIZING ENGINE (ABNT NBR 5626 Weight / Probable Flow)
// ============================================================================
export interface HydraulicUnitReport {
  unitTypeId: string;
  unitTypeName: string;
  coldWaterPoints: number;
  hotWaterPoints: number;
  sumWeightsCold: number;
  probableFlowColdLs: number;
  recommendedBranchDiameterMm: number;
  estimatedVelocityMs: number;
  velocityOk: boolean;
  methodology: string;
}

export interface ProjectHydraulicReport {
  byUnitType: HydraulicUnitReport[];
  totalUnits: number;
  estimatedPopulation: number;
  dailyConsumptionLiters: number;
  recommendedTotalReservoirLiters: number;
  lowerReservoirLiters: number;
  upperReservoirLiters: number;
  reservoirMethodology: string;
  warnings: string[];
}

export function calculateHydraulicSizing(project: Project): ProjectHydraulicReport {
  const byUnitType: HydraulicUnitReport[] = [];
  const warnings: string[] = [];

  for (const ut of project.unitTypes) {
    const coldPts = ut.waterPoints.filter((p) => p.waterType === 'fria');
    const hotPts = ut.waterPoints.filter((p) => p.waterType === 'quente');
    const sumWeightsCold = round2(coldPts.reduce((s, p) => s + (p.weightHunter || 0), 0));
    // NBR 5626: Q = 0.3 * sqrt(sum(P)) in L/s
    const probableFlowColdLs = round3(0.3 * Math.sqrt(Math.max(0, sumWeightsCold)));

    // Check internal velocity in 25mm PVC (inner diameter ~ 21.6mm = 0.0216m)
    const innerDiaM = 0.0216;
    const areaM2 = Math.PI * Math.pow(innerDiaM / 2, 2);
    const flowM3s = probableFlowColdLs / 1000;
    const estimatedVelocityMs = round2(flowM3s / areaM2);
    const velocityOk = estimatedVelocityMs <= 3.0;
    const recommendedBranchDiameterMm = estimatedVelocityMs > 3.0 ? 32 : 25;

    if (!velocityOk) {
      warnings.push(
        `Tipologia ${ut.code}: velocidade estimada (${estimatedVelocityMs} m/s) excede 3,0 m/s para Ø25mm; recomendado Ø32mm.`,
      );
    }

    byUnitType.push({
      unitTypeId: ut.id,
      unitTypeName: ut.name,
      coldWaterPoints: coldPts.length,
      hotWaterPoints: hotPts.length,
      sumWeightsCold,
      probableFlowColdLs,
      recommendedBranchDiameterMm,
      estimatedVelocityMs,
      velocityOk,
      methodology: `Q = 0,30 · √(ΣP) = 0,30 · √(${sumWeightsCold}) = ${probableFlowColdLs} L/s; v = Q/A (Ø25mm di=21,6mm).`,
    });
  }

  const totalUnits = project.floors.reduce((s, fl) => s + fl.units.length, 0);
  const { occupantsPerUnit, litersPerPersonDay, reserveDays } = project.hydraulicConfig;
  const estimatedPopulation = totalUnits * occupantsPerUnit;
  const dailyConsumptionLiters = estimatedPopulation * litersPerPersonDay;
  const recommendedTotalReservoirLiters = dailyConsumptionLiters * reserveDays;
  const lowerReservoirLiters = Math.round(recommendedTotalReservoirLiters * 0.6);
  const upperReservoirLiters = Math.round(recommendedTotalReservoirLiters * 0.4);

  if (totalUnits === 0) {
    warnings.push('Nenhuma unidade implantada para dimensionamento da reservação total.');
  }

  return {
    byUnitType,
    totalUnits,
    estimatedPopulation,
    dailyConsumptionLiters,
    recommendedTotalReservoirLiters,
    lowerReservoirLiters,
    upperReservoirLiters,
    reservoirMethodology: `População = ${totalUnits} unid × ${occupantsPerUnit} hab/unid = ${estimatedPopulation} hab; Consumo diário = ${estimatedPopulation} × ${litersPerPersonDay} L = ${dailyConsumptionLiters} L/dia; Reserva (${reserveDays} dias) = ${recommendedTotalReservoirLiters} L (60% inf / 40% sup, sem considerar reserva de incêndio se aplicável).`,
    warnings,
  };
}

// ============================================================================
// 3. DRAINAGE / SANITARY ENGINE (ABNT NBR 8160 UHC & Slope)
// ============================================================================
export interface DrainageUnitReport {
  unitTypeId: string;
  unitTypeName: string;
  totalUHC: number;
  recommendedStackMm: number;
  slopeIssues: string[];
  unconnectedPoints: string[];
  methodology: string;
}

export function calculateDrainageSizing(project: Project): DrainageUnitReport[] {
  return project.unitTypes.map((ut) => {
    const totalUHC = ut.drainagePoints.reduce((s, p) => s + (p.uhc || 0), 0);
    const slopeIssues: string[] = [];
    const unconnectedPoints: string[] = [];
    const ids = new Set(ut.drainagePoints.map((p) => p.id));

    for (const pt of ut.drainagePoints) {
      if (pt.category === 'ventilacao' || pt.category === 'tubo_queda') continue;
      if (pt.diameterMm <= 75 && pt.slopePercent < 2.0) {
        slopeIssues.push(`${pt.code}: Ø${pt.diameterMm}mm com declividade ${pt.slopePercent}% (mínimo 2,0%).`);
      }
      if (pt.diameterMm >= 100 && pt.slopePercent < 1.0) {
        slopeIssues.push(`${pt.code}: Ø${pt.diameterMm}mm com declividade ${pt.slopePercent}% (mínimo 1,0%).`);
      }
      if (!pt.connectedToId || (!ids.has(pt.connectedToId) && pt.connectedToId !== 'CI-GERAL')) {
        unconnectedPoints.push(`${pt.code} sem nó de destino válido.`);
      }
    }

    const recommendedStackMm = totalUHC > 140 ? 150 : 100;
    return {
      unitTypeId: ut.id,
      unitTypeName: ut.name,
      totalUHC,
      recommendedStackMm,
      slopeIssues,
      unconnectedPoints,
      methodology: `ΣUHC = ${totalUHC}; declividades verificadas (2% p/ Ø≤75mm, 1% p/ Ø≥100mm) e conectividade dos ramais até TQ/CI.`,
    };
  });
}

// ============================================================================
// 4. RAINWATER ENGINE (Requires user-supplied rainfall intensity + source)
// ============================================================================
export interface RainwaterReport {
  status: 'calculado' | 'pendente_dados_pluviometricos';
  totalCatchmentAreaM2: number;
  flowLMin: number | null;
  methodology: string;
  warnings: string[];
}

export function calculateRainwaterSizing(project: Project): RainwaterReport {
  const totalCatchmentAreaM2 = round2(
    project.rainwaterElements
      .filter((e) => e.type === 'cobertura')
      .reduce((s, e) => s + e.catchmentAreaM2, 0),
  );
  const { rainfallIntensityMmH, sourceReference, municipality, returnPeriodYears } =
    project.rainwaterConfig;

  if (!rainfallIntensityMmH || rainfallIntensityMmH <= 0 || !sourceReference.trim()) {
    return {
      status: 'pendente_dados_pluviometricos',
      totalCatchmentAreaM2,
      flowLMin: null,
      methodology:
        'Não calculado: o sistema não assume índices pluviométricos sem identificação da localidade, fonte técnica e período de retorno.',
      warnings: [
        'Informe a intensidade pluviométrica (mm/h), município, período de retorno e fonte de referência no módulo Águas Pluviais.',
      ],
    };
  }

  // NBR 10844: Q = (I * A) / 60 (L/min)
  const flowLMin = round2((rainfallIntensityMmH * totalCatchmentAreaM2) / 60);
  return {
    status: 'calculado',
    totalCatchmentAreaM2,
    flowLMin,
    methodology: `Q = (I · A) / 60 = (${rainfallIntensityMmH} mm/h · ${totalCatchmentAreaM2} m²) / 60 = ${flowLMin} L/min (Local: ${municipality || 'N/I'}, TR: ${returnPeriodYears ?? 'N/I'} anos, Fonte: ${sourceReference}).`,
    warnings: [],
  };
}

// ============================================================================
// 5. COMPATIBILITY / CLASH DETECTION ENGINE
// ============================================================================
export type ClashSeverity = 'CRITICO' | 'ATENCAO' | 'INFORMATIVO';

export interface ClashIssue {
  id: string;
  severity: ClashSeverity;
  disciplines: string;
  elementsInvolved: string[];
  location: string;
  floorName: string;
  roomName: string;
  description: string;
  reason: string;
  suggestion: string;
  status: 'pendente' | 'em_analise' | 'resolvido';
  targetUnitTypeId?: string;
}

export function runCompatibilityAnalysis(project: Project): ClashIssue[] {
  const issues: ClashIssue[] = [];

  // 1. Site & Implantation clashes
  const siteCheck = analyzeSiteGeometry(project.site);
  if (siteCheck.hasAreaDivergence) {
    issues.push({
      id: 'clash-site-area',
      severity: 'ATENCAO',
      disciplines: 'Terreno × Geometria',
      elementsInvolved: ['Perímetro do Terreno'],
      location: 'Implantação Geral',
      floorName: 'Terreno',
      roomName: 'Área Total',
      description: `Divergência entre área informada (${siteCheck.declaredArea} m²) e área geométrica (${siteCheck.calculatedArea} m²).`,
      reason: 'Diferença superior a 0,50 m² pode invalidar cálculos de taxa de ocupação e aproveitamento.',
      suggestion: 'Revisar vértices do polígono ou atualizar a área declarada conforme matrícula/levantamento.',
      status: 'pendente',
    });
  }

  for (const floor of project.floors) {
    const imp = checkImplantationFeasibility(project.site, floor.units, project.unitTypes);
    if (imp.outOfBoundsUnitIds.length > 0) {
      issues.push({
        id: `clash-bounds-${floor.id}`,
        severity: 'CRITICO',
        disciplines: 'Arquitetura × Terreno/Recuos',
        elementsInvolved: imp.outOfBoundsUnitIds,
        location: 'Implantação',
        floorName: floor.name,
        roomName: 'Perímetro Edificável',
        description: `${imp.outOfBoundsUnitIds.length} unidade(s) invadem os recuos obrigatórios ou limites do terreno.`,
        reason: 'Posicionamento fora da caixa edificável definida pelos recuos cadastrados.',
        suggestion: 'Reposicionar ou redimensionar as unidades para dentro da área edificável.',
        status: 'pendente',
      });
    }
    if (imp.overlappingUnitPairs.length > 0) {
      issues.push({
        id: `clash-overlap-${floor.id}`,
        severity: 'CRITICO',
        disciplines: 'Arquitetura',
        elementsInvolved: imp.overlappingUnitPairs.flat(),
        location: 'Pavimento',
        floorName: floor.name,
        roomName: 'Implantação',
        description: `Sobreposição geométrica detectada entre ${imp.overlappingUnitPairs.length} par(es) de unidades.`,
        reason: 'Duas unidades ocupam a mesma região de planta.',
        suggestion: 'Ajustar coordenadas X/Y ou dimensões da tipologia.',
        status: 'pendente',
      });
    }
    const impVal = validateImplantation(project, floor.id);
    for (const iIssue of impVal.issues) {
      if (
        iIssue.code === 'OUT_OF_BOUNDS' ||
        iIssue.code === 'OVERLAP' ||
        iIssue.code === 'INCOMPLETE_FIELDS' ||
        iIssue.code === 'COUNT_DIVERGENCE'
      ) {
        continue;
      }
      if ((!project.implantation || project.implantation.totalUnitsTarget === 0) && iIssue.severity !== 'CRITICO') {
        continue;
      }
      issues.push({
        id: `clash-imp-${floor.id}-${iIssue.id}`,
        severity: iIssue.severity === 'CRITICO' ? 'CRITICO' : iIssue.severity === 'ATENCAO' ? 'ATENCAO' : 'INFORMATIVO',
        disciplines: 'Implantação × Terreno',
        elementsInvolved: iIssue.affectedUnitIds.length > 0 ? iIssue.affectedUnitIds : [floor.name],
        location: 'Implantação no Terreno',
        floorName: floor.name,
        roomName: 'Lote / Circulação',
        description: `${iIssue.title}: ${iIssue.detail}`,
        reason: 'Conflito geométrico ou de circulação/acesso na implantação configurada.',
        suggestion: 'Ajuste o posicionamento, espaçamento ou acessos na Etapa 1–4 de Implantação.',
        status: 'pendente',
      });
    }
  }

  // 2. UnitType internal clashes (furniture vs furniture, furniture vs door swing, appliances vs MEP)
  for (const ut of project.unitTypes) {
    // Furniture overlaps
    for (let i = 0; i < ut.furniture.length; i++) {
      for (let j = i + 1; j < ut.furniture.length; j++) {
        const a = ut.furniture[i];
        const b = ut.furniture[j];
        // Allow nested/wall-mounted fixtures that share footprint by design
        const pair = [a.category, b.category].sort().join('+');
        if (
          pair === 'bancada+cooktop' ||
          pair === 'box+chuveiro' ||
          pair === 'espelho+lavatorio' ||
          pair === 'rack_tv+tv' ||
          pair === 'armario+tv'
        ) {
          continue;
        }
        if (a.category === 'luminaria' || b.category === 'luminaria') {
          continue;
        }
        // Móveis em níveis verticais distintos (ex.: mezanino vs térreo) não colidem em planta
        if (Math.abs((a.elevationM ?? 0) - (b.elevationM ?? 0)) >= 1.25) {
          continue;
        }
        const ra = getFurnitureWorldRect(a);
        const rb = getFurnitureWorldRect(b);
        if (rectsOverlap(ra, rb, 0.03)) {
          issues.push({
            id: `clash-fur-${ut.id}-${a.id}-${b.id}`,
            severity: 'CRITICO',
            disciplines: 'Arquitetura × Mobiliário',
            elementsInvolved: [a.name, b.name],
            location: `Tipologia ${ut.code}`,
            floorName: 'Tipologia Padrão',
            roomName: ut.rooms.find((r) => r.id === a.roomId)?.name ?? 'Ambiente',
            description: `Interferência física entre "${a.name}" e "${b.name}".`,
            reason: 'Os perímetros dos mobiliários se sobrepõem na planta.',
            suggestion: 'Reposicionar ou ajustar dimensões de um dos mobiliários no Editor 2D.',
            status: 'pendente',
            targetUnitTypeId: ut.id,
          });
        }
      }
    }

    // Door swing vs furniture
    for (const op of ut.openings) {
      if (op.type !== 'porta' || op.swingDirection === 'sliding' || op.swingDirection === 'none') continue;
      const wall = ut.walls.find((w) => w.id === op.wallId);
      if (!wall) continue;
      const { center } = getOpeningWorldPosition(wall, op);
      const swingZone = {
        x: center.x - op.width * 0.45,
        y: center.y - op.width * 0.45,
        width: op.width * 0.9,
        depth: op.width * 0.9,
      };
      for (const fur of ut.furniture) {
        if (fur.category === 'luminaria' || fur.category === 'espelho') continue;
        if ((fur.elevationM ?? 0) >= 1.5) continue;
        const fr = getFurnitureWorldRect(fur);
        if (rectsOverlap(swingZone, fr, 0.08)) {
          issues.push({
            id: `clash-door-${ut.id}-${op.id}-${fur.id}`,
            severity: 'ATENCAO',
            disciplines: 'Arquitetura × Mobiliário',
            elementsInvolved: [op.code, fur.name],
            location: `Tipologia ${ut.code}`,
            floorName: 'Tipologia Padrão',
            roomName: ut.rooms.find((r) => r.id === fur.roomId)?.name ?? 'Ambiente',
            description: `Possível interferência da folha da porta ${op.code} com "${fur.name}".`,
            reason: 'Mobiliário posicionado dentro ou próximo ao raio de abertura da porta.',
            suggestion: 'Inverter sentido de abertura da porta, adotar porta de correr ou afastar mobiliário.',
            status: 'pendente',
            targetUnitTypeId: ut.id,
          });
        }
      }
    }

    // Equipment without electrical / water / drainage
    for (const fur of ut.furniture) {
      const roomName = ut.rooms.find((r) => r.id === fur.roomId)?.name ?? 'Ambiente';
      if (fur.requiresPower) {
        const hasPowerNearby = ut.electricalPoints.some(
          (ep) => ep.roomId === fur.roomId && ep.powerVA > 0,
        );
        if (!hasPowerNearby) {
          issues.push({
            id: `clash-nopwr-${ut.id}-${fur.id}`,
            severity: 'CRITICO',
            disciplines: 'Arquitetura × Elétrica',
            elementsInvolved: [fur.name],
            location: `Tipologia ${ut.code}`,
            floorName: 'Tipologia Padrão',
            roomName,
            description: `Equipamento "${fur.name}" sem ponto elétrico previsto no ambiente.`,
            reason: 'Equipamento exige alimentação elétrica.',
            suggestion: 'Cadastrar tomada específica ou de uso geral no ambiente.',
            status: 'pendente',
            targetUnitTypeId: ut.id,
          });
        }
      }
      if (fur.requiresWater) {
        const hasWater = ut.waterPoints.some((wp) => wp.roomId === fur.roomId);
        if (!hasWater) {
          issues.push({
            id: `clash-nowater-${ut.id}-${fur.id}`,
            severity: 'CRITICO',
            disciplines: 'Arquitetura × Hidráulica',
            elementsInvolved: [fur.name],
            location: `Tipologia ${ut.code}`,
            floorName: 'Tipologia Padrão',
            roomName,
            description: `Equipamento "${fur.name}" sem ponto de água cadastrado no ambiente.`,
            reason: 'Aparelho sanitário/equipamento requer alimentação hidráulica.',
            suggestion: 'Inserir ponto de água fria/quente no módulo Hidráulica.',
            status: 'pendente',
            targetUnitTypeId: ut.id,
          });
        }
      }
      if (fur.requiresDrain) {
        const hasDrain = ut.drainagePoints.some((dp) => dp.roomId === fur.roomId);
        if (!hasDrain) {
          issues.push({
            id: `clash-nodrain-${ut.id}-${fur.id}`,
            severity: 'CRITICO',
            disciplines: 'Arquitetura × Sanitária',
            elementsInvolved: [fur.name],
            location: `Tipologia ${ut.code}`,
            floorName: 'Tipologia Padrão',
            roomName,
            description: `Equipamento "${fur.name}" sem saída de esgoto cadastrada no ambiente.`,
            reason: 'Aparelho requer coleta sanitária conectada.',
            suggestion: 'Inserir ponto de esgoto conectado à caixa sifonada/gordura ou tubo de queda.',
            status: 'pendente',
            targetUnitTypeId: ut.id,
          });
        }
      }
    }

    // Drainage slope/connection checks
    const drainChecks = calculateDrainageSizing(project).find((d) => d.unitTypeId === ut.id);
    if (drainChecks) {
      for (const sIssue of drainChecks.slopeIssues) {
        issues.push({
          id: `clash-drain-slope-${ut.id}-${sIssue}`,
          severity: 'CRITICO',
          disciplines: 'Sanitária',
          elementsInvolved: [sIssue.split(':')[0]],
          location: `Tipologia ${ut.code}`,
          floorName: 'Tipologia Padrão',
          roomName: 'Rede Sanitária',
          description: sIssue,
          reason: 'Declividade inferior ao critério técnico mínimo de escoamento (NBR 8160).',
          suggestion: 'Corrigir declividade para >= 2,0% (Ø<=75mm) ou >= 1,0% (Ø>=100mm).',
          status: 'pendente',
          targetUnitTypeId: ut.id,
        });
      }
    }

    // Mezzanine & Blondel stair ergonomic checks
    if (ut.hasMezzanine) {
      if (ut.ceilingHeight < 3.0) {
        issues.push({
          id: `clash-mez-ceiling-${ut.id}`,
          severity: 'CRITICO',
          disciplines: 'Arquitetura × Mezanino',
          elementsInvolved: ['Mezanino', `Pé-direito ${ut.ceilingHeight.toFixed(2)}m`],
          location: `Tipologia ${ut.code}`,
          floorName: 'Tipologia Padrão',
          roomName: 'Mezanino',
          description: `Mezanino habilitado com pé-direito inferior a 3,00 m (${ut.ceilingHeight.toFixed(2)} m).`,
          reason: 'Pé-direito insuficiente para acomodar nível inferior habitável + laje + plataforma superior.',
          suggestion: 'Elevar pé-direito da tipologia para >= 3,00 m ou desativar o mezanino.',
          status: 'pendente',
          targetUnitTypeId: ut.id,
        });
      }
      if (ut.mezzanine?.enabled) {
        if (ut.mezzanine.elevationM < 2.0) {
          issues.push({
            id: `clash-mez-under-${ut.id}`,
            severity: 'ATENCAO',
            disciplines: 'Arquitetura × Mezanino',
            elementsInvolved: ['Plataforma Mezanino'],
            location: `Tipologia ${ut.code}`,
            floorName: 'Tipologia Padrão',
            roomName: 'Mezanino',
            description: `Altura livre sob o mezanino abaixo de 2,00 m (${ut.mezzanine.elevationM.toFixed(2)} m).`,
            reason: 'Circulação inferior pode apresentar desconforto ergonômico.',
            suggestion: 'Ajustar cota do mezanino para >= 2,05 m (se pé-direito permitir).',
            status: 'pendente',
            targetUnitTypeId: ut.id,
          });
        }
        const upperClear = round2(
          ut.ceilingHeight - ut.mezzanine.elevationM - ut.mezzanine.slabThicknessM,
        );
        if (upperClear < 1.1) {
          issues.push({
            id: `clash-mez-upper-${ut.id}`,
            severity: 'ATENCAO',
            disciplines: 'Arquitetura × Mezanino',
            elementsInvolved: ['Mezanino'],
            location: `Tipologia ${ut.code}`,
            floorName: 'Tipologia Padrão',
            roomName: 'Mezanino',
            description: `Pé-direito útil superior reduzido no mezanino (${upperClear.toFixed(2)} m).`,
            reason: 'Recomenda-se altura mínima livre >= 1,10 m (dormitório) ou >= 2,00 m (permanência em pé).',
            suggestion: 'Aumentar pé-direito da kitnet ou reduzir ligeiramente a cota do deck.',
            status: 'pendente',
            targetUnitTypeId: ut.id,
          });
        }
      }
      const stair = ut.furniture.find((f) => f.category === 'escada');
      if (stair?.stairSpec) {
        const b = stair.stairSpec.blondelSumM;
        if (b < 0.6 || b > 0.66) {
          issues.push({
            id: `clash-mez-blondel-${ut.id}`,
            severity: 'ATENCAO',
            disciplines: 'Arquitetura × Circulação Vertical',
            elementsInvolved: [stair.name],
            location: `Tipologia ${ut.code}`,
            floorName: 'Tipologia Padrão',
            roomName: 'Escada Mezanino',
            description: `Escada do mezanino fora da faixa ergonômica de Blondel (2h+p = ${b.toFixed(2)} m).`,
            reason: 'Fórmula de Blondel recomenda 2h + p entre 0,62 m e 0,65 m (NBR 9050/9077).',
            suggestion: 'Recalcular espelho/piso ou adotar escada em L.',
            status: 'pendente',
            targetUnitTypeId: ut.id,
          });
        }
      }
    }
  }

  // Structural un-dimensioned reminder
  if (project.structuralElements.some((s) => !s.isDimensioned)) {
    issues.push({
      id: 'info-struct-prelim',
      severity: 'INFORMATIVO',
      disciplines: 'Estrutura',
      elementsInvolved: ['Elementos Estruturais Conceituais'],
      location: 'Edificação Completa',
      floorName: 'Todos',
      roomName: 'Estrutura',
      description: 'Elementos estruturais lançados em nível conceitual (sem cálculo estrutural executivo).',
      reason: 'O sistema realiza modelagem geométrica conceitual e não substitui software/cálculo estrutural por engenheiro.',
      suggestion: 'Submeter carregamento e geometria ao cálculo estrutural definitivo (NBR 6118 / 8800 / 6122).',
      status: 'em_analise',
    });
  }

  return issues;
}

// ============================================================================
// 6. URBANISM, ACCESSIBILITY & FIRE SAFETY PRELIMINARY CHECKS
// ============================================================================
export interface UrbanRuleEvaluation {
  ruleId: string;
  description: string;
  lawReference: string;
  limitDisplay: string;
  measuredDisplay: string;
  status: RuleEvaluationStatus;
  notes: string;
}

export function evaluateUrbanCompliance(project: Project): UrbanRuleEvaluation[] {
  const siteCheck = analyzeSiteGeometry(project.site);
  const siteArea = Math.max(1, siteCheck.calculatedArea);
  const firstFloor = project.floors[0];
  const firstImp = firstFloor
    ? checkImplantationFeasibility(project.site, firstFloor.units, project.unitTypes)
    : { footprintAreaM2: 0, occupancyRatePercent: 0 };

  const totalBuiltArea = project.floors.reduce((sum, fl) => {
    const uArea = fl.units.reduce((us, u) => {
      const ut = project.unitTypes.find((t) => t.id === u.unitTypeId);
      return us + (ut ? ut.width * ut.depth : 0);
    }, 0);
    return sum + uArea + fl.commonAreaM2;
  }, 0);

  const far = round2(totalBuiltArea / siteArea);
  const occupancyRate = round2(
    ((firstImp.footprintAreaM2 + (firstFloor?.commonAreaM2 ?? 0)) / siteArea) * 100,
  );
  const permeabilityRate = round2(Math.max(0, 100 - occupancyRate));
  const buildingHeight = round2(
    project.floors.reduce((s, f) => s + f.floorToFloorHeight, 0),
  );

  return project.urbanRules.map((rule) => {
    let measured: number | null = null;
    if (rule.parameterKey === 'occupancyRate') measured = occupancyRate;
    else if (rule.parameterKey === 'far') measured = far;
    else if (rule.parameterKey === 'permeabilityRate') measured = permeabilityRate;
    else if (rule.parameterKey === 'buildingHeight') measured = buildingHeight;

    let status: RuleEvaluationStatus = 'nao_informado';
    if (rule.parameterLimit === null || measured === null) {
      status = 'nao_informado';
    } else if (rule.lawReference === 'NÃO INFORMADO' || rule.municipality === 'Não informado') {
      status = 'confirmacao_tecnica';
    } else if (rule.condition === 'max') {
      status = measured <= rule.parameterLimit ? 'atendido' : 'nao_atendido';
    } else if (rule.condition === 'min') {
      status = measured >= rule.parameterLimit ? 'atendido' : 'nao_atendido';
    } else {
      status = 'confirmacao_tecnica';
    }

    return {
      ruleId: rule.id,
      description: rule.description,
      lawReference: rule.lawReference,
      limitDisplay: rule.parameterLimit !== null ? `${rule.parameterLimit} ${rule.unit}` : 'NÃO INFORMADO',
      measuredDisplay: measured !== null ? `${measured} ${rule.unit}` : 'NÃO INFORMADO',
      status,
      notes:
        status === 'confirmacao_tecnica'
          ? 'Índice calculado geometricamente, porém norma municipal ainda não foi validada.'
          : rule.notes,
    };
  });
}

export interface ComplianceCheckItem {
  id: string;
  code: string;
  criterion: string;
  reference: string;
  expected: string;
  found: string;
  status: 'ATENDIDO' | 'NAO_ATENDIDO' | 'NAO_AVALIADO' | 'PENDENTE';
}

export function evaluateAccessibility(project: Project): ComplianceCheckItem[] {
  const items: ComplianceCheckItem[] = [];
  const cfg = project.accessibilityConfig;

  // Check corridor widths on floors
  for (const fl of project.floors) {
    items.push({
      id: `acc-corr-${fl.id}`,
      code: `ACC-COR-${fl.levelIndex + 1}`,
      criterion: `Largura mínima de circulação comum (${fl.name})`,
      reference: cfg.normReference,
      expected: `>= ${cfg.minCorridorWidthM.toFixed(2)} m`,
      found: `${fl.corridorWidth.toFixed(2)} m`,
      status: fl.corridorWidth >= cfg.minCorridorWidthM ? 'ATENDIDO' : 'NAO_ATENDIDO',
    });
  }

  // Check accessible unit existence if required
  const hasAccUnit = project.unitTypes.some((u) => u.accessible);
  items.push({
    id: 'acc-unit-exist',
    code: 'ACC-UNID',
    criterion: 'Existência de tipologia acessível cadastrada',
    reference: cfg.normReference,
    expected: cfg.requireAccessibleUnits ? 'Pelo menos 1 tipologia acessível' : 'Opcional conforme enquadramento',
    found: hasAccUnit ? 'Tipologia acessível presente' : 'Nenhuma tipologia marcada como acessível',
    status: cfg.requireAccessibleUnits ? (hasAccUnit ? 'ATENDIDO' : 'NAO_ATENDIDO') : 'NAO_AVALIADO',
  });

  // Check doors on accessible units (or all entry doors)
  for (const ut of project.unitTypes) {
    const entryDoor =
      ut.openings.find((o) => o.type === 'porta' && o.role === 'entrada') ??
      ut.openings.find((o) => o.type === 'porta');
    if (entryDoor) {
      items.push({
        id: `acc-door-${ut.id}`,
        code: `ACC-PTA-${ut.code}`,
        criterion: `Vão de porta principal (${ut.code})`,
        reference: cfg.normReference,
        expected: `>= ${cfg.minDoorWidthM.toFixed(2)} m`,
        found: `${entryDoor.width.toFixed(2)} m`,
        status: entryDoor.width >= cfg.minDoorWidthM ? 'ATENDIDO' : 'NAO_ATENDIDO',
      });
    }
    if (ut.accessible) {
      const bath = ut.rooms.find((r) => r.category === 'banheiro');
      const minDim = bath ? Math.min(bath.width, bath.depth) : 0;
      items.push({
        id: `acc-giro-${ut.id}`,
        code: `ACC-BWC-${ut.code}`,
        criterion: `Área de manobra Ø${cfg.turningCircleDiameterM.toFixed(2)}m no banheiro (${ut.code})`,
        reference: cfg.normReference,
        expected: `>= ${cfg.turningCircleDiameterM.toFixed(2)} m`,
        found: bath ? `${minDim.toFixed(2)} m (menor dimensão)` : 'Sem banheiro',
        status: bath && minDim >= cfg.turningCircleDiameterM ? 'ATENDIDO' : 'NAO_ATENDIDO',
      });
    }
  }

  // Vertical circulation check for multi-floor
  if (project.floors.length > 1) {
    const hasRampOrElev = project.structuralElements.some(
      (e) => e.notes.toLowerCase().includes('elevador') || e.notes.toLowerCase().includes('rampa'),
    );
    items.push({
      id: 'acc-vert',
      code: 'ACC-VERT',
      criterion: 'Acessibilidade vertical aos pavimentos superiores',
      reference: cfg.normReference,
      expected: 'Rampa acessível ou elevador/plataforma conforme legislação',
      found: hasRampOrElev ? 'Previsto' : 'Apenas escada modelada — verificar exigência legal de unidade acessível no térreo vs elevador',
      status: 'PENDENTE',
    });
  }

  return items;
}

export function evaluateFireSafety(project: Project): ComplianceCheckItem[] {
  const fs = project.fireSafetyNotes;
  const totalUnits = project.floors.reduce((s, fl) => s + fl.units.length, 0);
  const pop = totalUnits * fs.estimatedPopulationPerUnit;
  const totalHeight = round2(project.floors.reduce((s, f) => s + f.floorToFloorHeight, 0));

  return [
    {
      id: 'fire-reg',
      code: 'INC-NORM',
      criterion: 'Identificação da regulamentação estadual (Corpo de Bombeiros)',
      reference: 'Legislação Estadual / ABNT NBR 9077',
      expected: 'Decreto / Instrução Técnica informada',
      found: fs.stateRegulation,
      status: fs.stateRegulation.includes('Não informada') ? 'PENDENTE' : 'ATENDIDO',
    },
    {
      id: 'fire-pop',
      code: 'INC-POP',
      criterion: 'Estimativa de população e altura da edificação',
      reference: 'Parâmetros de ocupação cadastrados',
      expected: 'População e altura definidas',
      found: `${pop} pessoas estimadas | Altura ${totalHeight} m (${project.floors.length} pav.)`,
      status: totalUnits > 0 ? 'ATENDIDO' : 'PENDENTE',
    },
    {
      id: 'fire-ext',
      code: 'INC-EXT',
      criterion: 'Previsão de extintores, iluminação de emergência e sinalização',
      reference: 'ITs Corpo de Bombeiros',
      expected: 'Previstos no projeto preliminar',
      found: `Extintores: ${fs.hasExtinguishers ? 'Sim' : 'Não'} | Ilum. Emergência: ${fs.hasEmergencyLighting ? 'Sim' : 'Não'} | Sinalização: ${fs.hasSignage ? 'Sim' : 'Não'}`,
      status: fs.hasExtinguishers && fs.hasEmergencyLighting && fs.hasSignage ? 'ATENDIDO' : 'PENDENTE',
    },
    {
      id: 'fire-rt',
      code: 'INC-RT',
      criterion: 'Validação por profissional habilitado e aprovação CBM',
      reference: 'Responsabilidade Técnica',
      expected: 'Validado pelo RT',
      found: fs.verifiedByProfessional ? 'Validado' : 'NÃO AVALIADO / Pendente aprovação CBM',
      status: fs.verifiedByProfessional ? 'ATENDIDO' : 'NAO_AVALIADO',
    },
  ];
}
