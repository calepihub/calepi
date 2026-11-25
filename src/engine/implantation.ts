import {
  analyzeSiteGeometry,
  calculatePolygonArea,
  getBoundingBox,
  getOpeningWorldPosition,
  getUnitWorldRect,
  rectsOverlap,
  round2,
  round3,
  topLeftToUnitOrigin,
  type Rect2D,
} from './geometry';
import { unitLocalToWorld } from './cadDrawings';
import { generateParametricUnitLayout } from './parametricGenerator';
import type {
  EntrySide,
  Floor,
  ImplantationConfig,
  ImplantationZone,
  LotFrontSide,
  LotSideKey,
  Point2D,
  Project,
  Site,
  SiteAccessGate,
  SiteEdgeBoundary,
  UnitInstance,
  UnitType,
} from '../types/project';

export interface NormalizedSite extends Site {
  measurementUnit: 'm' | 'cm';
  streetSide: LotFrontSide;
  boundaries: {
    front: SiteEdgeBoundary;
    back: SiteEdgeBoundary;
    left: SiteEdgeBoundary;
    right: SiteEdgeBoundary;
  };
  accesses: SiteAccessGate[];
}

export interface LotBoundarySegment {
  side: LotSideKey;
  label: string;
  a: Point2D;
  b: Point2D;
  lengthM: number;
  inwardNormal: Point2D;
  boundary: SiteEdgeBoundary;
}

export interface GateWorldGeometry {
  gate: SiteAccessGate;
  p1: Point2D;
  p2: Point2D;
  center: Point2D;
  inwardNormal: Point2D;
  edgeLengthM: number;
}

export interface SharedWallSegment {
  id: string;
  unitAId: string;
  unitANumber: string;
  unitBId: string;
  unitBNumber: string;
  p1: Point2D;
  p2: Point2D;
  lengthM: number;
  orientation: 'vertical' | 'horizontal';
  conflictingOpenings: string[];
}

export interface ImplantationIssue {
  id: string;
  severity: 'CRITICO' | 'ATENCAO' | 'INFO';
  code:
    | 'OUT_OF_BOUNDS'
    | 'OVERLAP'
    | 'CORRIDOR_CONFLICT'
    | 'SPACING_MISMATCH'
    | 'COUNT_DIVERGENCE'
    | 'SHARED_WALL_CONFLICT'
    | 'BLOCKED_ACCESS'
    | 'INCOMPLETE_FIELDS';
  title: string;
  detail: string;
  affectedUnitIds: string[];
}

export interface ImplantationValidationReport {
  isValid: boolean;
  criticalCount: number;
  warningCount: number;
  issues: ImplantationIssue[];
  sharedWalls: SharedWallSegment[];
  metrics: {
    lotAreaM2: number;
    buildableAreaM2: number;
    footprintAreaM2: number;
    uncoveredAreaM2: number;
    occupancyRatePercent: number;
    totalUnitsPlaced: number;
    targetUnits: number;
    sharedWallsCount: number;
    minMeasuredCorridorM: number | null;
    minMeasuredInterUnitGapM: number | null;
    realSetbacksMeasured: {
      front: number | null;
      back: number | null;
      left: number | null;
      right: number | null;
    };
  };
  municipalValidationNote: string;
}

export function formatLengthInUnit(meters: number, unit: 'm' | 'cm' = 'm'): string {
  if (unit === 'cm') {
    return `${Math.round(meters * 100)} cm`;
  }
  return `${round2(meters).toFixed(2)} m`;
}

export function normalizeSiteData(site: Site): NormalizedSite {
  const streetSide: LotFrontSide = site.streetSide ?? 'baixo';
  const measurementUnit = site.measurementUnit ?? 'm';
  const defaultFront: SiteEdgeBoundary = {
    condition: 'murada',
    heightM: 2.0,
    hasNeighborBuilding: false,
    notes: 'Muro frontal com portão de acesso',
  };
  const defaultWall = (note: string): SiteEdgeBoundary => ({
    condition: 'murada',
    heightM: 2.0,
    hasNeighborBuilding: false,
    notes: note,
  });

  const boundaries = {
    front: site.boundaries?.front ?? defaultFront,
    back: site.boundaries?.back ?? defaultWall('Divisa de fundos'),
    left: site.boundaries?.left ?? defaultWall('Divisa lateral esquerda'),
    right: site.boundaries?.right ?? defaultWall('Divisa lateral direita'),
  };

  const accesses: SiteAccessGate[] =
    site.accesses !== undefined
      ? site.accesses
      : [
          {
            id: 'gate-ped-1',
            label: 'Portão de Pedestres',
            type: 'pedestre',
            side: 'front',
            offsetM: round2(Math.max(0.4, Math.min(site.front - 1.2, 0.8))),
            widthM: 1.0,
            enabled: true,
          },
        ];

  return {
    ...site,
    measurementUnit,
    streetSide,
    boundaries,
    accesses,
  };
}

/**
 * Computes exact world-space boundary segments for front / back / left / right
 * from the perspective of an observer standing on the street facing the lot.
 */
export function getLotBoundarySegments(site: Site): LotBoundarySegment[] {
  const norm = normalizeSiteData(site);
  const bbox = getBoundingBox(norm.vertices);
  const ss = norm.streetSide;

  // Map observer sides ('front' | 'back' | 'left' | 'right') to bounding edges
  const makeSeg = (
    side: LotSideKey,
    label: string,
    a: Point2D,
    b: Point2D,
    inwardNormal: Point2D,
  ): LotBoundarySegment => ({
    side,
    label,
    a,
    b,
    lengthM: round2(Math.hypot(b.x - a.x, b.y - a.y)),
    inwardNormal,
    boundary: norm.boundaries[side],
  });

  if (ss === 'baixo') {
    return [
      makeSeg(
        'front',
        'Frente (Rua)',
        { x: bbox.minX, y: bbox.maxY },
        { x: bbox.maxX, y: bbox.maxY },
        { x: 0, y: -1 },
      ),
      makeSeg(
        'back',
        'Fundos',
        { x: bbox.minX, y: bbox.minY },
        { x: bbox.maxX, y: bbox.minY },
        { x: 0, y: 1 },
      ),
      makeSeg(
        'left',
        'Lateral Esquerda',
        { x: bbox.minX, y: bbox.maxY },
        { x: bbox.minX, y: bbox.minY },
        { x: 1, y: 0 },
      ),
      makeSeg(
        'right',
        'Lateral Direita',
        { x: bbox.maxX, y: bbox.maxY },
        { x: bbox.maxX, y: bbox.minY },
        { x: -1, y: 0 },
      ),
    ];
  }

  if (ss === 'cima') {
    // Standing at top looking down (+Y): observer's left is +X (maxX), right is -X (minX)
    return [
      makeSeg(
        'front',
        'Frente (Rua)',
        { x: bbox.maxX, y: bbox.minY },
        { x: bbox.minX, y: bbox.minY },
        { x: 0, y: 1 },
      ),
      makeSeg(
        'back',
        'Fundos',
        { x: bbox.maxX, y: bbox.maxY },
        { x: bbox.minX, y: bbox.maxY },
        { x: 0, y: -1 },
      ),
      makeSeg(
        'left',
        'Lateral Esquerda',
        { x: bbox.maxX, y: bbox.minY },
        { x: bbox.maxX, y: bbox.maxY },
        { x: -1, y: 0 },
      ),
      makeSeg(
        'right',
        'Lateral Direita',
        { x: bbox.minX, y: bbox.minY },
        { x: bbox.minX, y: bbox.maxY },
        { x: 1, y: 0 },
      ),
    ];
  }

  if (ss === 'esquerda') {
    // Standing at left looking right (+X): observer's left is minY (top), right is maxY (bottom)
    return [
      makeSeg(
        'front',
        'Frente (Rua)',
        { x: bbox.minX, y: bbox.minY },
        { x: bbox.minX, y: bbox.maxY },
        { x: 1, y: 0 },
      ),
      makeSeg(
        'back',
        'Fundos',
        { x: bbox.maxX, y: bbox.minY },
        { x: bbox.maxX, y: bbox.maxY },
        { x: -1, y: 0 },
      ),
      makeSeg(
        'left',
        'Lateral Esquerda',
        { x: bbox.minX, y: bbox.minY },
        { x: bbox.maxX, y: bbox.minY },
        { x: 0, y: 1 },
      ),
      makeSeg(
        'right',
        'Lateral Direita',
        { x: bbox.minX, y: bbox.maxY },
        { x: bbox.maxX, y: bbox.maxY },
        { x: 0, y: -1 },
      ),
    ];
  }

  // ss === 'direita': standing at right looking left (-X): left is maxY (bottom), right is minY (top)
  return [
    makeSeg(
      'front',
      'Frente (Rua)',
      { x: bbox.maxX, y: bbox.maxY },
      { x: bbox.maxX, y: bbox.minY },
      { x: -1, y: 0 },
    ),
    makeSeg(
      'back',
      'Fundos',
      { x: bbox.minX, y: bbox.maxY },
      { x: bbox.minX, y: bbox.minY },
      { x: 1, y: 0 },
    ),
    makeSeg(
      'left',
      'Lateral Esquerda',
      { x: bbox.maxX, y: bbox.maxY },
      { x: bbox.minX, y: bbox.maxY },
      { x: 0, y: -1 },
    ),
    makeSeg(
      'right',
      'Lateral Direita',
      { x: bbox.maxX, y: bbox.minY },
      { x: bbox.minX, y: bbox.minY },
      { x: 0, y: 1 },
    ),
  ];
}

