import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Box,
  CheckCircle2,
  Compass,
  Copy,
  DoorOpen,
  Layers,
  Minus,
  Move,
  Pencil,
  PenTool,
  Plus,
  Ruler,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import {
  analyzeSiteGeometry,
  buildSiteVerticesFromDimensions,
  getBoundingBox,
  getOpeningWorldPosition,
  getUnitWorldRect,
  round2,
  topLeftToUnitOrigin,
} from '../engine/geometry';
import { unitLocalToWorld } from '../engine/cadDrawings';
import {
  createDefaultImplantationConfig,
  customizeUnitTypeForSlot,
  deleteUnitTypeFromProject,
  formatLengthInUnit,
  formatWorldEntrySideLabel,
  generateImplantationUnits,
  getEffectiveWorldEntrySide,
  getGateWorldPosition,
  getLotBoundarySegments,
  normalizeSiteData,
  recalculateFloorElevations,
  replicateGroundFloorToAllFloors,
  setProjectFloorCount,
  updateFloorUnitInProject,
  updateUnitTypeInProject,
  validateImplantation,
} from '../engine/implantation';
import {
  computeMezzanineInteriorBounds,
  generateMultiStoryHouseBundle,
  generateParametricUnitLayout,
  nextId,
} from '../engine/parametricGenerator';
import { NumericInput } from './NumericInput';
import { PaginationBar, paginateItems, useViewportPageSize } from './PaginationBar';
import type {
  AccessGateType,
  BoundaryCondition,
  BuildingKind,
  EntrySide,
  Floor,
  ImplantationAccessMode,
  ImplantationConfig,
  ImplantationCouplingMode,
  ImplantationGroupSpec,
  ImplantationLayoutPattern,
  ImplantationModelMode,
  ImplantationZone,
  InternalPartitionType,
  LotFrontSide,
  LotSideKey,
  MeasurementUnit,
  MezzanineStairLayout,
  MezzanineStructureType,
  MezzanineUsage,
  MezzanineZone,
  Point2D,
  Project,
  SiteAccessGate,
  SiteShapeType,
  TopographyType,
  UnitInstance,
  UnitType,
} from '../types/project';

interface SiteModuleProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
  onNavigateModule?: (moduleId: string) => void;
  onSelectUnitType?: (unitTypeId: string) => void;
}

type SiteStage = 1 | 2 | 3 | 4;
type PlanViewMode = 'geral' | 'zonas' | 'cotas' | 'detalhe';

const STAGE_ITEMS: Array<{ id: SiteStage; num: string; title: string; subtitle: string }> = [
  { id: 1, num: '1', title: 'Caracterização do Terreno', subtitle: 'Lote, divisas e portões' },
  { id: 2, num: '2', title: 'Implantação das Kitnets', subtitle: 'Posição, qtd. e geminação' },
  { id: 3, num: '3', title: 'Afastamentos & Circulação', subtitle: 'Recuos, corredor e acessos' },
  { id: 4, num: '4', title: 'Visualização & Integridade', subtitle: 'Planta integrada e validação' },
];

