import {
  analyzeSiteGeometry,
  getBoundingBox,
  getOpeningWorldPosition,
  getRoomArea,
  round2,
} from './geometry';
import {
  calculateDrainageSizing,
  calculateElectricalSizing,
  calculateHydraulicSizing,
} from './engineering';
import { calculateQuantities } from './quantitiesAndBudget';
import type { Floor, Opening, OpeningType, Project, UnitInstance, UnitType, Wall } from '../types/project';

export type CadTheme = 'autocad_dark' | 'plot_white';

export interface CadPalette {
  bg: string;
  paperBorder: string;
  gridDot: string;
  siteBound: string;
  setback: string;
  axisLine: string;
  axisBubbleFill: string;
  axisBubbleStroke: string;
  axisText: string;
  wallExtStroke: string;
  wallExtFill: string;
  wallIntStroke: string;
  wallIntFill: string;
  doorLeaf: string;
  doorSwing: string;
  windowGlass: string;
  windowFrame: string;
  furniture: string;
  dimension: string;
  roomText: string;
  unitTag: string;
  electric: string;
  coldWater: string;
  hotWater: string;
  sanitary: string;
  rainwater: string;
  structure: string;
  fire: string;
  slabFill: string;
}

export function getCadPalette(theme: CadTheme): CadPalette {
  if (theme === 'autocad_dark') {
    return {
      bg: '#0B0E14',
      paperBorder: '#334155',
      gridDot: '#1E293B',
      siteBound: '#00FF88',
      setback: '#F59E0B',
      axisLine: '#EF4444',
      axisBubbleFill: '#0F172A',
      axisBubbleStroke: '#EF4444',
      axisText: '#F87171',
      wallExtStroke: '#FFFFFF',
      wallExtFill: '#334155',
      wallIntStroke: '#38BDF8',
      wallIntFill: '#1E293B',
      doorLeaf: '#FACC15',
      doorSwing: '#A16207',
      windowGlass: '#22D3EE',
      windowFrame: '#06B6D4',
      furniture: '#64748B',
      dimension: '#A3E635',
      roomText: '#E2E8F0',
      unitTag: '#FDE047',
      electric: '#F59E0B',
      coldWater: '#3B82F6',
      hotWater: '#F43F5E',
      sanitary: '#10B981',
      rainwater: '#06B6D4',
      structure: '#FB7185',
      fire: '#EF4444',
      slabFill: '#1E293B',
    };
  }
  return {
    bg: '#FFFFFF',
    paperBorder: '#0F172A',
    gridDot: '#E2E8F0',
    siteBound: '#334155',
    setback: '#D97706',
    axisLine: '#DC2626',
    axisBubbleFill: '#FFFFFF',
    axisBubbleStroke: '#DC2626',
    axisText: '#B91C1C',
    wallExtStroke: '#0F172A',
    wallExtFill: '#94A3B8',
    wallIntStroke: '#1E293B',
    wallIntFill: '#CBD5E1',
    doorLeaf: '#B45309',
    doorSwing: '#94A3B8',
    windowGlass: '#0284C7',
    windowFrame: '#0369A1',
    furniture: '#64748B',
    dimension: '#334155',
    roomText: '#0F172A',
    unitTag: '#1D4ED8',
    electric: '#D97706',
    coldWater: '#2563EB',
    hotWater: '#DC2626',
    sanitary: '#059669',
    rainwater: '#0891B2',
    structure: '#B91C1C',
    fire: '#DC2626',
    slabFill: '#CBD5E1',
  };
}

export interface WorldPoint {
  x: number;
  y: number;
}

export function unitLocalToWorld(
  inst: UnitInstance,
  ut: UnitType,
  lx: number,
  ly: number,
): WorldPoint {
  const mx = inst.mirrored ? ut.width - lx : lx;
  const rad = (inst.rotationDeg * Math.PI) / 180;
  const rx = mx * Math.cos(rad) - ly * Math.sin(rad);
  const ry = mx * Math.sin(rad) + ly * Math.cos(rad);
  return { x: inst.x + rx, y: inst.y + ry };
}

/**
 * Splits a wall segment into sub-segments excluding doors/windows so walls have clean architectural gaps.
 */