export function getGateWorldPosition(
  site: Site,
  gate: SiteAccessGate,
): GateWorldGeometry | null {
  if (!gate.enabled) return null;
  const seg = getLotBoundarySegments(site).find((s) => s.side === gate.side);
  if (!seg || seg.lengthM < 0.2) return null;

  const ux = (seg.b.x - seg.a.x) / seg.lengthM;
  const uy = (seg.b.y - seg.a.y) / seg.lengthM;
  const startOffset = Math.max(0, Math.min(seg.lengthM - 0.3, gate.offsetM));
  const endOffset = Math.min(seg.lengthM, startOffset + Math.max(0.5, gate.widthM));
  const p1 = {
    x: round3(seg.a.x + ux * startOffset),
    y: round3(seg.a.y + uy * startOffset),
  };
  const p2 = {
    x: round3(seg.a.x + ux * endOffset),
    y: round3(seg.a.y + uy * endOffset),
  };
  return {
    gate,
    p1,
    p2,
    center: {
      x: round3((p1.x + p2.x) / 2),
      y: round3((p1.y + p2.y) / 2),
    },
    inwardNormal: seg.inwardNormal,
    edgeLengthM: seg.lengthM,
  };
}

export function createDefaultImplantationConfig(project: Project): ImplantationConfig {
  const existingUnits = project.floors[0]?.units ?? [];
  const corridor = project.floors[0]?.corridorWidth ?? 1.5;
  const primaryUtId = project.unitTypes[0]?.id;

  return {
    primaryZone: existingUnits.length > 0 ? 'ambos_lados' : 'lado_esquerdo',
    layoutPattern:
      existingUnits.length === 1
        ? 'isolada'
        : existingUnits.length > 0
          ? 'ambos_lados'
          : 'sequencia',
    totalUnitsTarget: existingUnits.length > 0 ? existingUnits.length : 0,
    leftCount: existingUnits.length > 0 ? Math.ceil(existingUnits.length / 2) : 0,
    rightCount: existingUnits.length > 0 ? Math.floor(existingUnits.length / 2) : 0,
    frontCount: 0,
    backCount: 0,
    modelMode: project.unitTypes.length > 1 ? 'misto_repeticao' : 'todas_iguais',
    couplingMode: 'geminadas',
    interUnitSpacingM: 1.5,
    mirrorAlternate: true,
    shareWallsWhenPossible: true,
    primaryUnitTypeId: primaryUtId,
    groups: [],
    circulation: {
      corridorWidthM: Math.max(1.2, corridor),
      minInterUnitSpacingM: 1.5,
      accessMode: 'compartilhado',
      serviceAreaM2: 0,
      uncoveredAreaTargetM2: 0,
      notes: '',
    },
  };
}

function resolveUnitTypeForSlot(
  project: Project,
  config: ImplantationConfig,
  slotIndex: number,
  explicitTypeId?: string,
): UnitType | undefined {
  if (explicitTypeId) {
    const found = project.unitTypes.find((u) => u.id === explicitTypeId);
    if (found) return found;
  }
  if (config.primaryUnitTypeId) {
    const primary = project.unitTypes.find((u) => u.id === config.primaryUnitTypeId);
    if (primary && config.modelMode === 'todas_iguais') return primary;
  }
  if (project.unitTypes.length === 0) return undefined;
  if (config.modelMode === 'todas_iguais') {
    return project.unitTypes[0];
  }
  return project.unitTypes[slotIndex % project.unitTypes.length];
}

function getObserverVectors(streetSide: LotFrontSide): {
  rightVec: Point2D; // observer left -> right
  inwardVec: Point2D; // street front -> back
} {
  if (streetSide === 'baixo') {
    return { rightVec: { x: 1, y: 0 }, inwardVec: { x: 0, y: -1 } };
  }
  if (streetSide === 'cima') {
    return { rightVec: { x: -1, y: 0 }, inwardVec: { x: 0, y: 1 } };
  }
  if (streetSide === 'esquerda') {
    return { rightVec: { x: 0, y: 1 }, inwardVec: { x: 1, y: 0 } };
  }
  return { rightVec: { x: 0, y: -1 }, inwardVec: { x: -1, y: 0 } };
}

function buildInstanceAtBox(params: {
  id: string;
  unitNumber: string;
  ut: UnitType;
  floorId: string;
  topLeftX: number;
  topLeftY: number;
  rotationDeg: number;
  mirrored: boolean;
  zoneSide: UnitInstance['zoneSide'];
  couplingGroupId?: string;
  couplingType: UnitInstance['couplingType'];
  entranceOrientation: UnitInstance['entranceOrientation'];
}): UnitInstance {
  const origin = topLeftToUnitOrigin(
    params.topLeftX,
    params.topLeftY,
    params.ut,
    params.rotationDeg,
  );
  return {
    id: params.id,
    unitNumber: params.unitNumber,
    unitTypeId: params.ut.id,
    floorId: params.floorId,
    x: origin.x,
    y: origin.y,
    rotationDeg: params.rotationDeg,
    mirrored: params.mirrored,
    zoneSide: params.zoneSide,
    couplingGroupId: params.couplingGroupId,
    couplingType: params.couplingType,
    entranceOrientation: params.entranceOrientation,
  };
}

/**
 * Computes unit instances for a floor from the user's explicit ImplantationConfig,
 * strictly honoring street-view perspective, side counts (never forcing both sides),
 * geminadas (0-gap) vs separadas (explicit spacing), and custom groups.
 */