export const SiteModule: React.FC<SiteModuleProps> = ({
  project,
  onUpdateProject,
  onNavigateModule,
  onSelectUnitType,
}) => {
  const [activeStage, setActiveStage] = useState<SiteStage>(
    project.floors.some((f) => f.units.length > 0) ? 2 : 1,
  );
  const [selectedFloorId, setSelectedFloorId] = useState<string>(project.floors[0]?.id ?? '');
  const [viewMode, setViewMode] = useState<PlanViewMode>('geral');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [draggingVertexIdx, setDraggingVertexIdx] = useState<number | null>(null);
  const [draggingUnitId, setDraggingUnitId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [applyToAllFloors, setApplyToAllFloors] = useState<boolean>(true);

  // Quick inline typology creation & editing state (inside Etapa 2)
  const [showQuickTypeForm, setShowQuickTypeForm] = useState<boolean>(
    project.unitTypes.length === 0,
  );
  const [editingUnitTypeId, setEditingUnitTypeId] = useState<string | null>(null);
  const [confirmDeleteUtId, setConfirmDeleteUtId] = useState<string | null>(null);
  const [qtBuildingKind, setQtBuildingKind] = useState<BuildingKind>('kitnet');
  const [qtSuites, setQtSuites] = useState(0);
  const [qtTotalStories, setQtTotalStories] = useState(2);
  const [qtCode, setQtCode] = useState('TIPO-A');
  const [qtName, setQtName] = useState('Kitnet Padrão');
  const [qtWidth, setQtWidth] = useState(4.0);
  const [qtDepth, setQtDepth] = useState(5.0);
  const [qtCeiling, setQtCeiling] = useState(2.8);
  const [qtBedrooms, setQtBedrooms] = useState(0);
  const [qtEntrySide, setQtEntrySide] = useState<EntrySide>('lateral_direita');
  const [qtPartition, setQtPartition] = useState<InternalPartitionType>('alvenaria');
  const [qtLaundry, setQtLaundry] = useState(true);
  const [qtBalcony, setQtBalcony] = useState(false);
  const [qtAccessible, setQtAccessible] = useState(false);
  const [qtMepProfile, setQtMepProfile] = useState<'simples' | 'completo'>('simples');
  const [qtMezzanine, setQtMezzanine] = useState(false);
  const [qtMezzElev, setQtMezzElev] = useState(2.15);
  const [qtMezzSizingMode, setQtMezzSizingMode] = useState<'percent' | 'dimensions'>('percent');
  const [qtMezzPct, setQtMezzPct] = useState(30);
  const [qtMezzCustomW, setQtMezzCustomW] = useState(3.8);
  const [qtMezzCustomD, setQtMezzCustomD] = useState(2.0);
  const [qtMezzStruct, setQtMezzStruct] = useState<MezzanineStructureType>('metalica_madeira');
  const [qtMezzZone, setQtMezzZone] = useState<MezzanineZone>('sobre_banho_cozinha');
  const [qtMezzUsage, setQtMezzUsage] = useState<MezzanineUsage>('dormitorio');
  const [qtMezzStairLayout, setQtMezzStairLayout] = useState<MezzanineStairLayout>('reta');
  const [qtMezzStairSide, setQtMezzStairSide] = useState<'esquerda' | 'direita'>('direita');

  // Zero-scroll studio sub-tabs & pagination states
  const [stage1SubTab, setStage1SubTab] = useState<'dimensoes' | 'divisas' | 'portoes' | 'vertices'>('dimensoes');
  const [stage2SubTab, setStage2SubTab] = useState<'modelos' | 'implantacao' | 'grupos'>(
    project.unitTypes.length === 0 ? 'modelos' : 'implantacao',
  );
  const [quickFormStep, setQuickFormStep] = useState<'basico' | 'config'>('basico');
  const [rightPaneTab, setRightPaneTab] = useState<'planta' | 'tabela' | 'unidade'>('planta');
  const [gatesPage, setGatesPage] = useState(0);
  const [verticesPage, setVerticesPage] = useState(0);
  const [modelsPage, setModelsPage] = useState(0);
  const [groupsPage, setGroupsPage] = useState(0);
  const [issuesPage, setIssuesPage] = useState(0);
  const [floorUnitsPage, setFloorUnitsPage] = useState(0);

  const gatesPageSize = useViewportPageSize(370, 82, 2, 6);
  const verticesPageSize = useViewportPageSize(360, 38, 4, 10);
  const modelsPageSize = useViewportPageSize(360, 76, 2, 6);
  const groupsPageSize = useViewportPageSize(380, 78, 2, 5);
  const issuesPageSize = useViewportPageSize(430, 62, 2, 6);
  const floorUnitsPageSize = useViewportPageSize(340, 38, 4, 14);

  // Per-unit quick dimension customization modal/panel state
  const [customizingUnitId, setCustomizingUnitId] = useState<string | null>(null);
  const [customW, setCustomW] = useState(4.0);
  const [customD, setCustomD] = useState(5.0);
  const [customEntry, setCustomEntry] = useState<EntrySide>('frente');

  const svgRef = useRef<SVGSVGElement>(null);
  const surveyInputRef = useRef<HTMLInputElement>(null);

  const site = useMemo(() => normalizeSiteData(project.site), [project.site]);
  const unit = site.measurementUnit;
  const siteCheck = useMemo(() => analyzeSiteGeometry(site), [site]);
  const boundarySegments = useMemo(() => getLotBoundarySegments(site), [site]);

  const activeFloor =
    project.floors.find((f) => f.id === selectedFloorId) ?? project.floors[0];

  const impConfig: ImplantationConfig = useMemo(
    () => project.implantation ?? createDefaultImplantationConfig(project),
    [project],
  );

  const validation = useMemo(
    () => validateImplantation(project, activeFloor?.id),
    [project, activeFloor?.id],
  );

  const selectedInstance =
    activeFloor?.units.find((u) => u.id === selectedUnitId) ?? null;
  const selectedInstanceType = selectedInstance
    ? project.unitTypes.find((t) => t.id === selectedInstance.unitTypeId) ?? null
    : null;

  const gatesPager = paginateItems(site.accesses, gatesPage, gatesPageSize);
  const verticesPager = paginateItems(site.vertices, verticesPage, verticesPageSize);
  const modelsPager = paginateItems(project.unitTypes, modelsPage, modelsPageSize);
  const groupsPager = paginateItems(impConfig.groups, groupsPage, groupsPageSize);
  const issuesPager = paginateItems(validation.issues, issuesPage, issuesPageSize);
  const floorUnitsPager = paginateItems(activeFloor?.units ?? [], floorUnitsPage, floorUnitsPageSize);

  // Helpers for unit conversion between UI (m or cm) and canonical internal meters
  const toDisplay = (meters: number) =>
    unit === 'cm' ? Math.round(meters * 100) : round2(meters);
  const fromDisplay = (val: number) =>
    unit === 'cm' ? round2(val / 100) : round2(val);

  const updateSite = (
    updater: (prevSite: ReturnType<typeof normalizeSiteData>) => ReturnType<typeof normalizeSiteData>,
    rebuildVertices = false,
  ) => {
    onUpdateProject((prev) => {
      const curr = normalizeSiteData(prev.site);
      const nextSite = updater(curr);
      if (
        rebuildVertices &&
        nextSite.shapeType !== 'irregular' &&
        nextSite.shapeType !== 'poligonal'
      ) {
        const back =
          nextSite.shapeType === 'retangular' || nextSite.shapeType === 'quadrado'
            ? nextSite.front
            : nextSite.back;
        const depth = nextSite.shapeType === 'quadrado' ? nextSite.front : nextSite.leftDepth;
        const right =
          nextSite.shapeType === 'retangular' || nextSite.shapeType === 'quadrado'
            ? depth
            : nextSite.rightDepth;
        nextSite.back = back;
        nextSite.leftDepth = depth;
        nextSite.rightDepth = right;
        nextSite.vertices = buildSiteVerticesFromDimensions(
          nextSite.front,
          nextSite.back,
          nextSite.leftDepth,
          nextSite.rightDepth,
        );
      }
      return { ...prev, site: nextSite };
    });
  };

  const updateImplantation = (
    updater: (prev: ImplantationConfig) => ImplantationConfig,
  ) => {
    onUpdateProject((prev) => {
      const base = prev.implantation ?? createDefaultImplantationConfig(prev);
      return {
        ...prev,
        implantation: updater(base),
      };
    });
  };

  // SVG viewport mapping
  const bbox = getBoundingBox(site.vertices);
  const pad = 4.2;
  const minX = bbox.minX - pad;
  const minY = bbox.minY - pad;
  const viewW = Math.max(12, bbox.width + pad * 2);
  const viewH = Math.max(12, bbox.depth + pad * 2);

  const clientToWorld = (clientX: number, clientY: number): Point2D | null => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const rx = ((clientX - rect.left) / Math.max(1, rect.width)) * viewW + minX;
    const ry = ((clientY - rect.top) / Math.max(1, rect.height)) * viewH + minY;
    return { x: rx, y: ry };
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const pt = clientToWorld(e.clientX, e.clientY);
    if (!pt) return;

    if (draggingVertexIdx !== null) {
      const snappedX = round2(Math.round(pt.x * 4) / 4);
      const snappedY = round2(Math.round(pt.y * 4) / 4);
      onUpdateProject((prev) => ({
        ...prev,
        site: {
          ...prev.site,
          shapeType: 'poligonal',
          vertices: prev.site.vertices.map((v, idx) =>
            idx === draggingVertexIdx ? { x: snappedX, y: snappedY } : v,
          ),
        },
      }));
      return;
    }

    if (draggingUnitId && activeFloor) {
      const inst = activeFloor.units.find((u) => u.id === draggingUnitId);
      const ut = inst ? project.unitTypes.find((t) => t.id === inst.unitTypeId) : undefined;
      if (!inst || !ut) return;

      const rawTlX = pt.x - dragOffset.dx;
      const rawTlY = pt.y - dragOffset.dy;
      const snappedTlX = round2(Math.round(rawTlX * 10) / 10);
      const snappedTlY = round2(Math.round(rawTlY * 10) / 10);
      const nextOrigin = topLeftToUnitOrigin(snappedTlX, snappedTlY, ut, inst.rotationDeg);

      onUpdateProject((prev) => ({
        ...prev,
        floors: prev.floors.map((f) =>
          f.id === activeFloor.id
            ? {
                ...f,
                units: f.units.map((u) =>
                  u.id === draggingUnitId
                    ? { ...u, x: nextOrigin.x, y: nextOrigin.y, zoneSide: 'personalizada' }
                    : u,
                ),
              }
            : f,
        ),
      }));
    }
  };

  const stopDragging = () => {
    setDraggingVertexIdx(null);
    setDraggingUnitId(null);
  };

  const openNewQuickTypeForm = (kind: BuildingKind = 'kitnet') => {
    setEditingUnitTypeId(null);
    setConfirmDeleteUtId(null);
    setQtBuildingKind(kind);
    const letter = String.fromCharCode(65 + Math.min(25, project.unitTypes.length));
    if (kind === 'casa_terrea') {
      setQtCode(`CASA-${letter}`);
      setQtName('Casa Térrea Padrão');
      setQtWidth(7.0);
      setQtDepth(9.0);
      setQtCeiling(2.85);
      setQtBedrooms(2);
      setQtSuites(1);
      setQtTotalStories(1);
      setQtEntrySide('frente');
      setQtMepProfile('completo');
    } else if (kind === 'casa_sobrado') {
      setQtCode(`SOB-${letter}`);
      setQtName('Sobrado Residencial');
      setQtWidth(6.8);
      setQtDepth(8.8);
      setQtCeiling(2.85);
      setQtBedrooms(3);
      setQtSuites(1);
      setQtTotalStories(2);
      setQtEntrySide('frente');
      setQtMepProfile('completo');
    } else {
      setQtCode(`TIPO-${letter}`);
      setQtName(project.unitTypes.length === 0 ? 'Kitnet Padrão' : `Kitnet Modelo ${letter}`);
      setQtWidth(4.0);
      setQtDepth(5.0);
      setQtCeiling(2.8);
      setQtBedrooms(0);
      setQtSuites(0);
      setQtTotalStories(1);
      setQtEntrySide('lateral_direita');
      setQtMepProfile('simples');
    }
    setQtPartition(project.constructionMethod.internalPartitionType ?? 'alvenaria');
    setQtLaundry(true);
    setQtBalcony(false);
    setQtAccessible(false);
    setQtMezzanine(false);
    setQtMezzElev(2.15);
    setQtMezzSizingMode('percent');
    setQtMezzPct(30);
    setQtMezzCustomW(3.8);
    setQtMezzCustomD(2.0);
    setQtMezzStruct('metalica_madeira');
    setQtMezzZone('sobre_banho_cozinha');
    setQtMezzUsage('dormitorio');
    setQtMezzStairLayout('reta');
    setQtMezzStairSide('direita');
    setQuickFormStep('basico');
    setStage2SubTab('modelos');
    setShowQuickTypeForm(true);
  };

  const openEditQuickTypeForm = (ut: UnitType) => {
    setEditingUnitTypeId(ut.id);
    setConfirmDeleteUtId(null);
    setQtBuildingKind(ut.buildingKind ?? 'kitnet');
    setQtSuites(ut.suites ?? 0);
    setQtTotalStories(ut.totalStories ?? 2);
    setQtCode(ut.code);
    setQtName(ut.name);
    setQtWidth(ut.width);
    setQtDepth(ut.depth);
    setQtCeiling(ut.ceilingHeight);
    setQtBedrooms(ut.bedrooms);
    setQtEntrySide(ut.entrySide ?? 'lateral_direita');
    setQtPartition(
      ut.internalPartitionType ?? project.constructionMethod.internalPartitionType ?? 'alvenaria',
    );
    setQtLaundry(ut.hasLaundry);
    setQtBalcony(ut.hasBalcony);
    setQtAccessible(ut.accessible);
    setQtMepProfile(ut.mepProfile ?? 'simples');
    setQtMezzanine(Boolean(ut.hasMezzanine && ut.ceilingHeight >= 3.0));
    setQtMezzElev(ut.mezzanine?.elevationM ?? 2.15);
    setQtMezzSizingMode(ut.mezzanine?.sizingMode ?? 'percent');
    setQtMezzPct(Math.round((ut.mezzanine?.coverageRatio ?? 0.3) * 100));
    setQtMezzCustomW(ut.mezzanine?.customWidthM ?? ut.mezzanine?.width ?? round2(Math.max(1.2, ut.width - 0.3)));
    setQtMezzCustomD(ut.mezzanine?.customDepthM ?? ut.mezzanine?.depth ?? 2.0);
    setQtMezzStruct(ut.mezzanine?.structureType ?? 'metalica_madeira');
    setQtMezzZone(ut.mezzanine?.zone ?? 'sobre_banho_cozinha');
    setQtMezzUsage(ut.mezzanine?.usage ?? 'dormitorio');
    setQtMezzStairLayout(ut.mezzanine?.stairLayout ?? 'reta');
    setQtMezzStairSide(ut.mezzanine?.stairSide ?? 'direita');
    setQuickFormStep('basico');
    setStage2SubTab('modelos');
    setShowQuickTypeForm(true);
  };

  const handleQuickSaveTypology = (e: React.FormEvent) => {
    e.preventDefault();
    const safeWidth = Math.max(2.8, round2(qtWidth));
    const safeDepth = Math.max(3.6, round2(qtDepth));
    const safeCeiling = Math.max(2.4, round2(qtCeiling));
    const existingUt = editingUnitTypeId
      ? project.unitTypes.find((t) => t.id === editingUnitTypeId)
      : undefined;

    if (!existingUt && qtBuildingKind === 'casa_sobrado') {
      const storiesCount = Math.max(2, Math.min(3, qtTotalStories));
      const bundle = generateMultiStoryHouseBundle({
        code: qtCode.trim() || `SOB-${project.unitTypes.length + 1}`,
        name: qtName.trim() || 'Sobrado Residencial',
        width: Math.max(5.2, safeWidth),
        depth: Math.max(6.8, safeDepth),
        ceilingHeight: safeCeiling,
        bedrooms: Math.max(1, qtBedrooms),
        suites: qtSuites,
        hasLaundry: qtLaundry,
        hasBalcony: qtBalcony,
        hasMezzanine: false,
        accessible: qtAccessible,
        extWallThickness: project.constructionMethod.externalWallThickness,
        intWallThickness:
          qtPartition === 'drywall' ? 0.095 : project.constructionMethod.internalWallThickness,
        constructionSystem: project.constructionMethod.methodId,
        entrySide: qtEntrySide,
        internalPartitionType: qtPartition,
        mepProfile: qtMepProfile,
        totalStories: storiesCount,
      });
      onUpdateProject((prev) => {
        const baseCfg = prev.implantation ?? createDefaultImplantationConfig(prev);
        let nextProj: Project = {
          ...prev,
          unitTypes: [...prev.unitTypes, ...bundle],
          implantation: {
            ...baseCfg,
            primaryUnitTypeId: baseCfg.primaryUnitTypeId || bundle[0].id,
            totalUnitsTarget: baseCfg.totalUnitsTarget <= 0 ? 1 : baseCfg.totalUnitsTarget,
            layoutPattern: prev.unitTypes.length === 0 ? 'isolada' : baseCfg.layoutPattern,
            primaryZone: prev.unitTypes.length === 0 ? 'centralizada' : baseCfg.primaryZone,
          },
        };
        if (nextProj.floors.length < storiesCount) {
          nextProj = setProjectFloorCount(nextProj, storiesCount, false);
        }
        return nextProj;
      }, `Criação do Sobrado ${qtCode.trim()} (${storiesCount} pavimentos vinculados)`);
      onSelectUnitType?.(bundle[0].id);
      setEditingUnitTypeId(null);
      setShowQuickTypeForm(false);
      return;
    }

    const allowMezz =
      qtBuildingKind === 'kitnet' && safeCeiling >= 3.0 && qtMezzanine;

    const cleanCode =
      qtCode.trim() || existingUt?.code || `TIPO-${project.unitTypes.length + 1}`;
    const cleanName = qtName.trim() || existingUt?.name || 'Kitnet Padrão';

    // Se apenas código/nome mudaram na edição, preserva quaisquer ajustes manuais feitos no Editor 2D
    const onlyMetadataChanged =
      Boolean(existingUt) &&
      existingUt!.width === safeWidth &&
      existingUt!.depth === safeDepth &&
      existingUt!.ceilingHeight === safeCeiling &&
      existingUt!.bedrooms === qtBedrooms &&
      (existingUt!.suites ?? 0) === qtSuites &&
      existingUt!.hasLaundry === qtLaundry &&
      existingUt!.hasBalcony === qtBalcony &&
      existingUt!.accessible === qtAccessible &&
      (existingUt!.entrySide ?? 'lateral_direita') === qtEntrySide &&
      (existingUt!.internalPartitionType ??
        project.constructionMethod.internalPartitionType ??
        'alvenaria') === qtPartition &&
      (existingUt!.mepProfile ?? 'simples') === qtMepProfile &&
      Boolean(existingUt!.hasMezzanine) === allowMezz &&
      (!allowMezz ||
        ((existingUt!.mezzanine?.elevationM ?? 2.15) === round2(qtMezzElev) &&
          (existingUt!.mezzanine?.sizingMode ?? 'percent') === qtMezzSizingMode &&
          Math.round((existingUt!.mezzanine?.coverageRatio ?? 0.3) * 100) === qtMezzPct &&
          (existingUt!.mezzanine?.customWidthM ?? existingUt!.mezzanine?.width) === round2(qtMezzCustomW) &&
          (existingUt!.mezzanine?.customDepthM ?? existingUt!.mezzanine?.depth) === round2(qtMezzCustomD) &&
          (existingUt!.mezzanine?.structureType ?? 'metalica_madeira') === qtMezzStruct &&
          (existingUt!.mezzanine?.zone ?? 'sobre_banho_cozinha') === qtMezzZone &&
          (existingUt!.mezzanine?.usage ?? 'dormitorio') === qtMezzUsage &&
          (existingUt!.mezzanine?.stairLayout ?? 'reta') === qtMezzStairLayout &&
          (existingUt!.mezzanine?.stairSide ?? 'direita') === qtMezzStairSide));

    const savedUt: UnitType = onlyMetadataChanged
      ? {
          ...existingUt!,
          code: cleanCode,
          name: cleanName,
        }
      : generateParametricUnitLayout({
          id: existingUt?.id,
          code: cleanCode,
          name: cleanName,
          basePreset: existingUt?.basePreset,
          finishStandard: existingUt?.finishStandard,
          buildingKind: existingUt?.buildingKind ?? qtBuildingKind,
          suites: qtSuites,
          bathrooms: existingUt?.bathrooms,
          hasDiningArea: existingUt?.hasDiningArea,
          totalStories: existingUt?.totalStories,
          storyIndex: existingUt?.storyIndex,
          linkedHouseGroupId: existingUt?.linkedHouseGroupId,
          width: safeWidth,
          depth: safeDepth,
          ceilingHeight: safeCeiling,
          bedrooms: qtBedrooms,
          hasLaundry: qtLaundry,
          hasBalcony: qtBalcony,
          hasMezzanine: allowMezz,
          accessible: qtAccessible,
          extWallThickness: project.constructionMethod.externalWallThickness,
          intWallThickness:
            qtPartition === 'drywall'
              ? 0.095
              : project.constructionMethod.internalWallThickness,
          constructionSystem: project.constructionMethod.methodId,
          entrySide: qtEntrySide,
          internalPartitionType: qtPartition,
          mepProfile: qtMepProfile,
          mezzanineZone: allowMezz ? qtMezzZone : undefined,
          mezzanineElevationM: allowMezz ? qtMezzElev : undefined,
          mezzanineSizingMode: allowMezz ? qtMezzSizingMode : undefined,
          mezzanineCoverageRatio: allowMezz ? qtMezzPct / 100 : undefined,
          mezzanineCustomWidthM:
            allowMezz && qtMezzSizingMode === 'dimensions' ? qtMezzCustomW : undefined,
          mezzanineCustomDepthM:
            allowMezz && qtMezzSizingMode === 'dimensions' ? qtMezzCustomD : undefined,
          mezzanineStructureType: allowMezz ? qtMezzStruct : undefined,
          mezzanineUsage: allowMezz ? qtMezzUsage : undefined,
          mezzanineStairLayout: allowMezz ? qtMezzStairLayout : undefined,
          mezzanineStairSide: allowMezz ? qtMezzStairSide : undefined,
        });

    onUpdateProject(
      (prev) => {
        const nextProj = updateUnitTypeInProject(prev, savedUt);
        if (!existingUt && nextProj.implantation) {
          return {
            ...nextProj,
            implantation: {
              ...nextProj.implantation,
              primaryUnitTypeId: nextProj.implantation.primaryUnitTypeId || savedUt.id,
            },
          };
        }
        return nextProj;
      },
      existingUt
        ? `Edição da tipologia ${savedUt.code} (${savedUt.width}×${savedUt.depth}m)`
        : `Criação da tipologia ${savedUt.code} (${savedUt.width}×${savedUt.depth}m) na implantação`,
    );
    onSelectUnitType?.(savedUt.id);
    setEditingUnitTypeId(null);
    setShowQuickTypeForm(false);
  };

  const handleApplyImplantation = () => {
    if (!activeFloor || project.unitTypes.length === 0) return;

    onUpdateProject((prev) => {
      const cfg = {
        ...(prev.implantation ?? createDefaultImplantationConfig(prev)),
        lastGeneratedAt: new Date().toISOString(),
      };
      const targetFloors = applyToAllFloors ? prev.floors : [activeFloor];

      const updatedFloors = prev.floors.map((fl) => {
        if (!targetFloors.some((tf) => tf.id === fl.id)) return fl;
        const generated = generateImplantationUnits(prev, cfg, fl.id);
        const corr = Math.max(0.9, cfg.circulation.corridorWidthM);
        return {
          ...fl,
          corridorWidth: corr,
          units: generated,
        };
      });

      return {
        ...prev,
        implantation: cfg,
        floors: updatedFloors,
      };
    }, `Aplicação da implantação configurada (${impConfig.couplingMode})`);
  };

  const handleAddFloor = () => {
    onUpdateProject((prev) => {
      const next = setProjectFloorCount(prev, prev.floors.length + 1, applyToAllFloors);
      const last = next.floors[next.floors.length - 1];
      if (last) setSelectedFloorId(last.id);
      return next;
    }, 'Adição de novo pavimento');
  };

  const handleSetFloorCount = (count: number) => {
    const clamped = Math.max(1, Math.min(20, Math.round(count || 1)));
    onUpdateProject((prev) => {
      const next = setProjectFloorCount(prev, clamped, applyToAllFloors);
      if (!next.floors.some((f) => f.id === selectedFloorId)) {
        setSelectedFloorId(next.floors[next.floors.length - 1]?.id ?? next.floors[0]?.id ?? '');
      }
      return next;
    }, `Ajuste da quantidade de andares para ${clamped} pavimento(s)`);
  };

  const handleReplicateGroundToUpper = () => {
    onUpdateProject(
      (prev) => replicateGroundFloorToAllFloors(prev),
      'Replicação do pavimento térreo para todos os andares superiores',
    );
  };

  const handleActiveFloorHeightChange = (heightM: number) => {
    if (!activeFloor) return;
    const clamped = Math.max(2.3, Math.min(6.0, round2(heightM || 2.95)));
    onUpdateProject(
      (prev) => ({
        ...prev,
        floors: recalculateFloorElevations(
          prev.floors.map((f) =>
            f.id === activeFloor.id ? { ...f, floorToFloorHeight: clamped } : f,
          ),
        ),
      }),
      `Ajuste de altura piso-a-piso do ${activeFloor.name} (${clamped}m)`,
    );
  };

  const handleAddUnitManual = (unitTypeId: string) => {
    if (!activeFloor) return;
    const ut = project.unitTypes.find((t) => t.id === unitTypeId);
    if (!ut) return;

    onUpdateProject((prev) => {
      const fl = prev.floors.find((f) => f.id === activeFloor.id);
      if (!fl) return prev;
      const num = `${fl.levelIndex + 1}${String(fl.units.length + 1).padStart(2, '0')}`;
      const b = siteCheck.buildableBox;
      const offsetStep = (fl.units.length % 4) * 0.5;
      const nextUnit: UnitInstance = {
        id: nextId('inst'),
        unitNumber: num,
        unitTypeId,
        floorId: fl.id,
        x: round2(b.x + offsetStep),
        y: round2(b.y + offsetStep),
        rotationDeg: 0,
        mirrored: false,
        zoneSide: 'personalizada',
        couplingType: impConfig.couplingMode === 'geminadas' ? 'geminada' : 'separada',
      };
      setSelectedUnitId(nextUnit.id);
      return {
        ...prev,
        floors: prev.floors.map((f) =>
          f.id === fl.id ? { ...f, units: [...f.units, nextUnit] } : f,
        ),
      };
    }, `Inserção manual de unidade no ${activeFloor.name}`);
  };

  const handleCustomizeUnitDimensions = (inst: UnitInstance) => {
    const baseUt = project.unitTypes.find((t) => t.id === inst.unitTypeId);
    if (!baseUt) return;
    setCustomizingUnitId(inst.id);
    setCustomW(baseUt.width);
    setCustomD(baseUt.depth);
    setCustomEntry(baseUt.entrySide ?? 'frente');
    setRightPaneTab('unidade');
  };

  const handleSaveCustomUnitDimensions = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customizingUnitId || !activeFloor) return;
    const inst = activeFloor.units.find((u) => u.id === customizingUnitId);
    if (!inst) return;

    onUpdateProject(
      (prev) => {
        const res = customizeUnitTypeForSlot(
          prev,
          activeFloor.id,
          inst.id,
          {
            width: Math.max(2.8, customW),
            depth: Math.max(3.6, customD),
            entrySide: customEntry,
          },
          applyToAllFloors,
        );
        return res ? res.project : prev;
      },
      `Edição da unidade ${inst.unitNumber} (${customW}×${customD}m, entrada ${customEntry})${applyToAllFloors && project.floors.length > 1 ? ' nos pavimentos' : ''}`,
    );
    setCustomizingUnitId(null);
  };

  const handleAddGroupSpec = () => {
    const defaultUtId = impConfig.primaryUnitTypeId || project.unitTypes[0]?.id || '';
    const newGrp: ImplantationGroupSpec = {
      id: nextId('grp'),
      label: `Bloco ${impConfig.groups.length + 1}`,
      zone: impConfig.groups.length % 2 === 0 ? 'lado_esquerdo' : 'lado_direito',
      count: 2,
      unitTypeId: defaultUtId,
      coupling: 'geminadas',
      spacingM: 1.5,
      mirroredRule: 'nenhuma',
      entranceOrientation: 'frente',
      shareWallWithNeighbor: true,
    };
    updateImplantation((c) => ({ ...c, groups: [...c.groups, newGrp] }));
  };

  const handleAddGate = (type: AccessGateType) => {
    const sideLen = site.front;
    const widthM = type === 'veiculo' ? 3.2 : 1.0;
    const newGate: SiteAccessGate = {
      id: nextId('gate'),
      label: type === 'veiculo' ? 'Portão de Veículos' : 'Portão de Pedestres',
      type,
      side: 'front',
      offsetM: round2(Math.max(0.4, (sideLen - widthM) * 0.5)),
      widthM,
      enabled: true,
    };
    updateSite((s) => ({ ...s, accesses: [...s.accesses, newGate] }));
  };

  const handleImportSurvey = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      let points: Point2D[] = [];
      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(txt);
        if (Array.isArray(parsed)) {
          points = parsed.filter((p) => typeof p.x === 'number' && typeof p.y === 'number');
        }
      } else {
        points = txt
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => {
            const [xs, ys] = l.split(/[;,\s]+/);
            return { x: Number(xs), y: Number(ys) };
          })
          .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      }

      if (points.length < 3) {
        setImportMsg('Arquivo não contém ao menos 3 vértices válidos (x, y).');
        return;
      }
      onUpdateProject(
        (prev) => ({
          ...prev,
          site: {
            ...prev.site,
            shapeType: 'poligonal',
            vertices: points,
          },
        }),
        'Importação de levantamento topográfico (vértices)',
      );
      setImportMsg(`Levantamento importado com ${points.length} vértices.`);
    } catch {
      setImportMsg('Erro ao processar arquivo de levantamento.');
    } finally {
      e.target.value = '';
    }
  };

  const sideLabels: Record<LotSideKey, string> = {
    front: 'Frente (Rua)',
    back: 'Fundos',
    left: 'Lateral Esquerda (vista da rua)',
    right: 'Lateral Direita (vista da rua)',
  };

  const hasMixedGroups =
    impConfig.couplingMode === 'mista' || impConfig.modelMode === 'misto_repeticao';
  const isPolygonalSite = site.shapeType === 'irregular' || site.shapeType === 'poligonal';

  return (
    <div className="mx-auto flex h-full w-full max-w-[1560px] flex-col gap-2 overflow-hidden p-3">
      {/* Compact Header & Top Actions */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#2A2F38] pb-2">
        <div className="min-w-0 flex items-center gap-3">
          <h1 className="text-base font-semibold text-white truncate">
            Terreno, Divisas &amp; Implantação
          </h1>
          <span className="hidden lg:inline text-[11px] text-[#949BA8] truncate">
            Lote {siteCheck.calculatedArea} m² · Edificável {siteCheck.buildableBox.area} m²
          </span>
          {siteCheck.hasAreaDivergence && (
            <span
              title={`Área informada (${siteCheck.declaredArea} m²) difere em ${siteCheck.areaDivergenceM2} m² da calculada (${siteCheck.calculatedArea} m²)`}
              className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-950/30 px-2 py-0.5 text-[10px] text-amber-200"
            >
              <AlertTriangle className="h-3 w-3 text-amber-400" />
              Dif. área: {siteCheck.areaDivergenceM2} m²
            </span>
          )}
          {importMsg && (
            <span className="rounded border border-[#2F7CF6]/40 bg-[#2F7CF6]/10 px-2 py-0.5 text-[10px] text-[#E6E9EF]">
              {importMsg}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded border border-[#323844] bg-[#14161A] p-0.5 text-[11px]">
            {(['m', 'cm'] as MeasurementUnit[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => updateSite((s) => ({ ...s, measurementUnit: u }))}
                className={`px-2 py-0.5 rounded font-mono transition ${
                  unit === u
                    ? 'bg-[#2F7CF6] text-white font-semibold'
                    : 'text-[#949BA8] hover:text-white'
                }`}
              >
                {u}
              </button>
            ))}
          </div>

          <input
            ref={surveyInputRef}
            type="file"
            accept=".csv,.txt,.json"
            onChange={handleImportSurvey}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => surveyInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded border border-[#323844] bg-[#1E222A] text-[#E6E9EF] hover:bg-[#262B35]"
          >
            <Upload className="w-3 h-3" />
            Importar Vértices
          </button>
        </div>
      </div>

      {/* Compact 4-Stage Progress Bar */}
      <nav
        aria-label="Etapas de configuração do terreno e implantação"
        className="grid shrink-0 grid-cols-2 xl:grid-cols-4 gap-2"
      >
        {STAGE_ITEMS.map((st) => {
          const isCurrent = activeStage === st.id;
          const isDone =
            (st.id === 1 && siteCheck.calculatedArea > 0) ||
            (st.id === 2 && (activeFloor?.units.length ?? 0) > 0) ||
            (st.id === 3 && (activeFloor?.units.length ?? 0) > 0) ||
            (st.id === 4 && validation.isValid && (activeFloor?.units.length ?? 0) > 0);
          return (
            <button
              key={st.id}
              type="button"
              onClick={() => setActiveStage(st.id)}
              className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition ${
                isCurrent
                  ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                  : 'border-[#2A2F38] bg-[#1B1E24] text-[#C4C9D4] hover:border-slate-600'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[11px] font-bold ${
                  isCurrent
                    ? 'bg-[#2F7CF6] text-white'
                    : isDone
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-[#14161A] text-[#949BA8] border border-[#2A2F38]'
                }`}
              >
                {st.num}
              </span>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold truncate">{st.title}</div>
                <div className="text-[10px] text-[#949BA8] truncate hidden sm:block">{st.subtitle}</div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Main Two-Column Studio Grid: Zero-scroll */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden xl:grid-cols-12">
        {/* LEFT PANE: 4-Stage Configuration */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#2A2F38] bg-[#1B1E24] xl:col-span-5">
          {/* ==================== ETAPA 1 ==================== */}
          {activeStage === 1 && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between gap-1 border-b border-[#2A2F38] bg-[#171A20] px-2.5 py-1.5">
                <div className="flex items-center gap-1">
                  {(
                    [
                      ['dimensoes', '1A. Lote'],
                      ['divisas', '1B. Divisas'],
                      ['portoes', `1C. Portões (${site.accesses.length})`],
                    ] as const
                  ).map(([tid, label]) => (
                    <button
                      key={tid}
                      type="button"
                      onClick={() => setStage1SubTab(tid)}
                      className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                        stage1SubTab === tid
                          ? 'bg-[#2F7CF6] text-white'
                          : 'text-[#949BA8] hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  {isPolygonalSite && (
                    <button
                      type="button"
                      onClick={() => setStage1SubTab('vertices')}
                      className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                        stage1SubTab === 'vertices'
                          ? 'bg-[#2F7CF6] text-white'
                          : 'text-[#949BA8] hover:text-white'
                      }`}
                    >
                      Vértices ({site.vertices.length})
                    </button>
                  )}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
                {stage1SubTab === 'dimensoes' && (
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[10px] text-[#949BA8] mb-0.5">
                        Nome / Identificação do Projeto
                      </label>
                      <input
                        type="text"
                        value={project.name}
                        onChange={(e) =>
                          onUpdateProject((prev) => ({ ...prev, name: e.target.value }))
                        }
                        className="w-full px-2.5 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">Formato do Lote</label>
                        <select
                          value={site.shapeType}
                          onChange={(e) =>
                            updateSite(
                              (s) => ({ ...s, shapeType: e.target.value as SiteShapeType }),
                              true,
                            )
                          }
                          className="w-full px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        >
                          <option value="retangular">Retangular</option>
                          <option value="quadrado">Quadrado</option>
                          <option value="trapezoidal">Trapezoidal</option>
                          <option value="irregular">Irregular (4 vértices)</option>
                          <option value="poligonal">Poligonal Livre</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">
                          Frente voltada para a Rua
                        </label>
                        <select
                          value={site.streetSide}
                          onChange={(e) =>
                            updateSite((s) => ({ ...s, streetSide: e.target.value as LotFrontSide }))
                          }
                          className="w-full px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        >
                          <option value="baixo">Abaixo (Padrão)</option>
                          <option value="cima">Acima</option>
                          <option value="esquerda">À Esquerda</option>
                          <option value="direita">À Direita</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">
                          Frente ({unit})
                        </label>
                        <NumericInput
                          min={unit === 'cm' ? 200 : 2}
                          value={toDisplay(site.front)}
                          onCommit={(val) =>
                            updateSite(
                              (s) => ({ ...s, front: Math.max(2, fromDisplay(val)) }),
                              true,
                            )
                          }
                          className="w-full px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">
                          Fundos ({unit})
                        </label>
                        <NumericInput
                          min={unit === 'cm' ? 200 : 2}
                          disabled={site.shapeType === 'retangular' || site.shapeType === 'quadrado'}
                          value={toDisplay(site.back)}
                          onCommit={(val) =>
                            updateSite(
                              (s) => ({ ...s, back: Math.max(2, fromDisplay(val)) }),
                              true,
                            )
                          }
                          className="w-full px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white disabled:opacity-45"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">
                          Prof. Esq. ({unit})
                        </label>
                        <NumericInput
                          min={unit === 'cm' ? 200 : 2}
                          disabled={site.shapeType === 'quadrado'}
                          value={toDisplay(site.leftDepth)}
                          onCommit={(val) =>
                            updateSite(
                              (s) => ({
                                ...s,
                                leftDepth: Math.max(2, fromDisplay(val)),
                              }),
                              true,
                            )
                          }
                          className="w-full px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white disabled:opacity-45"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">
                          Prof. Dir. ({unit})
                        </label>
                        <NumericInput
                          min={unit === 'cm' ? 200 : 2}
                          disabled={site.shapeType === 'retangular' || site.shapeType === 'quadrado'}
                          value={toDisplay(site.rightDepth)}
                          onCommit={(val) =>
                            updateSite(
                              (s) => ({
                                ...s,
                                rightDepth: Math.max(2, fromDisplay(val)),
                              }),
                              true,
                            )
                          }
                          className="w-full px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white disabled:opacity-45"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">
                          Área Matrícula (m²)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={site.declaredArea}
                          onChange={(e) =>
                            updateSite((s) => ({ ...s, declaredArea: Number(e.target.value) }))
                          }
                          className="w-full px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">Norte (°)</label>
                        <input
                          type="number"
                          step="5"
                          min={0}
                          max={359}
                          value={site.orientationDeg}
                          onChange={(e) =>
                            updateSite((s) => ({ ...s, orientationDeg: Number(e.target.value) }))
                          }
                          className="w-full px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">Topografia</label>
                        <select
                          value={site.topography}
                          onChange={(e) =>
                            updateSite((s) => ({
                              ...s,
                              topography: e.target.value as TopographyType,
                            }))
                          }
                          className="w-full px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        >
                          <option value="plano">Plano</option>
                          <option value="aclive">Aclive</option>
                          <option value="declive">Declive</option>
                          <option value="irregular">Irregular</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {stage1SubTab === 'divisas' && (
                  <div className="grid grid-cols-1 gap-2">
                    {(['front', 'back', 'left', 'right'] as LotSideKey[]).map((sideKey) => {
                      const b = site.boundaries[sideKey];
                      return (
                        <div
                          key={sideKey}
                          className="rounded border border-[#2A2F38] bg-[#14161A] p-2 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-200 truncate">
                              {sideLabels[sideKey]}
                            </span>
                            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer shrink-0">
                              <input
                                type="checkbox"
                                checked={b.hasNeighborBuilding}
                                onChange={(e) =>
                                  updateSite((s) => ({
                                    ...s,
                                    boundaries: {
                                      ...s.boundaries,
                                      [sideKey]: {
                                        ...s.boundaries[sideKey],
                                        hasNeighborBuilding: e.target.checked,
                                      },
                                    },
                                  }))
                                }
                              />
                              Vizinho construído
                            </label>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <select
                              aria-label={`Condição ${sideLabels[sideKey]}`}
                              value={b.condition}
                              onChange={(e) => {
                                const cond = e.target.value as BoundaryCondition;
                                updateSite((s) => ({
                                  ...s,
                                  boundaries: {
                                    ...s.boundaries,
                                    [sideKey]: {
                                      ...s.boundaries[sideKey],
                                      condition: cond,
                                      heightM:
                                        cond === 'aberta'
                                          ? 0
                                          : s.boundaries[sideKey].heightM || 2.0,
                                    },
                                  },
                                }));
                              }}
                              className="px-2 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                            >
                              <option value="murada">Murada (Alvenaria)</option>
                              <option value="aberta">Aberta (Sem muro)</option>
                              <option value="compartilhada">Divisa Compartilhada</option>
                              <option value="cerca">Cerca / Gradil</option>
                              <option value="outra">Outra condição</option>
                            </select>

                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-[#949BA8] whitespace-nowrap">
                                Alt. (m):
                              </span>
                              <input
                                type="number"
                                step="0.1"
                                min={0}
                                max={5}
                                disabled={b.condition === 'aberta'}
                                value={b.heightM}
                                onChange={(e) =>
                                  updateSite((s) => ({
                                    ...s,
                                    boundaries: {
                                      ...s.boundaries,
                                      [sideKey]: {
                                        ...s.boundaries[sideKey],
                                        heightM: Number(e.target.value),
                                      },
                                    },
                                  }))
                                }
                                className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white disabled:opacity-45"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {stage1SubTab === 'portoes' && (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex shrink-0 items-center justify-between gap-2 pb-2">
                      <span className="text-[11px] text-[#949BA8]">
                        Posição e largura dos acessos ao lote
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleAddGate('pedestre')}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-[#22262E] border border-[#323844] text-white hover:border-[#2F7CF6]"
                        >
                          <Plus className="w-3 h-3" /> Pedestre
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddGate('veiculo')}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-[#22262E] border border-[#323844] text-white hover:border-[#2F7CF6]"
                        >
                          <Plus className="w-3 h-3" /> Veículo
                        </button>
                      </div>
                    </div>

                    {site.accesses.length === 0 ? (
                      <p className="text-xs text-amber-300">
                        Nenhum portão cadastrado. Adicione um acesso acima se o lote possuir portões.
                      </p>
                    ) : (
                      <>
                        <div className="min-h-0 flex-1 space-y-2 overflow-hidden">
                          {gatesPager.slice.map((gate) => (
                            <div
                              key={gate.id}
                              className="rounded border border-[#2A2F38] bg-[#14161A] p-2 space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <label className="inline-flex items-center gap-2 text-xs font-medium text-white cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={gate.enabled}
                                    onChange={(e) =>
                                      updateSite((s) => ({
                                        ...s,
                                        accesses: s.accesses.map((g) =>
                                          g.id === gate.id ? { ...g, enabled: e.target.checked } : g,
                                        ),
                                      }))
                                    }
                                  />
                                  {gate.label}
                                </label>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateSite((s) => ({
                                      ...s,
                                      accesses: s.accesses.filter((g) => g.id !== gate.id),
                                    }))
                                  }
                                  aria-label={`Remover ${gate.label}`}
                                  className="p-1 text-red-400 hover:text-red-300"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-[10px] text-[#949BA8] mb-0.5">Divisa</label>
                                  <select
                                    value={gate.side}
                                    onChange={(e) =>
                                      updateSite((s) => ({
                                        ...s,
                                        accesses: s.accesses.map((g) =>
                                          g.id === gate.id
                                            ? { ...g, side: e.target.value as LotSideKey }
                                            : g,
                                        ),
                                      }))
                                    }
                                    className="w-full px-1.5 py-0.5 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                  >
                                    <option value="front">Frente</option>
                                    <option value="back">Fundos</option>
                                    <option value="left">Lat. Esq</option>
                                    <option value="right">Lat. Dir</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] text-[#949BA8] mb-0.5">
                                    Posição ({unit})
                                  </label>
                                  <input
                                    type="number"
                                    step={unit === 'cm' ? 10 : 0.2}
                                    min={0}
                                    value={toDisplay(gate.offsetM)}
                                    onChange={(e) =>
                                      updateSite((s) => ({
                                        ...s,
                                        accesses: s.accesses.map((g) =>
                                          g.id === gate.id
                                            ? { ...g, offsetM: Math.max(0, fromDisplay(Number(e.target.value))) }
                                            : g,
                                        ),
                                      }))
                                    }
                                    className="w-full px-1.5 py-0.5 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-[#949BA8] mb-0.5">
                                    Largura ({unit})
                                  </label>
                                  <input
                                    type="number"
                                    step={unit === 'cm' ? 10 : 0.1}
                                    min={unit === 'cm' ? 60 : 0.6}
                                    value={toDisplay(gate.widthM)}
                                    onChange={(e) =>
                                      updateSite((s) => ({
                                        ...s,
                                        accesses: s.accesses.map((g) =>
                                          g.id === gate.id
                                            ? { ...g, widthM: Math.max(0.6, fromDisplay(Number(e.target.value))) }
                                            : g,
                                        ),
                                      }))
                                    }
                                    className="w-full px-1.5 py-0.5 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <PaginationBar
                          compact
                          page={gatesPager.safePage}
                          totalPages={gatesPager.totalPages}
                          totalItems={site.accesses.length}
                          startIndex={gatesPager.start}
                          endIndex={gatesPager.end}
                          onPageChange={setGatesPage}
                          itemLabel="portões"
                        />
                      </>
                    )}
                  </div>
                )}

                {stage1SubTab === 'vertices' && isPolygonalSite && (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex shrink-0 items-center justify-between pb-2">
                      <span className="text-xs font-medium text-white">
                        Vértices do Polígono ({site.vertices.length})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateProject((prev) => {
                            const last =
                              prev.site.vertices[prev.site.vertices.length - 1] ?? { x: 0, y: 0 };
                            return {
                              ...prev,
                              site: {
                                ...prev.site,
                                shapeType: 'poligonal',
                                vertices: [
                                  ...prev.site.vertices,
                                  { x: round2(last.x - 1), y: round2(last.y + 1) },
                                ],
                              },
                            };
                          })
                        }
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-[#22262E] border border-[#323844] text-white hover:border-[#2F7CF6]"
                      >
                        <Plus className="w-3 h-3" /> Vértice
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 space-y-1.5 overflow-hidden">
                      {verticesPager.slice.map((v, localIdx) => {
                        const idx = verticesPager.start + localIdx;
                        return (
                          <div key={idx} className="flex items-center gap-2 text-xs">
                            <span className="font-mono text-[#949BA8] w-7">V{idx + 1}</span>
                            <input
                              type="number"
                              step="0.25"
                              value={v.x}
                              aria-label={`Vértice ${idx + 1} X`}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                onUpdateProject((prev) => ({
                                  ...prev,
                                  site: {
                                    ...prev.site,
                                    shapeType: 'poligonal',
                                    vertices: prev.site.vertices.map((pt, i) =>
                                      i === idx ? { ...pt, x: val } : pt,
                                    ),
                                  },
                                }));
                              }}
                              className="w-24 px-2 py-1 font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                            />
                            <input
                              type="number"
                              step="0.25"
                              value={v.y}
                              aria-label={`Vértice ${idx + 1} Y`}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                onUpdateProject((prev) => ({
                                  ...prev,
                                  site: {
                                    ...prev.site,
                                    shapeType: 'poligonal',
                                    vertices: prev.site.vertices.map((pt, i) =>
                                      i === idx ? { ...pt, y: val } : pt,
                                    ),
                                  },
                                }));
                              }}
                              className="w-24 px-2 py-1 font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                            />
                            {site.vertices.length > 3 && (
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateProject((prev) => ({
                                    ...prev,
                                    site: {
                                      ...prev.site,
                                      shapeType: 'poligonal',
                                      vertices: prev.site.vertices.filter((_, i) => i !== idx),
                                    },
                                  }))
                                }
                                className="p-1 text-red-400"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <PaginationBar
                      compact
                      page={verticesPager.safePage}
                      totalPages={verticesPager.totalPages}
                      totalItems={site.vertices.length}
                      startIndex={verticesPager.start}
                      endIndex={verticesPager.end}
                      onPageChange={setVerticesPage}
                      itemLabel="vértices"
                    />
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center justify-end border-t border-[#2A2F38] bg-[#171A20] px-3 py-2">
                <button
                  type="button"
                  onClick={() => setActiveStage(2)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#2F7CF6] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#2567d4]"
                >
                  Avançar para Etapa 2: Implantação
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ==================== ETAPA 2 ==================== */}
          {activeStage === 2 && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#2A2F38] bg-[#171A20] px-2.5 py-1.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setStage2SubTab('modelos')}
                    className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                      stage2SubTab === 'modelos'
                        ? 'bg-[#2F7CF6] text-white'
                        : 'text-[#949BA8] hover:text-white'
                    }`}
                  >
                    Modelos ({project.unitTypes.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStage2SubTab('implantacao')}
                    className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                      stage2SubTab === 'implantacao'
                        ? 'bg-[#2F7CF6] text-white'
                        : 'text-[#949BA8] hover:text-white'
                    }`}
                  >
                    Implantação &amp; Andares
                  </button>
                  {hasMixedGroups && (
                    <button
                      type="button"
                      onClick={() => setStage2SubTab('grupos')}
                      className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                        stage2SubTab === 'grupos'
                          ? 'bg-[#2F7CF6] text-white'
                          : 'text-[#949BA8] hover:text-white'
                      }`}
                    >
                      Grupos ({impConfig.groups.length})
                    </button>
                  )}
                </div>

                {stage2SubTab === 'modelos' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (showQuickTypeForm) {
                        setShowQuickTypeForm(false);
                        setEditingUnitTypeId(null);
                      } else {
                        openNewQuickTypeForm('kitnet');
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-[#323844] bg-[#14161A] text-white hover:border-[#2F7CF6]"
                  >
                    <Plus className="w-3 h-3 text-[#2F7CF6]" />
                    {showQuickTypeForm ? 'Lista' : 'Novo Modelo'}
                  </button>
                )}
              </div>

              {stage2SubTab === 'modelos' && (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
                  {showQuickTypeForm ? (
                    <form
                      onSubmit={handleQuickSaveTypology}
                      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-[#2F7CF6]/40 bg-[#14161A]"
                    >
                      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#2A2F38] px-3 py-1.5">
                        <span className="text-xs font-semibold text-sky-300">
                          {editingUnitTypeId
                            ? `Editando Modelo (${qtCode})`
                            : 'Novo Modelo de Edificação'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <div className="inline-flex rounded border border-[#2A2F38] bg-[#1B1E24] p-0.5 text-[10px]">
                            <button
                              type="button"
                              onClick={() => setQuickFormStep('basico')}
                              className={`px-2 py-0.5 rounded ${
                                quickFormStep === 'basico'
                                  ? 'bg-[#2F7CF6] text-white font-semibold'
                                  : 'text-[#949BA8]'
                              }`}
                            >
                              1. Medidas
                            </button>
                            <button
                              type="button"
                              onClick={() => setQuickFormStep('config')}
                              className={`px-2 py-0.5 rounded ${
                                quickFormStep === 'config'
                                  ? 'bg-[#2F7CF6] text-white font-semibold'
                                  : 'text-[#949BA8]'
                              }`}
                            >
                              2. Acesso/Mez.
                            </button>
                          </div>
                          {editingUnitTypeId && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUnitTypeId(null);
                                setShowQuickTypeForm(false);
                              }}
                              className="text-[11px] text-[#949BA8] hover:text-white"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="min-h-0 flex-1 overflow-hidden p-2.5 space-y-2.5">
                        {quickFormStep === 'basico' ? (
                          <>
                            {!editingUnitTypeId && (
                              <div className="grid grid-cols-3 gap-1 rounded border border-[#2A2F38] bg-[#1B1E24] p-1">
                                {(
                                  [
                                    ['kitnet', 'Kitnet / Studio'],
                                    ['casa_terrea', 'Casa Térrea'],
                                    ['casa_sobrado', 'Sobrado'],
                                  ] as const
                                ).map(([kv, kl]) => (
                                  <button
                                    key={kv}
                                    type="button"
                                    onClick={() => openNewQuickTypeForm(kv)}
                                    className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                                      qtBuildingKind === kv
                                        ? 'bg-[#2F7CF6] text-white font-semibold'
                                        : 'text-[#949BA8] hover:text-white'
                                    }`}
                                  >
                                    {kl}
                                  </button>
                                ))}
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] text-[#949BA8] mb-0.5">Código</label>
                                <input
                                  type="text"
                                  value={qtCode}
                                  onChange={(e) => setQtCode(e.target.value)}
                                  className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-[#949BA8] mb-0.5">Nome</label>
                                <input
                                  type="text"
                                  value={qtName}
                                  onChange={(e) => setQtName(e.target.value)}
                                  className="w-full px-2 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="block text-[10px] text-[#949BA8] mb-0.5">
                                  Largura (m)
                                </label>
                                <NumericInput
                                  min={2.8}
                                  max={20}
                                  value={qtWidth}
                                  onCommit={setQtWidth}
                                  className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-[#949BA8] mb-0.5">
                                  Profundidade (m)
                                </label>
                                <NumericInput
                                  min={3.6}
                                  max={25}
                                  value={qtDepth}
                                  onCommit={setQtDepth}
                                  className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-[#949BA8] mb-0.5">
                                  Pé-Direito (m)
                                </label>
                                <NumericInput
                                  min={2.4}
                                  max={6.0}
                                  value={qtCeiling}
                                  onCommit={(v) => {
                                    setQtCeiling(v);
                                    if (v < 3.0) setQtMezzanine(false);
                                  }}
                                  className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] text-[#949BA8] mb-0.5">Quartos</label>
                                <select
                                  value={qtBedrooms}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setQtBedrooms(val);
                                    if (val < 2) setQtSuites(0);
                                  }}
                                  className="w-full px-2 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                >
                                  {qtBuildingKind === 'kitnet' && <option value={0}>Studio (Integrado)</option>}
                                  <option value={1}>1 Quarto (Porta 70cm)</option>
                                  <option value={2}>2 Quartos (Casa)</option>
                                  <option value={3}>3 Quartos (Casa)</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] text-[#949BA8] mb-0.5">Entrada (P1)</label>
                                <select
                                  value={qtEntrySide}
                                  onChange={(e) => setQtEntrySide(e.target.value as EntrySide)}
                                  className="w-full px-2 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                >
                                  <option value="frente">Pela Frente (80cm)</option>
                                  <option value="lateral_direita">Lateral Dir. (80cm)</option>
                                  <option value="lateral_esquerda">Lateral Esq. (80cm)</option>
                                </select>
                              </div>
                            </div>

                            {qtBedrooms >= 1 && (qtWidth < 3.6 || qtDepth < 4.5) && (
                              <div className="rounded border border-amber-500/40 bg-amber-950/25 px-2.5 py-1 text-[10.5px] text-amber-200">
                                Para separar 1 Quarto com parede e porta de 70cm, recomenda-se largura ≥ 3,60 m e profundidade ≥ 4,50 m.
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] text-[#949BA8] mb-0.5">Divisórias</label>
                                <select
                                  value={qtPartition}
                                  onChange={(e) =>
                                    setQtPartition(e.target.value as InternalPartitionType)
                                  }
                                  className="w-full px-2 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                >
                                  <option value="alvenaria">Alvenaria</option>
                                  <option value="drywall">Drywall (9,5cm)</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] text-[#949BA8] mb-0.5">Instalações</label>
                                <select
                                  value={qtMepProfile}
                                  onChange={(e) =>
                                    setQtMepProfile(e.target.value as 'simples' | 'completo')
                                  }
                                  className="w-full px-2 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                >
                                  <option value="simples">Simples (Enxuto)</option>
                                  <option value="completo">Completo (AQ/AC)</option>
                                </select>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#C4C9D4]">
                              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={qtLaundry}
                                  onChange={(e) => setQtLaundry(e.target.checked)}
                                />
                                Área de Serviço
                              </label>
                              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={qtBalcony}
                                  onChange={(e) => setQtBalcony(e.target.checked)}
                                />
                                Varanda
                              </label>
                              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={qtAccessible}
                                  onChange={(e) => setQtAccessible(e.target.checked)}
                                />
                                Acessível NBR 9050
                              </label>
                              {qtBedrooms >= 2 && (
                                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={qtSuites >= 1}
                                    onChange={(e) => setQtSuites(e.target.checked ? 1 : 0)}
                                  />
                                  Suíte (2º BWC)
                                </label>
                              )}
                              {qtBuildingKind === 'casa_sobrado' && !editingUnitTypeId && (
                                <label className="inline-flex items-center gap-1.5 text-sky-300 font-medium">
                                  <span>Pavimentos:</span>
                                  <select
                                    value={qtTotalStories}
                                    onChange={(e) => setQtTotalStories(Number(e.target.value))}
                                    className="px-1.5 py-0.5 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                  >
                                    <option value={2}>2 Pav.</option>
                                    <option value={3}>3 Pav.</option>
                                  </select>
                                </label>
                              )}
                              {qtBuildingKind === 'kitnet' && qtCeiling >= 3.0 && (
                                <label className="inline-flex items-center gap-1.5 text-sky-300 cursor-pointer font-medium">
                                  <input
                                    type="checkbox"
                                    checked={qtMezzanine}
                                    onChange={(e) => setQtMezzanine(e.target.checked)}
                                  />
                                  Incluir Mezanino
                                </label>
                              )}
                            </div>

                            {qtCeiling >= 3.0 && qtMezzanine && (() => {
                              const qb = computeMezzanineInteriorBounds(
                                qtWidth,
                                qtDepth,
                                project.constructionMethod.externalWallThickness,
                                qtBalcony,
                              );
                              return (
                                <div className="rounded border border-sky-500/40 bg-[#1B1E24] p-2 space-y-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-[10px] font-semibold text-sky-200 mb-0.5">
                                        Elevação Mezanino (m)
                                      </label>
                                      <div className="flex items-center gap-1.5">
                                        <NumericInput
                                          min={2.0}
                                          max={round2(Math.max(2.05, qtCeiling - 1.05))}
                                          value={qtMezzElev}
                                          onCommit={setQtMezzElev}
                                          className="w-16 px-1.5 py-0.5 text-xs font-mono rounded bg-[#14161A] border border-[#2F7CF6] text-white"
                                        />
                                        <span className="text-[10px] font-mono text-[#949BA8]">
                                          PD sup: {round2(Math.max(0.8, qtCeiling - qtMezzElev - 0.12)).toFixed(2)}m
                                        </span>
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-[10px] text-[#949BA8] mb-0.5">
                                        Estrutura
                                      </label>
                                      <select
                                        value={qtMezzStruct}
                                        onChange={(e) => setQtMezzStruct(e.target.value as MezzanineStructureType)}
                                        className="w-full px-1.5 py-0.5 text-[11px] rounded bg-[#14161A] border border-[#2A2F38] text-white"
                                      >
                                        <option value="metalica_madeira">Metálica + Deck</option>
                                        <option value="madeira_estrutural">Madeira Maciça</option>
                                        <option value="steel_deck">Steel Deck</option>
                                        <option value="concreto_armado">Concreto Armado</option>
                                      </select>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-4 gap-1.5">
                                    <select
                                      aria-label="Localização do mezanino"
                                      value={qtMezzZone}
                                      onChange={(e) => setQtMezzZone(e.target.value as MezzanineZone)}
                                      className="px-1 py-0.5 text-[10px] rounded bg-[#14161A] border border-[#2A2F38] text-white"
                                    >
                                      <option value="sobre_banho_cozinha">BWC+Coz.</option>
                                      <option value="fundos">Fundos</option>
                                      <option value="lateral_esquerda">Lat. Esq.</option>
                                      <option value="lateral_direita">Lat. Dir.</option>
                                    </select>
                                    <select
                                      aria-label="Uso do mezanino"
                                      value={qtMezzUsage}
                                      onChange={(e) => setQtMezzUsage(e.target.value as MezzanineUsage)}
                                      className="px-1 py-0.5 text-[10px] rounded bg-[#14161A] border border-[#2A2F38] text-white"
                                    >
                                      <option value="dormitorio">Dormitório</option>
                                      <option value="dormitorio_home_office">Dorm+Office</option>
                                      <option value="home_office">Office</option>
                                      <option value="deposito_estar">Estar</option>
                                    </select>
                                    <select
                                      aria-label="Escada do mezanino"
                                      value={qtMezzStairLayout}
                                      onChange={(e) => setQtMezzStairLayout(e.target.value as MezzanineStairLayout)}
                                      className="px-1 py-0.5 text-[10px] rounded bg-[#14161A] border border-[#2A2F38] text-white"
                                    >
                                      <option value="reta">Reta</option>
                                      <option value="em_l">Em L</option>
                                      <option value="caracol_compacta">Helicoidal</option>
                                    </select>
                                    <select
                                      aria-label="Lado da escada"
                                      value={qtMezzStairSide}
                                      onChange={(e) => setQtMezzStairSide(e.target.value as 'esquerda' | 'direita')}
                                      className="px-1 py-0.5 text-[10px] rounded bg-[#14161A] border border-[#2A2F38] text-white"
                                    >
                                      <option value="direita">Esc. Dir.</option>
                                      <option value="esquerda">Esc. Esq.</option>
                                    </select>
                                  </div>

                                  <div className="flex items-center justify-between gap-2">
                                    <div className="inline-flex rounded border border-[#2A2F38] bg-[#14161A] p-0.5 text-[10px]">
                                      <button
                                        type="button"
                                        onClick={() => setQtMezzSizingMode('percent')}
                                        className={`px-1.5 py-0.5 rounded ${qtMezzSizingMode === 'percent' ? 'bg-[#2F7CF6] text-white' : 'text-[#949BA8]'}`}
                                      >
                                        %
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setQtMezzSizingMode('dimensions')}
                                        className={`px-1.5 py-0.5 rounded ${qtMezzSizingMode === 'dimensions' ? 'bg-[#2F7CF6] text-white' : 'text-[#949BA8]'}`}
                                      >
                                        m
                                      </button>
                                    </div>
                                    {qtMezzSizingMode === 'percent' ? (
                                      <div className="flex items-center gap-1">
                                        {[10, 20, 30, 40, 50].map((pct) => (
                                          <button
                                            key={pct}
                                            type="button"
                                            onClick={() => setQtMezzPct(pct)}
                                            className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                                              qtMezzPct === pct
                                                ? 'border-[#2F7CF6] bg-[#2F7CF6]/25 text-white'
                                                : 'border-[#2A2F38] bg-[#14161A] text-[#949BA8]'
                                            }`}
                                          >
                                            {pct}%
                                          </button>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1.5">
                                        <NumericInput
                                          min={1.0}
                                          max={qb.innerW}
                                          value={qtMezzCustomW}
                                          onCommit={setQtMezzCustomW}
                                          aria-label="Largura mezanino"
                                          className="w-14 px-1.5 py-0.5 text-[11px] font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                                        />
                                        <NumericInput
                                          min={1.0}
                                          max={qb.innerD}
                                          value={qtMezzCustomD}
                                          onCommit={setQtMezzCustomD}
                                          aria-label="Profundidade mezanino"
                                          className="w-14 px-1.5 py-0.5 text-[11px] font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[#2A2F38] bg-[#171A20] px-3 py-1.5">
                        <span className="text-[11px] font-mono text-[#949BA8]">
                          Área bruta: {round2(Math.max(2.8, qtWidth) * Math.max(3.6, qtDepth))} m²
                        </span>
                        <button
                          type="submit"
                          className="px-3 py-1 text-xs font-semibold rounded bg-[#2F7CF6] text-white hover:bg-[#2567d4]"
                        >
                          {editingUnitTypeId ? 'Salvar Modelo' : 'Salvar Tipologia'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="min-h-0 flex-1 space-y-2 overflow-hidden">
                        {project.unitTypes.length === 0 ? (
                          <div className="rounded border border-dashed border-[#2A2F38] p-4 text-center text-xs text-[#949BA8]">
                            Nenhum modelo cadastrado ainda. Clique em &quot;+ Novo Modelo&quot; acima.
                          </div>
                        ) : (
                          modelsPager.slice.map((ut) => {
                            const isPrimary =
                              (impConfig.primaryUnitTypeId || project.unitTypes[0]?.id) === ut.id;
                            const placedCount = project.floors.reduce(
                              (s, f) => s + f.units.filter((u) => u.unitTypeId === ut.id).length,
                              0,
                            );
                            const entryLabel =
                              ut.entrySide === 'frente'
                                ? 'Frente'
                                : ut.entrySide === 'lateral_esquerda'
                                  ? 'Lat. Esq.'
                                  : 'Lat. Dir.';
                            return (
                              <div
                                key={ut.id}
                                className={`rounded border p-2 transition ${
                                  isPrimary
                                    ? 'border-[#2F7CF6] bg-[#2F7CF6]/15'
                                    : 'border-[#2A2F38] bg-[#14161A]'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      updateImplantation((c) => ({ ...c, primaryUnitTypeId: ut.id }));
                                      onSelectUnitType?.(ut.id);
                                    }}
                                    className="text-left min-w-0 flex-1"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs font-mono font-semibold text-white">
                                        {ut.code}
                                      </span>
                                      <span className="text-xs text-[#C4C9D4] truncate">
                                        — {ut.name}
                                      </span>
                                      {isPrimary && (
                                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#2F7CF6]/30 text-sky-200 border border-[#2F7CF6]/50">
                                          Principal
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10.5px] font-mono text-[#949BA8] mt-0.5 truncate">
                                      {ut.buildingKind === 'casa_sobrado'
                                        ? `Sobrado ${(ut.storyIndex ?? 0) === 0 ? 'Térreo' : `${ut.storyIndex}º Pav.`}`
                                        : ut.buildingKind === 'casa_terrea'
                                          ? 'Casa Térrea'
                                          : 'Kitnet'}{' '}
                                      · {ut.width}×{ut.depth}m · Ent.: {entryLabel} ·{' '}
                                      {ut.bedrooms > 0 ? `${ut.bedrooms}Q` : 'Studio'} · {placedCount} unid.
                                    </div>
                                  </button>

                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => openEditQuickTypeForm(ut)}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border border-[#323844] bg-[#1B1E24] text-sky-200 hover:border-[#2F7CF6]"
                                    >
                                      <Pencil className="w-3 h-3" />
                                      Editar
                                    </button>
                                    {onNavigateModule && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onSelectUnitType?.(ut.id);
                                          onNavigateModule('planta2d');
                                        }}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border border-[#323844] bg-[#1B1E24] text-[#C4C9D4] hover:border-[#2F7CF6]"
                                      >
                                        <PenTool className="w-3 h-3 text-[#2F7CF6]" />
                                        2D
                                      </button>
                                    )}
                                    {confirmDeleteUtId === ut.id ? (
                                      <div className="inline-flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (editingUnitTypeId === ut.id) {
                                              setEditingUnitTypeId(null);
                                              setShowQuickTypeForm(false);
                                            }
                                            onUpdateProject(
                                              (prev) => deleteUnitTypeFromProject(prev, ut.id),
                                              `Exclusão do modelo ${ut.code}`,
                                            );
                                            setConfirmDeleteUtId(null);
                                          }}
                                          className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-600 text-white"
                                        >
                                          Sim
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteUtId(null)}
                                          className="px-1.5 py-0.5 text-[10px] rounded border border-[#323844] text-[#949BA8]"
                                        >
                                          Não
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        aria-label={`Excluir modelo ${ut.code}`}
                                        onClick={() => {
                                          if (placedCount > 0) {
                                            setConfirmDeleteUtId(ut.id);
                                          } else {
                                            onUpdateProject(
                                              (prev) => deleteUnitTypeFromProject(prev, ut.id),
                                              `Exclusão do modelo ${ut.code}`,
                                            );
                                          }
                                        }}
                                        className="p-1 text-red-400 hover:text-red-300"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                      <PaginationBar
                        compact
                        page={modelsPager.safePage}
                        totalPages={modelsPager.totalPages}
                        totalItems={project.unitTypes.length}
                        startIndex={modelsPager.start}
                        endIndex={modelsPager.end}
                        onPageChange={setModelsPage}
                        itemLabel="modelos"
                      />
                    </>
                  )}
                </div>
              )}

              {stage2SubTab === 'implantacao' && (
                <div className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden p-3 gap-2">
                  <div className="space-y-2.5 overflow-hidden">
                    {/* Quantidade de Andares (Pavimentos) & Resumo Total */}
                    <div className="rounded border border-[#2F7CF6]/40 bg-[#14161A] p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white">
                          Andares (Pavimentos)
                        </span>
                        <span className="text-[11px] font-mono text-sky-300">
                          {activeFloor?.units.length ?? 0} neste andar ·{' '}
                          {project.floors.reduce((s, f) => s + f.units.length, 0)} total
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] text-[#949BA8] mb-0.5">
                            Total de Pavimentos (1 a 20)
                          </label>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleSetFloorCount(project.floors.length - 1)}
                              disabled={project.floors.length <= 1}
                              aria-label="Diminuir quantidade de andares"
                              className="p-1 rounded border border-[#2A2F38] bg-[#1B1E24] text-slate-200 hover:border-[#2F7CF6] disabled:opacity-35"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={project.floors.length}
                              aria-label="Quantidade de andares"
                              onChange={(e) => handleSetFloorCount(Number(e.target.value))}
                              className="w-full px-2 py-0.5 text-center text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                            />
                            <button
                              type="button"
                              onClick={() => handleSetFloorCount(project.floors.length + 1)}
                              disabled={project.floors.length >= 20}
                              aria-label="Aumentar quantidade de andares"
                              className="p-1 rounded border border-[#2A2F38] bg-[#1B1E24] text-slate-200 hover:border-[#2F7CF6] disabled:opacity-35"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#949BA8] mb-0.5">
                            Piso-a-piso ({activeFloor?.name ?? 'Térreo'})
                          </label>
                          <input
                            type="number"
                            step="0.05"
                            min={2.3}
                            max={6.0}
                            value={activeFloor?.floorToFloorHeight ?? 2.95}
                            onChange={(e) => handleActiveFloorHeightChange(Number(e.target.value))}
                            className="w-full px-2 py-0.5 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">
                          Localização (da rua)
                        </label>
                        <select
                          value={impConfig.primaryZone}
                          onChange={(e) => {
                            const z = e.target.value as ImplantationZone;
                            updateImplantation((c) => ({
                              ...c,
                              primaryZone: z,
                              layoutPattern:
                                z === 'ambos_lados'
                                  ? 'ambos_lados'
                                  : z === 'fundos'
                                    ? 'conjunto_fundos'
                                    : z === 'personalizada'
                                      ? 'personalizada'
                                      : c.totalUnitsTarget === 1
                                        ? 'isolada'
                                        : 'sequencia',
                            }));
                          }}
                          className="w-full px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        >
                          <option value="frontal">Parte Frontal do Terreno</option>
                          <option value="central">Parte Central</option>
                          <option value="fundos">Nos Fundos</option>
                          <option value="lado_esquerdo">Lado Esquerdo (vista da rua)</option>
                          <option value="lado_direito">Lado Direito (vista da rua)</option>
                          <option value="ambos_lados">Nos Dois Lados</option>
                          <option value="centralizada">Centralizada no Lote</option>
                          <option value="personalizada">Personalizada (Arraste na planta)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">
                          Distribuição Espacial
                        </label>
                        <select
                          value={impConfig.layoutPattern}
                          onChange={(e) => {
                            const pat = e.target.value as ImplantationLayoutPattern;
                            updateImplantation((c) => ({
                              ...c,
                              layoutPattern: pat,
                              totalUnitsTarget:
                                pat === 'isolada'
                                  ? 1
                                  : pat === 'duas_lado_a_lado'
                                    ? 2
                                    : Math.max(1, c.totalUnitsTarget || 4),
                            }));
                          }}
                          className="w-full px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        >
                          <option value="isolada">1 Kitnet Isolada</option>
                          <option value="duas_lado_a_lado">2 Kitnets Lado a Lado</option>
                          <option value="sequencia">Sequência de Unidades</option>
                          <option value="duas_fileiras">Duas Fileiras</option>
                          <option value="ambos_lados">Lado Esquerdo + Direito</option>
                          <option value="conjunto_fundos">Conjunto nos Fundos</option>
                          <option value="personalizada">Personalizada / Mista</option>
                        </select>
                      </div>
                    </div>

                    {(impConfig.primaryZone === 'ambos_lados' ||
                      impConfig.layoutPattern === 'ambos_lados' ||
                      impConfig.layoutPattern === 'duas_fileiras') ? (
                      <div className="space-y-2">
                        <div className="rounded border border-[#2A2F38] bg-[#14161A] p-2">
                          <div className="text-[10px] text-slate-300 font-medium mb-1">
                            Unidades por Setor (informe 0 onde não houver — sem simetria obrigatória)
                          </div>
                          <div className="grid grid-cols-4 gap-1.5">
                            <div>
                              <label className="block text-[10px] text-[#949BA8]">Lat. Esq.</label>
                              <input
                                type="number"
                                min={0}
                                max={30}
                                value={impConfig.leftCount}
                                onChange={(e) => {
                                  const v = Math.max(0, Number(e.target.value));
                                  updateImplantation((c) => ({
                                    ...c,
                                    leftCount: v,
                                    totalUnitsTarget: v + c.rightCount + c.frontCount + c.backCount,
                                  }));
                                }}
                                className="w-full px-1.5 py-0.5 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-[#949BA8]">Lat. Dir.</label>
                              <input
                                type="number"
                                min={0}
                                max={30}
                                value={impConfig.rightCount}
                                onChange={(e) => {
                                  const v = Math.max(0, Number(e.target.value));
                                  updateImplantation((c) => ({
                                    ...c,
                                    rightCount: v,
                                    totalUnitsTarget: c.leftCount + v + c.frontCount + c.backCount,
                                  }));
                                }}
                                className="w-full px-1.5 py-0.5 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-[#949BA8]">Frente</label>
                              <input
                                type="number"
                                min={0}
                                max={30}
                                value={impConfig.frontCount}
                                onChange={(e) => {
                                  const v = Math.max(0, Number(e.target.value));
                                  updateImplantation((c) => ({
                                    ...c,
                                    frontCount: v,
                                    totalUnitsTarget: c.leftCount + c.rightCount + v + c.backCount,
                                  }));
                                }}
                                className="w-full px-1.5 py-0.5 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-[#949BA8]">Fundos</label>
                              <input
                                type="number"
                                min={0}
                                max={30}
                                value={impConfig.backCount}
                                onChange={(e) => {
                                  const v = Math.max(0, Number(e.target.value));
                                  updateImplantation((c) => ({
                                    ...c,
                                    backCount: v,
                                    totalUnitsTarget: c.leftCount + c.rightCount + c.frontCount + v,
                                  }));
                                }}
                                className="w-full px-1.5 py-0.5 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                              />
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#949BA8] mb-0.5">
                            Repetição das Unidades
                          </label>
                          <select
                            value={impConfig.modelMode}
                            onChange={(e) =>
                              updateImplantation((c) => ({
                                ...c,
                                modelMode: e.target.value as ImplantationModelMode,
                              }))
                            }
                            className="w-full px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                          >
                            <option value="todas_iguais">Sim, todas iguais (mesmo modelo)</option>
                            <option value="modelos_diferentes">Não, modelos diferentes (alternar)</option>
                            <option value="misto_repeticao">Misto (grupos + distintas)</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-[#949BA8] mb-0.5">
                            Qtd. no pavimento
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={40}
                            value={impConfig.totalUnitsTarget}
                            onChange={(e) =>
                              updateImplantation((c) => ({
                                ...c,
                                totalUnitsTarget: Math.max(0, Number(e.target.value)),
                              }))
                            }
                            className="w-full px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#949BA8] mb-0.5">
                            Repetição das Unidades
                          </label>
                          <select
                            value={impConfig.modelMode}
                            onChange={(e) =>
                              updateImplantation((c) => ({
                                ...c,
                                modelMode: e.target.value as ImplantationModelMode,
                              }))
                            }
                            className="w-full px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                          >
                            <option value="todas_iguais">Sim, todas iguais</option>
                            <option value="modelos_diferentes">Não, modelos diferentes</option>
                            <option value="misto_repeticao">Misto (grupos + distintas)</option>
                          </select>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">
                          Acoplamento entre Unidades
                        </label>
                        <select
                          value={impConfig.couplingMode}
                          onChange={(e) => {
                            const cm = e.target.value as ImplantationCouplingMode;
                            updateImplantation((c) => ({
                              ...c,
                              couplingMode: cm,
                              shareWallsWhenPossible: cm === 'geminadas',
                            }));
                          }}
                          className="w-full px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        >
                          <option value="geminadas">Geminadas (0 m)</option>
                          <option value="separadas">Separadas (afastamento)</option>
                          <option value="mista">Mista (por grupos)</option>
                          <option value="personalizada">Personalizada (livre)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">
                          {impConfig.couplingMode === 'separadas'
                            ? `Afastamento (${unit})`
                            : `Corredor (${unit})`}
                        </label>
                        {impConfig.couplingMode === 'separadas' ? (
                          <input
                            type="number"
                            step={unit === 'cm' ? 10 : 0.1}
                            min={unit === 'cm' ? 30 : 0.3}
                            value={toDisplay(impConfig.interUnitSpacingM)}
                            onChange={(e) =>
                              updateImplantation((c) => ({
                                ...c,
                                interUnitSpacingM: Math.max(0.1, fromDisplay(Number(e.target.value))),
                              }))
                            }
                            className="w-full px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2F7CF6] text-white"
                          />
                        ) : (
                          <input
                            type="number"
                            step={unit === 'cm' ? 10 : 0.1}
                            min={unit === 'cm' ? 90 : 0.9}
                            value={toDisplay(impConfig.circulation.corridorWidthM)}
                            onChange={(e) =>
                              updateImplantation((c) => ({
                                ...c,
                                circulation: {
                                  ...c.circulation,
                                  corridorWidthM: Math.max(0.9, fromDisplay(Number(e.target.value))),
                                },
                              }))
                            }
                            className="w-full px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                      <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={impConfig.mirrorAlternate}
                          onChange={(e) =>
                            updateImplantation((c) => ({ ...c, mirrorAlternate: e.target.checked }))
                          }
                        />
                        Espelhar opostas / alternadas
                      </label>

                      <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={applyToAllFloors}
                          onChange={(e) => setApplyToAllFloors(e.target.checked)}
                        />
                        Replicar nos {project.floors.length} pavimentos
                      </label>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 pt-2 border-t border-[#2A2F38]">
                    <button
                      type="button"
                      disabled={project.unitTypes.length === 0}
                      onClick={handleApplyImplantation}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-[#2F7CF6] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2567d4] disabled:opacity-40"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      Gerar / Atualizar Implantação
                    </button>
                    {hasMixedGroups && (
                      <button
                        type="button"
                        onClick={() => setStage2SubTab('grupos')}
                        className="px-2.5 py-1.5 text-xs rounded border border-sky-500/40 bg-sky-500/10 text-sky-200"
                      >
                        Grupos ({impConfig.groups.length})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveStage(3)}
                      className="inline-flex items-center gap-1 rounded-md border border-[#323844] bg-[#14161A] px-2.5 py-1.5 text-xs text-slate-200 hover:border-slate-500"
                    >
                      Etapa 3
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {stage2SubTab === 'grupos' && hasMixedGroups && (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
                  <div className="flex shrink-0 items-center justify-between pb-2">
                    <span className="text-xs font-medium text-white">
                      Blocos / Grupos de Repetição ({impConfig.groups.length})
                    </span>
                    <button
                      type="button"
                      onClick={handleAddGroupSpec}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-[#22262E] border border-[#323844] text-white hover:border-[#2F7CF6]"
                    >
                      <Plus className="w-3 h-3" /> Adicionar Grupo
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-hidden">
                    {groupsPager.slice.map((grp) => (
                      <div
                        key={grp.id}
                        className="rounded border border-[#2A2F38] bg-[#14161A] p-2 space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={grp.label}
                            onChange={(e) =>
                              updateImplantation((c) => ({
                                ...c,
                                groups: c.groups.map((g) =>
                                  g.id === grp.id ? { ...g, label: e.target.value } : g,
                                ),
                              }))
                            }
                            className="w-28 px-1.5 py-0.5 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                          />
                          <select
                            value={grp.zone}
                            onChange={(e) =>
                              updateImplantation((c) => ({
                                ...c,
                                groups: c.groups.map((g) =>
                                  g.id === grp.id
                                    ? {
                                        ...g,
                                        zone: e.target.value as ImplantationGroupSpec['zone'],
                                      }
                                    : g,
                                ),
                              }))
                            }
                            className="px-1.5 py-0.5 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                          >
                            <option value="lado_esquerdo">Lat. Esq.</option>
                            <option value="lado_direito">Lat. Dir.</option>
                            <option value="frontal">Frente</option>
                            <option value="fundos">Fundos</option>
                            <option value="centralizada">Central</option>
                          </select>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={grp.count}
                            aria-label={`Qtd ${grp.label}`}
                            onChange={(e) =>
                              updateImplantation((c) => ({
                                ...c,
                                groups: c.groups.map((g) =>
                                  g.id === grp.id
                                    ? { ...g, count: Math.max(1, Number(e.target.value)) }
                                    : g,
                                ),
                              }))
                            }
                            className="w-14 px-1.5 py-0.5 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateImplantation((c) => ({
                                ...c,
                                groups: c.groups.filter((g) => g.id !== grp.id),
                              }))
                            }
                            className="p-1 text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          <select
                            value={grp.unitTypeId}
                            onChange={(e) =>
                              updateImplantation((c) => ({
                                ...c,
                                groups: c.groups.map((g) =>
                                  g.id === grp.id ? { ...g, unitTypeId: e.target.value } : g,
                                ),
                              }))
                            }
                            className="px-1.5 py-0.5 text-[11px] rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                          >
                            {project.unitTypes.map((ut) => (
                              <option key={ut.id} value={ut.id}>
                                {ut.code} ({ut.width}×{ut.depth})
                              </option>
                            ))}
                          </select>
                          <select
                            value={grp.coupling}
                            onChange={(e) =>
                              updateImplantation((c) => ({
                                ...c,
                                groups: c.groups.map((g) =>
                                  g.id === grp.id
                                    ? {
                                        ...g,
                                        coupling: e.target.value as 'geminadas' | 'separadas',
                                      }
                                    : g,
                                ),
                              }))
                            }
                            className="px-1.5 py-0.5 text-[11px] rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                          >
                            <option value="geminadas">Geminadas</option>
                            <option value="separadas">Separadas</option>
                          </select>
                          <input
                            type="number"
                            step="0.1"
                            min={0}
                            disabled={grp.coupling === 'geminadas'}
                            value={grp.coupling === 'geminadas' ? 0 : grp.spacingM}
                            onChange={(e) =>
                              updateImplantation((c) => ({
                                ...c,
                                groups: c.groups.map((g) =>
                                  g.id === grp.id
                                    ? { ...g, spacingM: Math.max(0, Number(e.target.value)) }
                                    : g,
                                ),
                              }))
                            }
                            className="px-1.5 py-0.5 text-[11px] font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white disabled:opacity-40"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <PaginationBar
                    compact
                    page={groupsPager.safePage}
                    totalPages={groupsPager.totalPages}
                    totalItems={impConfig.groups.length}
                    startIndex={groupsPager.start}
                    endIndex={groupsPager.end}
                    onPageChange={setGroupsPage}
                    itemLabel="grupos"
                  />
                </div>
              )}
            </div>
          )}

          {/* ==================== ETAPA 3 ==================== */}
          {activeStage === 3 && (
            <div className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden p-3 gap-2">
              <div className="space-y-3 overflow-hidden">
                <div className="rounded border border-[#2A2F38] bg-[#14161A] p-2.5 space-y-2">
                  <h2 className="text-xs font-semibold text-white">
                    3A. Recuos &amp; Afastamentos do Terreno ({unit})
                  </h2>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[10px] text-[#949BA8] mb-0.5">
                        Frontal ({unit})
                      </label>
                      <input
                        type="number"
                        step={unit === 'cm' ? 10 : 0.25}
                        min={0}
                        value={toDisplay(site.setbacks.front)}
                        onChange={(e) =>
                          updateSite((s) => ({
                            ...s,
                            setbacks: {
                              ...s.setbacks,
                              front: Math.max(0, fromDisplay(Number(e.target.value))),
                            },
                          }))
                        }
                        className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#949BA8] mb-0.5">
                        Fundos ({unit})
                      </label>
                      <input
                        type="number"
                        step={unit === 'cm' ? 10 : 0.25}
                        min={0}
                        value={toDisplay(site.setbacks.back)}
                        onChange={(e) =>
                          updateSite((s) => ({
                            ...s,
                            setbacks: {
                              ...s.setbacks,
                              back: Math.max(0, fromDisplay(Number(e.target.value))),
                            },
                          }))
                        }
                        className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#949BA8] mb-0.5">
                        Lat. Esq. ({unit})
                      </label>
                      <input
                        type="number"
                        step={unit === 'cm' ? 10 : 0.25}
                        min={0}
                        value={toDisplay(site.setbacks.left)}
                        onChange={(e) =>
                          updateSite((s) => ({
                            ...s,
                            setbacks: {
                              ...s.setbacks,
                              left: Math.max(0, fromDisplay(Number(e.target.value))),
                            },
                          }))
                        }
                        className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#949BA8] mb-0.5">
                        Lat. Dir. ({unit})
                      </label>
                      <input
                        type="number"
                        step={unit === 'cm' ? 10 : 0.25}
                        min={0}
                        value={toDisplay(site.setbacks.right)}
                        onChange={(e) =>
                          updateSite((s) => ({
                            ...s,
                            setbacks: {
                              ...s.setbacks,
                              right: Math.max(0, fromDisplay(Number(e.target.value))),
                            },
                          }))
                        }
                        className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded border border-[#2A2F38] bg-[#14161A] p-2.5 space-y-2.5">
                  <h2 className="text-xs font-semibold text-white">
                    3B. Circulação, Corredores &amp; Áreas Externas
                  </h2>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-[#949BA8] mb-0.5">
                        Largura Corredor ({unit})
                      </label>
                      <input
                        type="number"
                        step={unit === 'cm' ? 10 : 0.1}
                        min={unit === 'cm' ? 90 : 0.9}
                        value={toDisplay(impConfig.circulation.corridorWidthM)}
                        onChange={(e) => {
                          const val = Math.max(0.9, fromDisplay(Number(e.target.value)));
                          onUpdateProject((prev) => {
                            const base = prev.implantation ?? createDefaultImplantationConfig(prev);
                            return {
                              ...prev,
                              implantation: {
                                ...base,
                                circulation: { ...base.circulation, corridorWidthM: val },
                              },
                              floors: prev.floors.map((f) =>
                                f.id === activeFloor?.id ? { ...f, corridorWidth: val } : f,
                              ),
                            };
                          });
                        }}
                        className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-[#949BA8] mb-0.5">
                        Afast. Mín. Separadas ({unit})
                      </label>
                      <input
                        type="number"
                        step={unit === 'cm' ? 10 : 0.1}
                        min={0}
                        value={toDisplay(impConfig.circulation.minInterUnitSpacingM)}
                        onChange={(e) => {
                          const val = Math.max(0, fromDisplay(Number(e.target.value)));
                          updateImplantation((c) => ({
                            ...c,
                            interUnitSpacingM:
                              c.couplingMode === 'separadas' ? val : c.interUnitSpacingM,
                            circulation: { ...c.circulation, minInterUnitSpacingM: val },
                          }));
                        }}
                        className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-[#949BA8] mb-0.5">Acesso</label>
                      <select
                        value={impConfig.circulation.accessMode}
                        onChange={(e) =>
                          updateImplantation((c) => ({
                            ...c,
                            circulation: {
                              ...c.circulation,
                              accessMode: e.target.value as ImplantationAccessMode,
                            },
                          }))
                        }
                        className="w-full px-2 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                      >
                        <option value="compartilhado">Compartilhado</option>
                        <option value="independente">Independente</option>
                        <option value="misto">Misto</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#949BA8] mb-0.5">
                        Serv. Ext. (m²)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        value={impConfig.circulation.serviceAreaM2}
                        onChange={(e) =>
                          updateImplantation((c) => ({
                            ...c,
                            circulation: {
                              ...c.circulation,
                              serviceAreaM2: Math.max(0, Number(e.target.value)),
                            },
                          }))
                        }
                        className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#949BA8] mb-0.5">
                        Área Descoberta
                      </label>
                      <div className="px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-emerald-300">
                        {validation.metrics.uncoveredAreaM2.toFixed(2)} m²
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded border border-slate-700/70 bg-[#14161A] p-2.5 text-[11px] text-[#949BA8] leading-snug">
                  {validation.municipalValidationNote}
                </div>
              </div>

              <div className="flex shrink-0 justify-end pt-2 border-t border-[#2A2F38]">
                <button
                  type="button"
                  onClick={() => setActiveStage(4)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#2F7CF6] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#2567d4]"
                >
                  Avançar para Etapa 4: Validação
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ==================== ETAPA 4 ==================== */}
          {activeStage === 4 && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 gap-2">
              <div className="flex shrink-0 items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-white">
                  4A. Indicadores Reais da Implantação
                </h2>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    validation.isValid ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {validation.isValid ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Implantação Válida
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5" /> {validation.criticalCount} conflito(s)
                    </>
                  )}
                </span>
              </div>

              <div className="grid shrink-0 grid-cols-3 gap-2 text-xs font-mono tabular-nums">
                <div className="rounded bg-[#14161A] border border-[#2A2F38] p-2">
                  <div className="text-[10px] text-[#949BA8]">Taxa Ocupação</div>
                  <div className="text-white font-semibold mt-0.5">
                    {validation.metrics.occupancyRatePercent}%
                  </div>
                </div>
                <div className="rounded bg-[#14161A] border border-[#2A2F38] p-2">
                  <div className="text-[10px] text-[#949BA8]">Área Implantada</div>
                  <div className="text-white font-semibold mt-0.5">
                    {validation.metrics.footprintAreaM2} m²
                  </div>
                </div>
                <div className="rounded bg-[#14161A] border border-[#2A2F38] p-2">
                  <div className="text-[10px] text-[#949BA8]">Paredes Geminadas</div>
                  <div className="text-amber-300 font-semibold mt-0.5">
                    {validation.metrics.sharedWallsCount} unid.
                  </div>
                </div>
              </div>

              {validation.metrics.realSetbacksMeasured.front !== null && (
                <div className="grid shrink-0 grid-cols-4 gap-2 text-[10.5px] font-mono tabular-nums rounded bg-[#14161A] border border-[#2A2F38] p-2">
                  <div>
                    <span className="text-[#949BA8] block">Rec. Fr.</span>
                    <span className="text-white">
                      {formatLengthInUnit(validation.metrics.realSetbacksMeasured.front ?? 0, unit)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#949BA8] block">Rec. Fd.</span>
                    <span className="text-white">
                      {formatLengthInUnit(validation.metrics.realSetbacksMeasured.back ?? 0, unit)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#949BA8] block">Rec. Esq.</span>
                    <span className="text-white">
                      {formatLengthInUnit(validation.metrics.realSetbacksMeasured.left ?? 0, unit)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#949BA8] block">Rec. Dir.</span>
                    <span className="text-white">
                      {formatLengthInUnit(validation.metrics.realSetbacksMeasured.right ?? 0, unit)}
                    </span>
                  </div>
                </div>
              )}

              {/* Live Paginated Validation Issues List */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 space-y-1.5 overflow-hidden">
                  {validation.issues.length === 0 ? (
                    <div className="rounded border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs text-emerald-200">
                      Nenhuma colisão, invasão de recuo ou bloqueio de acesso detectado neste pavimento.
                    </div>
                  ) : (
                    issuesPager.slice.map((issue) => (
                      <div
                        key={issue.id}
                        onClick={() => {
                          if (issue.affectedUnitIds[0]) {
                            setSelectedUnitId(issue.affectedUnitIds[0]);
                          }
                        }}
                        className={`rounded border p-2 text-xs space-y-0.5 ${
                          issue.severity === 'CRITICO'
                            ? 'border-red-500/40 bg-red-950/25 text-red-200'
                            : 'border-amber-500/40 bg-amber-950/25 text-amber-200'
                        } ${issue.affectedUnitIds.length > 0 ? 'cursor-pointer hover:brightness-110' : ''}`}
                      >
                        <div className="font-semibold flex items-center justify-between gap-2">
                          <span className="truncate">{issue.title}</span>
                          <span className="font-mono text-[10px] opacity-80 shrink-0">{issue.severity}</span>
                        </div>
                        <p className="text-[11px] opacity-90 line-clamp-2">{issue.detail}</p>
                      </div>
                    ))
                  )}
                </div>
                {validation.issues.length > 0 && (
                  <PaginationBar
                    compact
                    page={issuesPager.safePage}
                    totalPages={issuesPager.totalPages}
                    totalItems={validation.issues.length}
                    startIndex={issuesPager.start}
                    endIndex={issuesPager.end}
                    onPageChange={setIssuesPage}
                    itemLabel="alertas"
                  />
                )}
              </div>

              {onNavigateModule && (
                <div className="flex shrink-0 gap-2 pt-2 border-t border-[#2A2F38]">
                  <button
                    type="button"
                    onClick={() => onNavigateModule('planta2d')}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded border border-[#323844] bg-[#14161A] px-3 py-1.5 text-xs font-medium text-white hover:border-[#2F7CF6]"
                  >
                    <PenTool className="w-3.5 h-3.5 text-[#2F7CF6]" />
                    Editor CAD 2D
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateModule('bim3d')}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded bg-[#2F7CF6] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2567d4]"
                  >
                    <Box className="w-3.5 h-3.5" />
                    Modelo BIM 3D
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT PANE: Zero-Scroll Interactive Plan / Paginated Units Table / Selected Unit */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#2A2F38] bg-[#1B1E24] xl:col-span-7">
          {/* Top Bar */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#2A2F38] bg-[#171A20] px-3 py-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRightPaneTab('planta')}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                  rightPaneTab === 'planta'
                    ? 'bg-[#2F7CF6] text-white'
                    : 'text-[#949BA8] hover:text-white'
                }`}
              >
                Planta do Lote
              </button>
              <button
                type="button"
                onClick={() => setRightPaneTab('tabela')}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                  rightPaneTab === 'tabela'
                    ? 'bg-[#2F7CF6] text-white'
                    : 'text-[#949BA8] hover:text-white'
                }`}
              >
                Unidades ({activeFloor?.units.length ?? 0})
              </button>
              {selectedInstance && selectedInstanceType && (
                <button
                  type="button"
                  onClick={() => setRightPaneTab('unidade')}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                    rightPaneTab === 'unidade'
                      ? 'bg-[#2F7CF6] text-white'
                      : 'border border-[#2F7CF6]/40 bg-[#2F7CF6]/10 text-sky-200 hover:bg-[#2F7CF6]/20'
                  }`}
                >
                  Unid. {selectedInstance.unitNumber}
                </button>
              )}
            </div>

            {rightPaneTab === 'planta' ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-[#949BA8]">
                  <Compass className="w-3 h-3 text-amber-400" />
                  {site.orientationDeg}°
                </span>
                <div className="flex items-center gap-0.5 rounded border border-[#2A2F38] bg-[#14161A] p-0.5 text-[10.5px]">
                  {(
                    [
                      ['geral', 'Geral', Layers],
                      ['zonas', 'Zonas', Move],
                      ['cotas', 'Cotas', Ruler],
                      ['detalhe', 'Acessos', DoorOpen],
                    ] as const
                  ).map(([id, label, Icon]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setViewMode(id)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded transition ${
                        viewMode === id
                          ? 'bg-[#2F7CF6] text-white font-medium'
                          : 'text-[#949BA8] hover:text-white'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                {project.floors.map((fl) => (
                  <button
                    key={fl.id}
                    type="button"
                    onClick={() => setSelectedFloorId(fl.id)}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition ${
                      activeFloor?.id === fl.id
                        ? 'bg-[#2F7CF6] text-white'
                        : 'bg-[#14161A] border border-[#2A2F38] text-[#949BA8] hover:text-white'
                    }`}
                  >
                    {fl.name} ({fl.units.length})
                  </button>
                ))}
              </div>
            )}
          </div>

          {rightPaneTab === 'planta' && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* Summary Metrics Strip */}
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#2A2F38] bg-[#14161A] px-3 py-1.5 text-[11px] font-mono tabular-nums">
                <span className="text-slate-300">
                  Terreno: <strong className="text-white">{siteCheck.calculatedArea} m²</strong>
                </span>
                <span className="text-slate-300">
                  Edificável: <strong className="text-white">{siteCheck.buildableBox.area} m²</strong>
                </span>
                <span className="text-slate-300">
                  Unid.: <strong className="text-white">{activeFloor?.units.length ?? 0}</strong>
                </span>
                <span className="text-slate-300">
                  Ocup.: <strong className="text-white">{validation.metrics.occupancyRatePercent}%</strong>
                </span>
                <span className={validation.isValid ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                  {validation.isValid
                    ? 'Integridade OK'
                    : `${validation.criticalCount} alerta(s)`}
                </span>
              </div>

              {/* Interactive SVG Plan */}
              <div className="min-h-0 flex-1 bg-[#0F1217] overflow-hidden">
                <svg
                  ref={svgRef}
                  viewBox={`${minX} ${minY} ${viewW} ${viewH}`}
                  className="h-full w-full select-none cursor-crosshair"
                  onPointerMove={handleSvgPointerMove}
                  onPointerUp={stopDragging}
                  onPointerLeave={stopDragging}
                >
                <defs>
                  <pattern id="siteGridImp" width="1" height="1" patternUnits="userSpaceOnUse">
                    <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#1C212A" strokeWidth="0.04" />
                  </pattern>
                </defs>
                <rect x={minX} y={minY} width={viewW} height={viewH} fill="url(#siteGridImp)" />

                {/* Street & Perspective Indicator on actual streetSide */}
                {(() => {
                  const frontSeg = boundarySegments.find((s) => s.side === 'front');
                  if (!frontSeg) return null;
                  const midX = (frontSeg.a.x + frontSeg.b.x) / 2;
                  const midY = (frontSeg.a.y + frontSeg.b.y) / 2;
                  // Outward normal is opposite of inwardNormal
                  const outX = -frontSeg.inwardNormal.x;
                  const outY = -frontSeg.inwardNormal.y;
                  const stripW = Math.abs(frontSeg.b.x - frontSeg.a.x) || 2.2;
                  const stripH = Math.abs(frontSeg.b.y - frontSeg.a.y) || 2.2;
                  const rx =
                    outX !== 0
                      ? midX + outX * 1.4 - 1.1
                      : Math.min(frontSeg.a.x, frontSeg.b.x) - 0.8;
                  const ry =
                    outY !== 0
                      ? midY + outY * 1.4 - 1.1
                      : Math.min(frontSeg.a.y, frontSeg.b.y) - 0.8;
                  return (
                    <g>
                      <rect
                        x={rx}
                        y={ry}
                        width={outY !== 0 ? stripW + 1.6 : 2.2}
                        height={outX !== 0 ? stripH + 1.6 : 2.2}
                        fill="#1E293B"
                        fillOpacity="0.65"
                      />
                      <text
                        x={midX + outX * 1.5}
                        y={midY + outY * 1.5}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#94A3B8"
                        fontSize="0.52"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        VIA PÚBLICA / VISTA DA RUA
                      </text>
                    </g>
                  );
                })()}

                {/* Lot Fill */}
                <polygon
                  points={site.vertices.map((v) => `${v.x},${v.y}`).join(' ')}
                  fill="#171D26"
                  stroke="none"
                />

                {/* Individual Boundary Edges (murada / aberta / compartilhada / cerca) */}
                {boundarySegments.map((seg) => {
                  const cond = seg.boundary.condition;
                  const strokeColor =
                    cond === 'murada'
                      ? '#94A3B8'
                      : cond === 'compartilhada'
                        ? '#38BDF8'
                        : cond === 'cerca'
                          ? '#FBBF24'
                          : cond === 'aberta'
                            ? '#475569'
                            : '#A78BFA';
                  const strokeWidth = cond === 'murada' ? 0.24 : cond === 'compartilhada' ? 0.2 : 0.12;
                  const dash =
                    cond === 'aberta'
                      ? '0.35 0.3'
                      : cond === 'cerca'
                        ? '0.2 0.15'
                        : cond === 'compartilhada'
                          ? '0.6 0.15 0.15 0.15'
                          : undefined;
                  const mx = (seg.a.x + seg.b.x) / 2;
                  const my = (seg.a.y + seg.b.y) / 2;
                  return (
                    <g key={seg.side}>
                      <line
                        x1={seg.a.x}
                        y1={seg.a.y}
                        x2={seg.b.x}
                        y2={seg.b.y}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        strokeDasharray={dash}
                      />
                      {viewMode === 'cotas' && (
                        <text
                          x={mx - seg.inwardNormal.x * 0.65}
                          y={my - seg.inwardNormal.y * 0.65}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#CBD5E1"
                          fontSize="0.48"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {formatLengthInUnit(seg.lengthM, unit)} ({cond})
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Setbacks / Buildable Envelope */}
                {siteCheck.buildableBox.width > 0 && siteCheck.buildableBox.depth > 0 && (
                  <rect
                    x={siteCheck.buildableBox.x}
                    y={siteCheck.buildableBox.y}
                    width={siteCheck.buildableBox.width}
                    height={siteCheck.buildableBox.depth}
                    fill="#2F7CF6"
                    fillOpacity="0.05"
                    stroke="#F59E0B"
                    strokeDasharray="0.35 0.2"
                    strokeWidth="0.08"
                  />
                )}

                {/* Gates (Pedestre / Veiculo) */}
                {site.accesses.map((gate) => {
                  const gw = getGateWorldPosition(site, gate);
                  if (!gw) return null;
                  return (
                    <g key={gate.id}>
                      <line
                        x1={gw.p1.x}
                        y1={gw.p1.y}
                        x2={gw.p2.x}
                        y2={gw.p2.y}
                        stroke="#0F1217"
                        strokeWidth="0.34"
                      />
                      <line
                        x1={gw.p1.x}
                        y1={gw.p1.y}
                        x2={gw.p2.x}
                        y2={gw.p2.y}
                        stroke={gate.type === 'veiculo' ? '#38BDF8' : '#34D399'}
                        strokeWidth="0.16"
                      />
                      {/* Entry arrow inside lot */}
                      <line
                        x1={gw.center.x}
                        y1={gw.center.y}
                        x2={gw.center.x + gw.inwardNormal.x * 0.9}
                        y2={gw.center.y + gw.inwardNormal.y * 0.9}
                        stroke={gate.type === 'veiculo' ? '#38BDF8' : '#34D399'}
                        strokeWidth="0.08"
                        strokeDasharray="0.18 0.1"
                      />
                      <text
                        x={gw.center.x + gw.inwardNormal.x * 1.25}
                        y={gw.center.y + gw.inwardNormal.y * 1.25}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={gate.type === 'veiculo' ? '#7DD3FC' : '#6EE7B7'}
                        fontSize="0.42"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {gate.type === 'veiculo' ? 'VEÍC.' : 'PED.'} ({formatLengthInUnit(gate.widthM, unit)})
                      </text>
                    </g>
                  );
                })}

                {/* Units (Draggable, with schematic interior & selection/error highlight) */}
                {activeFloor?.units.map((inst) => {
                  const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
                  if (!ut) return null;
                  const rect = getUnitWorldRect(inst, ut);
                  const isSel = selectedUnitId === inst.id;
                  const hasCritical = validation.issues.some(
                    (iss) => iss.severity === 'CRITICO' && iss.affectedUnitIds.includes(inst.id),
                  );
                  const fillColor = hasCritical
                    ? '#EF4444'
                    : viewMode === 'zonas' && inst.zoneSide === 'esquerdo'
                      ? '#38BDF8'
                      : viewMode === 'zonas' && inst.zoneSide === 'direito'
                        ? '#A855F7'
                        : '#2F7CF6';
                  const strokeColor = isSel
                    ? '#FACC15'
                    : hasCritical
                      ? '#FCA5A5'
                      : '#93C5FD';

                  return (
                    <g
                      key={inst.id}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedUnitId(inst.id);
                        const pt = clientToWorld(e.clientX, e.clientY);
                        if (pt) {
                          setDraggingUnitId(inst.id);
                          setDragOffset({ dx: pt.x - rect.x, dy: pt.y - rect.y });
                        }
                      }}
                      className="cursor-move"
                    >
                      <rect
                        x={rect.x}
                        y={rect.y}
                        width={rect.width}
                        height={rect.depth}
                        fill={fillColor}
                        fillOpacity={isSel ? 0.34 : 0.22}
                        stroke={strokeColor}
                        strokeWidth={isSel ? 0.16 : 0.1}
                      />

                      {/* Inner wall outline schematic */}
                      <rect
                        x={rect.x + 0.14}
                        y={rect.y + 0.14}
                        width={Math.max(0.2, rect.width - 0.28)}
                        height={Math.max(0.2, rect.depth - 0.28)}
                        fill="none"
                        stroke={strokeColor}
                        strokeOpacity="0.4"
                        strokeWidth="0.04"
                      />

                      {/* Entry door (P1) visual indicator on unit perimeter */}
                      {(() => {
                        const entryOp =
                          ut.openings.find((o) => o.role === 'entrada') ??
                          ut.openings.find((o) => o.type === 'porta');
                        const entryWall = entryOp
                          ? ut.walls.find((w) => w.id === entryOp.wallId)
                          : undefined;
                        if (!entryOp || !entryWall) return null;
                        const localPos = getOpeningWorldPosition(entryWall, entryOp);
                        const halfW = entryOp.width / 2;
                        const dx = Math.cos(localPos.angleRad) * halfW;
                        const dy = Math.sin(localPos.angleRad) * halfW;
                        const wp1 = unitLocalToWorld(
                          inst,
                          ut,
                          localPos.center.x - dx,
                          localPos.center.y - dy,
                        );
                        const wp2 = unitLocalToWorld(
                          inst,
                          ut,
                          localPos.center.x + dx,
                          localPos.center.y + dy,
                        );
                        return (
                          <line
                            x1={wp1.x}
                            y1={wp1.y}
                            x2={wp2.x}
                            y2={wp2.y}
                            stroke="#34D399"
                            strokeWidth="0.2"
                            strokeLinecap="round"
                          />
                        );
                      })()}

                      <text
                        x={rect.x + rect.width / 2}
                        y={rect.y + rect.depth / 2 - 0.25}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#F8FAFC"
                        fontSize="0.54"
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {inst.unitNumber} ({ut.code})
                      </text>
                      <text
                        x={rect.x + rect.width / 2}
                        y={rect.y + rect.depth / 2 + 0.35}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#CBD5E1"
                        fontSize="0.4"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {rect.width.toFixed(1)}×{rect.depth.toFixed(1)}m
                        {inst.mirrored ? ' · ESP' : ''}
                      </text>
                    </g>
                  );
                })}

                {/* Shared Walls Highlight (Geminadas) */}
                {validation.sharedWalls.map((sw) => (
                  <g key={sw.id}>
                    <line
                      x1={sw.p1.x}
                      y1={sw.p1.y}
                      x2={sw.p2.x}
                      y2={sw.p2.y}
                      stroke={sw.conflictingOpenings.length > 0 ? '#EF4444' : '#F59E0B'}
                      strokeWidth="0.22"
                    />
                    <circle
                      cx={(sw.p1.x + sw.p2.x) / 2}
                      cy={(sw.p1.y + sw.p2.y) / 2}
                      r="0.32"
                      fill="#111317"
                      stroke="#F59E0B"
                      strokeWidth="0.08"
                    />
                    <text
                      x={(sw.p1.x + sw.p2.x) / 2}
                      y={(sw.p1.y + sw.p2.y) / 2 + 0.02}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#FCD34D"
                      fontSize="0.28"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      GEM
                    </text>
                  </g>
                ))}

                {/* Interactive Polygon Vertices */}
                {site.vertices.map((v, idx) => (
                  <g
                    key={idx}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setDraggingVertexIdx(idx);
                    }}
                    className="cursor-grab"
                  >
                    <circle
                      cx={v.x}
                      cy={v.y}
                      r="0.32"
                      fill="#60A5FA"
                      stroke="#0F1217"
                      strokeWidth="0.08"
                    />
                    <text x={v.x + 0.42} y={v.y - 0.3} fill="#94A3B8" fontSize="0.48">
                      V{idx + 1}
                    </text>
                  </g>
                ))}

                {/* North Compass */}
                <g
                  transform={`translate(${minX + viewW - 1.6}, ${minY + 1.6}) rotate(${site.orientationDeg})`}
                >
                  <circle cx="0" cy="0" r="0.85" fill="none" stroke="#64748B" strokeWidth="0.06" />
                  <polygon points="0,-0.72 -0.22,0.28 0,0.08 0.22,0.28" fill="#F59E0B" />
                  <text x="0" y="-1.0" textAnchor="middle" fill="#F59E0B" fontSize="0.48">
                    N
                  </text>
                </g>
                </svg>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#2A2F38] bg-[#171A20] px-3 py-1.5 text-[10.5px] text-[#949BA8]">
                <span>
                  Arraste qualquer unidade (snap 0,10 m) ou vértices azuis. Selecione para personalizar.
                </span>
                <div className="flex items-center gap-3">
                  {selectedInstance && (
                    <button
                      type="button"
                      onClick={() => handleCustomizeUnitDimensions(selectedInstance)}
                      className="rounded border border-[#2F7CF6] bg-[#2F7CF6]/15 px-2 py-0.5 text-[10.5px] font-medium text-sky-200 hover:bg-[#2F7CF6]/30"
                    >
                      Editar {selectedInstance.unitNumber}
                    </button>
                  )}
                  <span className="font-mono text-amber-300">
                    GEM = parede geminada
                  </span>
                </div>
              </div>
            </div>
          )}

          {rightPaneTab === 'tabela' && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#2A2F38] bg-[#14161A] px-3 py-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleAddFloor}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-[#323844] text-[#C4C9D4] hover:text-white hover:border-[#2F7CF6]"
                  >
                    <Plus className="w-3 h-3" />
                    Andar
                  </button>
                  {project.floors.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSetFloorCount(project.floors.length - 1)}
                        title="Remover último pavimento"
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-[#323844] text-red-300 hover:border-red-500/60"
                      >
                        <Minus className="w-3 h-3" />
                        Andar
                      </button>
                      {(project.floors[0]?.units.length ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={handleReplicateGroundToUpper}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-emerald-500/40 bg-emerald-600/15 text-emerald-200 hover:bg-emerald-600/30"
                        >
                          <Copy className="w-3 h-3" />
                          Replicar Térreo
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {project.unitTypes.slice(0, 4).map((ut) => (
                    <button
                      key={ut.id}
                      type="button"
                      onClick={() => handleAddUnitManual(ut.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-[#1B1E24] border border-[#323844] text-white hover:border-[#2F7CF6]"
                    >
                      <Plus className="w-3 h-3 text-[#2F7CF6]" />
                      +{ut.code}
                    </button>
                  ))}
                  {project.floors.length > 1 && (
                    <label className="inline-flex items-center gap-1 text-[10.5px] text-sky-200 cursor-pointer ml-1">
                      <input
                        type="checkbox"
                        checked={applyToAllFloors}
                        onChange={(e) => setApplyToAllFloors(e.target.checked)}
                      />
                      Sincronizar {project.floors.length} pav.
                    </label>
                  )}
                </div>
              </div>

              {activeFloor && (
                <>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#181B20] text-[11px] text-[#949BA8] border-b border-[#2A2F38]">
                        <tr>
                          <th className="py-1.5 px-2.5">Unid.</th>
                          <th className="py-1.5 px-2.5">Modelo</th>
                          <th className="py-1.5 px-2.5">Entrada (P1)</th>
                          <th className="py-1.5 px-2">X (m)</th>
                          <th className="py-1.5 px-2">Y (m)</th>
                          <th className="py-1.5 px-2">Rot.</th>
                          <th className="py-1.5 px-2">Esp.</th>
                          <th className="py-1.5 px-2.5 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#252A33]">
                        {activeFloor.units.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-8 text-center text-[#949BA8]">
                              Nenhuma unidade implantada neste pavimento. Configure a Etapa 2 à esquerda ou insira manualmente acima.
                            </td>
                          </tr>
                        ) : (
                          floorUnitsPager.slice.map((inst) => {
                            const isSel = selectedUnitId === inst.id;
                            const utInst = project.unitTypes.find((t) => t.id === inst.unitTypeId);
                            const currEntry: EntrySide = utInst?.entrySide ?? 'frente';
                            const worldSideLabel = formatWorldEntrySideLabel(
                              getEffectiveWorldEntrySide(currEntry, inst.rotationDeg, inst.mirrored),
                            );
                            return (
                              <tr
                                key={inst.id}
                                onClick={() => setSelectedUnitId(inst.id)}
                                className={isSel ? 'bg-[#2F7CF6]/15' : 'hover:bg-[#22262E]/40'}
                              >
                                <td className="py-1 px-2.5 font-mono font-semibold text-white">
                                  {inst.unitNumber}
                                </td>
                                <td className="py-1 px-2.5">
                                  <select
                                    value={inst.unitTypeId}
                                    onChange={(e) => {
                                      const nextUtId = e.target.value;
                                      onUpdateProject(
                                        (prev) =>
                                          updateFloorUnitInProject(
                                            prev,
                                            activeFloor.id,
                                            inst.id,
                                            { unitTypeId: nextUtId },
                                            applyToAllFloors,
                                          ),
                                        `Troca de tipologia da unidade ${inst.unitNumber}`,
                                      );
                                    }}
                                    className="px-1.5 py-0.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                                  >
                                    {project.unitTypes.map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.code} ({t.width}×{t.depth})
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-1 px-2.5">
                                  <select
                                    value={currEntry}
                                    title={`Porta P1 no lote: ${worldSideLabel}`}
                                    onChange={(e) => {
                                      const nextEntry = e.target.value as EntrySide;
                                      onUpdateProject(
                                        (prev) => {
                                          const res = customizeUnitTypeForSlot(
                                            prev,
                                            activeFloor.id,
                                            inst.id,
                                            { entrySide: nextEntry },
                                            applyToAllFloors,
                                          );
                                          return res ? res.project : prev;
                                        },
                                        `Entrada da unidade ${inst.unitNumber} alterada para ${nextEntry}`,
                                      );
                                    }}
                                    className="px-1.5 py-0.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-emerald-300"
                                  >
                                    <option value="frente">Frente</option>
                                    <option value="lateral_direita">Lat. Dir.</option>
                                    <option value="lateral_esquerda">Lat. Esq.</option>
                                  </select>
                                </td>
                                <td className="py-1 px-2">
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={inst.x}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      onUpdateProject((prev) =>
                                        updateFloorUnitInProject(
                                          prev,
                                          activeFloor.id,
                                          inst.id,
                                          { x: val },
                                          applyToAllFloors,
                                        ),
                                      );
                                    }}
                                    className="w-14 px-1 py-0.5 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                                  />
                                </td>
                                <td className="py-1 px-2">
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={inst.y}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      onUpdateProject((prev) =>
                                        updateFloorUnitInProject(
                                          prev,
                                          activeFloor.id,
                                          inst.id,
                                          { y: val },
                                          applyToAllFloors,
                                        ),
                                      );
                                    }}
                                    className="w-14 px-1 py-0.5 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                                  />
                                </td>
                                <td className="py-1 px-2">
                                  <select
                                    value={inst.rotationDeg}
                                    onChange={(e) => {
                                      const nextRot = Number(e.target.value);
                                      onUpdateProject(
                                        (prev) =>
                                          updateFloorUnitInProject(
                                            prev,
                                            activeFloor.id,
                                            inst.id,
                                            { rotationDeg: nextRot },
                                            applyToAllFloors,
                                          ),
                                        `Rotação da unidade ${inst.unitNumber} para ${nextRot}°`,
                                      );
                                    }}
                                    className="px-1 py-0.5 font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                                  >
                                    <option value={0}>0°</option>
                                    <option value={90}>90°</option>
                                    <option value={180}>180°</option>
                                    <option value={270}>270°</option>
                                  </select>
                                </td>
                                <td className="py-1 px-2">
                                  <input
                                    type="checkbox"
                                    checked={inst.mirrored}
                                    onChange={(e) => {
                                      const val = e.target.checked;
                                      onUpdateProject(
                                        (prev) =>
                                          updateFloorUnitInProject(
                                            prev,
                                            activeFloor.id,
                                            inst.id,
                                            { mirrored: val },
                                            applyToAllFloors,
                                          ),
                                        `Espelhamento da unidade ${inst.unitNumber}`,
                                      );
                                    }}
                                  />
                                </td>
                                <td className="py-1 px-2.5 text-right space-x-1 whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedUnitId(inst.id);
                                      handleCustomizeUnitDimensions(inst);
                                    }}
                                    title="Personalizar dimensões e entrada desta unidade"
                                    className="px-1.5 py-0.5 text-[10px] rounded border border-[#323844] text-sky-300 hover:border-[#2F7CF6]"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onUpdateProject((prev) => ({
                                        ...prev,
                                        floors: prev.floors.map((f) =>
                                          f.id === activeFloor.id
                                            ? {
                                                ...f,
                                                units: f.units.filter((u) => u.id !== inst.id),
                                              }
                                            : f,
                                        ),
                                      }));
                                    }}
                                    aria-label={`Remover unidade ${inst.unitNumber}`}
                                    className="p-1 text-red-400 hover:text-red-300"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar
                    page={floorUnitsPager.safePage}
                    totalPages={floorUnitsPager.totalPages}
                    totalItems={activeFloor.units.length}
                    startIndex={floorUnitsPager.start}
                    endIndex={floorUnitsPager.end}
                    onPageChange={setFloorUnitsPage}
                    itemLabel="unidades"
                  />
                </>
              )}
            </div>
          )}

          {rightPaneTab === 'unidade' && (
            <div className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden p-4">
              {selectedInstance && selectedInstanceType && activeFloor ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b border-[#2A2F38] pb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Unidade Selecionada: {selectedInstance.unitNumber} ({selectedInstanceType.code})
                      </h3>
                      <p className="text-[11px] text-[#949BA8] font-mono">
                        {selectedInstanceType.width}×{selectedInstanceType.depth}m ·{' '}
                        {selectedInstance.couplingType ?? 'isolada'} · Posição ({selectedInstance.x}m, {selectedInstance.y}m)
                      </p>
                    </div>
                    {customizingUnitId !== selectedInstance.id && (
                      <button
                        type="button"
                        onClick={() => handleCustomizeUnitDimensions(selectedInstance)}
                        className="px-3 py-1.5 text-xs font-medium rounded border border-[#2F7CF6] bg-[#2F7CF6]/15 text-sky-200 hover:bg-[#2F7CF6]/30"
                      >
                        Personalizar Medidas
                      </button>
                    )}
                  </div>

                  {customizingUnitId === selectedInstance.id ? (
                    <form
                      onSubmit={handleSaveCustomUnitDimensions}
                      className="rounded border border-[#2A2F38] bg-[#14161A] p-3.5 space-y-3"
                    >
                      <div className="text-xs text-sky-300 font-medium">
                        Editar dimensões e entrada da unidade {selectedInstance.unitNumber}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] text-[#949BA8] mb-0.5">Largura (m)</label>
                          <NumericInput
                            min={2.8}
                            max={20}
                            value={customW}
                            onCommit={setCustomW}
                            className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#949BA8] mb-0.5">Profund. (m)</label>
                          <NumericInput
                            min={3.6}
                            max={25}
                            value={customD}
                            onCommit={setCustomD}
                            className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#949BA8] mb-0.5">Entrada (modelo)</label>
                          <select
                            value={customEntry}
                            onChange={(e) => setCustomEntry(e.target.value as EntrySide)}
                            className="w-full px-2 py-1.5 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                          >
                            <option value="frente">Frente</option>
                            <option value="lateral_direita">Lat. Dir.</option>
                            <option value="lateral_esquerda">Lat. Esq.</option>
                          </select>
                        </div>
                      </div>
                      <div className="rounded bg-[#1B1E24] border border-emerald-500/30 px-2.5 py-1.5 text-[11px] text-emerald-300">
                        Porta P1 no lote:{' '}
                        <span className="font-semibold">
                          {formatWorldEntrySideLabel(
                            getEffectiveWorldEntrySide(
                              customEntry,
                              selectedInstance.rotationDeg,
                              selectedInstance.mirrored,
                            ),
                          )}
                        </span>
                        {selectedInstance.mirrored && ' (unidade espelhada: Esq. ↔ Dir.)'}
                      </div>
                      {project.floors.length > 1 && (
                        <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={applyToAllFloors}
                            onChange={(e) => setApplyToAllFloors(e.target.checked)}
                          />
                          Aplicar também nos {project.floors.length} pavimentos (ex.: {selectedInstance.unitNumber} e equivalentes)
                        </label>
                      )}
                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCustomizingUnitId(null);
                            setRightPaneTab('planta');
                          }}
                          className="px-3 py-1.5 text-xs rounded border border-[#323844] text-slate-300"
                        >
                          Voltar à Planta
                        </button>
                        <button
                          type="submit"
                          className="px-3.5 py-1.5 text-xs font-semibold rounded bg-[#2F7CF6] text-white"
                        >
                          {applyToAllFloors && project.floors.length > 1
                            ? 'Aplicar nos Pavimentos'
                            : 'Aplicar nesta Unidade'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="rounded border border-[#2A2F38] bg-[#14161A] p-3 text-xs text-[#949BA8]">
                      Clique em &quot;Personalizar Medidas&quot; acima para criar ou ajustar dimensões exclusivas para esta unidade, ou volte para a Planta/Tabela.
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded border border-[#2A2F38] bg-[#14161A] p-4 text-xs text-[#949BA8]">
                  Nenhuma unidade selecionada. Selecione uma unidade na planta ou na tabela.
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-[#2A2F38]">
                <button
                  type="button"
                  onClick={() => setRightPaneTab('planta')}
                  className="px-3 py-1.5 text-xs rounded border border-[#323844] text-slate-200 hover:border-[#2F7CF6]"
                >
                  Voltar para Planta do Lote
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
