import React, { useMemo, useRef, useState } from 'react';
import {
  Copy,
  Eye,
  FlipHorizontal2,
  Grid3X3,
  Magnet,
  Maximize2,
  MousePointer2,
  Move,
  PenTool,
  Redo2,
  RotateCw,
  Ruler,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  analyzeSiteGeometry,
  distance2D,
  getBoundingBox,
  getOpeningWorldPosition,
  getRoomArea,
  getWallAngleRad,
  getWallLength,
  round2,
  round3,
} from '../engine/geometry';
import { runCompatibilityAnalysis } from '../engine/engineering';
import { nextId } from '../engine/parametricGenerator';
import { ElectricalSymbolSvg, FurnitureCadBlock } from './CadArchitecturalSymbols';
import type {
  FurnitureCategory,
  FurnitureItem,
  Opening,
  OpeningKind,
  OpeningRole,
  Point2D,
  Project,
  UnitType,
  Wall,
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
}

type ToolMode = 'select' | 'wall' | 'door' | 'window' | 'vitro' | 'furniture' | 'measure';
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
  { category: 'tanque', name: 'Tanque', w: 0.55, d: 0.5, h: 0.85, water: true, drain: true },
  { category: 'box', name: 'Box Chuveiro', w: 0.85, d: 0.85, h: 1.9, water: true, drain: true },
  { category: 'chuveiro', name: 'Chuveiro / Misturador', w: 0.25, d: 0.25, h: 0.2, pwr: true, water: true },
  { category: 'vaso_sanitario', name: 'Vaso Sanitário', w: 0.42, d: 0.65, h: 0.78, water: true, drain: true },
  { category: 'lavatorio', name: 'Lavatório', w: 0.55, d: 0.42, h: 0.85, water: true, drain: true },
  { category: 'espelho', name: 'Espelho BWC', w: 0.5, d: 0.05, h: 0.7 },
];