export function generateImplantationUnits(
  project: Project,
  config: ImplantationConfig,
  floorId: string,
): UnitInstance[] {
  if (project.unitTypes.length === 0) return [];
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return [];

  const site = normalizeSiteData(project.site);
  const bBox = analyzeSiteGeometry(site).buildableBox;
  const streetSide = site.streetSide;
  const gap =
    config.couplingMode === 'geminadas'
      ? 0
      : Math.max(0, round2(config.interUnitSpacingM || config.circulation.minInterUnitSpacingM));
  const corridor = Math.max(0.9, round2(config.circulation.corridorWidthM || floor.corridorWidth || 1.5));

  const generated: UnitInstance[] = [];
  let seq = 1;
  const makeNum = () => `${floor.levelIndex + 1}${String(seq++).padStart(2, '0')}`;
  const makeId = (idx: number) => `inst-${floor.levelIndex + 1}-${idx}-${Date.now().toString(36).slice(-4)}`;

  const isHorizontalStreet = streetSide === 'baixo' || streetSide === 'cima';

  // Helper to get bounding box bounds in observer coordinates:
  // "front" edge of buildableBox, "back" edge, "left" edge, "right" edge
  const getObserverAnchors = (w: number, d: number) => {
    if (streetSide === 'baixo') {
      return {
        leftX: bBox.x,
        rightX: bBox.x + bBox.width - w,
        centerX: bBox.x + (bBox.width - w) / 2,
        frontY: bBox.y + bBox.depth - d,
        backY: bBox.y,
        centerY: bBox.y + (bBox.depth - d) / 2,
      };
    }
    if (streetSide === 'cima') {
      return {
        leftX: bBox.x + bBox.width - w,
        rightX: bBox.x,
        centerX: bBox.x + (bBox.width - w) / 2,
        frontY: bBox.y,
        backY: bBox.y + bBox.depth - d,
        centerY: bBox.y + (bBox.depth - d) / 2,
      };
    }
    if (streetSide === 'esquerda') {
      return {
        leftX: bBox.x, // used as front along X when street is left
        rightX: bBox.x + bBox.width - w, // back along X
        centerX: bBox.x + (bBox.width - w) / 2,
        frontY: bBox.y, // observer left along Y
        backY: bBox.y + bBox.depth - d, // observer right along Y
        centerY: bBox.y + (bBox.depth - d) / 2,
      };
    }
    // streetSide === 'direita'
    return {
      leftX: bBox.x + bBox.width - w,
      rightX: bBox.x,
      centerX: bBox.x + (bBox.width - w) / 2,
      frontY: bBox.y + bBox.depth - d,
      backY: bBox.y,
      centerY: bBox.y + (bBox.depth - d) / 2,
    };
  };

  // Place a linear strip along a specified zone
  const placeInZone = (
    zone: Exclude<ImplantationZone, 'ambos_lados' | 'personalizada'>,
    count: number,
    explicitUtId: string | undefined,
    localCoupling: 'geminadas' | 'separadas',
    localSpacing: number,
    mirroredRule: 'nenhuma' | 'alternada' | 'todas' | 'oposta_corredor',
    groupId: string,
    entranceDir: UnitInstance['entranceOrientation'] = 'frente',
  ) => {
    if (count <= 0) return;
    const stepGap = localCoupling === 'geminadas' ? 0 : Math.max(0, localSpacing);
    const couplingType: UnitInstance['couplingType'] =
      count === 1 && localCoupling === 'separadas'
        ? 'isolada'
        : localCoupling === 'geminadas'
          ? 'geminada'
          : 'separada';

    let cursor = 0;

    for (let i = 0; i < count; i++) {
      const ut = resolveUnitTypeForSlot(project, config, seq - 1, explicitUtId);
      if (!ut) continue;
      // Rotate 180deg when street is 'cima' so natural J1/front faces street, or keep natural orientation for vertical side rows
      const rot = 0;
      const w = ut.width;
      const d = ut.depth;
      const anchors = getObserverAnchors(w, d);

      let tlX = anchors.centerX;
      let tlY = anchors.centerY;
      let zSide: UnitInstance['zoneSide'] = 'central';

      if (isHorizontalStreet) {
        const dirY = streetSide === 'baixo' ? 1 : -1;
        const stepAlongDepth = d + stepGap;

        if (zone === 'lado_esquerdo') {
          tlX = anchors.leftX;
          tlY =
            streetSide === 'baixo'
              ? bBox.y + cursor
              : bBox.y + bBox.depth - d - cursor;
          cursor += stepAlongDepth;
          zSide = 'esquerdo';
        } else if (zone === 'lado_direito') {
          tlX = anchors.rightX;
          tlY =
            streetSide === 'baixo'
              ? bBox.y + cursor
              : bBox.y + bBox.depth - d - cursor;
          cursor += stepAlongDepth;
          zSide = 'direito';
        } else if (zone === 'frontal') {
          const totalRowW = count * w + Math.max(0, count - 1) * stepGap;
          const startX = bBox.x + (bBox.width - totalRowW) / 2;
          tlX = startX + i * (w + stepGap);
          tlY = anchors.frontY;
          zSide = 'frontal';
        } else if (zone === 'fundos') {
          const totalRowW = count * w + Math.max(0, count - 1) * stepGap;
          const startX = bBox.x + (bBox.width - totalRowW) / 2;
          tlX = startX + i * (w + stepGap);
          tlY = anchors.backY;
          zSide = 'fundos';
        } else if (zone === 'central' || zone === 'centralizada') {
          // Place row centered inside buildableBox
          const totalRowW = count * w + Math.max(0, count - 1) * stepGap;
          if (totalRowW <= bBox.width + 0.05) {
            tlX = bBox.x + (bBox.width - totalRowW) / 2 + i * (w + stepGap);
            tlY = anchors.centerY;
          } else {
            tlX = anchors.centerX;
            tlY = bBox.y + cursor * dirY;
            if (streetSide === 'cima') {
              tlY = bBox.y + bBox.depth - d - cursor;
            }
            cursor += stepAlongDepth;
          }
          zSide = 'central';
        }
      } else {
        // Horizontal street is left or right
        const stepAlongWidth = w + stepGap;
        if (zone === 'lado_esquerdo') {
          tlY = anchors.frontY; // observer's left edge
          tlX = streetSide === 'esquerda' ? bBox.x + cursor : bBox.x + bBox.width - w - cursor;
          cursor += stepAlongWidth;
          zSide = 'esquerdo';
        } else if (zone === 'lado_direito') {
          tlY = anchors.backY; // observer's right edge
          tlX = streetSide === 'esquerda' ? bBox.x + cursor : bBox.x + bBox.width - w - cursor;
          cursor += stepAlongWidth;
          zSide = 'direito';
        } else if (zone === 'frontal') {
          const totalColD = count * d + Math.max(0, count - 1) * stepGap;
          tlX = anchors.leftX;
          tlY = bBox.y + (bBox.depth - totalColD) / 2 + i * (d + stepGap);
          zSide = 'frontal';
        } else if (zone === 'fundos') {
          const totalColD = count * d + Math.max(0, count - 1) * stepGap;
          tlX = anchors.rightX;
          tlY = bBox.y + (bBox.depth - totalColD) / 2 + i * (d + stepGap);
          zSide = 'fundos';
        } else {
          const totalColD = count * d + Math.max(0, count - 1) * stepGap;
          tlX = anchors.centerX;
          tlY = bBox.y + (bBox.depth - totalColD) / 2 + i * (d + stepGap);
          zSide = 'central';
        }
      }

      const mirrored =
        mirroredRule === 'todas'
          ? true
          : mirroredRule === 'alternada'
            ? i % 2 === 1
            : mirroredRule === 'oposta_corredor'
              ? zone === 'lado_direito'
              : false;

      generated.push(
        buildInstanceAtBox({
          id: makeId(seq),
          unitNumber: makeNum(),
          ut,
          floorId: floor.id,
          topLeftX: round2(tlX),
          topLeftY: round2(tlY),
          rotationDeg: rot,
          mirrored,
          zoneSide: zSide,
          couplingGroupId: groupId,
          couplingType,
          entranceOrientation: entranceDir,
        }),
      );
    }
  };

  // Mode 1: Explicit Mixed / Multi-Group Configuration
  if (
    (config.couplingMode === 'mista' || config.groups.length > 0) &&
    config.groups.length > 0 &&
    (config.couplingMode === 'mista' || config.modelMode === 'misto_repeticao')
  ) {
    for (const grp of config.groups) {
      if (grp.count <= 0) continue;
      placeInZone(
        grp.zone,
        grp.count,
        grp.unitTypeId || config.primaryUnitTypeId,
        grp.coupling,
        grp.spacingM,
        grp.mirroredRule,
        grp.id,
        grp.entranceOrientation,
      );
    }
    return generated;
  }

  // Mode 2: Isolated single kitnet
  if (config.layoutPattern === 'isolada' || config.totalUnitsTarget === 1) {
    const z: Exclude<ImplantationZone, 'ambos_lados' | 'personalizada'> =
      config.primaryZone === 'ambos_lados' || config.primaryZone === 'personalizada'
        ? 'centralizada'
        : config.primaryZone;
    placeInZone(
      z,
      1,
      config.primaryUnitTypeId,
      config.couplingMode === 'geminadas' ? 'geminadas' : 'separadas',
      gap,
      'nenhuma',
      'grp-isolada',
      'frente',
    );
    return generated;
  }

  // Mode 3: Two sides or explicit per-side distribution (never forces symmetric sides!)
  if (
    config.primaryZone === 'ambos_lados' ||
    config.layoutPattern === 'ambos_lados' ||
    config.layoutPattern === 'duas_fileiras'
  ) {
    const leftC = Math.max(0, config.leftCount);
    const rightC = Math.max(0, config.rightCount);
    const frontC = Math.max(0, config.frontCount);
    const backC = Math.max(0, config.backCount);
    const singleCoupling: 'geminadas' | 'separadas' =
      config.couplingMode === 'separadas' ? 'separadas' : 'geminadas';

    if (leftC + rightC + frontC + backC > 0) {
      if (leftC > 0) {
        placeInZone(
          'lado_esquerdo',
          leftC,
          config.primaryUnitTypeId,
          singleCoupling,
          gap,
          config.mirrorAlternate ? 'alternada' : 'nenhuma',
          'grp-esq',
          'lateral_direita',
        );
      }
      if (rightC > 0) {
        placeInZone(
          'lado_direito',
          rightC,
          config.primaryUnitTypeId,
          singleCoupling,
          gap,
          config.mirrorAlternate ? 'oposta_corredor' : 'nenhuma',
          'grp-dir',
          'lateral_esquerda',
        );
      }
      if (frontC > 0) {
        placeInZone(
          'frontal',
          frontC,
          config.primaryUnitTypeId,
          singleCoupling,
          gap,
          'nenhuma',
          'grp-frente',
          'frente',
        );
      }
      if (backC > 0) {
        placeInZone(
          'fundos',
          backC,
          config.primaryUnitTypeId,
          singleCoupling,
          gap,
          'nenhuma',
          'grp-fundos',
          'frente',
        );
      }
      return generated;
    }

    // Fallback when totalUnitsTarget > 0 without explicit split: place 2 rows separated by corridor
    const target = Math.max(1, config.totalUnitsTarget);
    const leftAuto = Math.ceil(target / 2);
    const rightAuto = Math.floor(target / 2);
    if (leftAuto > 0) {
      placeInZone(
        'lado_esquerdo',
        leftAuto,
        config.primaryUnitTypeId,
        singleCoupling,
        gap,
        config.mirrorAlternate ? 'alternada' : 'nenhuma',
        'grp-esq',
        'lateral_direita',
      );
    }
    if (rightAuto > 0) {
      placeInZone(
        'lado_direito',
        rightAuto,
        config.primaryUnitTypeId,
        singleCoupling,
        gap,
        config.mirrorAlternate ? 'oposta_corredor' : 'nenhuma',
        'grp-dir',
        'lateral_esquerda',
      );
    }
    void corridor;
    return generated;
  }

  // Mode 4: Single zone sequence, side-by-side, or rear cluster
  const resolvedZone: Exclude<ImplantationZone, 'ambos_lados' | 'personalizada'> =
    config.layoutPattern === 'conjunto_fundos'
      ? 'fundos'
      : config.primaryZone === 'personalizada'
        ? 'centralizada'
        : config.primaryZone;

  const targetCount = Math.max(1, config.totalUnitsTarget);
  const singleCoupling: 'geminadas' | 'separadas' =
    config.couplingMode === 'separadas' ? 'separadas' : 'geminadas';

  placeInZone(
    resolvedZone,
    targetCount,
    config.primaryUnitTypeId,
    singleCoupling,
    gap,
    config.mirrorAlternate ? 'alternada' : 'nenhuma',
    `grp-${resolvedZone}`,
    resolvedZone === 'lado_esquerdo'
      ? 'lateral_direita'
      : resolvedZone === 'lado_direito'
        ? 'lateral_esquerda'
        : 'frente',
  );
  return generated;
}

