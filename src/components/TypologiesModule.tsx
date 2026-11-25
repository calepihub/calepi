import React, { useState } from 'react';
import { ArrowRight, Copy, FlipHorizontal2, Layers, LayoutGrid, Minus, Plus, Trash2, Wand2 } from 'lucide-react';
import { getRoomArea, getRoomPerimeter, getUnitUsefulArea, round2 } from '../engine/geometry';
import {
  deleteUnitTypeFromProject,
  replicateGroundFloorToAllFloors,
  setProjectFloorCount,
  updateUnitTypeInProject,
} from '../engine/implantation';
import {
  autoDistributeUnitsAcrossFloors,
  computeBlondelStairSpec,
  computeMezzanineInteriorBounds,
  generateMultiStoryHouseBundle,
  generateParametricUnitLayout,
  nextId,
} from '../engine/parametricGenerator';
import { NumericInput } from './NumericInput';
import { PaginationBar, paginateItems, useViewportPageSize } from './PaginationBar';
import type {
  BuildingKind,
  EntrySide,
  InternalPartitionType,
  MezzanineStairLayout,
  MezzanineStructureType,
  MezzanineUsage,
  MezzanineZone,
  Project,
  Room,
  RoomCategory,
  UnitType,
} from '../types/project';

interface TypologiesModuleProps {
  project: Project;
  selectedUnitTypeId: string;
  onSelectUnitType: (id: string) => void;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
  onOpen2DEditor: () => void;
  onOpenImplantation?: () => void;
}

const PRESETS = [
  { label: 'Kitnet compacta (20 m²)', kind: 'kitnet' as BuildingKind, width: 4.0, depth: 5.0, bedrooms: 0, suites: 0, stories: 1, laundry: false, balcony: false, acc: false },
  { label: 'Kitnet padrão (25 m²)', kind: 'kitnet' as BuildingKind, width: 4.0, depth: 6.25, bedrooms: 0, suites: 0, stories: 1, laundry: true, balcony: false, acc: false },
  { label: 'Kitnet ampliada (30 m²)', kind: 'kitnet' as BuildingKind, width: 4.0, depth: 7.5, bedrooms: 1, suites: 0, stories: 1, laundry: true, balcony: true, acc: false },
  { label: 'Studio urbano (28 m²)', kind: 'kitnet' as BuildingKind, width: 4.2, depth: 6.7, bedrooms: 0, suites: 0, stories: 1, laundry: true, balcony: true, acc: false },
  { label: 'Loft / Mezanino (35 m²)', kind: 'kitnet' as BuildingKind, width: 5.0, depth: 7.0, bedrooms: 1, suites: 0, stories: 1, laundry: true, balcony: true, acc: false },
  { label: 'Unidade Acessível NBR 9050 (32 m²)', kind: 'kitnet' as BuildingKind, width: 4.5, depth: 7.1, bedrooms: 1, suites: 0, stories: 1, laundry: true, balcony: false, acc: true },
];

const HOUSE_PRESETS = [
  { label: 'Casa Térrea 1Q Compacta (42 m²)', kind: 'casa_terrea' as BuildingKind, width: 6.0, depth: 7.0, bedrooms: 1, suites: 0, stories: 1, laundry: true, balcony: false, acc: false },
  { label: 'Casa Térrea 2Q c/ Suíte (63 m²)', kind: 'casa_terrea' as BuildingKind, width: 7.0, depth: 9.0, bedrooms: 2, suites: 1, stories: 1, laundry: true, balcony: true, acc: false },
  { label: 'Casa Térrea 3Q c/ Suíte (88 m²)', kind: 'casa_terrea' as BuildingKind, width: 8.0, depth: 11.0, bedrooms: 3, suites: 1, stories: 1, laundry: true, balcony: true, acc: false },
  { label: 'Sobrado 2 Pav. 2Q c/ Suíte (~108 m²)', kind: 'casa_sobrado' as BuildingKind, width: 6.4, depth: 8.4, bedrooms: 2, suites: 1, stories: 2, laundry: true, balcony: false, acc: false },
  { label: 'Sobrado 2 Pav. 3Q c/ Suíte (~132 m²)', kind: 'casa_sobrado' as BuildingKind, width: 7.0, depth: 9.4, bedrooms: 3, suites: 1, stories: 2, laundry: true, balcony: true, acc: false },
  { label: 'Sobrado 3 Pav. c/ Ático (~180 m²)', kind: 'casa_sobrado' as BuildingKind, width: 6.8, depth: 8.8, bedrooms: 3, suites: 1, stories: 3, laundry: true, balcony: true, acc: false },
];

