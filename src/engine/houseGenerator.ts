import { getDoorSwingRect, getOpeningWorldPosition, round2 } from './geometry';
import { computeBlondelStairSpec, nextId, type ParametricTypologyInput } from './parametricGenerator';
import type {
  DrainagePoint,
  ElectricalPoint,
  EntrySide,
  FurnitureItem,
  InternalPartitionType,
  Opening,
  Room,
  StairVoidSpec,
  UnitType,
  Wall,
  WaterPoint,
} from '../types/project';

type Box2 = { x: number; y: number; width: number; depth: number };

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function boxesOverlap(a: Box2, b: Box2, tol = 0.02): boolean {
  return (
    a.x < b.x + b.width - tol &&
    a.x + a.width > b.x + tol &&
    a.y < b.y + b.depth - tol &&
    a.y + a.depth > b.y + tol
  );
}

function padBox(b: Box2, pad = 0.06): Box2 {
  return {
    x: round2(b.x - pad),
    y: round2(b.y - pad),
    width: round2(b.width + pad * 2),
    depth: round2(b.depth + pad * 2),
  };
}

function getSystemWallMaterial(
  sys: ParametricTypologyInput['constructionSystem'],
  internalPartitionType: InternalPartitionType,
): { matName: string; intMatName: string; loadBearingExt: boolean } {
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
  const loadBearingExt =
    sys === 'alvenaria_estrutural' ||
    sys === 'light_steel_frame' ||
    sys === 'wood_frame';
  return { matName, intMatName, loadBearingExt };
}

function createFurniturePlacer(
  furniture: FurnitureItem[],
  reservedZones: Box2[],
) {
  const placedBoxes: Box2[] = [...reservedZones];

  const tryCommit = (
    item: FurnitureItem,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    clearanceZone?: Box2,
  ): boolean => {
    const rot = ((item.rotationDeg % 360) + 360) % 360;
    const w = rot === 90 || rot === 270 ? item.depth : item.width;
    const d = rot === 90 || rot === 270 ? item.width : item.depth;
    const box: Box2 = { x: item.x, y: item.y, width: w, depth: d };
    if (
      box.x < bounds.minX - 0.005 ||
      box.y < bounds.minY - 0.005 ||
      box.x + box.width > bounds.maxX + 0.005 ||
      box.y + box.depth > bounds.maxY + 0.005
    ) {
      return false;
    }
    if (placedBoxes.some((b) => boxesOverlap(box, b, 0.02))) {
      return false;
    }
    if (clearanceZone && placedBoxes.some((b) => boxesOverlap(clearanceZone, b, 0.02))) {
      return false;
    }
    furniture.push(item);
    placedBoxes.push(box);
    if (clearanceZone) {
      placedBoxes.push(clearanceZone);
    }
    return true;
  };

  return { tryCommit, placedBoxes };
}

function pushDoorClearanceZones(walls: Wall[], openings: Opening[], reservedZones: Box2[]) {
  for (const op of openings) {
    if (op.type !== 'porta') continue;
    const wall = walls.find((w) => w.id === op.wallId);
    if (!wall) continue;
    if (op.swingDirection !== 'sliding' && op.swingDirection !== 'none') {
      reservedZones.push(padBox(getDoorSwingRect(wall, op), 0.08));
    }
    const dx = Math.abs(wall.end.x - wall.start.x);
    const dy = Math.abs(wall.end.y - wall.start.y);
    const { center } = getOpeningWorldPosition(wall, op);
    const alongPad = op.width * 0.5 + 0.08;
    const acrossPad = 0.58;
    if (dx >= dy) {
      reservedZones.push({
        x: round2(center.x - alongPad),
        y: round2(center.y - acrossPad),
        width: round2(alongPad * 2),
        depth: round2(acrossPad * 2),
      });
    } else {
      reservedZones.push({
        x: round2(center.x - acrossPad),
        y: round2(center.y - alongPad),
        width: round2(acrossPad * 2),
        depth: round2(alongPad * 2),
      });
    }
  }
}