/**
 * Detects shared party walls between touching units (gap <= tolerance)
 * and checks whether any touching unit has a door or window opening on the shared edge.
 */
export function detectSharedWallsAndGaps(
  units: UnitInstance[],
  unitTypes: UnitType[],
  touchTolerance = 0.04,
): {
  sharedWalls: SharedWallSegment[];
  minMeasuredCorridorM: number | null;
  minMeasuredInterUnitGapM: number | null;
} {
  const unitRects: Array<{ inst: UnitInstance; ut: UnitType; rect: Rect2D }> = [];
  for (const inst of units) {
    const ut = unitTypes.find((t) => t.id === inst.unitTypeId);
    if (!ut) continue;
    unitRects.push({ inst, ut, rect: getUnitWorldRect(inst, ut) });
  }

  const sharedWalls: SharedWallSegment[] = [];
  let minNonZeroGap = Infinity;
  let minCorridorGap = Infinity;

  const getExternalOpeningsAlongWorldSegment = (
    inst: UnitInstance,
    ut: UnitType,
    p1: Point2D,
    p2: Point2D,
    orientation: 'vertical' | 'horizontal',
  ): string[] => {
    const found: string[] = [];
    for (const wall of ut.walls) {
      if (!wall.isExternal) continue;
      const ops = ut.openings.filter((o) => o.wallId === wall.id);
      if (ops.length === 0) continue;
      for (const op of ops) {
        const localCenter = getOpeningWorldPosition(wall, op).center;
        const wc = unitLocalToWorld(inst, ut, localCenter.x, localCenter.y);
        if (orientation === 'vertical') {
          const onLineX = Math.abs(wc.x - p1.x) <= Math.max(0.18, wall.thickness + 0.05);
          const withinY = wc.y >= Math.min(p1.y, p2.y) - 0.05 && wc.y <= Math.max(p1.y, p2.y) + 0.05;
          if (onLineX && withinY) {
            found.push(`${inst.unitNumber}:${op.code}`);
          }
        } else {
          const onLineY = Math.abs(wc.y - p1.y) <= Math.max(0.18, wall.thickness + 0.05);
          const withinX = wc.x >= Math.min(p1.x, p2.x) - 0.05 && wc.x <= Math.max(p1.x, p2.x) + 0.05;
          if (onLineY && withinX) {
            found.push(`${inst.unitNumber}:${op.code}`);
          }
        }
      }
    }
    return found;
  };

  for (let i = 0; i < unitRects.length; i++) {
    for (let j = i + 1; j < unitRects.length; j++) {
      const a = unitRects[i];
      const b = unitRects[j];
      const ra = a.rect;
      const rb = b.rect;

      // Check vertical touching (A right edge ~= B left edge or B right edge ~= A left edge)
      const yOverlapStart = Math.max(ra.y, rb.y);
      const yOverlapEnd = Math.min(ra.y + ra.depth, rb.y + rb.depth);
      const yOverlap = yOverlapEnd - yOverlapStart;

      const xOverlapStart = Math.max(ra.x, rb.x);
      const xOverlapEnd = Math.min(ra.x + ra.width, rb.x + rb.width);
      const xOverlap = xOverlapEnd - xOverlapStart;

      if (yOverlap > 0.35) {
        const dxRight = Math.abs(ra.x + ra.width - rb.x);
        const dxLeft = Math.abs(rb.x + rb.width - ra.x);
        const touchX =
          dxRight <= touchTolerance
            ? round3((ra.x + ra.width + rb.x) / 2)
            : dxLeft <= touchTolerance
              ? round3((rb.x + rb.width + ra.x) / 2)
              : null;

        if (touchX !== null) {
          const p1 = { x: touchX, y: round3(yOverlapStart) };
          const p2 = { x: touchX, y: round3(yOverlapEnd) };
          const conflicts = [
            ...getExternalOpeningsAlongWorldSegment(a.inst, a.ut, p1, p2, 'vertical'),
            ...getExternalOpeningsAlongWorldSegment(b.inst, b.ut, p1, p2, 'vertical'),
          ];
          sharedWalls.push({
            id: `sw-${a.inst.id}-${b.inst.id}`,
            unitAId: a.inst.id,
            unitANumber: a.inst.unitNumber,
            unitBId: b.inst.id,
            unitBNumber: b.inst.unitNumber,
            p1,
            p2,
            lengthM: round2(yOverlap),
            orientation: 'vertical',
            conflictingOpenings: conflicts,
          });
        } else {
          const gapX =
            ra.x + ra.width < rb.x
              ? rb.x - (ra.x + ra.width)
              : rb.x + rb.width < ra.x
                ? ra.x - (rb.x + rb.width)
                : 0;
          if (gapX > touchTolerance) {
            minNonZeroGap = Math.min(minNonZeroGap, gapX);
            if (gapX >= 0.75) {
              minCorridorGap = Math.min(minCorridorGap, gapX);
            }
          }
        }
      }

      if (xOverlap > 0.35) {
        const dyBottom = Math.abs(ra.y + ra.depth - rb.y);
        const dyTop = Math.abs(rb.y + rb.depth - ra.y);
        const touchY =
          dyBottom <= touchTolerance
            ? round3((ra.y + ra.depth + rb.y) / 2)
            : dyTop <= touchTolerance
              ? round3((rb.y + rb.depth + ra.y) / 2)
              : null;

        if (touchY !== null) {
          const p1 = { x: round3(xOverlapStart), y: touchY };
          const p2 = { x: round3(xOverlapEnd), y: touchY };
          const conflicts = [
            ...getExternalOpeningsAlongWorldSegment(a.inst, a.ut, p1, p2, 'horizontal'),
            ...getExternalOpeningsAlongWorldSegment(b.inst, b.ut, p1, p2, 'horizontal'),
          ];
          sharedWalls.push({
            id: `sw-${a.inst.id}-${b.inst.id}`,
            unitAId: a.inst.id,
            unitANumber: a.inst.unitNumber,
            unitBId: b.inst.id,
            unitBNumber: b.inst.unitNumber,
            p1,
            p2,
            lengthM: round2(xOverlap),
            orientation: 'horizontal',
            conflictingOpenings: conflicts,
          });
        } else {
          const gapY =
            ra.y + ra.depth < rb.y
              ? rb.y - (ra.y + ra.depth)
              : rb.y + rb.depth < ra.y
                ? ra.y - (rb.y + rb.depth)
                : 0;
          if (gapY > touchTolerance) {
            minNonZeroGap = Math.min(minNonZeroGap, gapY);
            if (gapY >= 0.75) {
              minCorridorGap = Math.min(minCorridorGap, gapY);
            }
          }
        }
      }
    }
  }

  return {
    sharedWalls,
    minMeasuredCorridorM: Number.isFinite(minCorridorGap) ? round2(minCorridorGap) : null,
    minMeasuredInterUnitGapM: Number.isFinite(minNonZeroGap) ? round2(minNonZeroGap) : null,
  };
}

