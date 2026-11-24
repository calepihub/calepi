import { round2 } from './geometry';
import type { ElectricalPoint, Point2D, UnitType, WaterPoint } from '../types/project';

export interface MepRouteSegment {
  id: string;
  group: string;
  from: Point2D;
  to: Point2D;
  /** Orthogonal elbow waypoint (shortest wall/ceiling path) */
  elbow?: Point2D;
  lengthM: number;
  kind: 'electrical' | 'special' | 'cold_water' | 'hot_water' | 'drainage';
}

export interface ElectricalRoutingSummary {
  qdcPoint: { x: number; y: number; z: number; code: string; existsInModel: boolean };
  segments: MepRouteSegment[];
  lengthByCircuit: Record<string, number>;
  totalConduitM: number;
  totalWireM: number;
}

export interface HydraulicRoutingSummary {
  riser: Point2D;
  segments: MepRouteSegment[];
  totalColdPipeM: number;
  totalHotPipeM: number;
  totalPipeM: number;
}

export interface DrainageRoutingSummary {
  segments: MepRouteSegment[];
  totalDrainPipeM: number;
}

const SPECIAL_CATS = new Set([
  'dados',
  'tv',
  'antena_tv',
  'wifi_ap',
  'cftv',
  'rack_ti',
  'interfone',
]);

export function isSpecialElectricalCategory(cat: string): boolean {
  return SPECIAL_CATS.has(cat);
}

/**
 * Returns the explicit QDC (Quadro de Distribuição) point from the typology,
 * or computes the safest dry-wall fallback near the wet/living partition.
 */
export function getQdcPosition(ut: UnitType): {
  x: number;
  y: number;
  z: number;
  code: string;
  existsInModel: boolean;
} {
  const qdc = ut.electricalPoints.find(
    (ep) => ep.category === 'quadro_luz' || ep.code.toUpperCase().startsWith('QDC'),
  );
  if (qdc) {
    return { x: qdc.x, y: qdc.y, z: qdc.z, code: qdc.code, existsInModel: true };
  }
  const bath = ut.rooms.find((r) => r.category === 'banheiro');
  const fallbackX = bath ? round2(Math.min(0.34, Math.max(0.2, bath.x + 0.3))) : 0.34;
  const fallbackY = bath ? round2(bath.y + bath.depth + 0.08) : round2(Math.max(0.3, ut.depth - 0.25));
  return { x: fallbackX, y: fallbackY, z: 1.5, code: 'QDC-01', existsInModel: false };
}

/**
 * Finds the shared wet-wall riser ("Prumada AF") at the junction between BWC and Cozinha
 * for minimum pipe run across wet fixtures.
 */
export function getWetRiserPosition(ut: UnitType): Point2D {
  const bath = ut.rooms.find((r) => r.category === 'banheiro');
  if (bath) {
    return { x: round2(bath.x + bath.width), y: round2(bath.y + 0.14) };
  }
  if (ut.waterPoints.length > 0) {
    const first = ut.waterPoints[0];
    return { x: first.x, y: first.y };
  }
  return { x: round2(ut.width * 0.35), y: 0.14 };
}

function manhattanDistance(a: Point2D, b: Point2D): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function pickOrthogonalElbow(from: Point2D, to: Point2D): Point2D | undefined {
  if (Math.abs(from.x - to.x) < 0.05 || Math.abs(from.y - to.y) < 0.05) {
    return undefined;
  }
  // Prefer routing along the closer horizontal wet/wall axis first
  return Math.abs(from.y) <= Math.abs(to.y) ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
}

/**
 * Computes shortest-path electrical routing per circuit starting from QDC-01
 * (Nearest-Neighbor Chaining along orthogonal paths + vertical drops).
 */
export function computeElectricalRouting(ut: UnitType): ElectricalRoutingSummary {
  const qdc = getQdcPosition(ut);
  const byCircuit = new Map<string, ElectricalPoint[]>();

  for (const ep of ut.electricalPoints) {
    if (ep.category === 'quadro_luz' || ep.code.toUpperCase().startsWith('QDC')) continue;
    const key = ep.circuitId || 'C2-TUG';
    if (!byCircuit.has(key)) byCircuit.set(key, []);
    byCircuit.get(key)!.push(ep);
  }

  const segments: MepRouteSegment[] = [];
  const lengthByCircuit: Record<string, number> = {};
  let totalConduitM = 0;
  let totalWireM = 0;

  for (const [circuitId, rawPts] of byCircuit.entries()) {
    const remaining = [...rawPts];
    let curr: { x: number; y: number; z: number } = { x: qdc.x, y: qdc.y, z: qdc.z };
    let circuitRunM = 0;
    const isSpecial = rawPts.every((p) => isSpecialElectricalCategory(p.category));
    const is220 = rawPts.some((p) => p.voltage === 220);

    // Nearest-neighbor shortest path chaining from QDC -> P1 -> P2 -> ...
    let stepIdx = 0;
    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const pt = remaining[i];
        const horiz = manhattanDistance(curr, pt);
        const vert = Math.abs((curr.z || 1.5) - (pt.z || 1.1));
        const d = horiz + vert * 0.5;
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      const nextPt = remaining.splice(bestIdx, 1)[0];
      const horizLen = manhattanDistance(curr, nextPt);
      // Ceiling/wall vertical transition between curr.z and nextPt.z
      const vertDrop =
        Math.abs((curr.z ?? 1.5) - (nextPt.z ?? 1.1)) +
        (horizLen > 0.8 ? 0.35 : 0);
      const segLen = round2(Math.max(0.25, horizLen + vertDrop));
      circuitRunM = round2(circuitRunM + segLen);

      segments.push({
        id: `${circuitId}-${stepIdx++}`,
        group: circuitId,
        from: { x: curr.x, y: curr.y },
        to: { x: nextPt.x, y: nextPt.y },
        elbow: pickOrthogonalElbow(curr, nextPt),
        lengthM: segLen,
        kind: isSpecial ? 'special' : 'electrical',
      });

      curr = { x: nextPt.x, y: nextPt.y, z: nextPt.z };
    }

    lengthByCircuit[circuitId] = circuitRunM;
    totalConduitM = round2(totalConduitM + circuitRunM);
    // Wires per conduit: 2-phase+ground = 3 (or 4 for switch return/220V+N+T, 1.0x UTP for special)
    const wireMultiplier = isSpecial ? 1.05 : is220 ? 3.2 : 3.0;
    totalWireM = round2(totalWireM + circuitRunM * wireMultiplier);
  }

  return {
    qdcPoint: qdc,
    segments,
    lengthByCircuit,
    totalConduitM,
    totalWireM,
  };
}