function addBalconyAndGuardrail(params: {
  id: string;
  W: number;
  D: number;
  H: number;
  usableD: number;
  balconyDepth: number;
  sys: ParametricTypologyInput['constructionSystem'];
  rooms: Room[];
  walls: Wall[];
  label?: string;
}) {
  const { id, W, D, H, usableD, balconyDepth, sys, rooms, walls, label } = params;
  if (balconyDepth <= 0) return;
  rooms.push({
    id: `${id}-rm-var`,
    code: 'VAR',
    name: label ?? 'Varanda / Área Coberta',
    category: 'varanda',
    x: 0,
    y: usableD,
    width: W,
    depth: balconyDepth,
    ceilingHeight: H,
    naturalLightingArea: round2(W * 1.4),
    ventilationArea: round2(W * 1.4),
    finishes: {
      floor: 'Porcelanato externo antiderrapante',
      wall: 'Textura acrílica externa',
      ceiling: 'Laje impermeabilizada / Forro madeira',
      paint: 'Tinta acrílica externa',
      baseboard: 'Porcelanato h=8cm',
    },
    notes: '',
  });
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

function addBathFixturesAndMep(params: {
  id: string;
  suffix: string;
  roomId: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  H: number;
  hasShower: boolean;
  includeHotWater: boolean;
  doorRect?: Box2;
  tqId: string;
  csId: string;
  sinkOnWall: 'norte' | 'sul' | 'oeste' | 'leste';
  furniture: FurnitureItem[];
  electricalPoints: ElectricalPoint[];
  waterPoints: WaterPoint[];
  drainagePoints: DrainagePoint[];
  placedBoxes: Box2[];
  chuvCircuitId: string;
  riserX: number;
  riserY: number;
}) {
  const {
    id,
    suffix,
    roomId,
    x,
    y,
    width,
    depth,
    H,
    hasShower,
    includeHotWater,
    tqId,
    csId,
    sinkOnWall,
    furniture,
    electricalPoints,
    waterPoints,
    drainagePoints,
    placedBoxes,
    chuvCircuitId,
  } = params;

  const boxW = hasShower ? round2(Math.min(0.85, Math.max(0.72, width * 0.45))) : 0;
  const boxD = hasShower ? round2(Math.min(0.95, Math.max(0.78, depth * 0.48))) : 0;

  // Box + Chuveiro na quina superior esquerda do banheiro
  if (hasShower) {
    const bx = round2(x + 0.08);
    const by = round2(y + 0.08);
    const chuvX = round2(bx + boxW * 0.45);
    const chuvY = round2(by + 0.1);
    furniture.push(
      {
        id: `${id}-fur-box-${suffix}`,
        name: 'Box Vidro Temperado',
        category: 'box',
        roomId,
        x: bx,
        y: by,
        width: boxW,
        depth: boxD,
        height: 1.9,
        rotationDeg: 0,
      },
      {
        id: `${id}-fur-chuv-${suffix}`,
        name: 'Chuveiro / Ducha',
        category: 'chuveiro',
        roomId,
        x: round2(bx + 0.14),
        y: round2(by + 0.04),
        width: 0.25,
        depth: 0.25,
        height: 2.15,
        rotationDeg: 0,
        requiresPower: !includeHotWater,
        requiresWater: true,
        requiresDrain: true,
      },
    );
    placedBoxes.push({ x: bx, y: by, width: boxW, depth: boxD });

    electricalPoints.push({
      id: `${id}-el-chuv-${suffix}`,
      code: `CHUV-${suffix}`,
      category: 'chuveiro',
      label: `Ponto Chuveiro (${suffix})`,
      roomId,
      x: chuvX,
      y: chuvY,
      z: 2.2,
      referenceWall: 'Parede Box',
      referenceDistance: 0.35,
      powerVA: 5500,
      voltage: 220,
      powerFactor: 1.0,
      circuitId: chuvCircuitId,
      conductorSectionMm2: 6.0,
      conduitDiameterMm: 25,
      protection: 'Disjuntor 32A + DR 30mA',
      notes: 'Circuito exclusivo TUE chuveiro',
    });

    waterPoints.push({
      id: `${id}-af-chuv-${suffix}`,
      code: `AF-CH-${suffix}`,
      category: 'chuveiro',
      equipment: `Chuveiro ${suffix} (AF)`,
      roomId,
      x: chuvX,
      y: chuvY,
      z: 2.15,
      waterType: 'fria',
      diameterMm: 25,
      material: 'PVC Soldável',
      availablePressureMca: 4.2,
      supplySource: `Coluna AF-${suffix}`,
      branchName: `Sub-ramal ${suffix}`,
      weightHunter: 0.1,
      notes: '',
    });

    if (includeHotWater) {
      waterPoints.push({
        id: `${id}-aq-chuv-${suffix}`,
        code: `AQ-CH-${suffix}`,
        category: 'agua_quente',
        equipment: `Chuveiro ${suffix} (AQ)`,
        roomId,
        x: round2(chuvX + 0.1),
        y: chuvY,
        z: 1.15,
        waterType: 'quente',
        diameterMm: 22,
        material: 'CPVC Aquatherm',
        availablePressureMca: 4.2,
        supplySource: 'Aquecedor',
        branchName: `Sub-ramal AQ ${suffix}`,
        weightHunter: 0.1,
        notes: '',
      });
    }

    drainagePoints.push({
      id: `${id}-esg-box-${suffix}`,
      code: `RL-${suffix}`,
      category: 'chuveiro',
      roomId,
      x: round2(bx + boxW * 0.5),
      y: round2(by + boxD * 0.55),
      diameterMm: 40,
      material: 'PVC Esgoto SN',
      slopePercent: 2.0,
      uhc: 2,
      connectedToId: csId,
      notes: 'Ralo box Ø40mm → CS (i=2%)',
    });
  }

  // Vaso Sanitário na parede superior direita (ou parede oposta à porta)
  const vasoW = 0.4;
  const vasoD = 0.64;
  const vasoX = round2(Math.min(x + width - vasoW - 0.12, Math.max(x + boxW + 0.18, x + width - 0.56)));
  const vasoY = round2(y + 0.08);
  furniture.push({
    id: `${id}-fur-vaso-${suffix}`,
    name: 'Vaso Sanitário c/ Caixa Acoplada',
    category: 'vaso_sanitario',
    roomId,
    x: vasoX,
    y: vasoY,
    width: vasoW,
    depth: vasoD,
    height: 0.76,
    rotationDeg: 0,
    requiresWater: true,
    requiresDrain: true,
  });
  placedBoxes.push({ x: vasoX, y: vasoY, width: vasoW, depth: vasoD });

  // Lavatório
  const lavW = 0.5;
  const lavD = 0.4;
  let lavX = round2(x + 0.12);
  let lavY = round2(y + depth - lavD - 0.08);
  if (sinkOnWall === 'norte') {
    lavX = round2(Math.max(x + 0.12, vasoX - lavW - 0.2));
    lavY = round2(y + 0.08);
  } else if (sinkOnWall === 'leste') {
    lavX = round2(x + width - lavW - 0.08);
    lavY = round2(y + depth - lavD - 0.14);
  } else if (sinkOnWall === 'oeste') {
    lavX = round2(x + 0.08);
    lavY = round2(y + depth - lavD - 0.14);
  }
  furniture.push(
    {
      id: `${id}-fur-lav-${suffix}`,
      name: 'Bancada / Lavatório',
      category: 'lavatorio',
      roomId,
      x: lavX,
      y: lavY,
      width: lavW,
      depth: lavD,
      height: 0.85,
      rotationDeg: 0,
      requiresWater: true,
      requiresDrain: true,
    },
    {
      id: `${id}-fur-esp-${suffix}`,
      name: 'Espelho BWC',
      category: 'espelho',
      roomId,
      x: lavX,
      y: lavY,
      width: lavW,
      depth: 0.04,
      height: 0.8,
      rotationDeg: 0,
    },
  );
  placedBoxes.push({ x: lavX, y: lavY, width: lavW, depth: lavD });

  electricalPoints.push(
    {
      id: `${id}-el-il-${suffix}`,
      code: `IL-${suffix}`,
      category: 'iluminacao_teto',
      label: `Plafon LED IP44 ${suffix}`,
      roomId,
      x: round2(x + width / 2),
      y: round2(y + depth / 2),
      z: Math.min(H, 2.55),
      referenceWall: 'Laje/Forro',
      referenceDistance: round2(width / 2),
      powerVA: 100,
      voltage: 127,
      powerFactor: 0.92,
      circuitId: 'C1-ILUM',
      conductorSectionMm2: 1.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 10A Curva B',
      notes: 'Iluminação área úmida',
    },
    {
      id: `${id}-el-tm-${suffix}`,
      code: `TM-${suffix}`,
      category: 'tomada_media',
      label: `Tomada Lavatório ${suffix}`,
      roomId,
      x: round2(lavX + lavW / 2),
      y: round2(lavY + 0.06),
      z: 1.15,
      referenceWall: 'Parede Lavatório',
      referenceDistance: 0.25,
      powerVA: 600,
      voltage: 127,
      powerFactor: 0.85,
      circuitId: 'C2-TUG',
      conductorSectionMm2: 2.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 16A + DR 30mA',
      notes: 'Junto ao espelho',
    },
  );

  waterPoints.push(
    {
      id: `${id}-af-vaso-${suffix}`,
      code: `AF-VS-${suffix}`,
      category: 'vaso_sanitario',
      equipment: `Vaso Sanitário ${suffix}`,
      roomId,
      x: round2(vasoX + vasoW / 2),
      y: round2(vasoY + 0.08),
      z: 0.2,
      waterType: 'fria',
      diameterMm: 20,
      material: 'PVC Soldável',
      availablePressureMca: 6.2,
      supplySource: `Coluna AF-${suffix}`,
      branchName: `Sub-ramal ${suffix}`,
      weightHunter: 0.3,
      notes: '',
    },
    {
      id: `${id}-af-lav-${suffix}`,
      code: `AF-LV-${suffix}`,
      category: 'lavatorio',
      equipment: `Lavatório ${suffix}`,
      roomId,
      x: round2(lavX + lavW / 2),
      y: round2(lavY + 0.08),
      z: 0.6,
      waterType: 'fria',
      diameterMm: 20,
      material: 'PVC Soldável',
      availablePressureMca: 5.8,
      supplySource: `Coluna AF-${suffix}`,
      branchName: `Sub-ramal ${suffix}`,
      weightHunter: 0.3,
      notes: '',
    },
  );

  drainagePoints.push(
    {
      id: tqId,
      code: `TQ-${suffix}`,
      category: 'tubo_queda',
      roomId,
      x: round2(x + 0.14),
      y: round2(y + 0.14),
      diameterMm: 100,
      material: 'PVC Esgoto SN',
      slopePercent: 1.0,
      uhc: 0,
      connectedToId: 'CI-GERAL',
      notes: `Tubo de queda Ø100mm (${suffix})`,
    },
    {
      id: csId,
      code: `CS-${suffix}`,
      category: 'caixa_sifonada',
      roomId,
      x: round2(x + width * 0.52),
      y: round2(y + depth * 0.56),
      diameterMm: 100,
      material: 'PVC Esgoto SN',
      slopePercent: 2.0,
      uhc: 0,
      connectedToId: tqId,
      notes: `Caixa sifonada 150x150 (${suffix})`,
    },
    {
      id: `${id}-esg-rs-${suffix}`,
      code: `RS-${suffix}`,
      category: 'ralo',
      roomId,
      x: round2(x + width - 0.2),
      y: round2(y + depth - 0.2),
      diameterMm: 40,
      material: 'PVC Esgoto SN',
      slopePercent: 2.0,
      uhc: 1,
      connectedToId: csId,
      notes: 'Ralo seco piso Ø40mm',
    },
    {
      id: `${id}-esg-lav-${suffix}`,
      code: `ES-LV-${suffix}`,
      category: 'lavatorio',
      roomId,
      x: round2(lavX + lavW / 2),
      y: round2(lavY + 0.14),
      diameterMm: 40,
      material: 'PVC Esgoto SN',
      slopePercent: 2.0,
      uhc: 1,
      connectedToId: csId,
      notes: 'Sifão lavatório Ø40mm',
    },
    {
      id: `${id}-esg-vaso-${suffix}`,
      code: `ES-VS-${suffix}`,
      category: 'vaso_sanitario',
      roomId,
      x: round2(vasoX + vasoW / 2),
      y: round2(vasoY + 0.28),
      diameterMm: 100,
      material: 'PVC Esgoto SN',
      slopePercent: 1.0,
      uhc: 6,
      connectedToId: tqId,
      notes: 'Ramal primário bacia Ø100mm (i=1%)',
    },
    {
      id: `${id}-esg-vent-${suffix}`,
      code: `VENT-${suffix}`,
      category: 'ventilacao',
      roomId,
      x: round2(x + 0.14),
      y: round2(y + depth - 0.14),
      diameterMm: 50,
      material: 'PVC Esgoto SN',
      slopePercent: 2.0,
      uhc: 0,
      connectedToId: tqId,
      notes: 'Coluna de ventilação Ø50mm',
    },
  );
}

function populateBedroomFurnitureAndMep(params: {
  id: string;
  suffix: string;
  roomId: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  H: number;
  isMaster: boolean;
  includeAcCircuit: boolean;
  tryCommit: ReturnType<typeof createFurniturePlacer>['tryCommit'];
  electricalPoints: ElectricalPoint[];
  acCircuitId: string;
}) {
  const {
    id,
    suffix,
    roomId,
    x,
    y,
    width,
    depth,
    H,
    isMaster,
    includeAcCircuit,
    tryCommit,
    electricalPoints,
    acCircuitId,
  } = params;

  const bounds = {
    minX: round2(x + 0.08),
    maxX: round2(x + width - 0.08),
    minY: round2(y + 0.08),
    maxY: round2(y + depth - 0.08),
  };
  const availW = bounds.maxX - bounds.minX;
  const availD = bounds.maxY - bounds.minY;

  const bedW = isMaster || (availW >= 2.2 && availD >= 2.45) ? 1.38 : 0.92;
  const bedD = 1.88;
  const bedName = bedW >= 1.3 ? 'Cama Casal Padrão' : 'Cama Solteiro Padrão';

  let placedBed: Box2 | null = null;
  const bedCandidates: Array<{ x: number; y: number; w: number; d: number; rot: number }> = [
    { x: round2(bounds.maxX - bedW), y: round2(bounds.maxY - bedD), w: bedW, d: bedD, rot: 0 },
    { x: bounds.minX, y: round2(bounds.maxY - bedD), w: bedW, d: bedD, rot: 0 },
    { x: round2(bounds.maxX - bedD), y: round2(bounds.maxY - bedW), w: bedW, d: bedD, rot: 90 },
    { x: bounds.minX, y: round2(bounds.maxY - bedW), w: bedW, d: bedD, rot: 90 },
    { x: round2(bounds.maxX - bedW), y: bounds.minY, w: bedW, d: bedD, rot: 0 },
    { x: round2(bounds.maxX - bedD), y: bounds.minY, w: bedW, d: bedD, rot: 90 },
    // Fallback compact single bed if small room
    { x: round2(bounds.maxX - 0.9), y: round2(bounds.maxY - 1.85), w: 0.9, d: 1.85, rot: 0 },
    { x: round2(bounds.maxX - 1.85), y: round2(bounds.maxY - 0.9), w: 0.9, d: 1.85, rot: 90 },
  ];

  for (const bc of bedCandidates) {
    if (
      tryCommit(
        {
          id: `${id}-fur-cama-${suffix}`,
          name: bedName,
          category: 'cama',
          roomId,
          x: bc.x,
          y: bc.y,
          width: bc.w,
          depth: bc.d,
          height: 0.54,
          rotationDeg: bc.rot,
        },
        bounds,
      )
    ) {
      placedBed = {
        x: bc.x,
        y: bc.y,
        width: bc.rot === 90 ? bc.d : bc.w,
        depth: bc.rot === 90 ? bc.w : bc.d,
      };
      break;
    }
  }

  if (placedBed) {
    const criadoCands = [
      { x: round2(placedBed.x - 0.44), y: placedBed.y },
      { x: round2(placedBed.x + placedBed.width + 0.04), y: placedBed.y },
      { x: placedBed.x, y: round2(placedBed.y - 0.42) },
    ];
    for (const cc of criadoCands) {
      if (
        tryCommit(
          {
            id: `${id}-fur-criado-${suffix}`,
            name: 'Mesa de Cabeceira',
            category: 'mesa_cabeceira',
            roomId,
            x: cc.x,
            y: cc.y,
            width: 0.4,
            depth: 0.36,
            height: 0.52,
            rotationDeg: 0,
          },
          bounds,
        )
      ) {
        break;
      }
    }
  }

  const wardLen = round2(Math.min(1.5, Math.max(1.0, availW * 0.45)));
  const wardCands: Array<{ x: number; y: number; w: number; d: number; rot: number }> = [
    { x: bounds.minX, y: bounds.minY, w: wardLen, d: 0.55, rot: 0 },
    { x: round2(bounds.maxX - wardLen), y: bounds.minY, w: wardLen, d: 0.55, rot: 0 },
    { x: round2(bounds.maxX - 0.55), y: bounds.minY, w: 0.55, d: wardLen, rot: 90 },
    { x: bounds.minX, y: round2(bounds.maxY - 0.55), w: wardLen, d: 0.55, rot: 0 },
  ];
  for (const wc of wardCands) {
    if (
      tryCommit(
        {
          id: `${id}-fur-gr-${suffix}`,
          name: 'Guarda-Roupa 3 Portas',
          category: 'guarda_roupa',
          roomId,
          x: wc.x,
          y: wc.y,
          width: wc.rot === 90 ? wc.d : wc.w,
          depth: wc.rot === 90 ? wc.w : wc.d,
          height: 2.2,
          rotationDeg: wc.rot,
        },
        bounds,
      )
    ) {
      break;
    }
  }

  electricalPoints.push(
    {
      id: `${id}-el-il-${suffix}`,
      code: `IL-${suffix}`,
      category: 'iluminacao_teto',
      label: `Ponto Luz ${suffix}`,
      roomId,
      x: round2(x + width / 2),
      y: round2(y + depth / 2),
      z: H,
      referenceWall: 'Laje/Forro',
      referenceDistance: round2(width / 2),
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
      id: `${id}-el-tb1-${suffix}`,
      code: `TB-${suffix}-1`,
      category: 'tomada_baixa',
      label: `Tomada Cabeceira ${suffix}`,
      roomId,
      x: round2(placedBed ? placedBed.x + 0.14 : x + width - 0.2),
      y: round2(placedBed ? placedBed.y + placedBed.depth - 0.14 : y + depth - 0.2),
      z: 0.3,
      referenceWall: 'Parede Cabeceira',
      referenceDistance: 0.5,
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
      id: `${id}-el-tb2-${suffix}`,
      code: `TB-${suffix}-2`,
      category: 'tomada_baixa',
      label: `Tomada Geral ${suffix}`,
      roomId,
      x: round2(x + 0.18),
      y: round2(y + depth / 2),
      z: 0.3,
      referenceWall: 'Parede Interna',
      referenceDistance: 0.8,
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
      id: `${id}-el-int-${suffix}`,
      code: `INT-${suffix}`,
      category: 'interruptor',
      label: `Interruptor ${suffix}`,
      roomId,
      x: round2(x + 0.16),
      y: round2(y + 0.2),
      z: 1.1,
      referenceWall: 'Junto à porta',
      referenceDistance: 0.18,
      powerVA: 0,
      voltage: 127,
      powerFactor: 1,
      circuitId: 'C1-ILUM',
      conductorSectionMm2: 1.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 10A',
      notes: '',
    },
  );

  if (includeAcCircuit && isMaster) {
    electricalPoints.push({
      id: `${id}-el-ac-${suffix}`,
      code: `TA-AC-${suffix}`,
      category: 'ar_condicionado',
      label: `Ar-Condicionado ${suffix}`,
      roomId,
      x: round2(x + width - 0.18),
      y: round2(y + 0.18),
      z: 2.25,
      referenceWall: 'Parede Externa',
      referenceDistance: 0.5,
      powerVA: 1200,
      voltage: 220,
      powerFactor: 0.9,
      circuitId: acCircuitId,
      conductorSectionMm2: 2.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 16A Bipolar',
      notes: 'Split 9.000/12.000 BTUs',
    });
  }
}

function populateKitchenAndLaundry(params: {
  id: string;
  kitchenRoomId: string;
  laundryRoomId: string;
  kitchenX: number;
  kitchenY: number;
  kitchenW: number;
  kitchenD: number;
  laundryX: number;
  laundryY: number;
  laundryW: number;
  laundryD: number;
  hasLaundry: boolean;
  H: number;
  isSimpleMep: boolean;
  includeHotWater: boolean;
  cozCircuitId: string;
  cooktopCircuitId: string;
  tqId: string;
  csId: string;
  furniture: FurnitureItem[];
  electricalPoints: ElectricalPoint[];
  waterPoints: WaterPoint[];
  drainagePoints: DrainagePoint[];
  placedBoxes: Box2[];
}) {
  const {
    id,
    kitchenRoomId,
    laundryRoomId,
    kitchenX,
    kitchenY,
    kitchenW,
    kitchenD,
    laundryX,
    laundryY,
    laundryW,
    laundryD,
    hasLaundry,
    H,
    isSimpleMep,
    includeHotWater,
    cozCircuitId,
    cooktopCircuitId,
    tqId,
    csId,
    furniture,
    electricalPoints,
    waterPoints,
    drainagePoints,
    placedBoxes,
  } = params;

  // Leave >=1.08m clear corridor on the East side when A.S. passage is directly North
  const maxBenchW = hasLaundry
    ? Math.max(1.05, round2(kitchenW - 1.15))
    : Math.max(1.2, round2(kitchenW - 0.92));
  const benchW = round2(Math.min(1.85, maxBenchW));
  const benchD = 0.58;
  const benchX = round2(kitchenX + 0.1);
  const benchY = round2(kitchenY + 0.1);
  const canPlaceFridgeEast = !hasLaundry && kitchenW >= benchW + 0.86;
  const fridgeX = canPlaceFridgeEast
    ? round2(Math.min(kitchenX + kitchenW - 0.72, benchX + benchW + 0.1))
    : round2(kitchenX + 0.1);
  const fridgeY = canPlaceFridgeEast
    ? round2(kitchenY + 0.1)
    : round2(benchY + benchD + 0.14);

  furniture.push(
    {
      id: `${id}-fur-bancada`,
      name: 'Bancada Pia Cozinha Granito + Cuba Inox',
      category: 'bancada',
      roomId: kitchenRoomId,
      x: benchX,
      y: benchY,
      width: benchW,
      depth: benchD,
      height: 0.88,
      rotationDeg: 0,
      requiresWater: true,
      requiresDrain: true,
    },
    {
      id: `${id}-fur-cooktop`,
      name: 'Cooktop 4 Bocas + Forno',
      category: 'cooktop',
      roomId: kitchenRoomId,
      x: round2(benchX + benchW - 0.62),
      y: round2(benchY + 0.04),
      width: 0.56,
      depth: 0.48,
      height: 0.9,
      rotationDeg: 0,
      requiresPower: true,
    },
    {
      id: `${id}-fur-gel`,
      name: 'Geladeira Duplex Frost-Free',
      category: 'geladeira',
      roomId: kitchenRoomId,
      x: fridgeX,
      y: fridgeY,
      width: 0.64,
      depth: 0.66,
      height: 1.78,
      rotationDeg: 0,
      requiresPower: true,
    },
  );
  placedBoxes.push(
    { x: benchX, y: benchY, width: benchW, depth: benchD },
    { x: fridgeX, y: fridgeY, width: 0.64, depth: 0.66 },
  );

  electricalPoints.push(
    {
      id: `${id}-el-il-coz`,
      code: 'IL-COZ',
      category: 'iluminacao_teto',
      label: 'Ponto Luz Cozinha',
      roomId: kitchenRoomId,
      x: round2(kitchenX + kitchenW / 2),
      y: round2(kitchenY + kitchenD / 2),
      z: H,
      referenceWall: 'Laje/Forro',
      referenceDistance: round2(kitchenW / 2),
      powerVA: 160,
      voltage: 127,
      powerFactor: 0.92,
      circuitId: 'C1-ILUM',
      conductorSectionMm2: 1.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 10A',
      notes: '',
    },
    {
      id: `${id}-el-tm-coz`,
      code: 'TM-COZ-1',
      category: 'tomada_media',
      label: 'Tomada Bancada Pia',
      roomId: kitchenRoomId,
      x: round2(benchX + 0.4),
      y: round2(benchY + 0.06),
      z: 1.1,
      referenceWall: 'Parede Cozinha',
      referenceDistance: 0.4,
      powerVA: 600,
      voltage: 127,
      powerFactor: 0.85,
      circuitId: cozCircuitId,
      conductorSectionMm2: 2.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 20A + DR 30mA',
      notes: '',
    },
    {
      id: `${id}-el-gel`,
      code: 'TUE-GEL',
      category: 'geladeira',
      label: 'Tomada Geladeira',
      roomId: kitchenRoomId,
      x: round2(fridgeX + 0.32),
      y: round2(fridgeY + 0.06),
      z: 0.65,
      referenceWall: 'Parede Cozinha',
      referenceDistance: 0.32,
      powerVA: 350,
      voltage: 127,
      powerFactor: 0.85,
      circuitId: cozCircuitId,
      conductorSectionMm2: 2.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 20A + DR 30mA',
      notes: '',
    },
    {
      id: `${id}-el-cook`,
      code: 'TUE-COOK',
      category: 'cooktop',
      label: 'Ponto Cooktop / Forno',
      roomId: kitchenRoomId,
      x: round2(benchX + benchW - 0.3),
      y: round2(benchY + 0.06),
      z: 0.65,
      referenceWall: 'Parede Cozinha',
      referenceDistance: 0.6,
      powerVA: 1800,
      voltage: isSimpleMep ? 127 : 220,
      powerFactor: 0.95,
      circuitId: cooktopCircuitId,
      conductorSectionMm2: isSimpleMep ? 2.5 : 4.0,
      conduitDiameterMm: isSimpleMep ? 20 : 25,
      protection: 'Disjuntor 20A + DR 30mA',
      notes: '',
    },
  );

  const cgId = `${id}-esg-cg`;
  waterPoints.push({
    id: `${id}-af-pia`,
    code: 'AF-PIA',
    category: 'pia',
    equipment: 'Pia de Cozinha (Água Fria)',
    roomId: kitchenRoomId,
    x: round2(benchX + 0.45),
    y: round2(benchY + 0.06),
    z: 0.6,
    waterType: 'fria',
    diameterMm: 25,
    material: 'PVC Soldável',
    availablePressureMca: 6.0,
    supplySource: 'Coluna AF-COZ',
    branchName: 'Ramal Cozinha',
    weightHunter: 0.7,
    notes: '',
  });

  if (includeHotWater) {
    waterPoints.push({
      id: `${id}-aq-pia`,
      code: 'AQ-PIA',
      category: 'agua_quente',
      equipment: 'Pia de Cozinha (Água Quente)',
      roomId: kitchenRoomId,
      x: round2(benchX + 0.62),
      y: round2(benchY + 0.06),
      z: 0.6,
      waterType: 'quente',
      diameterMm: 22,
      material: 'CPVC Aquatherm',
      availablePressureMca: 5.5,
      supplySource: 'Aquecedor',
      branchName: 'Ramal AQ Cozinha',
      weightHunter: 0.7,
      notes: '',
    });
  }

  drainagePoints.push(
    {
      id: cgId,
      code: 'CG-01',
      category: 'caixa_gordura',
      roomId: kitchenRoomId,
      x: round2(Math.max(-0.22, kitchenX - 0.18)),
      y: round2(benchY + 0.25),
      diameterMm: 75,
      material: 'PVC Esgoto SN',
      slopePercent: 2.0,
      uhc: 0,
      connectedToId: tqId,
      notes: 'Caixa de gordura externa p/ coletor',
    },
    {
      id: `${id}-esg-pia`,
      code: 'ES-PIA',
      category: 'pia',
      roomId: kitchenRoomId,
      x: round2(benchX + 0.45),
      y: round2(benchY + 0.14),
      diameterMm: 50,
      material: 'PVC Esgoto SN',
      slopePercent: 2.0,
      uhc: 3,
      connectedToId: cgId,
      notes: 'Saída pia cozinha Ø50mm → CG-01',
    },
  );

  if (hasLaundry && laundryD > 0.4) {
    const maqX = round2(laundryX + 0.12);
    const maqY = round2(laundryY + 0.12);
    furniture.push({
      id: `${id}-fur-maq`,
      name: 'Máquina de Lavar Roupas',
      category: 'maquina_lavar',
      roomId: laundryRoomId,
      x: maqX,
      y: maqY,
      width: 0.62,
      depth: 0.62,
      height: 0.88,
      rotationDeg: 0,
      requiresPower: true,
      requiresWater: true,
      requiresDrain: true,
    });
    placedBoxes.push({ x: maqX, y: maqY, width: 0.62, depth: 0.62 });

    electricalPoints.push(
      {
        id: `${id}-el-il-lav`,
        code: 'IL-AS',
        category: 'iluminacao_teto',
        label: 'Ponto Luz Área de Serviço',
        roomId: laundryRoomId,
        x: round2(laundryX + laundryW / 2),
        y: round2(laundryY + laundryD / 2),
        z: H,
        referenceWall: 'Laje/Forro',
        referenceDistance: round2(laundryW / 2),
        powerVA: 100,
        voltage: 127,
        powerFactor: 0.92,
        circuitId: 'C1-ILUM',
        conductorSectionMm2: 1.5,
        conduitDiameterMm: 20,
        protection: 'Disjuntor 10A',
        notes: '',
      },
      {
        id: `${id}-el-maq`,
        code: 'TUE-MAQ',
        category: 'maquina_lavar',
        label: 'Tomada Máquina de Lavar',
        roomId: laundryRoomId,
        x: round2(maqX + 0.3),
        y: round2(maqY + 0.06),
        z: 0.9,
        referenceWall: 'Parede A.S.',
        referenceDistance: 0.3,
        powerVA: 1000,
        voltage: 127,
        powerFactor: 0.85,
        circuitId: cozCircuitId,
        conductorSectionMm2: 2.5,
        conduitDiameterMm: 20,
        protection: 'Disjuntor 20A + DR 30mA',
        notes: '',
      },
    );

    waterPoints.push({
      id: `${id}-af-maq`,
      code: 'AF-MAQ',
      category: 'maquina_lavar',
      equipment: 'Máquina de Lavar',
      roomId: laundryRoomId,
      x: round2(maqX + 0.42),
      y: round2(maqY + 0.06),
      z: 0.9,
      waterType: 'fria',
      diameterMm: 20,
      material: 'PVC Soldável',
      availablePressureMca: 5.7,
      supplySource: 'Coluna AF-COZ',
      branchName: 'Ramal A.S.',
      weightHunter: 1.0,
      notes: '',
    });

    drainagePoints.push({
      id: `${id}-esg-maq`,
      code: 'ES-MAQ',
      category: 'maquina_lavar',
      roomId: laundryRoomId,
      x: round2(maqX + 0.42),
      y: round2(maqY + 0.16),
      diameterMm: 50,
      material: 'PVC Esgoto SN',
      slopePercent: 2.0,
      uhc: 3,
      connectedToId: csId,
      notes: 'Saída máquina de lavar Ø50mm → CS',
    });
  }
}

function populateLivingAndDining(params: {
  id: string;
  salaRoomId: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  H: number;
  entryWallCode: string;
  entryPointX: number;
  entryPointY: number;
  tryCommit: ReturnType<typeof createFurniturePlacer>['tryCommit'];
  furniture: FurnitureItem[];
  electricalPoints: ElectricalPoint[];
  includeSpecialSystems: boolean;
}) {
  const {
    id,
    salaRoomId,
    x,
    y,
    width,
    depth,
    H,
    entryWallCode,
    entryPointX,
    entryPointY,
    tryCommit,
    furniture,
    electricalPoints,
    includeSpecialSystems,
  } = params;

  const bounds = {
    minX: round2(x + 0.1),
    maxX: round2(x + width - 0.1),
    minY: round2(y + 0.1),
    maxY: round2(y + depth - 0.1),
  };

  const sofaW = round2(Math.min(2.05, Math.max(1.45, width * 0.46)));
  const sofaCands = [
    { x: bounds.minX, y: round2(bounds.minY + 0.35), rot: 0 },
    { x: bounds.minX, y: round2(bounds.maxY - 1.15), rot: 0 },
    { x: round2(bounds.maxX - sofaW), y: round2(bounds.maxY - 1.05), rot: 0 },
  ];
  let placedSofa: Box2 | null = null;
  for (const sc of sofaCands) {
    if (
      tryCommit(
        {
          id: `${id}-fur-sofa`,
          name: 'Sofá Estar 3 Lugares',
          category: 'sofa',
          roomId: salaRoomId,
          x: sc.x,
          y: sc.y,
          width: sofaW,
          depth: 0.82,
          height: 0.84,
          rotationDeg: sc.rot,
        },
        bounds,
      )
    ) {
      placedSofa = { x: sc.x, y: sc.y, width: sofaW, depth: 0.82 };
      break;
    }
  }

  const rackW = round2(Math.min(1.5, Math.max(1.05, sofaW * 0.85)));
  const rackCands = placedSofa
    ? [
        { x: placedSofa.x, y: round2(placedSofa.y + placedSofa.depth + 0.9) },
        { x: round2(bounds.maxX - rackW), y: bounds.minY },
        { x: bounds.minX, y: round2(bounds.maxY - 0.38) },
      ]
    : [{ x: bounds.minX, y: round2(bounds.maxY - 0.38) }];
  for (const rc of rackCands) {
    if (
      tryCommit(
        {
          id: `${id}-fur-rack`,
          name: 'Rack Painel TV Sala',
          category: 'rack_tv',
          roomId: salaRoomId,
          x: rc.x,
          y: rc.y,
          width: rackW,
          depth: 0.36,
          height: 0.54,
          rotationDeg: 0,
        },
        bounds,
      )
    ) {
      const tvW = round2(Math.min(1.15, rackW - 0.14));
      furniture.push({
        id: `${id}-fur-tv`,
        name: 'Smart TV 50"',
        category: 'tv',
        roomId: salaRoomId,
        x: round2(rc.x + (rackW - tvW) / 2),
        y: round2(rc.y + 0.04),
        width: tvW,
        depth: 0.06,
        height: 0.65,
        rotationDeg: 0,
        requiresPower: true,
      });
      break;
    }
  }

  // Mesa de Jantar 4 lugares
  const tableW = round2(Math.min(1.3, Math.max(1.0, width * 0.3)));
  const tableD = 0.8;
  const tableCands = [
    { x: round2(bounds.maxX - tableW - 0.15), y: round2(bounds.minY + 0.55) },
    { x: round2(bounds.minX + 0.1), y: round2(bounds.minY + 0.55) },
    { x: round2(bounds.maxX - tableW - 0.15), y: round2(bounds.maxY - tableD - 0.65) },
  ];
  for (const tc of tableCands) {
    if (
      tryCommit(
        {
          id: `${id}-fur-mesa-jantar`,
          name: 'Mesa de Jantar 4 Lugares',
          category: 'mesa',
          roomId: salaRoomId,
          x: tc.x,
          y: tc.y,
          width: tableW,
          depth: tableD,
          height: 0.76,
          rotationDeg: 0,
        },
        bounds,
      )
    ) {
      tryCommit(
        {
          id: `${id}-fur-cad-1`,
          name: 'Cadeira Jantar 1',
          category: 'cadeira',
          roomId: salaRoomId,
          x: round2(tc.x + 0.12),
          y: round2(tc.y - 0.44),
          width: 0.42,
          depth: 0.4,
          height: 0.85,
          rotationDeg: 0,
        },
        bounds,
      );
      tryCommit(
        {
          id: `${id}-fur-cad-2`,
          name: 'Cadeira Jantar 2',
          category: 'cadeira',
          roomId: salaRoomId,
          x: round2(tc.x + tableW - 0.54),
          y: round2(tc.y + tableD + 0.04),
          width: 0.42,
          depth: 0.4,
          height: 0.85,
          rotationDeg: 0,
        },
        bounds,
      );
      break;
    }
  }

  electricalPoints.push(
    {
      id: `${id}-el-il-sala`,
      code: 'IL-SALA',
      category: 'iluminacao_teto',
      label: 'Luminária Principal Sala Estar/Jantar',
      roomId: salaRoomId,
      x: round2(x + width / 2),
      y: round2(y + depth / 2),
      z: H,
      referenceWall: 'Laje/Forro',
      referenceDistance: round2(width / 2),
      powerVA: 160,
      voltage: 127,
      powerFactor: 0.92,
      circuitId: 'C1-ILUM',
      conductorSectionMm2: 1.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 10A',
      notes: '',
    },
    {
      id: `${id}-el-tb-sala1`,
      code: 'TB-SALA-1',
      category: 'tomada_baixa',
      label: 'Tomada Painel TV / Rack',
      roomId: salaRoomId,
      x: round2(x + 0.22),
      y: round2(y + depth * 0.55),
      z: 0.3,
      referenceWall: 'Parede Sala',
      referenceDistance: 0.8,
      powerVA: 300,
      voltage: 127,
      powerFactor: 0.85,
      circuitId: 'C2-TUG',
      conductorSectionMm2: 2.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 16A',
      notes: '',
    },
    {
      id: `${id}-el-tb-sala2`,
      code: 'TB-SALA-2',
      category: 'tomada_baixa',
      label: 'Tomada Sofá / Estar',
      roomId: salaRoomId,
      x: round2(x + width - 0.24),
      y: round2(y + depth - 0.2),
      z: 0.3,
      referenceWall: 'Parede Frontal',
      referenceDistance: 0.5,
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
      id: `${id}-el-int-sala`,
      code: 'INT-01',
      category: 'interruptor',
      label: 'Interruptor Duplo Sala / Varanda',
      roomId: salaRoomId,
      x: entryPointX,
      y: entryPointY,
      z: 1.1,
      referenceWall: entryWallCode,
      referenceDistance: 0.2,
      powerVA: 0,
      voltage: 127,
      powerFactor: 1,
      circuitId: 'C1-ILUM',
      conductorSectionMm2: 1.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 10A',
      notes: '',
    },
  );

  if (includeSpecialSystems) {
    electricalPoints.push(
      {
        id: `${id}-esp-wifi`,
        code: 'WIFI-01',
        category: 'wifi_ap',
        label: 'Ponto Access Point Wi-Fi / Roteador',
        roomId: salaRoomId,
        x: round2(x + 0.45),
        y: round2(y + 0.45),
        z: 2.35,
        referenceWall: 'Forro Sala',
        referenceDistance: 0.45,
        powerVA: 15,
        voltage: 127,
        powerFactor: 0.95,
        circuitId: 'C7-ESP',
        conductorSectionMm2: 1.5,
        conduitDiameterMm: 20,
        protection: 'Switch PoE',
        notes: '',
      },
      {
        id: `${id}-esp-tv`,
        code: 'TV-01',
        category: 'antena_tv',
        label: 'Ponto Antena / Fibra TV Sala',
        roomId: salaRoomId,
        x: round2(x + 0.3),
        y: round2(y + depth * 0.55),
        z: 1.1,
        referenceWall: 'Parede TV',
        referenceDistance: 0.8,
        powerVA: 0,
        voltage: 127,
        powerFactor: 1,
        circuitId: 'C7-ESP',
        conductorSectionMm2: 1.5,
        conduitDiameterMm: 25,
        protection: 'Eletroduto Seco',
        notes: '',
      },
    );
  } else {
    electricalPoints.push({
      id: `${id}-esp-net`,
      code: 'NET-01',
      category: 'dados',
      label: 'Ponto Fibra / Internet Residência',
      roomId: salaRoomId,
      x: round2(x + 0.35),
      y: round2(y + 0.25),
      z: 1.1,
      referenceWall: 'Parede Sala',
      referenceDistance: 0.35,
      powerVA: 0,
      voltage: 127,
      powerFactor: 1,
      circuitId: 'C-TEL',
      conductorSectionMm2: 1.5,
      conduitDiameterMm: 25,
      protection: 'Eletroduto Seco Ø25mm',
      notes: '',
    });
  }
}

// ============================================================================
// 1. CASA TÉRREA PARAMÉTRICA (1 a 3 Quartos, Suíte Opcional, 1-2 Banheiros)
// ============================================================================
export function generateCasaTerreaLayout(input: ParametricTypologyInput): UnitType {
  const id = input.id ?? nextId('ut');
  const W = Math.max(5.2, round2(input.width));
  const D = Math.max(6.2, round2(input.depth));
  const H = Math.max(2.6, round2(input.ceilingHeight));
  const extT = Math.max(0.1, round2(input.extWallThickness));
  const internalPartitionType: InternalPartitionType =
    input.internalPartitionType ?? 'alvenaria';
  const intT =
    internalPartitionType === 'drywall'
      ? Math.max(0.075, round2(Math.min(input.intWallThickness || 0.095, 0.095)))
      : Math.max(0.08, round2(input.intWallThickness));
  const sys = input.constructionSystem;
  const { matName, intMatName, loadBearingExt } = getSystemWallMaterial(
    sys,
    internalPartitionType,
  );
  const entrySide: EntrySide = input.entrySide ?? 'frente';
  const bedrooms = Math.max(1, Math.min(3, Math.round(input.bedrooms || 2)));
  const hasSuite = bedrooms >= 2 && (input.suites ?? 0) >= 1 && W >= 6.4 && D >= 7.8;
  const bathCount = hasSuite ? 2 : 1;

  const balconyDepth = input.hasBalcony ? Math.min(1.6, round2(D * 0.16)) : 0;
  const usableD = round2(D - balconyDepth);

  // Two architectural strips + central spine corridor
  const hallW = input.accessible ? 1.2 : 1.05;
  const socialW = round2(Math.max(2.55, Math.min(W * 0.44, W - hallW - 2.45)));
  const corrEndX = round2(socialW + hallW);
  const privW = round2(W - corrEndX);

  const mepProfile: 'simples' | 'completo' = input.mepProfile ?? 'completo';
  const isSimpleMep = mepProfile === 'simples';
  const includeHotWater = input.includeHotWater ?? !isSimpleMep;
  const includeAcCircuit = input.includeAcCircuit ?? !isSimpleMep;
  const includeSpecialSystems = input.includeSpecialSystems ?? !isSimpleMep;
  const chuvCircuitId = isSimpleMep ? 'C4-CHUV' : 'C3-CHUV';
  const cozCircuitId = isSimpleMep ? 'C3-COZ' : 'C4-COZ';
  const cooktopCircuitId = isSimpleMep ? 'C3-COZ' : 'C5-TUE-COZ';
  const acCircuitId = isSimpleMep ? 'C5-AC' : 'C6-AC';

  const rooms: Room[] = [];
  const walls: Wall[] = [];
  const openings: Opening[] = [];
  const furniture: FurnitureItem[] = [];
  const electricalPoints: ElectricalPoint[] = [];
  const waterPoints: WaterPoint[] = [];
  const drainagePoints: DrainagePoint[] = [];

  // Service + Kitchen depths on Left Strip
  const serviceD = input.hasLaundry ? round2(Math.min(1.5, Math.max(1.2, usableD * 0.15))) : 0;
  const cozD = round2(Math.min(2.85, Math.max(2.15, usableD * 0.27)));
  const kitchenEndY = round2(serviceD + cozD);

  const laundryRoomId = `${id}-rm-as`;
  const kitchenRoomId = `${id}-rm-coz`;
  const salaRoomId = `${id}-rm-sala`;
  const circRoomId = `${id}-rm-circ`;

  if (input.hasLaundry) {
    rooms.push({
      id: laundryRoomId,
      code: 'A.S.',
      name: 'Área de Serviço',
      category: 'area_servico',
      x: 0,
      y: 0,
      width: socialW,
      depth: serviceD,
      ceilingHeight: H,
      naturalLightingArea: 0.5,
      ventilationArea: 0.25,
      finishes: {
        floor: 'Porcelanato acetinado antiderrapante',
        wall: 'Revestimento cerâmico h=1,50m',
        ceiling: 'Forro gesso RU',
        paint: 'Tinta acrílica lavável',
        baseboard: 'Porcelanato h=8cm',
      },
      notes: 'Área de serviço com ponto dedicado para máquina de lavar.',
    });
  }

  rooms.push(
    {
      id: kitchenRoomId,
      code: 'COZ',
      name: 'Cozinha',
      category: 'cozinha',
      x: 0,
      y: serviceD,
      width: socialW,
      depth: cozD,
      ceilingHeight: H,
      naturalLightingArea: 1.08,
      ventilationArea: 0.54,
      finishes: {
        floor: 'Porcelanato acetinado 60x60cm',
        wall: 'Cerâmica na parede hidráulica + massa corrida PVA',
        ceiling: 'Forro gesso liso',
        paint: 'Tinta acrílica fosca lavável',
        baseboard: 'Porcelanato h=8cm',
        countertop: 'Granito Cinza Corumbá',
        sink: 'Cuba inox AISI 304',
        faucet: 'Torneira bica móvel',
      },
      notes: '',
    },
    {
      id: salaRoomId,
      code: 'SALA',
      name: 'Sala de Estar / Jantar',
      category: 'sala',
      x: 0,
      y: kitchenEndY,
      width: socialW,
      depth: round2(usableD - kitchenEndY),
      ceilingHeight: H,
      naturalLightingArea: 1.8,
      ventilationArea: 0.9,
      finishes: {
        floor: 'Porcelanato acetinado / Vinílico',
        wall: 'Massa corrida PVA',
        ceiling: 'Forro gesso liso tabicado',
        paint: 'Tinta acrílica fosca branco gelo',
        baseboard: 'Poliestireno h=10cm',
      },
      notes: '',
    },
  );

  // Perimeter Walls
  const wTopId = `${id}-w-top`;
  const wRightId = `${id}-w-right`;
  const wBottomId = `${id}-w-bottom`;
  const wLeftId = `${id}-w-left`;
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
      loadBearing: loadBearingExt,
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
      loadBearing: loadBearingExt,
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
      loadBearing: loadBearingExt,
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
      loadBearing: loadBearingExt,
    },
  );

  // Kitchen / A.S. partial divider (with wide 1.1m pass-through)
  if (input.hasLaundry) {
    walls.push({
      id: `${id}-w-as-coz`,
      code: 'P-INT-AS',
      start: { x: 0, y: serviceD },
      end: { x: round2(socialW - 1.05), y: serviceD },
      thickness: intT,
      height: H,
      isExternal: false,
      material: intMatName,
      constructionSystem: sys,
      loadBearing: false,
    });
  }

  // Kitchen / Sala partial wall (leaves open 1.4m pass-through on the right side toward CIRC/Sala)
  if (socialW >= 2.6) {
    walls.push({
      id: `${id}-w-coz-sala`,
      code: 'P-INT-COZ',
      start: { x: 0, y: kitchenEndY },
      end: { x: round2(Math.max(0.8, socialW - 1.45)), y: kitchenEndY },
      thickness: intT,
      height: H,
      isExternal: false,
      material: intMatName,
      constructionSystem: sys,
      loadBearing: false,
    });
  }

  // Private Zone Layout along Right + Back
  const bedInfos: Array<{
    id: string;
    code: string;
    name: string;
    x: number;
    y: number;
    width: number;
    depth: number;
    isMaster: boolean;
  }> = [];
  const bathInfos: Array<{
    id: string;
    code: string;
    name: string;
    x: number;
    y: number;
    width: number;
    depth: number;
    sinkOnWall: 'norte' | 'sul' | 'oeste' | 'leste';
    isSuite: boolean;
  }> = [];

  const bwcSocialD = round2(Math.min(1.65, Math.max(1.38, usableD * 0.16)));

  if (bedrooms === 1) {
    const bwc1Id = `${id}-rm-bwc1`;
    const dorm1Id = `${id}-rm-dorm1`;
    const circYStart = 0;

    rooms.push({
      id: circRoomId,
      code: 'CIRC',
      name: 'Circulação / Hall',
      category: 'circulacao',
      x: socialW,
      y: circYStart,
      width: hallW,
      depth: round2(usableD - circYStart),
      ceilingHeight: H,
      naturalLightingArea: 0.4,
      ventilationArea: 0.2,
      finishes: {
        floor: 'Porcelanato acetinado',
        wall: 'Massa corrida PVA',
        ceiling: 'Forro gesso liso',
        paint: 'Tinta acrílica fosca',
        baseboard: 'Poliestireno h=10cm',
      },
      notes: '',
    });

    const bwcD = round2(Math.min(2.15, Math.max(1.6, usableD * 0.26)));
    bathInfos.push({
      id: bwc1Id,
      code: 'BWC',
      name: input.accessible ? 'Banheiro Acessível' : 'Banheiro Social',
      x: corrEndX,
      y: 0,
      width: privW,
      depth: bwcD,
      sinkOnWall: 'leste',
      isSuite: false,
    });
    bedInfos.push({
      id: dorm1Id,
      code: 'DORM1',
      name: 'Dormitório Casal',
      x: corrEndX,
      y: bwcD,
      width: privW,
      depth: round2(usableD - bwcD),
      isMaster: true,
    });

    // Spine wall separating Social/Kitchen from CIRC (stops at kitchenEndY so Sala flows into CIRC!)
    const wSpineLeftId = `${id}-w-spine-l`;
    walls.push({
      id: wSpineLeftId,
      code: 'P-INT-COR-L',
      start: { x: socialW, y: 0 },
      end: { x: socialW, y: kitchenEndY },
      thickness: intT,
      height: H,
      isExternal: false,
      material: intMatName,
      constructionSystem: sys,
      loadBearing: false,
    });

    const wSpineRightId = `${id}-w-spine-r`;
    const wBwcBotId = `${id}-w-bwc-b`;
    walls.push(
      {
        id: wSpineRightId,
        code: 'P-INT-COR-R',
        start: { x: corrEndX, y: 0 },
        end: { x: corrEndX, y: usableD },
        thickness: intT,
        height: H,
        isExternal: false,
        material: intMatName,
        constructionSystem: sys,
        loadBearing: false,
      },
      {
        id: wBwcBotId,
        code: 'P-INT-BWC-S',
        start: { x: corrEndX, y: bwcD },
        end: { x: W, y: bwcD },
        thickness: intT,
        height: H,
        isExternal: false,
        material: intMatName,
        constructionSystem: sys,
        loadBearing: false,
      },
    );

    const bwcDoorW = input.accessible ? 0.8 : 0.7;
    openings.push(
      {
        id: `${id}-op-p-bwc1`,
        code: 'P2',
        wallId: wSpineRightId,
        type: 'porta',
        role: 'banheiro',
        openingKind: 'porta_abrir',
        subtype: `Porta banheiro ${Math.round(bwcDoorW * 100)}x210cm`,
        offsetAlongWall: round2(Math.max(0.2, bwcD - bwcDoorW - 0.14)),
        width: bwcDoorW,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.035,
        swingDirection: 'right_out', // Vertical top->bottom: out = +X into BWC
        material: 'Madeira resistente à umidade',
      },
      {
        id: `${id}-op-p-dorm1`,
        code: 'P3',
        wallId: wSpineRightId,
        type: 'porta',
        role: 'quarto',
        openingKind: 'porta_abrir',
        subtype: 'Porta dormitório 80x210cm',
        offsetAlongWall: round2(bwcD + 0.18),
        width: 0.8,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.035,
        swingDirection: 'right_out',
        material: 'Madeira semi-oca pintada',
      },
    );
  } else {
    // 2 or 3 Bedrooms: Dorm 1 (or Suíte Master) at Back-Right (x: socialW..W, y: 0..d1)
    const d1 = round2(
      bedrooms === 2
        ? Math.min(3.45, Math.max(2.7, usableD * 0.36))
        : Math.min(3.15, Math.max(2.55, usableD * 0.3)),
    );
    const dorm1Id = `${id}-rm-dorm1`;
    const bwc1Id = `${id}-rm-bwc1`;
    const bwc2Id = `${id}-rm-bwc2`;

    rooms.push({
      id: circRoomId,
      code: 'CIRC',
      name: 'Circulação / Hall',
      category: 'circulacao',
      x: socialW,
      y: d1,
      width: hallW,
      depth: round2(usableD - d1),
      ceilingHeight: H,
      naturalLightingArea: 0.4,
      ventilationArea: 0.2,
      finishes: {
        floor: 'Porcelanato acetinado',
        wall: 'Massa corrida PVA',
        ceiling: 'Forro gesso liso',
        paint: 'Tinta acrílica fosca',
        baseboard: 'Poliestireno h=10cm',
      },
      notes: '',
    });

    const suiteBwcW = hasSuite ? round2(Math.min(1.55, Math.max(1.25, (W - socialW) * 0.35))) : 0;
    const suiteBwcD = hasSuite ? round2(Math.min(1.85, Math.max(1.42, d1 * 0.58))) : 0;

    bedInfos.push({
      id: dorm1Id,
      code: hasSuite ? 'SUITE' : 'DORM1',
      name: hasSuite ? 'Suíte Master' : 'Dormitório 1',
      x: hasSuite ? round2(socialW + suiteBwcW) : socialW,
      y: 0,
      width: round2(W - socialW - suiteBwcW),
      depth: d1,
      isMaster: true,
    });

    if (hasSuite) {
      bathInfos.push({
        id: bwc2Id,
        code: 'BWC-S',
        name: 'Banheiro Suíte',
        x: socialW,
        y: 0,
        width: suiteBwcW,
        depth: suiteBwcD,
        sinkOnWall: 'oeste',
        isSuite: true,
      });
    }

    // BWC Social right below Dorm 1 (x: corrEndX..W, y: d1..d1+bwcSocialD)
    bathInfos.push({
      id: bwc1Id,
      code: 'BWC',
      name: input.accessible ? 'Banheiro Acessível' : 'Banheiro Social',
      x: corrEndX,
      y: d1,
      width: privW,
      depth: bwcSocialD,
      sinkOnWall: 'leste',
      isSuite: false,
    });

    const restD = round2(usableD - (d1 + bwcSocialD));
    if (bedrooms === 2) {
      bedInfos.push({
        id: `${id}-rm-dorm2`,
        code: 'DORM2',
        name: 'Dormitório 2',
        x: corrEndX,
        y: round2(d1 + bwcSocialD),
        width: privW,
        depth: restD,
        isMaster: false,
      });
    } else {
      const d2 = round2(restD * 0.5);
      const d3 = round2(restD - d2);
      bedInfos.push(
        {
          id: `${id}-rm-dorm2`,
          code: 'DORM2',
          name: 'Dormitório 2',
          x: corrEndX,
          y: round2(d1 + bwcSocialD),
          width: privW,
          depth: d2,
          isMaster: false,
        },
        {
          id: `${id}-rm-dorm3`,
          code: 'DORM3',
          name: 'Dormitório 3',
          x: corrEndX,
          y: round2(d1 + bwcSocialD + d2),
          width: privW,
          depth: d3,
          isMaster: false,
        },
      );
    }

    // Spine walls & Room partitions
    walls.push({
      id: `${id}-w-spine-l`,
      code: 'P-INT-COR-L',
      start: { x: socialW, y: 0 },
      end: { x: socialW, y: kitchenEndY },
      thickness: intT,
      height: H,
      isExternal: false,
      material: intMatName,
      constructionSystem: sys,
      loadBearing: false,
    });

    const wDorm1BotId = `${id}-w-dorm1-b`;
    walls.push({
      id: wDorm1BotId,
      code: 'P-INT-D1',
      start: { x: socialW, y: d1 },
      end: { x: W, y: d1 },
      thickness: intT,
      height: H,
      isExternal: false,
      material: intMatName,
      constructionSystem: sys,
      loadBearing: false,
    });

    // Door to Dorm 1 / Suíte along wDorm1BotId inside CIRC
    const dorm1DoorOff = round2(
      hasSuite ? Math.max(0.14, (hallW - 0.8) * 0.5) : Math.max(0.12, (hallW - 0.8) * 0.5),
    );
    openings.push({
      id: `${id}-op-p-dorm1`,
      code: 'P3',
      wallId: wDorm1BotId,
      type: 'porta',
      role: 'quarto',
      openingKind: 'porta_abrir',
      subtype: 'Porta dormitório 80x210cm',
      offsetAlongWall: dorm1DoorOff,
      width: 0.8,
      height: 2.1,
      sillHeight: 0,
      thickness: 0.035,
      swingDirection: 'right_out', // Horizontal left->right: out = -Y into Dorm 1
      material: 'Madeira semi-oca pintada',
    });

    if (hasSuite) {
      const wSuiteRId = `${id}-w-suite-r`;
      const wSuiteBId = `${id}-w-suite-b`;
      walls.push(
        {
          id: wSuiteRId,
          code: 'P-INT-BWCS-L',
          start: { x: round2(socialW + suiteBwcW), y: 0 },
          end: { x: round2(socialW + suiteBwcW), y: suiteBwcD },
          thickness: intT,
          height: H,
          isExternal: false,
          material: intMatName,
          constructionSystem: sys,
          loadBearing: false,
        },
        {
          id: wSuiteBId,
          code: 'P-INT-BWCS-S',
          start: { x: socialW, y: suiteBwcD },
          end: { x: round2(socialW + suiteBwcW), y: suiteBwcD },
          thickness: intT,
          height: H,
          isExternal: false,
          material: intMatName,
          constructionSystem: sys,
          loadBearing: false,
        },
      );
      openings.push({
        id: `${id}-op-p-bwc-suite`,
        code: 'P4',
        wallId: wSuiteRId,
        type: 'porta',
        role: 'banheiro',
        openingKind: 'porta_abrir',
        subtype: 'Porta BWC Suíte 70x210cm',
        offsetAlongWall: round2(Math.max(0.14, suiteBwcD - 0.82)),
        width: 0.7,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.035,
        swingDirection: 'left_in', // Vertical top->bottom: in = -X into BWC Suíte
        material: 'Madeira resistente à umidade',
      });
    }

    const wSpineRightId = `${id}-w-spine-r`;
    walls.push(
      {
        id: wSpineRightId,
        code: 'P-INT-COR-R',
        start: { x: corrEndX, y: d1 },
        end: { x: corrEndX, y: usableD },
        thickness: intT,
        height: H,
        isExternal: false,
        material: intMatName,
        constructionSystem: sys,
        loadBearing: false,
      },
      {
        id: `${id}-w-bwc1-b`,
        code: 'P-INT-BWC-S',
        start: { x: corrEndX, y: round2(d1 + bwcSocialD) },
        end: { x: W, y: round2(d1 + bwcSocialD) },
        thickness: intT,
        height: H,
        isExternal: false,
        material: intMatName,
        constructionSystem: sys,
        loadBearing: false,
      },
    );

    const bwcDoorW = input.accessible ? 0.8 : 0.7;
    openings.push(
      {
        id: `${id}-op-p-bwc1`,
        code: 'P2',
        wallId: wSpineRightId,
        type: 'porta',
        role: 'banheiro',
        openingKind: 'porta_abrir',
        subtype: `Porta banheiro ${Math.round(bwcDoorW * 100)}x210cm`,
        offsetAlongWall: round2(Math.max(0.14, bwcSocialD - bwcDoorW - 0.14)),
        width: bwcDoorW,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.035,
        swingDirection: 'right_out', // +X into BWC Social
        material: 'Madeira resistente à umidade',
      },
      {
        id: `${id}-op-p-dorm2`,
        code: 'P5',
        wallId: wSpineRightId,
        type: 'porta',
        role: 'quarto',
        openingKind: 'porta_abrir',
        subtype: 'Porta Dormitório 2 80x210cm',
        offsetAlongWall: round2(bwcSocialD + 0.18),
        width: 0.8,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.035,
        swingDirection: 'right_out',
        material: 'Madeira semi-oca pintada',
      },
    );

    if (bedrooms === 3) {
      const d2End = round2(d1 + bwcSocialD + (usableD - (d1 + bwcSocialD)) * 0.5);
      walls.push({
        id: `${id}-w-dorm2-b`,
        code: 'P-INT-D23',
        start: { x: corrEndX, y: d2End },
        end: { x: W, y: d2End },
        thickness: intT,
        height: H,
        isExternal: false,
        material: intMatName,
        constructionSystem: sys,
        loadBearing: false,
      });
      openings.push({
        id: `${id}-op-p-dorm3`,
        code: 'P6',
        wallId: wSpineRightId,
        type: 'porta',
        role: 'quarto',
        openingKind: 'porta_abrir',
        subtype: 'Porta Dormitório 3 80x210cm',
        offsetAlongWall: round2(d2End - d1 + 0.18),
        width: 0.8,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.035,
        swingDirection: 'right_out',
        material: 'Madeira semi-oca pintada',
      });
    }
  }

  for (const b of bathInfos) {
    rooms.push({
      id: b.id,
      code: b.code,
      name: b.name,
      category: 'banheiro',
      x: b.x,
      y: b.y,
      width: b.width,
      depth: b.depth,
      ceilingHeight: Math.min(H, 2.55),
      naturalLightingArea: 0.48,
      ventilationArea: 0.24,
      finishes: {
        floor: 'Porcelanato acetinado antiderrapante',
        wall: 'Revestimento cerâmico até o teto',
        ceiling: 'Forro de gesso acartonado RU',
        paint: 'Tinta acrílica antimofo branco neve',
        baseboard: 'Integrado ao revestimento',
        countertop: 'Granito',
        sink: 'Cuba louça branca',
        faucet: 'Torneira cromada',
      },
      notes: '',
    });
  }

  for (const d of bedInfos) {
    rooms.push({
      id: d.id,
      code: d.code,
      name: d.name,
      category: 'quarto',
      x: d.x,
      y: d.y,
      width: d.width,
      depth: d.depth,
      ceilingHeight: H,
      naturalLightingArea: 1.8,
      ventilationArea: 0.9,
      finishes: {
        floor: 'Piso vinílico / Porcelanato amadeirado',
        wall: 'Massa corrida PVA',
        ceiling: 'Forro gesso liso',
        paint: 'Tinta acrílica fosca branco gelo',
        baseboard: 'Poliestireno h=7cm',
      },
      notes: '',
    });
  }

  addBalconyAndGuardrail({
    id,
    W,
    D,
    H,
    usableD,
    balconyDepth,
    sys,
    rooms,
    walls,
    label: 'Varanda Frontal Coberta',
  });

  // Entry Door P1 (0.90m) + Main Windows
  const entryDoorW = 0.9;
  let entryWallId = wBottomId;
  let entryOffset = round2(Math.max(privW + hallW + 0.25, W - socialW + 0.25));
  let entryWallCode = 'P-EXT-S';
  let entryPtX = round2(socialW - 0.35);
  let entryPtY = round2(usableD - 0.16);

  if (entrySide === 'lateral_esquerda') {
    entryWallId = wLeftId; // (0, usableD) -> (0, 0)
    entryOffset = 0.35;
    entryWallCode = 'P-EXT-O';
    entryPtX = 0.16;
    entryPtY = round2(usableD - 0.22);
  } else if (entrySide === 'lateral_direita') {
    entryWallId = wBottomId;
    entryOffset = round2(Math.max(privW + hallW + 0.25, W - socialW + 0.25));
  }

  openings.push({
    id: `${id}-op-entry`,
    code: 'P1',
    wallId: entryWallId,
    type: 'porta',
    role: 'entrada',
    openingKind: 'porta_abrir',
    subtype: 'Porta Pivotante / Entrada Social 90x210cm',
    offsetAlongWall: entryOffset,
    width: entryDoorW,
    height: 2.1,
    sillHeight: 0,
    thickness: 0.04,
    swingDirection: 'left_in',
    material: 'Madeira maciça / Pintura acetinada',
  });

  // Living room front window (along wBottomId, inside socialW..0)
  const salaWinW = round2(Math.min(1.6, Math.max(1.0, socialW - 1.3)));
  const salaWinOff = entryWallId === wBottomId
    ? round2(Math.min(W - salaWinW - 0.2, entryOffset + entryDoorW + 0.2))
    : round2(W - socialW + (socialW - salaWinW) / 2);
  if (salaWinOff + salaWinW <= W - 0.12) {
    openings.push({
      id: `${id}-op-win-sala`,
      code: 'J1',
      wallId: wBottomId,
      type: 'janela',
      openingKind: input.hasBalcony ? 'porta_correr' : 'janela_correr',
      subtype: input.hasBalcony ? 'Porta-janela correr 2 folhas' : 'Janela Sala 150x120cm',
      offsetAlongWall: salaWinOff,
      width: salaWinW,
      height: input.hasBalcony ? 2.1 : 1.2,
      sillHeight: input.hasBalcony ? 0 : 0.9,
      thickness: 0.04,
      swingDirection: 'sliding',
      material: 'Alumínio anodizado + vidro temperado',
    });
  }

  // Kitchen window on West wall (0, usableD) -> (0, 0)
  openings.push({
    id: `${id}-op-win-coz`,
    code: 'J2',
    wallId: wLeftId,
    type: 'janela',
    openingKind: 'janela_correr',
    subtype: 'Janela Cozinha 120x100cm',
    offsetAlongWall: round2(Math.max(0.25, usableD - kitchenEndY + 0.45)),
    width: 1.2,
    height: 1.0,
    sillHeight: 1.1,
    thickness: 0.04,
    swingDirection: 'sliding',
    material: 'Alumínio + vidro temperado',
  });

  // Bedroom & Bathroom Windows on North / East external walls
  bathInfos.forEach((b, idx) => {
    if (b.isSuite) {
      openings.push({
        id: `${id}-op-win-bwc-${idx}`,
        code: `J-BWC-${idx + 1}`,
        wallId: wTopId,
        type: 'janela',
        openingKind: 'vitro_basculante',
        subtype: 'Vitrô Basculante BWC Suíte 60x60cm',
        offsetAlongWall: round2(b.x + 0.35),
        width: 0.6,
        height: 0.6,
        sillHeight: 1.5,
        thickness: 0.04,
        swingDirection: 'none',
        material: 'Alumínio + vidro canelado',
      });
    } else {
      openings.push({
        id: `${id}-op-win-bwc-${idx}`,
        code: `J-BWC-${idx + 1}`,
        wallId: wRightId,
        type: 'janela',
        openingKind: 'vitro_basculante',
        subtype: 'Vitrô Basculante BWC 60x60cm',
        offsetAlongWall: round2(b.y + 0.35),
        width: 0.6,
        height: 0.6,
        sillHeight: 1.5,
        thickness: 0.04,
        swingDirection: 'none',
        material: 'Alumínio + vidro canelado',
      });
    }
  });

  bedInfos.forEach((bed, idx) => {
    const winW = 1.2;
    if (bed.y === 0) {
      openings.push({
        id: `${id}-op-win-dorm-${idx}`,
        code: `J-D${idx + 1}`,
        wallId: wTopId,
        type: 'janela',
        openingKind: 'janela_correr',
        subtype: 'Janela Dormitório 120x120cm',
        offsetAlongWall: round2(bed.x + Math.max(0.25, (bed.width - winW) / 2)),
        width: winW,
        height: 1.2,
        sillHeight: 0.9,
        thickness: 0.04,
        swingDirection: 'sliding',
        material: 'Alumínio + vidro temperado',
      });
    } else {
      openings.push({
        id: `${id}-op-win-dorm-${idx}`,
        code: `J-D${idx + 1}`,
        wallId: wRightId,
        type: 'janela',
        openingKind: 'janela_correr',
        subtype: 'Janela Dormitório 120x120cm',
        offsetAlongWall: round2(bed.y + Math.max(0.25, (bed.depth - winW) / 2)),
        width: winW,
        height: 1.2,
        sillHeight: 0.9,
        thickness: 0.04,
        swingDirection: 'sliding',
        material: 'Alumínio + vidro temperado',
      });
    }
  });

  // Collect door swing & approach clearance boxes
  const reservedZones: Box2[] = [];
  pushDoorClearanceZones(walls, openings, reservedZones);

  const placer = createFurniturePlacer(furniture, reservedZones);

  // QDC-01 in CIRC dry wall
  electricalPoints.push({
    id: `${id}-el-qdc`,
    code: 'QDC-01',
    category: 'quadro_luz',
    label: 'Quadro de Distribuição (QDC)',
    roomId: circRoomId,
    x: round2(socialW + 0.14),
    y: round2(Math.min(kitchenEndY + 0.25, usableD - 1.2)),
    z: 1.5,
    referenceWall: 'Parede Circulação',
    referenceDistance: 0.25,
    powerVA: 0,
    voltage: 220,
    powerFactor: 1.0,
    circuitId: 'GERAL',
    conductorSectionMm2: 10.0,
    conduitDiameterMm: 25,
    protection: 'Disjuntor Geral Bipolar + IDR 30mA + DPS',
    notes: 'QDC centralizado na circulação/hall da residência',
  });

  // Populate Baths
  const primaryTqId = `${id}-esg-tq-1`;
  const primaryCsId = `${id}-esg-cs-1`;
  bathInfos.forEach((b, idx) => {
    const tqId = idx === 0 ? primaryTqId : `${id}-esg-tq-${idx + 1}`;
    const csId = idx === 0 ? primaryCsId : `${id}-esg-cs-${idx + 1}`;
    addBathFixturesAndMep({
      id,
      suffix: idx === 0 ? 'B1' : 'B2',
      roomId: b.id,
      x: b.x,
      y: b.y,
      width: b.width,
      depth: b.depth,
      H,
      hasShower: true,
      includeHotWater,
      tqId,
      csId,
      sinkOnWall: b.sinkOnWall,
      furniture,
      electricalPoints,
      waterPoints,
      drainagePoints,
      placedBoxes: placer.placedBoxes,
      chuvCircuitId,
      riserX: b.x,
      riserY: b.y,
    });
  });

  // Populate Kitchen & Laundry
  populateKitchenAndLaundry({
    id,
    kitchenRoomId,
    laundryRoomId,
    kitchenX: 0,
    kitchenY: serviceD,
    kitchenW: socialW,
    kitchenD: cozD,
    laundryX: 0,
    laundryY: 0,
    laundryW: socialW,
    laundryD: serviceD,
    hasLaundry: input.hasLaundry,
    H,
    isSimpleMep,
    includeHotWater,
    cozCircuitId,
    cooktopCircuitId,
    tqId: primaryTqId,
    csId: primaryCsId,
    furniture,
    electricalPoints,
    waterPoints,
    drainagePoints,
    placedBoxes: placer.placedBoxes,
  });

  // Populate Bedrooms
  bedInfos.forEach((bed, idx) => {
    populateBedroomFurnitureAndMep({
      id,
      suffix: `D${idx + 1}`,
      roomId: bed.id,
      x: bed.x,
      y: bed.y,
      width: bed.width,
      depth: bed.depth,
      H,
      isMaster: bed.isMaster,
      includeAcCircuit,
      tryCommit: placer.tryCommit,
      electricalPoints,
      acCircuitId,
    });
  });

  // Populate Living / Dining Room
  populateLivingAndDining({
    id,
    salaRoomId,
    x: 0,
    y: kitchenEndY,
    width: socialW,
    depth: round2(usableD - kitchenEndY),
    H,
    entryWallCode,
    entryPointX: entryPtX,
    entryPointY: entryPtY,
    tryCommit: placer.tryCommit,
    furniture,
    electricalPoints,
    includeSpecialSystems,
  });

  // CIRC lighting
  electricalPoints.push({
    id: `${id}-el-il-circ`,
    code: 'IL-CIRC',
    category: 'iluminacao_teto',
    label: 'Ponto Luz Circulação',
    roomId: circRoomId,
    x: round2(socialW + hallW / 2),
    y: round2(usableD * 0.55),
    z: H,
    referenceWall: 'Laje/Forro',
    referenceDistance: round2(hallW / 2),
    powerVA: 80,
    voltage: 127,
    powerFactor: 0.92,
    circuitId: 'C1-ILUM',
    conductorSectionMm2: 1.5,
    conduitDiameterMm: 20,
    protection: 'Disjuntor 10A',
    notes: '',
  });

  return {
    id,
    code: input.code,
    name: input.name,
    basePreset: input.basePreset ?? `Casa Térrea ${bedrooms}Q`,
    buildingKind: 'casa_terrea',
    targetArea: round2(W * D),
    width: W,
    depth: D,
    ceilingHeight: H,
    bedrooms,
    suites: hasSuite ? 1 : 0,
    bathrooms: bathCount,
    kitchens: 1,
    hasLaundry: input.hasLaundry,
    hasBalcony: input.hasBalcony,
    hasDiningArea: true,
    totalStories: 1,
    storyIndex: 0,
    hasMezzanine: false,
    entrySide,
    internalPartitionType,
    accessible: input.accessible,
    finishStandard: input.finishStandard ?? 'padrao',
    mepProfile,
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

// ============================================================================
// 2. SOBRADO (CASA COM ANDARES) — TÉRREO, 1º PAVIMENTO E 2º PAVIMENTO
// ============================================================================
export interface SobradoFloorInput extends ParametricTypologyInput {
  storyIndex: number;
  totalStories: number;
  linkedHouseGroupId: string;
  floorToFloorHeight?: number;
}

export function generateSobradoFloorLayout(input: SobradoFloorInput): UnitType {
  const id = input.id ?? nextId('ut');
  const W = Math.max(4.8, round2(input.width));
  const D = Math.max(7.2, round2(input.depth));
  const H = Math.max(2.6, round2(input.ceilingHeight));
  const floorToFloorHeight = Math.max(H + 0.15, round2(input.floorToFloorHeight ?? H + 0.15));
  const extT = Math.max(0.1, round2(input.extWallThickness));
  const internalPartitionType: InternalPartitionType =
    input.internalPartitionType ?? 'alvenaria';
  const intT =
    internalPartitionType === 'drywall'
      ? Math.max(0.075, round2(Math.min(input.intWallThickness || 0.095, 0.095)))
      : Math.max(0.08, round2(input.intWallThickness));
  const sys = input.constructionSystem;
  const { matName, intMatName, loadBearingExt } = getSystemWallMaterial(
    sys,
    internalPartitionType,
  );
  const entrySide: EntrySide = input.entrySide ?? 'frente';
  const bedrooms = Math.max(1, Math.min(3, Math.round(input.bedrooms || 3)));
  const totalStories = Math.max(2, Math.min(3, Math.round(input.totalStories || 2)));
  const storyIndex = Math.max(0, Math.min(totalStories - 1, Math.round(input.storyIndex || 0)));
  const hasSuite = bedrooms >= 2 && (input.suites ?? 1) >= 1 && W >= 5.2;

  const balconyDepth = input.hasBalcony ? Math.min(1.5, round2(D * 0.15)) : 0;
  const usableD = round2(D - balconyDepth);

  // Full floor-to-floor Blondel staircase shared coordinates across all stories!
  const stairSpecRaw = computeBlondelStairSpec(floorToFloorHeight, 'reta', 'norte');
  const stairW = W >= 6.2 ? 0.95 : 0.88;
  // Clamp flight run so landing at back (>=1.15m) & living space at front (>=2.3m) always stay open
  const maxStairRun = round2(Math.max(2.9, usableD - 3.6));
  const stairD = round2(Math.min(maxStairRun, Math.max(3.1, stairSpecRaw.footprintD)));
  const steps = stairSpecRaw.steps;
  const treadM = round3(stairD / steps);
  const stairSpec = {
    ...stairSpecRaw,
    widthM: stairW,
    treadM: round2(treadM),
    blondelSumM: round3(2 * stairSpecRaw.riserM + treadM),
  };
  const stairX = round2(W - stairW - 0.08);
  const stairY = round2(Math.max(1.15, Math.min(1.75, usableD - stairD - 2.35)));
  const stairEndY = round2(stairY + stairD);

  const mepProfile: 'simples' | 'completo' = input.mepProfile ?? 'completo';
  const isSimpleMep = mepProfile === 'simples';
  const includeHotWater = input.includeHotWater ?? !isSimpleMep;
  const includeAcCircuit = input.includeAcCircuit ?? !isSimpleMep;
  const includeSpecialSystems = input.includeSpecialSystems ?? !isSimpleMep;
  const chuvCircuitId = isSimpleMep ? 'C4-CHUV' : 'C3-CHUV';
  const cozCircuitId = isSimpleMep ? 'C3-COZ' : 'C4-COZ';
  const cooktopCircuitId = isSimpleMep ? 'C3-COZ' : 'C5-TUE-COZ';
  const acCircuitId = isSimpleMep ? 'C5-AC' : 'C6-AC';

  const rooms: Room[] = [];
  const walls: Wall[] = [];
  const openings: Opening[] = [];
  const furniture: FurnitureItem[] = [];
  const electricalPoints: ElectricalPoint[] = [];
  const waterPoints: WaterPoint[] = [];
  const drainagePoints: DrainagePoint[] = [];

  // Shared perimeter walls
  const wTopId = `${id}-w-top`;
  const wRightId = `${id}-w-right`;
  const wBottomId = `${id}-w-bottom`;
  const wLeftId = `${id}-w-left`;
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
      loadBearing: loadBearingExt,
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
      loadBearing: loadBearingExt,
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
      loadBearing: loadBearingExt,
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
      loadBearing: loadBearingExt,
    },
  );

  // =========================================================================
  // PAVIMENTO TÉRREO (storyIndex === 0)
  // =========================================================================
  if (storyIndex === 0) {
    const wetW = round2(Math.max(2.35, Math.min(W * 0.45, stairX - 1.55)));
    const serviceD = input.hasLaundry ? round2(Math.min(1.45, Math.max(1.15, usableD * 0.15))) : 0;
    const cozD = round2(Math.min(2.65, Math.max(2.1, usableD * 0.28)));
    const wetEndY = round2(serviceD + cozD);
    const lavW = round2(Math.min(1.55, Math.max(1.2, stairX - wetW - 0.1)));
    const lavD = round2(Math.min(1.85, Math.max(1.45, wetEndY * 0.5)));

    const laundryRoomId = `${id}-rm-as`;
    const kitchenRoomId = `${id}-rm-coz`;
    const lavRoomId = `${id}-rm-lav`;
    const salaRoomId = `${id}-rm-sala`;

    if (input.hasLaundry) {
      rooms.push({
        id: laundryRoomId,
        code: 'A.S.',
        name: 'Área de Serviço',
        category: 'area_servico',
        x: 0,
        y: 0,
        width: wetW,
        depth: serviceD,
        ceilingHeight: H,
        naturalLightingArea: 0.48,
        ventilationArea: 0.24,
        finishes: {
          floor: 'Porcelanato acetinado antiderrapante',
          wall: 'Revestimento cerâmico h=1,50m',
          ceiling: 'Laje / Forro gesso RU',
          paint: 'Tinta acrílica lavável',
          baseboard: 'Porcelanato h=8cm',
        },
        notes: 'Área de serviço com ponto para máquina de lavar.',
      });
    }

    rooms.push(
      {
        id: kitchenRoomId,
        code: 'COZ',
        name: 'Cozinha',
        category: 'cozinha',
        x: 0,
        y: serviceD,
        width: wetW,
        depth: cozD,
        ceilingHeight: H,
        naturalLightingArea: 1.0,
        ventilationArea: 0.5,
        finishes: {
          floor: 'Porcelanato acetinado 60x60cm',
          wall: 'Cerâmica na parede hidráulica + massa corrida PVA',
          ceiling: 'Forro gesso liso',
          paint: 'Tinta acrílica lavável',
          baseboard: 'Porcelanato h=8cm',
        },
        notes: '',
      },
      {
        id: lavRoomId,
        code: 'LAV',
        name: 'Lavabo Térreo',
        category: 'banheiro',
        x: wetW,
        y: 0,
        width: lavW,
        depth: lavD,
        ceilingHeight: Math.min(H, 2.55),
        naturalLightingArea: 0.36,
        ventilationArea: 0.18,
        finishes: {
          floor: 'Porcelanato acetinado',
          wall: 'Cerâmica + pintura acrílica',
          ceiling: 'Forro gesso RU',
          paint: 'Tinta acrílica antimofo',
          baseboard: 'Porcelanato',
        },
        notes: 'Lavabo social pavimento térreo.',
      },
      {
        id: salaRoomId,
        code: 'SALA',
        name: 'Sala de Estar / Jantar',
        category: 'sala',
        x: 0,
        y: wetEndY,
        width: W,
        depth: round2(usableD - wetEndY),
        ceilingHeight: H,
        naturalLightingArea: 2.0,
        ventilationArea: 1.0,
        finishes: {
          floor: 'Porcelanato acetinado / Vinílico',
          wall: 'Massa corrida PVA',
          ceiling: 'Forro gesso liso tabicado',
          paint: 'Tinta acrílica fosca branco gelo',
          baseboard: 'Poliestireno h=10cm',
        },
        notes: 'Sala integrada com acesso à escada do pavimento superior.',
      },
    );

    if (input.hasLaundry) {
      walls.push({
        id: `${id}-w-as-coz`,
        code: 'P-INT-AS',
        start: { x: 0, y: serviceD },
        end: { x: round2(wetW - 0.95), y: serviceD },
        thickness: intT,
        height: H,
        isExternal: false,
        material: intMatName,
        constructionSystem: sys,
        loadBearing: false,
      });
    }

    const wWetRightId = `${id}-w-wet-r`;
    const wLavRightId = `${id}-w-lav-r`;
    const wLavBotId = `${id}-w-lav-b`;
    walls.push(
      {
        id: wWetRightId,
        code: 'P-INT-COZ-R',
        start: { x: wetW, y: 0 },
        end: { x: wetW, y: wetEndY },
        thickness: intT,
        height: H,
        isExternal: false,
        material: intMatName,
        constructionSystem: sys,
        loadBearing: false,
      },
      {
        id: wLavRightId,
        code: 'P-INT-LAV-R',
        start: { x: round2(wetW + lavW), y: 0 },
        end: { x: round2(wetW + lavW), y: lavD },
        thickness: intT,
        height: H,
        isExternal: false,
        material: intMatName,
        constructionSystem: sys,
        loadBearing: false,
      },
      {
        id: wLavBotId,
        code: 'P-INT-LAV-S',
        start: { x: wetW, y: lavD },
        end: { x: round2(wetW + lavW), y: lavD },
        thickness: intT,
        height: H,
        isExternal: false,
        material: intMatName,
        constructionSystem: sys,
        loadBearing: false,
      },
      {
        id: `${id}-w-coz-sala`,
        code: 'P-INT-COZ-S',
        start: { x: 0, y: wetEndY },
        end: { x: round2(Math.max(0.7, wetW - 1.35)), y: wetEndY },
        thickness: intT,
        height: H,
        isExternal: false,
        material: intMatName,
        constructionSystem: sys,
        loadBearing: false,
      },
    );

    openings.push({
      id: `${id}-op-p-lav`,
      code: 'P2',
      wallId: wLavBotId,
      type: 'porta',
      role: 'banheiro',
      openingKind: 'porta_abrir',
      subtype: 'Porta Lavabo 60x210cm',
      offsetAlongWall: round2(Math.max(0.15, lavW - 0.72)),
      width: 0.6,
      height: 2.1,
      sillHeight: 0,
      thickness: 0.035,
      swingDirection: 'right_out', // Horizontal left->right: out = -Y into Lavabo
      material: 'Madeira resistente à umidade',
    });

    addBalconyAndGuardrail({
      id,
      W,
      D,
      H,
      usableD,
      balconyDepth,
      sys,
      rooms,
      walls,
      label: 'Varanda Gourmet / Terraço Térreo',
    });

    // Entry Door P1 + Windows
    const entryDoorW = 0.9;
    let entryWallId = wBottomId;
    let entryOffset = round2(Math.max(0.25, W - 1.35));
    let entryWallCode = 'P-EXT-S';
    let entryPtX = 0.25;
    let entryPtY = round2(usableD - 0.16);
    if (entrySide === 'lateral_esquerda') {
      entryWallId = wLeftId;
      entryOffset = 0.35;
      entryWallCode = 'P-EXT-O';
      entryPtX = 0.16;
      entryPtY = round2(usableD - 0.25);
    } else if (entrySide === 'lateral_direita') {
      entryWallId = wRightId;
      entryOffset = round2(Math.max(stairEndY + 0.18, usableD - 1.2));
      entryWallCode = 'P-EXT-L';
      entryPtX = round2(W - 0.16);
      entryPtY = round2(usableD - 0.25);
    }

    openings.push(
      {
        id: `${id}-op-entry`,
        code: 'P1',
        wallId: entryWallId,
        type: 'porta',
        role: 'entrada',
        openingKind: 'porta_abrir',
        subtype: 'Porta Entrada Principal 90x210cm',
        offsetAlongWall: entryOffset,
        width: entryDoorW,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.04,
        swingDirection: 'left_in',
        material: 'Madeira maciça / Pintura acetinada',
      },
      {
        id: `${id}-op-win-sala`,
        code: 'J1',
        wallId: wBottomId,
        type: 'janela',
        openingKind: input.hasBalcony ? 'porta_correr' : 'janela_correr',
        subtype: input.hasBalcony ? 'Porta-janela correr Varanda' : 'Janela Sala Estar 160x120cm',
        offsetAlongWall: entryWallId === wBottomId ? 0.35 : round2((W - 1.6) / 2),
        width: 1.6,
        height: input.hasBalcony ? 2.1 : 1.2,
        sillHeight: input.hasBalcony ? 0 : 0.9,
        thickness: 0.04,
        swingDirection: 'sliding',
        material: 'Alumínio + vidro temperado',
      },
      {
        id: `${id}-op-win-coz`,
        code: 'J2',
        wallId: wLeftId,
        type: 'janela',
        openingKind: 'janela_correr',
        subtype: 'Janela Cozinha 120x100cm',
        offsetAlongWall: round2(Math.max(0.25, usableD - wetEndY + 0.45)),
        width: 1.2,
        height: 1.0,
        sillHeight: 1.1,
        thickness: 0.04,
        swingDirection: 'sliding',
        material: 'Alumínio + vidro temperado',
      },
      {
        id: `${id}-op-win-lav`,
        code: 'J3',
        wallId: wTopId,
        type: 'janela',
        openingKind: 'vitro_basculante',
        subtype: 'Vitrô Basculante Lavabo 60x60cm',
        offsetAlongWall: round2(wetW + 0.3),
        width: 0.6,
        height: 0.6,
        sillHeight: 1.5,
        thickness: 0.04,
        swingDirection: 'none',
        material: 'Alumínio + vidro canelado',
      },
    );

    const reservedZones: Box2[] = [
      padBox({ x: stairX, y: stairY, width: stairW, depth: stairD }, 0.2),
    ];
    pushDoorClearanceZones(walls, openings, reservedZones);

    const placer = createFurniturePlacer(furniture, reservedZones);

    // Full floor-to-floor Blondel Staircase
    furniture.push({
      id: `${id}-fur-escada`,
      name: `Escada Sobrado (${steps} degraus • 2h+p=${stairSpec.blondelSumM.toFixed(2)}m)`,
      category: 'escada',
      roomId: salaRoomId,
      x: stairX,
      y: stairY,
      width: stairW,
      depth: stairD,
      height: floorToFloorHeight,
      elevationM: 0,
      rotationDeg: 0,
      stairSpec,
    });

    // QDC-01 Térreo
    electricalPoints.push({
      id: `${id}-el-qdc`,
      code: 'QDC-01',
      category: 'quadro_luz',
      label: 'Quadro Geral Distribuição (Térreo)',
      roomId: salaRoomId,
      x: round2(wetW + 0.2),
      y: round2(lavD + 0.2),
      z: 1.5,
      referenceWall: 'Parede Lavabo',
      referenceDistance: 0.2,
      powerVA: 0,
      voltage: 220,
      powerFactor: 1.0,
      circuitId: 'GERAL',
      conductorSectionMm2: 10.0,
      conduitDiameterMm: 25,
      protection: 'Disjuntor Geral Bipolar + IDR 30mA + DPS',
      notes: 'QDC Principal no Pavimento Térreo',
    });

    const primaryTqId = `${id}-esg-tq-1`;
    const primaryCsId = `${id}-esg-cs-1`;

    addBathFixturesAndMep({
      id,
      suffix: 'LAV',
      roomId: lavRoomId,
      x: wetW,
      y: 0,
      width: lavW,
      depth: lavD,
      H,
      hasShower: false,
      includeHotWater: false,
      tqId: primaryTqId,
      csId: primaryCsId,
      sinkOnWall: 'oeste',
      furniture,
      electricalPoints,
      waterPoints,
      drainagePoints,
      placedBoxes: placer.placedBoxes,
      chuvCircuitId,
      riserX: wetW,
      riserY: 0,
    });

    populateKitchenAndLaundry({
      id,
      kitchenRoomId,
      laundryRoomId,
      kitchenX: 0,
      kitchenY: serviceD,
      kitchenW: wetW,
      kitchenD: cozD,
      laundryX: 0,
      laundryY: 0,
      laundryW: wetW,
      laundryD: serviceD,
      hasLaundry: input.hasLaundry,
      H,
      isSimpleMep,
      includeHotWater,
      cozCircuitId,
      cooktopCircuitId,
      tqId: primaryTqId,
      csId: primaryCsId,
      furniture,
      electricalPoints,
      waterPoints,
      drainagePoints,
      placedBoxes: placer.placedBoxes,
    });

    populateLivingAndDining({
      id,
      salaRoomId,
      x: 0,
      y: wetEndY,
      width: round2(W - stairW - 0.2),
      depth: round2(usableD - wetEndY),
      H,
      entryWallCode,
      entryPointX: entryPtX,
      entryPointY: entryPtY,
      tryCommit: placer.tryCommit,
      furniture,
      electricalPoints,
      includeSpecialSystems,
    });

    return {
      id,
      code: input.code,
      name: input.name,
      basePreset: input.basePreset ?? `Sobrado ${totalStories} Pav. — Térreo`,
      buildingKind: 'casa_sobrado',
      targetArea: round2(W * D),
      width: W,
      depth: D,
      ceilingHeight: H,
      bedrooms: 0,
      suites: 0,
      bathrooms: 1,
      kitchens: 1,
      hasLaundry: input.hasLaundry,
      hasBalcony: input.hasBalcony,
      hasDiningArea: true,
      totalStories,
      storyIndex: 0,
      linkedHouseGroupId: input.linkedHouseGroupId,
      hasMezzanine: false,
      entrySide,
      internalPartitionType,
      accessible: input.accessible,
      finishStandard: input.finishStandard ?? 'padrao',
      mepProfile,
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

  // =========================================================================
  // PAVIMENTO SUPERIOR (storyIndex === 1) ou 2º PAVIMENTO / ÁTICO (storyIndex >= 2)
  // =========================================================================
  const stairVoid: StairVoidSpec = {
    x: stairX,
    y: stairY,
    width: stairW,
    depth: stairD,
    landingEdge: 'norte',
  };

  if (storyIndex >= 2) {
    // 2º Pavimento / Ático (Suíte Master / Estar Íntimo + BWC + Varanda/Terraço)
    const circW = round2(Math.max(1.1, W * 0.25));
    const hallRoomId = `${id}-rm-circ`;
    const bwcRoomId = `${id}-rm-bwc-at`;
    const estarRoomId = `${id}-rm-atic`;

    const leftW = round2(stairX - 1.15);
    const bwcD = round2(Math.min(2.1, Math.max(1.5, usableD * 0.24)));
    const midY = round2(stairEndY + 0.15);

    rooms.push(
      {
        id: hallRoomId,
        code: 'HALL',
        name: 'Hall 2º Pavimento',
        category: 'circulacao',
        x: leftW,
        y: 0,
        width: round2(stairX - leftW),
        depth: midY,
        ceilingHeight: H,
        naturalLightingArea: 0.4,
        ventilationArea: 0.2,
        finishes: {
          floor: 'Porcelanato acetinado',
          wall: 'Massa corrida PVA',
          ceiling: 'Forro gesso',
          paint: 'Tinta acrílica fosca',
          baseboard: 'Poliestireno h=10cm',
        },
        notes: 'Desembarque escada 2º pavimento.',
      },
      {
        id: bwcRoomId,
        code: 'BWC',
        name: 'Banheiro 2º Pavimento',
        category: 'banheiro',
        x: 0,
        y: 0,
        width: leftW,
        depth: bwcD,
        ceilingHeight: Math.min(H, 2.55),
        naturalLightingArea: 0.48,
        ventilationArea: 0.24,
        finishes: {
          floor: 'Porcelanato acetinado antiderrapante',
          wall: 'Cerâmica até o teto',
          ceiling: 'Forro gesso RU',
          paint: 'Tinta antimofo',
          baseboard: 'Cerâmica',
        },
        notes: '',
      },
      {
        id: estarRoomId,
        code: 'ATICO',
        name: 'Suíte / Estar Íntimo Superior',
        category: 'quarto',
        x: 0,
        y: bwcD,
        width: leftW,
        depth: round2(usableD - bwcD),
        ceilingHeight: H,
        naturalLightingArea: 1.8,
        ventilationArea: 0.9,
        finishes: {
          floor: 'Piso vinílico / Porcelanato amadeirado',
          wall: 'Massa corrida PVA',
          ceiling: 'Forro gesso',
          paint: 'Tinta acrílica',
          baseboard: 'Poliestireno h=7cm',
        },
        notes: '',
      },
    );

    const wBwcR = `${id}-w-at-bwc-r`;
    const wBwcB = `${id}-w-at-bwc-b`;
    const wAtR = `${id}-w-at-r`;
    walls.push(
      {
        id: wBwcR,
        code: 'P-INT-BWC-R',
        start: { x: leftW, y: 0 },
        end: { x: leftW, y: bwcD },
        thickness: intT,
        height: H,
        isExternal: false,
        material: intMatName,
        constructionSystem: sys,
        loadBearing: false,
      },
      {
        id: wBwcB,
        code: 'P-INT-BWC-S',
        start: { x: 0, y: bwcD },
        end: { x: leftW, y: bwcD },
        thickness: intT,
        height: H,
        isExternal: false,
        material: intMatName,
        constructionSystem: sys,
        loadBearing: false,
      },
      {
        id: wAtR,
        code: 'P-INT-AT-R',
        start: { x: leftW, y: bwcD },
        end: { x: leftW, y: midY },
        thickness: intT,
        height: H,
        isExternal: false,
        material: intMatName,
        constructionSystem: sys,
        loadBearing: false,
      },
    );

    openings.push(
      {
        id: `${id}-op-p-bwc-at`,
        code: 'P2',
        wallId: wBwcR,
        type: 'porta',
        role: 'banheiro',
        openingKind: 'porta_abrir',
        subtype: 'Porta BWC 70x210cm',
        offsetAlongWall: round2(Math.max(0.15, bwcD - 0.85)),
        width: 0.7,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.035,
        swingDirection: 'left_in',
        material: 'Madeira resistente à umidade',
      },
      {
        id: `${id}-op-p-at`,
        code: 'P3',
        wallId: wAtR,
        type: 'porta',
        role: 'quarto',
        openingKind: 'porta_abrir',
        subtype: 'Porta Suíte Ático 80x210cm',
        offsetAlongWall: 0.25,
        width: 0.8,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.035,
        swingDirection: 'left_in',
        material: 'Madeira semi-oca pintada',
      },
      {
        id: `${id}-op-win-bwc-at`,
        code: 'J-BWC',
        wallId: wTopId,
        type: 'janela',
        openingKind: 'vitro_basculante',
        subtype: 'Vitrô BWC 60x60cm',
        offsetAlongWall: 0.35,
        width: 0.6,
        height: 0.6,
        sillHeight: 1.5,
        thickness: 0.04,
        swingDirection: 'none',
        material: 'Alumínio + vidro canelado',
      },
      {
        id: `${id}-op-win-at`,
        code: 'J1',
        wallId: wBottomId,
        type: 'janela',
        openingKind: input.hasBalcony ? 'porta_correr' : 'janela_correr',
        subtype: 'Janela / Porta Terraço 150cm',
        offsetAlongWall: round2(Math.max(0.3, W - leftW + 0.3)),
        width: 1.5,
        height: input.hasBalcony ? 2.1 : 1.2,
        sillHeight: input.hasBalcony ? 0 : 0.9,
        thickness: 0.04,
        swingDirection: 'sliding',
        material: 'Alumínio + vidro temperado',
      },
    );

    addBalconyAndGuardrail({
      id,
      W,
      D,
      H,
      usableD,
      balconyDepth,
      sys,
      rooms,
      walls,
      label: 'Terraço Superior',
    });

    const reservedZones: Box2[] = [padBox(stairVoid, 0.15)];
    pushDoorClearanceZones(walls, openings, reservedZones);
    const placer = createFurniturePlacer(furniture, reservedZones);

    electricalPoints.push({
      id: `${id}-el-qdc-at`,
      code: 'QDC-03',
      category: 'quadro_luz',
      label: 'Subquadro 2º Pavimento',
      roomId: hallRoomId,
      x: round2(leftW + 0.14),
      y: round2(midY - 0.35),
      z: 1.5,
      referenceWall: 'Parede Hall',
      referenceDistance: 0.35,
      powerVA: 0,
      voltage: 220,
      powerFactor: 1.0,
      circuitId: 'GERAL',
      conductorSectionMm2: 6.0,
      conduitDiameterMm: 25,
      protection: 'Disjuntor Geral + DR',
      notes: 'Subquadro 2º Pavimento',
    });

    addBathFixturesAndMep({
      id,
      suffix: 'AT',
      roomId: bwcRoomId,
      x: 0,
      y: 0,
      width: leftW,
      depth: bwcD,
      H,
      hasShower: true,
      includeHotWater,
      tqId: `${id}-esg-tq-at`,
      csId: `${id}-esg-cs-at`,
      sinkOnWall: 'oeste',
      furniture,
      electricalPoints,
      waterPoints,
      drainagePoints,
      placedBoxes: placer.placedBoxes,
      chuvCircuitId,
      riserX: 0,
      riserY: 0,
    });

    populateBedroomFurnitureAndMep({
      id,
      suffix: 'AT',
      roomId: estarRoomId,
      x: 0,
      y: bwcD,
      width: leftW,
      depth: round2(usableD - bwcD),
      H,
      isMaster: true,
      includeAcCircuit,
      tryCommit: placer.tryCommit,
      electricalPoints,
      acCircuitId,
    });

    void circW;

    return {
      id,
      code: input.code,
      name: input.name,
      basePreset: input.basePreset ?? `Sobrado ${totalStories} Pav. — 2º Pavimento`,
      buildingKind: 'casa_sobrado',
      targetArea: round2(W * D),
      width: W,
      depth: D,
      ceilingHeight: H,
      bedrooms: 1,
      suites: 1,
      bathrooms: 1,
      kitchens: 0,
      hasLaundry: false,
      hasBalcony: input.hasBalcony,
      hasDiningArea: false,
      totalStories,
      storyIndex,
      linkedHouseGroupId: input.linkedHouseGroupId,
      stairVoid,
      hasMezzanine: false,
      entrySide,
      internalPartitionType,
      accessible: input.accessible,
      finishStandard: input.finishStandard ?? 'padrao',
      mepProfile,
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

  // =========================================================================
  // 1º PAVIMENTO SUPERIOR (storyIndex === 1)
  // =========================================================================
  const leftZoneW = round2(Math.max(2.15, Math.min(W * 0.34, stairX - 1.1)));
  const midY = round2(stairEndY + 0.12);
  const circRoomId = `${id}-rm-circ`;

  rooms.push({
    id: circRoomId,
    code: 'CIRC',
    name: 'Hall / Circulação Superior',
    category: 'circulacao',
    x: leftZoneW,
    y: 0,
    width: round2(stairX - leftZoneW),
    depth: midY,
    ceilingHeight: H,
    naturalLightingArea: 0.45,
    ventilationArea: 0.25,
    finishes: {
      floor: 'Porcelanato acetinado / Vinílico',
      wall: 'Massa corrida PVA',
      ceiling: 'Forro gesso liso',
      paint: 'Tinta acrílica fosca',
      baseboard: 'Poliestireno h=10cm',
    },
    notes: 'Circulação íntima com chegada da escada e acesso aos dormitórios.',
  });

  const bedInfos: Array<{
    id: string;
    code: string;
    name: string;
    x: number;
    y: number;
    width: number;
    depth: number;
    isMaster: boolean;
  }> = [];
  const bathInfos: Array<{
    id: string;
    code: string;
    name: string;
    x: number;
    y: number;
    width: number;
    depth: number;
    sinkOnWall: 'norte' | 'sul' | 'oeste' | 'leste';
    isSuite: boolean;
  }> = [];

  const bwcSocialD = round2(Math.min(1.85, Math.max(1.42, midY * 0.34)));
  const dorm2D = round2(midY - bwcSocialD);
  const bwcSocialId = `${id}-rm-bwc1`;
  const bwcSuiteId = `${id}-rm-bwc2`;

  // Back-Left: Dormitório 2 + BWC Social
  if (bedrooms === 1) {
    bathInfos.push({
      id: bwcSocialId,
      code: 'BWC',
      name: 'Banheiro Social',
      x: 0,
      y: 0,
      width: leftZoneW,
      depth: bwcSocialD,
      sinkOnWall: 'oeste',
      isSuite: false,
    });
    rooms.push({
      id: `${id}-rm-office`,
      code: 'ESCR',
      name: 'Estar Íntimo / Home Office',
      category: 'escritorio',
      x: 0,
      y: bwcSocialD,
      width: leftZoneW,
      depth: round2(midY - bwcSocialD),
      ceilingHeight: H,
      naturalLightingArea: 1.2,
      ventilationArea: 0.6,
      finishes: {
        floor: 'Piso vinílico',
        wall: 'Massa corrida PVA',
        ceiling: 'Forro gesso liso',
        paint: 'Tinta acrílica fosca',
        baseboard: 'Poliestireno h=7cm',
      },
      notes: '',
    });
  } else {
    bedInfos.push({
      id: `${id}-rm-dorm2`,
      code: 'DORM2',
      name: 'Dormitório 2',
      x: 0,
      y: 0,
      width: leftZoneW,
      depth: dorm2D,
      isMaster: false,
    });
    bathInfos.push({
      id: bwcSocialId,
      code: 'BWC',
      name: 'Banheiro Social',
      x: 0,
      y: dorm2D,
      width: leftZoneW,
      depth: bwcSocialD,
      sinkOnWall: 'oeste',
      isSuite: false,
    });
  }

  const wLeftZoneRightId = `${id}-w-sup-lz-r`;
  const wLeftDivId = `${id}-w-sup-lz-div`;
  walls.push(
    {
      id: wLeftZoneRightId,
      code: 'P-INT-SUP-COR',
      start: { x: leftZoneW, y: 0 },
      end: { x: leftZoneW, y: midY },
      thickness: intT,
      height: H,
      isExternal: false,
      material: intMatName,
      constructionSystem: sys,
      loadBearing: false,
    },
    {
      id: wLeftDivId,
      code: 'P-INT-SUP-DIV',
      start: { x: 0, y: bedrooms === 1 ? bwcSocialD : dorm2D },
      end: { x: leftZoneW, y: bedrooms === 1 ? bwcSocialD : dorm2D },
      thickness: intT,
      height: H,
      isExternal: false,
      material: intMatName,
      constructionSystem: sys,
      loadBearing: false,
    },
  );

  if (bedrooms === 1) {
    openings.push(
      {
        id: `${id}-op-p-bwc1`,
        code: 'P2',
        wallId: wLeftZoneRightId,
        type: 'porta',
        role: 'banheiro',
        openingKind: 'porta_abrir',
        subtype: 'Porta BWC 70x210cm',
        offsetAlongWall: round2(Math.max(0.15, bwcSocialD - 0.85)),
        width: 0.7,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.035,
        swingDirection: 'left_in', // +top->bottom: in = -X into BWC
        material: 'Madeira resistente à umidade',
      },
      {
        id: `${id}-op-p-office`,
        code: 'P3',
        wallId: wLeftZoneRightId,
        type: 'porta',
        role: 'quarto',
        openingKind: 'porta_abrir',
        subtype: 'Porta Escritório 80x210cm',
        offsetAlongWall: round2(bwcSocialD + 0.18),
        width: 0.8,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.035,
        swingDirection: 'left_in',
        material: 'Madeira semi-oca pintada',
      },
    );
  } else {
    openings.push(
      {
        id: `${id}-op-p-dorm2`,
        code: 'P3',
        wallId: wLeftZoneRightId,
        type: 'porta',
        role: 'quarto',
        openingKind: 'porta_abrir',
        subtype: 'Porta Dormitório 2 80x210cm',
        offsetAlongWall: round2(Math.max(0.15, dorm2D - 0.96)),
        width: 0.8,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.035,
        swingDirection: 'left_in', // -X into Dorm 2
        material: 'Madeira semi-oca pintada',
      },
      {
        id: `${id}-op-p-bwc1`,
        code: 'P2',
        wallId: wLeftZoneRightId,
        type: 'porta',
        role: 'banheiro',
        openingKind: 'porta_abrir',
        subtype: 'Porta BWC Social 70x210cm',
        offsetAlongWall: round2(dorm2D + 0.18),
        width: 0.7,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.035,
        swingDirection: 'left_in', // -X into BWC Social
        material: 'Madeira resistente à umidade',
      },
    );
  }

  // Front Strip (y: midY .. usableD)
  const wMidId = `${id}-w-sup-mid`;
  walls.push({
    id: wMidId,
    code: 'P-INT-SUP-MID',
    start: { x: 0, y: midY },
    end: { x: W, y: midY },
    thickness: intT,
    height: H,
    isExternal: false,
    material: intMatName,
    constructionSystem: sys,
    loadBearing: false,
  });

  const frontD = round2(usableD - midY);
  const suiteBwcW = hasSuite ? round2(Math.min(1.48, Math.max(1.25, W * 0.21))) : 0;
  const suiteBwcD = hasSuite ? round2(Math.min(1.65, Math.max(1.38, frontD * 0.55))) : 0;

  if (bedrooms <= 2) {
    // Suíte Master spans front full width
    bedInfos.push({
      id: `${id}-rm-suite`,
      code: hasSuite ? 'SUITE' : 'DORM1',
      name: hasSuite ? 'Suíte Master' : 'Dormitório 1',
      x: hasSuite ? suiteBwcW : 0,
      y: midY,
      width: round2(W - suiteBwcW),
      depth: frontD,
      isMaster: true,
    });
    openings.push({
      id: `${id}-op-p-suite`,
      code: 'P4',
      wallId: wMidId,
      type: 'porta',
      role: 'quarto',
      openingKind: 'porta_abrir',
      subtype: 'Porta Suíte Master 80x210cm',
      offsetAlongWall: round2(leftZoneW + 0.12),
      width: 0.8,
      height: 2.1,
      sillHeight: 0,
      thickness: 0.035,
      swingDirection: 'left_in', // Horizontal left->right: in = +Y into Suíte
      material: 'Madeira semi-oca pintada',
    });

    if (hasSuite) {
      bathInfos.push({
        id: bwcSuiteId,
        code: 'BWC-S',
        name: 'Banheiro Suíte',
        x: 0,
        y: midY,
        width: suiteBwcW,
        depth: suiteBwcD,
        sinkOnWall: 'oeste',
        isSuite: true,
      });
      const wSuiteR = `${id}-w-sup-bwcs-r`;
      const wSuiteB = `${id}-w-sup-bwcs-b`;
      walls.push(
        {
          id: wSuiteR,
          code: 'P-INT-BWCS-R',
          start: { x: suiteBwcW, y: midY },
          end: { x: suiteBwcW, y: round2(midY + suiteBwcD) },
          thickness: intT,
          height: H,
          isExternal: false,
          material: intMatName,
          constructionSystem: sys,
          loadBearing: false,
        },
        {
          id: wSuiteB,
          code: 'P-INT-BWCS-S',
          start: { x: 0, y: round2(midY + suiteBwcD) },
          end: { x: suiteBwcW, y: round2(midY + suiteBwcD) },
          thickness: intT,
          height: H,
          isExternal: false,
          material: intMatName,
          constructionSystem: sys,
          loadBearing: false,
        },
      );
      openings.push({
        id: `${id}-op-p-bwc-suite`,
        code: 'P5',
        wallId: wSuiteR,
        type: 'porta',
        role: 'banheiro',
        openingKind: 'porta_abrir',
        subtype: 'Porta BWC Suíte 70x210cm',
        offsetAlongWall: round2(Math.max(0.14, suiteBwcD - 0.82)),
        width: 0.7,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.035,
        swingDirection: 'left_in', // -X into BWC Suíte
        material: 'Madeira resistente à umidade',
      });
    }
  } else {
    // 3 Bedrooms: Dorm 3 Front-Left (0 .. splitX), Suíte Master Front-Right (splitX .. W)
    const splitX = round2(Math.min(W - 3.65, Math.max(leftZoneW + 0.92, W * 0.44)));
    bedInfos.push(
      {
        id: `${id}-rm-dorm3`,
        code: 'DORM3',
        name: 'Dormitório 3',
        x: 0,
        y: midY,
        width: splitX,
        depth: frontD,
        isMaster: false,
      },
      {
        id: `${id}-rm-suite`,
        code: hasSuite ? 'SUITE' : 'DORM1',
        name: hasSuite ? 'Suíte Master' : 'Dormitório 1',
        x: splitX,
        y: midY,
        width: round2(W - splitX - suiteBwcW),
        depth: frontD,
        isMaster: true,
      },
    );

    const wSplitFront = `${id}-w-sup-front-split`;
    walls.push({
      id: wSplitFront,
      code: 'P-INT-D3-S',
      start: { x: splitX, y: midY },
      end: { x: splitX, y: usableD },
      thickness: intT,
      height: H,
      isExternal: false,
      material: intMatName,
      constructionSystem: sys,
      loadBearing: false,
    });

    openings.push(
      {
        id: `${id}-op-p-dorm3`,
        code: 'P4',
        wallId: wMidId,
        type: 'porta',
        role: 'quarto',
        openingKind: 'porta_abrir',
        subtype: 'Porta Dormitório 3 80x210cm',
        offsetAlongWall: round2(leftZoneW + 0.1),
        width: 0.8,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.035,
        swingDirection: 'left_in', // +Y into Dorm 3
        material: 'Madeira semi-oca pintada',
      },
      {
        id: `${id}-op-p-suite`,
        code: 'P5',
        wallId: wMidId,
        type: 'porta',
        role: 'quarto',
        openingKind: 'porta_abrir',
        subtype: 'Porta Suíte Master 80x210cm',
        offsetAlongWall: round2(splitX + 0.12),
        width: 0.8,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.035,
        swingDirection: 'left_in', // +Y into Suíte Master
        material: 'Madeira semi-oca pintada',
      },
    );

    if (hasSuite) {
      const sbX = round2(W - suiteBwcW);
      bathInfos.push({
        id: bwcSuiteId,
        code: 'BWC-S',
        name: 'Banheiro Suíte',
        x: sbX,
        y: midY,
        width: suiteBwcW,
        depth: suiteBwcD,
        sinkOnWall: 'leste',
        isSuite: true,
      });
      const wSuiteL = `${id}-w-sup-bwcs-l`;
      const wSuiteB = `${id}-w-sup-bwcs-b`;
      walls.push(
        {
          id: wSuiteL,
          code: 'P-INT-BWCS-L',
          start: { x: sbX, y: midY },
          end: { x: sbX, y: round2(midY + suiteBwcD) },
          thickness: intT,
          height: H,
          isExternal: false,
          material: intMatName,
          constructionSystem: sys,
          loadBearing: false,
        },
        {
          id: wSuiteB,
          code: 'P-INT-BWCS-S',
          start: { x: sbX, y: round2(midY + suiteBwcD) },
          end: { x: W, y: round2(midY + suiteBwcD) },
          thickness: intT,
          height: H,
          isExternal: false,
          material: intMatName,
          constructionSystem: sys,
          loadBearing: false,
        },
      );
      openings.push({
        id: `${id}-op-p-bwc-suite`,
        code: 'P6',
        wallId: wSuiteL,
        type: 'porta',
        role: 'banheiro',
        openingKind: 'porta_abrir',
        subtype: 'Porta BWC Suíte 70x210cm',
        offsetAlongWall: round2(Math.max(0.14, suiteBwcD - 0.82)),
        width: 0.7,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.035,
        swingDirection: 'right_out', // +X into BWC Suíte
        material: 'Madeira resistente à umidade',
      });
    }
  }

  for (const b of bathInfos) {
    rooms.push({
      id: b.id,
      code: b.code,
      name: b.name,
      category: 'banheiro',
      x: b.x,
      y: b.y,
      width: b.width,
      depth: b.depth,
      ceilingHeight: Math.min(H, 2.55),
      naturalLightingArea: 0.48,
      ventilationArea: 0.24,
      finishes: {
        floor: 'Porcelanato acetinado antiderrapante',
        wall: 'Revestimento cerâmico até o teto',
        ceiling: 'Forro gesso RU',
        paint: 'Tinta acrílica antimofo',
        baseboard: 'Integrado ao revestimento',
      },
      notes: '',
    });
  }

  for (const d of bedInfos) {
    rooms.push({
      id: d.id,
      code: d.code,
      name: d.name,
      category: 'quarto',
      x: d.x,
      y: d.y,
      width: d.width,
      depth: d.depth,
      ceilingHeight: H,
      naturalLightingArea: 1.8,
      ventilationArea: 0.9,
      finishes: {
        floor: 'Piso vinílico / Porcelanato amadeirado',
        wall: 'Massa corrida PVA',
        ceiling: 'Forro gesso liso',
        paint: 'Tinta acrílica fosca',
        baseboard: 'Poliestireno h=7cm',
      },
      notes: '',
    });
  }

  addBalconyAndGuardrail({
    id,
    W,
    D,
    H,
    usableD,
    balconyDepth,
    sys,
    rooms,
    walls,
    label: 'Sacada / Varanda Superior',
  });

  // Upper Floor External Windows
  bathInfos.forEach((b, idx) => {
    const isEast = b.x + b.width >= W - 0.05;
    openings.push({
      id: `${id}-op-win-bwc-${idx}`,
      code: `J-BWC-${idx + 1}`,
      wallId: isEast ? wRightId : wLeftId,
      type: 'janela',
      openingKind: 'vitro_basculante',
      subtype: 'Vitrô Basculante BWC 60x60cm',
      offsetAlongWall: isEast
        ? round2(b.y + 0.35)
        : round2(Math.max(0.2, usableD - (b.y + 0.95))),
      width: 0.6,
      height: 0.6,
      sillHeight: 1.5,
      thickness: 0.04,
      swingDirection: 'none',
      material: 'Alumínio + vidro canelado',
    });
  });

  bedInfos.forEach((bed, idx) => {
    const winW = 1.2;
    if (bed.y === 0) {
      openings.push({
        id: `${id}-op-win-dorm-${idx}`,
        code: `J-D${idx + 1}`,
        wallId: wTopId,
        type: 'janela',
        openingKind: 'janela_correr',
        subtype: 'Janela Dormitório 120x120cm',
        offsetAlongWall: round2(bed.x + Math.max(0.25, (bed.width - winW) / 2)),
        width: winW,
        height: 1.2,
        sillHeight: 0.9,
        thickness: 0.04,
        swingDirection: 'sliding',
        material: 'Alumínio + vidro temperado',
      });
    } else {
      // Front-facing bedrooms -> window on wBottomId (W, usableD) -> (0, usableD)
      const wallOff = round2(W - (bed.x + bed.width) + Math.max(0.25, (bed.width - winW) / 2));
      openings.push({
        id: `${id}-op-win-dorm-${idx}`,
        code: `J-D${idx + 1}`,
        wallId: wBottomId,
        type: 'janela',
        openingKind: input.hasBalcony && bed.isMaster ? 'porta_correr' : 'janela_correr',
        subtype: input.hasBalcony && bed.isMaster ? 'Porta-janela Sacada' : 'Janela Dormitório 120x120cm',
        offsetAlongWall: Math.max(0.2, Math.min(W - winW - 0.2, wallOff)),
        width: winW,
        height: input.hasBalcony && bed.isMaster ? 2.1 : 1.2,
        sillHeight: input.hasBalcony && bed.isMaster ? 0 : 0.9,
        thickness: 0.04,
        swingDirection: 'sliding',
        material: 'Alumínio + vidro temperado',
      });
    }
  });

  const reservedZones: Box2[] = [padBox(stairVoid, 0.18)];
  pushDoorClearanceZones(walls, openings, reservedZones);

  const placer = createFurniturePlacer(furniture, reservedZones);

  // If 3 stories, Floor 1 also carries the flight up to Floor 2 above the same stairwell shaft!
  if (totalStories >= 3) {
    furniture.push({
      id: `${id}-fur-escada-2`,
      name: `Escada 2º Lance (${steps} degraus • 2h+p=${stairSpec.blondelSumM.toFixed(2)}m)`,
      category: 'escada',
      roomId: circRoomId,
      x: stairX,
      y: stairY,
      width: stairW,
      depth: stairD,
      height: floorToFloorHeight,
      elevationM: 0,
      rotationDeg: 0,
      stairSpec,
    });
  }

  electricalPoints.push(
    {
      id: `${id}-el-qdc-sup`,
      code: 'QDC-02',
      category: 'quadro_luz',
      label: 'Subquadro Distribuição 1º Pavimento',
      roomId: circRoomId,
      x: round2(leftZoneW + 0.14),
      y: round2(Math.max(0.4, midY - 0.5)),
      z: 1.5,
      referenceWall: 'Parede Circulação',
      referenceDistance: 0.4,
      powerVA: 0,
      voltage: 220,
      powerFactor: 1.0,
      circuitId: 'GERAL',
      conductorSectionMm2: 6.0,
      conduitDiameterMm: 25,
      protection: 'Disjuntor Geral + IDR 30mA',
      notes: 'Subquadro pavimento íntimo superior',
    },
    {
      id: `${id}-el-il-circ`,
      code: 'IL-CIRC',
      category: 'iluminacao_teto',
      label: 'Ponto Luz Hall / Circulação Superior',
      roomId: circRoomId,
      x: round2(leftZoneW + (stairX - leftZoneW) / 2),
      y: round2(midY / 2),
      z: H,
      referenceWall: 'Laje/Forro',
      referenceDistance: 0.5,
      powerVA: 80,
      voltage: 127,
      powerFactor: 0.92,
      circuitId: 'C1-ILUM',
      conductorSectionMm2: 1.5,
      conduitDiameterMm: 20,
      protection: 'Disjuntor 10A',
      notes: '',
    },
  );

  bathInfos.forEach((b, idx) => {
    addBathFixturesAndMep({
      id,
      suffix: idx === 0 ? 'B1' : 'B2',
      roomId: b.id,
      x: b.x,
      y: b.y,
      width: b.width,
      depth: b.depth,
      H,
      hasShower: true,
      includeHotWater,
      tqId: `${id}-esg-tq-${idx + 1}`,
      csId: `${id}-esg-cs-${idx + 1}`,
      sinkOnWall: b.sinkOnWall,
      furniture,
      electricalPoints,
      waterPoints,
      drainagePoints,
      placedBoxes: placer.placedBoxes,
      chuvCircuitId,
      riserX: b.x,
      riserY: b.y,
    });
  });

  bedInfos.forEach((bed, idx) => {
    populateBedroomFurnitureAndMep({
      id,
      suffix: `D${idx + 1}`,
      roomId: bed.id,
      x: bed.x,
      y: bed.y,
      width: bed.width,
      depth: bed.depth,
      H,
      isMaster: bed.isMaster,
      includeAcCircuit,
      tryCommit: placer.tryCommit,
      electricalPoints,
      acCircuitId,
    });
  });

  return {
    id,
    code: input.code,
    name: input.name,
    basePreset: input.basePreset ?? `Sobrado ${totalStories} Pav. — 1º Pavimento`,
    buildingKind: 'casa_sobrado',
    targetArea: round2(W * D),
    width: W,
    depth: D,
    ceilingHeight: H,
    bedrooms,
    suites: hasSuite ? 1 : 0,
    bathrooms: bathInfos.length,
    kitchens: 0,
    hasLaundry: false,
    hasBalcony: input.hasBalcony,
    hasDiningArea: false,
    totalStories,
    storyIndex: 1,
    linkedHouseGroupId: input.linkedHouseGroupId,
    stairVoid,
    hasMezzanine: false,
    entrySide,
    internalPartitionType,
    accessible: input.accessible,
    finishStandard: input.finishStandard ?? 'padrao',
    mepProfile,
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

export function generateMultiStoryHouseBundle(
  input: Omit<ParametricTypologyInput, 'buildingKind'> & {
    totalStories: number;
    linkedHouseGroupId?: string;
    floorToFloorHeight?: number;
  },
): UnitType[] {
  const totalStories = Math.max(2, Math.min(3, Math.round(input.totalStories || 2)));
  const linkedHouseGroupId = input.linkedHouseGroupId ?? nextId('house');
  const floorToFloorHeight = input.floorToFloorHeight ?? round2(input.ceilingHeight + 0.15);
  const baseCode = (input.code || 'SOB-A').trim();
  const baseName = (input.name || 'Sobrado Residencial').trim();

  const stories: UnitType[] = [];
  for (let s = 0; s < totalStories; s++) {
    const storySuffix = s === 0 ? 'TER' : s === 1 ? 'SUP' : 'ATICO';
    const storyLabel =
      s === 0 ? 'Pavimento Térreo' : s === 1 ? '1º Pavimento (Superior)' : '2º Pavimento (Ático)';
    stories.push(
      generateSobradoFloorLayout({
        ...input,
        id: undefined,
        code: `${baseCode}-${storySuffix}`,
        name: `${baseName} — ${storyLabel}`,
        buildingKind: 'casa_sobrado',
        storyIndex: s,
        totalStories,
        linkedHouseGroupId,
        floorToFloorHeight,
      }),
    );
  }
  return stories;
}
