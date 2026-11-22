import {
  buildSiteVerticesFromDimensions,
  round2,
} from './geometry';
import type {
  ConstructionMethodId,
  DrainagePoint,
  ElectricalPoint,
  EntrySide,
  Floor,
  FurnitureItem,
  InternalPartitionType,
  MezzanineConfig,
  MezzanineStairLayout,
  MezzanineStructureType,
  MezzanineUsage,
  MezzanineZone,
  NormativeReference,
  Opening,
  Project,
  Room,
  StairSpec,
  StructuralElement,
  UnitInstance,
  UnitType,
  Wall,
  WaterPoint,
} from '../types/project';

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function computeBlondelStairSpec(
  elevationM: number,
  layout: MezzanineStairLayout = 'reta',
  direction: StairSpec['direction'] = 'norte',
): StairSpec & { footprintW: number; footprintD: number } {
  const elev = Math.max(1.8, elevationM);
  const steps = Math.max(8, Math.round(elev / 0.185));
  const riserM = round3(elev / steps);
  // Blondel: 2*h + p ≈ 0.635m (0.62m..0.65m ergonomic band)
  const treadM = round2(Math.max(0.24, Math.min(0.28, 0.635 - 2 * riserM)));
  const blondelSumM = round3(2 * riserM + treadM);
  const widthM = 0.75;

  let footprintW = widthM;
  let footprintD = round2(Math.max(1.8, steps * treadM));
  if (layout === 'em_l') {
    const firstLegSteps = Math.ceil(steps / 2);
    footprintW = 1.5;
    footprintD = round2(Math.max(1.5, firstLegSteps * treadM + 0.75));
  } else if (layout === 'caracol_compacta') {
    footprintW = 1.25;
    footprintD = 1.25;
  } else if (direction === 'leste' || direction === 'oeste') {
    footprintW = footprintD;
    footprintD = widthM;
  }

  return {
    steps,
    riserM,
    treadM,
    blondelSumM,
    direction,
    layout,
    widthM,
    footprintW,
    footprintD,
  };
}

export interface ParametricTypologyInput {
  id?: string;
  code: string;
  name: string;
  basePreset?: string;
  width: number;
  depth: number;
  ceilingHeight: number;
  bedrooms: number;
  hasLaundry: boolean;
  hasBalcony: boolean;
  hasMezzanine: boolean;
  accessible: boolean;
  extWallThickness: number;
  intWallThickness: number;
  constructionSystem: ConstructionMethodId;
  finishStandard?: 'economico' | 'padrao' | 'medio_alto' | 'personalizado';
  entrySide?: EntrySide;
  internalPartitionType?: InternalPartitionType;
  mezzanineZone?: MezzanineZone;
  mezzanineElevationM?: number;
  mezzanineCoverageRatio?: number;
  mezzanineUsage?: MezzanineUsage;
  mezzanineStructureType?: MezzanineStructureType;
  mezzanineStairLayout?: MezzanineStairLayout;
  mezzanineStairSide?: 'esquerda' | 'direita';
}