export const FloorPlanEditor2D: React.FC<FloorPlanEditor2DProps> = ({
  project,
  selectedUnitTypeId,
  onSelectUnitType,
  onUpdateProject,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}) => {
  const [scope, setScope] = useState<ScopeMode>('tipologia');
  const [mezzanineViewLayer, setMezzanineViewLayer] = useState<'completo' | 'terreo' | 'mezanino'>('completo');
  const [selectedFloorId, setSelectedFloorId] = useState<string>(project.floors[0]?.id ?? '');
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
    water: false,
    drainage: false,
    structure: true,
  });

  // Drawing / dragging temporary states
  const [draftStart, setDraftStart] = useState<Point2D | null>(null);
  const [cursorWorld, setCursorWorld] = useState<Point2D | null>(null);
  const [lastMeasuredDist, setLastMeasuredDist] = useState<number | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panOrigin, setPanOrigin] = useState<Point2D>({ x: 0, y: 0 });
  const [draggingItem, setDraggingItem] = useState<
    | { kind: 'furniture'; id: string; offsetX: number; offsetY: number }
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
    | { kind: 'opening'; id: string }
    | null
  >(null);

  const svgRef = useRef<SVGSVGElement>(null);

  const activeUt =
    project.unitTypes.find((t) => t.id === selectedUnitTypeId) ?? project.unitTypes[0];
  const activeFloor =
    project.floors.find((f) => f.id === selectedFloorId) ?? project.floors[0];

  const clashes = useMemo(() => runCompatibilityAnalysis(project), [project]);
  const criticalCount = clashes.filter((c) => c.severity === 'CRITICO').length;

  // Compute SVG viewBox
  const baseBox = useMemo(() => {
    if (scope === 'tipologia' && activeUt) {
      return {
        minX: -1.4,
        minY: -1.4,
        width: activeUt.width + 2.8,
        height: activeUt.depth + 2.8,
      };
    }
    const bbox = getBoundingBox(project.site.vertices);
    return {
      minX: bbox.minX - 2.2,
      minY: bbox.minY - 2.2,
      width: Math.max(12, bbox.width + 4.4),
      height: Math.max(12, bbox.depth + 4.4),
    };
  }, [scope, activeUt, project.site.vertices]);

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

  const findNearestWall = (pt: Point2D, walls: Wall[]): { wall: Wall; offset: number; dist: number } | null => {
    let best: { wall: Wall; offset: number; dist: number } | null = null;
    for (const w of walls) {
      const dx = w.end.x - w.start.x;
      const dy = w.end.y - w.start.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 0.001) continue;
      const t = Math.max(0, Math.min(1, ((pt.x - w.start.x) * dx + (pt.y - w.start.y) * dy) / lenSq));
      const projX = w.start.x + t * dx;
      const projY = w.start.y + t * dy;
      const d = Math.hypot(pt.x - projX, pt.y - projY);
      if (d < 0.45 && (!best || d < best.dist)) {
        best = { wall: w, offset: round2(t * Math.sqrt(lenSq)), dist: d };
      }
    }
    return best;
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
        const hit = findNearestWall(pt, activeUt.walls);
        if (hit) {
          const wLen = getWallLength(hit.wall);
          const isDoor = tool === 'door';
          const isVitro = tool === 'vitro';
          const role: OpeningRole | undefined = isDoor ? doorRolePreset : undefined;
          const fixedW = role ? FIXED_DOOR_WIDTHS[role] : undefined;
          const defW = isDoor ? (fixedW ?? 0.8) : isVitro ? 0.6 : 1.0;
          const offset = round2(
            Math.max(0.04, Math.min(Math.max(0.04, wLen - defW - 0.04), hit.offset - defW / 2)),
          );
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
            offsetAlongWall: offset,
            width: defW,
            height: isDoor ? 2.1 : isVitro ? 0.6 : 1.1,
            sillHeight: isDoor ? 0 : isVitro ? 1.6 : 1.0,
            thickness: 0.04,
            swingDirection: isDoor ? 'left_in' : 'sliding',
            material: isDoor ? 'Madeira' : 'Alumínio + vidro',
          };
          updateActiveUt(
            (ut) => ({ ...ut, openings: [...ut.openings, newOp] }),
            `Inserção de ${newOp.code} em ${activeUt.code}`,
          );
          setSelected({ kind: 'opening', id: newOp.id });
        }
        return;
      }

      if (tool === 'furniture') {
        const preset = FURNITURE_CATALOG[furniturePresetIdx] ?? FURNITURE_CATALOG[0];
        const roomId =
          activeUt.rooms.find(
            (r) => pt.x >= r.x && pt.x <= r.x + r.width && pt.y >= r.y && pt.y <= r.y + r.depth,
          )?.id ??
          activeUt.rooms[0]?.id ??
          '';
        const newItem: FurnitureItem = {
          id: nextId('fur'),
          name: preset.name,
          category: preset.category,
          roomId,
          x: round2(pt.x - preset.w / 2),
          y: round2(pt.y - preset.d / 2),
          width: preset.w,
          depth: preset.d,
          height: preset.h,
          rotationDeg: 0,
          requiresPower: preset.pwr,
          requiresWater: preset.water,
          requiresDrain: preset.drain,
        };
        updateActiveUt(
          (ut) => ({ ...ut, furniture: [...ut.furniture, newItem] }),
          `Inserção de ${newItem.name} em ${activeUt.code}`,
        );
        setSelected({ kind: 'furniture', id: newItem.id });
        setTool('select');
        return;
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
        const nx = snapVal(pt.x - draggingItem.offsetX);
        const ny = snapVal(pt.y - draggingItem.offsetY);
        updateActiveUt((ut) => ({
          ...ut,
          furniture: ut.furniture.map((f) =>
            f.id === draggingItem.id ? { ...f, x: nx, y: ny } : f,
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
        updateActiveUt((ut) => ({
          ...ut,
          walls: ut.walls.map((w) => {
            if (w.id !== draggingItem.id) return w;
            const targetPt = { x: round2(pt.x), y: round2(pt.y) };
            const nextStart = draggingItem.kind === 'wall_start' ? targetPt : w.start;
            const nextEnd = draggingItem.kind === 'wall_end' ? targetPt : w.end;
            if (distance2D(nextStart, nextEnd) < 0.2) return w;
            return { ...w, start: nextStart, end: nextEnd };
          }),
        }));
      } else if (draggingItem.kind === 'opening' && scope === 'tipologia' && activeUt) {
        updateActiveUt((ut) => {
          const op = ut.openings.find((o) => o.id === draggingItem.id);
          if (!op) return ut;
          const wall = ut.walls.find((w) => w.id === op.wallId);
          if (!wall) return ut;
          const dx = wall.end.x - wall.start.x;
          const dy = wall.end.y - wall.start.y;
          const wallLen = Math.hypot(dx, dy);
          if (wallLen < 0.1) return ut;
          const t = ((pt.x - wall.start.x) * dx + (pt.y - wall.start.y) * dy) / (wallLen * wallLen);
          const centerOffset = t * wallLen;
          const maxOff = Math.max(0.02, wallLen - op.width - 0.02);
          const nextOff = round2(Math.max(0.02, Math.min(maxOff, centerOffset - op.width / 2)));
          return {
            ...ut,
            openings: ut.openings.map((o) =>
              o.id === op.id ? { ...o, offsetAlongWall: nextOff } : o,
            ),
          };
        });
      } else if (draggingItem.kind === 'unit_instance' && scope === 'pavimento' && activeFloor) {
        const nx = snapVal(pt.x - draggingItem.offsetX);
        const ny = snapVal(pt.y - draggingItem.offsetY);
        onUpdateProject((prev) => ({
          ...prev,
          floors: prev.floors.map((fl) =>
            fl.id === activeFloor.id
              ? {
                  ...fl,
                  units: fl.units.map((u) =>
                    u.id === draggingItem.id ? { ...u, x: nx, y: ny } : u,
                  ),
                }
              : fl,
          ),
        }));
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
  const handleRotateSelected = () => {
    if (!selected) return;
    if (selected.kind === 'furniture' && activeUt) {
      updateActiveUt((ut) => ({
        ...ut,
        furniture: ut.furniture.map((f) =>
          f.id === selected.id ? { ...f, rotationDeg: (f.rotationDeg + 90) % 360 } : f,
        ),
      }));
    } else if (selected.kind === 'unit_instance') {
      onUpdateProject((prev) => ({
        ...prev,
        floors: prev.floors.map((fl) =>
          fl.id === selected.floorId
            ? {
                ...fl,
                units: fl.units.map((u) =>
                  u.id === selected.id ? { ...u, rotationDeg: (u.rotationDeg + 90) % 360 } : u,
                ),
              }
            : fl,
        ),
      }));
    }
  };

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
      onUpdateProject((prev) => ({
        ...prev,
        floors: prev.floors.map((fl) =>
          fl.id === selected.floorId
            ? {
                ...fl,
                units: fl.units.map((u) =>
                  u.id === selected.id ? { ...u, mirrored: !u.mirrored } : u,
                ),
              }
            : fl,
        ),
      }));
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
    }
    setSelected(null);
  };

  // Helper to render one unit vector geometry inside SVG
  const renderUnitGeometry = (
    ut: UnitType,
    interactive: boolean,
    isMirrored = false,
  ) => {
    const mapX = (lx: number) => (isMirrored ? ut.width - lx : lx);
    const hasActiveMez = !!(ut.hasMezzanine && ut.mezzanine?.enabled && ut.ceilingHeight >= 3.0);
    const mezView = interactive && hasActiveMez ? mezzanineViewLayer : 'completo';
    const mezStair = hasActiveMez ? ut.furniture.find((f) => f.category === 'escada') : undefined;

    return (
      <g>
        {/* Rooms fill & labels */}
        {layers.rooms &&
          ut.rooms.map((rm) => {
            if (mezView === 'terreo' && rm.category === 'mezanino') return null;
            const rx = isMirrored ? ut.width - rm.x - rm.width : rm.x;
            const isSel = interactive && selected?.kind === 'room' && selected.id === rm.id;
            const dimmed = mezView === 'mezanino' && rm.category !== 'mezanino';
            return (
              <g
                key={rm.id}
                opacity={dimmed ? 0.18 : 1}
                pointerEvents={dimmed ? 'none' : undefined}
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
                  fillOpacity={isSel ? 0.25 : rm.category === 'mezanino' ? 0.14 : 0.45}
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
        {hasActiveMez && ut.mezzanine && (() => {
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
                fill={showAsUpper ? 'rgba(34, 211, 238, 0.14)' : 'rgba(34, 211, 238, 0.05)'}
                stroke="#22D3EE"
                strokeWidth={showAsUpper ? '0.045' : '0.025'}
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
                    strokeOpacity={showAsUpper ? 0.55 : 0.25}
                    strokeWidth="0.022"
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
                y={mez.y + 0.24}
                textAnchor="middle"
                fill="#22D3EE"
                fontSize="0.13"
                fontWeight={showAsUpper ? 'bold' : undefined}
                fontFamily="JetBrains Mono, monospace"
              >
                {showAsUpper
                  ? `MEZANINO +${mez.elevationM.toFixed(2)}m (${mez.width.toFixed(2)}×${mez.depth.toFixed(2)}m · ${pctLabel}% · ${isWood ? 'MADEIRA' : 'METÁLICA'})`
                  : `PROJ. MEZANINO (+${mez.elevationM.toFixed(2)}m · ${pctLabel}%)`}
              </text>
            </g>
          );
        })()}

        {/* Furniture (Detailed Architectural CAD Blocks) */}
        {layers.furniture &&
          ut.furniture.map((f) => {
            const isStair = f.category === 'escada';
            const isUpper = (f.elevationM ?? 0) >= 1.0 && !isStair;
            if (mezView === 'terreo' && isUpper) return null;
            const dimmedGround = mezView === 'mezanino' && !isUpper && !isStair;

            const rot = ((f.rotationDeg % 360) + 360) % 360;
            const w = rot === 90 || rot === 270 ? f.depth : f.width;
            const d = rot === 90 || rot === 270 ? f.width : f.depth;
            const fx = isMirrored ? ut.width - f.x - w : f.x;
            const isSel = interactive && selected?.kind === 'furniture' && selected.id === f.id;
            return (
              <g
                key={f.id}
                opacity={dimmedGround ? 0.2 : 1}
                pointerEvents={dimmedGround ? 'none' : undefined}
                onPointerDown={(e) => {
                  if (!interactive || tool !== 'select' || dimmedGround) return;
                  e.stopPropagation();
                  setSelected({ kind: 'furniture', id: f.id });
                  const pt = clientToWorld(e.clientX, e.clientY);
                  setDraggingItem({
                    kind: 'furniture',
                    id: f.id,
                    offsetX: pt.x - f.x,
                    offsetY: pt.y - f.y,
                  });
                }}
                className={interactive && tool === 'select' && !dimmedGround ? 'cursor-move' : ''}
              >
                <FurnitureCadBlock
                  category={f.category}
                  x={fx}
                  y={f.y}
                  width={w}
                  depth={d}
                  stroke={isSel ? '#60A5FA' : (f.elevationM ?? 0) > 0.5 ? '#22D3EE' : '#94A3B8'}
                  fill={isSel ? 'rgba(47,124,246,0.22)' : 'rgba(30,41,59,0.55)'}
                  accent={isSel ? '#93C5FD' : '#38BDF8'}
                  strokeWidth={isSel ? 0.03 : 0.018}
                  detailed={true}
                  stairSpec={f.stairSpec}
                />
                {interactive && !dimmedGround && (
                  <text
                    x={fx + w / 2}
                    y={f.y + d + 0.08}
                    textAnchor="middle"
                    fill={(f.elevationM ?? 0) > 0.5 ? '#22D3EE' : '#94A3B8'}
                    fontSize="0.09"
                  >
                    {isStair
                      ? mezView === 'mezanino'
                        ? 'CHEGA ↑'
                        : 'SOBE ↑'
                      : f.name.split(' ')[0]}
                  </text>
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

        {/* Walls */}
        {layers.walls &&
          ut.walls.map((w) => {
            const isSel = interactive && selected?.kind === 'wall' && selected.id === w.id;
            const isDrywall =
              !w.isExternal &&
              ((w.material || '').toLowerCase().includes('drywall') ||
                (w.material || '').toLowerCase().includes('gesso'));
            const wallDim = mezView === 'mezanino' && !w.isExternal ? 0.25 : 1;
            return (
              <g
                key={w.id}
                opacity={wallDim}
                pointerEvents={mezView === 'mezanino' && !w.isExternal ? 'none' : undefined}
                onPointerDown={(e) => {
                  if (!interactive || tool !== 'select' || (mezView === 'mezanino' && !w.isExternal)) return;
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
                className={interactive && tool === 'select' ? 'cursor-move' : ''}
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

        {/* Openings (Doors with swing arc, Windows & Vitrôs) */}
        {layers.openings &&
          ut.openings.map((op) => {
            const wall = ut.walls.find((w) => w.id === op.wallId);
            if (!wall) return null;
            const { center } = getOpeningWorldPosition(wall, op);
            const cx = mapX(center.x);
            const cy = center.y;
            const angleDeg = (getWallAngleRad(wall) * 180) / Math.PI;
            const isSel = interactive && selected?.kind === 'opening' && selected.id === op.id;
            const isVitro =
              op.openingKind?.startsWith('vitro_') ||
              op.subtype.toLowerCase().includes('vitrô') ||
              op.subtype.toLowerCase().includes('basculante');

            return (
              <g
                key={op.id}
                transform={`translate(${cx}, ${cy}) rotate(${isMirrored ? -angleDeg : angleDeg})`}
                onPointerDown={(e) => {
                  if (!interactive || tool !== 'select') return;
                  e.stopPropagation();
                  setSelected({ kind: 'opening', id: op.id });
                  setDraggingItem({ kind: 'opening', id: op.id });
                }}
                className={interactive && tool === 'select' ? 'cursor-move' : ''}
              >
                {/* Clear wall break */}
                <rect
                  x={-op.width / 2}
                  y={-wall.thickness * 0.6}
                  width={op.width}
                  height={wall.thickness * 1.2}
                  fill="#111317"
                />
                {op.type === 'janela' ? (
                  <>
                    <rect
                      x={-op.width / 2}
                      y={-0.04}
                      width={op.width}
                      height={0.08}
                      fill={isVitro ? '#22D3EE' : '#0EA5E9'}
                      fillOpacity={0.35}
                      stroke={isSel ? '#60A5FA' : isVitro ? '#22D3EE' : '#38BDF8'}
                      strokeWidth="0.025"
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
                      y={-0.02}
                      width={op.width}
                      height={0.04}
                      fill={isSel ? '#60A5FA' : '#F59E0B'}
                    />
                    <line
                      x1={-op.width / 2}
                      y1={0.05}
                      x2={op.width * 0.5}
                      y2={0.05}
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
                        {/* Door leaf & swing arc */}
                        <line
                          x1={-op.width / 2}
                          y1={0}
                          x2={-op.width / 2}
                          y2={op.width}
                          stroke={isSel ? '#60A5FA' : '#F59E0B'}
                          strokeWidth="0.035"
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
                  y={-0.16}
                  textAnchor="middle"
                  transform={Math.abs(isMirrored ? -angleDeg : angleDeg) > 90 ? 'rotate(180 0 -0.16)' : undefined}
                  fill={isSel ? '#60A5FA' : '#CBD5E1'}
                  fontSize="0.14"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {op.code}
                </text>
              </g>
            );
          })}

        {/* Electrical & Special Points */}
        {layers.electrical &&
          ut.electricalPoints.map((ep) => {
            const isMezEp = ep.roomId.endsWith('-rm-mez') || ep.code.includes('MEZ');
            if (mezView === 'terreo' && isMezEp) return null;
            const epDim = mezView === 'mezanino' && !isMezEp ? 0.2 : 1;
            const isSpec = ['dados', 'tv', 'antena_tv', 'wifi_ap', 'cftv', 'rack_ti', 'interfone'].includes(
              ep.category,
            );
            const col = isMezEp ? '#22D3EE' : isSpec ? '#C084FC' : '#F59E0B';
            return (
              <g key={ep.id} opacity={epDim} transform={`translate(${mapX(ep.x)}, ${ep.y})`}>
                <ElectricalSymbolSvg category={ep.category} cx={0} cy={0} r={0.08} color={col} bg="#111317" />
                <text x="0.12" y="0.04" fill={col} fontSize="0.1" fontFamily="JetBrains Mono, monospace">
                  {ep.code}
                </text>
              </g>
            );
          })}

        {/* Hydraulic Points */}
        {layers.water &&
          ut.waterPoints.map((wp) => (
            <g key={wp.id} transform={`translate(${mapX(wp.x)}, ${wp.y})`}>
              <rect
                x="-0.07"
                y="-0.07"
                width="0.14"
                height="0.14"
                fill={wp.waterType === 'quente' ? '#EF4444' : '#3B82F6'}
              />
              <text x="0.11" y="0.04" fill="#93C5FD" fontSize="0.11" fontFamily="JetBrains Mono, monospace">
                {wp.code}
              </text>
            </g>
          ))}

        {/* Drainage Points */}
        {layers.drainage &&
          ut.drainagePoints.map((dp) => (
            <g key={dp.id} transform={`translate(${mapX(dp.x)}, ${dp.y})`}>
              <circle r="0.08" fill="none" stroke="#10B981" strokeWidth="0.03" />
              <text x="0.11" y="0.04" fill="#34D399" fontSize="0.11" fontFamily="JetBrains Mono, monospace">
                {dp.code}
              </text>
            </g>
          ))}

        {/* Automatic & Manual Dimensions */}
        {layers.dimensions &&
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

              {activeUt?.hasMezzanine && activeUt?.mezzanine?.enabled && activeUt.ceilingHeight >= 3.0 && (
                <div
                  className="flex items-center p-0.5 rounded bg-[#14161A] border border-cyan-500/40"
                  role="group"
                  aria-label="Nível de visualização do mezanino"
                >
                  {(
                    [
                      ['completo', 'Vista Completa'],
                      ['terreo', 'Térreo'],
                      ['mezanino', 'Mezanino'],
                    ] as const
                  ).map(([id, lbl]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setMezzanineViewLayer(id);
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
            </>
          ) : (
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

            {scope === 'tipologia' && activeUt && renderUnitGeometry(activeUt, true, false)}
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
                        fontSize="0.26"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {inst.unitNumber}
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
              <span>Alt + Arrastar: Pan · Roda: Zoom</span>
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
                Selecione uma parede, porta, janela, ambiente, mobiliário ou unidade na planta para inspecionar e editar suas propriedades reais.
              </p>
              {activeUt && scope === 'tipologia' && (
                <div className="pt-3 border-t border-[#2A2F38] space-y-1.5 font-mono text-[11px] tabular-nums">
                  <div className="text-white font-sans font-medium">Resumo {activeUt.code}</div>
                  <div>Paredes: {activeUt.walls.length}</div>
                  <div>Portas/Janelas: {activeUt.openings.length}</div>
                  <div>Mobiliário: {activeUt.furniture.length}</div>
                  <div>Pontos Elétricos: {activeUt.electricalPoints.length}</div>
                  <div>Pontos Água: {activeUt.waterPoints.length}</div>
                  <div>Pontos Esgoto: {activeUt.drainagePoints.length}</div>
                </div>
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

          {selectedOpening && (
            <div className="space-y-3 text-xs">
              <div className="font-semibold text-[#F59E0B]">
                {selectedOpening.type.toUpperCase()} {selectedOpening.code}
              </div>

              {selectedOpening && activeUt && (
                <div>
                  <label className="block text-[11px] text-[#949BA8] mb-1">Parede Hospedeira</label>
                  <select
                    value={selectedOpening.wallId}
                    onChange={(e) => {
                      const nextWallId = e.target.value;
                      const nextWall = activeUt.walls.find((w) => w.id === nextWallId);
                      const maxLen = nextWall ? getWallLength(nextWall) : 3;
                      updateActiveUt(
                        (ut) => ({
                          ...ut,
                          openings: ut.openings.map((o) =>
                            o.id === selectedOpening.id
                              ? {
                                  ...o,
                                  wallId: nextWallId,
                                  offsetAlongWall: round2(
                                    Math.max(
                                      0.04,
                                      Math.min(
                                        Math.max(0.04, maxLen - o.width - 0.04),
                                        o.offsetAlongWall,
                                      ),
                                    ),
                                  ),
                                }
                              : o,
                          ),
                        }),
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
              )}

              {selectedOpening.type === 'porta' && (
                <div>
                  <label className="block text-[11px] text-[#949BA8] mb-1">
                    Função / Regra de Largura
                  </label>
                  <select
                    value={selectedOpening.role ?? 'outro'}
                    onChange={(e) => {
                      const nextRole = e.target.value as OpeningRole;
                      const fixedW = FIXED_DOOR_WIDTHS[nextRole];
                      updateActiveUt((ut) => ({
                        ...ut,
                        openings: ut.openings.map((o) =>
                          o.id === selectedOpening.id
                            ? { ...o, role: nextRole, width: fixedW ?? o.width }
                            : o,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 rounded bg-[#14161A] border border-[#2A2F38] text-white"
                  >
                    <option value="entrada">Entrada Social (0,80m fixo)</option>
                    <option value="banheiro">Banheiro (0,60m fixo)</option>
                    <option value="quarto">Quarto (0,70m fixo)</option>
                    <option value="outro">Outra porta (largura livre)</option>
                  </select>
                </div>
              )}

              {selectedOpening.type === 'porta' && selectedOpening.swingDirection !== 'sliding' && (
                <div>
                  <label className="block text-[11px] text-[#949BA8] mb-1">
                    Sentido da Folha (Giro)
                  </label>
                  <select
                    value={selectedOpening.swingDirection}
                    onChange={(e) => {
                      const val = e.target.value as Opening['swingDirection'];
                      updateActiveUt((ut) => ({
                        ...ut,
                        openings: ut.openings.map((o) =>
                          o.id === selectedOpening.id ? { ...o, swingDirection: val } : o,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 rounded bg-[#14161A] border border-[#2A2F38] text-white"
                  >
                    <option value="left_in">Esquerda — Para Dentro</option>
                    <option value="right_in">Direita — Para Dentro</option>
                    <option value="left_out">Esquerda — Para Fora</option>
                    <option value="right_out">Direita — Para Fora</option>
                  </select>
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
                    updateActiveUt((ut) => ({
                      ...ut,
                      openings: ut.openings.map((o) =>
                        o.id === selectedOpening.id
                          ? {
                              ...o,
                              openingKind: nextKind,
                              swingDirection:
                                nextKind === 'porta_correr' || nextKind !== 'porta_abrir'
                                  ? 'sliding'
                                  : o.swingDirection === 'sliding'
                                    ? 'left_in'
                                    : o.swingDirection,
                            }
                          : o,
                      ),
                    }));
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

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-[#949BA8] mb-1">
                    Largura (m)
                    {selectedOpening.type === 'porta' &&
                    selectedOpening.role &&
                    FIXED_DOOR_WIDTHS[selectedOpening.role] !== undefined
                      ? ' · Fixo'
                      : ''}
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min={0.4}
                    disabled={Boolean(
                      selectedOpening.type === 'porta' &&
                        selectedOpening.role &&
                        FIXED_DOOR_WIDTHS[selectedOpening.role] !== undefined,
                    )}
                    value={selectedOpening.width}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        openings: ut.openings.map((o) =>
                          o.id === selectedOpening.id ? { ...o, width: val } : o,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#949BA8] mb-1">Altura (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0.4}
                    value={selectedOpening.height}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        openings: ut.openings.map((o) =>
                          o.id === selectedOpening.id ? { ...o, height: val } : o,
                        ),
                      }));
                    }}
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
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveUt((ut) => ({
                        ...ut,
                        openings: ut.openings.map((o) =>
                          o.id === selectedOpening.id ? { ...o, sillHeight: val } : o,
                        ),
                      }));
                    }}
                    className="w-full px-2 py-1 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#949BA8] mb-1">Pos. na Parede (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0.02}
                    value={selectedOpening.offsetAlongWall}
                    onChange={(e) => {
                      const val = Math.max(0.02, Number(e.target.value));
                      updateActiveUt((ut) => ({
                        ...ut,
                        openings: ut.openings.map((o) =>
                          o.id === selectedOpening.id ? { ...o, offsetAlongWall: val } : o,
                        ),
                      }));
                    }}
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
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

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
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleRotateSelected}
                  className="flex-1 py-1.5 rounded border border-[#323844] bg-[#22262E] text-white flex items-center justify-center gap-1"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Girar 90°
                </button>
                <button
                  type="button"
                  onClick={handleDuplicateSelected}
                  className="p-1.5 rounded border border-[#323844] bg-[#22262E] text-white"
                  title="Duplicar"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="p-1.5 rounded bg-red-950/60 border border-red-500/40 text-red-300"
                  title="Excluir"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
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

          {selectedInstance && (
            <div className="space-y-3 text-xs">
              <div className="font-semibold text-[#60A5FA]">
                Unidade {selectedInstance.unitNumber}
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleRotateSelected}
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
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