export function splitWallByOpenings(
  wall: Wall,
  openings: Opening[],
): Array<{ t0: number; t1: number }> {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.05) return [];

  const wallOps = openings
    .filter((op) => op.wallId === wall.id)
    .map((op) => ({
      a: Math.max(0, op.offsetAlongWall / len),
      b: Math.min(1, (op.offsetAlongWall + op.width) / len),
    }))
    .sort((u, v) => u.a - v.a);

  const spans: Array<{ t0: number; t1: number }> = [];
  let cursor = 0;
  for (const op of wallOps) {
    if (op.a > cursor + 0.005) {
      spans.push({ t0: cursor, t1: op.a });
    }
    cursor = Math.max(cursor, op.b);
  }
  if (cursor < 1 - 0.005) {
    spans.push({ t0: cursor, t1: 1 });
  }
  return spans;
}

/**
 * Returns 4 world corner points for a double-line wall segment of thickness `t`.
 */
export function getWallQuadWorld(
  p0: WorldPoint,
  p1: WorldPoint,
  thickness: number,
): [WorldPoint, WorldPoint, WorldPoint, WorldPoint] {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (thickness / 2);
  const ny = (dx / len) * (thickness / 2);
  return [
    { x: p0.x + nx, y: p0.y + ny },
    { x: p1.x + nx, y: p1.y + ny },
    { x: p1.x - nx, y: p1.y - ny },
    { x: p0.x - nx, y: p0.y - ny },
  ];
}

export interface BuildingFootprintStats {
  hasUnits: boolean;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  depth: number;
  xAxes: number[];
  yAxes: number[];
}

export function computeFloorFootprint(project: Project, floor: Floor | undefined): BuildingFootprintStats {
  const siteBox = getBoundingBox(project.site.vertices);
  if (!floor || floor.units.length === 0) {
    return {
      hasUnits: false,
      minX: siteBox.minX,
      minY: siteBox.minY,
      maxX: siteBox.maxX,
      maxY: siteBox.maxY,
      width: siteBox.width,
      depth: siteBox.depth,
      xAxes: [],
      yAxes: [],
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const xSet = new Set<number>();
  const ySet = new Set<number>();

  for (const inst of floor.units) {
    const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
    if (!ut) continue;
    const corners = [
      unitLocalToWorld(inst, ut, 0, 0),
      unitLocalToWorld(inst, ut, ut.width, 0),
      unitLocalToWorld(inst, ut, ut.width, ut.depth),
      unitLocalToWorld(inst, ut, 0, ut.depth),
    ];
    for (const c of corners) {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x);
      maxY = Math.max(maxY, c.y);
      xSet.add(round2(c.x));
      ySet.add(round2(c.y));
    }
  }

  if (!Number.isFinite(minX)) {
    return {
      hasUnits: false,
      minX: siteBox.minX,
      minY: siteBox.minY,
      maxX: siteBox.maxX,
      maxY: siteBox.maxY,
      width: siteBox.width,
      depth: siteBox.depth,
      xAxes: [],
      yAxes: [],
    };
  }

  // Deduplicate axes within 0.25m tolerance
  const dedupe = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const out: number[] = [];
    for (const v of sorted) {
      if (out.length === 0 || Math.abs(v - out[out.length - 1]) > 0.35) {
        out.push(v);
      }
    }
    return out;
  };

  return {
    hasUnits: true,
    minX,
    minY,
    maxX,
    maxY,
    width: round2(maxX - minX),
    depth: round2(maxY - minY),
    xAxes: dedupe([...xSet]),
    yAxes: dedupe([...ySet]),
  };
}

export interface JoineryScheduleRow {
  code: string;
  type: OpeningType;
  width: number;
  height: number;
  sillHeight: number;
  material: string;
  countPerFloor: number;
  totalProjectCount: number;
}