/**
 * Full real-time validation of lot geometry, implantation, shared party walls,
 * spacing, corridor clearance, gate access, and count consistency.
 * NEVER auto-resizes or moves user units silently.
 */
export function validateImplantation(
  project: Project,
  floorId?: string,
): ImplantationValidationReport {
  const site = normalizeSiteData(project.site);
  const siteAnalysis = analyzeSiteGeometry(project.site);
  const lotAreaM2 = siteAnalysis.calculatedArea || calculatePolygonArea(site.vertices);
  const bbox = getBoundingBox(site.vertices);
  const bBox = siteAnalysis.buildableBox;
  const floor =
    (floorId ? project.floors.find((f) => f.id === floorId) : project.floors[0]) ??
    project.floors[0];
  const units = floor?.units ?? [];
  const config = project.implantation;

  const issues: ImplantationIssue[] = [];

  // 1. Incomplete fields
  if (!project.name?.trim() || site.front < 2 || site.leftDepth < 2) {
    issues.push({
      id: 'imp-incomplete-site',
      severity: 'ATENCAO',
      code: 'INCOMPLETE_FIELDS',
      title: 'Dados básicos do terreno incompletos',
      detail: 'Informe nome do projeto e dimensões válidas do lote na Etapa 1.',
      affectedUnitIds: [],
    });
  }
  if (config?.couplingMode === 'separadas' && (config.interUnitSpacingM ?? 0) <= 0) {
    issues.push({
      id: 'imp-incomplete-spacing',
      severity: 'CRITICO',
      code: 'INCOMPLETE_FIELDS',
      title: 'Afastamento entre unidades separadas não informado',
      detail: 'Para implantação "Separadas", defina um afastamento mínimo maior que 0,00 m.',
      affectedUnitIds: [],
    });
  }

  // 2. Unit bounding boxes & setbacks
  const unitRects: Array<{ inst: UnitInstance; ut: UnitType; rect: Rect2D }> = [];
  const outOfBoundsIds: string[] = [];

  for (const inst of units) {
    const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
    if (!ut) {
      issues.push({
        id: `imp-missing-ut-${inst.id}`,
        severity: 'CRITICO',
        code: 'INCOMPLETE_FIELDS',
        title: `Unidade ${inst.unitNumber} sem tipologia vinculada`,
        detail: 'Associe uma tipologia válida a esta unidade ou recrie a implantação.',
        affectedUnitIds: [inst.id],
      });
      continue;
    }
    const rect = getUnitWorldRect(inst, ut);
    unitRects.push({ inst, ut, rect });

    const inside =
      rect.x >= bBox.x - 0.02 &&
      rect.y >= bBox.y - 0.02 &&
      rect.x + rect.width <= bBox.x + bBox.width + 0.02 &&
      rect.y + rect.depth <= bBox.y + bBox.depth + 0.02;
    if (!inside) {
      outOfBoundsIds.push(inst.id);
    }
  }

  if (outOfBoundsIds.length > 0) {
    const labels = units
      .filter((u) => outOfBoundsIds.includes(u.id))
      .map((u) => u.unitNumber)
      .join(', ');
    issues.push({
      id: 'imp-out-of-bounds',
      severity: 'CRITICO',
      code: 'OUT_OF_BOUNDS',
      title: 'Edificação fora dos limites do lote ou recuos obrigatórios',
      detail: `Unidade(s) ${labels} ultrapassam os limites do terreno ou a faixa de recuo configurada.`,
      affectedUnitIds: outOfBoundsIds,
    });
  }

  // 3. Overlaps (> 5cm interior overlap; geminated shared edges are 0cm gap -> NEVER flagged)
  const overlapPairs: Array<[UnitInstance, UnitInstance]> = [];
  for (let i = 0; i < unitRects.length; i++) {
    for (let j = i + 1; j < unitRects.length; j++) {
      if (rectsOverlap(unitRects[i].rect, unitRects[j].rect, 0.05)) {
        overlapPairs.push([unitRects[i].inst, unitRects[j].inst]);
      }
    }
  }
  for (const [ua, ub] of overlapPairs) {
    issues.push({
      id: `imp-overlap-${ua.id}-${ub.id}`,
      severity: 'CRITICO',
      code: 'OVERLAP',
      title: `Sobreposição entre unidades ${ua.unitNumber} e ${ub.unitNumber}`,
      detail: `As projeções das kitnets ${ua.unitNumber} e ${ub.unitNumber} se sobrepõem fisicamente.`,
      affectedUnitIds: [ua.id, ub.id],
    });
  }

  // 4. Shared walls & inter-unit gaps
  const { sharedWalls, minMeasuredCorridorM, minMeasuredInterUnitGapM } =
    detectSharedWallsAndGaps(units, project.unitTypes);

  // 4A. Shared wall opening conflicts (window/door facing an adjacent geminated wall)
  for (const sw of sharedWalls) {
    if (sw.conflictingOpenings.length > 0) {
      issues.push({
        id: `imp-sw-opening-${sw.id}`,
        severity: 'ATENCAO',
        code: 'SHARED_WALL_CONFLICT',
        title: `Abertura em parede geminada (${sw.unitANumber} × ${sw.unitBNumber})`,
        detail: `Parede compartilhada de ${sw.lengthM}m possui abertura(s) (${sw.conflictingOpenings.join(', ')}). Em unidades geminadas, paredes cegas devem encostar sem janelas/portas.`,
        affectedUnitIds: [sw.unitAId, sw.unitBId],
      });
    }

    // 4B. Units configured as 'separadas' must NOT touch
    const instA = units.find((u) => u.id === sw.unitAId);
    const instB = units.find((u) => u.id === sw.unitBId);
    const expectsSeparated =
      config?.couplingMode === 'separadas' ||
      instA?.couplingType === 'separada' ||
      instB?.couplingType === 'separada';
    if (expectsSeparated) {
      issues.push({
        id: `imp-improper-touch-${sw.id}`,
        severity: 'CRITICO',
        code: 'SHARED_WALL_CONFLICT',
        title: `Unidades separadas encostadas (${sw.unitANumber} e ${sw.unitBNumber})`,
        detail: `A configuração exige afastamento entre estas kitnets, mas elas estão com parede compartilhada (0,00 m).`,
        affectedUnitIds: [sw.unitAId, sw.unitBId],
      });
    }
  }

  // 4C. Geminated expectation check when >= 2 units exist
  if (
    config?.couplingMode === 'geminadas' &&
    unitRects.length >= 2 &&
    sharedWalls.length === 0
  ) {
    issues.push({
      id: 'imp-geminada-no-touch',
      severity: 'ATENCAO',
      code: 'SPACING_MISMATCH',
      title: 'Modo geminado selecionado sem paredes compartilhadas',
      detail: 'Nenhuma unidade está encostada com parede compartilhada no pavimento atual.',
      affectedUnitIds: [],
    });
  }

  // 4D. Spacing check when 'separadas'
  if (config?.couplingMode === 'separadas' && config.interUnitSpacingM > 0 && unitRects.length >= 2) {
    const reqGap = config.interUnitSpacingM;
    for (let i = 0; i < unitRects.length; i++) {
      for (let j = i + 1; j < unitRects.length; j++) {
        const ra = unitRects[i].rect;
        const rb = unitRects[j].rect;
        const yOverlap = Math.min(ra.y + ra.depth, rb.y + rb.depth) - Math.max(ra.y, rb.y);
        const xOverlap = Math.min(ra.x + ra.width, rb.x + rb.width) - Math.max(ra.x, rb.x);
        if (yOverlap > 0.35) {
          const gapX =
            ra.x + ra.width < rb.x
              ? rb.x - (ra.x + ra.width)
              : rb.x + rb.width < ra.x
                ? ra.x - (rb.x + rb.width)
                : null;
          if (gapX !== null && gapX > 0.04 && gapX + 0.02 < reqGap) {
            issues.push({
              id: `imp-gap-x-${unitRects[i].inst.id}-${unitRects[j].inst.id}`,
              severity: 'CRITICO',
              code: 'SPACING_MISMATCH',
              title: `Afastamento insuficiente entre ${unitRects[i].inst.unitNumber} e ${unitRects[j].inst.unitNumber}`,
              detail: `Afastamento medido (${round2(gapX)} m) é inferior ao mínimo configurado (${reqGap.toFixed(2)} m).`,
              affectedUnitIds: [unitRects[i].inst.id, unitRects[j].inst.id],
            });
          }
        }
        if (xOverlap > 0.35) {
          const gapY =
            ra.y + ra.depth < rb.y
              ? rb.y - (ra.y + ra.depth)
              : rb.y + rb.depth < ra.y
                ? ra.y - (rb.y + rb.depth)
                : null;
          if (gapY !== null && gapY > 0.04 && gapY + 0.02 < reqGap) {
            issues.push({
              id: `imp-gap-y-${unitRects[i].inst.id}-${unitRects[j].inst.id}`,
              severity: 'CRITICO',
              code: 'SPACING_MISMATCH',
              title: `Afastamento insuficiente entre ${unitRects[i].inst.unitNumber} e ${unitRects[j].inst.unitNumber}`,
              detail: `Afastamento medido (${round2(gapY)} m) é inferior ao mínimo configurado (${reqGap.toFixed(2)} m).`,
              affectedUnitIds: [unitRects[i].inst.id, unitRects[j].inst.id],
            });
          }
        }
      }
    }
  }

  // 5. Corridor conflict check
  const reqCorridor = Math.max(
    config?.circulation.corridorWidthM ?? 0,
    floor?.corridorWidth ?? 1.2,
    project.accessibilityConfig.minCorridorWidthM ?? 1.2,
  );
  if (minMeasuredCorridorM !== null && minMeasuredCorridorM + 0.02 < reqCorridor) {
    issues.push({
      id: 'imp-corridor-narrow',
      severity: 'CRITICO',
      code: 'CORRIDOR_CONFLICT',
      title: `Corredor / circulação inferior ao mínimo (${minMeasuredCorridorM.toFixed(2)} m)`,
      detail: `O vão de circulação medido (${minMeasuredCorridorM.toFixed(2)} m) é menor que o corredor configurado (${reqCorridor.toFixed(2)} m).`,
      affectedUnitIds: [],
    });
  }

  // 6. Count divergence check
  const targetUnits = config?.totalUnitsTarget ?? 0;
  if (config && targetUnits > 0 && units.length !== targetUnits) {
    issues.push({
      id: 'imp-count-divergence',
      severity: 'ATENCAO',
      code: 'COUNT_DIVERGENCE',
      title: `Quantidade implantada (${units.length}) diverge da solicitada (${targetUnits})`,
      detail: `Foram configuradas ${targetUnits} kitnet(s), mas há ${units.length} unidade(s) posicionada(s) no ${floor?.name ?? 'pavimento'}. Clique em "Aplicar / Atualizar Implantação" ou ajuste manualmente.`,
      affectedUnitIds: [],
    });
  }

  // 7. Gate / access clearance check
  const enabledGates = site.accesses.filter((g) => g.enabled);
  if (units.length > 0 && enabledGates.length === 0) {
    issues.push({
      id: 'imp-no-gate',
      severity: 'ATENCAO',
      code: 'BLOCKED_ACCESS',
      title: 'Nenhum portão de acesso habilitado no terreno',
      detail: 'Habilite ao menos um acesso de pedestre ou veículo na Etapa 1 para garantir circulação ao lote.',
      affectedUnitIds: [],
    });
  } else {
    for (const gate of enabledGates) {
      const gw = getGateWorldPosition(site, gate);
      if (!gw) continue;
      const gBox: Rect2D = {
        x: Math.min(gw.p1.x, gw.p2.x) + (gw.inwardNormal.x > 0 ? 0.05 : gw.inwardNormal.x < 0 ? -1.0 : 0.05),
        y: Math.min(gw.p1.y, gw.p2.y) + (gw.inwardNormal.y > 0 ? 0.05 : gw.inwardNormal.y < 0 ? -1.0 : 0.05),
        width:
          gw.inwardNormal.x !== 0
            ? 0.95
            : Math.max(0.4, Math.abs(gw.p2.x - gw.p1.x) - 0.1),
        depth:
          gw.inwardNormal.y !== 0
            ? 0.95
            : Math.max(0.4, Math.abs(gw.p2.y - gw.p1.y) - 0.1),
      };
      const blockingIds = unitRects
        .filter((ur) => rectsOverlap(ur.rect, gBox, 0.02))
        .map((ur) => ur.inst.id);
      if (blockingIds.length > 0) {
        issues.push({
          id: `imp-blocked-gate-${gate.id}`,
          severity: 'CRITICO',
          code: 'BLOCKED_ACCESS',
          title: `Acesso "${gate.label}" bloqueado por unidade`,
          detail: `Há edificação implantada diretamente na faixa de entrada do portão (${gate.label}), impedindo o acesso.`,
          affectedUnitIds: blockingIds,
        });
      }
    }
  }

  // Real measured setbacks & footprint
  const footprintAreaM2 = round2(
    unitRects.reduce((sum, u) => sum + u.rect.width * u.rect.depth, 0),
  );
  const uncoveredAreaM2 = round2(Math.max(0, lotAreaM2 - footprintAreaM2));
  const occupancyRatePercent = round2((footprintAreaM2 / Math.max(1, lotAreaM2)) * 100);

  let realSetbacksMeasured: ImplantationValidationReport['metrics']['realSetbacksMeasured'] = {
    front: null,
    back: null,
    left: null,
    right: null,
  };
  if (unitRects.length > 0) {
    const uMinX = Math.min(...unitRects.map((u) => u.rect.x));
    const uMaxX = Math.max(...unitRects.map((u) => u.rect.x + u.rect.width));
    const uMinY = Math.min(...unitRects.map((u) => u.rect.y));
    const uMaxY = Math.max(...unitRects.map((u) => u.rect.y + u.rect.depth));

    if (site.streetSide === 'baixo') {
      realSetbacksMeasured = {
        front: round2(bbox.maxY - uMaxY),
        back: round2(uMinY - bbox.minY),
        left: round2(uMinX - bbox.minX),
        right: round2(bbox.maxX - uMaxX),
      };
    } else if (site.streetSide === 'cima') {
      realSetbacksMeasured = {
        front: round2(uMinY - bbox.minY),
        back: round2(bbox.maxY - uMaxY),
        left: round2(bbox.maxX - uMaxX),
        right: round2(uMinX - bbox.minX),
      };
    } else if (site.streetSide === 'esquerda') {
      realSetbacksMeasured = {
        front: round2(uMinX - bbox.minX),
        back: round2(bbox.maxX - uMaxX),
        left: round2(uMinY - bbox.minY),
        right: round2(bbox.maxY - uMaxY),
      };
    } else {
      realSetbacksMeasured = {
        front: round2(bbox.maxX - uMaxX),
        back: round2(uMinX - bbox.minX),
        left: round2(bbox.maxY - uMaxY),
        right: round2(uMinY - bbox.minY),
      };
    }
  }

  // Honest municipal rules message
  const validRules = project.urbanRules.filter(
    (r) => r.parameterLimit !== null && r.lawReference?.trim().length > 0,
  );
  let municipalValidationNote =
    'Validação estritamente física/geométrica (limites do lote, recuos informados, afastamentos e acessos). Não há parâmetros legais municipais cadastrados — não implica aprovação urbanística municipal.';

  if (validRules.length > 0) {
    const toRule = validRules.find((r) => r.parameterKey === 'taxa_ocupacao');
    if (toRule && toRule.parameterLimit !== null && occupancyRatePercent > toRule.parameterLimit) {
      issues.push({
        id: 'imp-rule-to',
        severity: 'ATENCAO',
        code: 'OUT_OF_BOUNDS',
        title: `Taxa de ocupação (${occupancyRatePercent}%) excede regra cadastrada (${toRule.parameterLimit}%)`,
        detail: `Referência informada: ${toRule.lawReference}.`,
        affectedUnitIds: [],
      });
    }
    municipalValidationNote = `Conferência física executada + ${validRules.length} parâmetro(s) urbanístico(s) informado(s) pelo usuário (${project.municipality || 'Município'}). Validação legal definitiva cabe ao Responsável Técnico.`;
  }

  const criticalCount = issues.filter((i) => i.severity === 'CRITICO').length;
  const warningCount = issues.filter((i) => i.severity === 'ATENCAO').length;

  void getObserverVectors;

  return {
    isValid: criticalCount === 0,
    criticalCount,
    warningCount,
    issues,
    sharedWalls,
    metrics: {
      lotAreaM2,
      buildableAreaM2: bBox.area,
      footprintAreaM2,
      uncoveredAreaM2,
      occupancyRatePercent,
      totalUnitsPlaced: units.length,
      targetUnits,
      sharedWallsCount: sharedWalls.length,
      minMeasuredCorridorM,
      minMeasuredInterUnitGapM,
      realSetbacksMeasured,
    },
    municipalValidationNote,
  };
}

