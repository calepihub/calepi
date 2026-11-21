import {
  getRoomArea,
  getRoomPerimeter,
  getWallLength,
  round2,
} from './geometry';
import { getSinapiRJItem, getSinapiRJWallBenchmarkPerM2 } from './sinapiRJ';
import type {
  BudgetEntry,
  ConstructionMethodId,
  Project,
  UnitType,
} from '../types/project';

export interface QuantityItem {
  id: string;
  code: string;
  discipline: 'Arquitetura' | 'Estrutura' | 'Elétrica' | 'Hidráulica' | 'Sanitária' | 'Mobiliário';
  description: string;
  unit: string;
  netQuantity: number;
  lossFactorPercent: number;
  grossQuantity: number;
  measurementCriterion: string;
  sourceOrigin: string;
  calculationMemory: string;
  unitTypeBreakdown: Record<string, number>;
}

export interface QuantitiesReport {
  items: QuantityItem[];
  summary: {
    totalUnits: number;
    totalPrivateAreaM2: number;
    totalCommonAreaM2: number;
    totalBuiltAreaM2: number;
    totalWallNetAreaM2: number;
    totalFloorAreaM2: number;
    totalPaintAreaM2: number;
    totalFacadeAreaM2: number;
    totalBaseboardM: number;
    totalConcreteVolumeM3: number;
  };
}

