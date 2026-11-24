import {
  getRoomArea,
  getRoomPerimeter,
  getWallLength,
  round2,
} from './geometry';
import {
  CONSTRUCTION_STAGE_ORDER,
  SINAPI_RJ_METADATA,
  getDynamicSinapiRJItem,
  getSinapiRJWallBenchmarkPerM2,
  type ConstructionStageName,
} from './sinapiRJ';
import type {
  BudgetEntry,
  ConstructionMethodId,
  Project,
  UnitType,
} from '../types/project';
import {
  BASEBOARD_OPTIONS,
  CEILING_OPTIONS,
  DRAIN_OPTIONS,
  FLOOR_INTERNAL_OPTIONS,
  INTERIOR_DOOR_OPTIONS,
  GLASS_TYPE_OPTIONS,
  KITCHEN_FAUCET_OPTIONS,
  KITCHEN_SINK_OPTIONS,
  LAUNDRY_TUB_OPTIONS,
  METALS_FINISH_OPTIONS,
  ROOF_MATERIAL_OPTIONS,
  SANITARY_COLOR_OPTIONS,
  SHOWER_OPTIONS,
  TOILET_OPTIONS,
  WALL_EXTERIOR_OPTIONS,
  WALL_INTERIOR_OPTIONS,
  WASHBASIN_FAUCET_OPTIONS,
  WASHBASIN_OPTIONS,
  WET_FLOOR_OPTIONS,
  WET_WALL_BATHROOM_OPTIONS,
  WET_WALL_KITCHEN_OPTIONS,
  WINDOW_FRAME_OPTIONS,
  findLabel,
  getNormalizedSanitaryFixtures,
} from './finishesCatalog';

export interface QuantityItem {
  id: string;
  code: string;
  discipline:
    | 'Arquitetura'
    | 'Estrutura'
    | 'Elétrica'
    | 'Hidráulica'
    | 'Sanitária'
    | 'Louças e Metais'
    | 'Mobiliário'
    | 'Paisagismo';
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
  const sanFix = getNormalizedSanitaryFixtures(project);
  const rs = project.renderSettings;
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
  let totalInternalAlvenariaNetAreaM2 = 0;
  let totalInternalDrywallNetAreaM2 = 0;
  let totalDryFloorAreaM2 = 0;
  let totalWetFloorAreaM2 = 0;
  let totalWetWallTileM2 = 0;
  let totalPaintAreaM2 = 0;
  let totalCeilingAreaM2 = 0;
  let totalBaseboardM = 0;

  let totalEntryDoors = 0;
  let totalBedroomDoors = 0;
  let totalBathDoors = 0;
  let totalSlidingWindows = 0;
  let totalBalconySlidingDoors = 0;
  let totalVitros = 0;

  let totalMezzanineAreaM2 = 0;
  let totalMezzanineStairs = 0;
  let totalOutlets = 0;
  let totalSwitches = 0;
  let totalLuminaires = 0;
  let totalSpecialPoints = 0;
  let totalElectricalPoints = 0;
  let totalWaterPoints = 0;
  let totalDrainagePoints = 0;

  let totalToilets = 0;
  let totalWashbasins = 0;
  let totalKitchenSinks = 0;
  let totalLaundryTubs = 0;
  let totalShowers = 0;
  let totalDrainKits = 0;
  let totalRemainingFurniture = 0;

  const isWallDrywall = (w: UnitType['walls'][number], ut: UnitType): boolean => {
    if (w.isExternal) return false;
    const mat = (w.material || '').toLowerCase();
    return mat.includes('drywall') || mat.includes('gesso acartonado') || ut.internalPartitionType === 'drywall';
  };

  const isOpeningVitro = (op: UnitType['openings'][number]): boolean =>
    op.openingKind === 'vitro_basculante' ||
    op.openingKind === 'vitro_maxim_ar' ||
    op.openingKind === 'vitro_fixo' ||
    op.subtype.toLowerCase().includes('vitrô') ||
    op.subtype.toLowerCase().includes('basculante');

  const isOpeningBalconyDoor = (op: UnitType['openings'][number]): boolean =>
    (op.type === 'porta' && op.openingKind === 'porta_correr') ||
    op.subtype.toLowerCase().includes('varanda') ||
    op.subtype.toLowerCase().includes('sacada');