/**
 * Recalculates sequential levelIndex, floor name, and cumulative elevation for all floors.
 */
export function recalculateFloorElevations(floors: Floor[]): Floor[] {
  let elev = 0;
  return floors.map((fl, idx) => {
    const updated: Floor = {
      ...fl,
      levelIndex: idx,
      name: idx === 0 ? 'Térreo' : `${idx}º Pavimento`,
      elevation: round2(elev),
    };
    elev += fl.floorToFloorHeight || 2.95;
    return updated;
  });
}

/**
 * Clones unit instances onto a target floor with unique IDs and floor-prefixed unit numbers (201, 202, 301...).
 */
export function cloneFloorUnitsToTargetFloor(
  sourceUnits: UnitInstance[],
  targetFloor: Floor,
): UnitInstance[] {
  const stamp = Date.now().toString(36).slice(-4);
  return sourceUnits.map((u, idx) => ({
    ...u,
    id: `inst-${targetFloor.levelIndex + 1}-${idx + 1}-${stamp}-${Math.random().toString(36).slice(2, 5)}`,
    floorId: targetFloor.id,
    unitNumber: `${targetFloor.levelIndex + 1}${String(idx + 1).padStart(2, '0')}`,
  }));
}

/**
 * Scales project.floors cleanly to targetCount (1..20).
 * When adding floors, replicates ground-floor units if replicateGroundFloor=true and ground floor has units.
 */