export function calculateQuantities(project: Project): QuantitiesReport {
  const unitCounts = new Map<string, number>();
  let totalUnits = 0;
  let totalCommonAreaM2 = 0;

  for (const fl of project.floors) {
    totalCommonAreaM2 += fl.commonAreaM2 || 0;
    for (const inst of fl.units) {
      totalUnits += 1;
      unitCounts.set(inst.unitTypeId, (unitCounts.get(inst.unitTypeId) ?? 0) + 1);
    }
  }

  let totalPrivateAreaM2 = 0;
  let totalWallNetAreaM2 = 0;
  let totalExternalWallNetAreaM2 = 0;
  let totalInternalWallNetAreaM2 = 0;
  let totalFloorAreaM2 = 0;
  let totalWetWallTileM2 = 0;
  let totalPaintAreaM2 = 0;
  let totalCeilingAreaM2 = 0;
  let totalBaseboardM = 0;
  let totalDoors = 0;
  let totalWindows = 0;
  let totalOutlets = 0;
  let totalSwitches = 0;
  let totalLuminaires = 0;
  let totalSpecialPoints = 0;
  let totalElectricalPoints = 0;
  let totalWaterPoints = 0;
  let totalDrainagePoints = 0;
  let totalFurniture = 0;

  const breakdownByUt = (fn: (ut: UnitType) => number): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const ut of project.unitTypes) {
      const qty = unitCounts.get(ut.id) ?? 0;
      if (qty > 0) out[ut.code] = round2(fn(ut) * qty);
    }
    return out;
  };

  for (const ut of project.unitTypes) {
    const count = unitCounts.get(ut.id) ?? 0;
    if (count === 0) continue;

    totalPrivateAreaM2 += ut.width * ut.depth * count;

    // Openings map by wallId
    const openingAreaByWall = new Map<string, number>();
    for (const op of ut.openings) {
      const area = op.width * op.height;
      openingAreaByWall.set(op.wallId, (openingAreaByWall.get(op.wallId) ?? 0) + area);
      if (op.type === 'porta') totalDoors += count;
      if (op.type === 'janela') totalWindows += count;
    }

    for (const w of ut.walls) {
      const len = getWallLength(w);
      const gross = len * w.height;
      const opArea = openingAreaByWall.get(w.id) ?? 0;
      const net = Math.max(0, gross - opArea);
      totalWallNetAreaM2 += net * count;
      if (w.isExternal) totalExternalWallNetAreaM2 += net * count;
      else totalInternalWallNetAreaM2 += net * count;
    }

    for (const r of ut.rooms) {
      const area = getRoomArea(r);
      const perim = getRoomPerimeter(r);
      totalFloorAreaM2 += area * count;
      totalCeilingAreaM2 += area * count;
      if (r.category === 'banheiro' || r.category === 'cozinha' || r.category === 'area_servico') {
        // Wet wall tiles up to ceilingHeight in bath, 1.5m/ceiling in kitchen/AS
        totalWetWallTileM2 += perim * r.ceilingHeight * 0.65 * count;
        totalPaintAreaM2 += area * count; // ceiling paint
      } else {
        totalPaintAreaM2 += (perim * r.ceilingHeight * 0.85 + area) * count;
      }
      totalBaseboardM += Math.max(0, perim - 0.9) * count;
    }

    for (const ep of ut.electricalPoints) {
      totalElectricalPoints += count;
      if (ep.category === 'interruptor') totalSwitches += count;
      else if (ep.category === 'iluminacao_teto' || ep.category === 'arandela') totalLuminaires += count;
      else if (
        ep.category === 'dados' ||
        ep.category === 'tv' ||
        ep.category === 'antena_tv' ||
        ep.category === 'wifi_ap' ||
        ep.category === 'cftv' ||
        ep.category === 'rack_ti' ||
        ep.category === 'interfone'
      ) {
        totalSpecialPoints += count;
      } else totalOutlets += count;
    }

    totalWaterPoints += ut.waterPoints.length * count;
    totalDrainagePoints += ut.drainagePoints.length * count;
    totalFurniture += ut.furniture.length * count;
  }

  // Structural concrete volume (conceptual geometry from pillars + floor slabs)
  const slabVolumeM3 = round2(
    project.floors.reduce((sum, fl) => {
      const floorUnitsArea = fl.units.reduce((us, inst) => {
        const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
        return us + (ut ? ut.width * ut.depth : 0);
      }, 0);
      return sum + (floorUnitsArea + fl.commonAreaM2) * fl.slabThickness;
    }, 0),
  );
  const columnsVolumeM3 = round2(
    project.structuralElements
      .filter((s) => s.type === 'pilar')
      .reduce((sum, s) => sum + s.width * s.depth * s.height, 0),
  );
  const totalConcreteVolumeM3 = round2(slabVolumeM3 + columnsVolumeM3);
  const totalFormworkAreaM2 = round2(
    project.floors.reduce((sum, fl) => {
      const floorUnitsArea = fl.units.reduce((us, inst) => {
        const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
        return us + (ut ? ut.width * ut.depth : 0);
      }, 0);
      return sum + (floorUnitsArea + fl.commonAreaM2);
    }, 0) +
      project.structuralElements
        .filter((s) => s.type === 'pilar')
        .reduce((sum, s) => sum + 2 * (s.width + s.depth) * s.height, 0),
  );

  // Masonry blocks estimate (only meaningful for masonry systems, with explicit consumption source)
  const isMasonry =
    project.constructionMethod.methodId === 'alvenaria_convencional' ||
    project.constructionMethod.methodId === 'alvenaria_estrutural';
  const blocksPerM2 = 25; // 19x19cm block nominal 25 un/m2 (10% loss)
  const blockCount = isMasonry ? Math.ceil(totalWallNetAreaM2 * blocksPerM2 * 1.1) : 0;
  const mortarVolumeM3 = isMasonry ? round2(totalWallNetAreaM2 * 0.018 * 1.15) : 0;

  // Estimated conduit and wire lengths based on unit perimeter + ceiling drops
  const avgConduitPerPoint = 4.2; // m per point (geometric average drop + horizontal run)
  const totalConduitM = round2(totalElectricalPoints * avgConduitPerPoint);
  const totalWireM = round2(totalConduitM * 3.0); // fase + neutro + terra
  const totalWaterPipeM = round2(totalWaterPoints * 3.5);
  const totalDrainPipeM = round2(totalDrainagePoints * 2.8);

  const totalBuiltAreaM2 = round2(totalPrivateAreaM2 + totalCommonAreaM2);

  const items: QuantityItem[] = [
    {
      id: 'q-wall-ext',
      code: 'ARQ-01',
      discipline: 'Arquitetura',
      description: `Paredes Externas (${project.constructionMethod.name}, e=${Math.round(project.constructionMethod.externalWallThickness * 100)}cm)`,
      unit: 'm²',
      netQuantity: round2(totalExternalWallNetAreaM2),
      lossFactorPercent: 5,
      grossQuantity: round2(totalExternalWallNetAreaM2 * 1.05),
      measurementCriterion: 'Área líquida (comprimento × altura − vãos de portas e janelas)',
      sourceOrigin: 'Geometria direta das paredes cadastradas nas tipologias × unidades implantadas',
      calculationMemory: `Σ(L_parede_ext × H − A_vãos) × N_unid = ${round2(totalExternalWallNetAreaM2)} m² (+5% perda = ${round2(totalExternalWallNetAreaM2 * 1.05)} m²)`,
      unitTypeBreakdown: breakdownByUt((ut) =>
        ut.walls.filter((w) => w.isExternal).reduce((s, w) => s + getWallLength(w) * w.height, 0),
      ),
    },
    {
      id: 'q-wall-int',
      code: 'ARQ-02',
      discipline: 'Arquitetura',
      description: `Paredes Internas (e=${Math.round(project.constructionMethod.internalWallThickness * 100)}cm)`,
      unit: 'm²',
      netQuantity: round2(totalInternalWallNetAreaM2),
      lossFactorPercent: 5,
      grossQuantity: round2(totalInternalWallNetAreaM2 * 1.05),
      measurementCriterion: 'Área líquida descontando portas internas',
      sourceOrigin: 'Geometria direta das paredes internas',
      calculationMemory: `Σ(L_parede_int × H − A_vãos) × N_unid = ${round2(totalInternalWallNetAreaM2)} m²`,
      unitTypeBreakdown: breakdownByUt((ut) =>
        ut.walls.filter((w) => !w.isExternal).reduce((s, w) => s + getWallLength(w) * w.height, 0),
      ),
    },
    ...(isMasonry
      ? [
          {
            id: 'q-blocks',
            code: 'ALV-01',
            discipline: 'Arquitetura' as const,
            description: `Blocos/Tijolos (${project.constructionMethod.masonryBlockType ?? '19x19cm'})`,
            unit: 'un',
            netQuantity: Math.ceil(totalWallNetAreaM2 * blocksPerM2),
            lossFactorPercent: 10,
            grossQuantity: blockCount,
            measurementCriterion: `Consumo nominal ${blocksPerM2} un/m² (bloco 19x19cm c/ junta 1cm) + 10% quebra`,
            sourceOrigin: 'Área líquida de alvenaria × coeficiente nominal de bloco 19x19cm',
            calculationMemory: `${round2(totalWallNetAreaM2)} m² × ${blocksPerM2} un/m² × 1,10 = ${blockCount} un`,
            unitTypeBreakdown: {},
          },
          {
            id: 'q-mortar',
            code: 'ALV-02',
            discipline: 'Arquitetura' as const,
            description: 'Argamassa de assentamento',
            unit: 'm³',
            netQuantity: round2(totalWallNetAreaM2 * 0.018),
            lossFactorPercent: 15,
            grossQuantity: mortarVolumeM3,
            measurementCriterion: 'Consumo estimado 0,018 m³/m² (junta 1,0–1,5cm) + 15% perda',
            sourceOrigin: 'Área líquida de alvenaria',
            calculationMemory: `${round2(totalWallNetAreaM2)} m² × 0,018 m³/m² × 1,15 = ${mortarVolumeM3} m³`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    {
      id: 'q-floor',
      code: 'REV-01',
      discipline: 'Arquitetura',
      description: 'Pisos e Revestimento Cerâmico/Porcelanato de Piso',
      unit: 'm²',
      netQuantity: round2(totalFloorAreaM2),
      lossFactorPercent: 10,
      grossQuantity: round2(totalFloorAreaM2 * 1.1),
      measurementCriterion: 'Soma das áreas úteis de todos os ambientes + 10% recortes',
      sourceOrigin: 'Cadastro geométrico de ambientes (largura × comprimento)',
      calculationMemory: `Σ(A_ambiente) × N_unid = ${round2(totalFloorAreaM2)} m² (+10% = ${round2(totalFloorAreaM2 * 1.1)} m²)`,
      unitTypeBreakdown: breakdownByUt((ut) => ut.rooms.reduce((s, r) => s + getRoomArea(r), 0)),
    },
    {
      id: 'q-tile-wall',
      code: 'REV-02',
      discipline: 'Arquitetura',
      description: 'Revestimento Cerâmico de Paredes (Áreas Molhadas)',
      unit: 'm²',
      netQuantity: round2(totalWetWallTileM2),
      lossFactorPercent: 10,
      grossQuantity: round2(totalWetWallTileM2 * 1.1),
      measurementCriterion: 'Perímetro dos ambientes molhados × pé-direito × 0,65 (desconto vãos/parcial)',
      sourceOrigin: 'Ambientes categoria banheiro/cozinha/área de serviço',
      calculationMemory: `Σ(P_molhado × H × 0,65) = ${round2(totalWetWallTileM2)} m²`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-paint',
      code: 'PIN-01',
      discipline: 'Arquitetura',
      description: 'Pintura Interna (Paredes Secas + Tetos)',
      unit: 'm²',
      netQuantity: round2(totalPaintAreaM2),
      lossFactorPercent: 5,
      grossQuantity: round2(totalPaintAreaM2 * 1.05),
      measurementCriterion: 'Área líquida estimada de paredes secas e tetos',
      sourceOrigin: 'Perímetros e áreas de ambientes secos + tetos',
      calculationMemory: `Σ(P_seco × H × 0,85 + A_teto) = ${round2(totalPaintAreaM2)} m²`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-ceiling',
      code: 'FOR-01',
      discipline: 'Arquitetura',
      description: 'Forro / Acabamento de Teto',
      unit: 'm²',
      netQuantity: round2(totalCeilingAreaM2),
      lossFactorPercent: 5,
      grossQuantity: round2(totalCeilingAreaM2 * 1.05),
      measurementCriterion: 'Projeção horizontal da área útil dos ambientes',
      sourceOrigin: 'Áreas dos ambientes cadastrados',
      calculationMemory: `Σ(A_ambiente) = ${round2(totalCeilingAreaM2)} m²`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-baseboard',
      code: 'ROD-01',
      discipline: 'Arquitetura',
      description: 'Rodapés',
      unit: 'm',
      netQuantity: round2(totalBaseboardM),
      lossFactorPercent: 8,
      grossQuantity: round2(totalBaseboardM * 1.08),
      measurementCriterion: 'Perímetro dos ambientes descontando vão médio de 0,90m de porta',
      sourceOrigin: 'Perímetro geométrico dos ambientes',
      calculationMemory: `Σ(P_ambiente − 0,90m) = ${round2(totalBaseboardM)} m`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-doors',
      code: 'ESQ-01',
      discipline: 'Arquitetura',
      description: 'Portas Completas (Folha, Batente e Ferragens)',
      unit: 'un',
      netQuantity: totalDoors,
      lossFactorPercent: 0,
      grossQuantity: totalDoors,
      measurementCriterion: 'Contagem unitária de portas cadastradas nas tipologias implantadas',
      sourceOrigin: 'Aberturas tipo "porta" nas paredes',
      calculationMemory: `Contagem direta × N_unid = ${totalDoors} un`,
      unitTypeBreakdown: breakdownByUt((ut) => ut.openings.filter((o) => o.type === 'porta').length),
    },
    {
      id: 'q-windows',
      code: 'ESQ-02',
      discipline: 'Arquitetura',
      description: 'Janelas e Esquadrias Externas',
      unit: 'un',
      netQuantity: totalWindows,
      lossFactorPercent: 0,
      grossQuantity: totalWindows,
      measurementCriterion: 'Contagem unitária de janelas cadastradas',
      sourceOrigin: 'Aberturas tipo "janela" nas paredes',
      calculationMemory: `Contagem direta × N_unid = ${totalWindows} un`,
      unitTypeBreakdown: breakdownByUt((ut) => ut.openings.filter((o) => o.type === 'janela').length),
    },
    {
      id: 'q-conc',
      code: 'EST-01',
      discipline: 'Estrutura',
      description: 'Concreto Estrutural Conceitual (Lajes + Pilares modelados)',
      unit: 'm³',
      netQuantity: totalConcreteVolumeM3,
      lossFactorPercent: 5,
      grossQuantity: round2(totalConcreteVolumeM3 * 1.05),
      measurementCriterion: 'Volume geométrico de lajes (área × espessura) + pilares lançados (CONCEITUAL — não dimensionado)',
      sourceOrigin: 'Pavimentos (espessura da laje) + Elementos Estruturais',
      calculationMemory: `Lajes (${slabVolumeM3} m³) + Pilares (${columnsVolumeM3} m³) = ${totalConcreteVolumeM3} m³`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-form',
      code: 'EST-02',
      discipline: 'Estrutura',
      description: 'Fôrmas de Concreto (Conceitual)',
      unit: 'm²',
      netQuantity: totalFormworkAreaM2,
      lossFactorPercent: 5,
      grossQuantity: round2(totalFormworkAreaM2 * 1.05),
      measurementCriterion: 'Fundo de lajes + faces laterais de pilares modelados',
      sourceOrigin: 'Geometria de pavimentos e pilares',
      calculationMemory: `Área total de fôrmas estimada = ${totalFormworkAreaM2} m²`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-ele-pts',
      code: 'ELE-01',
      discipline: 'Elétrica',
      description: 'Pontos de Tomadas (Baixas, Médias, Altas e TUE)',
      unit: 'pt',
      netQuantity: totalOutlets,
      lossFactorPercent: 0,
      grossQuantity: totalOutlets,
      measurementCriterion: 'Contagem direta de pontos de tomada por ambiente',
      sourceOrigin: 'Cadastro de pontos elétricos das tipologias',
      calculationMemory: `Σ(tomadas_por_tipologia × N_unid) = ${totalOutlets} pts`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-ele-sw',
      code: 'ELE-02',
      discipline: 'Elétrica',
      description: 'Interruptores',
      unit: 'pt',
      netQuantity: totalSwitches,
      lossFactorPercent: 0,
      grossQuantity: totalSwitches,
      measurementCriterion: 'Contagem direta',
      sourceOrigin: 'Cadastro elétrico',
      calculationMemory: `${totalSwitches} interruptores`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-ele-lum',
      code: 'ELE-03',
      discipline: 'Elétrica',
      description: 'Pontos de Iluminação / Luminárias',
      unit: 'pt',
      netQuantity: totalLuminaires,
      lossFactorPercent: 0,
      grossQuantity: totalLuminaires,
      measurementCriterion: 'Contagem direta',
      sourceOrigin: 'Cadastro elétrico',
      calculationMemory: `${totalLuminaires} pontos de luz`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-ele-cond',
      code: 'ELE-04',
      discipline: 'Elétrica',
      description: 'Eletroduto Corrugado Ø20/25mm (Estimativa paramétrica por ponto)',
      unit: 'm',
      netQuantity: totalConduitM,
      lossFactorPercent: 10,
      grossQuantity: round2(totalConduitM * 1.1),
      measurementCriterion: `Estimativa de ${avgConduitPerPoint}m/ponto elétrico até o QDC da unidade`,
      sourceOrigin: 'Quantidade de pontos elétricos × trajeto médio paramétrico',
      calculationMemory: `${totalElectricalPoints} pts × ${avgConduitPerPoint} m/pt = ${totalConduitM} m`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-ele-wire',
      code: 'ELE-05',
      discipline: 'Elétrica',
      description: 'Condutores Isolados (Fase + Neutro + Terra — estimativa 3x eletroduto)',
      unit: 'm',
      netQuantity: totalWireM,
      lossFactorPercent: 10,
      grossQuantity: round2(totalWireM * 1.1),
      measurementCriterion: '3 condutores médios por trecho de eletroduto',
      sourceOrigin: 'Comprimento de eletrodutos × 3 vias',
      calculationMemory: `${totalConduitM} m × 3 = ${totalWireM} m`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-esp-dados',
      code: 'ESP-01',
      discipline: 'Elétrica',
      description: 'Pontos Especiais (Dados RJ45 Cat6, Antena Coletiva/TV, Wi-Fi AP & CFTV/Interfone)',
      unit: 'pt',
      netQuantity: totalSpecialPoints,
      lossFactorPercent: 0,
      grossQuantity: totalSpecialPoints,
      measurementCriterion: 'Contagem direta de pontos de telecom, TV, internet, interfonia e CFTV',
      sourceOrigin: 'Módulo Instalações Elétricas & Especiais',
      calculationMemory: `${totalSpecialPoints} pontos especiais nas unidades`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-hid-pts',
      code: 'HID-01',
      discipline: 'Hidráulica',
      description: 'Pontos de Água Fria e Água Quente',
      unit: 'pt',
      netQuantity: totalWaterPoints,
      lossFactorPercent: 0,
      grossQuantity: totalWaterPoints,
      measurementCriterion: 'Contagem direta de pontos cadastrados',
      sourceOrigin: 'Módulo Hidráulica',
      calculationMemory: `${totalWaterPoints} pontos de alimentação hidráulica`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-hid-pipe',
      code: 'HID-02',
      discipline: 'Hidráulica',
      description: 'Tubulação de Água Fria/Quente (Estimativa 3,5m/ponto)',
      unit: 'm',
      netQuantity: totalWaterPipeM,
      lossFactorPercent: 10,
      grossQuantity: round2(totalWaterPipeM * 1.1),
      measurementCriterion: '3,5m médios por ponto de consumo (sub-ramais e ramais)',
      sourceOrigin: 'Pontos hidráulicos × fator geométrico de ramal',
      calculationMemory: `${totalWaterPoints} pts × 3,5 m = ${totalWaterPipeM} m`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-san-pts',
      code: 'SAN-01',
      discipline: 'Sanitária',
      description: 'Pontos e Dispositivos Sanitários (Saídas, Ralos, Caixas)',
      unit: 'pt',
      netQuantity: totalDrainagePoints,
      lossFactorPercent: 0,
      grossQuantity: totalDrainagePoints,
      measurementCriterion: 'Contagem direta da rede sanitária modelada',
      sourceOrigin: 'Módulo Sanitário e Esgoto',
      calculationMemory: `${totalDrainagePoints} elementos sanitários`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-san-pipe',
      code: 'SAN-02',
      discipline: 'Sanitária',
      description: 'Tubulação de Esgoto PVC SN (Estimativa 2,8m/elemento)',
      unit: 'm',
      netQuantity: totalDrainPipeM,
      lossFactorPercent: 10,
      grossQuantity: round2(totalDrainPipeM * 1.1),
      measurementCriterion: '2,8m médios por trecho conectado',
      sourceOrigin: 'Elementos sanitários × fator geométrico',
      calculationMemory: `${totalDrainagePoints} pts × 2,8 m = ${totalDrainPipeM} m`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-mob-pts',
      code: 'MOB-01',
      discipline: 'Mobiliário',
      description: 'Louças, Bancadas e Mobiliário Previstos em Planta',
      unit: 'un',
      netQuantity: totalFurniture,
      lossFactorPercent: 0,
      grossQuantity: totalFurniture,
      measurementCriterion: 'Contagem direta de itens de mobiliário nas unidades',
      sourceOrigin: 'Módulo Mobiliário e Equipamentos',
      calculationMemory: `${totalFurniture} itens cadastrados`,
      unitTypeBreakdown: {},
    },
  ];

  return {
    items,
    summary: {
      totalUnits,
      totalPrivateAreaM2: round2(totalPrivateAreaM2),
      totalCommonAreaM2: round2(totalCommonAreaM2),
      totalBuiltAreaM2,
      totalWallNetAreaM2: round2(totalWallNetAreaM2),
      totalFloorAreaM2: round2(totalFloorAreaM2),
      totalPaintAreaM2: round2(totalPaintAreaM2),
      totalFacadeAreaM2: round2(totalExternalWallNetAreaM2),
      totalBaseboardM: round2(totalBaseboardM),
      totalConcreteVolumeM3,
    },
  };
}

// ============================================================================
// BUDGET SYNC & ANALYSIS
// ============================================================================
export interface BudgetLineComputed extends BudgetEntry {
  effectiveQuantity: number;
  subtotal: number | null;
  abcClass: 'A' | 'B' | 'C' | 'SEM_COTACAO';
  cumulativePercent: number | null;
}

export interface BudgetSummaryReport {
  lines: BudgetLineComputed[];
  directTotalCost: number;
  indirectCost: number;
  bdiValue: number;
  grandTotalCost: number;
  costPerM2: number | null;
  costPerUnit: number | null;
  unquotedCount: number;
}

export function syncBudgetWithQuantities(
  project: Project,
  quantities: QuantitiesReport,
): BudgetEntry[] {
  const existingByCode = new Map(project.budgetEntries.map((e) => [e.code, e]));
  const synced: BudgetEntry[] = quantities.items.map((q) => {
    const prev = existingByCode.get(q.code);
    const sinapiRef = getSinapiRJItem(q.code);
    return {
      id: prev?.id ?? `bdg-${q.code}`,
      code: q.code,
      sinapiCode: prev?.sinapiCode ?? sinapiRef?.sinapiCode,
      description: prev?.description ?? q.description,
      discipline: q.discipline,
      category: prev?.category ?? sinapiRef?.category ?? 'servico',
      unit: q.unit,
      quantity: q.netQuantity,
      unitPrice: prev?.unitPrice ?? null,
      lossFactorPercent: prev?.lossFactorPercent ?? q.lossFactorPercent,
      supplier: prev?.supplier ?? '',
      sourceBase: prev?.sourceBase ?? project.budgetSettings.sourceBase,
      notes: prev?.notes ?? sinapiRef?.sinapiDescription ?? '',
    };
  });

  // Preserve manual custom budget entries not tied to automatic quantity codes
  const autoCodes = new Set(quantities.items.map((q) => q.code));
  for (const entry of project.budgetEntries) {
    if (!autoCodes.has(entry.code)) {
      synced.push(entry);
    }
  }
  return synced;
}

export function calculateBudgetSummary(
  project: Project,
  quantities: QuantitiesReport,
): BudgetSummaryReport {
  const entries = syncBudgetWithQuantities(project, quantities);
  const computedBase = entries.map((e) => {
    const effectiveQuantity = round2(e.quantity * (1 + (e.lossFactorPercent || 0) / 100));
    const subtotal =
      e.unitPrice !== null && e.unitPrice >= 0
        ? round2(effectiveQuantity * e.unitPrice)
        : null;
    return {
      ...e,
      effectiveQuantity,
      subtotal,
    };
  });

  const quoted = computedBase
    .filter((l) => l.subtotal !== null)
    .sort((a, b) => (b.subtotal ?? 0) - (a.subtotal ?? 0));
  const directTotalCost = round2(quoted.reduce((s, l) => s + (l.subtotal ?? 0), 0));

  const abcMap = new Map<string, { abcClass: 'A' | 'B' | 'C'; cumulativePercent: number }>();
  let running = 0;
  for (const item of quoted) {
    running += item.subtotal ?? 0;
    const pct = directTotalCost > 0 ? round2((running / directTotalCost) * 100) : 0;
    const abcClass: 'A' | 'B' | 'C' = pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C';
    abcMap.set(item.id, { abcClass, cumulativePercent: pct });
  }

  const lines: BudgetLineComputed[] = computedBase.map((l) => {
    const abc = abcMap.get(l.id);
    return {
      ...l,
      abcClass: abc ? abc.abcClass : 'SEM_COTACAO',
      cumulativePercent: abc ? abc.cumulativePercent : null,
    };
  });

  const indirectCost = round2(directTotalCost * ((project.budgetSettings.indirectCostsPercent || 0) / 100));
  const baseForBdi = directTotalCost + indirectCost;
  const bdiValue = round2(baseForBdi * ((project.budgetSettings.bdiPercent || 0) / 100));
  const discount = round2(baseForBdi * ((project.budgetSettings.discountPercent || 0) / 100));
  const grandTotalCost = round2(Math.max(0, baseForBdi + bdiValue - discount));

  const area = quantities.summary.totalBuiltAreaM2;
  const units = quantities.summary.totalUnits;
  const unquotedCount = lines.filter((l) => l.subtotal === null).length;

  return {
    lines,
    directTotalCost,
    indirectCost,
    bdiValue,
    grandTotalCost,
    costPerM2: grandTotalCost > 0 && area > 0 ? round2(grandTotalCost / area) : null,
    costPerUnit: grandTotalCost > 0 && units > 0 ? round2(grandTotalCost / units) : null,
    unquotedCount,
  };
}

// ============================================================================
// CONSTRUCTION METHOD COMPARATOR (No invented prices/metrics)
// ============================================================================
export interface MethodComparisonRow {
  methodId: ConstructionMethodId;
  methodName: string;
  wallAreaM2: number;
  typicalWallThicknessCm: string;
  primaryMaterials: string;
  specializedLaborRequired: string;
  estimatedWeightNote: string;
  lossesNote: string;
  thermalAcousticNote: string;
  maintenanceDurabilityNote: string;
  costEstimate: string;
  scheduleEstimate: string;
  restrictions: string;
}

export function compareConstructionMethodsForTypology(
  unitType: UnitType,
): MethodComparisonRow[] {
  const wallAreaM2 = round2(
    unitType.walls.reduce((s, w) => s + getWallLength(w) * w.height, 0),
  );

  return [
    {
      methodId: 'alvenaria_convencional',
      methodName: 'Alvenaria Convencional',
      wallAreaM2,
      typicalWallThicknessCm: '15 cm ext / 10 cm int (variável conforme bloco)',
      primaryMaterials: 'Blocos cerâmicos/concreto, cimento, cal, areia, aço e concreto para pilares/vigas',
      specializedLaborRequired: 'Mão de obra convencional amplamente disponível',
      estimatedWeightNote: 'Elevado (depende do dimensionamento estrutural e espessura das paredes)',
      lossesNote: 'Perdas típicas maiores por rasgos para instalações e desperdício de argamassa',
      thermalAcousticNote: 'Desempenho dependente da espessura, tipo de bloco e revestimento (avaliar NBR 15575)',
      maintenanceDurabilityNote: 'Alta durabilidade; manutenção simples com argamassa/pintura',
      costEstimate: `Ref. SINAPI-RJ (vedação): ~R$ ${getSinapiRJWallBenchmarkPerM2('alvenaria_convencional').toFixed(2)}/m² (cotar obra completa no orçamento)`,
      scheduleEstimate: 'Depende de equipe, cura e frentes de serviço',
      restrictions: 'Exige estrutura independente (pilares/vigas) e cura de concreto/revestimentos.',
    },
    {
      methodId: 'alvenaria_estrutural',
      methodName: 'Alvenaria Estrutural',
      wallAreaM2,
      typicalWallThicknessCm: '14 cm ou 19 cm modular (família 15x30 / 15x40)',
      primaryMaterials: 'Blocos estruturais (concreto/cerâmico), graute, armaduras verticais/horizontais',
      specializedLaborRequired: 'Requer equipe treinada em modulação e assentamento nivelado',
      estimatedWeightNote: 'Elevado (paredes portantes distribuem cargas ao longo das fundações)',
      lossesNote: 'Reduzidas quando há compatibilização modular prévia das instalações',
      thermalAcousticNote: 'Boa inércia térmica e isolamento acústico com blocos de concreto preenchidos',
      maintenanceDurabilityNote: 'Alta durabilidade; vedada a abertura de rasgos não previstos em projeto',
      costEstimate: `Ref. SINAPI-RJ (vedação): ~R$ ${getSinapiRJWallBenchmarkPerM2('alvenaria_estrutural').toFixed(2)}/m²`,
      scheduleEstimate: 'A definir conforme modulação',
      restrictions: 'Proibida remoção ou abertura posterior em paredes portantes sem cálculo estrutural.',
    },
    {
      methodId: 'light_steel_frame',
      methodName: 'Light Steel Frame',
      wallAreaM2,
      typicalWallThicknessCm: '11 a 14 cm (perfil 90mm + placas)',
      primaryMaterials: 'Perfis aço galvanizado (montantes/guias), placas cimentícias/OSB, drywall, lã mineral',
      specializedLaborRequired: 'SIM — equipe especializada em montagem a seco e estanqueidade',
      estimatedWeightNote: 'Leve (redução expressiva de carga permanente nas fundações)',
      lossesNote: 'Baixas perdas em obra quando industrializado/modulado',
      thermalAcousticNote: 'Elevado potencial térmico/acústico quando combinado com lã de vidro/rocha e barreira de vapor',
      maintenanceDurabilityNote: 'Exige cuidado rigoroso com impermeabilização, juntas e controle de umidade',
      costEstimate: `Ref. SINAPI-RJ (vedação): ~R$ ${getSinapiRJWallBenchmarkPerM2('light_steel_frame').toFixed(2)}/m²`,
      scheduleEstimate: 'A definir com fornecedor especializado',
      restrictions: 'Exige projeto executivo de modulação de perfis e fixações específicas para cargas suspensas.',
    },
    {
      methodId: 'wood_frame',
      methodName: 'Wood Frame',
      wallAreaM2,
      typicalWallThicknessCm: '12 a 15 cm',
      primaryMaterials: 'Madeira tratada autoclavada (Pinus/Eucalipto), OSB, membrana hidrófuga, gesso acartonado',
      specializedLaborRequired: 'SIM — carpintaria estrutural e montagem industrializada',
      estimatedWeightNote: 'Leve (similar ao Steel Frame)',
      lossesNote: 'Baixas quando pré-cortado',
      thermalAcousticNote: 'Bom isolamento térmico natural da madeira + miolo isolante',
      maintenanceDurabilityNote: 'Requer proteção contra umidade e xilófagos conforme NBR 7190 / diretrizes SINAT',
      costEstimate: `Ref. SINAPI-RJ (vedação): ~R$ ${getSinapiRJWallBenchmarkPerM2('wood_frame').toFixed(2)}/m²`,
      scheduleEstimate: 'A definir com fornecedor especializado',
      restrictions: 'Verificar aceitação em financiamento habitacional e normas de resistência ao fogo.',
    },
    {
      methodId: 'pre_moldado',
      methodName: 'Concreto Pré-Moldado / Modular',
      wallAreaM2,
      typicalWallThicknessCm: '10 a 15 cm (painéis maciços ou alveolares)',
      primaryMaterials: 'Painéis pré-fabricados de concreto armado/protendido, juntas e chumbadores',
      specializedLaborRequired: 'SIM — logística de içamento (munck/guindaste) e equipe de montagem',
      estimatedWeightNote: 'Elevado por peça; requer fundação e acesso para equipamentos pesados',
      lossesNote: 'Mínimas em canteiro (produção controlada em fábrica)',
      thermalAcousticNote: 'Depende de camada isolante ou espessura do painel',
      maintenanceDurabilityNote: 'Alta durabilidade; atenção periódica à selagem de juntas',
      costEstimate: `Ref. SINAPI-RJ (vedação): ~R$ ${getSinapiRJWallBenchmarkPerM2('pre_moldado').toFixed(2)}/m²`,
      scheduleEstimate: 'Depende de logística de fábrica e içamento',
      restrictions: 'Limitações de transporte viário, acesso de guindaste no terreno e flexibilidade de reformas.',
    },
  ];
}