export const TypologiesModule: React.FC<TypologiesModuleProps> = ({
  project,
  selectedUnitTypeId,
  onSelectUnitType,
  onUpdateProject,
  onOpen2DEditor,
  onOpenImplantation,
}) => {
  const activeUt =
    project.unitTypes.find((u) => u.id === selectedUnitTypeId) ?? project.unitTypes[0];

  const [newBuildingKind, setNewBuildingKind] = useState<BuildingKind>('kitnet');
  const [newSuites, setNewSuites] = useState(0);
  const [newTotalStories, setNewTotalStories] = useState(2);

  const [newCode, setNewCode] = useState(`TIPO-${String.fromCharCode(65 + project.unitTypes.length)}`);
  const [newName, setNewName] = useState('Nova Kitnet Paramétrica');
  const [newWidth, setNewWidth] = useState(4.2);
  const [newDepth, setNewDepth] = useState(6.0);
  const [newCeilingHeight, setNewCeilingHeight] = useState(2.8);
  const [newBedrooms, setNewBedrooms] = useState(0);
  const [newEntrySide, setNewEntrySide] = useState<EntrySide>('frente');
  const [newPartitionType, setNewPartitionType] = useState<InternalPartitionType>(
    project.constructionMethod.internalPartitionType ?? 'alvenaria',
  );
  const [newLaundry, setNewLaundry] = useState(true);
  const [newBalcony, setNewBalcony] = useState(false);
  const [newAcc, setNewAcc] = useState(false);
  const [newMepProfile, setNewMepProfile] = useState<'simples' | 'completo'>('simples');

  // Perguntas de mezanino (somente visíveis e aplicáveis se pé-direito >= 3,00m)
  const [newMezzEnabled, setNewMezzEnabled] = useState(false);
  const [newMezzZone, setNewMezzZone] = useState<MezzanineZone>('sobre_banho_cozinha');
  const [newMezzElev, setNewMezzElev] = useState(2.15);
  const [newMezzSizingMode, setNewMezzSizingMode] = useState<'percent' | 'dimensions'>('percent');
  const [newMezzCoverage, setNewMezzCoverage] = useState(0.3);
  const [newMezzCustomW, setNewMezzCustomW] = useState(3.8);
  const [newMezzCustomD, setNewMezzCustomD] = useState(2.2);
  const [newMezzUsage, setNewMezzUsage] = useState<MezzanineUsage>('dormitorio');
  const [newMezzStructure, setNewMezzStructure] = useState<MezzanineStructureType>('metalica_madeira');
  const [newMezzStairLayout, setNewMezzStairLayout] = useState<MezzanineStairLayout>('reta');
  const [newMezzStairSide, setNewMezzStairSide] = useState<'esquerda' | 'direita'>('direita');

  const [distNotice, setDistNotice] = useState<string | null>(null);
  const [confirmDeleteActiveUtId, setConfirmDeleteActiveUtId] = useState<string | null>(null);

  // Zero-scroll studio tabs & pagination
  const [leftTab, setLeftTab] = useState<'lista' | 'nova'>('lista');
  const [newFormStep, setNewFormStep] = useState<'basico' | 'config'>('basico');
  const [rightTab, setRightTab] = useState<'geral' | 'mep_mezz' | 'ambientes'>('geral');
  const [listPage, setListPage] = useState(0);
  const [roomsPage, setRoomsPage] = useState(0);
  const listPageSize = useViewportPageSize(330, 74, 3, 8);
  const roomsPageSize = useViewportPageSize(350, 118, 2, 5);

  const canNewMezzanine = newBuildingKind === 'kitnet' && newCeilingHeight >= 3.0;
  const newInteriorBounds = computeMezzanineInteriorBounds(
    newWidth,
    newDepth,
    project.constructionMethod.externalWallThickness,
    newBalcony,
  );
  const previewNewStair = canNewMezzanine && newMezzEnabled
    ? computeBlondelStairSpec(newMezzElev, newMezzStairLayout)
    : null;

  const handleAutoDistribute = () => {
    if (!activeUt) return;
    let totalPlaced = 0;
    onUpdateProject((prev) => {
      const next = autoDistributeUnitsAcrossFloors(prev, activeUt.id);
      totalPlaced = next.floors.reduce((s, f) => s + f.units.length, 0);
      return next;
    }, `Distribuição automática da tipologia ${activeUt.code} nos pavimentos`);
    setDistNotice(
      totalPlaced > 0
        ? `Unidades da tipologia ${activeUt.code} posicionadas nos pavimentos vazios respeitando os recuos.`
        : 'Todos os pavimentos já possuem unidades posicionadas ou não comportam a largura desta tipologia.',
    );
    setTimeout(() => setDistNotice(null), 5000);
  };

  const switchNewBuildingKind = (kind: BuildingKind) => {
    setNewBuildingKind(kind);
    const letter = String.fromCharCode(65 + Math.min(25, project.unitTypes.length));
    if (kind === 'casa_terrea') {
      setNewCode(`CASA-${letter}`);
      setNewName('Casa Térrea Residencial');
      setNewWidth(7.0);
      setNewDepth(9.0);
      setNewCeilingHeight(2.85);
      setNewBedrooms(2);
      setNewSuites(1);
      setNewEntrySide('frente');
      setNewLaundry(true);
      setNewMepProfile('completo');
      setNewMezzEnabled(false);
    } else if (kind === 'casa_sobrado') {
      setNewCode(`SOB-${letter}`);
      setNewName('Sobrado Residencial');
      setNewWidth(6.8);
      setNewDepth(8.8);
      setNewCeilingHeight(2.85);
      setNewBedrooms(3);
      setNewSuites(1);
      setNewTotalStories(2);
      setNewEntrySide('frente');
      setNewLaundry(true);
      setNewMepProfile('completo');
      setNewMezzEnabled(false);
    } else {
      setNewCode(`TIPO-${letter}`);
      setNewName('Nova Kitnet Paramétrica');
      setNewWidth(4.2);
      setNewDepth(6.0);
      setNewCeilingHeight(2.8);
      setNewBedrooms(0);
      setNewSuites(0);
      setNewMepProfile('simples');
    }
  };

  const handleCreateTypology = (e: React.FormEvent) => {
    e.preventDefault();
    const intWallT =
      newPartitionType === 'drywall'
        ? 0.095
        : project.constructionMethod.internalWallThickness;

    if (newBuildingKind === 'casa_sobrado') {
      const storiesCount = Math.max(2, Math.min(3, newTotalStories));
      const bundle = generateMultiStoryHouseBundle({
        code: newCode.trim() || `SOB-${project.unitTypes.length + 1}`,
        name: newName.trim() || 'Sobrado Residencial',
        width: newWidth,
        depth: newDepth,
        ceilingHeight: newCeilingHeight,
        bedrooms: Math.max(1, newBedrooms),
        suites: newSuites,
        hasLaundry: newLaundry,
        hasBalcony: newBalcony,
        hasMezzanine: false,
        accessible: newAcc,
        extWallThickness: project.constructionMethod.externalWallThickness,
        intWallThickness: intWallT,
        constructionSystem: project.constructionMethod.methodId,
        entrySide: newEntrySide,
        internalPartitionType: newPartitionType,
        mepProfile: newMepProfile,
        totalStories: storiesCount,
      });
      onUpdateProject((prev) => {
        const withTypes: Project = {
          ...prev,
          unitTypes: [...prev.unitTypes, ...bundle],
        };
        return prev.floors.length < storiesCount
          ? setProjectFloorCount(withTypes, storiesCount, false)
          : withTypes;
      }, `Criação do Sobrado ${newCode.trim()} (${storiesCount} pavimentos vinculados)`);
      onSelectUnitType(bundle[0].id);
      setLeftTab('lista');
      setNewCode(`SOB-${String.fromCharCode(65 + project.unitTypes.length + bundle.length)}`);
      setDistNotice(
        `Sobrado criado com ${bundle.length} plantas vinculadas (Térreo + Pavimento Superior${storiesCount >= 3 ? ' + Ático' : ''}) e escada Blondel alinhada ao vão da laje.`,
      );
      setTimeout(() => setDistNotice(null), 6000);
      return;
    }

    const allowMezz = newBuildingKind === 'kitnet' && newCeilingHeight >= 3.0 && newMezzEnabled;
    const created = generateParametricUnitLayout({
      code: newCode.trim() || `TIPO-${project.unitTypes.length + 1}`,
      name: newName.trim() || 'Tipologia Personalizada',
      buildingKind: newBuildingKind,
      width: newWidth,
      depth: newDepth,
      ceilingHeight: newCeilingHeight,
      bedrooms: newBuildingKind === 'casa_terrea' ? Math.max(1, newBedrooms) : newBedrooms,
      suites: newBuildingKind === 'casa_terrea' ? newSuites : 0,
      hasLaundry: newLaundry,
      hasBalcony: newBalcony,
      hasMezzanine: allowMezz,
      accessible: newAcc,
      extWallThickness: project.constructionMethod.externalWallThickness,
      intWallThickness: intWallT,
      constructionSystem: project.constructionMethod.methodId,
      entrySide: newEntrySide,
      internalPartitionType: newPartitionType,
      mepProfile: newMepProfile,
      mezzanineZone: allowMezz ? newMezzZone : undefined,
      mezzanineElevationM: allowMezz ? newMezzElev : undefined,
      mezzanineCoverageRatio: allowMezz ? newMezzCoverage : undefined,
      mezzanineSizingMode: allowMezz ? newMezzSizingMode : undefined,
      mezzanineCustomWidthM: allowMezz && newMezzSizingMode === 'dimensions' ? newMezzCustomW : undefined,
      mezzanineCustomDepthM: allowMezz && newMezzSizingMode === 'dimensions' ? newMezzCustomD : undefined,
      mezzanineUsage: allowMezz ? newMezzUsage : undefined,
      mezzanineStructureType: allowMezz ? newMezzStructure : undefined,
      mezzanineStairLayout: allowMezz ? newMezzStairLayout : undefined,
      mezzanineStairSide: allowMezz ? newMezzStairSide : undefined,
    });
    onUpdateProject(
      (prev) => ({ ...prev, unitTypes: [...prev.unitTypes, created] }),
      `Criação de tipologia paramétrica ${created.code}`,
    );
    onSelectUnitType(created.id);
    setLeftTab('lista');
    setNewCode(`${newBuildingKind === 'casa_terrea' ? 'CASA' : 'TIPO'}-${String.fromCharCode(65 + project.unitTypes.length + 1)}`);
  };

  const handleRegenerateCurrent = (ut: UnitType) => {
    const allowMezz = ut.buildingKind !== 'casa_sobrado' && ut.buildingKind !== 'casa_terrea' && ut.ceilingHeight >= 3.0 && ut.hasMezzanine;
    const partType = ut.internalPartitionType ?? project.constructionMethod.internalPartitionType ?? 'alvenaria';
    const regenerated = generateParametricUnitLayout({
      id: ut.id,
      code: ut.code,
      name: ut.name,
      basePreset: ut.basePreset,
      buildingKind: ut.buildingKind,
      suites: ut.suites,
      bathrooms: ut.bathrooms,
      hasDiningArea: ut.hasDiningArea,
      totalStories: ut.totalStories,
      storyIndex: ut.storyIndex,
      linkedHouseGroupId: ut.linkedHouseGroupId,
      width: ut.width,
      depth: ut.depth,
      ceilingHeight: ut.ceilingHeight,
      bedrooms: ut.bedrooms,
      hasLaundry: ut.hasLaundry,
      hasBalcony: ut.hasBalcony,
      hasMezzanine: allowMezz,
      accessible: ut.accessible,
      extWallThickness: project.constructionMethod.externalWallThickness,
      intWallThickness:
        partType === 'drywall' ? 0.095 : project.constructionMethod.internalWallThickness,
      constructionSystem: project.constructionMethod.methodId,
      finishStandard: ut.finishStandard,
      entrySide: ut.entrySide ?? 'lateral_direita',
      internalPartitionType: partType,
      mepProfile: ut.mepProfile ?? 'simples',
      mezzanineZone: ut.mezzanine?.zone,
      mezzanineElevationM: ut.mezzanine?.elevationM,
      mezzanineCoverageRatio: ut.mezzanine?.coverageRatio,
      mezzanineSizingMode: ut.mezzanine?.sizingMode ?? 'percent',
      mezzanineCustomWidthM: ut.mezzanine?.customWidthM,
      mezzanineCustomDepthM: ut.mezzanine?.customDepthM,
      mezzanineUsage: ut.mezzanine?.usage,
      mezzanineStructureType: ut.mezzanine?.structureType,
      mezzanineStairLayout: ut.mezzanine?.stairLayout,
      mezzanineStairSide: ut.mezzanine?.stairSide,
    });
    onUpdateProject(
      (prev) => ({
        ...prev,
        unitTypes: prev.unitTypes.map((t) => (t.id === ut.id ? regenerated : t)),
      }),
      `Re-geração paramétrica da tipologia ${ut.code}`,
    );
  };

  const handleDuplicateTypology = (ut: UnitType) => {
    const copy: UnitType = JSON.parse(JSON.stringify(ut));
    copy.id = nextId('ut');
    copy.code = `${ut.code}-2`;
    copy.name = `${ut.name} (Cópia)`;
    onUpdateProject((prev) => ({ ...prev, unitTypes: [...prev.unitTypes, copy] }));
    onSelectUnitType(copy.id);
  };

  const handleMirrorTypology = (ut: UnitType) => {
    const W = ut.width;
    const mirroredEntrySide: EntrySide | undefined =
      ut.entrySide === 'lateral_direita'
        ? 'lateral_esquerda'
        : ut.entrySide === 'lateral_esquerda'
          ? 'lateral_direita'
          : ut.entrySide;
    const mirrored: UnitType = {
      ...ut,
      entrySide: mirroredEntrySide,
      mezzanine: ut.mezzanine
        ? {
            ...ut.mezzanine,
            x: round2(W - ut.mezzanine.x - ut.mezzanine.width),
            stairSide: ut.mezzanine.stairSide === 'esquerda' ? 'direita' : 'esquerda',
          }
        : undefined,
      walls: ut.walls.map((w) => ({
        ...w,
        start: { x: round2(W - w.start.x), y: w.start.y },
        end: { x: round2(W - w.end.x), y: w.end.y },
      })),
      rooms: ut.rooms.map((r) => ({ ...r, x: round2(W - r.x - r.width) })),
      furniture: ut.furniture.map((f) => ({ ...f, x: round2(W - f.x - f.width) })),
      electricalPoints: ut.electricalPoints.map((p) => ({ ...p, x: round2(W - p.x) })),
      waterPoints: ut.waterPoints.map((p) => ({ ...p, x: round2(W - p.x) })),
      drainagePoints: ut.drainagePoints.map((p) => ({ ...p, x: round2(W - p.x) })),
    };
    onUpdateProject((prev) => ({
      ...prev,
      unitTypes: prev.unitTypes.map((t) => (t.id === ut.id ? mirrored : t)),
    }));
  };

  const handleAddRoom = (ut: UnitType) => {
    const newRoom: Room = {
      id: nextId('rm'),
      code: `AMB-${ut.rooms.length + 1}`,
      name: 'Novo Ambiente',
      category: 'personalizado',
      x: 0.2,
      y: 0.2,
      width: 2.0,
      depth: 2.0,
      ceilingHeight: ut.ceilingHeight,
      naturalLightingArea: 0.5,
      ventilationArea: 0.25,
      finishes: {
        floor: 'Porcelanato acetinado',
        wall: 'Massa corrida PVA',
        ceiling: 'Forro gesso liso',
        paint: 'Tinta acrílica fosca',
        baseboard: 'Porcelanato h=7cm',
      },
      notes: '',
    };
    onUpdateProject((prev) => ({
      ...prev,
      unitTypes: prev.unitTypes.map((t) =>
        t.id === ut.id ? { ...t, rooms: [...t.rooms, newRoom] } : t,
      ),
    }));
  };

  const pagedTypologies = paginateItems(project.unitTypes, listPage, listPageSize);
  const pagedRooms = paginateItems(activeUt?.rooms ?? [], roomsPage, roomsPageSize);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1520px] flex-col gap-2 overflow-hidden p-3">
      {/* Compact Header & Floors Quick Bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#2A2F38] pb-2">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-white truncate">
            Tipologias de Kitnets, Casas Térreas &amp; Sobrados
          </h1>
          <p className="text-[11px] text-[#949BA8] truncate">
            Gerador paramétrico completo com pavimentos vinculados, mezanino e escada Blondel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Floors quick control */}
          <div className="inline-flex items-center gap-1.5 rounded border border-[#2A2F38] bg-[#1B1E24] px-2 py-1 text-xs">
            <Layers className="h-3.5 w-3.5 text-[#2F7CF6]" />
            <span className="text-[11px] text-[#949BA8] whitespace-nowrap">Pav.:</span>
            <button
              type="button"
              disabled={project.floors.length <= 1}
              onClick={() =>
                onUpdateProject(
                  (prev) => setProjectFloorCount(prev, prev.floors.length - 1, true),
                  'Redução da quantidade de pavimentos',
                )
              }
              aria-label="Diminuir andares"
              className="rounded border border-[#2A2F38] bg-[#14161A] p-0.5 text-slate-200 hover:border-[#2F7CF6] disabled:opacity-35"
            >
              <Minus className="h-3 w-3" />
            </button>
            <input
              type="number"
              min={1}
              max={20}
              value={project.floors.length}
              aria-label="Quantidade de andares no projeto"
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 1) {
                  onUpdateProject(
                    (prev) => setProjectFloorCount(prev, n, true),
                    `Ajuste de pavimentos para ${Math.min(20, Math.max(1, Math.round(n)))}`,
                  );
                }
              }}
              className="w-10 rounded border border-[#2A2F38] bg-[#14161A] px-1 py-0.5 text-center font-mono text-xs text-white tabular-nums"
            />
            <button
              type="button"
              disabled={project.floors.length >= 20}
              onClick={() =>
                onUpdateProject(
                  (prev) => setProjectFloorCount(prev, prev.floors.length + 1, true),
                  'Adição de pavimento com replicação',
                )
              }
              aria-label="Aumentar andares"
              className="rounded border border-[#2A2F38] bg-[#14161A] p-0.5 text-slate-200 hover:border-[#2F7CF6] disabled:opacity-35"
            >
              <Plus className="h-3 w-3" />
            </button>
            <span className="font-mono text-[11px] text-sky-300 tabular-nums whitespace-nowrap pl-1">
              {project.floors.reduce((s, f) => s + f.units.length, 0)} unid.
            </span>
          </div>

          {project.floors.length > 1 && (project.floors[0]?.units.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() =>
                onUpdateProject(
                  (prev) => replicateGroundFloorToAllFloors(prev),
                  'Replicação do Térreo nos andares superiores',
                )
              }
              className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-600/15 px-2.5 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-600/30 whitespace-nowrap shrink-0"
            >
              <Copy className="h-3.5 w-3.5" />
              Replicar Térreo
            </button>
          )}

          {onOpenImplantation && (
            <button
              type="button"
              onClick={onOpenImplantation}
              className="inline-flex items-center gap-1 rounded border border-[#2F7CF6]/50 bg-[#2F7CF6]/15 px-2.5 py-1.5 text-xs font-semibold text-sky-200 hover:bg-[#2F7CF6]/30 whitespace-nowrap shrink-0"
            >
              Implantação
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}

          {activeUt && (
            <>
              <button
                type="button"
                onClick={handleAutoDistribute}
                className="inline-flex items-center gap-1 rounded border border-emerald-500/50 bg-emerald-600/20 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-600/35 whitespace-nowrap shrink-0"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Distribuir
              </button>
              <button
                type="button"
                onClick={onOpen2DEditor}
                className="rounded bg-[#2F7CF6] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2569D6] whitespace-nowrap shrink-0"
              >
                Editar {activeUt.code} 2D
              </button>
            </>
          )}
        </div>
      </div>

      {distNotice && (
        <div className="shrink-0 rounded border border-emerald-500/40 bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-200">
          {distNotice}
        </div>
      )}

      {/* Zero-scroll 12-col Studio Grid */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12">
        {/* LEFT PANE: Cadastradas (Paginated) | Nova Tipologia (Tabbed Form) */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-3 gap-2.5 lg:col-span-4">
          <div className="grid shrink-0 grid-cols-2 gap-1 rounded border border-[#2A2F38] bg-[#14161A] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setLeftTab('lista')}
              className={`rounded py-1 font-medium transition-colors ${
                leftTab === 'lista' ? 'bg-[#2F7CF6] text-white' : 'text-[#949BA8] hover:text-white'
              }`}
            >
              Cadastradas ({project.unitTypes.length})
            </button>
            <button
              type="button"
              onClick={() => setLeftTab('nova')}
              className={`rounded py-1 font-medium transition-colors ${
                leftTab === 'nova' ? 'bg-[#2F7CF6] text-white' : 'text-[#949BA8] hover:text-white'
              }`}
            >
              + Nova Tipologia
            </button>
          </div>

          {leftTab === 'lista' ? (
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-2 overflow-hidden">
              <div className="space-y-1.5 overflow-hidden">
                {pagedTypologies.slice.map((ut) => {
                  const isSelected = activeUt?.id === ut.id;
                  const countImpl = project.floors.reduce(
                    (s, f) => s + f.units.filter((u) => u.unitTypeId === ut.id).length,
                    0,
                  );
                  return (
                    <button
                      key={ut.id}
                      type="button"
                      onClick={() => {
                        onSelectUnitType(ut.id);
                        setRoomsPage(0);
                      }}
                      className={`w-full text-left p-2.5 rounded border transition-colors ${
                        isSelected
                          ? 'border-[#2F7CF6] bg-[#2F7CF6]/10'
                          : 'border-[#2A2F38] bg-[#14161A] hover:border-[#3F4654]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold text-white">{ut.name}</span>
                        <span className="shrink-0 text-[11px] font-mono text-[#949BA8] tabular-nums">
                          {round2(ut.width * ut.depth)} m²
                        </span>
                      </div>
                      <div className="text-[11px] text-[#949BA8] mt-0.5 font-mono truncate tabular-nums">
                        {ut.code} · {ut.width}×{ut.depth}m · {ut.rooms.length} amb. · {countImpl} unid.
                      </div>
                    </button>
                  );
                })}
              </div>

              <PaginationBar
                page={pagedTypologies.safePage}
                totalPages={pagedTypologies.totalPages}
                totalItems={project.unitTypes.length}
                startIndex={pagedTypologies.start}
                endIndex={pagedTypologies.end}
                itemLabel="tipologias"
                onPageChange={setListPage}
              />
            </div>
          ) : (
            <form
              onSubmit={handleCreateTypology}
              className="flex min-h-0 flex-1 flex-col justify-between gap-2 overflow-hidden"
            >
              <div className="min-h-0 flex-1 space-y-2.5 overflow-hidden">
                {/* Sub-tabs inside form so it never overflows vertically */}
                <div className="grid grid-cols-2 gap-1 rounded border border-[#2A2F38] bg-[#14161A] p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setNewFormStep('basico')}
                    className={`rounded py-1 font-medium ${
                      newFormStep === 'basico' ? 'bg-[#22262E] text-white' : 'text-[#949BA8]'
                    }`}
                  >
                    1. Modelo &amp; Medidas
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewFormStep('config')}
                    className={`rounded py-1 font-medium ${
                      newFormStep === 'config' ? 'bg-[#22262E] text-white' : 'text-[#949BA8]'
                    }`}
                  >
                    2. Acesso, MEP &amp; Mezanino
                  </button>
                </div>

                {newFormStep === 'basico' ? (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-3 gap-1 rounded border border-[#2A2F38] bg-[#14161A] p-1">
                      {(
                        [
                          ['kitnet', 'Kitnet'],
                          ['casa_terrea', 'Casa Térrea'],
                          ['casa_sobrado', 'Sobrado'],
                        ] as const
                      ).map(([kindVal, kindLbl]) => (
                        <button
                          key={kindVal}
                          type="button"
                          onClick={() => switchNewBuildingKind(kindVal)}
                          className={`px-1.5 py-1 text-[11px] font-medium rounded transition-colors ${
                            newBuildingKind === kindVal
                              ? 'bg-[#2F7CF6] text-white font-semibold'
                              : 'text-[#949BA8] hover:text-white'
                          }`}
                        >
                          {kindLbl}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                      {(newBuildingKind === 'kitnet'
                        ? PRESETS
                        : HOUSE_PRESETS.filter((p) => p.kind === newBuildingKind)
                      ).map((pr) => (
                        <button
                          key={pr.label}
                          type="button"
                          onClick={() => {
                            setNewBuildingKind(pr.kind);
                            setNewName(pr.label);
                            setNewWidth(pr.width);
                            setNewDepth(pr.depth);
                            setNewBedrooms(pr.bedrooms);
                            setNewSuites(pr.suites);
                            setNewTotalStories(pr.stories);
                            setNewLaundry(pr.laundry);
                            setNewBalcony(pr.balcony);
                            setNewAcc(pr.acc);
                            if (pr.kind !== 'kitnet') {
                              setNewEntrySide('frente');
                              setNewMepProfile('completo');
                              setNewMezzEnabled(false);
                            }
                          }}
                          className="truncate px-2 py-1 text-left text-[10.5px] rounded bg-[#14161A] border border-[#2A2F38] text-[#C4C9D4] hover:border-[#2F7CF6]"
                        >
                          {pr.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">Código</label>
                        <input
                          type="text"
                          value={newCode}
                          onChange={(e) => setNewCode(e.target.value)}
                          className="w-full px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">Nome</label>
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          className="w-full px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5">
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">Larg. (m)</label>
                        <NumericInput
                          min={2.8}
                          max={20}
                          value={newWidth}
                          onCommit={setNewWidth}
                          className="w-full px-1.5 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">Comp. (m)</label>
                        <NumericInput
                          min={3.6}
                          max={25}
                          value={newDepth}
                          onCommit={setNewDepth}
                          className="w-full px-1.5 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">PD (m)</label>
                        <NumericInput
                          min={2.4}
                          max={6.0}
                          value={newCeilingHeight}
                          onCommit={(val) => {
                            setNewCeilingHeight(val);
                            if (val < 3.0) setNewMezzEnabled(false);
                          }}
                          className="w-full px-1.5 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">Quartos</label>
                        <NumericInput
                          min={newBuildingKind === 'kitnet' ? 0 : 1}
                          max={3}
                          integerOnly
                          value={newBedrooms}
                          onCommit={(val) => {
                            setNewBedrooms(val);
                            if (val < 2) setNewSuites(0);
                          }}
                          className="w-full px-1.5 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        />
                      </div>
                    </div>

                    {newBuildingKind !== 'kitnet' && (
                      <div className="grid grid-cols-2 gap-2 rounded border border-[#2A2F38] bg-[#14161A] p-2">
                        <div>
                          <label className="block text-[10px] text-[#949BA8] mb-0.5">Suíte</label>
                          <div className="grid grid-cols-2 gap-1">
                            <button
                              type="button"
                              onClick={() => setNewSuites(0)}
                              className={`px-1.5 py-1 text-[10.5px] rounded border ${
                                newSuites === 0 ? 'border-[#2F7CF6] bg-[#2F7CF6]/20 text-white' : 'border-[#2A2F38] bg-[#1B1E24] text-[#949BA8]'
                              }`}
                            >
                              1 BWC
                            </button>
                            <button
                              type="button"
                              disabled={newBedrooms < 2}
                              onClick={() => setNewSuites(1)}
                              className={`px-1.5 py-1 text-[10.5px] rounded border disabled:opacity-40 ${
                                newSuites >= 1 ? 'border-[#2F7CF6] bg-[#2F7CF6]/20 text-white' : 'border-[#2A2F38] bg-[#1B1E24] text-[#949BA8]'
                              }`}
                            >
                              1 Suíte
                            </button>
                          </div>
                        </div>
                        {newBuildingKind === 'casa_sobrado' && (
                          <div>
                            <label className="block text-[10px] text-[#949BA8] mb-0.5">Pavimentos</label>
                            <div className="grid grid-cols-2 gap-1">
                              <button
                                type="button"
                                onClick={() => setNewTotalStories(2)}
                                className={`px-1.5 py-1 text-[10.5px] rounded border ${
                                  newTotalStories === 2 ? 'border-[#2F7CF6] bg-[#2F7CF6]/20 text-white' : 'border-[#2A2F38] bg-[#1B1E24] text-[#949BA8]'
                                }`}
                              >
                                2 Pav.
                              </button>
                              <button
                                type="button"
                                onClick={() => setNewTotalStories(3)}
                                className={`px-1.5 py-1 text-[10.5px] rounded border ${
                                  newTotalStories === 3 ? 'border-[#2F7CF6] bg-[#2F7CF6]/20 text-white' : 'border-[#2A2F38] bg-[#1B1E24] text-[#949BA8]'
                                }`}
                              >
                                3 Pav.
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3 text-[11px] text-[#C4C9D4]">
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={newLaundry} onChange={(e) => setNewLaundry(e.target.checked)} />
                        Área Serviço
                      </label>
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={newBalcony} onChange={(e) => setNewBalcony(e.target.checked)} />
                        Varanda
                      </label>
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={newAcc} onChange={(e) => setNewAcc(e.target.checked)} />
                        NBR 9050
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="space-y-1.5 rounded border border-[#2A2F38] bg-[#14161A] p-2">
                      <div>
                        <label className="block text-[10px] text-[#C4C9D4] mb-0.5">
                          Entrada Principal P1 (0,80m)
                        </label>
                        <div className="grid grid-cols-3 gap-1">
                          {(
                            [
                              ['frente', 'Frente'],
                              ['lateral_direita', 'Lat. Dir.'],
                              ['lateral_esquerda', 'Lat. Esq.'],
                            ] as const
                          ).map(([val, label]) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setNewEntrySide(val)}
                              className={`px-1.5 py-1 text-[10.5px] rounded border ${
                                newEntrySide === val
                                  ? 'border-[#2F7CF6] bg-[#2F7CF6]/20 text-white font-semibold'
                                  : 'border-[#2A2F38] bg-[#1B1E24] text-[#949BA8]'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="block text-[10px] text-[#C4C9D4] mb-0.5">Divisórias</label>
                          <select
                            value={newPartitionType}
                            onChange={(e) => setNewPartitionType(e.target.value as InternalPartitionType)}
                            className="w-full px-1.5 py-1 text-[11px] rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                          >
                            <option value="alvenaria">Alvenaria (10cm)</option>
                            <option value="drywall">Drywall (9,5cm)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#C4C9D4] mb-0.5">Perfil MEP</label>
                          <select
                            value={newMepProfile}
                            onChange={(e) => setNewMepProfile(e.target.value as 'simples' | 'completo')}
                            className="w-full px-1.5 py-1 text-[11px] rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                          >
                            <option value="simples">Simples (Enxuto)</option>
                            <option value="completo">Completo (AQ/AC)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {canNewMezzanine ? (
                      <div className="rounded border border-[#2F7CF6]/40 bg-[#14161A] p-2 space-y-2">
                        <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-white cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newMezzEnabled}
                            onChange={(e) => setNewMezzEnabled(e.target.checked)}
                          />
                          Incluir Mezanino Interno (PD &ge; 3,00m)
                        </label>
                        {newMezzEnabled && (
                          <div className="space-y-1.5 pt-1 border-t border-[#2A2F38] text-[10.5px]">
                            <div className="grid grid-cols-2 gap-1.5">
                              <div>
                                <label className="block text-[9.5px] text-cyan-200">Alt. Chão (m)</label>
                                <input
                                  type="number"
                                  step="0.05"
                                  min={2.0}
                                  max={round2(Math.max(2.05, newCeilingHeight - 1.1))}
                                  value={newMezzElev}
                                  onChange={(e) => setNewMezzElev(Number(e.target.value))}
                                  className="w-full px-1.5 py-1 font-mono rounded bg-[#1B1E24] border border-[#2F7CF6]/60 text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[9.5px] text-[#949BA8]">Tamanho (%)</label>
                                <input
                                  type="number"
                                  min={10}
                                  max={65}
                                  value={Math.round(newMezzCoverage * 100)}
                                  onChange={(e) =>
                                    setNewMezzCoverage(
                                      Math.min(0.65, Math.max(0.1, Number(e.target.value) / 100)),
                                    )
                                  }
                                  className="w-full px-1.5 py-1 font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <select
                                value={newMezzZone}
                                onChange={(e) => setNewMezzZone(e.target.value as MezzanineZone)}
                                className="px-1.5 py-1 rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                              >
                                <option value="sobre_banho_cozinha">Sobre BWC + Coz.</option>
                                <option value="fundos">Fundos</option>
                                <option value="lateral_esquerda">Lat. Esq.</option>
                                <option value="lateral_direita">Lat. Dir.</option>
                              </select>
                              <select
                                value={newMezzStructure}
                                onChange={(e) => setNewMezzStructure(e.target.value as MezzanineStructureType)}
                                className="px-1.5 py-1 rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                              >
                                <option value="metalica_madeira">Metálica+Mad.</option>
                                <option value="madeira_estrutural">Madeira</option>
                                <option value="steel_deck">Steel Deck</option>
                                <option value="concreto_armado">Concreto</option>
                              </select>
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                              <select
                                value={newMezzUsage}
                                onChange={(e) => setNewMezzUsage(e.target.value as MezzanineUsage)}
                                className="px-1 py-1 rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                              >
                                <option value="dormitorio">Dormitório</option>
                                <option value="dormitorio_home_office">Dorm.+Office</option>
                                <option value="home_office">Office</option>
                                <option value="deposito_estar">Estar</option>
                              </select>
                              <select
                                value={newMezzStairLayout}
                                onChange={(e) => setNewMezzStairLayout(e.target.value as MezzanineStairLayout)}
                                className="px-1 py-1 rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                              >
                                <option value="reta">Esc. Reta</option>
                                <option value="em_l">Esc. L</option>
                                <option value="caracol_compacta">Helicoidal</option>
                              </select>
                              <select
                                value={newMezzStairSide}
                                onChange={(e) => setNewMezzStairSide(e.target.value as 'esquerda' | 'direita')}
                                className="px-1 py-1 rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                              >
                                <option value="direita">Dir.</option>
                                <option value="esquerda">Esq.</option>
                              </select>
                            </div>
                            {previewNewStair && (
                              <div className="rounded bg-[#1B1E24] px-2 py-1 text-[10px] font-mono text-cyan-300 tabular-nums">
                                {round2(newInteriorBounds.innerAreaM2 * newMezzCoverage)}m² · {previewNewStair.steps} degraus Blondel
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="rounded border border-[#2A2F38] bg-[#14161A] p-2.5 text-[11px] text-[#949BA8]">
                        Pé-direito abaixo de 3,00 m: mezanino indisponível. Eleve o pé-direito na aba 1 se desejar mezanino interno.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full shrink-0 py-2 text-xs font-semibold rounded bg-[#2F7CF6] text-white hover:bg-[#2569D6] flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                {newBuildingKind === 'casa_sobrado'
                  ? `Gerar Sobrado ${newTotalStories} Pav. (~${round2(newWidth * newDepth * newTotalStories)} m²)`
                  : `Gerar Tipologia (${round2(newWidth * newDepth)} m²)`}
              </button>
            </form>
          )}
        </div>

        {/* RIGHT PANE: Active Typology Parameters & Paginated Rooms */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-3.5 gap-2.5 lg:col-span-8">
          {!activeUt ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded border border-dashed border-[#323844] bg-[#14161A] p-6 text-center space-y-2">
              <p className="text-sm font-semibold text-white">Nenhuma tipologia criada ainda</p>
              <p className="text-xs text-[#949BA8] max-w-md">
                Selecione a aba &quot;+ Nova Tipologia&quot; à esquerda para gerar sua primeira kitnet, casa térrea ou sobrado.
              </p>
            </div>
          ) : (
            <>
              {/* Active Ut Header + Actions */}
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#2A2F38] pb-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <input
                    type="text"
                    aria-label="Código da tipologia"
                    value={activeUt.code}
                    onChange={(e) => {
                      const val = e.target.value;
                      onUpdateProject((prev) =>
                        updateUnitTypeInProject(prev, { ...activeUt, code: val }),
                      );
                    }}
                    className="w-24 px-2 py-1 text-xs font-mono font-semibold rounded bg-[#14161A] border border-[#2A2F38] text-[#60A5FA]"
                  />
                  <input
                    type="text"
                    aria-label="Nome da tipologia"
                    value={activeUt.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      onUpdateProject((prev) =>
                        updateUnitTypeInProject(prev, { ...activeUt, name: val }),
                      );
                    }}
                    className="min-w-[160px] flex-1 px-2.5 py-1 text-xs font-semibold rounded bg-[#14161A] border border-[#2A2F38] text-white"
                  />
                  <span className="font-mono text-[11px] text-[#949BA8] tabular-nums whitespace-nowrap">
                    Bruta {round2(activeUt.width * activeUt.depth)}m² · Útil {getUnitUsefulArea(activeUt)}m²
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRegenerateCurrent(activeUt)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-[#323844] bg-[#22262E] text-white hover:border-[#2F7CF6]"
                  >
                    <Wand2 className="w-3 h-3 text-[#2F7CF6]" /> Regerar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMirrorTypology(activeUt)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-[#323844] bg-[#22262E] text-white hover:border-[#2F7CF6]"
                  >
                    <FlipHorizontal2 className="w-3 h-3" /> Espelhar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDuplicateTypology(activeUt)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-[#323844] bg-[#22262E] text-white hover:border-[#2F7CF6]"
                  >
                    <Copy className="w-3 h-3" /> Duplicar
                  </button>
                  {confirmDeleteActiveUtId === activeUt.id ? (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const nextIdAfter =
                            project.unitTypes.find((u) => u.id !== activeUt.id)?.id ?? '';
                          onUpdateProject(
                            (prev) => deleteUnitTypeFromProject(prev, activeUt.id),
                            `Exclusão da tipologia ${activeUt.code}`,
                          );
                          onSelectUnitType(nextIdAfter);
                          setConfirmDeleteActiveUtId(null);
                        }}
                        className="px-2 py-1 text-[11px] font-semibold rounded bg-red-600 text-white"
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteActiveUtId(null)}
                        className="px-1.5 py-1 text-[11px] rounded border border-[#323844] text-[#949BA8]"
                      >
                        Não
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteActiveUtId(activeUt.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-red-500/40 bg-red-950/20 text-red-300"
                    >
                      <Trash2 className="w-3 h-3" /> Excluir
                    </button>
                  )}
                </div>
              </div>

              {/* Right Panel Sub-Tabs */}
              <div className="flex shrink-0 items-center justify-between gap-2">
                <div className="inline-flex rounded border border-[#2A2F38] bg-[#14161A] p-0.5 text-xs">
                  {(
                    [
                      ['geral', 'Dimensões & Programa'],
                      ['mep_mezz', 'Acesso, MEP & Mezanino'],
                      ['ambientes', `Ficha Técnica dos Ambientes (${activeUt.rooms.length})`],
                    ] as const
                  ).map(([tabId, tabLabel]) => (
                    <button
                      key={tabId}
                      type="button"
                      onClick={() => setRightTab(tabId)}
                      className={`rounded px-3 py-1 font-medium transition-colors whitespace-nowrap ${
                        rightTab === tabId
                          ? 'bg-[#2F7CF6] text-white'
                          : 'text-[#949BA8] hover:text-white'
                      }`}
                    >
                      {tabLabel}
                    </button>
                  ))}
                </div>
                {rightTab === 'ambientes' && (
                  <button
                    type="button"
                    onClick={() => handleAddRoom(activeUt)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-[#323844] bg-[#22262E] text-white hover:border-[#2F7CF6]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Ambiente
                  </button>
                )}
              </div>

              {/* Tab Content */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {rightTab === 'geral' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#949BA8] mb-1">
                          Largura (m) <span className="text-[#64748B]">(mín 2,8)</span>
                        </label>
                        <NumericInput
                          min={2.8}
                          max={20}
                          value={activeUt.width}
                          onCommit={(val) => {
                            if (val !== activeUt.width) {
                              handleRegenerateCurrent({
                                ...activeUt,
                                width: val,
                                targetArea: round2(val * activeUt.depth),
                              });
                            }
                          }}
                          className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#949BA8] mb-1">
                          Comp. (m) <span className="text-[#64748B]">(mín 3,6)</span>
                        </label>
                        <NumericInput
                          min={3.6}
                          max={25}
                          value={activeUt.depth}
                          onCommit={(val) => {
                            if (val !== activeUt.depth) {
                              handleRegenerateCurrent({
                                ...activeUt,
                                depth: val,
                                targetArea: round2(activeUt.width * val),
                              });
                            }
                          }}
                          className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#949BA8] mb-1">Pé-direito (m)</label>
                        <NumericInput
                          min={2.4}
                          max={6.0}
                          value={activeUt.ceilingHeight}
                          onCommit={(val) => {
                            if (val !== activeUt.ceilingHeight) {
                              handleRegenerateCurrent({
                                ...activeUt,
                                ceilingHeight: val,
                                hasMezzanine: val < 3.0 ? false : activeUt.hasMezzanine,
                                mezzanine: val < 3.0 ? undefined : activeUt.mezzanine,
                              });
                            }
                          }}
                          className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#949BA8] mb-1">Quartos</label>
                        <select
                          value={activeUt.bedrooms}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            handleRegenerateCurrent({
                              ...activeUt,
                              bedrooms: val,
                              suites: val < 2 ? 0 : activeUt.suites,
                            });
                          }}
                          className="w-full px-2 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        >
                          <option value={0}>Studio (Integrado)</option>
                          <option value={1}>1 Quarto (Porta 70cm)</option>
                          <option value={2}>2 Quartos (Casa)</option>
                          <option value={3}>3 Quartos (Casa)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#949BA8] mb-1">Acabamento</label>
                        <select
                          value={activeUt.finishStandard}
                          onChange={(e) => {
                            const val = e.target.value as UnitType['finishStandard'];
                            onUpdateProject((prev) => ({
                              ...prev,
                              unitTypes: prev.unitTypes.map((t) =>
                                t.id === activeUt.id ? { ...t, finishStandard: val } : t,
                              ),
                            }));
                          }}
                          className="w-full px-2 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        >
                          <option value="economico">Econômico</option>
                          <option value="padrao">Padrão</option>
                          <option value="medio_alto">Médio-Alto</option>
                          <option value="personalizado">Personalizado</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-5 rounded border border-[#2A2F38] bg-[#14161A] p-3 text-xs text-[#E6E9EF]">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeUt.hasLaundry}
                          onChange={(e) =>
                            handleRegenerateCurrent({ ...activeUt, hasLaundry: e.target.checked })
                          }
                        />
                        Área de Serviço (Máq. Lavar)
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeUt.hasBalcony}
                          onChange={(e) =>
                            handleRegenerateCurrent({ ...activeUt, hasBalcony: e.target.checked })
                          }
                        />
                        Varanda
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeUt.accessible}
                          onChange={(e) =>
                            handleRegenerateCurrent({ ...activeUt, accessible: e.target.checked })
                          }
                        />
                        Acessível NBR 9050
                      </label>
                      {activeUt.bedrooms >= 2 && (
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(activeUt.suites ?? 0) >= 1}
                            onChange={(e) =>
                              handleRegenerateCurrent({
                                ...activeUt,
                                suites: e.target.checked ? 1 : 0,
                              })
                            }
                          />
                          Suíte Privativa (2º BWC)
                        </label>
                      )}
                    </div>

                    {/* Quick KPI cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono tabular-nums">
                      <div className="rounded border border-[#2A2F38] bg-[#14161A] p-2.5">
                        <div className="text-[10px] text-[#949BA8]">Paredes</div>
                        <div className="text-sm font-semibold text-white">{activeUt.walls.length}</div>
                      </div>
                      <div className="rounded border border-[#2A2F38] bg-[#14161A] p-2.5">
                        <div className="text-[10px] text-[#949BA8]">Portas &amp; Janelas</div>
                        <div className="text-sm font-semibold text-white">{activeUt.openings.length}</div>
                      </div>
                      <div className="rounded border border-[#2A2F38] bg-[#14161A] p-2.5">
                        <div className="text-[10px] text-[#949BA8]">Pontos Elétricos</div>
                        <div className="text-sm font-semibold text-amber-300">{activeUt.electricalPoints.length}</div>
                      </div>
                      <div className="rounded border border-[#2A2F38] bg-[#14161A] p-2.5">
                        <div className="text-[10px] text-[#949BA8]">Pontos Água / Esgoto</div>
                        <div className="text-sm font-semibold text-sky-300">
                          {activeUt.waterPoints.length} / {activeUt.drainagePoints.length}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {rightTab === 'mep_mezz' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#949BA8] mb-1">
                          Entrada Principal (P1 — 0,80m)
                        </label>
                        <select
                          value={activeUt.entrySide ?? 'lateral_direita'}
                          onChange={(e) => {
                            const val = e.target.value as EntrySide;
                            handleRegenerateCurrent({ ...activeUt, entrySide: val });
                          }}
                          className="w-full px-2.5 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        >
                          <option value="frente">Frente da Unidade</option>
                          <option value="lateral_direita">Lateral Direita</option>
                          <option value="lateral_esquerda">Lateral Esquerda</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#949BA8] mb-1">
                          Sistema de Divisórias Internas
                        </label>
                        <select
                          value={
                            activeUt.internalPartitionType ??
                            project.constructionMethod.internalPartitionType ??
                            'alvenaria'
                          }
                          onChange={(e) => {
                            const val = e.target.value as InternalPartitionType;
                            handleRegenerateCurrent({ ...activeUt, internalPartitionType: val });
                          }}
                          className="w-full px-2.5 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        >
                          <option value="alvenaria">Alvenaria Convencional (10 cm)</option>
                          <option value="drywall">Drywall Gesso Acartonado (9,5 cm)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#949BA8] mb-1">
                          Perfil Instalações (QDC &amp; Ramais)
                        </label>
                        <select
                          value={activeUt.mepProfile ?? 'simples'}
                          onChange={(e) => {
                            const val = e.target.value as 'simples' | 'completo';
                            handleRegenerateCurrent({ ...activeUt, mepProfile: val });
                          }}
                          className="w-full px-2.5 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                        >
                          <option value="simples">Simples (4 circ. + Só AF + QDC)</option>
                          <option value="completo">Completo (AQ + Ar-Cond. + CFTV)</option>
                        </select>
                      </div>
                    </div>

                    {activeUt.ceilingHeight >= 3.0 ? (
                      (() => {
                        const activeBounds = computeMezzanineInteriorBounds(
                          activeUt.width,
                          activeUt.depth,
                          project.constructionMethod.externalWallThickness,
                          activeUt.hasBalcony,
                        );
                        const defaultMezD = round2(
                          Math.min(activeBounds.innerD, Math.max(1.2, activeBounds.innerD * 0.35)),
                        );
                        const stair = activeUt.furniture.find((f) => f.category === 'escada');
                        const sp = stair?.stairSpec;
                        return (
                          <div className="rounded border border-[#2F7CF6]/40 bg-[#14161A] p-3 space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="inline-flex items-center gap-2 text-xs font-semibold text-white cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={activeUt.hasMezzanine}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    const nextUt: UnitType = {
                                      ...activeUt,
                                      hasMezzanine: checked,
                                      mezzanine: checked
                                        ? activeUt.mezzanine ?? {
                                            enabled: true,
                                            zone: 'sobre_banho_cozinha',
                                            elevationM: Math.min(2.2, round2(activeUt.ceilingHeight - 1.2)),
                                            slabThicknessM: 0.12,
                                            coverageRatio: 0.35,
                                            sizingMode: 'percent',
                                            customWidthM: activeBounds.innerW,
                                            customDepthM: defaultMezD,
                                            x: activeBounds.innerMinX,
                                            y: activeBounds.innerMinY,
                                            width: activeBounds.innerW,
                                            depth: defaultMezD,
                                            usage: 'dormitorio',
                                            structureType: 'metalica_madeira',
                                            stairLayout: 'reta',
                                            stairSide:
                                              activeUt.entrySide === 'lateral_direita'
                                                ? 'esquerda'
                                                : 'direita',
                                            guardrailHeightM: 1.05,
                                          }
                                        : undefined,
                                    };
                                    handleRegenerateCurrent(nextUt);
                                  }}
                                />
                                Habilitar Mezanino 100% Interno (PD {activeUt.ceilingHeight.toFixed(2)} m)
                              </label>
                              <span className="text-[11px] text-cyan-300 font-mono tabular-nums">
                                Área útil: {activeBounds.innerW.toFixed(2)}×{activeBounds.innerD.toFixed(2)}m ({activeBounds.innerAreaM2} m²)
                              </span>
                            </div>

                            {activeUt.hasMezzanine && activeUt.mezzanine && (
                              <div className="space-y-2.5 pt-2 border-t border-[#2A2F38]">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  <div className="rounded border border-[#2A2F38] bg-[#1B1E24] p-2 space-y-1">
                                    <label className="block text-[10.5px] font-semibold text-cyan-200">
                                      Altura do chão até o mezanino (m)
                                    </label>
                                    <div className="flex items-center gap-2">
                                      <NumericInput
                                        min={2.0}
                                        max={round2(Math.max(2.05, activeUt.ceilingHeight - 1.05))}
                                        value={activeUt.mezzanine.elevationM}
                                        onCommit={(val) =>
                                          handleRegenerateCurrent({
                                            ...activeUt,
                                            mezzanine: { ...activeUt.mezzanine!, elevationM: val },
                                          })
                                        }
                                        className="w-20 px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2F7CF6] text-white"
                                      />
                                      <span className="text-[10.5px] font-mono text-[#C4C9D4] tabular-nums">
                                        Inf: {activeUt.mezzanine.elevationM.toFixed(2)}m · Sup: {round2(activeUt.ceilingHeight - activeUt.mezzanine.elevationM - activeUt.mezzanine.slabThicknessM).toFixed(2)}m
                                      </span>
                                    </div>
                                  </div>

                                  <div className="rounded border border-[#2A2F38] bg-[#1B1E24] p-2 space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[10.5px] font-semibold text-white">Dimensionamento</span>
                                      <div className="inline-flex rounded border border-[#2A2F38] bg-[#14161A] p-0.5 text-[10px]">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleRegenerateCurrent({
                                              ...activeUt,
                                              mezzanine: { ...activeUt.mezzanine!, sizingMode: 'percent' },
                                            })
                                          }
                                          className={`px-2 py-0.5 rounded ${(activeUt.mezzanine.sizingMode ?? 'percent') === 'percent' ? 'bg-[#2F7CF6] text-white' : 'text-[#949BA8]'}`}
                                        >
                                          % Piso
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleRegenerateCurrent({
                                              ...activeUt,
                                              mezzanine: {
                                                ...activeUt.mezzanine!,
                                                sizingMode: 'dimensions',
                                                customWidthM: activeUt.mezzanine!.width,
                                                customDepthM: activeUt.mezzanine!.depth,
                                              },
                                            })
                                          }
                                          className={`px-2 py-0.5 rounded ${activeUt.mezzanine.sizingMode === 'dimensions' ? 'bg-[#2F7CF6] text-white' : 'text-[#949BA8]'}`}
                                        >
                                          Dim. (m)
                                        </button>
                                      </div>
                                    </div>

                                    {(activeUt.mezzanine.sizingMode ?? 'percent') === 'percent' ? (
                                      <div className="flex flex-wrap items-center gap-1">
                                        {[10, 20, 30, 40, 50].map((pct) => (
                                          <button
                                            key={pct}
                                            type="button"
                                            onClick={() =>
                                              handleRegenerateCurrent({
                                                ...activeUt,
                                                mezzanine: {
                                                  ...activeUt.mezzanine!,
                                                  sizingMode: 'percent',
                                                  coverageRatio: pct / 100,
                                                },
                                              })
                                            }
                                            className={`px-2 py-0.5 text-[10.5px] font-mono rounded border ${
                                              Math.round(activeUt.mezzanine!.coverageRatio * 100) === pct
                                                ? 'border-[#2F7CF6] bg-[#2F7CF6]/25 text-white font-semibold'
                                                : 'border-[#2A2F38] bg-[#14161A] text-[#C4C9D4]'
                                            }`}
                                          >
                                            {pct}%
                                          </button>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="grid grid-cols-2 gap-1.5">
                                        <NumericInput
                                          min={0.9}
                                          max={activeBounds.innerW}
                                          value={activeUt.mezzanine.customWidthM ?? activeUt.mezzanine.width}
                                          onCommit={(val) =>
                                            handleRegenerateCurrent({
                                              ...activeUt,
                                              mezzanine: {
                                                ...activeUt.mezzanine!,
                                                sizingMode: 'dimensions',
                                                customWidthM: val,
                                              },
                                            })
                                          }
                                          className="px-2 py-0.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                                        />
                                        <NumericInput
                                          min={0.9}
                                          max={activeBounds.innerD}
                                          value={activeUt.mezzanine.customDepthM ?? activeUt.mezzanine.depth}
                                          onCommit={(val) =>
                                            handleRegenerateCurrent({
                                              ...activeUt,
                                              mezzanine: {
                                                ...activeUt.mezzanine!,
                                                sizingMode: 'dimensions',
                                                customDepthM: val,
                                              },
                                            })
                                          }
                                          className="px-2 py-0.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                  <div>
                                    <label className="block text-[10px] text-[#949BA8] mb-0.5">Localização</label>
                                    <select
                                      value={activeUt.mezzanine.zone}
                                      onChange={(e) =>
                                        handleRegenerateCurrent({
                                          ...activeUt,
                                          mezzanine: { ...activeUt.mezzanine!, zone: e.target.value as MezzanineZone },
                                        })
                                      }
                                      className="w-full px-1.5 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                    >
                                      <option value="sobre_banho_cozinha">Sobre BWC+Coz.</option>
                                      <option value="fundos">Fundos</option>
                                      <option value="lateral_esquerda">Lat. Esq.</option>
                                      <option value="lateral_direita">Lat. Dir.</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-[#949BA8] mb-0.5">Uso Superior</label>
                                    <select
                                      value={activeUt.mezzanine.usage}
                                      onChange={(e) =>
                                        handleRegenerateCurrent({
                                          ...activeUt,
                                          mezzanine: { ...activeUt.mezzanine!, usage: e.target.value as MezzanineUsage },
                                        })
                                      }
                                      className="w-full px-1.5 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                    >
                                      <option value="dormitorio">Dormitório</option>
                                      <option value="dormitorio_home_office">Dorm.+Office</option>
                                      <option value="home_office">Home Office</option>
                                      <option value="deposito_estar">Depósito</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-[#949BA8] mb-0.5">Estrutura</label>
                                    <select
                                      value={activeUt.mezzanine.structureType}
                                      onChange={(e) =>
                                        handleRegenerateCurrent({
                                          ...activeUt,
                                          mezzanine: {
                                            ...activeUt.mezzanine!,
                                            structureType: e.target.value as MezzanineStructureType,
                                          },
                                        })
                                      }
                                      className="w-full px-1.5 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                    >
                                      <option value="metalica_madeira">Metálica+Mad.</option>
                                      <option value="madeira_estrutural">Madeira</option>
                                      <option value="steel_deck">Steel Deck</option>
                                      <option value="concreto_armado">Concreto</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-[#949BA8] mb-0.5">Escada</label>
                                    <select
                                      value={activeUt.mezzanine.stairLayout}
                                      onChange={(e) =>
                                        handleRegenerateCurrent({
                                          ...activeUt,
                                          mezzanine: {
                                            ...activeUt.mezzanine!,
                                            stairLayout: e.target.value as MezzanineStairLayout,
                                          },
                                        })
                                      }
                                      className="w-full px-1.5 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                    >
                                      <option value="reta">Lance Reto</option>
                                      <option value="em_l">Em L</option>
                                      <option value="caracol_compacta">Helicoidal</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-[#949BA8] mb-0.5">Lado Escada</label>
                                    <select
                                      value={activeUt.mezzanine.stairSide}
                                      onChange={(e) =>
                                        handleRegenerateCurrent({
                                          ...activeUt,
                                          mezzanine: {
                                            ...activeUt.mezzanine!,
                                            stairSide: e.target.value as 'esquerda' | 'direita',
                                          },
                                        })
                                      }
                                      className="w-full px-1.5 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                    >
                                      <option value="direita">Direita</option>
                                      <option value="esquerda">Esquerda</option>
                                    </select>
                                  </div>
                                </div>

                                {sp && (
                                  <div className="rounded bg-[#1B1E24] px-2.5 py-1.5 text-[10.5px] font-mono text-cyan-300 tabular-nums">
                                    Escada Blondel: {sp.steps} degraus · h={(sp.riserM * 100).toFixed(1)}cm · p={(sp.treadM * 100).toFixed(0)}cm · 2h+p={sp.blondelSumM.toFixed(3)}m
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="rounded border border-[#2A2F38] bg-[#14161A] p-3 text-xs text-[#949BA8]">
                        Mezanino indisponível para pé-direito inferior a 3,00 m (atual:{' '}
                        {activeUt.ceilingHeight.toFixed(2)} m). Eleve o pé-direito na aba &quot;Dimensões &amp; Programa&quot; para habilitar.
                      </div>
                    )}
                  </div>
                )}

                {rightTab === 'ambientes' && (
                  <div className="flex min-h-0 flex-1 flex-col justify-between gap-2 overflow-hidden">
                    <div className="space-y-2 overflow-hidden">
                      {pagedRooms.slice.map((rm) => (
                        <div
                          key={rm.id}
                          className="rounded border border-[#2A2F38] bg-[#14161A] p-2.5 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={rm.code}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  onUpdateProject((prev) => ({
                                    ...prev,
                                    unitTypes: prev.unitTypes.map((t) =>
                                      t.id === activeUt.id
                                        ? {
                                            ...t,
                                            rooms: t.rooms.map((r) =>
                                              r.id === rm.id ? { ...r, code: val } : r,
                                            ),
                                          }
                                        : t,
                                    ),
                                  }));
                                }}
                                aria-label={`Código de ${rm.name}`}
                                className="w-16 px-2 py-0.5 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-[#60A5FA]"
                              />
                              <input
                                type="text"
                                value={rm.name}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  onUpdateProject((prev) => ({
                                    ...prev,
                                    unitTypes: prev.unitTypes.map((t) =>
                                      t.id === activeUt.id
                                        ? {
                                            ...t,
                                            rooms: t.rooms.map((r) =>
                                              r.id === rm.id ? { ...r, name: val } : r,
                                            ),
                                          }
                                        : t,
                                    ),
                                  }));
                                }}
                                aria-label={`Nome de ${rm.name}`}
                                className="w-40 px-2 py-0.5 text-xs font-medium rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                              />
                              <select
                                value={rm.category}
                                onChange={(e) => {
                                  const val = e.target.value as RoomCategory;
                                  onUpdateProject((prev) => ({
                                    ...prev,
                                    unitTypes: prev.unitTypes.map((t) =>
                                      t.id === activeUt.id
                                        ? {
                                            ...t,
                                            rooms: t.rooms.map((r) =>
                                              r.id === rm.id ? { ...r, category: val } : r,
                                            ),
                                          }
                                        : t,
                                    ),
                                  }));
                                }}
                                className="px-2 py-0.5 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-[#C4C9D4]"
                              >
                                <option value="sala_quarto">Sala/Quarto</option>
                                <option value="sala">Sala</option>
                                <option value="quarto">Quarto</option>
                                <option value="cozinha">Cozinha</option>
                                <option value="banheiro">Banheiro</option>
                                <option value="lavanderia">Lavanderia</option>
                                <option value="area_servico">Área de Serviço</option>
                                <option value="circulacao">Circulação</option>
                                <option value="varanda">Varanda</option>
                                <option value="escritorio">Escritório</option>
                                <option value="deposito">Depósito</option>
                                <option value="mezanino">Mezanino</option>
                                <option value="personalizado">Personalizado</option>
                              </select>
                            </div>

                            <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-[#C4C9D4]">
                              <span>{getRoomArea(rm)} m²</span>
                              <span>Perím. {getRoomPerimeter(rm)} m</span>
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateProject((prev) => ({
                                    ...prev,
                                    unitTypes: prev.unitTypes.map((t) =>
                                      t.id === activeUt.id
                                        ? { ...t, rooms: t.rooms.filter((r) => r.id !== rm.id) }
                                        : t,
                                    ),
                                  }))
                                }
                                aria-label={`Remover ambiente ${rm.name}`}
                                className="p-0.5 text-red-400 hover:text-red-300"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                            <div>
                              <label className="block text-[10px] text-[#949BA8]">Larg. (m)</label>
                              <NumericInput
                                min={0.6}
                                max={20}
                                value={rm.width}
                                onCommit={(val) => {
                                  onUpdateProject((prev) => ({
                                    ...prev,
                                    unitTypes: prev.unitTypes.map((t) =>
                                      t.id === activeUt.id
                                        ? {
                                            ...t,
                                            rooms: t.rooms.map((r) =>
                                              r.id === rm.id ? { ...r, width: val } : r,
                                            ),
                                          }
                                        : t,
                                    ),
                                  }));
                                }}
                                className="w-full px-2 py-0.5 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-[#949BA8]">Comp. (m)</label>
                              <NumericInput
                                min={0.6}
                                max={25}
                                value={rm.depth}
                                onCommit={(val) => {
                                  onUpdateProject((prev) => ({
                                    ...prev,
                                    unitTypes: prev.unitTypes.map((t) =>
                                      t.id === activeUt.id
                                        ? {
                                            ...t,
                                            rooms: t.rooms.map((r) =>
                                              r.id === rm.id ? { ...r, depth: val } : r,
                                            ),
                                          }
                                        : t,
                                    ),
                                  }));
                                }}
                                className="w-full px-2 py-0.5 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-[10px] text-[#949BA8]">Revest. Piso</label>
                              <input
                                type="text"
                                value={rm.finishes.floor}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  onUpdateProject((prev) => ({
                                    ...prev,
                                    unitTypes: prev.unitTypes.map((t) =>
                                      t.id === activeUt.id
                                        ? {
                                            ...t,
                                            rooms: t.rooms.map((r) =>
                                              r.id === rm.id
                                                ? { ...r, finishes: { ...r.finishes, floor: val } }
                                                : r,
                                            ),
                                          }
                                        : t,
                                    ),
                                  }));
                                }}
                                className="w-full px-2 py-0.5 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-[10px] text-[#949BA8]">Revest. Parede</label>
                              <input
                                type="text"
                                value={rm.finishes.wall}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  onUpdateProject((prev) => ({
                                    ...prev,
                                    unitTypes: prev.unitTypes.map((t) =>
                                      t.id === activeUt.id
                                        ? {
                                            ...t,
                                            rooms: t.rooms.map((r) =>
                                              r.id === rm.id
                                                ? { ...r, finishes: { ...r.finishes, wall: val } }
                                                : r,
                                            ),
                                          }
                                        : t,
                                    ),
                                  }));
                                }}
                                className="w-full px-2 py-0.5 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <PaginationBar
                      page={pagedRooms.safePage}
                      totalPages={pagedRooms.totalPages}
                      totalItems={activeUt.rooms.length}
                      startIndex={pagedRooms.start}
                      endIndex={pagedRooms.end}
                      itemLabel="ambientes"
                      onPageChange={setRoomsPage}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