let uidCounter = 1;
export function nextId(prefix: string): string {
  uidCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidCounter}`;
}

export function generateParametricUnitLayout(
  input: ParametricTypologyInput,
): UnitType {
  const id = input.id ?? nextId('ut');
  const W = Math.max(2.8, round2(input.width));
  const D = Math.max(3.6, round2(input.depth));
  const H = Math.max(2.4, round2(input.ceilingHeight));
  const extT = Math.max(0.08, round2(input.extWallThickness));
  const internalPartitionType: InternalPartitionType =
    input.internalPartitionType ?? 'alvenaria';
  const entrySide: EntrySide = input.entrySide ?? 'lateral_direita';
  const intT =
    internalPartitionType === 'drywall'
      ? Math.max(0.075, round2(Math.min(input.intWallThickness || 0.095, 0.095)))
      : Math.max(0.06, round2(input.intWallThickness));
  const sys = input.constructionSystem;
  const matName =
    sys === 'light_steel_frame'
      ? 'Painel LSF + Drywall/Cimentícia'
      : sys === 'wood_frame'
        ? 'Wood Frame + OSB/Gesso'
        : sys === 'alvenaria_estrutural'
          ? 'Bloco Estrutural de Concreto'
          : sys === 'pre_moldado' || sys === 'modular'
            ? 'Painel Pré-Moldado de Concreto'
            : 'Alvenaria Bloco Cerâmico';
  const intMatName =
    internalPartitionType === 'drywall'
      ? 'Drywall Gesso Acartonado ST/RU (9,5cm) + Lã Mineral'
      : matName;
  // Mezanino só é permitido com pé-direito >= 3,00m e nunca conta como pavimento
  const hasMezzanine = H >= 3.0 ? Boolean(input.hasMezzanine) : false;

  const balconyDepth = input.hasBalcony ? Math.min(1.2, round2(D * 0.16)) : 0;
  const usableD = round2(D - balconyDepth);

  // Bathroom dimensions (adapted for NBR 9050 if accessible)
  const bathW = input.accessible ? Math.min(round2(W * 0.55), 2.1) : Math.min(round2(W * 0.45), 1.7);
  const bathD = input.accessible ? Math.min(round2(usableD * 0.36), 2.2) : Math.min(round2(usableD * 0.32), 1.85);

  const laundryD = input.hasLaundry ? 1.15 : 0;
  const kitchenW = round2(W - bathW);
  const kitchenD = round2(Math.max(1.85, bathD));

  const mainRoomD = round2(usableD - kitchenD - (input.bedrooms > 0 ? 0 : 0));

  const rooms: Room[] = [];
  const walls: Wall[] = [];
  const openings: Opening[] = [];
  const furniture: FurnitureItem[] = [];
  const electricalPoints: ElectricalPoint[] = [];
  const waterPoints: WaterPoint[] = [];
  const drainagePoints: DrainagePoint[] = [];

  // 1. Rooms
  const bathRoomId = `${id}-rm-banho`;
  const kitchenRoomId = `${id}-rm-coz`;
  const mainRoomId = `${id}-rm-living`;
  const bedroomRoomId = `${id}-rm-quarto`;
  const laundryRoomId = `${id}-rm-lav`;
  const balconyRoomId = `${id}-rm-var`;

  // Bathroom at top-left (x: 0..bathW, y: 0..bathD)
  rooms.push({
    id: bathRoomId,
    code: 'BWC',
    name: input.accessible ? 'Banheiro Acessível' : 'Banheiro Social',
    category: 'banheiro',
    x: 0,
    y: 0,
    width: bathW,
    depth: bathD,
    ceilingHeight: Math.min(H, 2.55),
    naturalLightingArea: 0.48,
    ventilationArea: 0.24,
    finishes: {
      floor: 'Porcelanato acetinado antiderrapante',
      wall: 'Revestimento cerâmico até o teto',
      ceiling: 'Forro de gesso acartonado RU (resistente à umidade)',
      paint: 'Tinta acrílica antimofo branco neve',
      baseboard: 'Integrado ao revestimento cerâmico',
      countertop: 'Granito Cinza Andorinha',
      sink: 'Cuba de embutir louça branca',
      faucet: 'Torneira metal cromado 1/4 volta',
    },
    notes: input.accessible ? 'Prevê área de manobra Ø 1,50m (NBR 9050).' : '',
  });

  // Kitchen at top-right (x: bathW..W, y: 0..kitchenD)
  const effectiveKitchenW = input.hasLaundry ? round2(kitchenW - 0.0) : kitchenW;
  const kDepth = input.hasLaundry ? round2(kitchenD - 0.0) : kitchenD;
  rooms.push({
    id: kitchenRoomId,
    code: 'COZ',
    name: 'Cozinha Integrada',
    category: 'cozinha',
    x: bathW,
    y: 0,
    width: effectiveKitchenW,
    depth: input.hasLaundry ? round2(kDepth * 0.65) : kDepth,
    ceilingHeight: H,
    naturalLightingArea: 0.9,
    ventilationArea: 0.45,
    finishes: {
      floor: 'Porcelanato acetinado 60x60cm',
      wall: 'Cerâmica na parede hidráulica + massa corrida PVA',
      ceiling: 'Laje / Forro gesso liso',
      paint: 'Tinta acrílica fosca lavável',
      baseboard: 'Porcelanato h=8cm',
      countertop: 'Granito Cinza Corumbá 1,40 x 0,60m',
      sink: 'Cuba inox AISI 304 simples',
      faucet: 'Torneira bica móvel de bancada',
      cabinets: 'Previsto espaço para armário inferior e aéreo',
    },
    notes: '',
  });

  if (input.hasLaundry) {
    rooms.push({
      id: laundryRoomId,
      code: 'A.S.',
      name: 'Área de Serviço',
      category: 'area_servico',
      x: bathW,
      y: round2(kDepth * 0.65),
      width: effectiveKitchenW,
      depth: round2(kDepth * 0.35),
      ceilingHeight: H,
      naturalLightingArea: 0.4,
      ventilationArea: 0.2,
      finishes: {
        floor: 'Porcelanato acetinado antiderrapante',
        wall: 'Revestimento cerâmico h=1,50m',
        ceiling: 'Laje / Forro gesso RU',
        paint: 'Tinta acrílica lavável',
        baseboard: 'Porcelanato h=8cm',
      },
      notes: '',
    });
  }

  // Living / Bedroom zone (y: kitchenD .. usableD)
  if (input.bedrooms >= 1 && mainRoomD >= 2.2 && W >= 3.6) {
    const livingW = round2(W * 0.46);
    const bedW = round2(W - livingW);
    rooms.push({
      id: mainRoomId,
      code: 'SALA',
      name: 'Sala de Estar',
      category: 'sala',
      x: 0,
      y: kitchenD,
      width: livingW,
      depth: mainRoomD,
      ceilingHeight: H,
      naturalLightingArea: 1.2,
      ventilationArea: 0.6,
      finishes: {
        floor: 'Porcelanato acetinado / Vinílico',
        wall: 'Massa corrida PVA',
        ceiling: 'Forro de gesso liso / Laje acabada',
        paint: 'Tinta acrílica fosca branco gelo',
        baseboard: 'Poliestireno / Porcelanato h=7cm',
      },
      notes: '',
    });
    rooms.push({
      id: bedroomRoomId,
      code: 'DORM',
      name: 'Dormitório',
      category: 'quarto',
      x: livingW,
      y: kitchenD,
      width: bedW,
      depth: mainRoomD,
      ceilingHeight: H,
      naturalLightingArea: 1.44,
      ventilationArea: 0.72,
      finishes: {
        floor: 'Piso vinílico / Porcelanato amadeirado',
        wall: 'Massa corrida PVA',
        ceiling: 'Forro de gesso liso',
        paint: 'Tinta acrílica fosca branco gelo',
        baseboard: 'Poliestireno h=7cm',
      },
      notes: '',
    });
  } else {
    rooms.push({
      id: mainRoomId,
      code: 'EST',
      name: 'Sala / Dormitório Integrado',
      category: 'sala_quarto',
      x: 0,
      y: kitchenD,
      width: W,
      depth: mainRoomD,
      ceilingHeight: H,
      naturalLightingArea: 1.8,
      ventilationArea: 0.9,
      finishes: {
        floor: 'Porcelanato acetinado 60x60cm',
        wall: 'Massa corrida PVA',
        ceiling: 'Forro de gesso liso',
        paint: 'Tinta acrílica fosca branco gelo',
        baseboard: 'Porcelanato h=7cm',
      },
      notes: '',
    });
  }

  if (input.hasBalcony && balconyDepth > 0) {
    rooms.push({
      id: balconyRoomId,
      code: 'VAR',
      name: 'Varanda Técnica / Lazer',
      category: 'varanda',
      x: 0,
      y: usableD,
      width: W,
      depth: balconyDepth,
      ceilingHeight: H,
      naturalLightingArea: round2(W * 1.2),
      ventilationArea: round2(W * 1.2),
      finishes: {
        floor: 'Porcelanato externo antiderrapante',
        wall: 'Textura acrílica externa',
        ceiling: 'Laje impermeabilizada',
        paint: 'Tinta acrílica externa',
        baseboard: 'Porcelanato h=8cm',
      },
      notes: '',
    });
  }

  // 2. Perimeter & Internal Walls
  const wTopId = `${id}-w-top`;
  const wRightId = `${id}-w-right`;
  const wBottomId = `${id}-w-bottom`;
  const wLeftId = `${id}-w-left`;
  const wBathRightId = `${id}-w-bath-r`;
  const wBathBottomId = `${id}-w-bath-b`;

  walls.push(
    {
      id: wTopId,
      code: 'P-EXT-N',
      start: { x: 0, y: 0 },
      end: { x: W, y: 0 },
      thickness: extT,
      height: H,
      isExternal: true,
      material: matName,
      constructionSystem: sys,
      loadBearing: sys === 'alvenaria_estrutural' || sys === 'light_steel_frame' || sys === 'wood_frame',
    },
    {
      id: wRightId,
      code: 'P-EXT-L',
      start: { x: W, y: 0 },
      end: { x: W, y: usableD },
      thickness: extT,
      height: H,
      isExternal: true,
      material: matName,
      constructionSystem: sys,
      loadBearing: sys === 'alvenaria_estrutural' || sys === 'light_steel_frame' || sys === 'wood_frame',
    },
    {
      id: wBottomId,
      code: 'P-EXT-S',
      start: { x: W, y: usableD },
      end: { x: 0, y: usableD },
      thickness: extT,
      height: H,
      isExternal: true,
      material: matName,
      constructionSystem: sys,
      loadBearing: sys === 'alvenaria_estrutural' || sys === 'light_steel_frame' || sys === 'wood_frame',
    },
    {
      id: wLeftId,
      code: 'P-EXT-O',
      start: { x: 0, y: usableD },
      end: { x: 0, y: 0 },
      thickness: extT,
      height: H,
      isExternal: true,
      material: matName,
      constructionSystem: sys,
      loadBearing: sys === 'alvenaria_estrutural' || sys === 'light_steel_frame' || sys === 'wood_frame',
    },
    {
      id: wBathRightId,
      code: 'P-INT-BWC1',
      start: { x: bathW, y: 0 },
      end: { x: bathW, y: bathD },
      thickness: intT,
      height: H,
      isExternal: false,
      material: intMatName,
      constructionSystem: sys,
      loadBearing: false,
    },
    {
      id: wBathBottomId,
      code: 'P-INT-BWC2',
      start: { x: 0, y: bathD },
      end: { x: bathW, y: bathD },
      thickness: intT,
      height: H,
      isExternal: false,
      material: intMatName,
      constructionSystem: sys,
      loadBearing: false,
    },
  );

  const hasSeparateBedroom = input.bedrooms >= 1 && mainRoomD >= 2.2 && W >= 3.6;
  const livingW = hasSeparateBedroom ? round2(W * 0.46) : W;
  const bedW = hasSeparateBedroom ? round2(W - livingW) : 0;

  // Optional bedroom dividing wall (Porta de Quarto sempre 0,70m fixo)
  if (hasSeparateBedroom) {
    const wBedId = `${id}-w-bed`;
    walls.push({
      id: wBedId,
      code: 'P-INT-DORM',
      start: { x: livingW, y: kitchenD },
      end: { x: livingW, y: usableD },
      thickness: intT,
      height: H,
      isExternal: false,
      material: intMatName,
      constructionSystem: sys,
      loadBearing: false,
    });
    openings.push({
      id: `${id}-op-p-dorm`,
      code: 'P3',
      wallId: wBedId,
      type: 'porta',
      role: 'quarto',
      openingKind: 'porta_abrir',
      subtype: 'Porta de quarto 70x210cm (padrão fixo)',
      offsetAlongWall: 0.2,
      width: 0.7,
      height: 2.1,
      sillHeight: 0,
      thickness: 0.035,
      swingDirection: 'right_in',
      material: 'Madeira semi-oca pintada',
    });
  }

  // Balcony low guardrail wall if balcony
  if (input.hasBalcony && balconyDepth > 0) {
    walls.push({
      id: `${id}-w-var-guard`,
      code: 'GC-VAR',
      start: { x: 0, y: D },
      end: { x: W, y: D },
      thickness: 0.12,
      height: 1.1,
      isExternal: true,
      material: 'Peitoril Alvenaria + Vidro Temperado',
      constructionSystem: sys,
      loadBearing: false,
    });
  }

  // 3. Doors & Windows (larguras fixas por função: Entrada=0,80m, Banheiro=0,60m, Quarto=0,70m)
  const entryDoorWidth = 0.8;
  const bathDoorWidth = 0.6;

  let entryWallId = wRightId;
  let entryOffset = round2(Math.max(0.25, kitchenD + 0.25));
  let entrySwing: Opening['swingDirection'] = 'left_in';

  if (entrySide === 'lateral_esquerda') {
    entryWallId = wLeftId; // (0, usableD) -> (0, 0)
    entryOffset = round2(Math.max(0.18, usableD - (kitchenD + 0.25 + entryDoorWidth)));
    entrySwing = 'right_in';
  } else if (entrySide === 'frente') {
    entryWallId = wBottomId; // (W, usableD) -> (0, usableD)
    if (hasSeparateBedroom) {
      // Coloca P1 no canto inferior esquerdo da Sala de Estar (x: 0.16..0.96)
      entryOffset = round2(Math.max(bedW + 0.2, W - 0.96));
    } else {
      // Coloca P1 no canto inferior direito (x: W-1.00..W-0.20)
      entryOffset = 0.2;
    }
    entrySwing = 'left_in';
  }

  let mainWinOffset = round2(Math.max(0.3, (W - 1.5) / 2));
  let mainWinWidth = Math.min(1.6, round2(W - 0.8));
  if (entrySide === 'frente') {
    if (hasSeparateBedroom) {
      mainWinWidth = round2(Math.min(1.3, Math.max(0.8, bedW - 0.55)));
      mainWinOffset = round2(Math.max(0.2, (bedW - mainWinWidth) / 2));
    } else {
      const maxWinSpace = Math.max(0.8, round2(W - 1.35));
      mainWinWidth = round2(Math.min(1.35, maxWinSpace));
      mainWinOffset = round2(entryOffset + entryDoorWidth + 0.24);
    }
  }

  openings.push(
    {
      id: `${id}-op-entry`,
      code: 'P1',
      wallId: entryWallId,
      type: 'porta',
      role: 'entrada',
      openingKind: 'porta_abrir',
      subtype: `Porta de entrada social 80x210cm (${entrySide === 'frente' ? 'Frente' : entrySide === 'lateral_esquerda' ? 'Lat. Esq.' : 'Lat. Dir.'})`,
      offsetAlongWall: entryOffset,
      width: entryDoorWidth,
      height: 2.1,
      sillHeight: 0,
      thickness: 0.04,
      swingDirection: entrySwing,
      material: 'Madeira maciça / Pintura acetinada',
    },
    {
      id: `${id}-op-bath`,
      code: 'P2',
      wallId: wBathBottomId,
      type: 'porta',
      role: 'banheiro',
      openingKind: 'porta_abrir',
      subtype: 'Porta de banheiro 60x210cm (padrão fixo)',
      offsetAlongWall: round2(Math.max(0.68, bathW - bathDoorWidth - 0.12)),
      width: bathDoorWidth,
      height: 2.1,
      sillHeight: 0,
      thickness: 0.035,
      swingDirection: 'right_in',
      material: 'Madeira resistente à umidade',
    },
    {
      id: `${id}-op-win-main`,
      code: 'J1',
      wallId: wBottomId,
      type: 'janela',
      openingKind: 'janela_correr',
      subtype: input.hasBalcony ? 'Porta-janela de correr 2 folhas' : 'Janela de correr alumínio + vidro',
      offsetAlongWall: mainWinOffset,
      width: mainWinWidth,
      height: input.hasBalcony ? 2.1 : 1.2,
      sillHeight: input.hasBalcony ? 0 : 1.0,
      thickness: 0.08,
      swingDirection: 'sliding',
      material: 'Alumínio anodizado preto + vidro temperado 6mm',
    },
    {
      id: `${id}-op-win-bath`,
      code: 'J2',
      wallId: wTopId,
      type: 'janela',
      openingKind: 'vitro_basculante',
      subtype: 'Vitrô basculante banheiro',
      offsetAlongWall: round2(Math.max(0.2, (bathW - 0.6) / 2)),
      width: 0.6,
      height: 0.6,
      sillHeight: 1.6,
      thickness: 0.06,
      swingDirection: 'sliding',
      material: 'Alumínio + vidro mini-boreal',
    },
    {
      id: `${id}-op-win-coz`,
      code: 'J3',
      wallId: wTopId,
      type: 'janela',
      openingKind: 'janela_correr',
      subtype: 'Janela cozinha de correr',
      offsetAlongWall: round2(bathW + Math.max(0.25, (kitchenW - 1.0) / 2)),
      width: Math.min(1.0, round2(kitchenW - 0.4)),
      height: 0.9,
      sillHeight: 1.25,
      thickness: 0.06,
      swingDirection: 'sliding',
      material: 'Alumínio anodizado preto + vidro liso',
    },
  );

  // 4. Furniture & Sanitary Fixtures (meticulously planned, zero-clash ergonomics)
  const boxW = round2(Math.min(0.88, bathW * 0.48));
  const boxD = 0.85;
  const lavY = round2(Math.max(boxD + 0.16, bathD - 0.48));

  furniture.push(
    {
      id: `${id}-fur-box`,
      name: 'Box Vidro Temperado + Ralo Linear',
      category: 'box',
      roomId: bathRoomId,
      x: 0.08,
      y: 0.08,
      width: boxW,
      depth: boxD,
      height: 1.95,
      rotationDeg: 0,
      requiresWater: true,
      requiresDrain: true,
    },
    {
      id: `${id}-fur-chuveiro`,
      name: 'Ducha / Misturador BWC',
      category: 'chuveiro',
      roomId: bathRoomId,
      x: round2(0.08 + boxW / 2 - 0.11),
      y: 0.1,
      width: 0.22,
      depth: 0.22,
      height: 0.18,
      rotationDeg: 0,
      requiresWater: true,
    },
    {
      id: `${id}-fur-vaso`,
      name: 'Bacia Sanitária c/ Caixa Acoplada',
      category: 'vaso_sanitario',
      roomId: bathRoomId,
      x: round2(Math.max(boxW + 0.18, bathW - 0.48)),
      y: 0.1,
      width: 0.4,
      depth: 0.64,
      height: 0.78,
      rotationDeg: 0,
      requiresWater: true,
      requiresDrain: true,
    },
    {
      id: `${id}-fur-lav`,
      name: 'Gabinete c/ Cuba e Torneira BWC',
      category: 'lavatorio',
      roomId: bathRoomId,
      x: 0.1,
      y: lavY,
      width: 0.52,
      depth: 0.4,
      height: 0.85,
      rotationDeg: 0,
      requiresWater: true,
      requiresDrain: true,
    },
    {
      id: `${id}-fur-espelho`,
      name: 'Espelho Lapidado BWC',
      category: 'espelho',
      roomId: bathRoomId,
      x: 0.12,
      y: round2(lavY + 0.34),
      width: 0.48,
      depth: 0.03,
      height: 0.72,
      rotationDeg: 0,
    },
    {
      id: `${id}-fur-bancada`,
      name: 'Bancada Granito c/ Cuba Inox e Torneira',
      category: 'bancada',
      roomId: kitchenRoomId,
      x: round2(bathW + 0.1),
      y: 0.08,
      width: round2(Math.min(1.45, Math.max(0.95, kitchenW - 0.82))),
      depth: 0.58,
      height: 0.9,
      rotationDeg: 0,
      requiresWater: true,
      requiresDrain: true,
    },
    {
      id: `${id}-fur-cooktop`,
      name: 'Cooktop 2 Bocas Indução/Gás',
      category: 'cooktop',
      roomId: kitchenRoomId,
      x: round2(bathW + 0.1 + Math.min(1.45, Math.max(0.95, kitchenW - 0.82)) - 0.56),
      y: 0.16,
      width: 0.5,
      depth: 0.36,
      height: 0.08,
      rotationDeg: 0,
      requiresPower: true,
    },
    {
      id: `${id}-fur-geladeira`,
      name: 'Refrigerador Frost Free',
      category: 'geladeira',
      roomId: kitchenRoomId,
      x: round2(W - 0.72),
      y: 0.08,
      width: 0.62,
      depth: 0.62,
      height: 1.75,
      rotationDeg: 0,
      requiresPower: true,
    },
  );

  if (input.hasLaundry) {
    furniture.push(
      {
        id: `${id}-fur-tanque`,
        name: 'Tanque Inox / Louça c/ Torneira',
        category: 'tanque',
        roomId: laundryRoomId,
        x: round2(bathW + 0.12),
        y: round2(kDepth * 0.65 + 0.04),
        width: 0.52,
        depth: 0.48,
        height: 0.85,
        rotationDeg: 0,
        requiresWater: true,
        requiresDrain: true,
      },
      {
        id: `${id}-fur-maq`,
        name: 'Máquina de Lavar Roupas',
        category: 'maquina_lavar',
        roomId: laundryRoomId,
        x: round2(W - 0.68),
        y: round2(kDepth * 0.65 + 0.04),
        width: 0.58,
        depth: 0.56,
        height: 0.88,
        rotationDeg: 0,
        requiresPower: true,
        requiresWater: true,
        requiresDrain: true,
      },
    );
  }

  if (hasSeparateBedroom) {
    const rackX = entrySide === 'lateral_esquerda' && mainRoomD < 4.1 ? 0.5 : 0.14;
    const rackY =
      entrySide === 'frente'
        ? round2(kitchenD + 0.74)
        : entrySide === 'lateral_esquerda' && mainRoomD >= 4.1
          ? round2(kitchenD + 1.2)
          : round2(kitchenD + 0.85);
    const sofaY =
      entrySide === 'frente'
        ? round2(kitchenD + 1.58)
        : entrySide === 'lateral_esquerda' && mainRoomD >= 4.1
          ? round2(kitchenD + 1.95)
          : round2(kitchenD + 1.8);
    const mesaX = entrySide === 'frente' ? round2(Math.max(1.06, livingW - 0.64)) : 0.14;
    const mesaY = entrySide === 'frente' ? round2(usableD - 1.15) : round2(usableD - 0.68);
    const mesaW = entrySide === 'frente' ? 0.5 : 1.0;
    const mesaD = entrySide === 'frente' ? 0.95 : 0.52;
    const cadeiraX = entrySide === 'frente' ? round2(Math.max(1.06, livingW - 0.6)) : 0.42;
    const cadeiraY = entrySide === 'frente' ? round2(usableD - 1.66) : round2(usableD - 1.2);

    furniture.push(
      {
        id: `${id}-fur-cama`,
        name: 'Cama Casal Padrão c/ Cabeceira',
        category: 'cama',
        roomId: bedroomRoomId,
        x: round2(W - 1.48),
        y: round2(usableD - 2.0),
        width: 1.38,
        depth: 1.88,
        height: 0.54,
        rotationDeg: 0,
      },
      {
        id: `${id}-fur-criado`,
        name: 'Mesa de Cabeceira',
        category: 'mesa_cabeceira',
        roomId: bedroomRoomId,
        x: round2(Math.max(livingW + 0.14, W - 1.98)),
        y: round2(usableD - 1.98),
        width: 0.42,
        depth: 0.38,
        height: 0.52,
        rotationDeg: 0,
      },
      {
        id: `${id}-fur-armario`,
        name: 'Guarda-Roupa 2 Portas de Correr',
        category: 'guarda_roupa',
        roomId: bedroomRoomId,
        x: round2(W - 1.32),
        y: round2(kitchenD + 1.35),
        width: 1.2,
        depth: 0.54,
        height: 2.15,
        rotationDeg: 0,
      },
      {
        id: `${id}-fur-rack`,
        name: 'Rack Painel TV Sala',
        category: 'rack_tv',
        roomId: mainRoomId,
        x: rackX,
        y: rackY,
        width: Math.min(1.15, round2(livingW - rackX - 0.2)),
        depth: 0.35,
        height: 0.52,
        rotationDeg: 0,
      },
      {
        id: `${id}-fur-tv`,
        name: 'Smart TV 43" + Ponto Antena/HDMI',
        category: 'tv',
        roomId: mainRoomId,
        x: round2(rackX + 0.08),
        y: round2(rackY + 0.04),
        width: Math.min(0.96, round2(livingW - rackX - 0.36)),
        depth: 0.06,
        height: 0.56,
        rotationDeg: 0,
        requiresPower: true,
      },
      {
        id: `${id}-fur-sofa`,
        name: 'Sofá Retrátil 2 Lugares',
        category: 'sofa',
        roomId: mainRoomId,
        x: 0.14,
        y: sofaY,
        width: Math.min(1.35, round2(livingW - 0.3)),
        depth: 0.75,
        height: 0.82,
        rotationDeg: 0,
      },
      {
        id: `${id}-fur-mesa`,
        name: 'Mesa Refeições / Home Office',
        category: 'mesa',
        roomId: mainRoomId,
        x: mesaX,
        y: mesaY,
        width: mesaW,
        depth: mesaD,
        height: 0.75,
        rotationDeg: 0,
      },
      {
        id: `${id}-fur-cadeira`,
        name: 'Cadeira Ergonômica',
        category: 'cadeira',
        roomId: mainRoomId,
        x: cadeiraX,
        y: cadeiraY,
        width: 0.44,
        depth: 0.44,
        height: 0.85,
        rotationDeg: 0,
      },
    );
  } else {
    // Integrated Studio Layout (clear of P2 bathroom swing and P1 entry swing for all 3 entry sides)
    const isLeftEntry = entrySide === 'lateral_esquerda';
    const isFrontEntry = entrySide === 'frente';
    const topStartX = round2(bathW + 0.08);
    const availTopW =
      entrySide === 'lateral_direita'
        ? Math.max(1.2, round2(W - topStartX - 0.54))
        : Math.max(1.2, round2(W - topStartX - 0.14));
    const rackW = round2(Math.min(0.92, availTopW * 0.47));
    const wardX = round2(topStartX + rackW + 0.06);
    const wardW = round2(Math.min(1.05, Math.max(0.6, availTopW - rackW - 0.06)));
    const tvW = round2(Math.min(0.84, rackW - 0.08));

    const bedX = isLeftEntry ? round2(W - 1.5) : 0.12;
    const criadoX = isLeftEntry ? round2(W - 1.96) : 1.56;
    const deskX = isLeftEntry
      ? 0.14
      : isFrontEntry
        ? round2(Math.min(1.62, Math.max(1.56, W - 2.1)))
        : round2(W - 1.15);
    const deskW = isFrontEntry
      ? round2(Math.min(0.95, Math.max(0.65, W - 1.06 - deskX)))
      : 1.02;
    const chairX = isLeftEntry
      ? 0.42
      : isFrontEntry
        ? round2(deskX + deskW / 2 - 0.22)
        : round2(W - 0.86);

    furniture.push(
      {
        id: `${id}-fur-rack`,
        name: 'Rack Painel TV / Multimídia',
        category: 'rack_tv',
        roomId: mainRoomId,
        x: topStartX,
        y: round2(kitchenD + 0.1),
        width: rackW,
        depth: 0.35,
        height: 0.5,
        rotationDeg: 0,
      },
      {
        id: `${id}-fur-tv`,
        name: 'Smart TV 43" + Ponto Antena/HDMI',
        category: 'tv',
        roomId: mainRoomId,
        x: round2(topStartX + (rackW - tvW) / 2),
        y: round2(kitchenD + 0.14),
        width: tvW,
        depth: 0.06,
        height: 0.56,
        rotationDeg: 0,
        requiresPower: true,
      },
      {
        id: `${id}-fur-armario`,
        name: 'Guarda-Roupa 2 Portas de Correr',
        category: 'guarda_roupa',
        roomId: mainRoomId,
        x: wardX,
        y: round2(kitchenD + 0.1),
        width: wardW,
        depth: 0.52,
        height: 2.15,
        rotationDeg: 0,
      },
      {
        id: `${id}-fur-cama`,
        name: 'Cama Casal Padrão c/ Cabeceira',
        category: 'cama',
        roomId: mainRoomId,
        x: bedX,
        y: round2(usableD - 1.98),
        width: 1.38,
        depth: 1.88,
        height: 0.54,
        rotationDeg: 0,
      },
      {
        id: `${id}-fur-criado`,
        name: 'Mesa de Cabeceira',
        category: 'mesa_cabeceira',
        roomId: mainRoomId,
        x: criadoX,
        y: round2(usableD - 1.98),
        width: 0.4,
        depth: 0.36,
        height: 0.52,
        rotationDeg: 0,
      },
      {
        id: `${id}-fur-mesa`,
        name: 'Mesa Refeições / Home Office',
        category: 'mesa',
        roomId: mainRoomId,
        x: deskX,
        y: round2(usableD - 0.64),
        width: deskW,
        depth: 0.52,
        height: 0.75,
        rotationDeg: 0,
      },
      {
        id: `${id}-fur-cadeira`,
        name: 'Cadeira Ergonômica',
        category: 'cadeira',
        roomId: mainRoomId,
        x: chairX,
        y: round2(usableD - 1.16),
        width: 0.44,
        depth: 0.44,
        height: 0.85,
        rotationDeg: 0,
      },
    );

    if (mainRoomD >= 3.85) {
      furniture.push({
        id: `${id}-fur-sofa`,
        name: 'Sofá Compacto 2 Lugares',
        category: 'sofa',
        roomId: mainRoomId,
        x: isLeftEntry ? 0.14 : round2(W - 1.4),
        y: round2(kitchenD + 1.35),
        width: 1.28,
        depth: 0.7,
        height: 0.82,
        rotationDeg: 0,
      });
    }
  }

  // 4B. Mezanino Condicional (apenas se pé-direito >= 3,00m — nunca conta como pavimento)
  let mezzanine: MezzanineConfig | undefined;
  if (hasMezzanine) {
    const mezzZone: MezzanineZone = input.mezzanineZone ?? 'sobre_banho_cozinha';
    const slabThicknessM = 0.12;
    const maxSafeElev = round2(Math.max(2.05, H - 1.15));
    const elevationM = round2(
      Math.min(
        maxSafeElev,
        Math.max(2.0, input.mezzanineElevationM ?? Math.min(2.25, Math.max(2.1, H - 1.25))),
      ),
    );
    const coverageRatio = Math.min(0.6, Math.max(0.28, input.mezzanineCoverageRatio ?? 0.42));
    const usage: MezzanineUsage = input.mezzanineUsage ?? 'dormitorio';
    const structureType: MezzanineStructureType =
      input.mezzanineStructureType ?? 'metalica_madeira';
    const stairLayout: MezzanineStairLayout = input.mezzanineStairLayout ?? 'reta';
    const stairSide: 'esquerda' | 'direita' =
      input.mezzanineStairSide ?? (entrySide === 'lateral_direita' ? 'esquerda' : 'direita');

    let mezzX = 0.08;
    let mezzY = 0.08;
    let mezzW = round2(W - 0.16);
    let mezzD = round2(Math.min(usableD - 1.35, Math.max(kitchenD + 0.25, usableD * coverageRatio)));

    if (mezzZone === 'lateral_esquerda') {
      mezzW = round2(Math.max(1.65, (W - 0.16) * Math.min(0.58, coverageRatio + 0.08)));
      mezzD = round2(usableD - 0.16);
    } else if (mezzZone === 'lateral_direita') {
      mezzW = round2(Math.max(1.65, (W - 0.16) * Math.min(0.58, coverageRatio + 0.08)));
      mezzX = round2(W - 0.08 - mezzW);
      mezzD = round2(usableD - 0.16);
    }

    mezzanine = {
      enabled: true,
      zone: mezzZone,
      elevationM,
      slabThicknessM,
      coverageRatio,
      x: mezzX,
      y: mezzY,
      width: mezzW,
      depth: mezzD,
      usage,
      structureType,
      stairLayout,
      stairSide,
      guardrailHeightM: 1.05,
    };

    const mezzClearH = round2(Math.max(1.1, H - elevationM - slabThicknessM));
    const mezzRoomId = `${id}-rm-mez`;
    rooms.push({
      id: mezzRoomId,
      code: 'MEZ',
      name:
        usage === 'dormitorio'
          ? 'Mezanino (Dormitório)'
          : usage === 'home_office'
            ? 'Mezanino (Home Office)'
            : usage === 'dormitorio_home_office'
              ? 'Mezanino (Dorm. + Office)'
              : 'Mezanino (Estar / Depósito)',
      category: 'mezanino',
      x: mezzX,
      y: mezzY,
      width: mezzW,
      depth: mezzD,
      ceilingHeight: mezzClearH,
      elevationM: round2(elevationM + slabThicknessM),
      naturalLightingArea: 0.9,
      ventilationArea: 0.45,
      finishes: {
        floor:
          structureType === 'madeira_estrutural' || structureType === 'metalica_madeira'
            ? 'Deck estrutural madeira naval / vinílico'
            : 'Contrapiso + piso vinílico',
        wall: 'Guarda-corpo metálico tubular h=1,05m + alvenaria/drywall',
        ceiling: 'Laje / Cobertura superior',
        paint: 'Tinta acrílica fosca branco gelo',
        baseboard: 'Metálico / Madeira h=7cm',
      },
      notes: `Mezanino técnico (cota +${elevationM.toFixed(2)}m, pé-direito útil sup. ${mezzClearH.toFixed(2)}m). Não computado como pavimento.`,
    });

    // Planejamento ergonômico da escada (Fórmula de Blondel 2h + p ≈ 0,635m)
    const stairSpec = computeBlondelStairSpec(elevationM, stairLayout, 'norte');
    const stairW = stairSpec.footprintW;
    const stairD = Math.min(stairSpec.footprintD, round2(Math.max(1.4, usableD - kitchenD - 0.35)));
    let stairX = stairSide === 'esquerda' ? 0.12 : round2(W - stairW - 0.12);
    let stairY =
      mezzZone === 'sobre_banho_cozinha' || mezzZone === 'fundos'
        ? round2(Math.min(usableD - stairD - 0.14, Math.max(kitchenD + 0.14, mezzY + mezzD - 0.25)))
        : round2(Math.min(usableD - stairD - 0.14, kitchenD + 0.18));

    // Garante que a escada não bloqueie a porta de entrada P1 nem a porta do banheiro P2
    if (entrySide === 'lateral_direita' && stairSide === 'direita') {
      stairY = round2(Math.min(usableD - stairD - 0.14, Math.max(kitchenD + 1.18, stairY)));
    } else if (entrySide === 'lateral_esquerda' && stairSide === 'esquerda') {
      stairY = round2(Math.min(usableD - stairD - 0.14, Math.max(kitchenD + 1.18, stairY)));
    } else if (entrySide === 'frente' && stairY + stairD > usableD - 0.52) {
      stairY = round2(Math.max(kitchenD + 0.12, usableD - stairD - 0.56));
    }

    // Remove/reposiciona móveis térreos que conflitem com a projeção da escada no térreo
    const keepSafeFurniture: FurnitureItem[] = [];
    const wetCategories = new Set(['box', 'chuveiro', 'vaso_sanitario', 'lavatorio', 'espelho', 'bancada', 'cooktop', 'geladeira', 'tanque', 'maquina_lavar']);
    for (const f of furniture) {
      if (wetCategories.has(f.category)) {
        keepSafeFurniture.push(f);
        continue;
      }
      const overlapsStair =
        f.x < stairX + stairW + 0.08 &&
        f.x + f.width > stairX - 0.08 &&
        f.y < stairY + stairD + 0.08 &&
        f.y + f.depth > stairY - 0.08;
      if (!overlapsStair) {
        keepSafeFurniture.push(f);
      }
    }
    furniture.length = 0;
    furniture.push(...keepSafeFurniture);

    furniture.push({
      id: `${id}-fur-escada`,
      name: `Escada Mezanino (${stairSpec.steps} degraus • 2h+p=${stairSpec.blondelSumM.toFixed(2)}m)`,
      category: 'escada',
      roomId: mainRoomId,
      x: stairX,
      y: stairY,
      width: stairW,
      depth: stairD,
      height: elevationM,
      elevationM: 0,
      rotationDeg: 0,
      stairSpec,
    });

    const deckTop = round2(elevationM + slabThicknessM);
    // Mobiliário superior no mezanino (nível elevado)
    if (usage === 'dormitorio' || usage === 'dormitorio_home_office') {
      const canLongAlongY = mezzD >= 2.05;
      const bedUpperW = canLongAlongY ? Math.min(1.38, round2(mezzW - 0.3)) : Math.min(1.88, round2(mezzW - 0.24));
      const bedUpperD = canLongAlongY ? 1.88 : Math.min(1.32, round2(mezzD - 0.24));
      const bedUpperX = round2(mezzX + Math.max(0.12, (mezzW - bedUpperW) * 0.25));
      const bedUpperY = round2(mezzY + 0.1);
      furniture.push({
        id: `${id}-fur-mez-cama`,
        name: 'Cama Casal Mezanino',
        category: 'cama',
        roomId: mezzRoomId,
        x: bedUpperX,
        y: bedUpperY,
        width: bedUpperW,
        depth: bedUpperD,
        height: 0.45,
        elevationM: deckTop,
        rotationDeg: 0,
      });

      if (usage === 'dormitorio_home_office' && mezzW - bedUpperW >= 1.25) {
        const officeX = round2(mezzX + mezzW - 1.04);
        furniture.push(
          {
            id: `${id}-fur-mez-mesa`,
            name: 'Bancada Home Office Mezanino',
            category: 'mesa',
            roomId: mezzRoomId,
            x: officeX,
            y: round2(mezzY + 0.12),
            width: 0.92,
            depth: 0.48,
            height: 0.74,
            elevationM: deckTop,
            rotationDeg: 0,
          },
          {
            id: `${id}-fur-mez-cad`,
            name: 'Cadeira Office Mezanino',
            category: 'cadeira',
            roomId: mezzRoomId,
            x: round2(officeX + 0.24),
            y: round2(mezzY + 0.68),
            width: 0.44,
            depth: 0.44,
            height: 0.85,
            elevationM: deckTop,
            rotationDeg: 0,
          },
        );
      }
    } else if (usage === 'home_office') {
      furniture.push(
        {
          id: `${id}-fur-mez-mesa`,
          name: 'Estação de Trabalho Mezanino',
          category: 'mesa',
          roomId: mezzRoomId,
          x: round2(mezzX + 0.2),
          y: round2(mezzY + 0.12),
          width: Math.min(1.4, round2(mezzW - 0.4)),
          depth: 0.55,
          height: 0.75,
          elevationM: deckTop,
          rotationDeg: 0,
        },
        {
          id: `${id}-fur-mez-cad`,
          name: 'Cadeira Ergonômica Mezanino',
          category: 'cadeira',
          roomId: mezzRoomId,
          x: round2(mezzX + 0.65),
          y: round2(mezzY + 0.75),
          width: 0.46,
          depth: 0.46,
          height: 0.85,
          elevationM: deckTop,
          rotationDeg: 0,
        },
      );
    } else {
      furniture.push({
        id: `${id}-fur-mez-arm`,
        name: 'Armário / Estante Mezanino',
        category: 'armario',
        roomId: mezzRoomId,
        x: round2(mezzX + 0.2),
        y: round2(mezzY + 0.12),
        width: Math.min(1.4, round2(mezzW - 0.4)),
        depth: 0.5,
        height: Math.min(1.1, round2(mezzClearH - 0.1)),
        elevationM: deckTop,
        rotationDeg: 0,
      });
    }
  }

  // 5. Electrical & Special Installations Points (X, Y, Z, circuits, power, CFTV, Antena/TV, Wi-Fi, Dados)
  const tvPointX = hasSeparateBedroom ? 0.7 : 2.02;
  const tvRoom = mainRoomId;
  const deskPointX = hasSeparateBedroom ? 0.64 : round2(W - 0.65);
  const deskPointY = hasSeparateBedroom ? round2(kitchenD + 1.3) : round2(usableD - 0.16);

  electricalPoints.push(
    {
      id: `${id}-el-1`,
      code: 'IL-BWC',
      category: 'iluminacao_teto',
      label: 'Plafon LED IP44 Teto BWC',
      roomId: bathRoomId,
      x: round2(bathW / 2),
      y: round2(bathD / 2),
      z: Math.min(H, 2.55),
      referenceWall: 'Laje/Forro',
      referenceDistance: round2(bathW / 2),
      powerVA: 100,
      voltage: 127,
      powerFactor: 0.92,
      circuitId: 'C1-ILUM',
      conductorSectionMm2: 1.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 10A Curva B',
      notes: 'Plafon LED IP44 área úmida',
    },
    {
      id: `${id}-el-2`,
      code: 'CHUV-01',
      category: 'chuveiro',
      label: 'Ponto Chuveiro Elétrico',
      roomId: bathRoomId,
      x: 0.4,
      y: 0.14,
      z: 2.2,
      referenceWall: 'P-EXT-N',
      referenceDistance: 0.4,
      powerVA: 5500,
      voltage: 220,
      powerFactor: 1.0,
      circuitId: 'C3-CHUV',
      conductorSectionMm2: 6.0,
      conduitDiameterMm: 25,
      protection: 'Disjuntor 32A + DR 30mA',
      notes: 'Circuito exclusivo TUE',
    },
    {
      id: `${id}-el-3`,
      code: 'TM-BWC',
      category: 'tomada_media',
      label: 'Tomada Média Lavatório / Espelho',
      roomId: bathRoomId,
      x: 0.35,
      y: round2(bathD - 0.15),
      z: 1.15,
      referenceWall: 'P-INT-BWC2',
      referenceDistance: 0.35,
      powerVA: 600,
      voltage: 127,
      powerFactor: 0.85,
      circuitId: 'C2-TUG',
      conductorSectionMm2: 2.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 16A + DR 30mA',
      notes: 'Tomada junto ao espelho',
    },
    {
      id: `${id}-el-4`,
      code: 'IL-COZ',
      category: 'iluminacao_teto',
      label: 'Ponto Luz Cozinha',
      roomId: kitchenRoomId,
      x: round2(bathW + kitchenW / 2),
      y: round2(kitchenD / 2),
      z: H,
      referenceWall: 'Laje/Forro',
      referenceDistance: round2(kitchenW / 2),
      powerVA: 100,
      voltage: 127,
      powerFactor: 0.92,
      circuitId: 'C1-ILUM',
      conductorSectionMm2: 1.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 10A Curva B',
      notes: '',
    },
    {
      id: `${id}-el-5`,
      code: 'TM-COZ-1',
      category: 'tomada_media',
      label: 'Tomada Bancada Pia',
      roomId: kitchenRoomId,
      x: round2(bathW + 0.45),
      y: 0.12,
      z: 1.1,
      referenceWall: 'P-EXT-N',
      referenceDistance: 0.45,
      powerVA: 600,
      voltage: 127,
      powerFactor: 0.85,
      circuitId: 'C4-COZ',
      conductorSectionMm2: 2.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 20A + DR 30mA',
      notes: 'Sobre bancada',
    },
    {
      id: `${id}-el-6`,
      code: 'TUE-GEL',
      category: 'geladeira',
      label: 'Tomada Geladeira',
      roomId: kitchenRoomId,
      x: round2(W - 0.45),
      y: 0.12,
      z: 0.65,
      referenceWall: 'P-EXT-N',
      referenceDistance: round2(W - 0.45),
      powerVA: 350,
      voltage: 127,
      powerFactor: 0.85,
      circuitId: 'C4-COZ',
      conductorSectionMm2: 2.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 20A + DR 30mA',
      notes: '',
    },
    {
      id: `${id}-el-7`,
      code: 'TUE-COOK',
      category: 'cooktop',
      label: 'Ponto Cooktop / Micro-ondas',
      roomId: kitchenRoomId,
      x: round2(bathW + 1.0),
      y: 0.12,
      z: 0.65,
      referenceWall: 'P-EXT-N',
      referenceDistance: 1.0,
      powerVA: 1800,
      voltage: 220,
      powerFactor: 0.95,
      circuitId: 'C5-TUE-COZ',
      conductorSectionMm2: 4.0,
      conduitDiameterMm: 25,
      protection: 'Disjuntor 20A + DR 30mA',
      notes: 'Circuito específico bancada',
    },
    {
      id: `${id}-el-8`,
      code: 'IL-EST',
      category: 'iluminacao_teto',
      label: 'Ponto Luz Principal',
      roomId: mainRoomId,
      x: round2(W / 2),
      y: round2(kitchenD + mainRoomD / 2),
      z: H,
      referenceWall: 'Laje/Forro',
      referenceDistance: round2(W / 2),
      powerVA: 160,
      voltage: 127,
      powerFactor: 0.92,
      circuitId: 'C1-ILUM',
      conductorSectionMm2: 1.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 10A Curva B',
      notes: '',
    },
    {
      id: `${id}-el-9`,
      code: 'TB-EST-1',
      category: 'tomada_baixa',
      label: 'Tomada Baixa Cabeceira',
      roomId: hasSeparateBedroom ? bedroomRoomId : mainRoomId,
      x: round2(W - 0.15),
      y: round2(usableD - 1.2),
      z: 0.3,
      referenceWall: 'P-EXT-L',
      referenceDistance: 1.2,
      powerVA: 100,
      voltage: 127,
      powerFactor: 0.85,
      circuitId: 'C2-TUG',
      conductorSectionMm2: 2.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 16A',
      notes: '',
    },
    {
      id: `${id}-el-10`,
      code: 'TB-EST-2',
      category: 'tomada_baixa',
      label: 'Tomada Baixa Mesa/TV',
      roomId: mainRoomId,
      x: deskPointX,
      y: deskPointY,
      z: 0.3,
      referenceWall: 'P-EXT-O',
      referenceDistance: 0.9,
      powerVA: 200,
      voltage: 127,
      powerFactor: 0.85,
      circuitId: 'C2-TUG',
      conductorSectionMm2: 2.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 16A',
      notes: '',
    },
    {
      id: `${id}-el-11`,
      code: 'TA-AC',
      category: 'ar_condicionado',
      label: 'Tomada Alta Ar-Condicionado',
      roomId: hasSeparateBedroom ? bedroomRoomId : mainRoomId,
      x: round2(W / 2),
      y: round2(usableD - 0.14),
      z: 2.25,
      referenceWall: 'P-EXT-S',
      referenceDistance: round2(W / 2),
      powerVA: 1200,
      voltage: 220,
      powerFactor: 0.9,
      circuitId: 'C6-AC',
      conductorSectionMm2: 2.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 16A Bipolar',
      notes: 'Split 9.000 BTUs',
    },
    {
      id: `${id}-el-12`,
      code: 'INT-01',
      category: 'interruptor',
      label: 'Interruptor Duplo Entrada',
      roomId: mainRoomId,
      x:
        entrySide === 'lateral_esquerda'
          ? 0.14
          : entrySide === 'frente'
            ? round2(hasSeparateBedroom ? 1.08 : W - 1.12)
            : round2(W - 0.14),
      y: entrySide === 'frente' ? round2(usableD - 0.14) : round2(kitchenD + 0.18),
      z: 1.1,
      referenceWall:
        entrySide === 'lateral_esquerda'
          ? 'P-EXT-O'
          : entrySide === 'frente'
            ? 'P-EXT-S'
            : 'P-EXT-L',
      referenceDistance: 0.18,
      powerVA: 0,
      voltage: 127,
      powerFactor: 1,
      circuitId: 'C1-ILUM',
      conductorSectionMm2: 1.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 10A Curva B',
      notes: 'Aciona Iluminação Estar + Cozinha',
    },
    // Special Installations (Telecom, Antena Coletiva/TV, Internet/Wi-Fi, Interfone, CFTV)
    {
      id: `${id}-esp-dados`,
      code: 'RJ45-01',
      category: 'dados',
      label: 'Ponto Rede Dados RJ45 Cat6 (Internet)',
      roomId: tvRoom,
      x: deskPointX,
      y: round2(Math.max(kitchenD + 0.18, deskPointY - 0.18)),
      z: 0.35,
      referenceWall: 'P-EXT-S',
      referenceDistance: deskPointX,
      powerVA: 0,
      voltage: 127,
      powerFactor: 1,
      circuitId: 'C7-ESP',
      conductorSectionMm2: 1.5,
      conduitDiameterMm: 25,
      protection: 'Eletroduto Seco Telecom Ø25mm',
      notes: 'Cabo UTP Cat6 até Rack Central',
    },
    {
      id: `${id}-esp-tv`,
      code: 'TV-01',
      category: 'antena_tv',
      label: 'Ponto Antena Coletiva UHF/HDTV + Duto HDMI',
      roomId: tvRoom,
      x: tvPointX,
      y: round2(kitchenD + 0.14),
      z: 1.1,
      referenceWall: 'P-INT-BWC2',
      referenceDistance: tvPointX,
      powerVA: 0,
      voltage: 127,
      powerFactor: 1,
      circuitId: 'C7-ESP',
      conductorSectionMm2: 1.5,
      conduitDiameterMm: 25,
      protection: 'Caixa 4x2 Coaxial RG6',
      notes: 'Derivação prumada Antena Coletiva',
    },
    {
      id: `${id}-esp-wifi`,
      code: 'WIFI-01',
      category: 'wifi_ap',
      label: 'Ponto Roteador / Access Point Wi-Fi 6 PoE',
      roomId: tvRoom,
      x: round2(tvPointX + 0.35),
      y: round2(kitchenD + 0.45),
      z: 2.35,
      referenceWall: 'Laje/Forro',
      referenceDistance: round2(tvPointX + 0.35),
      powerVA: 15,
      voltage: 127,
      powerFactor: 0.95,
      circuitId: 'C7-ESP',
      conductorSectionMm2: 1.5,
      conduitDiameterMm: 20,
      protection: 'Switch PoE Rack Telecom',
      notes: 'Alimentação PoE via Cat6',
    },
    {
      id: `${id}-esp-intf`,
      code: 'INTF-01',
      category: 'interfone',
      label: 'Interfone / Vídeo Porteiro IP',
      roomId: mainRoomId,
      x:
        entrySide === 'lateral_esquerda'
          ? 0.14
          : entrySide === 'frente'
            ? round2(hasSeparateBedroom ? 1.08 : W - 1.12)
            : round2(W - 0.14),
      y:
        entrySide === 'frente'
          ? round2(usableD - 0.14)
          : round2(kitchenD + 1.28),
      z: 1.4,
      referenceWall:
        entrySide === 'lateral_esquerda'
          ? 'P-EXT-O'
          : entrySide === 'frente'
            ? 'P-EXT-S'
            : 'P-EXT-L',
      referenceDistance: round2(kitchenD + 1.28),
      powerVA: 15,
      voltage: 127,
      powerFactor: 0.95,
      circuitId: 'C7-ESP',
      conductorSectionMm2: 1.5,
      conduitDiameterMm: 20,
      protection: 'Central Interfonia Portaria',
      notes: 'Junto à porta de entrada P1',
    },
    {
      id: `${id}-esp-cftv`,
      code: 'CFTV-01',
      category: 'cftv',
      label: 'Câmera CFTV IP PoE 4MP (Acesso/Corredor)',
      roomId: mainRoomId,
      x:
        entrySide === 'lateral_esquerda'
          ? -0.06
          : entrySide === 'frente'
            ? round2(hasSeparateBedroom ? 0.56 : W - 0.6)
            : round2(W + 0.06),
      y:
        entrySide === 'frente'
          ? round2(usableD + 0.06)
          : round2(kitchenD + 0.65),
      z: 2.55,
      referenceWall:
        entrySide === 'lateral_esquerda'
          ? 'P-EXT-O (Ext)'
          : entrySide === 'frente'
            ? 'P-EXT-S (Ext)'
            : 'P-EXT-L (Ext)',
      referenceDistance: round2(kitchenD + 0.65),
      powerVA: 15,
      voltage: 127,
      powerFactor: 0.95,
      circuitId: 'C7-ESP',
      conductorSectionMm2: 1.5,
      conduitDiameterMm: 20,
      protection: 'NVR 8CH + Switch PoE',
      notes: 'Monitoramento externo acesso da unidade P1',
    },
  );

  if (input.hasLaundry) {
    electricalPoints.push({
      id: `${id}-el-maq`,
      code: 'TUE-MAQ',
      category: 'maquina_lavar',
      label: 'Tomada Máquina de Lavar',
      roomId: laundryRoomId,
      x: round2(W - 0.25),
      y: round2(kDepth * 0.65 + 0.12),
      z: 0.9,
      referenceWall: 'P-EXT-L',
      referenceDistance: round2(kDepth * 0.65 + 0.12),
      powerVA: 1000,
      voltage: 127,
      powerFactor: 0.85,
      circuitId: 'C4-COZ',
      conductorSectionMm2: 2.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 20A + DR 30mA',
      notes: 'Ponto área de serviço',
    });
  }

  // 6. Water Points (AF & AQ)
  waterPoints.push(
    {
      id: `${id}-af-chuv`,
      code: 'AF-01',
      category: 'chuveiro',
      equipment: 'Chuveiro BWC (Água Fria)',
      roomId: bathRoomId,
      x: 0.4,
      y: 0.14,
      z: 2.15,
      waterType: 'fria',
      diameterMm: 25,
      material: 'PVC Soldável',
      availablePressureMca: 4.5,
      supplySource: 'Coluna AF-01',
      branchName: 'Sub-ramal BWC',
      weightHunter: 0.1,
      notes: '',
    },
    {
      id: `${id}-aq-chuv`,
      code: 'AQ-02',
      category: 'agua_quente',
      equipment: 'Misturador Chuveiro BWC (Água Quente)',
      roomId: bathRoomId,
      x: 0.48,
      y: 0.14,
      z: 1.15,
      waterType: 'quente',
      diameterMm: 22,
      material: 'CPVC Aquatherm',
      availablePressureMca: 4.5,
      supplySource: 'Aquecedor Central/Passagem',
      branchName: 'Sub-ramal AQ BWC',
      weightHunter: 0.1,
      notes: '',
    },
    {
      id: `${id}-af-vaso`,
      code: 'AF-02',
      category: 'vaso_sanitario',
      equipment: 'Bacia c/ Caixa Acoplada',
      roomId: bathRoomId,
      x: round2(Math.max(boxW + 0.25, bathW - 0.3)),
      y: 0.14,
      z: 0.2,
      waterType: 'fria',
      diameterMm: 20,
      material: 'PVC Soldável',
      availablePressureMca: 6.4,
      supplySource: 'Coluna AF-01',
      branchName: 'Sub-ramal BWC',
      weightHunter: 0.3,
      notes: '',
    },
    {
      id: `${id}-af-lav`,
      code: 'AF-03',
      category: 'lavatorio',
      equipment: 'Lavatório BWC',
      roomId: bathRoomId,
      x: 0.36,
      y: round2(bathD - 0.14),
      z: 0.6,
      waterType: 'fria',
      diameterMm: 20,
      material: 'PVC Soldável',
      availablePressureMca: 6.0,
      supplySource: 'Coluna AF-01',
      branchName: 'Sub-ramal BWC',
      weightHunter: 0.3,
      notes: '',
    },
    {
      id: `${id}-af-pia`,
      code: 'AF-04',
      category: 'pia',
      equipment: 'Pia de Cozinha (Água Fria)',
      roomId: kitchenRoomId,
      x: round2(bathW + 0.45),
      y: 0.14,
      z: 0.6,
      waterType: 'fria',
      diameterMm: 25,
      material: 'PVC Soldável',
      availablePressureMca: 6.0,
      supplySource: 'Coluna AF-02',
      branchName: 'Ramal Cozinha',
      weightHunter: 0.7,
      notes: '',
    },
    {
      id: `${id}-aq-pia`,
      code: 'AQ-01',
      category: 'agua_quente',
      equipment: 'Pia de Cozinha (Água Quente)',
      roomId: kitchenRoomId,
      x: round2(bathW + 0.6),
      y: 0.14,
      z: 0.6,
      waterType: 'quente',
      diameterMm: 22,
      material: 'CPVC Aquatherm',
      availablePressureMca: 5.5,
      supplySource: 'Aquecedor Passagem / Central',
      branchName: 'Ramal AQ Cozinha',
      weightHunter: 0.7,
      notes: '',
    },
  );

  if (input.hasLaundry) {
    waterPoints.push(
      {
        id: `${id}-af-maq`,
        code: 'AF-05',
        category: 'maquina_lavar',
        equipment: 'Máquina de Lavar',
        roomId: laundryRoomId,
        x: round2(W - 0.45),
        y: round2(kDepth * 0.65 + 0.1),
        z: 0.9,
        waterType: 'fria',
        diameterMm: 20,
        material: 'PVC Soldável',
        availablePressureMca: 5.7,
        supplySource: 'Coluna AF-02',
        branchName: 'Ramal A.S.',
        weightHunter: 1.0,
        notes: '',
      },
      {
        id: `${id}-af-tq`,
        code: 'AF-06',
        category: 'tanque',
        equipment: 'Tanque Área de Serviço',
        roomId: laundryRoomId,
        x: round2(bathW + 0.36),
        y: round2(kDepth * 0.65 + 0.1),
        z: 1.05,
        waterType: 'fria',
        diameterMm: 20,
        material: 'PVC Soldável',
        availablePressureMca: 5.7,
        supplySource: 'Coluna AF-02',
        branchName: 'Ramal A.S.',
        weightHunter: 0.7,
        notes: '',
      },
    );
  }

  // 7. Drainage Points (Connected Sanitary Network + Floor Drains)
  const csId = `${id}-esg-cs`;
  const tqId = `${id}-esg-tq`;
  const cgId = `${id}-esg-cg`;

  drainagePoints.push(
    {
      id: tqId,
      code: 'TQ-01',
      category: 'tubo_queda',
      roomId: bathRoomId,
      x: 0.14,
      y: 0.14,
      diameterMm: 100,
      material: 'PVC Esgoto SN',
      slopePercent: 1.0,
      uhc: 0,
      connectedToId: 'CI-GERAL',
      notes: 'Tubo de Queda Principal Ø100mm',
    },
    {
      id: csId,
      code: 'CS-01',
      category: 'caixa_sifonada',
      roomId: bathRoomId,
      x: round2(bathW * 0.56),
      y: round2(bathD * 0.58),
      diameterMm: 100,
      material: 'PVC Esgoto SN',
      slopePercent: 2.0,
      uhc: 0,
      connectedToId: tqId,
      notes: 'Caixa sifonada 150x150x50mm c/ grelha inox',
    },
    {
      id: `${id}-esg-chuv`,
      code: 'RL-BOX',
      category: 'chuveiro',
      roomId: bathRoomId,
      x: round2(0.08 + boxW / 2),
      y: round2(0.08 + boxD * 0.55),
      diameterMm: 40,
      material: 'PVC Esgoto SN',
      slopePercent: 2.0,
      uhc: 2,
      connectedToId: csId,
      notes: 'Ralo linear/seco box Ø40mm → CS-01 (i=2%)',
    },
    {
      id: `${id}-esg-rs`,
      code: 'RS-BWC',
      category: 'ralo',
      roomId: bathRoomId,
      x: round2(bathW - 0.24),
      y: round2(bathD - 0.24),
      diameterMm: 40,
      material: 'PVC Esgoto SN',
      slopePercent: 2.0,
      uhc: 1,
      connectedToId: csId,
      notes: 'Ralo seco de piso BWC Ø40mm → CS-01 (i=2%)',
    },
    {
      id: `${id}-esg-lav`,
      code: 'ES-LAV',
      category: 'lavatorio',
      roomId: bathRoomId,
      x: 0.36,
      y: round2(bathD - 0.16),
      diameterMm: 40,
      material: 'PVC Esgoto SN',
      slopePercent: 2.0,
      uhc: 1,
      connectedToId: csId,
      notes: 'Sifão lavatório Ø40mm → CS-01',
    },
    {
      id: `${id}-esg-vaso`,
      code: 'ES-VASO',
      category: 'vaso_sanitario',
      roomId: bathRoomId,
      x: round2(Math.max(boxW + 0.25, bathW - 0.3)),
      y: 0.34,
      diameterMm: 100,
      material: 'PVC Esgoto SN',
      slopePercent: 1.0,
      uhc: 6,
      connectedToId: tqId,
      notes: 'Ramal primário bacia Ø100mm (i=1%)',
    },
    {
      id: cgId,
      code: 'CG-01',
      category: 'caixa_gordura',
      roomId: kitchenRoomId,
      x: round2(bathW + 0.28),
      y: 0.36,
      diameterMm: 75,
      material: 'PVC Esgoto SN',
      slopePercent: 2.0,
      uhc: 0,
      connectedToId: tqId,
      notes: 'Caixa de gordura (saída Ø75mm p/ coletor)',
    },
    {
      id: `${id}-esg-pia`,
      code: 'ES-PIA',
      category: 'pia',
      roomId: kitchenRoomId,
      x: round2(bathW + 0.55),
      y: 0.22,
      diameterMm: 50,
      material: 'PVC Esgoto SN',
      slopePercent: 2.0,
      uhc: 3,
      connectedToId: cgId,
      notes: 'Saída pia cozinha Ø50mm → CG-01 (i=2%)',
    },
    {
      id: `${id}-esg-vent`,
      code: 'VENT-01',
      category: 'ventilacao',
      roomId: bathRoomId,
      x: 0.14,
      y: round2(bathD - 0.14),
      diameterMm: 50,
      material: 'PVC Esgoto SN',
      slopePercent: 2.0,
      uhc: 0,
      connectedToId: tqId,
      notes: 'Coluna de ventilação sanitária Ø50mm',
    },
  );

  if (input.hasLaundry) {
    drainagePoints.push(
      {
        id: `${id}-esg-tq-as`,
        code: 'ES-TQ',
        category: 'tanque',
        roomId: laundryRoomId,
        x: round2(bathW + 0.36),
        y: round2(kDepth * 0.65 + 0.18),
        diameterMm: 40,
        material: 'PVC Esgoto SN',
        slopePercent: 2.0,
        uhc: 3,
        connectedToId: csId,
        notes: 'Saída tanque A.S. Ø40mm → CS-01',
      },
      {
        id: `${id}-esg-maq`,
        code: 'ES-MAQ',
        category: 'maquina_lavar',
        roomId: laundryRoomId,
        x: round2(W - 0.42),
        y: round2(kDepth * 0.65 + 0.18),
        diameterMm: 50,
        material: 'PVC Esgoto SN',
        slopePercent: 2.0,
        uhc: 3,
        connectedToId: csId,
        notes: 'Saída máquina de lavar Ø50mm → CS-01',
      },
    );
  }

  return {
    id,
    code: input.code,
    name: input.name,
    basePreset: input.basePreset ?? 'Personalizada',
    targetArea: round2(W * D),
    width: W,
    depth: D,
    ceilingHeight: H,
    bedrooms: input.bedrooms,
    bathrooms: 1,
    kitchens: 1,
    hasLaundry: input.hasLaundry,
    hasBalcony: input.hasBalcony,
    hasMezzanine,
    mezzanine,
    entrySide,
    internalPartitionType,
    accessible: input.accessible,
    finishStandard: input.finishStandard ?? 'padrao',
    rooms,
    walls,
    openings,
    furniture,
    electricalPoints,
    waterPoints,
    drainagePoints,
    dimensions: [
      { id: `${id}-dim-w`, start: { x: 0, y: 0 }, end: { x: W, y: 0 }, offset: -0.45 },
      { id: `${id}-dim-d`, start: { x: 0, y: 0 }, end: { x: 0, y: D }, offset: -0.45 },
    ],
  };
}

export function getDefaultNormativeReferences(): NormativeReference[] {
  return [
    {
      id: 'nbr-6492',
      code: 'ABNT NBR 6492',
      title: 'Documentação técnica para projetos arquitetônicos e urbanísticos',
      edition: '2021',
      date: '2021-12-09',
      discipline: 'Arquitetura',
      application: 'Representação gráfica, pranchas, carimbo e cotas',
      source: 'ABNT Catálogo (verificar vigência)',
      parametersSummary: 'Níveis, escalas, simbologia e carimbo técnico',
      updateStatus: 'verificar_vigencia',
      verifiedBy: '',
    },
    {
      id: 'nbr-16636',
      code: 'ABNT NBR 16636',
      title: 'Elaboração e desenvolvimento de serviços técnicos especializados de projetos arquitetônicos',
      edition: '2017',
      date: '2017-12-07',
      discipline: 'Arquitetura',
      application: 'Etapas de projeto (EP, AP, PE)',
      source: 'ABNT Catálogo',
      parametersSummary: 'Fases de projeto e entregáveis',
      updateStatus: 'verificar_vigencia',
      verifiedBy: '',
    },
    {
      id: 'nbr-9050',
      code: 'ABNT NBR 9050',
      title: 'Acessibilidade a edificações, mobiliário, espaços e equipamentos urbanos',
      edition: '2020 (Emenda 1:2021)',
      date: '2021-01-25',
      discipline: 'Acessibilidade',
      application: 'Rotas acessíveis, portas >= 0,80m, giro 1,50m',
      source: 'ABNT Catálogo',
      parametersSummary: 'Vão livre mínimo porta 0,80m; corredor >= 1,20m; giro 1,50m',
      updateStatus: 'verificar_vigencia',
      verifiedBy: '',
    },
    {
      id: 'nbr-5410',
      code: 'ABNT NBR 5410',
      title: 'Instalações elétricas de baixa tensão',
      edition: '2004 (Versão Corrigida 2008)',
      date: '2008-03-17',
      discipline: 'Elétrica',
      application: 'Dimensionamento de condutores, DR, disjuntores e queda de tensão',
      source: 'ABNT Catálogo',
      parametersSummary: 'Seção mínima 1,5mm² (ilum) e 2,5mm² (tomadas); ΔV máx 4%',
      updateStatus: 'verificar_vigencia',
      verifiedBy: '',
    },
    {
      id: 'nbr-5626',
      code: 'ABNT NBR 5626',
      title: 'Sistemas prediais de água fria e água quente',
      edition: '2020',
      date: '2020-06-29',
      discipline: 'Hidráulica',
      application: 'Pressões, velocidades, reservação e vazão provável',
      source: 'ABNT Catálogo',
      parametersSummary: 'Velocidade máx 3,0 m/s; pressão dinâmica mín 1,0 mca',
      updateStatus: 'verificar_vigencia',
      verifiedBy: '',
    },
    {
      id: 'nbr-8160',
      code: 'ABNT NBR 8160',
      title: 'Sistemas prediais de esgoto sanitário — Projeto e execução',
      edition: '1999',
      date: '1999-09-30',
      discipline: 'Sanitária',
      application: 'UHC, declividades mínimas e ventilação',
      source: 'ABNT Catálogo',
      parametersSummary: 'Declividade mín 2% (<=75mm) e 1% (>=100mm)',
      updateStatus: 'verificar_vigencia',
      verifiedBy: '',
    },
    {
      id: 'nbr-10844',
      code: 'ABNT NBR 10844',
      title: 'Instalações prediais de águas pluviais',
      edition: '1989',
      date: '1989-12-30',
      discipline: 'Pluvial',
      application: 'Calhas, condutores e vazão de projeto',
      source: 'ABNT Catálogo',
      parametersSummary: 'Requer intensidade pluviométrica local cadastrada',
      updateStatus: 'verificar_vigencia',
      verifiedBy: '',
    },
    {
      id: 'nbr-15575',
      code: 'ABNT NBR 15575',
      title: 'Edificações habitacionais — Desempenho',
      edition: '2021',
      date: '2021-09-14',
      discipline: 'Desempenho',
      application: 'Requisitos térmicos, acústicos e estruturais',
      source: 'ABNT Catálogo',
      parametersSummary: 'Avaliação por método construtivo e zona bioclimática',
      updateStatus: 'verificar_vigencia',
      verifiedBy: '',
    },
    {
      id: 'nbr-6118',
      code: 'ABNT NBR 6118',
      title: 'Projeto de estruturas de concreto — Procedimento',
      edition: '2023',
      date: '2023-08-30',
      discipline: 'Estrutural',
      application: 'Elementos de concreto armado (dimensionamento por eng. estrutural)',
      source: 'ABNT Catálogo',
      parametersSummary: 'Exige cálculo estrutural dedicado',
      updateStatus: 'verificar_vigencia',
      verifiedBy: '',
    },
    {
      id: 'nbr-6120',
      code: 'ABNT NBR 6120',
      title: 'Ações para o cálculo de estruturas de edificações',
      edition: '2019',
      date: '2019-09-23',
      discipline: 'Estrutural',
      application: 'Cargas permanentes e acidentais residenciais',
      source: 'ABNT Catálogo',
      parametersSummary: 'Carga acidental dormitórios/salas 1,5 kN/m²; corredores 2,0 kN/m²',
      updateStatus: 'verificar_vigencia',
      verifiedBy: '',
    },
    {
      id: 'nbr-6122',
      code: 'ABNT NBR 6122',
      title: 'Projeto e execução de fundações',
      edition: '2022',
      date: '2022-07-12',
      discipline: 'Estrutural',
      application: 'Fundações mediante investigação geotécnica (SPT)',
      source: 'ABNT Catálogo',
      parametersSummary: 'Exige laudo de sondagem geotécnica',
      updateStatus: 'verificar_vigencia',
      verifiedBy: '',
    },
    {
      id: 'nbr-8800',
      code: 'ABNT NBR 8800',
      title: 'Projeto de estruturas de aço e de estruturas mistas de aço e concreto',
      edition: '2024',
      date: '2024-06-15',
      discipline: 'Estrutural',
      application: 'Perfis metálicos e sistemas em aço',
      source: 'ABNT Catálogo',
      parametersSummary: 'Aplicável quando método estrutural utiliza perfis metálicos',
      updateStatus: 'verificar_vigencia',
      verifiedBy: '',
    },
    {
      id: 'nbr-9077',
      code: 'ABNT NBR 9077',
      title: 'Saídas de emergência em edifícios',
      edition: '2001',
      date: '2001-12-30',
      discipline: 'Incêndio',
      application: 'Rotas de fuga, largura de corredores e escadas',
      source: 'ABNT Catálogo / IT Corpo de Bombeiros',
      parametersSummary: 'Verificar Decreto Estadual do Corpo de Bombeiros local',
      updateStatus: 'verificar_vigencia',
      verifiedBy: '',
    },
  ];
}

export function createDefaultDemoProject(): Project {
  const now = new Date().toISOString();
  const sys: ConstructionMethodId = 'alvenaria_convencional';
  const extT = 0.15;
  const intT = 0.1;
  const ceilH = 2.8;

  // Acceptance Test (Section 34):
  // Tipologia A: 4 unidades de 20 m² (4.0m x 5.0m)
  // Tipologia B: 4 unidades de 25 m² (4.0m x 6.25m)
  // Tipologia C: 4 unidades de 30 m² (4.0m x 7.5m)
  const tipoA = generateParametricUnitLayout({
    id: 'ut-tipo-a',
    code: 'TIPO-A',
    name: 'Tipologia A — Kitnet Compacta 20 m²',
    basePreset: 'Kitnet compacta',
    width: 4.0,
    depth: 5.0,
    ceilingHeight: ceilH,
    bedrooms: 0,
    hasLaundry: false,
    hasBalcony: false,
    hasMezzanine: false,
    accessible: false,
    extWallThickness: extT,
    intWallThickness: intT,
    constructionSystem: sys,
    finishStandard: 'padrao',
  });

  const tipoB = generateParametricUnitLayout({
    id: 'ut-tipo-b',
    code: 'TIPO-B',
    name: 'Tipologia B — Studio Padrão 25 m²',
    basePreset: 'Studio',
    width: 4.0,
    depth: 6.25,
    ceilingHeight: ceilH,
    bedrooms: 0,
    hasLaundry: true,
    hasBalcony: false,
    hasMezzanine: false,
    accessible: false,
    extWallThickness: extT,
    intWallThickness: intT,
    constructionSystem: sys,
    finishStandard: 'padrao',
  });

  const tipoC = generateParametricUnitLayout({
    id: 'ut-tipo-c',
    code: 'TIPO-C',
    name: 'Tipologia C — Kitnet 1 Dormitório + Varanda 30 m²',
    basePreset: 'Kitnet com quarto independente',
    width: 4.0,
    depth: 7.5,
    ceilingHeight: ceilH,
    bedrooms: 1,
    hasLaundry: true,
    hasBalcony: true,
    hasMezzanine: false,
    accessible: false,
    extWallThickness: extT,
    intWallThickness: intT,
    constructionSystem: sys,
    finishStandard: 'padrao',
  });

  const createFloorUnits = (floorId: string, prefix: string): UnitInstance[] => [
    // Left Wing (x = 1.0)
    { id: `${floorId}-u1`, unitNumber: `${prefix}01`, unitTypeId: tipoA.id, floorId, x: 1.0, y: 4.0, rotationDeg: 0, mirrored: false },
    { id: `${floorId}-u2`, unitNumber: `${prefix}02`, unitTypeId: tipoB.id, floorId, x: 1.0, y: 9.0, rotationDeg: 0, mirrored: false },
    { id: `${floorId}-u3`, unitNumber: `${prefix}03`, unitTypeId: tipoC.id, floorId, x: 1.0, y: 15.25, rotationDeg: 0, mirrored: false },
    // Right Wing (x = 7.0)
    { id: `${floorId}-u4`, unitNumber: `${prefix}04`, unitTypeId: tipoA.id, floorId, x: 7.0, y: 4.0, rotationDeg: 0, mirrored: true },
    { id: `${floorId}-u5`, unitNumber: `${prefix}05`, unitTypeId: tipoB.id, floorId, x: 7.0, y: 9.0, rotationDeg: 0, mirrored: true },
    { id: `${floorId}-u6`, unitNumber: `${prefix}06`, unitTypeId: tipoC.id, floorId, x: 7.0, y: 15.25, rotationDeg: 0, mirrored: true },
  ];

  const floor1: Floor = {
    id: 'fl-terreo',
    levelIndex: 0,
    name: 'Pavimento Térreo',
    elevation: 0,
    floorToFloorHeight: 2.95,
    slabThickness: 0.15,
    corridorWidth: 2.0,
    commonAreaM2: 37.5,
    units: createFloorUnits('fl-terreo', '1'),
    extraWalls: [],
    extraOpenings: [],
  };

  const floor2: Floor = {
    id: 'fl-superior',
    levelIndex: 1,
    name: 'Pavimento Superior',
    elevation: 2.95,
    floorToFloorHeight: 2.95,
    slabThickness: 0.15,
    corridorWidth: 2.0,
    commonAreaM2: 37.5,
    units: createFloorUnits('fl-superior', '2'),
    extraWalls: [],
    extraOpenings: [],
  };

  // Conceptual structural grid aligned to wings (x = 1.0, 5.0, 7.0, 11.0; y = 4.0, 9.0, 15.25, 22.75)
  const structuralElements: StructuralElement[] = [];
  const xs = [1.0, 5.0, 7.0, 11.0];
  const ys = [4.0, 9.0, 15.25, 22.75];
  let colIdx = 1;
  for (const x of xs) {
    for (const y of ys) {
      structuralElements.push({
        id: `str-p-${colIdx}`,
        code: `P${colIdx}`,
        type: 'pilar',
        floorId: 'fl-terreo',
        x: round2(x - 0.1),
        y: round2(y - 0.1),
        width: 0.2,
        depth: 0.2,
        height: 5.9,
        material: 'Concreto Armado (conceitual)',
        sectionLabel: '20x20 cm (pré-lançamento conceitual)',
        isDimensioned: false,
        notes: 'Aguarda cálculo estrutural por engenheiro habilitado.',
      });
      colIdx += 1;
    }
  }
  structuralElements.push({
    id: 'str-esc-1',
    code: 'ESC-01',
    type: 'escada',
    floorId: 'fl-terreo',
    x: 5.3,
    y: 19.6,
    width: 1.4,
    depth: 3.1,
    height: 2.95,
    material: 'Concreto Armado (conceitual)',
    sectionLabel: 'Largura 1,40m — 16 degraus 18,4x28cm',
    isDimensioned: false,
    notes: 'Escada de acesso ao pavimento superior.',
  });

  const siteVertices = buildSiteVerticesFromDimensions(12, 12, 25, 25);

  return {
    schemaVersion: 1,
    id: 'proj-demo-kitnet-12',
    code: 'KPS-2026-001',
    name: 'Residencial Compacto Modelo (12 Unidades)',
    status: 'em_andamento',
    stage: 'estudo_preliminar',
    client: 'Empreendimento Demonstrativo Padrão',
    owner: 'Não informado',
    address: 'Lote Urbano Modelo — Quadra 01, Lote 12',
    municipality: 'Não informado',
    state: 'SP',
    createdAt: now,
    updatedAt: now,
    site: {
      shapeType: 'retangular',
      front: 12,
      back: 12,
      leftDepth: 25,
      rightDepth: 25,
      declaredArea: 300,
      vertices: siteVertices,
      orientationDeg: 0,
      topography: 'plano',
      slopePercent: 0,
      levelDifference: 0,
      elevationStart: 0,
      elevationEnd: 0,
      confrontations: {
        front: 'Logradouro Público (Rua Principal)',
        back: 'Lote Confrontante Posterior',
        left: 'Lote Confrontante Lateral Esquerdo',
        right: 'Lote Confrontante Lateral Direito',
      },
      setbacks: {
        front: 4.0,
        back: 1.5,
        left: 1.0,
        right: 1.0,
      },
      easementArea: 0,
      restrictions: 'Nenhuma restrição adicional cadastrada até o momento.',
    },
    urbanRules: [
      {
        id: 'urb-1',
        category: 'taxa_ocupacao',
        description: 'Taxa de Ocupação Máxima (Exemplo editável — confirmar no Plano Diretor local)',
        municipality: 'Não informado',
        source: 'Cadastro do usuário (pendente confirmação municipal)',
        lawReference: 'NÃO INFORMADO',
        referenceDate: '2026-01-01',
        effectiveStatus: 'Pendente confirmação municipal',
        parameterKey: 'occupancyRate',
        parameterLimit: 70,
        unit: '%',
        condition: 'max',
        notes: 'Substituir pelo índice oficial do zoneamento do município.',
      },
      {
        id: 'urb-2',
        category: 'coef_aproveitamento',
        description: 'Coeficiente de Aproveitamento Básico',
        municipality: 'Não informado',
        source: 'Cadastro do usuário (pendente confirmação municipal)',
        lawReference: 'NÃO INFORMADO',
        referenceDate: '2026-01-01',
        effectiveStatus: 'Pendente confirmação municipal',
        parameterKey: 'far',
        parameterLimit: 1.5,
        unit: 'x',
        condition: 'max',
        notes: 'Relação entre área total computável e área do terreno.',
      },
      {
        id: 'urb-3',
        category: 'permeabilidade',
        description: 'Taxa de Permeabilidade Mínima do Terreno',
        municipality: 'Não informado',
        source: 'Cadastro do usuário (pendente confirmação municipal)',
        lawReference: 'NÃO INFORMADO',
        referenceDate: '2026-01-01',
        effectiveStatus: 'Pendente confirmação municipal',
        parameterKey: 'permeabilityRate',
        parameterLimit: 15,
        unit: '%',
        condition: 'min',
        notes: 'Considera área livre fora da projeção edificada.',
      },
      {
        id: 'urb-4',
        category: 'altura_gabarito',
        description: 'Gabarito / Altura Máxima Cadastrada',
        municipality: 'Não informado',
        source: 'Cadastro do usuário',
        lawReference: 'NÃO INFORMADO',
        referenceDate: '2026-01-01',
        effectiveStatus: 'Pendente confirmação municipal',
        parameterKey: 'buildingHeight',
        parameterLimit: null,
        unit: 'm',
        condition: 'max',
        notes: 'Informe o limite municipal para validação.',
      },
    ],
    constructionMethod: {
      methodId: 'alvenaria_convencional',
      name: 'Alvenaria Convencional',
      externalWallThickness: 0.15,
      internalWallThickness: 0.1,
      roofType: 'telha_termoacustica',
      roofSlopePercent: 8,
      masonryBlockType: 'Bloco cerâmico vedação 9x19x19cm / 14x19x19cm',
      mortarType: 'Argamassa mista 1:2:8 (cimento:cal:areia)',
      insulationSpec: 'Telha sanduíche termoacústica PIR 30mm',
      notes: 'Estrutura independente em concreto armado (pilares/vigas/lajes) a ser dimensionada.',
    },
    floors: [floor1, floor2],
    unitTypes: [tipoA, tipoB, tipoC],
    structuralElements,
    rainwaterElements: [
      {
        id: 'rw-cob-1',
        code: 'COB-01',
        type: 'cobertura',
        description: 'Cobertura Bloco Principal (2 águas / Platibanda)',
        catchmentAreaM2: 187.5,
        diameterOrSection: '10,0m x 18,75m',
        slopePercent: 8,
        notes: 'Projeção horizontal da cobertura.',
      },
      {
        id: 'rw-cal-1',
        code: 'CAL-01',
        type: 'calha',
        description: 'Calha metálica chapa galvanizada nº 24',
        catchmentAreaM2: 187.5,
        diameterOrSection: 'Seção 200x120mm (conceitual)',
        slopePercent: 0.5,
        notes: 'Dimensionamento definitivo depende da intensidade pluviométrica.',
      },
      {
        id: 'rw-cond-1',
        code: 'AP-01..04',
        type: 'tubo_descida',
        description: '4 Tubos de queda pluviais Ø100mm',
        catchmentAreaM2: 187.5,
        diameterOrSection: 'Ø 100mm PVC',
        slopePercent: 90,
        notes: '',
      },
    ],
    rainwaterConfig: {
      municipality: '',
      rainfallIntensityMmH: null,
      returnPeriodYears: null,
      sourceReference: '',
      referencePeriod: '',
    },
    electricalHeights: {
      tomadaBaixa: 0.3,
      tomadaMedia: 1.1,
      tomadaAlta: 2.1,
      interruptor: 1.1,
      arCondicionado: 2.25,
      chuveiro: 2.2,
      iluminacaoTeto: 2.8,
    },
    hydraulicConfig: {
      occupantsPerUnit: 2,
      litersPerPersonDay: 150,
      reserveDays: 2,
      supplyVoltage: 220,
      coldWaterMaterial: 'PVC Soldável Marrom',
      hotWaterMaterial: 'CPVC Aquatherm',
      hasHotWaterHeating: true,
      heatingSystem: 'Aquecimento elétrico/solar individual ou central (configurável)',
    },
    professionals: [
      {
        id: 'prof-1',
        role: 'arquiteto',
        name: '',
        profession: 'Arquiteto(a) e Urbanista',
        council: 'CAU',
        registrationNumber: '',
        state: 'SP',
        attribution: 'Projeto Arquitetônico e Acessibilidade',
        discipline: 'Arquitetura',
        artRrtCode: '',
        attachmentName: '',
      },
      {
        id: 'prof-2',
        role: 'eng_civil',
        name: '',
        profession: 'Engenheiro(a) Civil',
        council: 'CREA',
        registrationNumber: '',
        state: 'SP',
        attribution: 'Projeto Estrutural e Instalações Hidrossanitárias',
        discipline: 'Estrutura / Hidráulica',
        artRrtCode: '',
        attachmentName: '',
      },
    ],
    budgetEntries: [],
    budgetSettings: {
      sourceBase: 'Orçamento Manual / Base Própria (sem SINAPI vinculada)',
      region: 'Não informada',
      competence: '2026-11',
      referenceDate: '2026-11-20',
      socialChargesPercent: null,
      bdiPercent: 22,
      indirectCostsPercent: 5,
      discountPercent: 0,
      criteriaNotes: 'Itens sem cotação informada aparecem explicitamente como SEM COTAÇÃO.',
    },
    normativeRefs: getDefaultNormativeReferences(),
    renderSettings: {
      facadeColor: '#D6D9DF',
      interiorWallColor: '#F3F4F6',
      floorMaterial: 'porcelanato_cinza',
      roofMaterial: 'termoacustica_zinco',
      windowFrameColor: 'aluminio_preto',
      timeOfDay: 'dia',
      sunAzimuthDeg: 42,
      sunElevationDeg: 52,
      artificialLightsOn: false,
    },
    memorialOverrides: {},
    revisions: [
      {
        id: 'rev-00',
        revisionCode: 'R00',
        timestamp: now,
        author: 'Sistema — Empreendimento Modelo',
        description: 'Criação inicial do empreendimento demonstrativo (12x25m, 2 pavimentos, 12 unidades em 3 tipologias).',
        stage: 'estudo_preliminar',
      },
    ],
    fireSafetyNotes: {
      occupancyClass: 'A-2 (Habitação Multifamiliar — confirmar legislação estadual)',
      stateRegulation: 'Não informada (selecionar Decreto/IT do Corpo de Bombeiros do Estado)',
      estimatedPopulationPerUnit: 2,
      hasExtinguishers: true,
      hasEmergencyLighting: true,
      hasSignage: true,
      hasHydrants: false,
      verifiedByProfessional: false,
    },
    accessibilityConfig: {
      normReference: 'ABNT NBR 9050:2020 (Emenda 1:2021)',
      requireAccessibleUnits: true,
      minDoorWidthM: 0.8,
      minCorridorWidthM: 1.2,
      turningCircleDiameterM: 1.5,
    },
  };
}

export function createBlankProject(params: {
  name: string;
  client: string;
  municipality: string;
  state: string;
  front: number;
  depth: number;
  floorsCount: number;
  methodId: ConstructionMethodId;
}): Project {
  const id = nextId('proj');
  const now = new Date().toISOString();
  const front = Math.max(4, params.front);
  const depth = Math.max(6, params.depth);
  const vertices = buildSiteVerticesFromDimensions(front, front, depth, depth);
  const uf = (params.state || '').trim().toUpperCase();

  const floors: Floor[] = [];
  for (let i = 0; i < Math.max(1, params.floorsCount); i++) {
    floors.push({
      id: nextId('fl'),
      levelIndex: i,
      name: i === 0 ? 'Pavimento Térreo' : `${i}º Pavimento`,
      elevation: round2(i * 2.95),
      floorToFloorHeight: 2.95,
      slabThickness: 0.15,
      corridorWidth: 1.5,
      commonAreaM2: 0,
      units: [],
      extraWalls: [],
      extraOpenings: [],
    });
  }

  const methodThickness: Record<ConstructionMethodId, { ext: number; int: number; name: string }> = {
    alvenaria_convencional: { ext: 0.15, int: 0.1, name: 'Alvenaria Convencional' },
    alvenaria_estrutural: { ext: 0.14, int: 0.14, name: 'Alvenaria Estrutural' },
    light_steel_frame: { ext: 0.14, int: 0.11, name: 'Light Steel Frame' },
    wood_frame: { ext: 0.14, int: 0.11, name: 'Wood Frame' },
    pre_moldado: { ext: 0.15, int: 0.12, name: 'Concreto Pré-Moldado' },
    modular: { ext: 0.15, int: 0.11, name: 'Construção Modular' },
    misto: { ext: 0.15, int: 0.1, name: 'Sistema Misto' },
    personalizado: { ext: 0.15, int: 0.1, name: 'Sistema Personalizado' },
  };
  const mMeta = methodThickness[params.methodId] ?? methodThickness.alvenaria_convencional;
  const clientSafe = (params.client || '').trim() || 'Não informado';
  const muniSafe = (params.municipality || '').trim() || 'Não informado';

  return {
    schemaVersion: 1,
    id,
    code: `KPS-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 899)}`,
    name: (params.name || '').trim() || 'Novo Empreendimento',
    status: 'em_andamento',
    stage: 'estudo_conceitual',
    client: clientSafe,
    owner: clientSafe,
    address: 'Não informado',
    municipality: muniSafe,
    state: uf,
    createdAt: now,
    updatedAt: now,
    site: {
      shapeType: 'retangular',
      front,
      back: front,
      leftDepth: depth,
      rightDepth: depth,
      declaredArea: round2(front * depth),
      vertices,
      setbacks: {
        front: 3.0,
        back: 1.5,
        left: 1.5,
        right: 1.5,
      },
      topography: 'plano',
      levelDifference: 0,
      slopePercent: 0,
      elevationStart: 0,
      elevationEnd: 0,
      confrontations: {
        front: 'Não informado',
        back: 'Não informado',
        left: 'Não informado',
        right: 'Não informado',
      },
      orientationDeg: 0,
      easementArea: 0,
      restrictions: '',
    },
    urbanRules: [],
    constructionMethod: {
      methodId: params.methodId,
      name: mMeta.name,
      externalWallThickness: mMeta.ext,
      internalWallThickness: mMeta.int,
      roofType: 'telha_termoacustica',
      roofSlopePercent: 8,
      notes: 'Parâmetros construtivos iniciais editáveis no módulo Engenharia & Custos.',
    },
    floors,
    unitTypes: [],
    structuralElements: [],
    rainwaterElements: [],
    rainwaterConfig: {
      municipality: params.municipality.trim() || '',
      rainfallIntensityMmH: null,
      returnPeriodYears: null,
      sourceReference: '',
      referencePeriod: '',
    },
    electricalHeights: {
      tomadaBaixa: 0.3,
      tomadaMedia: 1.1,
      tomadaAlta: 2.1,
      interruptor: 1.1,
      arCondicionado: 2.25,
      chuveiro: 2.2,
      iluminacaoTeto: 2.8,
    },
    hydraulicConfig: {
      occupantsPerUnit: 2,
      litersPerPersonDay: 150,
      reserveDays: 2,
      supplyVoltage: uf === 'RJ' ? 127 : 220,
      coldWaterMaterial: 'PVC Soldável Marrom',
      hotWaterMaterial: 'CPVC Aquatherm',
      hasHotWaterHeating: true,
      heatingSystem: 'A definir no projeto hidrossanitário',
    },
    professionals: [],
    budgetEntries: [],
    budgetSettings: {
      sourceBase: 'SINAPI-RJ (CAIXA/IBGE) — Com Desoneração',
      region: uf === 'RJ' || !uf ? 'Rio de Janeiro (RJ)' : `${uf} (Ref. SINAPI-RJ)`,
      sinapiRegime: 'desonerado',
      competence: new Date().toISOString().slice(0, 7),
      referenceDate: new Date().toISOString().slice(0, 10),
      socialChargesPercent: 86.87,
      bdiPercent: 22,
      indirectCostsPercent: 5,
      discountPercent: 0,
      criteriaNotes:
        'Composições unitárias referenciais SINAPI-RJ aplicadas automaticamente com e sem desoneração (encargos sociais RJ). Todos os custos permanecem editáveis.',
    },
    normativeRefs: getDefaultNormativeReferences(),
    renderSettings: {
      facadeColor: '#EAECEE',
      interiorWallColor: '#F5F6F8',
      floorMaterial: 'porcelanato_cinza',
      roofMaterial: 'termoacustica_zinco',
      windowFrameColor: 'aluminio_preto',
      timeOfDay: 'dia',
      sunAzimuthDeg: 42,
      sunElevationDeg: 52,
      artificialLightsOn: false,
      renderQuality: 'arquitetonico',
    },
    capturedRenders: [],
    memorialOverrides: {},
    revisions: [
      {
        id: nextId('rev'),
        revisionCode: 'R00',
        timestamp: now,
        author: 'Usuário',
        description: `Criação do empreendimento "${params.name.trim() || 'Novo Empreendimento'}" do zero.`,
        stage: 'estudo_conceitual',
      },
    ],
    fireSafetyNotes: {
      occupancyClass: 'A-2 (Habitação Multifamiliar — validar legislação estadual)',
      stateRegulation:
        uf === 'RJ'
          ? 'COSCIP-RJ / Notas Técnicas CBMERJ (validar aplicabilidade)'
          : 'Não informada (selecionar Decreto/IT estadual)',
      estimatedPopulationPerUnit: 2,
      hasExtinguishers: true,
      hasEmergencyLighting: true,
      hasSignage: true,
      hasHydrants: false,
      verifiedByProfessional: false,
    },
    accessibilityConfig: {
      normReference: 'ABNT NBR 9050:2020 (Emenda 1:2021)',
      requireAccessibleUnits: false,
      minDoorWidthM: 0.8,
      minCorridorWidthM: 1.2,
      turningCircleDiameterM: 1.5,
    },
  };
}

/**
 * Distribui automaticamente a tipologia selecionada (ou as tipologias do projeto)
 * dentro da área edificável respeitando os recuos de todos os pavimentos vazios.
 */
export function autoDistributeUnitsAcrossFloors(
  project: Project,
  preferredUnitTypeId?: string,
): Project {
  if (project.unitTypes.length === 0 || project.floors.length === 0) return project;
  const ut =
    project.unitTypes.find((t) => t.id === preferredUnitTypeId) ?? project.unitTypes[0];

  const front = Math.max(4, project.site.front);
  const depth = Math.max(6, project.site.leftDepth);
  const bx = project.site.setbacks.left;
  const by = project.site.setbacks.front;
  const bWidth = Math.max(0.5, front - project.site.setbacks.left - project.site.setbacks.right);
  const bDepth = Math.max(0.5, depth - project.site.setbacks.front - project.site.setbacks.back);

  const updatedFloors = project.floors.map((fl) => {
    if (fl.units.length > 0) return fl;
    const corridorW = Math.max(1.2, fl.corridorWidth || 1.5);
    const twoColumnsFit = ut.width * 2 + corridorW <= bWidth + 0.05;
    const rowsPerCol = Math.max(1, Math.floor(bDepth / ut.depth));
    const generated: UnitInstance[] = [];
    let seq = 1;

    for (let r = 0; r < rowsPerCol; r++) {
      const yPos = round2(by + r * ut.depth);
      if (yPos + ut.depth > by + bDepth + 0.05) break;
      generated.push({
        id: nextId('inst'),
        unitNumber: `${fl.levelIndex + 1}${String(seq++).padStart(2, '0')}`,
        unitTypeId: ut.id,
        floorId: fl.id,
        x: round2(bx),
        y: yPos,
        rotationDeg: 0,
        mirrored: false,
      });
      if (twoColumnsFit) {
        generated.push({
          id: nextId('inst'),
          unitNumber: `${fl.levelIndex + 1}${String(seq++).padStart(2, '0')}`,
          unitTypeId: ut.id,
          floorId: fl.id,
          x: round2(bx + ut.width + corridorW),
          y: yPos,
          rotationDeg: 0,
          mirrored: true,
        });
      }
    }

    const nextCommon = round2(corridorW * Math.min(bDepth, rowsPerCol * ut.depth));
    return {
      ...fl,
      units: generated,
      commonAreaM2: Math.max(fl.commonAreaM2, nextCommon),
    };
  });

  return {
    ...project,
    floors: updatedFloors,
  };
}
