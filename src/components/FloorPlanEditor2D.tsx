import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Copy,
  Droplets,
  Eye,
  FlipHorizontal2,
  Grid3X3,
  Layers,
  LayoutGrid,
  Magnet,
  Maximize2,
  Minus,
  MousePointer2,
  Move,
  PenTool,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Ruler,
  Trash2,
  Undo2,
  Waves,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  analyzeSiteGeometry,
  clampOpeningOffsetToWall,
  distance2D,
  findBestHostWallForOpening,
  getBoundingBox,
  getOpeningWorldPosition,
  getRoomArea,
  getWallAngleRad,
  getWallLength,
  round2,
  round3,
} from '../engine/geometry';
import { runCompatibilityAnalysis } from '../engine/engineering';
import {
  customizeUnitTypeForSlot,
  formatWorldEntrySideLabel,
  getEffectiveWorldEntrySide,
  replicateGroundFloorToAllFloors,
  setProjectFloorCount,
  updateFloorUnitInProject,
} from '../engine/implantation';
import { computeElectricalRouting, computeHydraulicRouting } from '../engine/mepRouting';
import { nextId } from '../engine/parametricGenerator';
import { ElectricalSymbolSvg, FurnitureCadBlock } from './CadArchitecturalSymbols';
import type {
  DrainagePoint,
  ElectricalCategory,
  ElectricalPoint,
  EntrySide,
  FurnitureCategory,
  FurnitureItem,
  Opening,
  OpeningKind,
  OpeningRole,
  Point2D,
  Project,
  Room,
  UnitType,
  Wall,
  WaterPoint,
} from '../types/project';

interface FloorPlanEditor2DProps {
  project: Project;
  selectedUnitTypeId: string;
  onSelectUnitType: (id: string) => void;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onOpenImplantation?: () => void;
}

type ToolMode =
  | 'select'
  | 'wall'
  | 'door'
  | 'window'
  | 'vitro'
  | 'furniture'
  | 'electrical'
  | 'water'
  | 'drainage'
  | 'measure';
type ScopeMode = 'tipologia' | 'pavimento';

const FIXED_DOOR_WIDTHS: Partial<Record<OpeningRole, number>> = {
  entrada: 0.8,
  banheiro: 0.6,
  quarto: 0.7,
};

type SelectedElement =
  | { kind: 'wall'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'furniture'; id: string }
  | { kind: 'electrical'; id: string }
  | { kind: 'water'; id: string }
  | { kind: 'drainage'; id: string }
  | { kind: 'room'; id: string }
  | { kind: 'unit_instance'; id: string; floorId: string }
  | null;

const FURNITURE_CATALOG: Array<{
  category: FurnitureCategory;
  name: string;
  w: number;
  d: number;
  h: number;
  pwr?: boolean;
  water?: boolean;
  drain?: boolean;
}> = [
  { category: 'cama', name: 'Cama Casal', w: 1.4, d: 1.9, h: 0.52 },
  { category: 'cama', name: 'Cama Solteiro', w: 0.9, d: 1.9, h: 0.52 },
  { category: 'mesa_cabeceira', name: 'Mesa de Cabeceira', w: 0.42, d: 0.38, h: 0.52 },
  { category: 'guarda_roupa', name: 'Guarda-Roupa', w: 1.2, d: 0.55, h: 2.1 },
  { category: 'rack_tv', name: 'Rack / Painel TV', w: 1.2, d: 0.36, h: 0.55 },
  { category: 'tv', name: 'Smart TV 43"', w: 0.98, d: 0.08, h: 0.58, pwr: true },
  { category: 'sofa', name: 'Sofá 2 Lugares', w: 1.5, d: 0.8, h: 0.82 },
  { category: 'mesa', name: 'Mesa / Escrivaninha', w: 1.1, d: 0.6, h: 0.75 },
  { category: 'cadeira', name: 'Cadeira', w: 0.48, d: 0.48, h: 0.85 },
  { category: 'bancada', name: 'Bancada Cozinha', w: 1.4, d: 0.6, h: 0.9, water: true, drain: true },
  { category: 'geladeira', name: 'Geladeira', w: 0.62, d: 0.65, h: 1.75, pwr: true },
  { category: 'fogao', name: 'Fogão 4 Bocas', w: 0.55, d: 0.6, h: 0.88, pwr: true },
  { category: 'cooktop', name: 'Cooktop 2 Bocas', w: 0.52, d: 0.36, h: 0.08, pwr: true },
  { category: 'maquina_lavar', name: 'Máquina de Lavar', w: 0.58, d: 0.58, h: 0.88, pwr: true, water: true, drain: true },
  { category: 'box', name: 'Box Chuveiro', w: 0.85, d: 0.85, h: 1.9, water: true, drain: true },
  { category: 'chuveiro', name: 'Chuveiro / Misturador', w: 0.25, d: 0.25, h: 0.2, pwr: true, water: true },
  { category: 'vaso_sanitario', name: 'Vaso Sanitário', w: 0.42, d: 0.65, h: 0.78, water: true, drain: true },
  { category: 'lavatorio', name: 'Lavatório', w: 0.55, d: 0.42, h: 0.85, water: true, drain: true },
  { category: 'espelho', name: 'Espelho BWC', w: 0.5, d: 0.05, h: 0.7 },
];

function findRoomIdAtPoint(
  ut: UnitType,
  x: number,
  y: number,
  preferMezzanine: boolean,
  fallbackId: string,
): string {
  if (preferMezzanine) {
    const mez = ut.rooms.find((r) => r.category === 'mezanino');
    if (mez) return mez.id;
  }
  const hit = ut.rooms.find(
    (r) =>
      r.category !== 'mezanino' &&
      x >= r.x - 0.02 &&
      x <= r.x + r.width + 0.02 &&
      y >= r.y - 0.02 &&
      y <= r.y + r.depth + 0.02,
  );
  return hit?.id ?? fallbackId;
}