export function buildJoinerySchedule(project: Project): JoineryScheduleRow[] {
  const unitCounts = new Map<string, number>();
  for (const fl of project.floors) {
    for (const inst of fl.units) {
      unitCounts.set(inst.unitTypeId, (unitCounts.get(inst.unitTypeId) ?? 0) + 1);
    }
  }
  const firstFloor = project.floors[0];
  const firstFloorCounts = new Map<string, number>();
  if (firstFloor) {
    for (const inst of firstFloor.units) {
      firstFloorCounts.set(inst.unitTypeId, (firstFloorCounts.get(inst.unitTypeId) ?? 0) + 1);
    }
  }

  const map = new Map<string, JoineryScheduleRow>();
  for (const ut of project.unitTypes) {
    const projQty = unitCounts.get(ut.id) ?? 0;
    const flQty = firstFloorCounts.get(ut.id) ?? 0;
    for (const op of ut.openings) {
      const key = `${op.code}|${op.type}|${op.width}|${op.height}|${op.sillHeight}`;
      const existing = map.get(key);
      if (existing) {
        existing.totalProjectCount += projQty;
        existing.countPerFloor += flQty;
      } else {
        map.set(key, {
          code: op.code,
          type: op.type,
          width: op.width,
          height: op.height,
          sillHeight: op.sillHeight,
          material: op.material,
          countPerFloor: flQty,
          totalProjectCount: projQty,
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export interface ElevationFeature {
  x: number;
  y: number; // height from ground 0
  width: number;
  height: number;
  type: OpeningType;
  code: string;
}

export interface ParametricElevationData {
  totalWidth: number;
  totalHeight: number;
  parapetHeight: number;
  floors: Array<{
    name: string;
    baseY: number;
    ceilingY: number;
    slabTopY: number;
    features: ElevationFeature[];
  }>;
}

/**
 * Generates Frontal or Lateral elevation geometry from parametric floors and exterior openings.
 */
export function buildElevationData(
  project: Project,
  view: 'frontal' | 'lateral',
): ParametricElevationData {
  const firstFloor = project.floors[0];
  const fp = computeFloorFootprint(project, firstFloor);
  const totalWidth = Math.max(3, view === 'frontal' ? fp.width : fp.depth);
  const parapetHeight = 0.65;

  let cursorY = 0.15; // plinth
  const floorsOut: ParametricElevationData['floors'] = [];

  for (const fl of project.floors) {
    const h = fl.floorToFloorHeight || 2.95;
    const slab = fl.slabThickness || 0.15;
    const baseY = cursorY;
    const ceilingY = baseY + (h - slab);
    const slabTopY = baseY + h;

    const features: ElevationFeature[] = [];
    const targetPlaneCoord = view === 'frontal' ? fp.minY : fp.maxX;
    const fallbackPlaneCoord = view === 'frontal' ? fp.maxY : fp.minX;

    const collectPlaneFeatures = (planeCoord: number): ElevationFeature[] => {
      const out: ElevationFeature[] = [];
      for (const inst of fl.units) {
        const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
        if (!ut) continue;
        for (const op of ut.openings) {
          const wall = ut.walls.find((w) => w.id === op.wallId);
          if (!wall || !wall.isExternal) continue;
          const { center } = getOpeningWorldPosition(wall, op);
          const worldPos = unitLocalToWorld(inst, ut, center.x, center.y);

          const dxWall = Math.abs(wall.end.x - wall.start.x);
          const dyWall = Math.abs(wall.end.y - wall.start.y);
          const isHorizontalWall = dxWall >= dyWall;
          const rotated90 = Math.abs(inst.rotationDeg % 180) === 90;
          const worldHoriz = rotated90 ? !isHorizontalWall : isHorizontalWall;

          if (view === 'frontal' && worldHoriz && Math.abs(worldPos.y - planeCoord) < 0.35) {
            out.push({
              x: round2(worldPos.x - fp.minX - op.width / 2),
              y: baseY + (op.sillHeight || 0),
              width: op.width,
              height: op.height,
              type: op.type,
              code: op.code,
            });
          } else if (view === 'lateral' && !worldHoriz && Math.abs(worldPos.x - planeCoord) < 0.35) {
            out.push({
              x: round2(worldPos.y - fp.minY - op.width / 2),
              y: baseY + (op.sillHeight || 0),
              width: op.width,
              height: op.height,
              type: op.type,
              code: op.code,
            });
          }
        }
      }
      return out;
    };

    const primary = collectPlaneFeatures(targetPlaneCoord);
    features.push(...(primary.length > 0 ? primary : collectPlaneFeatures(fallbackPlaneCoord)));

    floorsOut.push({
      name: fl.name,
      baseY,
      ceilingY,
      slabTopY,
      features,
    });
    cursorY = slabTopY;
  }

  return {
    totalWidth,
    totalHeight: round2(cursorY + parapetHeight),
    parapetHeight,
    floors: floorsOut,
  };
}

export interface SpecialSystemsSummary {
  totalUnits: number;
  rj45Points: number;
  tvPoints: number;
  wifiApPoints: number;
  cftvUnitPoints: number;
  cftvCommonCameras: number;
  interfonePoints: number;
  backboneItems: Array<{
    code: string;
    system: string;
    equipment: string;
    spec: string;
    qty: string;
  }>;
}

export function buildSpecialSystemsSummary(project: Project): SpecialSystemsSummary {
  const unitCounts = new Map<string, number>();
  let totalUnits = 0;
  for (const fl of project.floors) {
    for (const inst of fl.units) {
      totalUnits += 1;
      unitCounts.set(inst.unitTypeId, (unitCounts.get(inst.unitTypeId) ?? 0) + 1);
    }
  }

  let rj45Points = 0;
  let tvPoints = 0;
  let wifiApPoints = 0;
  let cftvUnitPoints = 0;
  let interfonePoints = 0;

  for (const ut of project.unitTypes) {
    const q = unitCounts.get(ut.id) ?? 0;
    for (const ep of ut.electricalPoints) {
      if (ep.category === 'dados') rj45Points += q;
      else if (ep.category === 'tv' || ep.category === 'antena_tv') tvPoints += q;
      else if (ep.category === 'wifi_ap') wifiApPoints += q;
      else if (ep.category === 'cftv') cftvUnitPoints += q;
      else if (ep.category === 'interfone') interfonePoints += q;
    }
  }

  const floorsCount = Math.max(1, project.floors.length);
  // Common areas: facade entry + 2 corridor cameras per floor + hall/parking
  const cftvCommonCameras = totalUnits > 0 ? 2 + floorsCount * 2 : 0;

  return {
    totalUnits,
    rj45Points,
    tvPoints,
    wifiApPoints,
    cftvUnitPoints,
    cftvCommonCameras,
    interfonePoints,
    backboneItems: [
      {
        code: 'TI-01',
        system: 'Internet / Dados',
        equipment: 'Rack Central 19" 12U + Patch Panel 24p + Switch PoE',
        spec: 'UTP Cat6 · Eletroduto Ø25mm estrela · Nobreak 1200VA',
        qty: totalUnits > 0 ? '1 cj' : '0 cj',
      },
      {
        code: 'WI-01',
        system: 'Rede Sem Fio',
        equipment: 'Access Point Wi-Fi 6 Dual-Band Teto/Parede PoE',
        spec: 'IEEE 802.11ax · Alimentação PoE 802.3af (Z=2,60m)',
        qty: `${wifiApPoints} un`,
      },
      {
        code: 'RJ-01',
        system: 'Dados Cabeados',
        equipment: 'Tomada RJ45 Cat6 (Mesa / Bancada Trabalho)',
        spec: 'Cabo UTP Cat6 dedicado por unidade (Z=1,10m)',
        qty: `${rj45Points} pts`,
      },
      {
        code: 'TV-01',
        system: 'Antena Coletiva',
        equipment: 'Mastro UHF/HDTV + Amplificador + Divisor Coaxial RG6',
        spec: 'Cabo coaxial RG6 75Ω blindado + tomadas TV (Z=1,20m)',
        qty: `1 sist. / ${tvPoints} pts`,
      },
      {
        code: 'CF-01',
        system: 'Segurança CFTV',
        equipment: 'NVR 16 Canais PoE + HD 4TB + Câmeras IP Full HD',
        spec: 'Acessos, fachadas, corredores comuns e hall de entrada',
        qty: `${cftvUnitPoints + cftvCommonCameras} câm.`,
      },
      {
        code: 'IN-01',
        system: 'Interfonia',
        equipment: 'Central de Portaria Digital + Monofones nas Unidades',
        spec: 'Porteiro eletrônico externo c/ fechadura eletromagnética',
        qty: `${interfonePoints} pts`,
      },
    ],
  };
}

/**
 * Generates quick summary rows for A12, E04, E05, E06, H06 sheets.
 */
export function buildSheetTabulations(project: Project) {
  const quantities = calculateQuantities(project);
  const elec = calculateElectricalSizing(project);
  const hyd = calculateHydraulicSizing(project);
  const drain = calculateDrainageSizing(project);
  const siteCheck = analyzeSiteGeometry(project.site);
  const joinery = buildJoinerySchedule(project);
  const specials = buildSpecialSystemsSummary(project);

  const areaRows = project.unitTypes.map((ut) => ({
    code: ut.code,
    name: ut.name,
    grossArea: round2(ut.width * ut.depth),
    usefulArea: round2(ut.rooms.reduce((s, r) => s + getRoomArea(r), 0)),
    roomsSummary: ut.rooms.map((r) => `${r.code} (${getRoomArea(r)}m²)`).join(', '),
  }));

  return {
    quantities,
    elec,
    hyd,
    drain,
    siteCheck,
    joinery,
    specials,
    areaRows,
  };
}