export function setProjectFloorCount(
  project: Project,
  targetCount: number,
  replicateGroundFloor = true,
): Project {
  const clamped = Math.max(1, Math.min(20, Math.round(targetCount || 1)));
  const current = project.floors.length;
  if (clamped === current) return project;

  let nextFloors = [...project.floors];
  const ground = nextFloors[0];

  if (clamped < current) {
    nextFloors = nextFloors.slice(0, clamped);
  } else {
    for (let idx = current; idx < clamped; idx++) {
      const flId = `fl-${idx}-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2, 5)}`;
      const baseHeight = ground?.floorToFloorHeight ?? 2.95;
      const draftFloor: Floor = {
        id: flId,
        levelIndex: idx,
        name: `${idx}º Pavimento`,
        elevation: 0,
        floorToFloorHeight: baseHeight,
        slabThickness: ground?.slabThickness ?? 0.15,
        corridorWidth: ground?.corridorWidth ?? 1.5,
        commonAreaM2: ground?.commonAreaM2 ?? 0,
        units: [],
        extraWalls: [],
        extraOpenings: [],
      };
      if (replicateGroundFloor && ground && ground.units.length > 0) {
        draftFloor.units = cloneFloorUnitsToTargetFloor(ground.units, draftFloor);
      }
      nextFloors.push(draftFloor);
    }
  }

  return {
    ...project,
    floors: recalculateFloorElevations(nextFloors),
  };
}

/**
 * Copies ground floor (Térreo) unit layout and circulation onto all upper floors (1º Pavimento, 2º Pavimento...).
 */
export function replicateGroundFloorToAllFloors(project: Project): Project {
  if (project.floors.length <= 1) return project;
  const ground = project.floors[0];
  if (!ground) return project;

  const updated = project.floors.map((fl, idx) => {
    if (idx === 0) return fl;
    return {
      ...fl,
      corridorWidth: ground.corridorWidth,
      commonAreaM2: ground.commonAreaM2,
      units: cloneFloorUnitsToTargetFloor(ground.units, fl),
    };
  });

  return {
    ...project,
    floors: recalculateFloorElevations(updated),
  };
}

/**
 * Updates an existing UnitType in place (preserving its id so all implanted floor units
 * stay linked and update across 2D, 3D, MEP, and quantities).
 */
export function updateUnitTypeInProject(
  project: Project,
  updatedUt: UnitType,
): Project {
  const exists = project.unitTypes.some((u) => u.id === updatedUt.id);
  const nextUnitTypes = exists
    ? project.unitTypes.map((u) => (u.id === updatedUt.id ? updatedUt : u))
    : [...project.unitTypes, updatedUt];

  const baseCfg = project.implantation ?? createDefaultImplantationConfig(project);
  return {
    ...project,
    unitTypes: nextUnitTypes,
    implantation: {
      ...baseCfg,
      primaryUnitTypeId: baseCfg.primaryUnitTypeId || updatedUt.id,
    },
  };
}

/**
 * Removes a UnitType and cleans up any floor instances and implantation references
 * pointing to it so no broken references remain.
 */
export function deleteUnitTypeFromProject(
  project: Project,
  unitTypeId: string,
): Project {
  const nextUnitTypes = project.unitTypes.filter((u) => u.id !== unitTypeId);
  const fallbackUtId = nextUnitTypes[0]?.id;

  const nextFloors = project.floors.map((fl) => ({
    ...fl,
    units: fl.units.filter((u) => u.unitTypeId !== unitTypeId),
  }));

  const baseCfg = project.implantation;
  const nextImplantation = baseCfg
    ? {
        ...baseCfg,
        primaryUnitTypeId:
          baseCfg.primaryUnitTypeId === unitTypeId ? fallbackUtId : baseCfg.primaryUnitTypeId,
        groups: baseCfg.groups.map((g) =>
          g.unitTypeId === unitTypeId
            ? { ...g, unitTypeId: fallbackUtId ?? '' }
            : g,
        ),
      }
    : undefined;

  return {
    ...project,
    unitTypes: nextUnitTypes,
    floors: nextFloors,
    ...(nextImplantation ? { implantation: nextImplantation } : {}),
  };
}

