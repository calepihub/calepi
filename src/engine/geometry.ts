import type {
  FurnitureItem,
  Opening,
  Point2D,
  Room,
  Setbacks,
  Site,
  UnitInstance,
  UnitType,
  Wall,
} from '../types/project';

export function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

export function round3(val: number): number {
  return Math.round(val * 1000) / 1000;
}

export function distance2D(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Shoelace formula for polygon area (m²).
 */
export function calculatePolygonArea(vertices: Point2D[]): number {
  if (vertices.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const curr = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    sum += curr.x * next.y - next.x * curr.y;
  }
  return round2(Math.abs(sum) / 2);
}

/**
 * Polygon perimeter (m).
 */
export function calculatePolygonPerimeter(vertices: Point2D[]): number {
  if (vertices.length < 2) return 0;
  let perim = 0;
  for (let i = 0; i < vertices.length; i++) {
    perim += distance2D(vertices[i], vertices[(i + 1) % vertices.length]);
  }
  return round2(perim);
}

export function getBoundingBox(vertices: Point2D[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  depth: number;
} {
  if (vertices.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, depth: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: round2(maxX - minX),
    depth: round2(maxY - minY),
  };
}

/**
 * Builds polygon vertices from front, back, leftDepth, rightDepth, and shapeType.
 */
export function buildSiteVerticesFromDimensions(
  front: number,
  back: number,
  leftDepth: number,
  rightDepth: number,
): Point2D[] {
  const safeFront = Math.max(1, front);
  const safeBack = Math.max(1, back);
  const safeLeft = Math.max(1, leftDepth);
  const safeRight = Math.max(1, rightDepth);

  // Center back edge relative to front edge
  const backOffset = (safeFront - safeBack) / 2;
  return [
    { x: 0, y: 0 },
    { x: safeFront, y: 0 },
    { x: round2(backOffset + safeBack), y: safeRight },
    { x: round2(backOffset), y: safeLeft },
  ];
}

export interface SiteGeometryCheck {
  calculatedArea: number;
  calculatedPerimeter: number;
  declaredArea: number;
  areaDivergenceM2: number;
  hasAreaDivergence: boolean;
  buildableBox: {
    x: number;
    y: number;
    width: number;
    depth: number;
    area: number;
  };
}

export function analyzeSiteGeometry(site: Site): SiteGeometryCheck {
  const calculatedArea = calculatePolygonArea(site.vertices);
  const calculatedPerimeter = calculatePolygonPerimeter(site.vertices);
  const declaredArea = site.declaredArea || calculatedArea;
  const areaDivergenceM2 = round2(Math.abs(calculatedArea - declaredArea));
  const hasAreaDivergence = areaDivergenceM2 > 0.5;

  const bbox = getBoundingBox(site.vertices);
  const setbacks: Setbacks = site.setbacks;
  const bWidth = Math.max(0, round2(bbox.width - setbacks.left - setbacks.right));
  const bDepth = Math.max(0, round2(bbox.depth - setbacks.front - setbacks.back));

  return {
    calculatedArea,
    calculatedPerimeter,
    declaredArea,
    areaDivergenceM2,
    hasAreaDivergence,
    buildableBox: {
      x: round2(bbox.minX + setbacks.left),
      y: round2(bbox.minY + setbacks.front),
      width: bWidth,
      depth: bDepth,
      area: round2(bWidth * bDepth),
    },
  };
}

export function getWallLength(wall: Wall): number {
  return round3(distance2D(wall.start, wall.end));
}

export function getWallAngleRad(wall: Wall): number {
  return Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
}

export function getRoomArea(room: Room): number {
  return round2(Math.max(0, room.width) * Math.max(0, room.depth));
}

export function getRoomPerimeter(room: Room): number {
  return round2(2 * (Math.max(0, room.width) + Math.max(0, room.depth)));
}

export function getUnitUsefulArea(unitType: UnitType): number {
  if (unitType.rooms.length === 0) {
    return round2(unitType.width * unitType.depth);
  }
  const sum = unitType.rooms.reduce((acc, r) => acc + getRoomArea(r), 0);
  return round2(sum);
}

export function getUnitGrossArea(unitType: UnitType): number {
  return round2(unitType.width * unitType.depth);
}

export interface Rect2D {
  x: number;
  y: number;
  width: number;
  depth: number;
}

export function getFurnitureWorldRect(item: FurnitureItem): Rect2D {
  const rot = ((item.rotationDeg % 360) + 360) % 360;
  const swapped = rot === 90 || rot === 270;
  return {
    x: item.x,
    y: item.y,
    width: swapped ? item.depth : item.width,
    depth: swapped ? item.width : item.depth,
  };
}

export function rectsOverlap(a: Rect2D, b: Rect2D, tolerance = 0.02): boolean {
  return (
    a.x + tolerance < b.x + b.width &&
    a.x + a.width - tolerance > b.x &&
    a.y + tolerance < b.y + b.depth &&
    a.y + a.depth - tolerance > b.y
  );
}

export function getOpeningWorldPosition(
  wall: Wall,
  opening: Opening,
): { center: Point2D; angleRad: number } {
  const len = Math.max(0.001, distance2D(wall.start, wall.end));
  const ux = (wall.end.x - wall.start.x) / len;
  const uy = (wall.end.y - wall.start.y) / len;
  const centerDist = opening.offsetAlongWall + opening.width / 2;
  return {
    center: {
      x: round3(wall.start.x + ux * centerDist),
      y: round3(wall.start.y + uy * centerDist),
    },
    angleRad: Math.atan2(uy, ux),
  };
}

export function checkImplantationFeasibility(
  site: Site,
  instances: UnitInstance[],
  unitTypes: UnitType[],
): {
  fitsInBuildableArea: boolean;
  outOfBoundsUnitIds: string[];
  overlappingUnitPairs: Array<[string, string]>;
  footprintAreaM2: number;
  buildableAreaM2: number;
  occupancyRatePercent: number;
} {
  const siteAnalysis = analyzeSiteGeometry(site);
  const buildable = siteAnalysis.buildableBox;
  const outOfBoundsUnitIds: string[] = [];
  const overlappingUnitPairs: Array<[string, string]> = [];
  const unitRects: Array<{ id: string; rect: Rect2D }> = [];

  for (const inst of instances) {
    const ut = unitTypes.find((t) => t.id === inst.unitTypeId);
    if (!ut) continue;
    const rot = ((inst.rotationDeg % 360) + 360) % 360;
    const w = rot === 90 || rot === 270 ? ut.depth : ut.width;
    const d = rot === 90 || rot === 270 ? ut.width : ut.depth;
    const rect: Rect2D = { x: inst.x, y: inst.y, width: w, depth: d };
    unitRects.push({ id: inst.id, rect });

    const inside =
      rect.x >= buildable.x - 0.01 &&
      rect.y >= buildable.y - 0.01 &&
      rect.x + rect.width <= buildable.x + buildable.width + 0.01 &&
      rect.y + rect.depth <= buildable.y + buildable.depth + 0.01;
    if (!inside) {
      outOfBoundsUnitIds.push(inst.id);
    }
  }

  for (let i = 0; i < unitRects.length; i++) {
    for (let j = i + 1; j < unitRects.length; j++) {
      if (rectsOverlap(unitRects[i].rect, unitRects[j].rect, 0.05)) {
        overlappingUnitPairs.push([unitRects[i].id, unitRects[j].id]);
      }
    }
  }

  const footprintAreaM2 = round2(
    unitRects.reduce((sum, u) => sum + u.rect.width * u.rect.depth, 0),
  );
  const siteArea = Math.max(1, siteAnalysis.calculatedArea);

  return {
    fitsInBuildableArea:
      outOfBoundsUnitIds.length === 0 && overlappingUnitPairs.length === 0,
    outOfBoundsUnitIds,
    overlappingUnitPairs,
    footprintAreaM2,
    buildableAreaM2: buildable.area,
    occupancyRatePercent: round2((footprintAreaM2 / siteArea) * 100),
  };
}