  const breakdownByUt = (fn: (ut: UnitType) => number): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const ut of project.unitTypes) {
      const qty = unitCounts.get(ut.id) ?? 0;
      if (qty > 0) out[ut.code] = round2(fn(ut) * qty);
    }
    return out;
  };

  const wallTouchesRoom = (w: UnitType['walls'][number], r: UnitType['rooms'][number]): boolean => {
    const minX = Math.min(w.start.x, w.end.x);
    const maxX = Math.max(w.start.x, w.end.x);
    const minY = Math.min(w.start.y, w.end.y);
    const maxY = Math.max(w.start.y, w.end.y);
    const tol = 0.22;
    const horiz = Math.abs(w.end.y - w.start.y) < 0.05;
    const vert = Math.abs(w.end.x - w.start.x) < 0.05;
    if (horiz) {
      const nearY = Math.abs(w.start.y - r.y) <= tol || Math.abs(w.start.y - (r.y + r.depth)) <= tol;
      const overlapX = Math.min(maxX, r.x + r.width) - Math.max(minX, r.x) > 0.25;
      return nearY && overlapX;
    }
    if (vert) {
      const nearX = Math.abs(w.start.x - r.x) <= tol || Math.abs(w.start.x - (r.x + r.width)) <= tol;
      const overlapY = Math.min(maxY, r.y + r.depth) - Math.max(minY, r.y) > 0.25;
      return nearX && overlapY;
    }
    return false;
  };

  for (const ut of project.unitTypes) {
    const count = unitCounts.get(ut.id) ?? 0;
    if (count === 0) continue;

    totalPrivateAreaM2 += ut.width * ut.depth * count;
    if (ut.hasMezzanine && ut.mezzanine?.enabled && ut.ceilingHeight >= 3.0) {
      totalMezzanineAreaM2 += round2(ut.mezzanine.width * ut.mezzanine.depth) * count;
    }
    totalMezzanineStairs += ut.furniture.filter((f) => f.category === 'escada').length * count;

    const openingAreaByWall = new Map<string, number>();
    const openingsByWall = new Map<string, UnitType['openings']>();
    for (const op of ut.openings) {
      const area = op.width * op.height;
      openingAreaByWall.set(op.wallId, (openingAreaByWall.get(op.wallId) ?? 0) + area);
      const list = openingsByWall.get(op.wallId) ?? [];
      list.push(op);
      openingsByWall.set(op.wallId, list);

      if (op.type === 'porta') {
        if (isOpeningBalconyDoor(op)) totalBalconySlidingDoors += count;
        else if (op.role === 'banheiro' || op.width <= 0.65) totalBathDoors += count;
        else if (op.role === 'quarto' || (op.width > 0.65 && op.width <= 0.75)) totalBedroomDoors += count;
        else totalEntryDoors += count;
      }
      if (op.type === 'janela') {
        if (isOpeningVitro(op)) totalVitros += count;
        else totalSlidingWindows += count;
      }
    }

    for (const w of ut.walls) {
      const len = getWallLength(w);
      const gross = len * w.height;
      const opArea = openingAreaByWall.get(w.id) ?? 0;
      const net = Math.max(0, gross - opArea);
      totalWallNetAreaM2 += net * count;
      if (w.isExternal) {
        totalExternalWallNetAreaM2 += net * count;
      } else if (isWallDrywall(w, ut)) {
        totalInternalDrywallNetAreaM2 += net * count;
      } else {
        totalInternalAlvenariaNetAreaM2 += net * count;
      }
    }

    for (const r of ut.rooms) {
      const area = getRoomArea(r);
      const perim = getRoomPerimeter(r);

      // Mezanino possui deck estrutural próprio e pé-direito compartilhado — não entra no forro nem no rodapé de alvenaria térrea
      if (r.category === 'mezanino') {
        continue;
      }

      const roomWalls = ut.walls.filter((w) => wallTouchesRoom(w, r));
      const roomOpenings = roomWalls.flatMap((w) => openingsByWall.get(w.id) ?? []);
      const roomDoorWidths = roomOpenings
        .filter((op) => op.type === 'porta')
        .reduce((s, op) => s + op.width, 0);
      const roomOpeningArea = roomOpenings.reduce((s, op) => s + op.width * op.height, 0);

      totalCeilingAreaM2 += area * count;

      if (r.category === 'banheiro') {
        totalWetFloorAreaM2 += area * count;
        const effectiveWallHeight = Math.min(r.ceilingHeight, ut.ceilingHeight);
        const wetWallNet = Math.max(0, perim * effectiveWallHeight - roomOpeningArea);
        totalWetWallTileM2 += wetWallNet * count;
        totalPaintAreaM2 += area * count; // pintura apenas no teto do BWC
      } else if (r.category === 'cozinha' || r.category === 'area_servico') {
        totalWetFloorAreaM2 += area * count;
        // Faixa hidráulica/bancada (aprox. 55% do perímetro com h=1,50m descontando janelas/portas no trecho)
        const splashNet = Math.max(0, perim * 0.55 * 1.5 - roomOpeningArea * 0.35);
        totalWetWallTileM2 += splashNet * count;
        totalPaintAreaM2 += (Math.max(0, perim * r.ceilingHeight - splashNet - roomOpeningArea * 0.65) + area) * count;
        totalBaseboardM += Math.max(0, perim - roomDoorWidths) * count;
      } else {
        totalDryFloorAreaM2 += area * count;
        totalPaintAreaM2 += (Math.max(0, perim * r.ceilingHeight - roomOpeningArea) + area) * count;
        if (r.category !== 'varanda') {
          totalBaseboardM += Math.max(0, perim - roomDoorWidths) * count;
        }
      }
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

    // Separação precisa entre louças/metais (LOU-01..06) e mobiliário restante (MOB-01)
    const utVaso = ut.furniture.filter((f) => f.category === 'vaso_sanitario').length;
    const utLav = ut.furniture.filter((f) => f.category === 'lavatorio').length;
    const utShower = ut.furniture.filter((f) => f.category === 'chuveiro').length;
    const utTanque = ut.furniture.filter((f) => f.category === 'tanque').length;
    const utKitchenSink = ut.furniture.filter(
      (f) => f.category === 'bancada' && !f.name.toLowerCase().includes('mesa'),
    ).length;
    const hasBathRoom = ut.rooms.some((r) => r.category === 'banheiro');
    const hasKitchenRoom = ut.rooms.some((r) => r.category === 'cozinha');
    const hasLaundryRoom = ut.rooms.some((r) => r.category === 'area_servico');

    totalToilets += Math.max(utVaso, hasBathRoom ? 1 : 0) * count;
    totalWashbasins += Math.max(utLav, hasBathRoom ? 1 : 0) * count;
    totalShowers += Math.max(utShower, hasBathRoom ? 1 : 0) * count;
    totalKitchenSinks += Math.max(utKitchenSink, hasKitchenRoom ? 1 : 0) * count;
    totalLaundryTubs += utTanque * count;
    totalDrainKits += (hasBathRoom ? 1 : 0) * count;

    const remainingFur = ut.furniture.filter(
      (f) =>
        f.category !== 'vaso_sanitario' &&
        f.category !== 'lavatorio' &&
        f.category !== 'chuveiro' &&
        f.category !== 'tanque' &&
        f.category !== 'escada' &&
        !(f.category === 'bancada' && !f.name.toLowerCase().includes('mesa')),
    ).length;
    totalRemainingFurniture += remainingFur * count;
  }

  const totalFloorAreaM2 = round2(totalDryFloorAreaM2 + totalWetFloorAreaM2);

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

  // Masonry blocks & plastering (chapisco/emboço/reboco)
  const isMasonry =
    project.constructionMethod.methodId === 'alvenaria_convencional' ||
    project.constructionMethod.methodId === 'alvenaria_estrutural';
  const masonryWallNetAreaM2 = totalExternalWallNetAreaM2 + totalInternalAlvenariaNetAreaM2;
  const blocksPerM2 = 25;
  const blockCount = isMasonry ? Math.ceil(masonryWallNetAreaM2 * blocksPerM2 * 1.1) : 0;
  const mortarVolumeM3 = isMasonry ? round2(masonryWallNetAreaM2 * 0.018 * 1.15) : 0;
  const plasterAreaM2 = isMasonry
    ? round2(Math.max(0, totalExternalWallNetAreaM2 * 2 + totalInternalAlvenariaNetAreaM2 * 2 - totalWetWallTileM2))
    : 0;

  const avgConduitPerPoint = 4.2;
  const totalConduitM = round2(totalElectricalPoints * avgConduitPerPoint);
  const totalWireM = round2(totalConduitM * 3.0);
  const totalWaterPipeM = round2(totalWaterPoints * 3.5);
  const totalDrainPipeM = round2(totalDrainagePoints * 2.8);

  const totalBuiltAreaM2 = round2(totalPrivateAreaM2 + totalCommonAreaM2);
  const groundFloor = project.floors[0];
  const groundFloorProjectionM2 = groundFloor
    ? round2(
        groundFloor.units.reduce((sum, inst) => {
          const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
          return sum + (ut ? ut.width * ut.depth : 0);
        }, 0) + (groundFloor.commonAreaM2 || 0),
      )
    : 0;
  const groundRoofPerimM = groundFloor
    ? round2(
        groundFloor.units.reduce((sum, inst) => {
          const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
          return sum + (ut ? 2 * (ut.width + ut.depth) : 0);
        }, 0) * 0.65,
      )
    : 0;
  const tapumeAreaM2 = totalUnits > 0 ? round2(Math.max(4, project.site.front) * 2.2) : 0;
  const foundationConcreteM3 = totalUnits > 0 ? round2(groundFloorProjectionM2 * 0.085) : 0;
  const waterproofingAreaM2 =
    totalUnits > 0 ? round2(totalWetFloorAreaM2 + groundFloorProjectionM2 * 0.35) : 0;

  const roofShape = rs.roofShape ?? 'platibanda';
  const roofShapeFactor =
    roofShape === 'duas_aguas'
      ? 1.16
      : roofShape === 'uma_agua'
        ? 1.12
        : roofShape === 'laje_plana'
          ? 1.05
          : 1.08;
  const roofAreaM2 = totalUnits > 0 ? round2(groundFloorProjectionM2 * roofShapeFactor) : 0;
  const hasRoofTruss =
    totalUnits > 0 && !(roofShape === 'laje_plana' && rs.roofMaterial === 'concreto_impermeabilizado');

  // Dynamic finish / fixture labels
  const floorDryLbl = findLabel(FLOOR_INTERNAL_OPTIONS, rs.floorMaterial);
  const floorWetLbl = findLabel(WET_FLOOR_OPTIONS, rs.wetFloorMaterial);
  const wallBathLbl = findLabel(WET_WALL_BATHROOM_OPTIONS, rs.wetWallBathroom);
  const wallKitchenLbl = findLabel(WET_WALL_KITCHEN_OPTIONS, rs.wetWallKitchen);
  const wallIntLbl = findLabel(WALL_INTERIOR_OPTIONS, rs.wallInteriorFinish);
  const wallExtLbl = findLabel(WALL_EXTERIOR_OPTIONS, rs.wallExteriorFinish);
  const ceilingLbl = findLabel(CEILING_OPTIONS, rs.ceilingType);
  const baseboardLbl = findLabel(BASEBOARD_OPTIONS, rs.baseboardType);
  const roofLbl = findLabel(ROOF_MATERIAL_OPTIONS, rs.roofMaterial);
  const frameLbl = findLabel(WINDOW_FRAME_OPTIONS, rs.windowFrameColor);
  const doorMatLbl = findLabel(INTERIOR_DOOR_OPTIONS, rs.interiorDoorMaterial);
  const glassLbl = findLabel(GLASS_TYPE_OPTIONS, rs.glassType);
  const metalsLbl = findLabel(METALS_FINISH_OPTIONS, sanFix.metalsFinish);
  const toiletLbl = findLabel(TOILET_OPTIONS, sanFix.toiletType);
  const wareColorLbl = findLabel(SANITARY_COLOR_OPTIONS, sanFix.sanitaryWareColor);
  const showerLbl = findLabel(SHOWER_OPTIONS, sanFix.showerType);
  const wbLbl = findLabel(WASHBASIN_OPTIONS, sanFix.washbasinType);
  const wbFaucetLbl = findLabel(WASHBASIN_FAUCET_OPTIONS, sanFix.washbasinFaucet);
  const kSinkLbl = findLabel(KITCHEN_SINK_OPTIONS, sanFix.kitchenSinkType);
  const kFaucetLbl = findLabel(KITCHEN_FAUCET_OPTIONS, sanFix.kitchenFaucet);
  const tubLbl = findLabel(LAUNDRY_TUB_OPTIONS, sanFix.laundryTubType);
  const drainLbl = findLabel(DRAIN_OPTIONS, sanFix.drainType);

  const extSurfaceAreaM2 = round2(
    (project.landscaping?.surfaceZones ?? []).reduce((s, z) => s + z.width * z.depth, 0),
  );
  const poolsAreaM2 = round2(
    (project.landscaping?.pools ?? []).reduce((s, p) => s + p.width * p.depth, 0),
  );
  const gourmetAreaM2 = round2(
    (project.landscaping?.gourmetAreas ?? []).reduce((s, g) => s + g.width * g.depth, 0),
  );
  const plantedUnitsCount = project.landscaping?.plants?.length ?? 0;

  const items: QuantityItem[] = [
    ...(totalUnits > 0
      ? [
          {
            id: 'q-pre-loc',
            code: 'PRE-01',
            discipline: 'Arquitetura' as const,
            description: 'Locação Convencional de Obra / Gabarito de Tábuas e Pontaletes',
            unit: 'm²',
            netQuantity: groundFloorProjectionM2,
            lossFactorPercent: 0,
            grossQuantity: groundFloorProjectionM2,
            measurementCriterion: 'Projeção da edificação no pavimento térreo (área privativa + comum)',
            sourceOrigin: 'Implantação do pavimento térreo sobre o terreno',
            calculationMemory: `Projeção térreo = ${groundFloorProjectionM2} m²`,
            unitTypeBreakdown: {},
          },
          {
            id: 'q-pre-tap',
            code: 'PRE-02',
            discipline: 'Arquitetura' as const,
            description: 'Tapume Provisório em Compensado 6mm + Placa de Obra e Ligações',
            unit: 'm²',
            netQuantity: tapumeAreaM2,
            lossFactorPercent: 5,
            grossQuantity: round2(tapumeAreaM2 * 1.05),
            measurementCriterion: 'Testada frontal do terreno × altura padrão 2,20m',
            sourceOrigin: 'Dimensão frontal do lote cadastrado',
            calculationMemory: `${project.site.front} m × 2,20 m = ${tapumeAreaM2} m²`,
            unitTypeBreakdown: {},
          },
          {
            id: 'q-fun-bald',
            code: 'FUN-01',
            discipline: 'Estrutura' as const,
            description: 'Infraestrutura / Vigas Baldrame e Sapatas (Estimativa Conceitual)',
            unit: 'm³',
            netQuantity: foundationConcreteM3,
            lossFactorPercent: 5,
            grossQuantity: round2(foundationConcreteM3 * 1.05),
            measurementCriterion: 'Estimativa conceitual de 0,085 m³/m² de projeção térrea (aguarda sondagem SPT)',
            sourceOrigin: 'Projeção da edificação no térreo',
            calculationMemory: `${groundFloorProjectionM2} m² × 0,085 m³/m² = ${foundationConcreteM3} m³`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    {
      id: 'q-conc',
      code: 'EST-01',
      discipline: 'Estrutura',
      description: 'Concreto Estrutural Conceitual (Lajes de Pavimento + Pilares modelados)',
      unit: 'm³',
      netQuantity: totalConcreteVolumeM3,
      lossFactorPercent: 5,
      grossQuantity: round2(totalConcreteVolumeM3 * 1.05),
      measurementCriterion: 'Volume geométrico de lajes (área × espessura) + pilares lançados (CONCEITUAL)',
      sourceOrigin: 'Pavimentos (espessura da laje) + Elementos Estruturais',
      calculationMemory: `Lajes (${slabVolumeM3} m³) + Pilares (${columnsVolumeM3} m³) = ${totalConcreteVolumeM3} m³`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-form',
      code: 'EST-02',
      discipline: 'Estrutura',
      description: 'Fôrmas de Concreto para Lajes e Pilares (Conceitual)',
      unit: 'm²',
      netQuantity: totalFormworkAreaM2,
      lossFactorPercent: 5,
      grossQuantity: round2(totalFormworkAreaM2 * 1.05),
      measurementCriterion: 'Fundo de lajes + faces laterais de pilares modelados',
      sourceOrigin: 'Geometria de pavimentos e pilares',
      calculationMemory: `Área total de fôrmas estimada = ${totalFormworkAreaM2} m²`,
      unitTypeBreakdown: {},
    },
    ...(totalMezzanineAreaM2 > 0
      ? (() => {
          const mezSample = project.unitTypes.find(
            (u) => u.hasMezzanine && u.mezzanine?.enabled && u.ceilingHeight >= 3.0,
          )?.mezzanine;
          const stLbl =
            mezSample?.structureType === 'madeira_estrutural'
              ? 'Estrutura em Madeira Estrutural + Deck'
              : mezSample?.structureType === 'steel_deck'
                ? 'Estrutura Metálica + Steel Deck'
                : mezSample?.structureType === 'concreto_armado'
                  ? 'Laje Concreto Armado'
                  : 'Estrutura Metálica + Deck Madeira';
          const elevTxt = mezSample ? ` · Cota +${mezSample.elevationM.toFixed(2)}m` : '';
          const pctTxt = mezSample ? ` (${Math.round(mezSample.coverageRatio * 100)}% área interna)` : '';
          return [
            {
              id: 'q-mezzanine',
              code: 'MEZ-01',
              discipline: 'Estrutura' as const,
              description: `Plataforma de Mezanino (${stLbl} + Guarda-Corpo h=1,05m${elevTxt})`,
              unit: 'm²',
              netQuantity: round2(totalMezzanineAreaM2),
              lossFactorPercent: 5,
              grossQuantity: round2(totalMezzanineAreaM2 * 1.05),
              measurementCriterion: `Área da plataforma 100% interna do mezanino${pctTxt} (não computado como pavimento)`,
              sourceOrigin: 'Mezaninos habilitados em tipologias com pé-direito >= 3,00m',
              calculationMemory: `Σ(A_mezanino × N_unid) = ${round2(totalMezzanineAreaM2)} m² (+5% = ${round2(totalMezzanineAreaM2 * 1.05)} m²) · ${stLbl}`,
              unitTypeBreakdown: breakdownByUt((ut) =>
                ut.hasMezzanine && ut.mezzanine?.enabled ? round2(ut.mezzanine.width * ut.mezzanine.depth) : 0,
              ),
            },
          ];
        })()
      : []),
    ...(totalMezzanineStairs > 0
      ? [
          {
            id: 'q-stairs',
            code: 'ESC-01',
            discipline: 'Estrutura' as const,
            description: 'Escada Interna Planejada p/ Mezanino c/ Corrimão (Blondel)',
            unit: 'un',
            netQuantity: totalMezzanineStairs,
            lossFactorPercent: 0,
            grossQuantity: totalMezzanineStairs,
            measurementCriterion: 'Contagem unitária de escadas planejadas de acesso ao mezanino',
            sourceOrigin: 'Mobiliário/circulação categoria escada nas tipologias',
            calculationMemory: `Contagem direta × N_unid = ${totalMezzanineStairs} un`,
            unitTypeBreakdown: breakdownByUt((ut) =>
              ut.furniture.filter((f) => f.category === 'escada').length,
            ),
          },
        ]
      : []),
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
    ...(totalInternalAlvenariaNetAreaM2 > 0
      ? [
          {
            id: 'q-wall-int',
            code: 'ARQ-02',
            discipline: 'Arquitetura' as const,
            description: `Paredes Internas Alvenaria (e=${Math.round(project.constructionMethod.internalWallThickness * 100)}cm)`,
            unit: 'm²',
            netQuantity: round2(totalInternalAlvenariaNetAreaM2),
            lossFactorPercent: 5,
            grossQuantity: round2(totalInternalAlvenariaNetAreaM2 * 1.05),
            measurementCriterion: 'Área líquida descontando portas internas (alvenaria)',
            sourceOrigin: 'Geometria direta das paredes internas em alvenaria',
            calculationMemory: `Σ(L_parede_int × H − A_vãos) × N_unid = ${round2(totalInternalAlvenariaNetAreaM2)} m²`,
            unitTypeBreakdown: breakdownByUt((ut) =>
              ut.walls.filter((w) => !w.isExternal && !isWallDrywall(w, ut)).reduce((s, w) => s + getWallLength(w) * w.height, 0),
            ),
          },
        ]
      : []),
    ...(totalInternalDrywallNetAreaM2 > 0
      ? [
          {
            id: 'q-wall-int-dry',
            code: 'ARQ-03',
            discipline: 'Arquitetura' as const,
            description: 'Divisórias Internas Drywall Gesso Acartonado ST/RU (9,5cm) + Lã Mineral',
            unit: 'm²',
            netQuantity: round2(totalInternalDrywallNetAreaM2),
            lossFactorPercent: 5,
            grossQuantity: round2(totalInternalDrywallNetAreaM2 * 1.05),
            measurementCriterion: 'Área líquida de chapas e montantes descontando portas internas',
            sourceOrigin: 'Geometria direta das paredes internas configuradas em Drywall',
            calculationMemory: `Σ(L_drywall × H − A_vãos) × N_unid = ${round2(totalInternalDrywallNetAreaM2)} m²`,
            unitTypeBreakdown: breakdownByUt((ut) =>
              ut.walls.filter((w) => !w.isExternal && isWallDrywall(w, ut)).reduce((s, w) => s + getWallLength(w) * w.height, 0),
            ),
          },
        ]
      : []),
    ...(isMasonry && masonryWallNetAreaM2 > 0
      ? [
          {
            id: 'q-blocks',
            code: 'ALV-01',
            discipline: 'Arquitetura' as const,
            description: `Blocos/Tijolos (${project.constructionMethod.masonryBlockType ?? '19x19cm'})`,
            unit: 'un',
            netQuantity: Math.ceil(masonryWallNetAreaM2 * blocksPerM2),
            lossFactorPercent: 10,
            grossQuantity: blockCount,
            measurementCriterion: `Consumo nominal ${blocksPerM2} un/m² (somente paredes em alvenaria) + 10% quebra`,
            sourceOrigin: 'Área líquida de alvenaria (exclui Drywall) × coeficiente nominal',
            calculationMemory: `${round2(masonryWallNetAreaM2)} m² × ${blocksPerM2} un/m² × 1,10 = ${blockCount} un`,
            unitTypeBreakdown: {},
          },
          {
            id: 'q-mortar',
            code: 'ALV-02',
            discipline: 'Arquitetura' as const,
            description: 'Argamassa de Assentamento',
            unit: 'm³',
            netQuantity: round2(masonryWallNetAreaM2 * 0.018),
            lossFactorPercent: 15,
            grossQuantity: mortarVolumeM3,
            measurementCriterion: 'Consumo estimado 0,018 m³/m² (junta 1,0–1,5cm) + 15% perda',
            sourceOrigin: 'Área líquida de alvenaria (exclui Drywall)',
            calculationMemory: `${round2(masonryWallNetAreaM2)} m² × 0,018 m³/m² × 1,15 = ${mortarVolumeM3} m³`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(totalUnits > 0
      ? [
          {
            id: 'q-slab-top',
            code: 'EST-03',
            discipline: 'Estrutura' as const,
            description: 'Laje de Cobertura Superior (Sob o Telhado / Apoio do Castelo Caixa d’Água)',
            unit: 'm²',
            netQuantity: groundFloorProjectionM2,
            lossFactorPercent: 5,
            grossQuantity: round2(groundFloorProjectionM2 * 1.05),
            measurementCriterion: 'Projeção da cobertura sobre o último pavimento habitável',
            sourceOrigin: 'Projeção das unidades no pavimento tipo/superior',
            calculationMemory: `Projeção laje superior = ${groundFloorProjectionM2} m²`,
            unitTypeBreakdown: {},
          },
          {
            id: 'q-cob-roof',
            code: 'COB-01',
            discipline: 'Arquitetura' as const,
            description: `Cobertura ${roofShape.replace(/_/g, ' ')} — ${roofLbl}`,
            unit: 'm²',
            netQuantity: roofAreaM2,
            lossFactorPercent: 5,
            grossQuantity: round2(roofAreaM2 * 1.05),
            measurementCriterion: `Projeção da edificação no térreo × ${roofShapeFactor} (formato ${roofShape.replace(/_/g, ' ')})`,
            sourceOrigin: 'Especificação de cobertura + formato e inclinação do telhado',
            calculationMemory: `${groundFloorProjectionM2} m² × ${roofShapeFactor} = ${roofAreaM2} m² (${roofLbl})`,
            unitTypeBreakdown: {},
          },
          ...(hasRoofTruss
            ? [
                {
                  id: 'q-cob-truss',
                  code: 'COB-02',
                  discipline: 'Estrutura' as const,
                  description: 'Estrutura de Cobertura (Trama Metálica / Enmadeiramento de Telhado)',
                  unit: 'm²',
                  netQuantity: groundFloorProjectionM2,
                  lossFactorPercent: 5,
                  grossQuantity: round2(groundFloorProjectionM2 * 1.05),
                  measurementCriterion: 'Área de projeção coberta por tesouras/terças de apoio das telhas',
                  sourceOrigin: 'Projeção da laje de cobertura superior',
                  calculationMemory: `Projeção estrutura = ${groundFloorProjectionM2} m²`,
                  unitTypeBreakdown: {},
                },
              ]
            : []),
          {
            id: 'q-cob-gutter',
            code: 'COB-03',
            discipline: 'Arquitetura' as const,
            description: 'Calhas, Rufos e Pingadeiras em Chapa Galvanizada Pintada',
            unit: 'm',
            netQuantity: groundRoofPerimM,
            lossFactorPercent: 8,
            grossQuantity: round2(groundRoofPerimM * 1.08),
            measurementCriterion: 'Perímetro exposto de beiral/platibanda para captação pluvial',
            sourceOrigin: 'Perímetro dos blocos implantados',
            calculationMemory: `Perímetro estimado de calhas/rufos = ${groundRoofPerimM} m`,
            unitTypeBreakdown: {},
          },
          {
            id: 'q-imp-wet',
            code: 'IMP-01',
            discipline: 'Arquitetura' as const,
            description: 'Impermeabilização de Áreas Molhadas, Laje Superior e Baldrames',
            unit: 'm²',
            netQuantity: waterproofingAreaM2,
            lossFactorPercent: 5,
            grossQuantity: round2(waterproofingAreaM2 * 1.05),
            measurementCriterion: 'Pisos de BWC/Cozinha/A.S. + faixa de 35% da projeção térrea nos baldrames/laje',
            sourceOrigin: 'Ambientes molhados das tipologias e projeção térrea',
            calculationMemory: `${round2(totalWetFloorAreaM2)} m² (molhados) + ${round2(groundFloorProjectionM2 * 0.35)} m² (baldrames/laje) = ${waterproofingAreaM2} m²`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(totalEntryDoors > 0
      ? [
          {
            id: 'q-doors-entry',
            code: 'ESQ-01A',
            discipline: 'Arquitetura' as const,
            description: `Portas de Entrada Social 0,80×2,10m (${doorMatLbl})`,
            unit: 'un',
            netQuantity: totalEntryDoors,
            lossFactorPercent: 0,
            grossQuantity: totalEntryDoors,
            measurementCriterion: 'Contagem direta das portas de acesso principal das unidades',
            sourceOrigin: 'Aberturas P1/Entrada nas tipologias',
            calculationMemory: `Contagem direta × N_unid = ${totalEntryDoors} un`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(totalBedroomDoors > 0
      ? [
          {
            id: 'q-doors-bed',
            code: 'ESQ-01B',
            discipline: 'Arquitetura' as const,
            description: `Portas Internas de Dormitório 0,70×2,10m (${doorMatLbl})`,
            unit: 'un',
            netQuantity: totalBedroomDoors,
            lossFactorPercent: 0,
            grossQuantity: totalBedroomDoors,
            measurementCriterion: 'Contagem direta das portas internas de quartos',
            sourceOrigin: 'Aberturas de dormitório nas tipologias',
            calculationMemory: `Contagem direta × N_unid = ${totalBedroomDoors} un`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(totalBathDoors > 0
      ? [
          {
            id: 'q-doors-bath',
            code: 'ESQ-01C',
            discipline: 'Arquitetura' as const,
            description: `Portas Internas de Banheiro 0,60×2,10m (${doorMatLbl})`,
            unit: 'un',
            netQuantity: totalBathDoors,
            lossFactorPercent: 0,
            grossQuantity: totalBathDoors,
            measurementCriterion: 'Contagem direta das portas de BWC com trinco privativo',
            sourceOrigin: 'Aberturas de banheiro nas tipologias',
            calculationMemory: `Contagem direta × N_unid = ${totalBathDoors} un`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(totalSlidingWindows > 0
      ? [
          {
            id: 'q-windows',
            code: 'ESQ-02A',
            discipline: 'Arquitetura' as const,
            description: `Janelas de Correr (${frameLbl} + ${glassLbl})`,
            unit: 'un',
            netQuantity: totalSlidingWindows,
            lossFactorPercent: 0,
            grossQuantity: totalSlidingWindows,
            measurementCriterion: 'Contagem unitária de janelas de correr nas salas/dormitórios/cozinha',
            sourceOrigin: 'Aberturas tipo janela padrão',
            calculationMemory: `Contagem direta × N_unid = ${totalSlidingWindows} un`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(totalBalconySlidingDoors > 0
      ? [
          {
            id: 'q-balcony-doors',
            code: 'ESQ-02B',
            discipline: 'Arquitetura' as const,
            description: `Portas-Janela de Correr p/ Varanda (${frameLbl} + ${glassLbl})`,
            unit: 'un',
            netQuantity: totalBalconySlidingDoors,
            lossFactorPercent: 0,
            grossQuantity: totalBalconySlidingDoors,
            measurementCriterion: 'Contagem unitária de portas de correr de acesso à varanda',
            sourceOrigin: 'Aberturas de varanda nas tipologias',
            calculationMemory: `Contagem direta × N_unid = ${totalBalconySlidingDoors} un`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(totalVitros > 0
      ? [
          {
            id: 'q-vitros',
            code: 'ESQ-03',
            discipline: 'Arquitetura' as const,
            description: `Vitrôs Basculantes / Maxim-Ar BWC (${frameLbl} + ${glassLbl})`,
            unit: 'un',
            netQuantity: totalVitros,
            lossFactorPercent: 0,
            grossQuantity: totalVitros,
            measurementCriterion: 'Contagem unitária de vitrôs basculantes/maxim-ar',
            sourceOrigin: 'Aberturas classificadas como vitrô nas paredes',
            calculationMemory: `Contagem direta × N_unid = ${totalVitros} un`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
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
      description: 'Interruptores Simples e Paralelos',
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
      description: 'Pontos de Iluminação / Luminárias LED',
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
    ...(totalUnits > 0
      ? [
          {
            id: 'q-hid-tower',
            code: 'HID-03',
            discipline: 'Hidráulica' as const,
            description: 'Castelo Técnico e Reservatório Superior (Barrilete, Extravasor e Boia)',
            unit: 'un',
            netQuantity: 1,
            lossFactorPercent: 0,
            grossQuantity: 1,
            measurementCriterion: 'Conjunto técnico de reservação superior dimensionado pela população total',
            sourceOrigin: 'Laje de cobertura / dimensionamento hidráulico',
            calculationMemory: '1 conjunto de reservatório superior sobre laje técnica',
            unitTypeBreakdown: {},
          },
        ]
      : []),
    {
      id: 'q-san-pts',
      code: 'SAN-01',
      discipline: 'Sanitária',
      description: `Pontos e Caixas Sifonadas Sanitárias (${drainLbl})`,
      unit: 'pt',
      netQuantity: totalDrainagePoints,
      lossFactorPercent: 0,
      grossQuantity: totalDrainagePoints,
      measurementCriterion: 'Contagem direta da rede sanitária modelada',
      sourceOrigin: 'Módulo Sanitário e Esgoto',
      calculationMemory: `${totalDrainagePoints} elementos sanitários (${drainLbl})`,
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
    ...(totalFloorAreaM2 > 0
      ? [
          {
            id: 'q-contrapiso',
            code: 'REV-00',
            discipline: 'Arquitetura' as const,
            description: 'Contrapiso Regularizado Argamassa 1:4 e=3cm (Áreas Secas e Molhadas)',
            unit: 'm²',
            netQuantity: totalFloorAreaM2,
            lossFactorPercent: 5,
            grossQuantity: round2(totalFloorAreaM2 * 1.05),
            measurementCriterion: 'Soma das áreas úteis de piso interno (exclui deck de mezanino)',
            sourceOrigin: 'Cadastro geométrico de ambientes',
            calculationMemory: `${round2(totalDryFloorAreaM2)} m² (seco) + ${round2(totalWetFloorAreaM2)} m² (molhado) = ${totalFloorAreaM2} m²`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(totalDryFloorAreaM2 > 0
      ? [
          {
            id: 'q-floor-dry',
            code: 'REV-01A',
            discipline: 'Arquitetura' as const,
            description: `Piso Interno Áreas Secas — ${floorDryLbl}`,
            unit: 'm²',
            netQuantity: round2(totalDryFloorAreaM2),
            lossFactorPercent: 10,
            grossQuantity: round2(totalDryFloorAreaM2 * 1.1),
            measurementCriterion: 'Área útil de sala, dormitório e circulação (exclui deck de mezanino) + 10% cortes',
            sourceOrigin: 'Ambientes secos das tipologias',
            calculationMemory: `Σ(A_seco) × N_unid = ${round2(totalDryFloorAreaM2)} m² (+10% = ${round2(totalDryFloorAreaM2 * 1.1)} m²)`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(totalWetFloorAreaM2 > 0
      ? [
          {
            id: 'q-floor-wet',
            code: 'REV-01B',
            discipline: 'Arquitetura' as const,
            description: `Piso Áreas Molhadas — ${floorWetLbl}`,
            unit: 'm²',
            netQuantity: round2(totalWetFloorAreaM2),
            lossFactorPercent: 10,
            grossQuantity: round2(totalWetFloorAreaM2 * 1.1),
            measurementCriterion: 'Área útil de BWC, cozinha e área de serviço + 10% cortes',
            sourceOrigin: 'Ambientes molhados das tipologias',
            calculationMemory: `Σ(A_molhado) × N_unid = ${round2(totalWetFloorAreaM2)} m² (+10% = ${round2(totalWetFloorAreaM2 * 1.1)} m²)`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    {
      id: 'q-tile-wall',
      code: 'REV-02',
      discipline: 'Arquitetura',
      description: `Revestimento Parede Molhada (BWC: ${wallBathLbl} / Coz: ${wallKitchenLbl})`,
      unit: 'm²',
      netQuantity: round2(totalWetWallTileM2),
      lossFactorPercent: 10,
      grossQuantity: round2(totalWetWallTileM2 * 1.1),
      measurementCriterion: 'BWC até o teto e Cozinha/A.S. faixa 1,50m descontando os vãos reais de portas/vitrôs',
      sourceOrigin: 'Paredes delimitadoras de BWC/Cozinha/A.S. e respectivas esquadrias',
      calculationMemory: `Área líquida real descontando esquadrias = ${round2(totalWetWallTileM2)} m²`,
      unitTypeBreakdown: {},
    },
    ...(plasterAreaM2 > 0
      ? [
          {
            id: 'q-plaster',
            code: 'REV-03',
            discipline: 'Arquitetura' as const,
            description: 'Chapisco + Emboço / Reboco Massa Única (Paredes em Alvenaria)',
            unit: 'm²',
            netQuantity: plasterAreaM2,
            lossFactorPercent: 5,
            grossQuantity: round2(plasterAreaM2 * 1.05),
            measurementCriterion: '2 faces das paredes de alvenaria líquidas menos área com revestimento cerâmico',
            sourceOrigin: 'Paredes em alvenaria (exclui Drywall)',
            calculationMemory: `Área líquida reboco = ${plasterAreaM2} m²`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    {
      id: 'q-ceiling',
      code: 'FOR-01',
      discipline: 'Arquitetura',
      description: `Forro / Acabamento de Teto — ${ceilingLbl}`,
      unit: 'm²',
      netQuantity: round2(totalCeilingAreaM2),
      lossFactorPercent: 5,
      grossQuantity: round2(totalCeilingAreaM2 * 1.05),
      measurementCriterion: 'Projeção dos ambientes principais (exclui sobreposição de mezanino)',
      sourceOrigin: 'Áreas úteis dos ambientes (exceto mezanino)',
      calculationMemory: `Σ(A_teto_real) = ${round2(totalCeilingAreaM2)} m²`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-baseboard',
      code: 'ROD-01',
      discipline: 'Arquitetura',
      description: `Rodapés — ${baseboardLbl}`,
      unit: 'm',
      netQuantity: round2(totalBaseboardM),
      lossFactorPercent: 8,
      grossQuantity: round2(totalBaseboardM * 1.08),
      measurementCriterion: 'Perímetro dos ambientes secos/cozinha (exclui BWC, varanda e mezanino) descontando vãos reais de portas',
      sourceOrigin: 'Perímetro dos ambientes e aberturas vinculadas',
      calculationMemory: `Σ(P_ambiente − L_portas_reais) = ${round2(totalBaseboardM)} m`,
      unitTypeBreakdown: {},
    },
    {
      id: 'q-paint',
      code: 'PIN-01',
      discipline: 'Arquitetura',
      description: `Pintura / Acabamento Interno Paredes e Tetos — ${wallIntLbl}`,
      unit: 'm²',
      netQuantity: round2(totalPaintAreaM2),
      lossFactorPercent: 5,
      grossQuantity: round2(totalPaintAreaM2 * 1.05),
      measurementCriterion: 'Paredes secas descontando esquadrias e faixas cerâmicas + tetos',
      sourceOrigin: 'Ambientes internos das tipologias',
      calculationMemory: `Área líquida pintura interna = ${round2(totalPaintAreaM2)} m²`,
      unitTypeBreakdown: {},
    },
    ...(totalExternalWallNetAreaM2 > 0
      ? [
          {
            id: 'q-paint-ext',
            code: 'PIN-02',
            discipline: 'Arquitetura' as const,
            description: `Acabamento de Fachada Externa — ${wallExtLbl}`,
            unit: 'm²',
            netQuantity: round2(totalExternalWallNetAreaM2),
            lossFactorPercent: 5,
            grossQuantity: round2(totalExternalWallNetAreaM2 * 1.05),
            measurementCriterion: 'Área líquida de fachada externa descontando janelas e portas',
            sourceOrigin: 'Paredes externas das unidades',
            calculationMemory: `Σ(A_fachada_ext − A_vãos) = ${round2(totalExternalWallNetAreaM2)} m²`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(totalToilets > 0
      ? [
          {
            id: 'q-lou-toilet',
            code: 'LOU-01',
            discipline: 'Louças e Metais' as const,
            description: `Bacia Sanitária — ${toiletLbl} (Cor: ${wareColorLbl})`,
            unit: 'un',
            netQuantity: totalToilets,
            lossFactorPercent: 0,
            grossQuantity: totalToilets,
            measurementCriterion: '1 conjunto completo instalado por banheiro das unidades',
            sourceOrigin: 'Catálogo de Louças e Metais + banheiros',
            calculationMemory: `${totalToilets} conjunto(s) completos`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(totalWashbasins > 0
      ? [
          {
            id: 'q-lou-basin',
            code: 'LOU-02',
            discipline: 'Louças e Metais' as const,
            description: `Lavatório c/ Bancada e Torneira — ${wbLbl} + ${wbFaucetLbl} (${metalsLbl})`,
            unit: 'un',
            netQuantity: totalWashbasins,
            lossFactorPercent: 0,
            grossQuantity: totalWashbasins,
            measurementCriterion: '1 conjunto de lavatório + torneira por banheiro',
            sourceOrigin: 'Catálogo de Louças e Metais + banheiros',
            calculationMemory: `${totalWashbasins} conjunto(s) completos`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(totalKitchenSinks > 0
      ? [
          {
            id: 'q-lou-kitchen',
            code: 'LOU-03',
            discipline: 'Louças e Metais' as const,
            description: `Pia / Bancada de Cozinha — ${kSinkLbl} + ${kFaucetLbl} (${metalsLbl})`,
            unit: 'un',
            netQuantity: totalKitchenSinks,
            lossFactorPercent: 0,
            grossQuantity: totalKitchenSinks,
            measurementCriterion: '1 conjunto bancada + cuba + torneira por cozinha',
            sourceOrigin: 'Catálogo de Louças e Metais + cozinhas',
            calculationMemory: `${totalKitchenSinks} conjunto(s) completos`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(totalLaundryTubs > 0
      ? [
          {
            id: 'q-lou-tub',
            code: 'LOU-04',
            discipline: 'Louças e Metais' as const,
            description: `Tanque de Serviço — ${tubLbl} (Metais: ${metalsLbl})`,
            unit: 'un',
            netQuantity: totalLaundryTubs,
            lossFactorPercent: 0,
            grossQuantity: totalLaundryTubs,
            measurementCriterion: '1 tanque instalado por unidade com área de serviço',
            sourceOrigin: 'Catálogo de Louças e Metais + área de serviço',
            calculationMemory: `${totalLaundryTubs} unidade(s)`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(totalShowers > 0
      ? [
          {
            id: 'q-lou-shower',
            code: 'LOU-05',
            discipline: 'Louças e Metais' as const,
            description: `Chuveiro / Ducha — ${showerLbl} (Acabamento: ${metalsLbl})`,
            unit: 'un',
            netQuantity: totalShowers,
            lossFactorPercent: 0,
            grossQuantity: totalShowers,
            measurementCriterion: '1 conjunto chuveiro/ducha + registro de pressão por banheiro',
            sourceOrigin: 'Catálogo de Louças e Metais + banheiros',
            calculationMemory: `${totalShowers} unidade(s)`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(totalDrainKits > 0
      ? [
          {
            id: 'q-lou-drain',
            code: 'LOU-06',
            discipline: 'Louças e Metais' as const,
            description: `Ralo BWC & Kit Metais — ${drainLbl} (${metalsLbl})`,
            unit: 'un',
            netQuantity: totalDrainKits,
            lossFactorPercent: 0,
            grossQuantity: totalDrainKits,
            measurementCriterion: 'Kit ralo + acabamentos de registro + acessórios por banheiro',
            sourceOrigin: 'Catálogo de Louças e Metais + banheiros',
            calculationMemory: `${totalDrainKits} kit(s)`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(totalRemainingFurniture > 0
      ? [
          {
            id: 'q-mob-pts',
            code: 'MOB-01',
            discipline: 'Mobiliário' as const,
            description: 'Mobiliário Fixo & Itens Complementares (Box Vidro, Armários, Camas, Sofá, Cooktop)',
            unit: 'un',
            netQuantity: totalRemainingFurniture,
            lossFactorPercent: 0,
            grossQuantity: totalRemainingFurniture,
            measurementCriterion: 'Itens de layout excluindo louças/metais já discriminados em LOU-01..06',
            sourceOrigin: 'Planta Baixa 2D & Mobiliário Paramétrico',
            calculationMemory: `${totalRemainingFurniture} itens mobiliário/equipamentos nas unidades`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(extSurfaceAreaM2 > 0
      ? [
          {
            id: 'q-ext-paving',
            code: 'EXT-01',
            discipline: 'Paisagismo' as const,
            description: 'Pisos Externos (Antiderrapante / Paver / Brita / Areia / Deck / Cimento Queimado)',
            unit: 'm²',
            netQuantity: extSurfaceAreaM2,
            lossFactorPercent: 8,
            grossQuantity: round2(extSurfaceAreaM2 * 1.08),
            measurementCriterion: 'Soma das zonas de piso externo no módulo Terreno & Paisagismo',
            sourceOrigin: 'Zonas de piso externo modeladas no terreno',
            calculationMemory: `Σ(A_zona_externa) = ${extSurfaceAreaM2} m² (+8% = ${round2(extSurfaceAreaM2 * 1.08)} m²)`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(poolsAreaM2 > 0
      ? [
          {
            id: 'q-pai-pool',
            code: 'PAI-01',
            discipline: 'Paisagismo' as const,
            description: 'Piscina c/ Filtragem, Revestimento e Borda Térmica',
            unit: 'm²',
            netQuantity: poolsAreaM2,
            lossFactorPercent: 0,
            grossQuantity: poolsAreaM2,
            measurementCriterion: 'Área em projeção horizontal de espelho d’água da(s) piscina(s)',
            sourceOrigin: 'Piscinas implantadas no módulo Terreno & Paisagismo',
            calculationMemory: `${project.landscaping?.pools.length ?? 0} piscina(s) = ${poolsAreaM2} m²`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(gourmetAreaM2 > 0
      ? [
          {
            id: 'q-pai-gourmet',
            code: 'PAI-02',
            discipline: 'Paisagismo' as const,
            description: 'Área Gourmet c/ Pergolado, Churrasqueira e Bancada',
            unit: 'm²',
            netQuantity: gourmetAreaM2,
            lossFactorPercent: 0,
            grossQuantity: gourmetAreaM2,
            measurementCriterion: 'Área de projeção das áreas gourmet equipadas',
            sourceOrigin: 'Áreas gourmet cadastradas no módulo Paisagismo',
            calculationMemory: `${project.landscaping?.gourmetAreas.length ?? 0} área(s) gourmet = ${gourmetAreaM2} m²`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
    ...(plantedUnitsCount > 0
      ? [
          {
            id: 'q-pai-plants',
            code: 'PAI-03',
            discipline: 'Paisagismo' as const,
            description: 'Mudas Botânicas, Árvores Frutíferas, Palmeiras e Arbustos',
            unit: 'un',
            netQuantity: plantedUnitsCount,
            lossFactorPercent: 5,
            grossQuantity: Math.ceil(plantedUnitsCount * 1.05),
            measurementCriterion: 'Contagem direta de espécies vegetais locadas no jardim (+5% reposição)',
            sourceOrigin: 'Catálogo botânico no módulo Terreno & Paisagismo',
            calculationMemory: `${plantedUnitsCount} espécies locadas`,
            unitTypeBreakdown: {},
          },
        ]
      : []),
  ];

  return {
    items,
    summary: {
      totalUnits,
      totalPrivateAreaM2: round2(totalPrivateAreaM2),
      totalCommonAreaM2: round2(totalCommonAreaM2),
      totalBuiltAreaM2,
      totalWallNetAreaM2: round2(totalWallNetAreaM2),
      totalFloorAreaM2,
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
  const regime = project.budgetSettings.sinapiRegime;
  const autoApplySinapi = regime === 'desonerado' || regime === 'nao_desonerado';

  const synced: BudgetEntry[] = quantities.items.map((q) => {
    const prev = existingByCode.get(q.code);
    const sinapiRef = getDynamicSinapiRJItem(q.code, project);
    const prevWasAutoSinapi = Boolean(prev?.supplier && prev.supplier.startsWith('SINAPI-RJ'));
    const shouldFillSinapiPrice =
      autoApplySinapi &&
      Boolean(sinapiRef) &&
      (!prev || prev.unitPrice === null || prevWasAutoSinapi);

    const unitPrice = shouldFillSinapiPrice && sinapiRef
      ? regime === 'desonerado'
        ? sinapiRef.priceDesoneradoRJ
        : sinapiRef.priceNaoDesoneradoRJ
      : (prev?.unitPrice ?? null);

    const supplier = shouldFillSinapiPrice
      ? regime === 'desonerado'
        ? 'SINAPI-RJ Deson.'
        : 'SINAPI-RJ S/Des.'
      : (prev?.supplier ?? '');

    const sourceBase = shouldFillSinapiPrice && sinapiRef
      ? `SINAPI-RJ ${sinapiRef.sinapiCode}`
      : (prev?.sourceBase ?? project.budgetSettings.sourceBase);

    return {
      id: prev?.id ?? `bdg-${q.code}`,
      code: q.code,
      sinapiCode: sinapiRef?.sinapiCode ?? prev?.sinapiCode,
      description: prevWasAutoSinapi || !prev ? q.description : prev.description,
      discipline: q.discipline,
      category: prev?.category ?? sinapiRef?.category ?? 'servico',
      unit: q.unit,
      quantity: q.netQuantity,
      unitPrice,
      lossFactorPercent: prev?.lossFactorPercent ?? q.lossFactorPercent,
      supplier,
      sourceBase,
      notes: shouldFillSinapiPrice && sinapiRef ? sinapiRef.sinapiDescription : (prev?.notes ?? sinapiRef?.sinapiDescription ?? ''),
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

export interface AnalyticalStageSummary {
  stageName: ConstructionStageName;
  itemsCount: number;
  materialTotal: number;
  laborTotal: number;
  directTotal: number;
  withBdiTotal: number;
  sharePercent: number;
}

export interface AnalyticalBudgetDetails {
  totalMaterialCost: number;
  totalLaborCost: number;
  socialChargesRatePercent: number;
  socialChargesImpliedValue: number;
  stageSummaries: AnalyticalStageSummary[];
  lineDetails: Array<{
    code: string;
    stageName: ConstructionStageName;
    materialUnitPrice: number | null;
    laborUnitPrice: number | null;
    materialSubtotal: number | null;
    laborSubtotal: number | null;
    sharePercent: number;
  }>;
}

export function calculateAnalyticalBreakdown(
  budget: BudgetSummaryReport,
  project: Project,
): AnalyticalBudgetDetails {
  const bdiMultiplier =
    (1 + (project.budgetSettings.indirectCostsPercent || 0) / 100) *
    (1 + (project.budgetSettings.bdiPercent || 0) / 100) *
    (1 - (project.budgetSettings.discountPercent || 0) / 100);

  const stageMap = new Map<
    ConstructionStageName,
    { itemsCount: number; materialTotal: number; laborTotal: number; directTotal: number }
  >();

  let totalMaterialCost = 0;
  let totalLaborCost = 0;

  const lineDetails = budget.lines.map((line) => {
    const ref = getDynamicSinapiRJItem(line.code, project);
    const stageName: ConstructionStageName =
      ref?.stageGroup ?? '10. Louças, Metais, Bancadas e Paisagismo';
    const matRatio =
      ref?.materialRatio ?? (line.category === 'material' ? 1 : line.category === 'equipamento' ? 0.75 : 0.55);

    const materialUnitPrice = line.unitPrice !== null ? round2(line.unitPrice * matRatio) : null;
    const laborUnitPrice = line.unitPrice !== null ? round2(line.unitPrice - (materialUnitPrice ?? 0)) : null;
    const materialSubtotal = line.subtotal !== null ? round2(line.subtotal * matRatio) : null;
    const laborSubtotal = line.subtotal !== null ? round2(line.subtotal - (materialSubtotal ?? 0)) : null;
    const sharePercent =
      budget.directTotalCost > 0 && line.subtotal !== null
        ? round2((line.subtotal / budget.directTotalCost) * 100)
        : 0;

    if (materialSubtotal !== null && laborSubtotal !== null && line.subtotal !== null) {
      totalMaterialCost += materialSubtotal;
      totalLaborCost += laborSubtotal;
      const cur = stageMap.get(stageName) ?? {
        itemsCount: 0,
        materialTotal: 0,
        laborTotal: 0,
        directTotal: 0,
      };
      cur.itemsCount += 1;
      cur.materialTotal = round2(cur.materialTotal + materialSubtotal);
      cur.laborTotal = round2(cur.laborTotal + laborSubtotal);
      cur.directTotal = round2(cur.directTotal + line.subtotal);
      stageMap.set(stageName, cur);
    }

    return {
      code: line.code,
      stageName,
      materialUnitPrice,
      laborUnitPrice,
      materialSubtotal,
      laborSubtotal,
      sharePercent,
    };
  });

  const stageOrderIndex = new Map(CONSTRUCTION_STAGE_ORDER.map((s, idx) => [s, idx]));
  const stageSummaries: AnalyticalStageSummary[] = Array.from(stageMap.entries())
    .sort((a, b) => (stageOrderIndex.get(a[0]) ?? 99) - (stageOrderIndex.get(b[0]) ?? 99))
    .map(([stageName, st]) => ({
      stageName,
      itemsCount: st.itemsCount,
      materialTotal: st.materialTotal,
      laborTotal: st.laborTotal,
      directTotal: st.directTotal,
      withBdiTotal: round2(st.directTotal * bdiMultiplier),
      sharePercent:
        budget.directTotalCost > 0 ? round2((st.directTotal / budget.directTotalCost) * 100) : 0,
    }));

  const regime = project.budgetSettings.sinapiRegime;
  const socialChargesRatePercent =
    project.budgetSettings.socialChargesPercent ??
    (regime === 'nao_desonerado'
      ? SINAPI_RJ_METADATA.encargosNaoDesoneradoPercent
      : SINAPI_RJ_METADATA.encargosDesoneradoPercent);

  const laborBaseWithoutCharges =
    totalLaborCost > 0 ? round2(totalLaborCost / (1 + socialChargesRatePercent / 100)) : 0;
  const socialChargesImpliedValue = round2(Math.max(0, totalLaborCost - laborBaseWithoutCharges));

  return {
    totalMaterialCost: round2(totalMaterialCost),
    totalLaborCost: round2(totalLaborCost),
    socialChargesRatePercent,
    socialChargesImpliedValue,
    stageSummaries,
    lineDetails,
  };
}

export interface ScheduleStageRow {
  code: string;
  name: string;
  weightPercent: number;
  startMonth: number;
  endMonth: number;
  totalValue: number;
  monthlyValues: number[];
}

export interface ConstructionScheduleReport {
  months: number;
  stages: ScheduleStageRow[];
  monthlyTotals: number[];
  monthlyPercents: number[];
  cumulativeTotals: number[];
  cumulativePercents: number[];
}

export function buildConstructionSchedule(
  grandTotalCost: number,
  requestedMonths = 6,
): ConstructionScheduleReport {
  const months = Math.max(2, Math.min(24, Math.round(requestedMonths) || 6));
  const stageDefs = [
    { code: 'ET-01', name: 'Serviços Preliminares e Locação', weight: 0.06, startRatio: 0.0, endRatio: 0.18 },
    { code: 'ET-02', name: 'Infraestrutura e Fundações', weight: 0.13, startRatio: 0.08, endRatio: 0.34 },
    { code: 'ET-03', name: 'Superestrutura e Lajes', weight: 0.21, startRatio: 0.2, endRatio: 0.56 },
    { code: 'ET-04', name: 'Alvenaria, Vedações e Cobertura', weight: 0.19, startRatio: 0.35, endRatio: 0.72 },
    { code: 'ET-05', name: 'Instalações Elétricas, Especiais e Hidrossanitárias', weight: 0.17, startRatio: 0.45, endRatio: 0.86 },
    { code: 'ET-06', name: 'Impermeabilização, Revestimentos e Esquadrias', weight: 0.18, startRatio: 0.6, endRatio: 0.96 },
    { code: 'ET-07', name: 'Pintura Final, Louças e Entrega', weight: 0.06, startRatio: 0.8, endRatio: 1.0 },
  ];

  const monthlyTotals = Array.from({ length: months }, () => 0);

  const stages: ScheduleStageRow[] = stageDefs.map((st) => {
    const startMonth = Math.max(1, Math.min(months, Math.floor(st.startRatio * months) + 1));
    const endMonth = Math.max(startMonth, Math.min(months, Math.ceil(st.endRatio * months)));
    const spanMonths = endMonth - startMonth + 1;
    const totalValue = round2(grandTotalCost * st.weight);
    const monthlySlice = spanMonths > 0 ? round2(totalValue / spanMonths) : 0;

    const monthlyValues = Array.from({ length: months }, (_, idx) => {
      const m = idx + 1;
      if (m < startMonth || m > endMonth) return 0;
      const val = m === endMonth ? round2(totalValue - monthlySlice * (spanMonths - 1)) : monthlySlice;
      monthlyTotals[idx] = round2(monthlyTotals[idx] + val);
      return val;
    });

    return {
      code: st.code,
      name: st.name,
      weightPercent: round2(st.weight * 100),
      startMonth,
      endMonth,
      totalValue,
      monthlyValues,
    };
  });

  let running = 0;
  const cumulativeTotals: number[] = [];
  const monthlyPercents: number[] = [];
  const cumulativePercents: number[] = [];

  for (let i = 0; i < months; i++) {
    running = round2(running + monthlyTotals[i]);
    cumulativeTotals.push(running);
    const mPct = grandTotalCost > 0 ? round2((monthlyTotals[i] / grandTotalCost) * 100) : 0;
    const cPct = grandTotalCost > 0 ? round2((running / grandTotalCost) * 100) : 0;
    monthlyPercents.push(mPct);
    cumulativePercents.push(cPct);
  }

  return {
    months,
    stages,
    monthlyTotals,
    monthlyPercents,
    cumulativeTotals,
    cumulativePercents,
  };
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

export interface InvestorROIReport {
  totalUnits: number;
  landCost: number;
  constructionCost: number;
  totalInvestment: number;
  monthlyRentPerUnit: number;
  grossMonthlyRent: number;
  vacancyRatePercent: number;
  adminFeePercent: number;
  monthlyCondoCostPerUnit: number;
  netMonthlyIncome: number;
  netAnnualIncome: number;
  monthlyYieldPercent: number;
  annualYieldPercent: number;
  paybackMonths: number | null;
  paybackYears: number | null;
}

export function calculateInvestorROI(
  project: Project,
  grandTotalCost: number,
): InvestorROIReport {
  const totalUnits = project.floors.reduce((sum, fl) => sum + fl.units.length, 0);
  const bs = project.budgetSettings;
  const landCost = Math.max(0, Number(bs.landCost ?? 0));
  const constructionCost = Math.max(0, grandTotalCost);
  const totalInvestment = round2(landCost + constructionCost);

  const monthlyRentPerUnit = Math.max(0, Number(bs.monthlyRentPerUnit ?? 1450));
  const vacancyRatePercent = Math.min(80, Math.max(0, Number(bs.vacancyRatePercent ?? 5)));
  const adminFeePercent = Math.min(35, Math.max(0, Number(bs.adminFeePercent ?? 8)));
  const monthlyCondoCostPerUnit = Math.max(0, Number(bs.monthlyCondoCostPerUnit ?? 95));

  const grossMonthlyRent = round2(totalUnits * monthlyRentPerUnit);
  const effectiveMonthlyRent = grossMonthlyRent * (1 - vacancyRatePercent / 100);
  const adminDeduction = effectiveMonthlyRent * (adminFeePercent / 100);
  const condoDeduction = totalUnits * monthlyCondoCostPerUnit;
  const netMonthlyIncome = round2(Math.max(0, effectiveMonthlyRent - adminDeduction - condoDeduction));
  const netAnnualIncome = round2(netMonthlyIncome * 12);

  const monthlyYieldPercent =
    totalInvestment > 0 ? round2((netMonthlyIncome / totalInvestment) * 100) : 0;
  const annualYieldPercent =
    totalInvestment > 0 ? round2((netAnnualIncome / totalInvestment) * 100) : 0;

  const paybackMonths =
    netMonthlyIncome > 0 && totalInvestment > 0 ? Math.ceil(totalInvestment / netMonthlyIncome) : null;
  const paybackYears =
    paybackMonths !== null ? round2(paybackMonths / 12) : null;

  return {
    totalUnits,
    landCost,
    constructionCost,
    totalInvestment,
    monthlyRentPerUnit,
    grossMonthlyRent,
    vacancyRatePercent,
    adminFeePercent,
    monthlyCondoCostPerUnit,
    netMonthlyIncome,
    netAnnualIncome,
    monthlyYieldPercent,
    annualYieldPercent,
    paybackMonths,
    paybackYears,
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