export type WorldCardinalSide = 'baixo' | 'cima' | 'esquerda' | 'direita';

/**
 * Computes which world/lot side a unit's entrance (P1) faces given its local entrySide,
 * rotationDeg, and mirrored state (ESP).
 */
export function getEffectiveWorldEntrySide(
  entrySide: EntrySide = 'frente',
  rotationDeg = 0,
  mirrored = false,
): WorldCardinalSide {
  // Local unit coords: +Y is down (frente/bottom edge), +X is right, -X is left
  let vx = 0;
  let vy = 1;
  if (entrySide === 'lateral_direita') {
    vx = 1;
    vy = 0;
  } else if (entrySide === 'lateral_esquerda') {
    vx = -1;
    vy = 0;
  }
  if (mirrored) {
    vx = -vx;
  }
  const rad = (rotationDeg * Math.PI) / 180;
  const rx = vx * Math.cos(rad) - vy * Math.sin(rad);
  const ry = vx * Math.sin(rad) + vy * Math.cos(rad);
  if (Math.abs(rx) >= Math.abs(ry)) {
    return rx >= 0 ? 'direita' : 'esquerda';
  }
  return ry >= 0 ? 'baixo' : 'cima';
}

export function formatWorldEntrySideLabel(side: WorldCardinalSide): string {
  switch (side) {
    case 'direita':
      return 'Direita no lote';
    case 'esquerda':
      return 'Esquerda no lote';
    case 'cima':
      return 'Fundos (acima) no lote';
    case 'baixo':
    default:
      return 'Frente (abaixo) no lote';
  }
}

function findMatchingFloorUnitIds(
  project: Project,
  sourceFloorId: string,
  sourceUnitId: string,
  syncAcrossFloors: boolean,
): Set<string> {
  const matched = new Set<string>([sourceUnitId]);
  if (!syncAcrossFloors) return matched;

  const srcFloor = project.floors.find((f) => f.id === sourceFloorId);
  if (!srcFloor) return matched;
  const srcIdx = srcFloor.units.findIndex((u) => u.id === sourceUnitId);
  const srcUnit = srcIdx >= 0 ? srcFloor.units[srcIdx] : undefined;
  if (!srcUnit) return matched;

  const srcSuffix =
    srcUnit.unitNumber.length >= 2 ? srcUnit.unitNumber.slice(1) : srcUnit.unitNumber;

  for (const fl of project.floors) {
    if (fl.id === sourceFloorId) continue;
    const bySuffix = fl.units.find(
      (u) =>
        (u.unitNumber.length >= 2 ? u.unitNumber.slice(1) : u.unitNumber) === srcSuffix,
    );
    if (bySuffix) {
      matched.add(bySuffix.id);
    } else if (srcIdx >= 0 && srcIdx < fl.units.length) {
      matched.add(fl.units[srcIdx].id);
    }
  }
  return matched;
}

/**
 * Updates a UnitInstance on the selected floor and, when syncAcrossFloors=true,
 * propagates the patch (typology, rotation, mirror, coordinates) to the matching
 * unit slot on every other floor.
 */
export function updateFloorUnitInProject(
  project: Project,
  floorId: string,
  unitId: string,
  patch: Partial<Pick<UnitInstance, 'unitTypeId' | 'x' | 'y' | 'rotationDeg' | 'mirrored' | 'entranceOrientation'>>,
  syncAcrossFloors = false,
): Project {
  const matchedIds = findMatchingFloorUnitIds(project, floorId, unitId, syncAcrossFloors);
  return {
    ...project,
    floors: project.floors.map((fl) => ({
      ...fl,
      units: fl.units.map((u) => (matchedIds.has(u.id) ? { ...u, ...patch } : u)),
    })),
  };
}

/**
 * Customizes a unit slot's dimensions and/or entrance orientation cleanly:
 * - Updates the existing UnitType in place when no other unrelated unit slot uses it
 *   (avoiding stacked suffixes like TIPO-A-101-101).
 * - Clones a per-slot UnitType when other slots still share the base typology, preserving
 *   mepProfile, finishStandard, and mezzanine parameters.
 * - Optionally propagates the change to matching unit slots across all floors.
 */
export function customizeUnitTypeForSlot(
  project: Project,
  floorId: string,
  unitId: string,
  params: {
    width?: number;
    depth?: number;
    entrySide: EntrySide;
  },
  syncAcrossFloors = true,
): { project: Project; unitType: UnitType } | null {
  const floor = project.floors.find((f) => f.id === floorId);
  const inst = floor?.units.find((u) => u.id === unitId);
  const baseUt = inst ? project.unitTypes.find((t) => t.id === inst.unitTypeId) : undefined;
  if (!floor || !inst || !baseUt) return null;

  const matchedIds = findMatchingFloorUnitIds(project, floorId, unitId, syncAcrossFloors);
  const usedByOtherSlots = project.floors.some((fl) =>
    fl.units.some((u) => !matchedIds.has(u.id) && u.unitTypeId === baseUt.id),
  );

  const customSuffix = `-${inst.unitNumber}`;
  const cleanCode = usedByOtherSlots
    ? baseUt.code.endsWith(customSuffix)
      ? baseUt.code
      : `${baseUt.code}${customSuffix}`
    : baseUt.code;
  const cleanName = usedByOtherSlots
    ? baseUt.name.includes(`Unid. ${inst.unitNumber}`)
      ? baseUt.name
      : `${baseUt.name} (Unid. ${inst.unitNumber})`
    : baseUt.name;

  const nextUt = generateParametricUnitLayout({
    ...(usedByOtherSlots ? {} : { id: baseUt.id }),
    code: cleanCode,
    name: cleanName,
    width: Math.max(2.8, round2(params.width ?? baseUt.width)),
    depth: Math.max(3.6, round2(params.depth ?? baseUt.depth)),
    ceilingHeight: baseUt.ceilingHeight,
    bedrooms: baseUt.bedrooms,
    hasLaundry: baseUt.hasLaundry,
    hasBalcony: baseUt.hasBalcony,
    hasMezzanine: baseUt.hasMezzanine,
    accessible: baseUt.accessible,
    extWallThickness: project.constructionMethod.externalWallThickness,
    intWallThickness:
      baseUt.internalPartitionType === 'drywall'
        ? 0.095
        : project.constructionMethod.internalWallThickness,
    constructionSystem: project.constructionMethod.methodId,
    entrySide: params.entrySide,
    internalPartitionType: baseUt.internalPartitionType ?? 'alvenaria',
    mepProfile: baseUt.mepProfile ?? 'simples',
    finishStandard: baseUt.finishStandard,
    mezzanineZone: baseUt.mezzanine?.zone,
    mezzanineElevationM: baseUt.mezzanine?.elevationM,
    mezzanineSizingMode: baseUt.mezzanine?.sizingMode,
    mezzanineCoverageRatio: baseUt.mezzanine?.coverageRatio,
    mezzanineCustomWidthM: baseUt.mezzanine?.customWidthM,
    mezzanineCustomDepthM: baseUt.mezzanine?.customDepthM,
    mezzanineUsage: baseUt.mezzanine?.usage,
    mezzanineStructureType: baseUt.mezzanine?.structureType,
    mezzanineStairLayout: baseUt.mezzanine?.stairLayout,
    mezzanineStairSide: baseUt.mezzanine?.stairSide,
  });

  const nextUnitTypes = usedByOtherSlots
    ? [...project.unitTypes, nextUt]
    : project.unitTypes.map((t) => (t.id === baseUt.id ? nextUt : t));

  const nextFloors = project.floors.map((fl) => ({
    ...fl,
    units: fl.units.map((u) =>
      matchedIds.has(u.id)
        ? { ...u, unitTypeId: nextUt.id, entranceOrientation: params.entrySide }
        : u,
    ),
  }));

  return {
    project: {
      ...project,
      unitTypes: nextUnitTypes,
      floors: nextFloors,
    },
    unitType: nextUt,
  };
}