export const FloorPlanEditor2D: React.FC<FloorPlanEditor2DProps> = ({
  project,
  selectedUnitTypeId,
  onSelectUnitType,
  onUpdateProject,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenImplantation,
}) => {
  const [scope, setScope] = useState<ScopeMode>('tipologia');
  const [planViewMode, setPlanViewMode] = useState<'geral' | 'por_comodo'>('geral');
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>('todos');
  const [mezzanineViewLayer, setMezzanineViewLayer] = useState<'lado_a_lado' | 'terreo' | 'mezanino'>('lado_a_lado');
  const [selectedFloorId, setSelectedFloorId] = useState<string>(project.floors[0]?.id ?? '');
  const [syncFloors, setSyncFloors] = useState<boolean>(true);
  const [tool, setTool] = useState<ToolMode>('select');
  const [doorRolePreset, setDoorRolePreset] = useState<OpeningRole>('outro');
  const [furniturePresetIdx, setFurniturePresetIdx] = useState(0);
  const [selected, setSelected] = useState<SelectedElement>(null);

  // CAD viewport state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point2D>({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapStep, setSnapStep] = useState(0.05);
  const [layers, setLayers] = useState({
    walls: true,
    openings: true,
    rooms: true,
    furniture: true,
    dimensions: true,
    electrical: true,
    water: true,
    drainage: true,
    structure: true,
  });

  // Drawing / dragging temporary states
  const [draftStart, setDraftStart] = useState<Point2D | null>(null);
  const [cursorWorld, setCursorWorld] = useState<Point2D | null>(null);
  const [lastMeasuredDist, setLastMeasuredDist] = useState<number | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panOrigin, setPanOrigin] = useState<Point2D>({ x: 0, y: 0 });
  const [draggingItem, setDraggingItem] = useState<
    | { kind: 'furniture'; id: string; offsetX: number; offsetY: number; planOffsetX?: number; planOffsetY?: number }
    | { kind: 'electrical'; id: string; offsetX: number; offsetY: number; planOffsetX?: number; planOffsetY?: number; isMezzanine?: boolean }
    | { kind: 'water'; id: string; offsetX: number; offsetY: number; planOffsetX?: number; planOffsetY?: number }
    | { kind: 'drainage'; id: string; offsetX: number; offsetY: number; planOffsetX?: number; planOffsetY?: number }
    | { kind: 'unit_instance'; id: string; offsetX: number; offsetY: number }
    | {
        kind: 'wall_body';
        id: string;
        originPt: Point2D;
        origStart: Point2D;
        origEnd: Point2D;
      }
    | { kind: 'wall_start'; id: string }
    | { kind: 'wall_end'; id: string }
    | { kind: 'opening'; id: string; planOffsetX?: number; planOffsetY?: number }
    | null
  >(null);

  const svgRef = useRef<SVGSVGElement>(null);

  const activeUt =
    project.unitTypes.find((t) => t.id === selectedUnitTypeId) ?? project.unitTypes[0];
  const activeFloor =
    project.floors.find((f) => f.id === selectedFloorId) ?? project.floors[0];

  const activeUtHasMez = Boolean(
    activeUt?.hasMezzanine && activeUt?.mezzanine?.enabled && (activeUt?.ceilingHeight ?? 0) >= 3.0,
  );
  const mezPlanGapM = 1.6;
  const mezSideOffsetX = activeUt ? round2(activeUt.width + mezPlanGapM) : 0;
  const isSideBySideMez =
    scope === 'tipologia' && planViewMode === 'geral' && activeUtHasMez && mezzanineViewLayer === 'lado_a_lado';

  // Separate room-by-room floor plan slots
  const roomSlots = useMemo(() => {
    if (scope !== 'tipologia' || !activeUt || planViewMode !== 'por_comodo') return [];
    const targetRooms =
      selectedRoomFilter === 'todos'
        ? activeUt.rooms
        : activeUt.rooms.filter((r) => r.id === selectedRoomFilter);
    if (targetRooms.length === 0) return [];
    const cols = targetRooms.length <= 1 ? 1 : targetRooms.length <= 4 ? 2 : 3;
    const colWidths: number[] = Array(cols).fill(0);
    const rowHeights: number[] = [];
    targetRooms.forEach((rm, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      colWidths[col] = Math.max(colWidths[col], rm.width + 1.1);
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, rm.depth + 1.35);
    });
    const colOffsets: number[] = [0];
    for (let c = 1; c < cols; c++) {
      colOffsets[c] = round2(colOffsets[c - 1] + colWidths[c - 1] + 0.9);
    }
    const rowOffsets: number[] = [0];
    for (let r = 1; r < rowHeights.length; r++) {
      rowOffsets[r] = round2(rowOffsets[r - 1] + rowHeights[r - 1] + 1.1);
    }
    return targetRooms.map((rm, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      return {
        room: rm,
        slotX: colOffsets[col],
        slotY: rowOffsets[row],
        offsetX: round2(colOffsets[col] - rm.x),
        offsetY: round2(rowOffsets[row] - rm.y),
        totalW: round2(colOffsets[cols - 1] + colWidths[cols - 1]),
        totalH: round2(rowOffsets[rowHeights.length - 1] + rowHeights[rowHeights.length - 1]),
      };
    });
  }, [scope, activeUt, planViewMode, selectedRoomFilter]);

  const clashes = useMemo(() => runCompatibilityAnalysis(project), [project]);
  const criticalCount = clashes.filter((c) => c.severity === 'CRITICO').length;

  // Compute SVG viewBox
  const baseBox = useMemo(() => {
    if (scope === 'tipologia' && activeUt) {
      if (planViewMode === 'por_comodo' && roomSlots.length > 0) {
        const last = roomSlots[roomSlots.length - 1];
        return {
          minX: -1.1,
          minY: -1.35,
          width: Math.max(4.6, last.totalW + 1.4),
          height: Math.max(4.0, last.totalH + 1.4),
        };
      }
      if (isSideBySideMez) {
        return {
          minX: -1.4,
          minY: -1.9,
          width: activeUt.width * 2 + mezPlanGapM + 2.8,
          height: activeUt.depth + 3.4,
        };
      }
      return {
        minX: -1.4,
        minY: -1.7,
        width: activeUt.width + 2.8,
        height: activeUt.depth + 3.1,
      };
    }
    const bbox = getBoundingBox(project.site.vertices);
    return {
      minX: bbox.minX - 2.2,
      minY: bbox.minY - 2.2,
      width: Math.max(12, bbox.width + 4.4),
      height: Math.max(12, bbox.depth + 4.4),
    };
  }, [scope, activeUt, planViewMode, roomSlots, isSideBySideMez, project.site.vertices]);

  const viewW = baseBox.width / zoom;
  const viewH = baseBox.height / zoom;
  const viewX = baseBox.minX + pan.x;
  const viewY = baseBox.minY + pan.y;

  const snapVal = (v: number) =>
    snapEnabled ? round3(Math.round(v / snapStep) * snapStep) : round3(v);

  const clientToWorld = (clientX: number, clientY: number): Point2D => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    // Preserve aspect ratio centering inside SVG
    const svgAspect = rect.width / Math.max(1, rect.height);
    const vbAspect = viewW / Math.max(0.001, viewH);
    let drawW = viewW;
    let drawH = viewH;
    let offX = viewX;
    let offY = viewY;
    if (svgAspect > vbAspect) {
      drawW = viewH * svgAspect;
      offX = viewX - (drawW - viewW) / 2;
    } else {
      drawH = viewW / svgAspect;
      offY = viewY - (drawH - viewH) / 2;
    }
    const wx = ((clientX - rect.left) / rect.width) * drawW + offX;
    const wy = ((clientY - rect.top) / rect.height) * drawH + offY;
    return { x: snapVal(wx), y: snapVal(wy) };
  };

  const resolveUnitLocalPoint = (worldPt: Point2D): { localPt: Point2D; slotOffsetX: number; slotOffsetY: number } => {
    if (planViewMode === 'por_comodo' && roomSlots.length > 0) {
      const hitSlot =
        roomSlots.find(
          (s) =>
            worldPt.x >= s.slotX - 0.5 &&
            worldPt.x <= s.slotX + s.room.width + 0.5 &&
            worldPt.y >= s.slotY - 0.5 &&
            worldPt.y <= s.slotY + s.room.depth + 0.5,
        ) ?? roomSlots[0];
      return {
        localPt: {
          x: round2(worldPt.x - hitSlot.offsetX),
          y: round2(worldPt.y - hitSlot.offsetY),
        },
        slotOffsetX: hitSlot.offsetX,
        slotOffsetY: hitSlot.offsetY,
      };
    }
    return { localPt: worldPt, slotOffsetX: 0, slotOffsetY: 0 };
  };

  const updateActiveUt = (fn: (ut: UnitType) => UnitType, note?: string) => {
    if (!activeUt) return;
    onUpdateProject(
      (prev) => ({
        ...prev,
        unitTypes: prev.unitTypes.map((u) => (u.id === activeUt.id ? fn(u) : u)),
      }),
      note,
    );
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setPanOrigin({ x: e.clientX, y: e.clientY });
      return;
    }

    const pt = clientToWorld(e.clientX, e.clientY);

    if (scope === 'tipologia' && activeUt) {
      if (tool === 'wall') {
        if (!draftStart) {
          setDraftStart(pt);
        } else {
          if (distance2D(draftStart, pt) >= 0.2) {
            const newWall: Wall = {
              id: nextId('w'),
              code: `P-${activeUt.walls.length + 1}`,
              start: draftStart,
              end: pt,
              thickness: project.constructionMethod.internalWallThickness,
              height: activeUt.ceilingHeight,
              isExternal: false,
              material: activeUt.walls[0]?.material ?? 'Alvenaria',
              constructionSystem: project.constructionMethod.methodId,
              loadBearing: false,
            };
            updateActiveUt(
              (ut) => ({ ...ut, walls: [...ut.walls, newWall] }),
              `Adição de parede ${newWall.code} em ${activeUt.code}`,
            );
            setSelected({ kind: 'wall', id: newWall.id });
          }
          setDraftStart(null);
        }
        return;
      }

      if (tool === 'door' || tool === 'window' || tool === 'vitro') {
        const { localPt } = resolveUnitLocalPoint(pt);
        const isDoor = tool === 'door';
        const isVitro = tool === 'vitro';
        const role: OpeningRole | undefined = isDoor ? doorRolePreset : undefined;
        const fixedW = role ? FIXED_DOOR_WIDTHS[role] : undefined;
        const defW = isDoor ? (fixedW ?? 0.8) : isVitro ? 0.6 : 1.0;
        const hit = findBestHostWallForOpening(
          localPt,
          activeUt.walls,
          defW,
          undefined,
          0.75,
          snapEnabled ? snapStep : 0.01,
        );
        if (hit) {
          const newOp: Opening = {
            id: nextId('op'),
            code: `${isDoor ? 'P' : isVitro ? 'V' : 'J'}${activeUt.openings.length + 1}`,
            wallId: hit.wall.id,
            type: isDoor ? 'porta' : 'janela',
            role,
            openingKind: isDoor ? 'porta_abrir' : isVitro ? 'vitro_basculante' : 'janela_correr',
            subtype: isDoor
              ? role === 'entrada'
                ? 'Porta de entrada social 80x210cm'
                : role === 'banheiro'
                  ? 'Porta de banheiro 60x210cm'
                  : role === 'quarto'
                    ? 'Porta de quarto 70x210cm'
                    : 'Porta interna de abrir'
              : isVitro
                ? 'Vitrô basculante alumínio'
                : 'Janela de correr',
            offsetAlongWall: hit.offsetAlongWall,
            width: defW,
            height: isDoor ? 2.1 : isVitro ? 0.6 : 1.1,
            sillHeight: isDoor ? 0 : isVitro ? 1.6 : 1.0,
            thickness: 0.04,
            swingDirection: isDoor ? 'left_in' : 'sliding',
            material: isDoor ? 'Madeira' : 'Alumínio + vidro',
          };
          updateActiveUt(
            (ut) => ({ ...ut, openings: [...ut.openings, newOp] }),
            `Inserção de ${newOp.code} na parede ${hit.wall.code}`,
          );
          setLayers((prev) => ({ ...prev, openings: true }));
          setSelected({ kind: 'opening', id: newOp.id });
          setTool('select');
        }
        return;
      }

      if (tool === 'furniture') {
        const preset = FURNITURE_CATALOG[furniturePresetIdx] ?? FURNITURE_CATALOG[0];
        let localX = pt.x;
        let localY = pt.y;
        let onMezzaninePlane = activeUtHasMez && mezzanineViewLayer === 'mezanino';
        let targetRoomId = '';

        if (planViewMode === 'por_comodo' && roomSlots.length > 0) {
          const hitSlot =
            roomSlots.find(
              (s) =>
                pt.x >= s.slotX - 0.5 &&
                pt.x <= s.slotX + s.room.width + 0.5 &&
                pt.y >= s.slotY - 0.5 &&
                pt.y <= s.slotY + s.room.depth + 0.5,
            ) ?? roomSlots[0];
          localX = round2(pt.x - hitSlot.offsetX);
          localY = round2(pt.y - hitSlot.offsetY);
          onMezzaninePlane = hitSlot.room.category === 'mezanino';
          targetRoomId = hitSlot.room.id;
        } else {
          const clickedRightMezPlan = isSideBySideMez && pt.x >= mezSideOffsetX - 0.5;
          localX = clickedRightMezPlan ? round2(pt.x - mezSideOffsetX) : pt.x;
          onMezzaninePlane = clickedRightMezPlan || onMezzaninePlane;
          targetRoomId = findRoomIdAtPoint(
            activeUt,
            localX,
            localY,
            onMezzaninePlane,
            activeUt.rooms[0]?.id ?? '',
          );
        }

        const elevationM =
          onMezzaninePlane && activeUt.mezzanine
            ? round2(activeUt.mezzanine.elevationM + activeUt.mezzanine.slabThicknessM)
            : 0;
        const newItem: FurnitureItem = {
          id: nextId('fur'),
          name: preset.name,
          category: preset.category,
          roomId: targetRoomId,
          x: round2(localX - preset.w / 2),
          y: round2(localY - preset.d / 2),
          width: preset.w,
          depth: preset.d,
          height: preset.h,
          elevationM,
          rotationDeg: 0,
          requiresPower: preset.pwr,
          requiresWater: preset.water,
          requiresDrain: preset.drain,
        };
        updateActiveUt(
          (ut) => ({ ...ut, furniture: [...ut.furniture, newItem] }),
          `Inserção de ${newItem.name}${onMezzaninePlane ? ' (Mezanino)' : ''} em ${activeUt.code}`,
        );
        setSelected({ kind: 'furniture', id: newItem.id });
        setTool('select');
        return;
      }

      if (tool === 'electrical' || tool === 'water' || tool === 'drainage') {
        let localX = pt.x;
        let localY = pt.y;
        let onMezzaninePlane = activeUtHasMez && mezzanineViewLayer === 'mezanino';
        let targetRoomId = '';

        if (planViewMode === 'por_comodo' && roomSlots.length > 0) {
          const hitSlot =
            roomSlots.find(
              (s) =>
                pt.x >= s.slotX - 0.5 &&
                pt.x <= s.slotX + s.room.width + 0.5 &&
                pt.y >= s.slotY - 0.5 &&
                pt.y <= s.slotY + s.room.depth + 0.5,
            ) ?? roomSlots[0];
          localX = round2(pt.x - hitSlot.offsetX);
          localY = round2(pt.y - hitSlot.offsetY);
          onMezzaninePlane = hitSlot.room.category === 'mezanino';
          targetRoomId = hitSlot.room.id;
        } else {
          const clickedRightMezPlan = isSideBySideMez && pt.x >= mezSideOffsetX - 0.5;
          localX = clickedRightMezPlan ? round2(pt.x - mezSideOffsetX) : pt.x;
          onMezzaninePlane = clickedRightMezPlan || onMezzaninePlane;
          targetRoomId = findRoomIdAtPoint(
            activeUt,
            localX,
            localY,
            onMezzaninePlane,
            activeUt.rooms[0]?.id ?? '',
          );
        }

        if (tool === 'electrical') {
          const mezElev =
            onMezzaninePlane && activeUt.mezzanine
              ? round2(activeUt.mezzanine.elevationM + activeUt.mezzanine.slabThicknessM + 0.35)
              : project.electricalHeights.tomadaMedia;
          const newEp: ElectricalPoint = {
            id: nextId('el'),
            code: `${onMezzaninePlane ? 'TM-MEZ' : 'TM'}-${activeUt.electricalPoints.length + 1}`,
            category: 'tomada_media',
            label: onMezzaninePlane ? 'Tomada Mezanino (2D)' : 'Tomada Média (2D)',
            roomId: targetRoomId,
            x: round2(localX),
            y: round2(localY),
            z: mezElev,
            referenceWall: 'Manual 2D',
            referenceDistance: round2(localX),
            powerVA: 600,
            voltage: 127,
            powerFactor: 0.9,
            circuitId: 'C2-TUG',
            conductorSectionMm2: 2.5,
            conduitDiameterMm: 20,
            protection: 'Disjuntor 16A',
            notes: '',
          };
          updateActiveUt(
            (ut) => ({ ...ut, electricalPoints: [...ut.electricalPoints, newEp] }),
            `Inserção de ponto elétrico ${newEp.code} no 2D`,
          );
          setLayers((prev) => ({ ...prev, electrical: true }));
          setSelected({ kind: 'electrical', id: newEp.id });
          setTool('select');
          return;
        }

        if (tool === 'water') {
          const newWp: WaterPoint = {
            id: nextId('wp'),
            code: `AF-${activeUt.waterPoints.length + 1}`,
            category: 'pia',
            equipment: 'Ponto Água Fria (2D)',
            roomId: targetRoomId,
            x: round2(localX),
            y: round2(localY),
            z: 0.6,
            waterType: 'fria',
            diameterMm: 20,
            material: project.hydraulicConfig.coldWaterMaterial,
            availablePressureMca: 5.5,
            supplySource: 'Coluna AF-01',
            branchName: 'Ramal Manual',
            weightHunter: 0.5,
            notes: '',
          };
          updateActiveUt(
            (ut) => ({ ...ut, waterPoints: [...ut.waterPoints, newWp] }),
            `Inserção de ponto hidráulico ${newWp.code} no 2D`,
          );
          setLayers((prev) => ({ ...prev, water: true }));
          setSelected({ kind: 'water', id: newWp.id });
          setTool('select');
          return;
        }

        if (tool === 'drainage') {
          const cs = activeUt.drainagePoints.find((d) => d.category === 'caixa_sifonada');
          const tq = activeUt.drainagePoints.find((d) => d.category === 'tubo_queda');
          const newDp: DrainagePoint = {
            id: nextId('dr'),
            code: `ES-${activeUt.drainagePoints.length + 1}`,
            category: 'ralo',
            roomId: targetRoomId,
            x: round2(localX),
            y: round2(localY),
            diameterMm: 40,
            material: 'PVC Esgoto SN',
            slopePercent: 2.0,
            uhc: 1,
            connectedToId: cs?.id ?? tq?.id ?? 'CI-GERAL',
            notes: '',
          };
          updateActiveUt(
            (ut) => ({ ...ut, drainagePoints: [...ut.drainagePoints, newDp] }),
            `Inserção de ponto sanitário ${newDp.code} no 2D`,
          );
          setLayers((prev) => ({ ...prev, drainage: true }));
          setSelected({ kind: 'drainage', id: newDp.id });
          setTool('select');
          return;
        }
      }

      if (tool === 'measure') {
        if (!draftStart) {
          setDraftStart(pt);
        } else {
          const dist = round2(distance2D(draftStart, pt));
          setLastMeasuredDist(dist);
          if (dist >= 0.1) {
            updateActiveUt((ut) => ({
              ...ut,
              dimensions: [
                ...ut.dimensions,
                { id: nextId('dim'), start: draftStart, end: pt, offset: -0.25 },
              ],
            }));
          }
          setDraftStart(null);
        }
        return;
      }

      // Click on empty background deselects
      if (tool === 'select') {
        setSelected(null);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isPanning && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const dx = ((e.clientX - panOrigin.x) / rect.width) * viewW;
      const dy = ((e.clientY - panOrigin.y) / rect.height) * viewH;
      setPan((p) => ({ x: p.x - dx, y: p.y - dy }));
      setPanOrigin({ x: e.clientX, y: e.clientY });
      return;
    }

    const pt = clientToWorld(e.clientX, e.clientY);
    setCursorWorld(pt);

    if (draggingItem) {
      if (draggingItem.kind === 'furniture' && scope === 'tipologia' && activeUt) {
        const localPtX = pt.x - (draggingItem.planOffsetX ?? 0);
        const localPtY = pt.y - (draggingItem.planOffsetY ?? 0);
        const nx = snapVal(localPtX - draggingItem.offsetX);
        const ny = snapVal(localPtY - draggingItem.offsetY);
        updateActiveUt((ut) => ({
          ...ut,
          furniture: ut.furniture.map((f) =>
            f.id === draggingItem.id ? { ...f, x: nx, y: ny } : f,
          ),
        }));
      } else if (draggingItem.kind === 'electrical' && scope === 'tipologia' && activeUt) {
        const localPtX = pt.x - (draggingItem.planOffsetX ?? 0);
        const localPtY = pt.y - (draggingItem.planOffsetY ?? 0);
        const nx = round2(snapVal(localPtX - draggingItem.offsetX));
        const ny = round2(snapVal(localPtY - draggingItem.offsetY));
        updateActiveUt((ut) => ({
          ...ut,
          electricalPoints: ut.electricalPoints.map((ep) =>
            ep.id === draggingItem.id
              ? {
                  ...ep,
                  x: nx,
                  y: ny,
                  roomId: findRoomIdAtPoint(
                    ut,
                    nx,
                    ny,
                    Boolean(draggingItem.isMezzanine),
                    ep.roomId,
                  ),
                }
              : ep,
          ),
        }));
      } else if (draggingItem.kind === 'water' && scope === 'tipologia' && activeUt) {
        const localPtX = pt.x - (draggingItem.planOffsetX ?? 0);
        const localPtY = pt.y - (draggingItem.planOffsetY ?? 0);
        const nx = round2(snapVal(localPtX - draggingItem.offsetX));
        const ny = round2(snapVal(localPtY - draggingItem.offsetY));
        updateActiveUt((ut) => ({
          ...ut,
          waterPoints: ut.waterPoints.map((wp) =>
            wp.id === draggingItem.id
              ? {
                  ...wp,
                  x: nx,
                  y: ny,
                  roomId: findRoomIdAtPoint(ut, nx, ny, false, wp.roomId),
                }
              : wp,
          ),
        }));
      } else if (draggingItem.kind === 'drainage' && scope === 'tipologia' && activeUt) {
        const localPtX = pt.x - (draggingItem.planOffsetX ?? 0);
        const localPtY = pt.y - (draggingItem.planOffsetY ?? 0);
        const nx = round2(snapVal(localPtX - draggingItem.offsetX));
        const ny = round2(snapVal(localPtY - draggingItem.offsetY));
        updateActiveUt((ut) => ({
          ...ut,
          drainagePoints: ut.drainagePoints.map((dp) =>
            dp.id === draggingItem.id
              ? {
                  ...dp,
                  x: nx,
                  y: ny,
                  roomId: findRoomIdAtPoint(ut, nx, ny, false, dp.roomId),
                }
              : dp,
          ),
        }));
      } else if (draggingItem.kind === 'wall_body' && scope === 'tipologia' && activeUt) {
        const dx = snapVal(pt.x - draggingItem.originPt.x);
        const dy = snapVal(pt.y - draggingItem.originPt.y);
        updateActiveUt((ut) => ({
          ...ut,
          walls: ut.walls.map((w) =>
            w.id === draggingItem.id
              ? {
                  ...w,
                  start: {
                    x: round2(draggingItem.origStart.x + dx),
                    y: round2(draggingItem.origStart.y + dy),
                  },
                  end: {
                    x: round2(draggingItem.origEnd.x + dx),
                    y: round2(draggingItem.origEnd.y + dy),
                  },
                }
              : w,
          ),
        }));
      } else if (
        (draggingItem.kind === 'wall_start' || draggingItem.kind === 'wall_end') &&
        scope === 'tipologia' &&
        activeUt
      ) {
        updateActiveUt((ut) => {
          let resizedLen: number | null = null;
          const nextWalls = ut.walls.map((w) => {
            if (w.id !== draggingItem.id) return w;
            const targetPt = { x: round2(pt.x), y: round2(pt.y) };
            const nextStart = draggingItem.kind === 'wall_start' ? targetPt : w.start;
            const nextEnd = draggingItem.kind === 'wall_end' ? targetPt : w.end;
            const len = distance2D(nextStart, nextEnd);
            if (len < 0.25) return w;
            resizedLen = len;
            return { ...w, start: nextStart, end: nextEnd };
          });
          if (resizedLen === null) return ut;
          const finalLen = resizedLen;
          return {
            ...ut,
            walls: nextWalls,
            openings: ut.openings.map((o) =>
              o.wallId === draggingItem.id
                ? {
                    ...o,
                    offsetAlongWall: clampOpeningOffsetToWall(finalLen, o.width, o.offsetAlongWall, 0.01),
                  }
                : o,
            ),
          };
        });
      } else if (draggingItem.kind === 'opening' && scope === 'tipologia' && activeUt) {
        updateActiveUt((ut) => {
          const op = ut.openings.find((o) => o.id === draggingItem.id);
          if (!op) return ut;
          const localPt: Point2D = {
            x: pt.x - (draggingItem.planOffsetX ?? 0),
            y: pt.y - (draggingItem.planOffsetY ?? 0),
          };
          const match = findBestHostWallForOpening(
            localPt,
            ut.walls,
            op.width,
            op.wallId,
            3.5,
            snapEnabled ? snapStep : 0.01,
          );
          if (!match) return ut;
          return {
            ...ut,
            openings: ut.openings.map((o) =>
              o.id === op.id
                ? { ...o, wallId: match.wall.id, offsetAlongWall: match.offsetAlongWall }
                : o,
            ),
          };
        });
      } else if (draggingItem.kind === 'unit_instance' && scope === 'pavimento' && activeFloor) {
        const nx = snapVal(pt.x - draggingItem.offsetX);
        const ny = snapVal(pt.y - draggingItem.offsetY);
        onUpdateProject((prev) =>
          updateFloorUnitInProject(
            prev,
            activeFloor.id,
            draggingItem.id,
            { x: nx, y: ny },
            syncFloors,
          ),
        );
      }
    }
  };

  const handlePointerUp = () => {
    setIsPanning(false);
    setDraggingItem(null);
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.9;
    setZoom((z) => Math.max(0.35, Math.min(6, round2(z * factor))));
  };

  // Element manipulation actions
  const handleRotateSelected = (deltaDeg = 90) => {
    if (!selected) return;
    if (selected.kind === 'furniture' && activeUt) {
      updateActiveUt((ut) => ({
        ...ut,
        furniture: ut.furniture.map((f) =>
          f.id === selected.id
            ? { ...f, rotationDeg: (((f.rotationDeg + deltaDeg) % 360) + 360) % 360 }
            : f,
        ),
      }));
    } else if (selected.kind === 'unit_instance') {
      onUpdateProject((prev) => {
        const fl = prev.floors.find((f) => f.id === selected.floorId);
        const inst = fl?.units.find((u) => u.id === selected.id);
        if (!inst) return prev;
        const nextRot = (((inst.rotationDeg + deltaDeg) % 360) + 360) % 360;
        return updateFloorUnitInProject(
          prev,
          selected.floorId,
          selected.id,
          { rotationDeg: nextRot },
          syncFloors,
        );
      }, 'Rotação de unidade no pavimento');
    }
  };

  const handleSetSelectedFurnitureRotation = (nextDeg: number) => {
    if (!selected || selected.kind !== 'furniture' || !activeUt) return;
    const normalized = (((Math.round(nextDeg) % 360) + 360) % 360);
    updateActiveUt((ut) => ({
      ...ut,
      furniture: ut.furniture.map((f) =>
        f.id === selected.id ? { ...f, rotationDeg: normalized } : f,
      ),
    }));
  };

  // Keyboard shortcuts: R / Shift+R to rotate selected furniture/unit; Delete to remove
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!selected) return;
      if (ev.key === 'r' || ev.key === 'R') {
        if (selected.kind === 'furniture' || selected.kind === 'unit_instance') {
          ev.preventDefault();
          handleRotateSelected(ev.shiftKey ? -90 : 90);
        }
      } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
        if (
          selected.kind === 'furniture' ||
          selected.kind === 'wall' ||
          selected.kind === 'opening' ||
          selected.kind === 'electrical' ||
          selected.kind === 'water' ||
          selected.kind === 'drainage'
        ) {
          ev.preventDefault();
          handleDeleteSelected();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleMirrorSelected = () => {
    if (!selected) return;
    if (selected.kind === 'opening' && activeUt) {
      const nextSwing: Record<Opening['swingDirection'], Opening['swingDirection']> = {
        left_in: 'right_in',
        right_in: 'left_in',
        left_out: 'right_out',
        right_out: 'left_out',
        sliding: 'sliding',
        none: 'none',
      };
      updateActiveUt((ut) => ({
        ...ut,
        openings: ut.openings.map((o) =>
          o.id === selected.id ? { ...o, swingDirection: nextSwing[o.swingDirection] } : o,
        ),
      }));
    } else if (selected.kind === 'unit_instance') {
      onUpdateProject((prev) => {
        const fl = prev.floors.find((f) => f.id === selected.floorId);
        const inst = fl?.units.find((u) => u.id === selected.id);
        if (!inst) return prev;
        return updateFloorUnitInProject(
          prev,
          selected.floorId,
          selected.id,
          { mirrored: !inst.mirrored },
          syncFloors,
        );
      }, 'Espelhamento de unidade no pavimento');
    }
  };

  const handleDuplicateSelected = () => {
    if (!selected || !activeUt) return;
    if (selected.kind === 'furniture') {
      const orig = activeUt.furniture.find((f) => f.id === selected.id);
      if (!orig) return;
      const copy: FurnitureItem = {
        ...orig,
        id: nextId('fur'),
        x: round2(orig.x + 0.4),
        y: round2(orig.y + 0.4),
      };
      updateActiveUt((ut) => ({ ...ut, furniture: [...ut.furniture, copy] }));
      setSelected({ kind: 'furniture', id: copy.id });
    }
  };

  const handleDeleteSelected = () => {
    if (!selected || !activeUt) return;
    if (selected.kind === 'wall') {
      updateActiveUt((ut) => ({
        ...ut,
        walls: ut.walls.filter((w) => w.id !== selected.id),
        openings: ut.openings.filter((o) => o.wallId !== selected.id),
      }));
    } else if (selected.kind === 'opening') {
      updateActiveUt((ut) => ({
        ...ut,
        openings: ut.openings.filter((o) => o.id !== selected.id),
      }));
    } else if (selected.kind === 'furniture') {
      updateActiveUt((ut) => ({
        ...ut,
        furniture: ut.furniture.filter((f) => f.id !== selected.id),
      }));
    } else if (selected.kind === 'electrical') {
      updateActiveUt(
        (ut) => ({
          ...ut,
          electricalPoints: ut.electricalPoints.filter((ep) => ep.id !== selected.id),
        }),
        'Remoção de ponto elétrico no 2D',
      );
    } else if (selected.kind === 'water') {
      updateActiveUt(
        (ut) => ({
          ...ut,
          waterPoints: ut.waterPoints.filter((wp) => wp.id !== selected.id),
        }),
        'Remoção de ponto hidráulico no 2D',
      );
    } else if (selected.kind === 'drainage') {
      updateActiveUt(
        (ut) => ({
          ...ut,
          drainagePoints: ut.drainagePoints.filter((dp) => dp.id !== selected.id),
        }),
        'Remoção de ponto sanitário no 2D',
      );
    }
    setSelected(null);
  };

  // Helper to render one unit vector geometry (or an isolated room's floor plan) inside SVG
  const renderUnitGeometry = (
    ut: UnitType,
    interactive: boolean,
    isMirrored = false,
    forcedLayer?: 'completo' | 'terreo' | 'mezanino',
    planOffsetX = 0,
    planOffsetY = 0,
    roomScope?: Room,
  ) => {
    const mapX = (lx: number) => (isMirrored ? ut.width - lx : lx);
    const hasActiveMez = !!(ut.hasMezzanine && ut.mezzanine?.enabled && ut.ceilingHeight >= 3.0);
    const mezView = roomScope
      ? roomScope.category === 'mezanino'
        ? 'mezanino'
        : 'terreo'
      : forcedLayer
        ? forcedLayer
        : interactive && hasActiveMez
          ? mezzanineViewLayer === 'lado_a_lado'
            ? 'terreo'
            : mezzanineViewLayer
          : 'completo';
    const mezStair = hasActiveMez ? ut.furniture.find((f) => f.category === 'escada') : undefined;
    const isInRoom = (x: number, y: number, itemRoomId?: string) => {
      if (!roomScope) return true;
      if (itemRoomId === roomScope.id) return true;
      return (
        x >= roomScope.x - 0.16 &&
        x <= roomScope.x + roomScope.width + 0.16 &&
        y >= roomScope.y - 0.16 &&
        y <= roomScope.y + roomScope.depth + 0.16
      );
    };
    const wallTouchesRoom = (w: Wall) => {
      if (!roomScope) return true;
      const minWX = Math.min(w.start.x, w.end.x);
      const maxWX = Math.max(w.start.x, w.end.x);
      const minWY = Math.min(w.start.y, w.end.y);
      const maxWY = Math.max(w.start.y, w.end.y);
      return (
        maxWX >= roomScope.x - 0.18 &&
        minWX <= roomScope.x + roomScope.width + 0.18 &&
        maxWY >= roomScope.y - 0.18 &&
        minWY <= roomScope.y + roomScope.depth + 0.18
      );
    };
    const roomClipId = roomScope ? `clip-room-${roomScope.id}` : undefined;

    return (
      <g>
        {roomScope && roomClipId && (
          <defs>
            <clipPath id={roomClipId}>
              <rect
                x={roomScope.x - 0.28}
                y={roomScope.y - 0.28}
                width={roomScope.width + 0.56}
                height={roomScope.depth + 0.56}
              />
            </clipPath>
          </defs>
        )}

        {/* Architectural Plan Title Banner */}
        {interactive && roomScope ? (
          <g pointerEvents="none">
            <rect
              x={roomScope.x - 0.34}
              y={roomScope.y - 0.72}
              width={roomScope.width + 0.68}
              height={roomScope.depth + 1.08}
              rx="0.08"
              fill="rgba(17, 20, 26, 0.55)"
              stroke={roomScope.category === 'mezanino' ? '#0891B2' : '#2A313D'}
              strokeWidth="0.02"
            />
            <text
              x={roomScope.x + roomScope.width / 2}
              y={roomScope.y - 0.48}
              textAnchor="middle"
              fill={roomScope.category === 'mezanino' ? '#22D3EE' : '#F1F5F9'}
              fontSize="0.18"
              fontWeight="bold"
              fontFamily="Plus Jakarta Sans, sans-serif"
            >
              {roomScope.code} — {roomScope.name.toUpperCase()} ({getRoomArea(roomScope)} m²)
            </text>
            {/* Room Width & Depth Dimensions */}
            <line
              x1={roomScope.x}
              y1={roomScope.y - 0.26}
              x2={roomScope.x + roomScope.width}
              y2={roomScope.y - 0.26}
              stroke="#64748B"
              strokeWidth="0.015"
            />
            <text
              x={roomScope.x + roomScope.width / 2}
              y={roomScope.y - 0.3}
              textAnchor="middle"
              fill="#94A3B8"
              fontSize="0.12"
              fontFamily="JetBrains Mono, monospace"
            >
              {roomScope.width.toFixed(2)} m
            </text>
            <line
              x1={roomScope.x - 0.22}
              y1={roomScope.y}
              x2={roomScope.x - 0.22}
              y2={roomScope.y + roomScope.depth}
              stroke="#64748B"
              strokeWidth="0.015"
            />
            <text
              x={roomScope.x - 0.26}
              y={roomScope.y + roomScope.depth / 2}
              textAnchor="middle"
              transform={`rotate(-90 ${roomScope.x - 0.26} ${roomScope.y + roomScope.depth / 2})`}
              fill="#94A3B8"
              fontSize="0.12"
              fontFamily="JetBrains Mono, monospace"
            >
              {roomScope.depth.toFixed(2)} m
            </text>
          </g>
        ) : (
          interactive && (
            <text
              x={ut.width / 2}
              y={-0.88}
              textAnchor="middle"
              fill={mezView === 'mezanino' ? '#22D3EE' : '#E2E8F0'}
              fontSize="0.22"
              fontWeight="bold"
              fontFamily="Plus Jakarta Sans, sans-serif"
            >
              {mezView === 'mezanino' && ut.mezzanine
                ? `PLANTA DO MEZANINO · NÍVEL +${ut.mezzanine.elevationM.toFixed(2)} m (${Math.round((ut.mezzanine.coverageRatio || 0) * 100)}%)`
                : hasActiveMez
                  ? 'PLANTA BAIXA — PAVIMENTO TÉRREO (+0,00 m)'
                  : `PLANTA BAIXA — ${ut.code}`}
            </text>
          )
        )}

        {/* Rooms fill & labels */}
        {layers.rooms &&
          ut.rooms.map((rm) => {
            if (roomScope && rm.id !== roomScope.id) return null;
            if (!roomScope && mezView === 'terreo' && rm.category === 'mezanino') return null;
            if (!roomScope && mezView === 'mezanino' && rm.category !== 'mezanino') return null;
            const rx = isMirrored ? ut.width - rm.x - rm.width : rm.x;
            const isSel = interactive && selected?.kind === 'room' && selected.id === rm.id;
            return (
              <g
                key={rm.id}
                onPointerDown={(e) => {
                  if (!interactive || tool !== 'select') return;
                  e.stopPropagation();
                  setSelected({ kind: 'room', id: rm.id });
                }}
              >
                <rect
                  x={rx}
                  y={rm.y}
                  width={rm.width}
                  height={rm.depth}
                  fill={isSel ? '#2F7CF6' : rm.category === 'mezanino' ? '#0891B2' : '#1E242E'}
                  fillOpacity={isSel ? 0.25 : rm.category === 'mezanino' ? 0.16 : 0.45}
                  stroke={rm.category === 'mezanino' ? '#22D3EE' : '#313947'}
                  strokeWidth={rm.category === 'mezanino' ? '0.03' : '0.02'}
                />
                <text
                  x={rx + rm.width / 2}
                  y={rm.y + rm.depth / 2 - 0.08}
                  textAnchor="middle"
                  fill={rm.category === 'mezanino' ? '#67E8F9' : '#94A3B8'}
                  fontSize="0.2"
                  fontFamily="Plus Jakarta Sans, sans-serif"
                >
                  {rm.code}
                </text>
                <text
                  x={rx + rm.width / 2}
                  y={rm.y + rm.depth / 2 + 0.16}
                  textAnchor="middle"
                  fill={rm.category === 'mezanino' ? '#22D3EE' : '#64748B'}
                  fontSize="0.16"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {getRoomArea(rm)} m²
                </text>
              </g>
            );
          })}

        {/* Mezanino: Plataforma, Estrutura (Metálica/Madeira) e Guarda-Corpo */}
        {hasActiveMez && ut.mezzanine && (!roomScope || roomScope.category === 'mezanino') && (() => {
          const mez = ut.mezzanine;
          const mx = isMirrored ? ut.width - mez.x - mez.width : mez.x;
          const isWood = mez.structureType === 'madeira_estrutural';
          const beamStroke = isWood ? '#D97706' : '#38BDF8';
          const joistCount = Math.max(1, Math.floor(mez.width / 0.65) - 1);
          const showAsUpper = mezView === 'mezanino';
          const pctLabel = Math.round((mez.coverageRatio || 0) * 100);
          return (
            <g pointerEvents="none">
              <rect
                x={mx}
                y={mez.y}
                width={mez.width}
                height={mez.depth}
                fill={showAsUpper ? 'rgba(34, 211, 238, 0.14)' : 'none'}
                stroke="#22D3EE"
                strokeOpacity={showAsUpper ? 1 : 0.48}
                strokeWidth={showAsUpper ? '0.045' : '0.022'}
                strokeDasharray={showAsUpper ? undefined : '0.14 0.09'}
              />
              {/* Vigas secundárias / barrotes da estrutura do mezanino */}
              {Array.from({ length: joistCount }).map((_, ji) => {
                const jx = mx + ((ji + 1) * mez.width) / (joistCount + 1);
                return (
                  <line
                    key={`mez-joist-${ji}`}
                    x1={jx}
                    y1={mez.y + 0.04}
                    x2={jx}
                    y2={mez.y + mez.depth - 0.04}
                    stroke={beamStroke}
                    strokeOpacity={showAsUpper ? 0.5 : 0.18}
                    strokeWidth="0.02"
                    strokeDasharray="0.10 0.06"
                  />
                );
              })}
              {/* Guarda-corpo indicado em planta superior */}
              {showAsUpper && mez.y + mez.depth < ut.depth - 0.55 && (
                <line
                  x1={mx + 0.04}
                  y1={mez.y + mez.depth - 0.02}
                  x2={mx + mez.width - 0.04}
                  y2={mez.y + mez.depth - 0.02}
                  stroke="#F59E0B"
                  strokeWidth="0.05"
                />
              )}
              <text
                x={mx + mez.width / 2}
                y={showAsUpper ? mez.y + mez.depth + 0.22 : mez.y + 0.2}
                textAnchor="middle"
                fill="#22D3EE"
                fillOpacity={showAsUpper ? 0.95 : 0.65}
                fontSize="0.12"
                fontWeight={showAsUpper ? 'bold' : undefined}
                fontFamily="JetBrains Mono, monospace"
              >
                {showAsUpper
                  ? `${mez.width.toFixed(2)}×${mez.depth.toFixed(2)} m · ${isWood ? 'MADEIRA' : 'METÁLICA'}`
                  : `PROJ. MEZANINO (+${mez.elevationM.toFixed(2)}m · ${pctLabel}%)`}
              </text>
            </g>
          );
        })()}

        {/* Furniture (Detailed Architectural CAD Blocks with true rotation & selection rotate handle) */}
        {layers.furniture &&
          ut.furniture.map((f) => {
            const isStair = f.category === 'escada';
            const isUpper = (f.elevationM ?? 0) >= 0.5 && !isStair;
            if (mezView === 'terreo' && isUpper) return null;
            if (mezView === 'mezanino' && !isUpper && !isStair) return null;

            const rot = ((f.rotationDeg % 360) + 360) % 360;
            const rad = (rot * Math.PI) / 180;
            const w = round3(f.width * Math.abs(Math.cos(rad)) + f.depth * Math.abs(Math.sin(rad)));
            const d = round3(f.width * Math.abs(Math.sin(rad)) + f.depth * Math.abs(Math.cos(rad)));
            if (roomScope && !isInRoom(f.x + w / 2, f.y + d / 2, f.roomId)) return null;

            const fx = isMirrored ? ut.width - f.x - w : f.x;
            const isSel = interactive && selected?.kind === 'furniture' && selected.id === f.id;
            return (
              <g
                key={f.id}
                onPointerDown={(e) => {
                  if (!interactive || tool !== 'select') return;
                  e.stopPropagation();
                  setSelected({ kind: 'furniture', id: f.id });
                  const pt = clientToWorld(e.clientX, e.clientY);
                  const localPtX = pt.x - planOffsetX;
                  const localPtY = pt.y - planOffsetY;
                  setDraggingItem({
                    kind: 'furniture',
                    id: f.id,
                    offsetX: localPtX - f.x,
                    offsetY: localPtY - f.y,
                    planOffsetX,
                    planOffsetY,
                  });
                }}
                className={interactive && tool === 'select' ? 'cursor-move' : ''}
              >
                <FurnitureCadBlock
                  category={f.category}
                  x={fx}
                  y={f.y}
                  width={w}
                  depth={d}
                  stroke={isSel ? '#60A5FA' : (f.elevationM ?? 0) >= 0.5 ? '#22D3EE' : '#94A3B8'}
                  fill={isSel ? 'rgba(47,124,246,0.22)' : 'rgba(30,41,59,0.55)'}
                  accent={isSel ? '#93C5FD' : '#38BDF8'}
                  strokeWidth={isSel ? 0.03 : 0.018}
                  detailed={true}
                  stairSpec={f.stairSpec}
                  rotationDeg={isMirrored ? -rot : rot}
                />
                {interactive && (
                  <text
                    x={fx + w / 2}
                    y={f.y + d + 0.09}
                    textAnchor="middle"
                    fill={(f.elevationM ?? 0) >= 0.5 ? '#22D3EE' : '#94A3B8'}
                    fontSize="0.09"
                  >
                    {isStair
                      ? mezView === 'mezanino'
                        ? 'DESCE ↓'
                        : 'SOBE ↑'
                      : f.name.split(' ')[0]}
                  </text>
                )}
                {/* On-canvas bounding highlight + clickable Rotate Handle */}
                {isSel && (
                  <g>
                    <rect
                      x={fx - 0.03}
                      y={f.y - 0.03}
                      width={w + 0.06}
                      height={d + 0.06}
                      fill="none"
                      stroke="#60A5FA"
                      strokeDasharray="0.06 0.04"
                      strokeWidth="0.022"
                      pointerEvents="none"
                    />
                    <line
                      x1={fx + w / 2}
                      y1={f.y - 0.03}
                      x2={fx + w / 2}
                      y2={f.y - 0.24}
                      stroke="#60A5FA"
                      strokeWidth="0.02"
                      pointerEvents="none"
                    />
                    <g
                      className="cursor-pointer"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        handleRotateSelected(90);
                      }}
                    >
                      <title>Girar 90° (Atalho: tecla R)</title>
                      <circle
                        cx={fx + w / 2}
                        cy={f.y - 0.28}
                        r={0.11}
                        fill="#2F7CF6"
                        stroke="#FFFFFF"
                        strokeWidth="0.022"
                      />
                      <path
                        d={`M ${fx + w / 2 - 0.045} ${f.y - 0.28} A 0.045 0.045 0 1 1 ${fx + w / 2 + 0.02} ${f.y - 0.24}`}
                        fill="none"
                        stroke="#FFFFFF"
                        strokeWidth="0.02"
                      />
                    </g>
                  </g>
                )}
              </g>
            );
          })}

        {/* Indicador de Chegada da Escada no Mezanino */}
        {mezView === 'mezanino' && mezStair && (
          <g pointerEvents="none">
            <rect
              x={isMirrored ? ut.width - mezStair.x - mezStair.width : mezStair.x}
              y={mezStair.y - 0.06}
              width={mezStair.width}
              height={0.14}
              fill="#F59E0B"
              fillOpacity={0.35}
              stroke="#F59E0B"
              strokeWidth="0.025"
            />
          </g>
        )}

        {/* Walls (clipped cleanly when in isolated room floor plan) */}
        {layers.walls && (
          <g clipPath={roomClipId ? `url(#${roomClipId})` : undefined}>
            {ut.walls.map((w) => {
              if (mezView === 'mezanino' && !w.isExternal) return null;
              if (roomScope && !wallTouchesRoom(w)) return null;
              const isSel = interactive && selected?.kind === 'wall' && selected.id === w.id;
              const isDrywall =
                !w.isExternal &&
                ((w.material || '').toLowerCase().includes('drywall') ||
                  (w.material || '').toLowerCase().includes('gesso'));
              const wallDim = mezView === 'mezanino' ? 0.55 : 1;
            return (
              <g
                key={w.id}
                opacity={wallDim}
                pointerEvents={mezView === 'mezanino' ? 'none' : undefined}
                onPointerDown={(e) => {
                  if (!interactive || tool !== 'select' || mezView === 'mezanino') return;
                  e.stopPropagation();
                  setSelected({ kind: 'wall', id: w.id });
                  const pt = clientToWorld(e.clientX, e.clientY);
                  setDraggingItem({
                    kind: 'wall_body',
                    id: w.id,
                    originPt: pt,
                    origStart: { ...w.start },
                    origEnd: { ...w.end },
                  });
                }}
                className={interactive && tool === 'select' && mezView !== 'mezanino' ? 'cursor-move' : ''}
              >
                <line
                  x1={mapX(w.start.x)}
                  y1={w.start.y}
                  x2={mapX(w.end.x)}
                  y2={w.end.y}
                  stroke={isSel ? '#60A5FA' : w.isExternal ? '#E2E8F0' : isDrywall ? '#38BDF8' : '#94A3B8'}
                  strokeWidth={w.thickness}
                  strokeLinecap="square"
                />
                {isSel && (
                  <>
                    <circle
                      cx={mapX(w.start.x)}
                      cy={w.start.y}
                      r={0.085}
                      fill="#2F7CF6"
                      stroke="#FFFFFF"
                      strokeWidth="0.02"
                      className="cursor-grab"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDraggingItem({ kind: 'wall_start', id: w.id });
                      }}
                    />
                    <circle
                      cx={mapX(w.end.x)}
                      cy={w.end.y}
                      r={0.085}
                      fill="#2F7CF6"
                      stroke="#FFFFFF"
                      strokeWidth="0.02"
                      className="cursor-grab"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDraggingItem({ kind: 'wall_end', id: w.id });
                      }}
                    />
                  </>
                )}
              </g>
            );
          })}
          </g>
        )}

        {/* Openings (Doors with swing arc, Windows & Vitrôs — drag onto ANY wall) */}
        {layers.openings &&
          mezView !== 'mezanino' && (
          <g clipPath={roomClipId ? `url(#${roomClipId})` : undefined}>
          {ut.openings.map((op) => {
            const wall = ut.walls.find((w) => w.id === op.wallId);
            if (!wall) return null;
            if (roomScope && !wallTouchesRoom(wall)) return null;
            const { center } = getOpeningWorldPosition(wall, op);
            if (roomScope && !isInRoom(center.x, center.y)) return null;
            const cx = mapX(center.x);
            const cy = center.y;
            const angleDeg = (getWallAngleRad(wall) * 180) / Math.PI;
            const isSel = interactive && selected?.kind === 'opening' && selected.id === op.id;
            const isDraggingThis = draggingItem?.kind === 'opening' && draggingItem.id === op.id;
            const isVitro =
              op.openingKind?.startsWith('vitro_') ||
              op.subtype.toLowerCase().includes('vitrô') ||
              op.subtype.toLowerCase().includes('basculante');
            const wallLen = getWallLength(wall);
            const distStart = round2(op.offsetAlongWall);
            const distEnd = round2(Math.max(0, wallLen - op.offsetAlongWall - op.width));

            return (
              <g
                key={op.id}
                transform={`translate(${cx}, ${cy}) rotate(${isMirrored ? -angleDeg : angleDeg})`}
                onPointerDown={(e) => {
                  if (!interactive || tool !== 'select') return;
                  e.stopPropagation();
                  setSelected({ kind: 'opening', id: op.id });
                  setDraggingItem({ kind: 'opening', id: op.id, planOffsetX, planOffsetY });
                }}
                className={interactive && tool === 'select' ? 'cursor-move' : ''}
              >
                {/* Generous invisible hitbox so any door or window is effortless to grab & move */}
                <rect
                  x={-op.width / 2 - 0.05}
                  y={-Math.max(0.24, wall.thickness * 1.45)}
                  width={op.width + 0.1}
                  height={Math.max(0.48, wall.thickness * 2.9)}
                  fill="transparent"
                />
                {/* Clear wall break */}
                <rect
                  x={-op.width / 2}
                  y={-wall.thickness * 0.6}
                  width={op.width}
                  height={wall.thickness * 1.2}
                  fill="#111317"
                />
                {isSel && (
                  <rect
                    x={-op.width / 2 - 0.04}
                    y={-wall.thickness * 0.85}
                    width={op.width + 0.08}
                    height={wall.thickness * 1.7}
                    rx="0.02"
                    fill="rgba(96, 165, 250, 0.18)"
                    stroke="#60A5FA"
                    strokeDasharray="0.06 0.04"
                    strokeWidth="0.022"
                    pointerEvents="none"
                  />
                )}
                {op.type === 'janela' ? (
                  <>
                    <rect
                      x={-op.width / 2}
                      y={-0.045}
                      width={op.width}
                      height={0.09}
                      fill={isVitro ? '#22D3EE' : '#0EA5E9'}
                      fillOpacity={isSel ? 0.55 : 0.35}
                      stroke={isSel ? '#60A5FA' : isVitro ? '#22D3EE' : '#38BDF8'}
                      strokeWidth={isSel ? '0.032' : '0.025'}
                    />
                    <line
                      x1={-op.width / 2}
                      y1={0}
                      x2={op.width / 2}
                      y2={0}
                      stroke="#E0F2FE"
                      strokeWidth="0.015"
                    />
                    {isVitro && (
                      <>
                        <line x1={-op.width / 2} y1={-0.055} x2={op.width / 2} y2={-0.055} stroke="#22D3EE" strokeWidth="0.012" strokeDasharray="0.04 0.03" />
                        <line x1={-op.width / 2} y1={0.055} x2={op.width / 2} y2={0.055} stroke="#22D3EE" strokeWidth="0.012" strokeDasharray="0.04 0.03" />
                      </>
                    )}
                  </>
                ) : op.swingDirection === 'sliding' || op.openingKind === 'porta_correr' ? (
                  <>
                    <rect
                      x={-op.width / 2}
                      y={-0.025}
                      width={op.width}
                      height={0.05}
                      fill={isSel ? '#60A5FA' : '#F59E0B'}
                    />
                    <line
                      x1={-op.width / 2}
                      y1={0.055}
                      x2={op.width * 0.5}
                      y2={0.055}
                      stroke={isSel ? '#60A5FA' : '#F59E0B'}
                      strokeDasharray="0.06 0.04"
                      strokeWidth="0.018"
                    />
                  </>
                ) : (
                  (() => {
                    const isOut = op.swingDirection === 'left_out' || op.swingDirection === 'right_out';
                    const hingeRight = op.swingDirection === 'right_in' || op.swingDirection === 'right_out';
                    const sx = (hingeRight ? -1 : 1) * (isMirrored ? -1 : 1);
                    const sy = isOut ? -1 : 1;
                    return (
                      <g transform={`scale(${sx}, ${sy})`}>
                        {/* Clickable invisible door swing sector */}
                        <path
                          d={`M ${-op.width / 2} 0 L ${-op.width / 2} ${op.width} A ${op.width} ${op.width} 0 0 0 ${op.width / 2} 0 Z`}
                          fill={isSel ? 'rgba(96, 165, 250, 0.09)' : 'transparent'}
                        />
                        <line
                          x1={-op.width / 2}
                          y1={0}
                          x2={-op.width / 2}
                          y2={op.width}
                          stroke={isSel ? '#60A5FA' : '#F59E0B'}
                          strokeWidth={isSel ? '0.042' : '0.035'}
                        />
                        <path
                          d={`M ${-op.width / 2} ${op.width} A ${op.width} ${op.width} 0 0 0 ${op.width / 2} 0`}
                          fill="none"
                          stroke={isSel ? '#60A5FA' : '#F59E0B'}
                          strokeDasharray="0.08 0.06"
                          strokeWidth="0.02"
                        />
                      </g>
                    );
                  })()
                )}
                <text
                  x={0}
                  y={-0.18}
                  textAnchor="middle"
                  transform={Math.abs(isMirrored ? -angleDeg : angleDeg) > 90 ? 'rotate(180 0 -0.18)' : undefined}
                  fill={isSel ? '#60A5FA' : '#CBD5E1'}
                  fontWeight={isSel ? 'bold' : undefined}
                  fontSize="0.14"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {op.code}
                </text>
                {(isSel || isDraggingThis) && (
                  <text
                    x={0}
                    y={0.28}
                    textAnchor="middle"
                    transform={Math.abs(isMirrored ? -angleDeg : angleDeg) > 90 ? 'rotate(180 0 0.28)' : undefined}
                    fill="#93C5FD"
                    fontSize="0.11"
                    fontFamily="JetBrains Mono, monospace"
                    pointerEvents="none"
                  >
                    {`${distStart.toFixed(2)}m | ${wall.code} | ${distEnd.toFixed(2)}m`}
                  </text>
                )}
              </g>
            );
          })}
          </g>
        )}

        {/* Electrical Shortest-Path Routing Lines from QDC */}
        {layers.electrical &&
          !roomScope &&
          computeElectricalRouting(ut).segments.map((seg) => {
            const isSpec = seg.kind === 'special';
            const pts = seg.elbow
              ? `${mapX(seg.from.x)},${seg.from.y} ${mapX(seg.elbow.x)},${seg.elbow.y} ${mapX(seg.to.x)},${seg.to.y}`
              : `${mapX(seg.from.x)},${seg.from.y} ${mapX(seg.to.x)},${seg.to.y}`;
            return (
              <polyline
                key={`cad-el-rt-${seg.id}`}
                points={pts}
                fill="none"
                stroke={isSpec ? '#A855F7' : '#F59E0B'}
                strokeOpacity={0.35}
                strokeWidth="0.018"
                strokeDasharray="0.06 0.04"
                pointerEvents="none"
              />
            );
          })}

        {/* Electrical & Special Points (Selectable & Draggable -> Syncs to Projeto Elétrico) */}
        {layers.electrical &&
          ut.electricalPoints.map((ep) => {
            const isMezEp = ep.roomId.endsWith('-rm-mez') || ep.code.includes('MEZ');
            if (mezView === 'terreo' && isMezEp) return null;
            if (mezView === 'mezanino' && !isMezEp) return null;
            if (roomScope && !isInRoom(ep.x, ep.y, ep.roomId)) return null;
            const isQdc = ep.category === 'quadro_luz' || ep.code.toUpperCase().startsWith('QDC');
            const isSpec = ['dados', 'tv', 'antena_tv', 'wifi_ap', 'cftv', 'rack_ti', 'interfone'].includes(
              ep.category,
            );
            const isSel = interactive && selected?.kind === 'electrical' && selected.id === ep.id;
            const col = isSel ? '#FFFFFF' : isQdc ? '#FACC15' : isMezEp ? '#22D3EE' : isSpec ? '#C084FC' : '#F59E0B';
            return (
              <g
                key={ep.id}
                transform={`translate(${mapX(ep.x)}, ${ep.y})`}
                onPointerDown={(e) => {
                  if (!interactive || tool !== 'select') return;
                  e.stopPropagation();
                  setSelected({ kind: 'electrical', id: ep.id });
                  const pt = clientToWorld(e.clientX, e.clientY);
                  const localPtX = pt.x - planOffsetX;
                  const localPtY = pt.y - planOffsetY;
                  setDraggingItem({
                    kind: 'electrical',
                    id: ep.id,
                    offsetX: localPtX - ep.x,
                    offsetY: localPtY - ep.y,
                    planOffsetX,
                    planOffsetY,
                    isMezzanine: isMezEp || mezView === 'mezanino',
                  });
                }}
                className={interactive && tool === 'select' ? 'cursor-move' : ''}
              >
                <circle
                  r={isSel ? 0.16 : isQdc ? 0.15 : 0.13}
                  fill={isSel ? 'rgba(245, 158, 11, 0.25)' : isQdc ? 'rgba(250, 204, 21, 0.16)' : 'transparent'}
                  stroke={isSel ? '#60A5FA' : isQdc ? '#FACC15' : 'transparent'}
                  strokeWidth="0.025"
                  strokeDasharray={isQdc && !isSel ? undefined : '0.04 0.03'}
                />
                <ElectricalSymbolSvg category={ep.category} cx={0} cy={0} r={isQdc ? 0.1 : 0.085} color={col} bg="#111317" />
                <text x="0.12" y="0.04" fill={col} fontSize="0.1" fontWeight={isSel || isQdc ? 'bold' : undefined} fontFamily="JetBrains Mono, monospace">
                  {ep.code}
                </text>
              </g>
            );
          })}

        {/* Hydraulic Shortest-Path MST Routing + Prumada AF */}
        {layers.water &&
          !roomScope &&
          mezView !== 'mezanino' &&
          (() => {
            const hydRt = computeHydraulicRouting(ut);
            return (
              <g pointerEvents="none">
                {hydRt.segments.map((seg) => {
                  const pts = seg.elbow
                    ? `${mapX(seg.from.x)},${seg.from.y} ${mapX(seg.elbow.x)},${seg.elbow.y} ${mapX(seg.to.x)},${seg.to.y}`
                    : `${mapX(seg.from.x)},${seg.from.y} ${mapX(seg.to.x)},${seg.to.y}`;
                  return (
                    <polyline
                      key={`cad-hyd-rt-${seg.id}`}
                      points={pts}
                      fill="none"
                      stroke={seg.kind === 'hot_water' ? '#EF4444' : '#38BDF8'}
                      strokeOpacity={0.65}
                      strokeWidth="0.024"
                      strokeDasharray={seg.kind === 'hot_water' ? '0.06 0.04' : '0.08 0.03'}
                    />
                  );
                })}
                <circle cx={mapX(hydRt.riser.x)} cy={hydRt.riser.y} r="0.075" fill="#0EA5E9" stroke="#FFFFFF" strokeWidth="0.02" />
              </g>
            );
          })()}

        {/* Hydraulic Points (Selectable & Draggable -> Syncs to Projeto Hidráulico) */}
        {layers.water &&
          mezView !== 'mezanino' &&
          ut.waterPoints.map((wp) => {
            if (roomScope && !isInRoom(wp.x, wp.y, wp.roomId)) return null;
            const isSel = interactive && selected?.kind === 'water' && selected.id === wp.id;
            const col = wp.waterType === 'quente' ? '#EF4444' : '#3B82F6';
            return (
              <g
                key={wp.id}
                transform={`translate(${mapX(wp.x)}, ${wp.y})`}
                onPointerDown={(e) => {
                  if (!interactive || tool !== 'select') return;
                  e.stopPropagation();
                  setSelected({ kind: 'water', id: wp.id });
                  const pt = clientToWorld(e.clientX, e.clientY);
                  const localPtX = pt.x - planOffsetX;
                  const localPtY = pt.y - planOffsetY;
                  setDraggingItem({
                    kind: 'water',
                    id: wp.id,
                    offsetX: localPtX - wp.x,
                    offsetY: localPtY - wp.y,
                    planOffsetX,
                    planOffsetY,
                  });
                }}
                className={interactive && tool === 'select' ? 'cursor-move' : ''}
              >
                <circle
                  r={0.14}
                  fill={isSel ? 'rgba(59, 130, 246, 0.25)' : 'transparent'}
                  stroke={isSel ? '#60A5FA' : 'transparent'}
                  strokeWidth="0.025"
                />
                <rect
                  x="-0.075"
                  y="-0.075"
                  width="0.15"
                  height="0.15"
                  rx="0.02"
                  fill={col}
                  stroke={isSel ? '#FFFFFF' : '#0F1115'}
                  strokeWidth="0.02"
                />
                <text x="0.11" y="0.04" fill={wp.waterType === 'quente' ? '#FCA5A5' : '#93C5FD'} fontSize="0.11" fontWeight={isSel ? 'bold' : undefined} fontFamily="JetBrains Mono, monospace">
                  {wp.code}
                </text>
              </g>
            );
          })}

        {/* Drainage / Sanitary Network Lines + Draggable Points (-> Syncs to Projeto Sanitário) */}
        {layers.drainage &&
          mezView !== 'mezanino' &&
          ut.drainagePoints.map((dp) => {
            const target = ut.drainagePoints.find((t) => t.id === dp.connectedToId);
            if (!target) return null;
            if (roomScope && (!isInRoom(dp.x, dp.y, dp.roomId) || !isInRoom(target.x, target.y, target.roomId))) {
              return null;
            }
            return (
              <line
                key={`dr-line-${dp.id}`}
                x1={mapX(dp.x)}
                y1={dp.y}
                x2={mapX(target.x)}
                y2={target.y}
                stroke="#10B981"
                strokeOpacity={0.45}
                strokeWidth="0.024"
                strokeDasharray="0.07 0.05"
                pointerEvents="none"
              />
            );
          })}
        {layers.drainage &&
          mezView !== 'mezanino' &&
          ut.drainagePoints.map((dp) => {
            if (roomScope && !isInRoom(dp.x, dp.y, dp.roomId)) return null;
            const isSel = interactive && selected?.kind === 'drainage' && selected.id === dp.id;
            return (
              <g
                key={dp.id}
                transform={`translate(${mapX(dp.x)}, ${dp.y})`}
                onPointerDown={(e) => {
                  if (!interactive || tool !== 'select') return;
                  e.stopPropagation();
                  setSelected({ kind: 'drainage', id: dp.id });
                  const pt = clientToWorld(e.clientX, e.clientY);
                  const localPtX = pt.x - planOffsetX;
                  const localPtY = pt.y - planOffsetY;
                  setDraggingItem({
                    kind: 'drainage',
                    id: dp.id,
                    offsetX: localPtX - dp.x,
                    offsetY: localPtY - dp.y,
                    planOffsetX,
                    planOffsetY,
                  });
                }}
                className={interactive && tool === 'select' ? 'cursor-move' : ''}
              >
                <circle
                  r={0.14}
                  fill={isSel ? 'rgba(16, 185, 129, 0.28)' : 'transparent'}
                  stroke={isSel ? '#60A5FA' : 'transparent'}
                  strokeWidth="0.025"
                />
                <circle
                  r="0.085"
                  fill="#0F1115"
                  stroke={isSel ? '#FFFFFF' : '#10B981'}
                  strokeWidth="0.032"
                />
                <text x="0.11" y="0.04" fill="#34D399" fontSize="0.11" fontWeight={isSel ? 'bold' : undefined} fontFamily="JetBrains Mono, monospace">
                  {dp.code}
                </text>
              </g>
            );
          })}

        {/* Automatic & Manual Dimensions */}
        {layers.dimensions &&
          !roomScope &&
          ut.dimensions.map((dim) => {
            const x1 = mapX(dim.start.x);
            const x2 = mapX(dim.end.x);
            const len = round2(distance2D(dim.start, dim.end));
            const horiz = Math.abs(dim.end.y - dim.start.y) < Math.abs(dim.end.x - dim.start.x);
            const mx = (x1 + x2) / 2;
            const my = (dim.start.y + dim.end.y) / 2;
            const offX = horiz ? 0 : dim.offset;
            const offY = horiz ? dim.offset : 0;
            return (
              <g key={dim.id} stroke="#64748B" strokeWidth="0.018">
                <line x1={x1 + offX} y1={dim.start.y + offY} x2={x2 + offX} y2={dim.end.y + offY} />
                <text
                  x={mx + offX}
                  y={my + offY - 0.08}
                  textAnchor="middle"
                  fill="#94A3B8"
                  stroke="none"
                  fontSize="0.18"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {len.toFixed(2)} m
                </text>
              </g>
            );
          })}
      </g>
    );
  };

  // Selected properties panel helpers
  const selectedWall =
    selected?.kind === 'wall' && activeUt ? activeUt.walls.find((w) => w.id === selected.id) : null;
  const selectedOpening =
    selected?.kind === 'opening' && activeUt
      ? activeUt.openings.find((o) => o.id === selected.id)
      : null;
  const selectedFurniture =
    selected?.kind === 'furniture' && activeUt
      ? activeUt.furniture.find((f) => f.id === selected.id)
      : null;
  const selectedElectrical =
    selected?.kind === 'electrical' && activeUt
      ? activeUt.electricalPoints.find((ep) => ep.id === selected.id)
      : null;
  const selectedWater =
    selected?.kind === 'water' && activeUt
      ? activeUt.waterPoints.find((wp) => wp.id === selected.id)
      : null;
  const selectedDrainage =
    selected?.kind === 'drainage' && activeUt
      ? activeUt.drainagePoints.find((dp) => dp.id === selected.id)
      : null;
  const selectedRoom =
    selected?.kind === 'room' && activeUt ? activeUt.rooms.find((r) => r.id === selected.id) : null;
  const selectedInstance =
    selected?.kind === 'unit_instance' && activeFloor
      ? activeFloor.units.find((u) => u.id === selected.id)
      : null;

  const siteCheck = analyzeSiteGeometry(project.site);

  return (
    <div className="flex flex-col h-full">
      {/* Contextual CAD Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[#1B1E24] border-b border-[#2A2F38]">
        {/* Scope & Target Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center p-0.5 rounded bg-[#14161A] border border-[#2A2F38]">
            <button
              type="button"
              onClick={() => {
                setScope('tipologia');
                setZoom(1);
                setPan({ x: 0, y: 0 });
                setSelected(null);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
                scope === 'tipologia' ? 'bg-[#2F7CF6] text-white' : 'text-[#949BA8] hover:text-white'
              }`}
            >
              Tipologia (Detalhe)
            </button>
            <button
              type="button"
              onClick={() => {
                setScope('pavimento');
                setTool('select');
                setZoom(1);
                setPan({ x: 0, y: 0 });
                setSelected(null);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
                scope === 'pavimento' ? 'bg-[#2F7CF6] text-white' : 'text-[#949BA8] hover:text-white'
              }`}
            >
              Planta do Pavimento
            </button>
          </div>

          {scope === 'tipologia' ? (
            <>
              <select
                value={activeUt?.id ?? ''}
                onChange={(e) => {
                  onSelectUnitType(e.target.value);
                  setSelectedRoomFilter('todos');
                  setSelected(null);
                }}
                aria-label="Selecionar tipologia"
                className="px-2.5 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
              >
                {project.unitTypes.map((ut) => (
                  <option key={ut.id} value={ut.id}>
                    {ut.code} — {ut.width}×{ut.depth}m ({round2(ut.width * ut.depth)}m²)
                  </option>
                ))}
              </select>

              {/* Planta Geral vs Plantas Individuais por Cômodo */}
              <div
                className="flex items-center p-0.5 rounded bg-[#14161A] border border-[#2A2F38]"
                role="group"
                aria-label="Modo de exibição das plantas"
              >
                <button
                  type="button"
                  onClick={() => {
                    setPlanViewMode('geral');
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                    setSelected(null);
                  }}
                  className={`px-2 py-1 text-[11px] font-medium rounded whitespace-nowrap transition-colors ${
                    planViewMode === 'geral'
                      ? 'bg-[#2F7CF6] text-white'
                      : 'text-[#949BA8] hover:text-white'
                  }`}
                >
                  Planta Geral
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlanViewMode('por_comodo');
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                    setSelected(null);
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded whitespace-nowrap transition-colors ${
                    planViewMode === 'por_comodo'
                      ? 'bg-emerald-600 text-white'
                      : 'text-[#949BA8] hover:text-white'
                  }`}
                >
                  <LayoutGrid className="w-3 h-3" />
                  Por Cômodo (Separados)
                </button>
              </div>

              {planViewMode === 'por_comodo' && activeUt && (
                <select
                  value={selectedRoomFilter}
                  onChange={(e) => {
                    setSelectedRoomFilter(e.target.value);
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                    setSelected(null);
                  }}
                  aria-label="Filtrar cômodo para planta baixa individual"
                  className="px-2 py-1 text-xs rounded bg-[#14161A] border border-emerald-500/40 text-emerald-200"
                >
                  <option value="todos">Todos os Cômodos ({activeUt.rooms.length} plantas)</option>
                  {activeUt.rooms.map((rm) => (
                    <option key={rm.id} value={rm.id}>
                      Somente {rm.code} — {rm.name} ({getRoomArea(rm)} m²)
                    </option>
                  ))}
                </select>
              )}

              {planViewMode === 'geral' &&
                activeUt?.hasMezzanine &&
                activeUt?.mezzanine?.enabled &&
                activeUt.ceilingHeight >= 3.0 && (
                <div
                  className="flex items-center p-0.5 rounded bg-[#14161A] border border-cyan-500/40"
                  role="group"
                  aria-label="Nível de visualização do mezanino"
                >
                  {(
                    [
                      ['lado_a_lado', '2 Plantas (Lado a Lado)'],
                      ['terreo', 'Somente Térreo'],
                      ['mezanino', 'Somente Mezanino'],
                    ] as const
                  ).map(([id, lbl]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setMezzanineViewLayer(id);
                        setZoom(1);
                        setPan({ x: 0, y: 0 });
                        setSelected(null);
                      }}
                      className={`px-2 py-1 text-[11px] font-medium rounded whitespace-nowrap transition-colors ${
                        mezzanineViewLayer === id
                          ? 'bg-cyan-600 text-white'
                          : 'text-cyan-300/80 hover:text-white'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              )}

              {onOpenImplantation && (
                <button
                  type="button"
                  onClick={onOpenImplantation}
                  title="Configurar quantidade de andares, repetições e implantação no lote"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-[#2F7CF6]/40 bg-[#2F7CF6]/10 text-sky-200 hover:bg-[#2F7CF6]/25 whitespace-nowrap"
                >
                  <Layers className="w-3 h-3" />
                  {project.floors.length} and. · {project.floors.reduce((s, f) => s + f.units.length, 0)} unid. (Repetições)
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <select
                value={activeFloor?.id ?? ''}
                onChange={(e) => {
                  setSelectedFloorId(e.target.value);
                  setSelected(null);
                }}
                aria-label="Selecionar pavimento"
                className="px-2.5 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
              >
                {project.floors.map((fl) => (
                  <option key={fl.id} value={fl.id}>
                    {fl.name} ({fl.units.length} unid.)
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#14161A] border border-[#2A2F38]">
                <button
                  type="button"
                  disabled={project.floors.length <= 1}
                  onClick={() =>
                    onUpdateProject((prev) => {
                      const next = setProjectFloorCount(prev, prev.floors.length - 1, true);
                      if (!next.floors.some((f) => f.id === selectedFloorId)) {
                        setSelectedFloorId(next.floors[next.floors.length - 1]?.id ?? '');
                      }
                      return next;
                    }, 'Redução de pavimento no Editor 2D')
                  }
                  title="Remover último andar"
                  aria-label="Remover andar"
                  className="p-0.5 text-slate-300 hover:text-white disabled:opacity-35"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-[11px] font-mono text-sky-300 px-1 whitespace-nowrap">
                  {project.floors.length} {project.floors.length === 1 ? 'andar' : 'andares'}
                </span>
                <button
                  type="button"
                  disabled={project.floors.length >= 20}
                  onClick={() =>
                    onUpdateProject((prev) => {
                      const next = setProjectFloorCount(prev, prev.floors.length + 1, true);
                      const last = next.floors[next.floors.length - 1];
                      if (last) setSelectedFloorId(last.id);
                      return next;
                    }, 'Adição de andar com replicação no Editor 2D')
                  }
                  title="Adicionar andar (copia Térreo)"
                  aria-label="Adicionar andar"
                  className="p-0.5 text-slate-300 hover:text-white disabled:opacity-35"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              {project.floors.length > 1 && (project.floors[0]?.units.length ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateProject(
                      (prev) => replicateGroundFloorToAllFloors(prev),
                      'Replicação do Térreo para todos os andares superiores',
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-emerald-500/40 bg-emerald-600/15 text-emerald-200 hover:bg-emerald-600/30 whitespace-nowrap"
                >
                  <Copy className="w-3 h-3" />
                  Replicar Térreo nos {project.floors.length - 1} andares
                </button>
              )}

              {project.floors.length > 1 && (
                <label className="inline-flex items-center gap-1.5 text-[11px] text-sky-200 cursor-pointer px-1.5 py-0.5 rounded bg-[#14161A] border border-[#2A2F38]">
                  <input
                    type="checkbox"
                    checked={syncFloors}
                    onChange={(e) => setSyncFloors(e.target.checked)}
                  />
                  Sincronizar nos {project.floors.length} andares
                </label>
              )}

              {onOpenImplantation && (
                <button
                  type="button"
                  onClick={onOpenImplantation}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-[#2F7CF6]/40 bg-[#2F7CF6]/15 text-sky-200 hover:bg-[#2F7CF6]/30 whitespace-nowrap"
                >
                  Repetições no Lote
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Drawing Tools */}
        {scope === 'tipologia' && (
          <div className="flex items-center gap-1 flex-wrap">
            {(
              [
                { id: 'select', label: 'Selecionar', Icon: MousePointer2 },
                { id: 'wall', label: 'Parede', Icon: PenTool },
                { id: 'door', label: 'Porta', Icon: Move },
                { id: 'window', label: 'Janela', Icon: Grid3X3 },
                { id: 'vitro', label: 'Vitrô', Icon: Grid3X3 },
                { id: 'furniture', label: 'Mobiliário', Icon: Copy },
                { id: 'electrical', label: '+ Elétrica', Icon: Zap },
                { id: 'water', label: '+ Água', Icon: Droplets },
                { id: 'drainage', label: '+ Esgoto', Icon: Waves },
                { id: 'measure', label: 'Cotar', Icon: Ruler },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTool(id);
                  setDraftStart(null);
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded border transition-colors whitespace-nowrap ${
                  tool === id
                    ? 'bg-[#2F7CF6] border-[#2F7CF6] text-white'
                    : 'bg-[#14161A] border-[#2A2F38] text-[#C4C9D4] hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}

            {tool === 'door' && (
              <select
                value={doorRolePreset}
                onChange={(e) => setDoorRolePreset(e.target.value as OpeningRole)}
                aria-label="Função da porta"
                className="px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2F7CF6] text-white"
              >
                <option value="entrada">Entrada (0,80m fixo)</option>
                <option value="banheiro">Banheiro (0,60m fixo)</option>
                <option value="quarto">Quarto (0,70m fixo)</option>
                <option value="outro">Outra porta (livre)</option>
              </select>
            )}

            {tool === 'furniture' && (
              <select
                value={furniturePresetIdx}
                onChange={(e) => setFurniturePresetIdx(Number(e.target.value))}
                aria-label="Selecionar item de mobiliário"
                className="px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2F7CF6] text-white"
              >
                {FURNITURE_CATALOG.map((item, idx) => (
                  <option key={item.name} value={idx}>
                    {item.name} ({item.w}×{item.d}m)
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* CAD Utility Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {selected && (selected.kind === 'furniture' || selected.kind === 'unit_instance') && (
            <button
              type="button"
              onClick={() => handleRotateSelected(90)}
              title="Girar selecionado 90° (Atalho: R)"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-[#2F7CF6] bg-[#2F7CF6]/20 text-white hover:bg-[#2F7CF6]/35 whitespace-nowrap"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Girar 90°
            </button>
          )}
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Desfazer"
            aria-label="Desfazer"
            className="p-1.5 rounded border border-[#2A2F38] bg-[#14161A] text-[#C4C9D4] disabled:opacity-35 hover:text-white"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Refazer"
            aria-label="Refazer"
            className="p-1.5 rounded border border-[#2A2F38] bg-[#14161A] text-[#C4C9D4] disabled:opacity-35 hover:text-white"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowGrid((g) => !g)}
            title="Alternar Grade"
            aria-label="Alternar Grade"
            className={`p-1.5 rounded border ${
              showGrid ? 'border-[#2F7CF6] text-[#60A5FA]' : 'border-[#2A2F38] text-[#949BA8]'
            } bg-[#14161A]`}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setSnapEnabled((s) => !s)}
            title="Snap (Precisão)"
            aria-label="Alternar Snap"
            className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded border ${
              snapEnabled ? 'border-[#2F7CF6] text-[#60A5FA]' : 'border-[#2A2F38] text-[#949BA8]'
            } bg-[#14161A]`}
          >
            <Magnet className="w-3.5 h-3.5" />
            {snapStep}m
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(6, round2(z * 1.2)))}
            aria-label="Aumentar Zoom"
            className="p-1.5 rounded border border-[#2A2F38] bg-[#14161A] text-[#C4C9D4] hover:text-white"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.35, round2(z * 0.8)))}
            aria-label="Reduzir Zoom"
            className="p-1.5 rounded border border-[#2A2F38] bg-[#14161A] text-[#C4C9D4] hover:text-white"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            aria-label="Enquadrar Planta"
            title="Enquadrar"
            className="p-1.5 rounded border border-[#2A2F38] bg-[#14161A] text-[#C4C9D4] hover:text-white"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Editor Body: Canvas + Right Properties Inspector */}
      <div className="flex-1 flex min-h-0">
        {/* Central CAD Viewport */}
        <div className="flex-1 relative bg-[#0F1115] flex flex-col min-w-0">
          {/* Layer Strip */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#16191F] border-b border-[#252A33] text-[11px] overflow-x-auto">
            <span className="text-[#949BA8] flex items-center gap-1 shrink-0">
              <Eye className="w-3 h-3" /> Layers:
            </span>
            {(
              [
                ['walls', 'Paredes'],
                ['openings', 'Portas/Janelas'],
                ['rooms', 'Ambientes'],
                ['furniture', 'Mobiliário'],
                ['dimensions', 'Cotas'],
                ['electrical', 'Elétrica'],
                ['water', 'Hidráulica'],
                ['drainage', 'Esgoto'],
                ['structure', 'Estrutura'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setLayers((prev) => ({ ...prev, [k]: !prev[k] }))}
                className={`px-2 py-0.5 rounded border whitespace-nowrap shrink-0 transition-colors ${
                  layers[k]
                    ? 'bg-[#22262E] border-[#3B4252] text-[#E6E9EF]'
                    : 'bg-transparent border-transparent text-[#6B7280]'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <svg
            ref={svgRef}
            data-testid="cad-2d-canvas"
            viewBox={`${viewX} ${viewY} ${viewW} ${viewH}`}
            className="w-full h-full select-none"
            style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={handleWheel}
          >
            {showGrid && (
              <defs>
                <pattern id="cadGridSmall" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
                  <path d="M 0.5 0 L 0 0 0 0.5" fill="none" stroke="#181C23" strokeWidth="0.015" />
                </pattern>
                <pattern id="cadGridLarge" width="1" height="1" patternUnits="userSpaceOnUse">
                  <rect width="1" height="1" fill="url(#cadGridSmall)" />
                  <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#222731" strokeWidth="0.025" />
                </pattern>
              </defs>
            )}
            {showGrid && (
              <rect x={viewX - 20} y={viewY - 20} width={viewW + 40} height={viewH + 40} fill="url(#cadGridLarge)" />
            )}

            {scope === 'tipologia' && activeUt && planViewMode === 'por_comodo' && (
              <g>
                {roomSlots.map((slot) => (
                  <g key={slot.room.id} transform={`translate(${slot.offsetX}, ${slot.offsetY})`}>
                    {renderUnitGeometry(
                      activeUt,
                      true,
                      false,
                      undefined,
                      slot.offsetX,
                      slot.offsetY,
                      slot.room,
                    )}
                  </g>
                ))}
              </g>
            )}
            {scope === 'tipologia' && activeUt && planViewMode === 'geral' && !isSideBySideMez &&
              renderUnitGeometry(activeUt, true, false)}
            {scope === 'tipologia' && activeUt && planViewMode === 'geral' && isSideBySideMez && (
              <g>
                {renderUnitGeometry(activeUt, true, false, 'terreo', 0, 0)}
                <line
                  x1={activeUt.width + mezPlanGapM / 2}
                  y1={-1.15}
                  x2={activeUt.width + mezPlanGapM / 2}
                  y2={activeUt.depth + 0.65}
                  stroke="#334155"
                  strokeWidth="0.025"
                  strokeDasharray="0.16 0.12"
                />
                <g transform={`translate(${mezSideOffsetX}, 0)`}>
                  {renderUnitGeometry(activeUt, true, false, 'mezanino', mezSideOffsetX, 0)}
                </g>
              </g>
            )}
            {scope === 'tipologia' && !activeUt && (
              <g>
                <text
                  x={viewX + viewW / 2}
                  y={viewY + viewH / 2 - 0.35}
                  textAnchor="middle"
                  fill="#E2E8F0"
                  fontSize="0.48"
                  fontWeight="bold"
                >
                  Nenhuma tipologia criada ainda
                </text>
                <text
                  x={viewX + viewW / 2}
                  y={viewY + viewH / 2 + 0.35}
                  textAnchor="middle"
                  fill="#94A3B8"
                  fontSize="0.32"
                >
                  Acesse a aba &quot;Tipologias&quot; acima para criar a primeira unidade.
                </text>
              </g>
            )}

            {scope === 'pavimento' && activeFloor && (
              <g>
                {/* Site boundary */}
                <polygon
                  points={project.site.vertices.map((v) => `${v.x},${v.y}`).join(' ')}
                  fill="#141820"
                  stroke="#60A5FA"
                  strokeWidth="0.08"
                />
                {/* Setbacks */}
                <rect
                  x={siteCheck.buildableBox.x}
                  y={siteCheck.buildableBox.y}
                  width={siteCheck.buildableBox.width}
                  height={siteCheck.buildableBox.depth}
                  fill="none"
                  stroke="#F59E0B"
                  strokeDasharray="0.25 0.15"
                  strokeWidth="0.05"
                />
                {/* Units */}
                {activeFloor.units.map((inst) => {
                  const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
                  if (!ut) return null;
                  const isSel =
                    selected?.kind === 'unit_instance' && selected.id === inst.id;
                  return (
                    <g
                      key={inst.id}
                      transform={`translate(${inst.x}, ${inst.y}) rotate(${inst.rotationDeg})`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelected({ kind: 'unit_instance', id: inst.id, floorId: activeFloor.id });
                        const pt = clientToWorld(e.clientX, e.clientY);
                        setDraggingItem({
                          kind: 'unit_instance',
                          id: inst.id,
                          offsetX: pt.x - inst.x,
                          offsetY: pt.y - inst.y,
                        });
                      }}
                      onDoubleClick={() => {
                        onSelectUnitType(ut.id);
                        setScope('tipologia');
                        setSelected(null);
                      }}
                      className="cursor-move"
                    >
                      {renderUnitGeometry(ut, false, inst.mirrored)}
                      <rect
                        width={ut.width}
                        height={ut.depth}
                        fill="none"
                        stroke={isSel ? '#2F7CF6' : 'transparent'}
                        strokeWidth="0.1"
                      />
                      <text
                        x={ut.width / 2}
                        y={ut.depth - 0.25}
                        textAnchor="middle"
                        fill="#60A5FA"
                        fontSize="0.24"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {inst.unitNumber} · {ut.code}{inst.mirrored ? ' · ESP' : ''}
                      </text>
                    </g>
                  );
                })}

                {/* Conceptual Structural Pillars */}
                {layers.structure &&
                  project.structuralElements.map((se) => (
                    <g key={se.id}>
                      <rect
                        x={se.x}
                        y={se.y}
                        width={se.width}
                        height={se.depth}
                        fill={se.type === 'escada' ? '#334155' : '#EF4444'}
                        fillOpacity="0.65"
                        stroke="#F87171"
                        strokeWidth="0.03"
                      />
                      {se.type === 'escada' && (
                        <text
                          x={se.x + se.width / 2}
                          y={se.y + se.depth / 2}
                          textAnchor="middle"
                          fill="#E2E8F0"
                          fontSize="0.22"
                        >
                          ESCADA
                        </text>
                      )}
                    </g>
                  ))}
              </g>
            )}

            {/* Live hover ghost preview when inserting Porta / Janela / Vitrô */}
            {scope === 'tipologia' &&
              activeUt &&
              cursorWorld &&
              (tool === 'door' || tool === 'window' || tool === 'vitro') &&
              (() => {
                const { localPt, slotOffsetX, slotOffsetY } = resolveUnitLocalPoint(cursorWorld);
                const defW =
                  tool === 'door'
                    ? (FIXED_DOOR_WIDTHS[doorRolePreset] ?? 0.8)
                    : tool === 'vitro'
                      ? 0.6
                      : 1.0;
                const snap = findBestHostWallForOpening(
                  localPt,
                  activeUt.walls,
                  defW,
                  undefined,
                  0.75,
                  snapEnabled ? snapStep : 0.01,
                );
                if (!snap) return null;
                const ang = (getWallAngleRad(snap.wall) * 180) / Math.PI;
                return (
                  <g
                    transform={`translate(${snap.snappedPoint.x + slotOffsetX}, ${snap.snappedPoint.y + slotOffsetY}) rotate(${ang})`}
                    pointerEvents="none"
                  >
                    <rect
                      x={-defW / 2}
                      y={-snap.wall.thickness * 0.65}
                      width={defW}
                      height={snap.wall.thickness * 1.3}
                      fill={tool === 'door' ? '#F59E0B' : '#22D3EE'}
                      fillOpacity={0.35}
                      stroke={tool === 'door' ? '#FBBF24' : '#38BDF8'}
                      strokeDasharray="0.06 0.04"
                      strokeWidth="0.025"
                    />
                    <text
                      x={0}
                      y={-0.18}
                      textAnchor="middle"
                      fill="#F8FAFC"
                      fontSize="0.13"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {`${snap.wall.code} · ${snap.offsetAlongWall.toFixed(2)}m`}
                    </text>
                  </g>
                );
              })()}

            {/* Live draft preview for wall / measure */}
            {draftStart && cursorWorld && (
              <g>
                <line
                  x1={draftStart.x}
                  y1={draftStart.y}
                  x2={cursorWorld.x}
                  y2={cursorWorld.y}
                  stroke={tool === 'measure' ? '#22C55E' : '#60A5FA'}
                  strokeDasharray={tool === 'measure' ? '0.1 0.08' : undefined}
                  strokeWidth={tool === 'measure' ? '0.03' : '0.1'}
                />
                <text
                  x={(draftStart.x + cursorWorld.x) / 2}
                  y={(draftStart.y + cursorWorld.y) / 2 - 0.15}
                  textAnchor="middle"
                  fill="#F1F4F9"
                  fontSize="0.22"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {distance2D(draftStart, cursorWorld).toFixed(2)} m
                </text>
              </g>
            )}
          </svg>

          {/* Bottom Coordinate Strip */}
          <div className="flex items-center justify-between px-4 py-1.5 bg-[#16191F] border-t border-[#252A33] text-[11px] font-mono text-[#949BA8] tabular-nums">
            <div className="flex items-center gap-4">
              <span>
                Cursor: X {cursorWorld ? cursorWorld.x.toFixed(2) : '0.00'}m · Y{' '}
                {cursorWorld ? cursorWorld.y.toFixed(2) : '0.00'}m
              </span>
              <span>Zoom: {Math.round(zoom * 100)}%</span>
              {lastMeasuredDist !== null && (
                <span className="text-emerald-400">Última medição: {lastMeasuredDist.toFixed(2)} m</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span>Arraste portas/janelas p/ qualquer parede · Alt+Arrastar: Pan · Roda: Zoom</span>
              <span className={criticalCount > 0 ? 'text-red-400' : 'text-emerald-400'}>
                Conflitos críticos: {criticalCount}
              </span>
            </div>
          </div>
        </div>

        {/* Right Contextual Properties Inspector */}
        <aside className="w-72 shrink-0 bg-[#1B1E24] border-l border-[#2A2F38] p-4 overflow-y-auto space-y-4">
          <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
            Inspetor de Propriedades
          </h2>

          {!selected && (
            <div className="text-xs text-[#949BA8] space-y-2">
              <p>
                Arraste qualquer <strong className="text-white">porta, janela ou vitrô</strong> para reposicionar em qualquer parede, ou selecione um item abaixo.
              </p>
              {activeUt && scope === 'tipologia' && (
                <>
                  <div className="pt-3 border-t border-[#2A2F38] space-y-1.5 font-mono text-[11px] tabular-nums">
                    <div className="text-white font-sans font-medium">Resumo {activeUt.code}</div>
                    <div>Paredes: {activeUt.walls.length}</div>
                    <div>Portas/Janelas: {activeUt.openings.length}</div>
                    <div>Mobiliário: {activeUt.furniture.length}</div>
                    <div>Pontos Elétricos: {activeUt.electricalPoints.length}</div>
                    <div>Pontos Água: {activeUt.waterPoints.length}</div>
                    <div>Pontos Esgoto: {activeUt.drainagePoints.length}</div>
                  </div>
                  {activeUt.openings.length > 0 && (
                    <div className="pt-3 border-t border-[#2A2F38] space-y-1.5">
                      <div className="text-[11px] font-medium text-white">
                        Portas & Janelas ({activeUt.openings.length})
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {activeUt.openings.map((op) => {
                          const w = activeUt.walls.find((wl) => wl.id === op.wallId);
                          return (
                            <button
                              key={op.id}
                              type="button"
                              onClick={() => {
                                setLayers((prev) => ({ ...prev, openings: true }));
                                setSelected({ kind: 'opening', id: op.id });
                              }}
                              className="text-left px-2 py-1 rounded border border-[#2A2F38] bg-[#14161A] hover:border-[#2F7CF6] text-[11px] text-slate-200"
                            >
                              <div className="font-mono font-semibold text-[#F59E0B]">{op.code}</div>
                              <div className="text-[10px] text-[#949BA8] truncate">
                                {w?.code ?? op.wallId} · {op.width.toFixed(2)}m
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {selectedWall && (
            <div className="space-y-3 text-xs">
              <div className="font-semibold text-[#60A5FA]">Parede {selectedWall.code}</div>
              <div>
                Comprimento: <strong className="font-mono">{getWallLength(selectedWall).toFixed(2)} m</strong>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Início X (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={selectedWall.start.x}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        walls: ut.walls.map((w) =>
                          w.id === selectedWall.id ? { ...w, start: { ...w.start, x: val } } : w,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Início Y (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={selectedWall.start.y}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        walls: ut.walls.map((w) =>
                          w.id === selectedWall.id ? { ...w, start: { ...w.start, y: val } } : w,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Fim X (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={selectedWall.end.x}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        walls: ut.walls.map((w) =>
                          w.id === selectedWall.id ? { ...w, end: { ...w.end, x: val } } : w,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Fim Y (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={selectedWall.end.y}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        walls: ut.walls.map((w) =>
                          w.id === selectedWall.id ? { ...w, end: { ...w.end, y: val } } : w,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-[#949BA8] mb-1">Espessura (m)</label>
                  <input
                    type="number"
                    step="0.005"
                    min={0.06}
                    value={selectedWall.thickness}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        walls: ut.walls.map((w) => (w.id === selectedWall.id ? { ...w, thickness: val } : w)),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#949BA8] mb-1">Altura (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={1.0}
                    value={selectedWall.height}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        walls: ut.walls.map((w) => (w.id === selectedWall.id ? { ...w, height: val } : w)),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
              </div>
              {!selectedWall.isExternal && (
                <div>
                  <label className="block text-[11px] text-[#949BA8] mb-1">Divisória Interna</label>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        updateActiveUt((ut) => ({
                          ...ut,
                          walls: ut.walls.map((w) =>
                            w.id === selectedWall.id
                              ? { ...w, thickness: 0.1, material: 'Alvenaria Bloco Cerâmico' }
                              : w,
                          ),
                        }))
                      }
                      className={`px-2 py-1 text-[11px] rounded border ${
                        !(selectedWall.material || '').toLowerCase().includes('drywall')
                          ? 'border-[#2F7CF6] bg-[#2F7CF6]/20 text-white font-semibold'
                          : 'border-[#2A2F38] bg-[#14161A] text-[#949BA8]'
                      }`}
                    >
                      Alvenaria
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateActiveUt((ut) => ({
                          ...ut,
                          walls: ut.walls.map((w) =>
                            w.id === selectedWall.id
                              ? {
                                  ...w,
                                  thickness: 0.095,
                                  material: 'Drywall Gesso Acartonado ST/RU (9,5cm) + Lã Mineral',
                                }
                              : w,
                          ),
                        }))
                      }
                      className={`px-2 py-1 text-[11px] rounded border ${
                        (selectedWall.material || '').toLowerCase().includes('drywall')
                          ? 'border-[#2F7CF6] bg-[#2F7CF6]/20 text-white font-semibold'
                          : 'border-[#2A2F38] bg-[#14161A] text-[#949BA8]'
                      }`}
                    >
                      Drywall
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Material</label>
                <input
                  type="text"
                  value={selectedWall.material}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateActiveUt((ut) => ({
                      ...ut,
                      walls: ut.walls.map((w) => (w.id === selectedWall.id ? { ...w, material: val } : w)),
                    }));
                  }}
                  className="w-full px-2 py-1 bg-[#14161A] border border-[#2A2F38] rounded text-white"
                />
              </div>
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="w-full py-1.5 rounded bg-red-950/60 border border-red-500/40 text-red-300 hover:bg-red-900/60 flex items-center justify-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Excluir Parede
              </button>
            </div>
          )}

          {selectedOpening && activeUt && (() => {
            const hostWall = activeUt.walls.find((w) => w.id === selectedOpening.wallId);
            const hostLen = hostWall ? getWallLength(hostWall) : 3.0;
            const maxOff = round2(Math.max(0.02, hostLen - selectedOpening.width - 0.02));
            const distEnd = round2(Math.max(0, hostLen - selectedOpening.offsetAlongWall - selectedOpening.width));
            const updateSelectedOp = (patch: Partial<Opening>, note?: string) => {
              updateActiveUt(
                (ut) => ({
                  ...ut,
                  openings: ut.openings.map((o) =>
                    o.id === selectedOpening.id ? { ...o, ...patch } : o,
                  ),
                }),
                note,
              );
            };
            const widthPresets =
              selectedOpening.type === 'porta'
                ? [0.6, 0.7, 0.8, 0.9]
                : [0.6, 0.8, 1.0, 1.2, 1.5];

            return (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#F59E0B]">
                    {selectedOpening.type.toUpperCase()} {selectedOpening.code}
                  </span>
                  <span className="text-[10px] text-[#949BA8]">
                    Arraste para qualquer parede
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] text-[#949BA8] mb-1">Parede Hospedeira</label>
                  <select
                    value={selectedOpening.wallId}
                    onChange={(e) => {
                      const nextWallId = e.target.value;
                      const nextWall = activeUt.walls.find((w) => w.id === nextWallId);
                      const nextLen = nextWall ? getWallLength(nextWall) : 3;
                      updateSelectedOp(
                        {
                          wallId: nextWallId,
                          offsetAlongWall: clampOpeningOffsetToWall(
                            nextLen,
                            selectedOpening.width,
                            selectedOpening.offsetAlongWall,
                            0.01,
                          ),
                        },
                        `Movimentação de ${selectedOpening.code} para parede ${nextWall?.code ?? nextWallId}`,
                      );
                    }}
                    className="w-full px-2 py-1 rounded bg-[#14161A] border border-[#2A2F38] text-white"
                  >
                    {activeUt.walls.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} — {getWallLength(w).toFixed(2)} m ({w.isExternal ? 'Externa' : 'Interna'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Deslizamento rápido + Alinhamento exato na parede */}
                <div className="p-2 rounded bg-[#14161A] border border-[#2A2F38] space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#949BA8]">Posição na Parede</span>
                    <span className="font-mono text-sky-300">
                      {selectedOpening.offsetAlongWall.toFixed(2)}m ↔ {distEnd.toFixed(2)}m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.02}
                    max={Math.max(0.02, maxOff)}
                    step={0.05}
                    value={Math.min(maxOff, selectedOpening.offsetAlongWall)}
                    onChange={(e) =>
                      updateSelectedOp({
                        offsetAlongWall: clampOpeningOffsetToWall(
                          hostLen,
                          selectedOpening.width,
                          Number(e.target.value),
                          0.01,
                        ),
                      })
                    }
                    className="w-full accent-[#2F7CF6]"
                  />
                  <div className="grid grid-cols-5 gap-1 text-[10px]">
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedOp({
                          offsetAlongWall: clampOpeningOffsetToWall(
                            hostLen,
                            selectedOpening.width,
                            selectedOpening.offsetAlongWall - 0.1,
                            0.01,
                          ),
                        })
                      }
                      className="py-1 rounded border border-[#2A2F38] bg-[#1B1E24] text-slate-200 hover:border-[#2F7CF6]"
                    >
                      -10cm
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSelectedOp({ offsetAlongWall: 0.04 })}
                      className="py-1 rounded border border-[#2A2F38] bg-[#1B1E24] text-slate-200 hover:border-[#2F7CF6]"
                    >
                      Início
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedOp({
                          offsetAlongWall: clampOpeningOffsetToWall(
                            hostLen,
                            selectedOpening.width,
                            (hostLen - selectedOpening.width) / 2,
                            0.01,
                          ),
                        })
                      }
                      className="py-1 rounded border border-[#2A2F38] bg-[#1B1E24] text-sky-300 hover:border-[#2F7CF6]"
                    >
                      Centro
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedOp({
                          offsetAlongWall: round2(Math.max(0.02, hostLen - selectedOpening.width - 0.04)),
                        })
                      }
                      className="py-1 rounded border border-[#2A2F38] bg-[#1B1E24] text-slate-200 hover:border-[#2F7CF6]"
                    >
                      Fim
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedOp({
                          offsetAlongWall: clampOpeningOffsetToWall(
                            hostLen,
                            selectedOpening.width,
                            selectedOpening.offsetAlongWall + 0.1,
                            0.01,
                          ),
                        })
                      }
                      className="py-1 rounded border border-[#2A2F38] bg-[#1B1E24] text-slate-200 hover:border-[#2F7CF6]"
                    >
                      +10cm
                    </button>
                  </div>
                </div>

                {selectedOpening.type === 'porta' && (
                  <div>
                    <label className="block text-[11px] text-[#949BA8] mb-1">
                      Função / Referência
                    </label>
                    <select
                      value={selectedOpening.role ?? 'outro'}
                      onChange={(e) => {
                        const nextRole = e.target.value as OpeningRole;
                        const fixedW = FIXED_DOOR_WIDTHS[nextRole];
                        const nextW = fixedW ?? selectedOpening.width;
                        updateSelectedOp({
                          role: nextRole,
                          width: nextW,
                          offsetAlongWall: clampOpeningOffsetToWall(
                            hostLen,
                            nextW,
                            selectedOpening.offsetAlongWall,
                            0.01,
                          ),
                        });
                      }}
                      className="w-full px-2 py-1 rounded bg-[#14161A] border border-[#2A2F38] text-white"
                    >
                      <option value="entrada">Entrada Social (Ref. 0,80m)</option>
                      <option value="banheiro">Banheiro (Ref. 0,60m)</option>
                      <option value="quarto">Quarto (Ref. 0,70m)</option>
                      <option value="outro">Outra porta (livre)</option>
                    </select>
                  </div>
                )}

                {selectedOpening.type === 'porta' && selectedOpening.swingDirection !== 'sliding' && (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] text-[#949BA8]">
                      Sentido da Folha (Giro)
                    </label>
                    <select
                      value={selectedOpening.swingDirection}
                      onChange={(e) =>
                        updateSelectedOp({
                          swingDirection: e.target.value as Opening['swingDirection'],
                        })
                      }
                      className="w-full px-2 py-1 rounded bg-[#14161A] border border-[#2A2F38] text-white"
                    >
                      <option value="left_in">Esquerda — Para Dentro</option>
                      <option value="right_in">Direita — Para Dentro</option>
                      <option value="left_out">Esquerda — Para Fora</option>
                      <option value="right_out">Direita — Para Fora</option>
                    </select>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={handleMirrorSelected}
                        className="py-1 rounded border border-[#323844] bg-[#22262E] text-white text-[11px] flex items-center justify-center gap-1 hover:border-[#2F7CF6]"
                      >
                        <FlipHorizontal2 className="w-3 h-3" /> Esq ↔ Dir
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const flipInOut: Record<Opening['swingDirection'], Opening['swingDirection']> = {
                            left_in: 'left_out',
                            left_out: 'left_in',
                            right_in: 'right_out',
                            right_out: 'right_in',
                            sliding: 'sliding',
                            none: 'none',
                          };
                          updateSelectedOp({
                            swingDirection: flipInOut[selectedOpening.swingDirection],
                          });
                        }}
                        className="py-1 rounded border border-[#323844] bg-[#22262E] text-white text-[11px] flex items-center justify-center gap-1 hover:border-[#2F7CF6]"
                      >
                        Dentro ↔ Fora
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] text-[#949BA8] mb-1">Modelo / Tipo</label>
                  <select
                    value={
                      selectedOpening.openingKind ??
                      (selectedOpening.type === 'porta' ? 'porta_abrir' : 'janela_correr')
                    }
                    onChange={(e) => {
                      const nextKind = e.target.value as OpeningKind;
                      updateSelectedOp({
                        openingKind: nextKind,
                        swingDirection:
                          nextKind === 'porta_correr' || nextKind !== 'porta_abrir'
                            ? 'sliding'
                            : selectedOpening.swingDirection === 'sliding'
                              ? 'left_in'
                              : selectedOpening.swingDirection,
                      });
                    }}
                    className="w-full px-2 py-1 rounded bg-[#14161A] border border-[#2A2F38] text-white"
                  >
                    {selectedOpening.type === 'porta' ? (
                      <>
                        <option value="porta_abrir">Porta de Abrir</option>
                        <option value="porta_correr">Porta de Correr</option>
                      </>
                    ) : (
                      <>
                        <option value="janela_correr">Janela de Correr</option>
                        <option value="vitro_basculante">Vitrô Basculante</option>
                        <option value="vitro_maxim_ar">Vitrô Maxim-Ar</option>
                        <option value="vitro_fixo">Vitrô Fixo</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] text-[#949BA8] mb-1">
                    <span>Largura rápida (m)</span>
                    <span className="font-mono text-white">{selectedOpening.width.toFixed(2)}m</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {widthPresets.map((wVal) => (
                      <button
                        key={wVal}
                        type="button"
                        onClick={() =>
                          updateSelectedOp({
                            width: wVal,
                            offsetAlongWall: clampOpeningOffsetToWall(
                              hostLen,
                              wVal,
                              selectedOpening.offsetAlongWall,
                              0.01,
                            ),
                          })
                        }
                        className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                          Math.abs(selectedOpening.width - wVal) < 0.01
                            ? 'border-[#2F7CF6] bg-[#2F7CF6]/20 text-white'
                            : 'border-[#2A2F38] bg-[#14161A] text-[#949BA8] hover:text-white'
                        }`}
                      >
                        {wVal.toFixed(2)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-[#949BA8] mb-1">Largura (m)</label>
                    <input
                      type="number"
                      step="0.05"
                      min={0.4}
                      value={selectedOpening.width}
                      onChange={(e) => {
                        const val = Math.max(0.4, Number(e.target.value));
                        updateSelectedOp({
                          width: val,
                          offsetAlongWall: clampOpeningOffsetToWall(
                            hostLen,
                            val,
                            selectedOpening.offsetAlongWall,
                            0.01,
                          ),
                        });
                      }}
                      className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#949BA8] mb-1">Altura (m)</label>
                    <input
                      type="number"
                      step="0.05"
                      min={0.4}
                      value={selectedOpening.height}
                      onChange={(e) =>
                        updateSelectedOp({ height: Math.max(0.4, Number(e.target.value)) })
                      }
                      className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-[#949BA8] mb-1">Peitoril (m)</label>
                    <input
                      type="number"
                      step="0.05"
                      min={0}
                      value={selectedOpening.sillHeight}
                      onChange={(e) =>
                        updateSelectedOp({ sillHeight: Math.max(0, Number(e.target.value)) })
                      }
                      className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#949BA8] mb-1">Dist. Início (m)</label>
                    <input
                      type="number"
                      step="0.05"
                      min={0}
                      max={maxOff}
                      value={selectedOpening.offsetAlongWall}
                      onChange={(e) =>
                        updateSelectedOp({
                          offsetAlongWall: clampOpeningOffsetToWall(
                            hostLen,
                            selectedOpening.width,
                            Number(e.target.value),
                            0.01,
                          ),
                        })
                      }
                      className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleMirrorSelected}
                    className="flex-1 py-1.5 rounded border border-[#323844] bg-[#22262E] text-white flex items-center justify-center gap-1"
                  >
                    <FlipHorizontal2 className="w-3.5 h-3.5" /> Inverter Abertura
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="p-1.5 rounded bg-red-950/60 border border-red-500/40 text-red-300"
                    title="Excluir esquadria"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })()}

          {selectedFurniture && (
            <div className="space-y-3 text-xs">
              <div className="font-semibold text-[#60A5FA]">{selectedFurniture.name}</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Pos. X (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={selectedFurniture.x}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        furniture: ut.furniture.map((f) =>
                          f.id === selectedFurniture.id ? { ...f, x: val } : f,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Pos. Y (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={selectedFurniture.y}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        furniture: ut.furniture.map((f) =>
                          f.id === selectedFurniture.id ? { ...f, y: val } : f,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#949BA8] mb-1">Largura (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0.2}
                    value={selectedFurniture.width}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        furniture: ut.furniture.map((f) =>
                          f.id === selectedFurniture.id ? { ...f, width: val } : f,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#949BA8] mb-1">Prof. (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0.2}
                    value={selectedFurniture.depth}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        furniture: ut.furniture.map((f) =>
                          f.id === selectedFurniture.id ? { ...f, depth: val } : f,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Altura (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0.05}
                    value={selectedFurniture.height}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        furniture: ut.furniture.map((f) =>
                          f.id === selectedFurniture.id ? { ...f, height: val } : f,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Nível Z (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    value={selectedFurniture.elevationM ?? 0}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value));
                      updateActiveUt((ut) => ({
                        ...ut,
                        furniture: ut.furniture.map((f) =>
                          f.id === selectedFurniture.id ? { ...f, elevationM: val } : f,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
              </div>
              <div className="space-y-2 border-t border-[#2A2F38] pt-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-[#949BA8]">Rotação (°)</label>
                  <span className="font-mono text-[11px] font-semibold text-sky-300">
                    {Math.round(((selectedFurniture.rotationDeg % 360) + 360) % 360)}°
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[0, 90, 180, 270].map((deg) => {
                    const activeDeg = Math.round(((selectedFurniture.rotationDeg % 360) + 360) % 360) === deg;
                    return (
                      <button
                        key={deg}
                        type="button"
                        onClick={() => handleSetSelectedFurnitureRotation(deg)}
                        className={`py-1 rounded border font-mono text-[11px] ${
                          activeDeg
                            ? 'border-[#2F7CF6] bg-[#2F7CF6]/25 text-white font-semibold'
                            : 'border-[#323844] bg-[#14161A] text-[#949BA8] hover:text-white'
                        }`}
                      >
                        {deg}°
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleRotateSelected(-90)}
                    title="Girar -90° (Shift+R)"
                    className="flex-1 py-1.5 rounded border border-[#323844] bg-[#22262E] text-white flex items-center justify-center gap-1 hover:border-[#2F7CF6]"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> -90°
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRotateSelected(90)}
                    title="Girar +90° (R)"
                    className="flex-1 py-1.5 rounded border border-[#323844] bg-[#22262E] text-white flex items-center justify-center gap-1 hover:border-[#2F7CF6]"
                  >
                    <RotateCw className="w-3.5 h-3.5" /> +90°
                  </button>
                  <input
                    type="number"
                    step="15"
                    aria-label="Ângulo de rotação em graus"
                    value={Math.round(((selectedFurniture.rotationDeg % 360) + 360) % 360)}
                    onChange={(e) => handleSetSelectedFurnitureRotation(Number(e.target.value) || 0)}
                    className="w-16 px-1.5 py-1.5 font-mono text-center bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleDuplicateSelected}
                  className="flex-1 py-1.5 rounded border border-[#323844] bg-[#22262E] text-white flex items-center justify-center gap-1"
                  title="Duplicar"
                >
                  <Copy className="w-3.5 h-3.5" /> Duplicar
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="p-1.5 rounded bg-red-950/60 border border-red-500/40 text-red-300"
                  title="Excluir (Del)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {selectedElectrical && activeUt && (
            <div className="space-y-3 text-xs">
              <div className="font-semibold text-amber-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                Ponto Elétrico {selectedElectrical.code}
              </div>
              <div className="text-[11px] text-emerald-300/90 bg-emerald-950/30 border border-emerald-500/30 rounded px-2 py-1.5">
                Sincronizado automaticamente com o Projeto Elétrico (Quadro de Cargas, E01/E02/E06 e DXF).
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Código</label>
                  <input
                    type="text"
                    value={selectedElectrical.code}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateActiveUt((ut) => ({
                        ...ut,
                        electricalPoints: ut.electricalPoints.map((ep) =>
                          ep.id === selectedElectrical.id ? { ...ep, code: val } : ep,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Circuito</label>
                  <input
                    type="text"
                    value={selectedElectrical.circuitId}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateActiveUt((ut) => ({
                        ...ut,
                        electricalPoints: ut.electricalPoints.map((ep) =>
                          ep.id === selectedElectrical.id ? { ...ep, circuitId: val } : ep,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-[#949BA8] mb-0.5">Categoria</label>
                <select
                  value={selectedElectrical.category}
                  onChange={(e) => {
                    const val = e.target.value as ElectricalCategory;
                    updateActiveUt((ut) => ({
                      ...ut,
                      electricalPoints: ut.electricalPoints.map((ep) =>
                        ep.id === selectedElectrical.id
                          ? {
                              ...ep,
                              category: val,
                              ...(val === 'quadro_luz' ? { circuitId: 'GERAL', powerVA: 0 } : {}),
                            }
                          : ep,
                      ),
                    }));
                  }}
                  className="w-full px-2 py-1 bg-[#14161A] border border-[#2A2F38] rounded text-white"
                >
                  <option value="quadro_luz">Quadro de Distribuição (QDC)</option>
                  <option value="tomada_baixa">Tomada Baixa (TUG)</option>
                  <option value="tomada_media">Tomada Média (TUG)</option>
                  <option value="tomada_alta">Tomada Alta (TUG)</option>
                  <option value="tomada_tue">Tomada Uso Específico (TUE)</option>
                  <option value="interruptor">Interruptor</option>
                  <option value="iluminacao_teto">Iluminação Teto</option>
                  <option value="arandela">Arandela</option>
                  <option value="chuveiro">Chuveiro</option>
                  <option value="cooktop">Cooktop</option>
                  <option value="geladeira">Geladeira</option>
                  <option value="maquina_lavar">Máquina de Lavar</option>
                  <option value="ar_condicionado">Ar-Condicionado</option>
                  <option value="dados">Fibra / Internet / Dados</option>
                  <option value="antena_tv">Antena / TV</option>
                  <option value="wifi_ap">Wi-Fi AP</option>
                  <option value="interfone">Interfone</option>
                  <option value="cftv">CFTV</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-[#949BA8] mb-0.5">Descrição</label>
                <input
                  type="text"
                  value={selectedElectrical.label}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateActiveUt((ut) => ({
                      ...ut,
                      electricalPoints: ut.electricalPoints.map((ep) =>
                        ep.id === selectedElectrical.id ? { ...ep, label: val } : ep,
                      ),
                    }));
                  }}
                  className="w-full px-2 py-1 bg-[#14161A] border border-[#2A2F38] rounded text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[#949BA8] mb-0.5">Ambiente</label>
                <select
                  value={selectedElectrical.roomId}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateActiveUt((ut) => ({
                      ...ut,
                      electricalPoints: ut.electricalPoints.map((ep) =>
                        ep.id === selectedElectrical.id ? { ...ep, roomId: val } : ep,
                      ),
                    }));
                  }}
                  className="w-full px-2 py-1 bg-[#14161A] border border-[#2A2F38] rounded text-white"
                >
                  {activeUt.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} — {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">X (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={selectedElectrical.x}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        electricalPoints: ut.electricalPoints.map((ep) =>
                          ep.id === selectedElectrical.id
                            ? {
                                ...ep,
                                x: val,
                                roomId: findRoomIdAtPoint(ut, val, ep.y, ep.roomId.endsWith('-rm-mez'), ep.roomId),
                              }
                            : ep,
                        ),
                      }));
                    }}
                    className="w-full px-1.5 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Y (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={selectedElectrical.y}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        electricalPoints: ut.electricalPoints.map((ep) =>
                          ep.id === selectedElectrical.id
                            ? {
                                ...ep,
                                y: val,
                                roomId: findRoomIdAtPoint(ut, ep.x, val, ep.roomId.endsWith('-rm-mez'), ep.roomId),
                              }
                            : ep,
                        ),
                      }));
                    }}
                    className="w-full px-1.5 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Altura Z</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    value={selectedElectrical.z}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        electricalPoints: ut.electricalPoints.map((ep) =>
                          ep.id === selectedElectrical.id ? { ...ep, z: val } : ep,
                        ),
                      }));
                    }}
                    className="w-full px-1.5 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Pot. (VA)</label>
                  <input
                    type="number"
                    step="50"
                    min={0}
                    value={selectedElectrical.powerVA}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        electricalPoints: ut.electricalPoints.map((ep) =>
                          ep.id === selectedElectrical.id ? { ...ep, powerVA: val } : ep,
                        ),
                      }));
                    }}
                    className="w-full px-1.5 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Tensão</label>
                  <select
                    value={selectedElectrical.voltage}
                    onChange={(e) => {
                      const val = Number(e.target.value) as 127 | 220;
                      updateActiveUt((ut) => ({
                        ...ut,
                        electricalPoints: ut.electricalPoints.map((ep) =>
                          ep.id === selectedElectrical.id ? { ...ep, voltage: val } : ep,
                        ),
                      }));
                    }}
                    className="w-full px-1 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  >
                    <option value={127}>127V</option>
                    <option value={220}>220V</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Cabo mm²</label>
                  <select
                    value={selectedElectrical.conductorSectionMm2}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        electricalPoints: ut.electricalPoints.map((ep) =>
                          ep.id === selectedElectrical.id ? { ...ep, conductorSectionMm2: val } : ep,
                        ),
                      }));
                    }}
                    className="w-full px-1 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  >
                    <option value={1.5}>1.5</option>
                    <option value={2.5}>2.5</option>
                    <option value={4}>4.0</option>
                    <option value={6}>6.0</option>
                    <option value={10}>10.0</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="w-full py-1.5 rounded bg-red-950/60 border border-red-500/40 text-red-300 hover:bg-red-900/60 flex items-center justify-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Excluir Ponto Elétrico
              </button>
            </div>
          )}

          {selectedWater && activeUt && (
            <div className="space-y-3 text-xs">
              <div className="font-semibold text-sky-400 flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5" />
                Ponto Hidráulico {selectedWater.code}
              </div>
              <div className="text-[11px] text-sky-200/90 bg-sky-950/30 border border-sky-500/30 rounded px-2 py-1.5">
                Sincronizado automaticamente com o Projeto Hidráulico (AF/AQ, Prancha H01 e DXF).
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Código</label>
                  <input
                    type="text"
                    value={selectedWater.code}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateActiveUt((ut) => ({
                        ...ut,
                        waterPoints: ut.waterPoints.map((wp) =>
                          wp.id === selectedWater.id ? { ...wp, code: val } : wp,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Rede</label>
                  <select
                    value={selectedWater.waterType}
                    onChange={(e) => {
                      const val = e.target.value as 'fria' | 'quente';
                      updateActiveUt((ut) => ({
                        ...ut,
                        waterPoints: ut.waterPoints.map((wp) =>
                          wp.id === selectedWater.id ? { ...wp, waterType: val } : wp,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  >
                    <option value="fria">Água Fria</option>
                    <option value="quente">Água Quente</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-[#949BA8] mb-0.5">Equipamento</label>
                <input
                  type="text"
                  value={selectedWater.equipment}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateActiveUt((ut) => ({
                      ...ut,
                      waterPoints: ut.waterPoints.map((wp) =>
                        wp.id === selectedWater.id ? { ...wp, equipment: val } : wp,
                      ),
                    }));
                  }}
                  className="w-full px-2 py-1 bg-[#14161A] border border-[#2A2F38] rounded text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[#949BA8] mb-0.5">Ambiente</label>
                <select
                  value={selectedWater.roomId}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateActiveUt((ut) => ({
                      ...ut,
                      waterPoints: ut.waterPoints.map((wp) =>
                        wp.id === selectedWater.id ? { ...wp, roomId: val } : wp,
                      ),
                    }));
                  }}
                  className="w-full px-2 py-1 bg-[#14161A] border border-[#2A2F38] rounded text-white"
                >
                  {activeUt.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} — {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">X (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={selectedWater.x}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        waterPoints: ut.waterPoints.map((wp) =>
                          wp.id === selectedWater.id
                            ? { ...wp, x: val, roomId: findRoomIdAtPoint(ut, val, wp.y, false, wp.roomId) }
                            : wp,
                        ),
                      }));
                    }}
                    className="w-full px-1.5 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Y (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={selectedWater.y}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        waterPoints: ut.waterPoints.map((wp) =>
                          wp.id === selectedWater.id
                            ? { ...wp, y: val, roomId: findRoomIdAtPoint(ut, wp.x, val, false, wp.roomId) }
                            : wp,
                        ),
                      }));
                    }}
                    className="w-full px-1.5 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Altura Z</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    value={selectedWater.z}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        waterPoints: ut.waterPoints.map((wp) =>
                          wp.id === selectedWater.id ? { ...wp, z: val } : wp,
                        ),
                      }));
                    }}
                    className="w-full px-1.5 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Diâmetro Ø (mm)</label>
                  <input
                    type="number"
                    step="5"
                    min={15}
                    value={selectedWater.diameterMm}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        waterPoints: ut.waterPoints.map((wp) =>
                          wp.id === selectedWater.id ? { ...wp, diameterMm: val } : wp,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Peso NBR</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0.1}
                    value={selectedWater.weightHunter}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        waterPoints: ut.waterPoints.map((wp) =>
                          wp.id === selectedWater.id ? { ...wp, weightHunter: val } : wp,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="w-full py-1.5 rounded bg-red-950/60 border border-red-500/40 text-red-300 hover:bg-red-900/60 flex items-center justify-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Excluir Ponto Hidráulico
              </button>
            </div>
          )}

          {selectedDrainage && activeUt && (
            <div className="space-y-3 text-xs">
              <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                <Waves className="w-3.5 h-3.5" />
                Ponto Sanitário {selectedDrainage.code}
              </div>
              <div className="text-[11px] text-emerald-200/90 bg-emerald-950/30 border border-emerald-500/30 rounded px-2 py-1.5">
                Sincronizado automaticamente com o Projeto Sanitário &amp; Esgoto (UHC, Declividade, H02 e DXF).
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Código</label>
                  <input
                    type="text"
                    value={selectedDrainage.code}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateActiveUt((ut) => ({
                        ...ut,
                        drainagePoints: ut.drainagePoints.map((dp) =>
                          dp.id === selectedDrainage.id ? { ...dp, code: val } : dp,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Conectado a</label>
                  <select
                    value={selectedDrainage.connectedToId}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateActiveUt((ut) => ({
                        ...ut,
                        drainagePoints: ut.drainagePoints.map((dp) =>
                          dp.id === selectedDrainage.id ? { ...dp, connectedToId: val } : dp,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  >
                    <option value="CI-GERAL">CI-GERAL</option>
                    {activeUt.drainagePoints
                      .filter((d) => d.id !== selectedDrainage.id)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.code}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-[#949BA8] mb-0.5">Ambiente</label>
                <select
                  value={selectedDrainage.roomId}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateActiveUt((ut) => ({
                      ...ut,
                      drainagePoints: ut.drainagePoints.map((dp) =>
                        dp.id === selectedDrainage.id ? { ...dp, roomId: val } : dp,
                      ),
                    }));
                  }}
                  className="w-full px-2 py-1 bg-[#14161A] border border-[#2A2F38] rounded text-white"
                >
                  {activeUt.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} — {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">X (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={selectedDrainage.x}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        drainagePoints: ut.drainagePoints.map((dp) =>
                          dp.id === selectedDrainage.id
                            ? { ...dp, x: val, roomId: findRoomIdAtPoint(ut, val, dp.y, false, dp.roomId) }
                            : dp,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Y (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={selectedDrainage.y}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        drainagePoints: ut.drainagePoints.map((dp) =>
                          dp.id === selectedDrainage.id
                            ? { ...dp, y: val, roomId: findRoomIdAtPoint(ut, dp.x, val, false, dp.roomId) }
                            : dp,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Ø (mm)</label>
                  <input
                    type="number"
                    step="5"
                    min={40}
                    value={selectedDrainage.diameterMm}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        drainagePoints: ut.drainagePoints.map((dp) =>
                          dp.id === selectedDrainage.id ? { ...dp, diameterMm: val } : dp,
                        ),
                      }));
                    }}
                    className="w-full px-1.5 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Decliv. %</label>
                  <input
                    type="number"
                    step="0.5"
                    min={0.5}
                    value={selectedDrainage.slopePercent}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        drainagePoints: ut.drainagePoints.map((dp) =>
                          dp.id === selectedDrainage.id ? { ...dp, slopePercent: val } : dp,
                        ),
                      }));
                    }}
                    className="w-full px-1.5 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">UHC</label>
                  <input
                    type="number"
                    step="1"
                    min={0}
                    value={selectedDrainage.uhc}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        drainagePoints: ut.drainagePoints.map((dp) =>
                          dp.id === selectedDrainage.id ? { ...dp, uhc: val } : dp,
                        ),
                      }));
                    }}
                    className="w-full px-1.5 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="w-full py-1.5 rounded bg-red-950/60 border border-red-500/40 text-red-300 hover:bg-red-900/60 flex items-center justify-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Excluir Ponto Sanitário
              </button>
            </div>
          )}

          {selectedRoom && (
            <div className="space-y-3 text-xs">
              <div className="font-semibold text-white">
                {selectedRoom.code} — {selectedRoom.name}
              </div>
              <div className="font-mono text-[#C4C9D4] tabular-nums">
                Área: {getRoomArea(selectedRoom)} m²
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Pos. X (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={selectedRoom.x}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        rooms: ut.rooms.map((r) => (r.id === selectedRoom.id ? { ...r, x: val } : r)),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Pos. Y (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={selectedRoom.y}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        rooms: ut.rooms.map((r) => (r.id === selectedRoom.id ? { ...r, y: val } : r)),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Largura (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0.6}
                    value={selectedRoom.width}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        rooms: ut.rooms.map((r) => (r.id === selectedRoom.id ? { ...r, width: val } : r)),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Comp. (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0.6}
                    value={selectedRoom.depth}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        rooms: ut.rooms.map((r) => (r.id === selectedRoom.id ? { ...r, depth: val } : r)),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
              </div>
              <div className="text-[11px] text-[#949BA8]">
                Piso: {selectedRoom.finishes.floor}
              </div>
              <div className="text-[11px] text-[#949BA8]">
                Parede: {selectedRoom.finishes.wall}
              </div>
            </div>
          )}

          {selectedInstance && (() => {
            const instUt = project.unitTypes.find((t) => t.id === selectedInstance.unitTypeId);
            const currEntry: EntrySide = instUt?.entrySide ?? 'frente';
            const lotSideLabel = formatWorldEntrySideLabel(
              getEffectiveWorldEntrySide(
                currEntry,
                selectedInstance.rotationDeg,
                selectedInstance.mirrored,
              ),
            );
            return (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-[#60A5FA]">
                    Unidade {selectedInstance.unitNumber}
                  </div>
                  {instUt && (
                    <span className="font-mono text-[10px] text-slate-400">
                      {instUt.width}×{instUt.depth}m{selectedInstance.mirrored ? ' · ESP' : ''}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">
                    Tipologia / Modelo
                  </label>
                  <select
                    value={selectedInstance.unitTypeId}
                    onChange={(e) => {
                      const nextUtId = e.target.value;
                      onUpdateProject(
                        (prev) =>
                          updateFloorUnitInProject(
                            prev,
                            activeFloor?.id ?? selectedInstance.floorId,
                            selectedInstance.id,
                            { unitTypeId: nextUtId },
                            syncFloors,
                          ),
                        `Troca de tipologia da unidade ${selectedInstance.unitNumber} no Editor 2D`,
                      );
                    }}
                    className="w-full px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                  >
                    {project.unitTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} — {t.name} ({t.width}×{t.depth}m)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-[#949BA8] mb-0.5">
                    Entrada Principal P1 (modelo)
                  </label>
                  <select
                    value={currEntry}
                    onChange={(e) => {
                      const nextEntry = e.target.value as EntrySide;
                      onUpdateProject(
                        (prev) => {
                          const res = customizeUnitTypeForSlot(
                            prev,
                            activeFloor?.id ?? selectedInstance.floorId,
                            selectedInstance.id,
                            { entrySide: nextEntry },
                            syncFloors,
                          );
                          return res ? res.project : prev;
                        },
                        `Entrada da unidade ${selectedInstance.unitNumber} alterada para ${nextEntry}`,
                      );
                    }}
                    className="w-full px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-emerald-300"
                  >
                    <option value="frente">Frente</option>
                    <option value="lateral_direita">Lat. Dir.</option>
                    <option value="lateral_esquerda">Lat. Esq.</option>
                  </select>
                  <div className="mt-1 rounded bg-[#14161A] border border-emerald-500/30 px-2 py-1 text-[10px] text-emerald-300">
                    Porta P1 no lote: <span className="font-semibold">{lotSideLabel}</span>
                    {selectedInstance.mirrored && ' (espelhada)'}
                  </div>
                </div>

                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleRotateSelected(90)}
                    className="flex-1 py-1.5 rounded border border-[#323844] bg-[#22262E] text-white flex items-center justify-center gap-1"
                  >
                    <RotateCw className="w-3.5 h-3.5" /> Girar 90°
                  </button>
                  <button
                    type="button"
                    onClick={handleMirrorSelected}
                    className="flex-1 py-1.5 rounded border border-[#323844] bg-[#22262E] text-white flex items-center justify-center gap-1"
                  >
                    <FlipHorizontal2 className="w-3.5 h-3.5" /> Espelhar
                  </button>
                </div>

                {project.floors.length > 1 && (
                  <div className="space-y-1.5 pt-1 border-t border-[#252A33]">
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={syncFloors}
                        onChange={(e) => setSyncFloors(e.target.checked)}
                      />
                      Sincronizar edições nos {project.floors.length} andares
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateProject(
                          (prev) =>
                            updateFloorUnitInProject(
                              prev,
                              activeFloor?.id ?? selectedInstance.floorId,
                              selectedInstance.id,
                              {
                                unitTypeId: selectedInstance.unitTypeId,
                                rotationDeg: selectedInstance.rotationDeg,
                                mirrored: selectedInstance.mirrored,
                                x: selectedInstance.x,
                                y: selectedInstance.y,
                              },
                              true,
                            ),
                          `Unidade ${selectedInstance.unitNumber} aplicada nos ${project.floors.length} andares`,
                        )
                      }
                      className="w-full py-1.5 rounded border border-emerald-500/40 bg-emerald-600/15 text-emerald-200 hover:bg-emerald-600/30 flex items-center justify-center gap-1 text-[11px]"
                    >
                      <Copy className="w-3 h-3" />
                      Aplicar esta unidade nos {project.floors.length} andares
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </aside>
      </div>
    </div>
  );
};