function buildWaterMst(
  riser: Point2D,
  pts: WaterPoint[],
  kind: 'cold_water' | 'hot_water',
): { segments: MepRouteSegment[]; totalLenM: number } {
  if (pts.length === 0) return { segments: [], totalLenM: 0 };
  const visited: Array<{ x: number; y: number; z: number; id: string }> = [
    { x: riser.x, y: riser.y, z: 2.4, id: 'RISER' },
  ];
  const unvisited = [...pts];
  const segments: MepRouteSegment[] = [];
  let totalLenM = 0;
  let idx = 0;

  while (unvisited.length > 0) {
    let bestUIdx = 0;
    let bestV = visited[0];
    let bestCost = Infinity;

    for (let u = 0; u < unvisited.length; u++) {
      const cand = unvisited[u];
      for (const v of visited) {
        const horiz = manhattanDistance(v, cand);
        if (horiz < bestCost) {
          bestCost = horiz;
          bestUIdx = u;
          bestV = v;
        }
      }
    }

    const nextWp = unvisited.splice(bestUIdx, 1)[0];
    const horiz = manhattanDistance(bestV, nextWp);
    const vert = bestV.id === 'RISER' ? Math.max(0.4, Math.abs(2.4 - nextWp.z)) : Math.abs(bestV.z - nextWp.z);
    const segLen = round2(Math.max(0.2, horiz + vert));
    totalLenM = round2(totalLenM + segLen);

    segments.push({
      id: `${kind}-${idx++}`,
      group: kind === 'cold_water' ? 'AF' : 'AQ',
      from: { x: bestV.x, y: bestV.y },
      to: { x: nextWp.x, y: nextWp.y },
      elbow: pickOrthogonalElbow(bestV, nextWp),
      lengthM: segLen,
      kind,
    });

    visited.push({ x: nextWp.x, y: nextWp.y, z: nextWp.z, id: nextWp.id });
  }

  return { segments, totalLenM };
}

/**
 * Computes Minimum Spanning Tree shortest hydraulic pipe routing
 * from the shared wet-wall riser ("Prumada AF/AQ").
 */
export function computeHydraulicRouting(ut: UnitType): HydraulicRoutingSummary {
  const riser = getWetRiserPosition(ut);
  const coldPts = ut.waterPoints.filter((p) => p.waterType === 'fria');
  const hotPts = ut.waterPoints.filter((p) => p.waterType === 'quente');

  const coldMst = buildWaterMst(riser, coldPts, 'cold_water');
  const hotMst = buildWaterMst(riser, hotPts, 'hot_water');

  return {
    riser,
    segments: [...coldMst.segments, ...hotMst.segments],
    totalColdPipeM: coldMst.totalLenM,
    totalHotPipeM: hotMst.totalLenM,
    totalPipeM: round2(coldMst.totalLenM + hotMst.totalLenM),
  };
}

/**
 * Computes exact connected drainage pipe lengths along dp -> connectedToId edges.
 */
export function computeDrainageRouting(ut: UnitType): DrainageRoutingSummary {
  const byId = new Map(ut.drainagePoints.map((d) => [d.id, d]));
  const segments: MepRouteSegment[] = [];
  let totalDrainPipeM = 0;

  for (const dp of ut.drainagePoints) {
    const target = dp.connectedToId ? byId.get(dp.connectedToId) : undefined;
    if (!target) continue;
    const dist = round2(Math.max(0.25, Math.hypot(target.x - dp.x, target.y - dp.y)));
    totalDrainPipeM = round2(totalDrainPipeM + dist);
    segments.push({
      id: `dr-${dp.id}`,
      group: `${dp.code}->${target.code}`,
      from: { x: dp.x, y: dp.y },
      to: { x: target.x, y: target.y },
      lengthM: dist,
      kind: 'drainage',
    });
  }

  return { segments, totalDrainPipeM };
}
