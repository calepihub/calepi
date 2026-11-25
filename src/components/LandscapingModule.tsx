import React, { useMemo, useRef, useState } from 'react';
import {
  Droplets,
  Flame,
  Layers,
  MapPin,
  Plus,
  Sparkles,
  Sun,
  Trash2,
  Trees,
  Waves,
} from 'lucide-react';
import { getBoundingBox, getUnitWorldRect, round2 } from '../engine/geometry';
import { getGateWorldPosition, getLotBoundarySegments, normalizeSiteData } from '../engine/implantation';
import {
  BOTANICAL_SPECIES_CATALOG,
  EXTERIOR_SURFACE_CATALOG,
  autoPopulateLandscaping,
  createDefaultLandscaping,
  getBotanicalMeta,
  getExteriorSurfaceMeta,
} from '../engine/landscaping';
import { nextId } from '../engine/parametricGenerator';
import type {
  BotanicalSpeciesId,
  ExteriorSurfaceType,
  ExteriorSurfaceZone,
  GourmetAreaSpec,
  LandscapePlantItem,
  PoolSpec,
  Project,
  SiteLandscaping,
} from '../types/project';
import { PaginationBar, paginateItems, useViewportPageSize } from './PaginationBar';

interface LandscapingModuleProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
  onOpenRenderStudio?: () => void;
}

type SelectedItem =
  | { kind: 'zone'; id: string }
  | { kind: 'pool'; id: string }
  | { kind: 'gourmet'; id: string }
  | { kind: 'plant'; id: string }
  | null;

type SpeciesFilter = 'todos' | 'frutifera' | 'palmeira' | 'arvore_ornamental' | 'tropical_arbusto';

export const LandscapingModule: React.FC<LandscapingModuleProps> = ({
  project,
  onUpdateProject,
  onOpenRenderStudio,
}) => {
  const site = useMemo(() => normalizeSiteData(project.site), [project.site]);
  const bbox = useMemo(() => getBoundingBox(site.vertices), [site.vertices]);
  const boundarySegs = useMemo(() => getLotBoundarySegments(site), [site]);

  const landscaping: SiteLandscaping = useMemo(
    () => project.landscaping ?? createDefaultLandscaping(project.site),
    [project.landscaping, project.site],
  );

  const [selected, setSelected] = useState<SelectedItem>(null);
  const [leftTab, setLeftTab] = useState<'solo' | 'botanica'>('solo');
  const [speciesPage, setSpeciesPage] = useState(0);
  const [placingSpeciesId, setPlacingSpeciesId] = useState<BotanicalSpeciesId | null>(null);
  const [speciesFilter, setSpeciesFilter] = useState<SpeciesFilter>('todos');
  const [dragging, setDragging] = useState<{
    kind: 'zone' | 'pool' | 'gourmet' | 'plant';
    id: string;
    dx: number;
    dy: number;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  const updateLandscaping = (
    updater: (prev: SiteLandscaping) => SiteLandscaping,
    revisionNote?: string,
  ) => {
    onUpdateProject(
      (prev) => ({
        ...prev,
        landscaping: updater(prev.landscaping ?? createDefaultLandscaping(prev.site)),
      }),
      revisionNote,
    );
  };

  const handleAutoPopulate = () => {
    const generated = autoPopulateLandscaping(project);
    onUpdateProject(
      (prev) => ({
        ...prev,
        landscaping: generated,
      }),
      'Auto-planejamento paisagístico (pisos externos, piscina, espaço gourmet e espécies nativas)',
    );
    setPlacingSpeciesId(null);
    setSelected(null);
  };

  const handleClearLandscaping = () => {
    updateLandscaping(
      (cur) => ({
        ...cur,
        surfaceZones: [],
        pools: [],
        gourmetAreas: [],
        plants: [],
      }),
      'Limpeza dos elementos de paisagismo e lazer',
    );
    setSelected(null);
  };

  const handleAddZone = (surfaceType: ExteriorSurfaceType = 'piso_antiderrapante') => {
    const meta = getExteriorSurfaceMeta(surfaceType);
    const id = nextId('ez');
    const newZone: ExteriorSurfaceZone = {
      id,
      label: meta.shortLabel,
      surfaceType,
      x: round2(bbox.minX + 0.6),
      y: round2(Math.max(bbox.minY + 0.5, bbox.maxY - Math.max(2.2, site.setbacks.front))),
      width: round2(Math.min(4.0, Math.max(1.8, bbox.width * 0.35))),
      depth: round2(Math.min(3.0, Math.max(1.5, site.setbacks.front * 0.7))),
    };
    updateLandscaping((cur) => ({ ...cur, surfaceZones: [...cur.surfaceZones, newZone] }));
    setSelected({ kind: 'zone', id });
  };

  const handleAddPool = () => {
    const id = nextId('pool');
    const newPool: PoolSpec = {
      id,
      label: `Piscina ${landscaping.pools.length + 1}`,
      x: round2(bbox.minX + 1.0),
      y: round2(Math.max(bbox.minY + 0.8, bbox.maxY - Math.max(2.8, site.setbacks.front - 0.3))),
      width: round2(Math.min(4.2, Math.max(2.4, bbox.width * 0.35))),
      depth: 2.2,
      waterDepthM: 1.35,
      style: 'com_prainha',
      copingMaterial: 'pedra_sao_tome',
      linerColor: 'turquesa_hijau',
      hasLedLights: true,
      hasWaterfall: true,
    };
    updateLandscaping((cur) => ({ ...cur, pools: [...cur.pools, newPool] }), 'Inclusão de piscina no terreno');
    setSelected({ kind: 'pool', id });
  };

  const handleAddGourmet = () => {
    const id = nextId('gourmet');
    const newG: GourmetAreaSpec = {
      id,
      label: `Espaço Gourmet ${landscaping.gourmetAreas.length + 1}`,
      x: round2(Math.max(bbox.minX + 0.6, bbox.maxX - 3.6)),
      y: round2(Math.max(bbox.minY + 0.6, bbox.maxY - Math.max(2.8, site.setbacks.front - 0.3))),
      width: 3.0,
      depth: 2.4,
      hasPergola: true,
      pergolaMaterial: 'madeira_cumaru',
      hasChurrasqueira: true,
      hasCounterSink: true,
      hasDiningSet: true,
    };
    updateLandscaping((cur) => ({ ...cur, gourmetAreas: [...cur.gourmetAreas, newG] }), 'Inclusão de área gourmet');
    setSelected({ kind: 'gourmet', id });
  };

  // SVG viewport mapping
  const pad = 2.6;
  const minX = bbox.minX - pad;
  const minY = bbox.minY - pad;
  const viewW = Math.max(10, bbox.width + pad * 2);
  const viewH = Math.max(10, bbox.depth + pad * 2);

  const clientToWorld = (clientX: number, clientY: number) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: round2(((clientX - rect.left) / Math.max(1, rect.width)) * viewW + minX),
      y: round2(((clientY - rect.top) / Math.max(1, rect.height)) * viewH + minY),
    };
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!placingSpeciesId) return;
    const pt = clientToWorld(e.clientX, e.clientY);
    if (!pt) return;
    const px = round2(Math.max(bbox.minX + 0.35, Math.min(bbox.maxX - 0.35, pt.x)));
    const py = round2(Math.max(bbox.minY + 0.35, Math.min(bbox.maxY - 0.35, pt.y)));
    const id = nextId('pl');
    const item: LandscapePlantItem = {
      id,
      speciesId: placingSpeciesId,
      x: px,
      y: py,
      scale: 0.95,
      rotationDeg: Math.round((landscaping.plants.length * 47) % 360),
    };
    updateLandscaping((cur) => ({ ...cur, plants: [...cur.plants, item] }));
    setSelected({ kind: 'plant', id });
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    const pt = clientToWorld(e.clientX, e.clientY);
    if (!pt) return;
    const snap = (v: number) => round2(Math.round(v * 10) / 10);
    const nx = snap(pt.x - dragging.dx);
    const ny = snap(pt.y - dragging.dy);

    if (dragging.kind === 'plant') {
      updateLandscaping((cur) => ({
        ...cur,
        plants: cur.plants.map((p) =>
          p.id === dragging.id
            ? {
                ...p,
                x: Math.max(bbox.minX + 0.25, Math.min(bbox.maxX - 0.25, nx)),
                y: Math.max(bbox.minY + 0.25, Math.min(bbox.maxY - 0.25, ny)),
              }
            : p,
        ),
      }));
    } else if (dragging.kind === 'zone') {
      updateLandscaping((cur) => ({
        ...cur,
        surfaceZones: cur.surfaceZones.map((z) => (z.id === dragging.id ? { ...z, x: nx, y: ny } : z)),
      }));
    } else if (dragging.kind === 'pool') {
      updateLandscaping((cur) => ({
        ...cur,
        pools: cur.pools.map((p) => (p.id === dragging.id ? { ...p, x: nx, y: ny } : p)),
      }));
    } else if (dragging.kind === 'gourmet') {
      updateLandscaping((cur) => ({
        ...cur,
        gourmetAreas: cur.gourmetAreas.map((g) => (g.id === dragging.id ? { ...g, x: nx, y: ny } : g)),
      }));
    }
  };

  const filteredSpecies = useMemo(
    () =>
      speciesFilter === 'todos'
        ? BOTANICAL_SPECIES_CATALOG
        : BOTANICAL_SPECIES_CATALOG.filter((s) => s.category === speciesFilter),
    [speciesFilter],
  );
  const speciesPerPage = useViewportPageSize(380, 62, 3, 8);
  const pagedSpecies = paginateItems(filteredSpecies, speciesPage, speciesPerPage);

  const selectedZone =
    selected?.kind === 'zone' ? landscaping.surfaceZones.find((z) => z.id === selected.id) ?? null : null;
  const selectedPool =
    selected?.kind === 'pool' ? landscaping.pools.find((p) => p.id === selected.id) ?? null : null;
  const selectedGourmet =
    selected?.kind === 'gourmet' ? landscaping.gourmetAreas.find((g) => g.id === selected.id) ?? null : null;
  const selectedPlant =
    selected?.kind === 'plant' ? landscaping.plants.find((p) => p.id === selected.id) ?? null : null;

  const groundMeta = getExteriorSurfaceMeta(landscaping.defaultGroundSurface);

  // Permeable vs impermeable exterior audit
  const summaryStats = useMemo(() => {
    const lotArea = round2(bbox.width * bbox.depth);
    const floorUnits = project.floors[0]?.units ?? [];
    const builtFootprint = round2(
      floorUnits.reduce((acc, inst) => {
        const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
        return acc + (ut ? ut.width * ut.depth : 0);
      }, 0),
    );
    const impermeableZones = round2(
      landscaping.surfaceZones
        .filter((z) => !getExteriorSurfaceMeta(z.surfaceType).permeable)
        .reduce((acc, z) => acc + z.width * z.depth, 0),
    );
    const poolArea = round2(landscaping.pools.reduce((acc, p) => acc + p.width * p.depth, 0));
    const freeLot = Math.max(0.1, lotArea - builtFootprint);
    const permeableArea = Math.max(0, round2(freeLot - impermeableZones - poolArea));
    const permRate = lotArea > 0 ? Math.round((permeableArea / lotArea) * 100) : 0;
    return { lotArea, builtFootprint, poolArea, permeableArea, permRate };
  }, [bbox, landscaping, project.floors, project.unitTypes]);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1520px] flex-col gap-2 overflow-hidden p-3 text-slate-100">
      {/* Compact Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2A2F38] bg-[#1B1E24] px-4 py-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-base font-semibold text-white">
            <Trees className="h-4 w-4 text-emerald-400" />
            Paisagismo, Piscinas, Área Gourmet &amp; Pisos Externos
          </h1>
          <p className="truncate text-[11px] text-slate-400">
            Pisos externos, lazer e 17 espécies botânicas sincronizadas no 3D PBR, CAD e SINAPI-RJ.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleAutoPopulate}
            className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Auto-Preencher
          </button>
          {onOpenRenderStudio && (
            <button
              type="button"
              onClick={onOpenRenderStudio}
              className="inline-flex items-center gap-1 rounded border border-[#2F7CF6] bg-[#2F7CF6]/15 px-2.5 py-1 text-xs font-medium text-[#60A5FA] hover:bg-[#2F7CF6] hover:text-white whitespace-nowrap"
            >
              <Sun className="h-3.5 w-3.5" />
              Render 3D
            </button>
          )}
          <button
            type="button"
            onClick={handleClearLandscaping}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 text-xs text-slate-300 hover:border-red-500/60 hover:text-red-300 whitespace-nowrap"
          >
            <Trash2 className="h-3.5 w-3.5" /> Limpar
          </button>
        </div>
      </div>

      {/* Compact KPI Strip */}
      <div className="grid shrink-0 grid-cols-5 gap-2">
        <div className="rounded border border-[#2A2F38] bg-[#1B1E24] px-3 py-1.5">
          <div className="text-[10px] text-slate-400">Área Livre do Lote</div>
          <div className="font-mono text-sm font-semibold tabular-nums text-white">
            {round2(Math.max(0, summaryStats.lotArea - summaryStats.builtFootprint))} m²
          </div>
        </div>
        <div className="rounded border border-[#2A2F38] bg-[#1B1E24] px-3 py-1.5">
          <div className="text-[10px] text-slate-400">Taxa Permeabilidade</div>
          <div className="font-mono text-sm font-semibold tabular-nums text-emerald-400">
            {summaryStats.permRate}% ({summaryStats.permeableArea} m²)
          </div>
        </div>
        <div className="rounded border border-[#2A2F38] bg-[#1B1E24] px-3 py-1.5">
          <div className="text-[10px] text-slate-400">Zonas de Piso</div>
          <div className="font-mono text-sm font-semibold tabular-nums text-white">
            {landscaping.surfaceZones.length} zonas
          </div>
        </div>
        <div className="rounded border border-[#2A2F38] bg-[#1B1E24] px-3 py-1.5">
          <div className="text-[10px] text-slate-400">Piscina &amp; Gourmet</div>
          <div className="font-mono text-sm font-semibold tabular-nums text-cyan-300">
            {landscaping.pools.length} pisc. · {landscaping.gourmetAreas.length} goum.
          </div>
        </div>
        <div className="rounded border border-[#2A2F38] bg-[#1B1E24] px-3 py-1.5">
          <div className="text-[10px] text-slate-400">Árvores &amp; Espécies</div>
          <div className="font-mono text-sm font-semibold tabular-nums text-emerald-300">
            {landscaping.plants.length} exemplares
          </div>
        </div>
      </div>

      {/* Main 3-column Zero-Scroll Workspace */}
      <div className="grid min-h-0 flex-1 grid-cols-12 gap-3 overflow-hidden">
        {/* Left Controls (Tabbed: Solo & Lazer | Catálogo Botânico) */}
        <div className="col-span-4 flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#2A2F38] bg-[#1B1E24]">
          <div className="flex shrink-0 border-b border-[#2A2F38] bg-[#14161A] p-1 gap-1">
            <button
              type="button"
              onClick={() => setLeftTab('solo')}
              className={`flex-1 rounded py-1 text-xs font-medium whitespace-nowrap ${
                leftTab === 'solo' ? 'bg-[#2F7CF6] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Solo &amp; Lazer
            </button>
            <button
              type="button"
              onClick={() => setLeftTab('botanica')}
              className={`flex-1 rounded py-1 text-xs font-medium whitespace-nowrap ${
                leftTab === 'botanica' ? 'bg-[#2F7CF6] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Botânica Real (17)
            </button>
          </div>

          {leftTab === 'solo' ? (
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-3 overflow-hidden p-3">
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Solo Base Predominante do Terreno
                  </label>
                  <select
                    value={landscaping.defaultGroundSurface}
                    onChange={(e) =>
                      updateLandscaping((cur) => ({
                        ...cur,
                        defaultGroundSurface: e.target.value as ExteriorSurfaceType,
                      }))
                    }
                    className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                  >
                    {EXTERIOR_SURFACE_CATALOG.map((surf) => (
                      <option key={surf.id} value={surf.id}>
                        {surf.label} {surf.permeable ? '· Permeável' : '· Impermeável'}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-400">{groundMeta.notes}</p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddZone('piso_antiderrapante')}
                    className="flex flex-col items-center gap-1 rounded border border-[#2A2F38] bg-[#14161A] px-2 py-2 text-[11px] font-medium text-slate-200 hover:border-[#2F7CF6] hover:text-white"
                  >
                    <Layers className="h-4 w-4 text-amber-300" />
                    + Zona Piso
                  </button>
                  <button
                    type="button"
                    onClick={handleAddPool}
                    className="flex flex-col items-center gap-1 rounded border border-[#2A2F38] bg-[#14161A] px-2 py-2 text-[11px] font-medium text-slate-200 hover:border-cyan-400 hover:text-white"
                  >
                    <Waves className="h-4 w-4 text-cyan-400" />
                    + Piscina
                  </button>
                  <button
                    type="button"
                    onClick={handleAddGourmet}
                    className="flex flex-col items-center gap-1 rounded border border-[#2A2F38] bg-[#14161A] px-2 py-2 text-[11px] font-medium text-slate-200 hover:border-orange-400 hover:text-white"
                  >
                    <Flame className="h-4 w-4 text-orange-400" />
                    + Gourmet
                  </button>
                </div>

                <label className="flex cursor-pointer items-center gap-2 border-t border-slate-800 pt-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={landscaping.gardenLightsOn ?? true}
                    onChange={(e) =>
                      updateLandscaping((cur) => ({ ...cur, gardenLightsOn: e.target.checked }))
                    }
                  />
                  Balizadores / iluminação cênica noturna
                </label>
              </div>

              <div className="space-y-2 rounded border border-[#2A2F38] bg-[#14161A] p-3 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <Plus className="h-3.5 w-3.5 text-emerald-400" /> Piso Rápido por Material
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ['piso_antiderrapante', 'Antiderrapante'],
                      ['cimento_queimado', 'Cimento Queim.'],
                      ['areia', 'Areia'],
                      ['brita', 'Brita'],
                      ['deck_madeira', 'Deck'],
                      ['paver_intertravado', 'Paver'],
                    ] as const
                  ).map(([surf, lbl]) => (
                    <button
                      key={surf}
                      type="button"
                      onClick={() => handleAddZone(surf)}
                      className="rounded border border-[#2A2F38] bg-[#1B1E24] px-2 py-1 text-[11px] text-slate-300 hover:border-emerald-400 hover:text-white"
                    >
                      + {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden">
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3">
                <div className="flex shrink-0 items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                    Espécies ({filteredSpecies.length})
                  </span>
                  {placingSpeciesId && (
                    <button
                      type="button"
                      onClick={() => setPlacingSpeciesId(null)}
                      className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10.5px] text-amber-300"
                    >
                      Cancelar plantio
                    </button>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap gap-1">
                  {(
                    [
                      ['todos', 'Todas'],
                      ['frutifera', 'Frutíferas'],
                      ['palmeira', 'Palmeiras'],
                      ['arvore_ornamental', 'Árvores'],
                      ['tropical_arbusto', 'Tropicais'],
                    ] as const
                  ).map(([cat, label]) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setSpeciesFilter(cat);
                        setSpeciesPage(0);
                      }}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                        speciesFilter === cat
                          ? 'bg-[#2F7CF6] text-white'
                          : 'bg-[#14161A] text-slate-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {placingSpeciesId && (
                  <div className="shrink-0 rounded border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1 text-[11px] text-emerald-200">
                    Clique na planta ao lado para plantar:{' '}
                    <strong>{getBotanicalMeta(placingSpeciesId).commonName}</strong>
                  </div>
                )}

                <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
                  {pagedSpecies.slice.map((sp) => {
                    const isPlacing = placingSpeciesId === sp.id;
                    return (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => setPlacingSpeciesId(isPlacing ? null : sp.id)}
                        className={`flex w-full items-start gap-2 rounded border p-2 text-left transition ${
                          isPlacing
                            ? 'border-emerald-400 bg-emerald-950/40'
                            : 'border-[#2A2F38] bg-[#14161A] hover:border-slate-600'
                        }`}
                      >
                        <span
                          className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-white/20"
                          style={{
                            background: `radial-gradient(circle at 35% 35%, ${sp.accentHex}, ${sp.foliageHex})`,
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-xs font-semibold text-white">
                              {sp.commonName}
                            </span>
                            <span className="shrink-0 font-mono text-[10px] text-emerald-300">
                              H {sp.matureHeightM}m · Ø{sp.canopyDiameterM}m
                            </span>
                          </div>
                          <div className="truncate text-[10px] italic text-slate-400">
                            {sp.scientificName} · {sp.sunExposure}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <PaginationBar
                page={pagedSpecies.safePage}
                totalPages={pagedSpecies.totalPages}
                totalItems={filteredSpecies.length}
                startIndex={pagedSpecies.start}
                endIndex={pagedSpecies.end}
                onPageChange={setSpeciesPage}
                itemLabel="espécies"
                compact
              />
            </div>
          )}
        </div>

        {/* Center Interactive Top-Down Lot Planner */}
        <div className="col-span-5 flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-3">
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 truncate font-medium text-slate-200">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-[#2F7CF6]" />
              <span className="truncate">
                {placingSpeciesId
                  ? 'Modo Plantio: clique no lote para posicionar'
                  : 'Planta Paisagística Interativa (arraste elementos)'}
              </span>
            </span>
            <span className="shrink-0 font-mono text-[11px] text-slate-400">
              {round2(bbox.width)}×{round2(bbox.depth)} m
            </span>
          </div>

          <svg
            ref={svgRef}
            viewBox={`${minX} ${minY} ${viewW} ${viewH}`}
            onClick={handleSvgClick}
            onPointerMove={handlePointerMove}
            onPointerUp={() => setDragging(null)}
            onPointerLeave={() => setDragging(null)}
            className={`min-h-0 w-full flex-1 rounded border border-[#2A2F38] bg-[#0B1018] ${
              placingSpeciesId ? 'cursor-crosshair' : 'cursor-default'
            }`}
          >
              {/* Ground Surface Lot Polygon */}
              <polygon
                points={site.vertices.map((v) => `${v.x},${v.y}`).join(' ')}
                fill={groundMeta.colorHex}
                fillOpacity={0.34}
                stroke="#475569"
                strokeWidth="0.06"
              />

              {/* Exterior Surface Zones (antiderrapante, areia, brita, deck, paver, gramas) */}
              {landscaping.surfaceZones.map((zone) => {
                const zm = getExteriorSurfaceMeta(zone.surfaceType);
                const isSel = selected?.kind === 'zone' && selected.id === zone.id;
                return (
                  <g
                    key={zone.id}
                    onPointerDown={(e) => {
                      if (placingSpeciesId) return;
                      e.stopPropagation();
                      const pt = clientToWorld(e.clientX, e.clientY);
                      setSelected({ kind: 'zone', id: zone.id });
                      if (pt) {
                        setDragging({ kind: 'zone', id: zone.id, dx: pt.x - zone.x, dy: pt.y - zone.y });
                      }
                    }}
                    className="cursor-move"
                  >
                    <rect
                      x={zone.x}
                      y={zone.y}
                      width={zone.width}
                      height={zone.depth}
                      fill={zm.colorHex}
                      fillOpacity={0.78}
                      stroke={isSel ? '#38BDF8' : zm.accentHex}
                      strokeWidth={isSel ? 0.1 : 0.04}
                    />
                    <text
                      x={zone.x + zone.width / 2}
                      y={zone.y + zone.depth / 2}
                      textAnchor="middle"
                      fill="#F8FAFC"
                      fontSize="0.28"
                      fontFamily="monospace"
                    >
                      {zm.shortLabel}
                    </text>
                  </g>
                );
              })}

              {/* Boundary Walls & Gates */}
              {boundarySegs.map((seg) => {
                const cond = seg.boundary.condition;
                const ux = (seg.b.x - seg.a.x) / Math.max(0.01, seg.lengthM);
                const uy = (seg.b.y - seg.a.y) / Math.max(0.01, seg.lengthM);
                const gatesOnSeg = site.accesses.filter((g) => g.enabled && g.side === seg.side);
                return (
                  <g key={`bound-${seg.side}`}>
                    {cond !== 'aberta' && (
                      <line
                        x1={seg.a.x}
                        y1={seg.a.y}
                        x2={seg.b.x}
                        y2={seg.b.y}
                        stroke={cond === 'murada' ? '#E2E8F0' : '#94A3B8'}
                        strokeWidth={cond === 'murada' ? 0.14 : 0.09}
                        strokeDasharray={cond === 'cerca' ? '0.2 0.15' : undefined}
                      />
                    )}
                    {gatesOnSeg.map((gate) => {
                      const gw = getGateWorldPosition(site, gate);
                      if (!gw) return null;
                      const gStart = Math.max(0, gate.offsetM);
                      const gEnd = Math.min(seg.lengthM, gStart + gate.widthM);
                      return (
                        <line
                          key={gate.id}
                          x1={seg.a.x + ux * gStart}
                          y1={seg.a.y + uy * gStart}
                          x2={seg.a.x + ux * gEnd}
                          y2={seg.a.y + uy * gEnd}
                          stroke="#F59E0B"
                          strokeWidth="0.16"
                        />
                      );
                    })}
                  </g>
                );
              })}

              {/* Buildings Footprint */}
              {(project.floors[0]?.units ?? []).map((inst) => {
                const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
                if (!ut) return null;
                const rect = getUnitWorldRect(inst, ut);
                return (
                  <g key={inst.id}>
                    <rect
                      x={rect.x}
                      y={rect.y}
                      width={rect.width}
                      height={rect.depth}
                      fill="#1E293B"
                      stroke="#60A5FA"
                      strokeWidth="0.08"
                    />
                    <text
                      x={rect.x + rect.width / 2}
                      y={rect.y + rect.depth / 2 + 0.12}
                      textAnchor="middle"
                      fill="#E2E8F0"
                      fontSize="0.34"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      Unid. {inst.unitNumber}
                    </text>
                  </g>
                );
              })}

              {/* Pools */}
              {landscaping.pools.map((pool) => {
                const isSel = selected?.kind === 'pool' && selected.id === pool.id;
                const waterCol =
                  pool.linerColor === 'turquesa_hijau'
                    ? '#14B8A6'
                    : pool.linerColor === 'ardosia'
                      ? '#2563EB'
                      : '#0EA5E9';
                return (
                  <g
                    key={pool.id}
                    onPointerDown={(e) => {
                      if (placingSpeciesId) return;
                      e.stopPropagation();
                      const pt = clientToWorld(e.clientX, e.clientY);
                      setSelected({ kind: 'pool', id: pool.id });
                      if (pt) {
                        setDragging({ kind: 'pool', id: pool.id, dx: pt.x - pool.x, dy: pt.y - pool.y });
                      }
                    }}
                    className="cursor-move"
                  >
                    {/* Coping rim */}
                    <rect
                      x={pool.x - 0.18}
                      y={pool.y - 0.18}
                      width={pool.width + 0.36}
                      height={pool.depth + 0.36}
                      fill="#E2DDD3"
                      stroke={isSel ? '#38BDF8' : '#64748B'}
                      strokeWidth={isSel ? 0.1 : 0.04}
                    />
                    <rect
                      x={pool.x}
                      y={pool.y}
                      width={pool.width}
                      height={pool.depth}
                      fill={waterCol}
                      fillOpacity={0.85}
                    />
                    {pool.style === 'com_prainha' && (
                      <rect
                        x={pool.x}
                        y={pool.y}
                        width={Math.min(1.0, pool.width * 0.28)}
                        height={pool.depth}
                        fill="#7DD3FC"
                        fillOpacity={0.45}
                      />
                    )}
                    <text
                      x={pool.x + pool.width / 2}
                      y={pool.y + pool.depth / 2 + 0.1}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="0.28"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      PISCINA {pool.width.toFixed(1)}×{pool.depth.toFixed(1)}m
                    </text>
                  </g>
                );
              })}

              {/* Gourmet Areas */}
              {landscaping.gourmetAreas.map((g) => {
                const isSel = selected?.kind === 'gourmet' && selected.id === g.id;
                return (
                  <g
                    key={g.id}
                    onPointerDown={(e) => {
                      if (placingSpeciesId) return;
                      e.stopPropagation();
                      const pt = clientToWorld(e.clientX, e.clientY);
                      setSelected({ kind: 'gourmet', id: g.id });
                      if (pt) {
                        setDragging({ kind: 'gourmet', id: g.id, dx: pt.x - g.x, dy: pt.y - g.y });
                      }
                    }}
                    className="cursor-move"
                  >
                    <rect
                      x={g.x}
                      y={g.y}
                      width={g.width}
                      height={g.depth}
                      fill="#7C2D12"
                      fillOpacity={0.45}
                      stroke={isSel ? '#FBBF24' : '#F97316'}
                      strokeWidth={isSel ? 0.1 : 0.05}
                    />
                    {g.hasPergola &&
                      [0.2, 0.4, 0.6, 0.8].map((frac) => (
                        <line
                          key={frac}
                          x1={g.x + g.width * frac}
                          y1={g.y}
                          x2={g.x + g.width * frac}
                          y2={g.y + g.depth}
                          stroke="#FDBA74"
                          strokeWidth="0.03"
                          strokeDasharray="0.1 0.08"
                        />
                      ))}
                    <text
                      x={g.x + g.width / 2}
                      y={g.y + g.depth / 2 + 0.1}
                      textAnchor="middle"
                      fill="#FFEDD5"
                      fontSize="0.26"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      GOURMET
                    </text>
                  </g>
                );
              })}

              {/* Plants Canopy Circles */}
              {landscaping.plants.map((pl) => {
                const sp = getBotanicalMeta(pl.speciesId);
                const r = Math.max(0.32, (sp.canopyDiameterM * pl.scale) / 2);
                const isSel = selected?.kind === 'plant' && selected.id === pl.id;
                return (
                  <g
                    key={pl.id}
                    onPointerDown={(e) => {
                      if (placingSpeciesId) return;
                      e.stopPropagation();
                      const pt = clientToWorld(e.clientX, e.clientY);
                      setSelected({ kind: 'plant', id: pl.id });
                      if (pt) {
                        setDragging({ kind: 'plant', id: pl.id, dx: pt.x - pl.x, dy: pt.y - pl.y });
                      }
                    }}
                    className="cursor-move"
                  >
                    <circle
                      cx={pl.x}
                      cy={pl.y}
                      r={r}
                      fill={sp.foliageHex}
                      fillOpacity={0.68}
                      stroke={isSel ? '#FACC15' : sp.secondaryFoliageHex}
                      strokeWidth={isSel ? 0.09 : 0.04}
                    />
                    <circle cx={pl.x} cy={pl.y} r={0.1} fill={sp.accentHex} />
                    <text
                      x={pl.x}
                      y={pl.y + r + 0.25}
                      textAnchor="middle"
                      fill="#D1FAE5"
                      fontSize="0.22"
                      fontFamily="monospace"
                    >
                      {sp.commonName.split(' ')[0]}
                    </text>
                  </g>
                );
              })}
            </svg>
        </div>

        {/* Right Inspector Panel */}
        <div className="col-span-3 flex min-h-0 flex-col gap-2 overflow-hidden">
          <div className="flex-1 overflow-hidden rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-3 space-y-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Propriedades do Elemento
            </h2>

            {!selectedZone && !selectedPool && !selectedGourmet && !selectedPlant && (
              <div className="space-y-2 text-xs text-slate-400">
                <p>
                  Clique em qualquer piso externo, piscina, área gourmet ou planta na visualização ao lado para ajustar posição, tamanho e materiais.
                </p>
                <div className="rounded border border-slate-800 bg-[#14161A] p-2.5 text-[11px] space-y-1">
                  <div className="font-semibold text-slate-200">Elementos no lote:</div>
                  <div>• {landscaping.surfaceZones.length} zonas de piso/gramado</div>
                  <div>• {landscaping.pools.length} piscina(s)</div>
                  <div>• {landscaping.gourmetAreas.length} área(s) gourmet</div>
                  <div>• {landscaping.plants.length} plantas/árvores</div>
                </div>
              </div>
            )}

            {selectedZone && (
              <div className="space-y-2.5 text-xs">
                <div className="font-semibold text-amber-300">Zona de Piso / Forração</div>
                <label className="block space-y-1">
                  <span className="text-[11px] text-slate-400">Nome / Rótulo</span>
                  <input
                    type="text"
                    value={selectedZone.label}
                    onChange={(e) =>
                      updateLandscaping((cur) => ({
                        ...cur,
                        surfaceZones: cur.surfaceZones.map((z) =>
                          z.id === selectedZone.id ? { ...z, label: e.target.value } : z,
                        ),
                      }))
                    }
                    className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 text-white"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] text-slate-400">Material Externo</span>
                  <select
                    value={selectedZone.surfaceType}
                    onChange={(e) =>
                      updateLandscaping((cur) => ({
                        ...cur,
                        surfaceZones: cur.surfaceZones.map((z) =>
                          z.id === selectedZone.id
                            ? { ...z, surfaceType: e.target.value as ExteriorSurfaceType }
                            : z,
                        ),
                      }))
                    }
                    className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 text-white"
                  >
                    {EXTERIOR_SURFACE_CATALOG.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['x', 'X (m)', selectedZone.x],
                      ['y', 'Y (m)', selectedZone.y],
                      ['width', 'Larg. (m)', selectedZone.width],
                      ['depth', 'Comp. (m)', selectedZone.depth],
                    ] as const
                  ).map(([field, label, val]) => (
                    <label key={field} className="block space-y-0.5">
                      <span className="text-[10.5px] text-slate-400">{label}</span>
                      <input
                        type="number"
                        step="0.1"
                        value={val}
                        onChange={(e) => {
                          const v = round2(Number(e.target.value) || 0);
                          updateLandscaping((cur) => ({
                            ...cur,
                            surfaceZones: cur.surfaceZones.map((z) =>
                              z.id === selectedZone.id
                                ? {
                                    ...z,
                                    [field]:
                                      field === 'width' || field === 'depth'
                                        ? Math.max(0.4, v)
                                        : v,
                                  }
                                : z,
                            ),
                          }));
                        }}
                        className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 font-mono text-white"
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    updateLandscaping((cur) => ({
                      ...cur,
                      surfaceZones: cur.surfaceZones.filter((z) => z.id !== selectedZone.id),
                    }));
                    setSelected(null);
                  }}
                  className="w-full rounded border border-red-500/40 bg-red-950/50 py-1.5 text-red-300 hover:bg-red-900/60"
                >
                  Remover Zona
                </button>
              </div>
            )}

            {selectedPool && (
              <div className="space-y-2.5 text-xs">
                <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                  <Droplets className="h-3.5 w-3.5" /> {selectedPool.label}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['x', 'X (m)', selectedPool.x],
                      ['y', 'Y (m)', selectedPool.y],
                      ['width', 'Larg. (m)', selectedPool.width],
                      ['depth', 'Comp. (m)', selectedPool.depth],
                    ] as const
                  ).map(([field, label, val]) => (
                    <label key={field} className="block space-y-0.5">
                      <span className="text-[10.5px] text-slate-400">{label}</span>
                      <input
                        type="number"
                        step="0.1"
                        value={val}
                        onChange={(e) => {
                          const v = round2(Number(e.target.value) || 0);
                          updateLandscaping((cur) => ({
                            ...cur,
                            pools: cur.pools.map((p) =>
                              p.id === selectedPool.id
                                ? {
                                    ...p,
                                    [field]:
                                      field === 'width' || field === 'depth'
                                        ? Math.max(1.4, v)
                                        : v,
                                  }
                                : p,
                            ),
                          }));
                        }}
                        className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 font-mono text-white"
                      />
                    </label>
                  ))}
                </div>
                <label className="block space-y-1">
                  <span className="text-[11px] text-slate-400">Revestimento Interno</span>
                  <select
                    value={selectedPool.linerColor}
                    onChange={(e) =>
                      updateLandscaping((cur) => ({
                        ...cur,
                        pools: cur.pools.map((p) =>
                          p.id === selectedPool.id
                            ? { ...p, linerColor: e.target.value as PoolSpec['linerColor'] }
                            : p,
                        ),
                      }))
                    }
                    className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 text-white"
                  >
                    <option value="turquesa_hijau">Pedra Hijau Turquesa</option>
                    <option value="azul_piscina">Pastilha Azul Piscina</option>
                    <option value="ardosia">Ardósia Escura Contemporânea</option>
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] text-slate-400">Borda Térmica</span>
                  <select
                    value={selectedPool.copingMaterial}
                    onChange={(e) =>
                      updateLandscaping((cur) => ({
                        ...cur,
                        pools: cur.pools.map((p) =>
                          p.id === selectedPool.id
                            ? { ...p, copingMaterial: e.target.value as PoolSpec['copingMaterial'] }
                            : p,
                        ),
                      }))
                    }
                    className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 text-white"
                  >
                    <option value="pedra_sao_tome">Pedra São Tomé Atérmica</option>
                    <option value="porcelanato_antiderrapante">Porcelanato Antiderrapante</option>
                    <option value="deck_madeira">Deck Madeira Cumaru</option>
                  </select>
                </label>
                <div className="space-y-1 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPool.style === 'com_prainha'}
                      onChange={(e) =>
                        updateLandscaping((cur) => ({
                          ...cur,
                          pools: cur.pools.map((p) =>
                            p.id === selectedPool.id
                              ? { ...p, style: e.target.checked ? 'com_prainha' : 'retangular' }
                              : p,
                          ),
                        }))
                      }
                    />
                    Prainha rasa / solário integrado
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPool.hasWaterfall}
                      onChange={(e) =>
                        updateLandscaping((cur) => ({
                          ...cur,
                          pools: cur.pools.map((p) =>
                            p.id === selectedPool.id ? { ...p, hasWaterfall: e.target.checked } : p,
                          ),
                        }))
                      }
                    />
                    Cascata inox escovado
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPool.hasLedLights}
                      onChange={(e) =>
                        updateLandscaping((cur) => ({
                          ...cur,
                          pools: cur.pools.map((p) =>
                            p.id === selectedPool.id ? { ...p, hasLedLights: e.target.checked } : p,
                          ),
                        }))
                      }
                    />
                    Refletores LED subaquáticos
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    updateLandscaping((cur) => ({
                      ...cur,
                      pools: cur.pools.filter((p) => p.id !== selectedPool.id),
                    }));
                    setSelected(null);
                  }}
                  className="w-full rounded border border-red-500/40 bg-red-950/50 py-1.5 text-red-300 hover:bg-red-900/60"
                >
                  Remover Piscina
                </button>
              </div>
            )}

            {selectedGourmet && (
              <div className="space-y-2.5 text-xs">
                <div className="font-semibold text-orange-300 flex items-center gap-1.5">
                  <Flame className="h-3.5 w-3.5" /> {selectedGourmet.label}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['x', 'X (m)', selectedGourmet.x],
                      ['y', 'Y (m)', selectedGourmet.y],
                      ['width', 'Larg. (m)', selectedGourmet.width],
                      ['depth', 'Comp. (m)', selectedGourmet.depth],
                    ] as const
                  ).map(([field, label, val]) => (
                    <label key={field} className="block space-y-0.5">
                      <span className="text-[10.5px] text-slate-400">{label}</span>
                      <input
                        type="number"
                        step="0.1"
                        value={val}
                        onChange={(e) => {
                          const v = round2(Number(e.target.value) || 0);
                          updateLandscaping((cur) => ({
                            ...cur,
                            gourmetAreas: cur.gourmetAreas.map((g) =>
                              g.id === selectedGourmet.id
                                ? {
                                    ...g,
                                    [field]:
                                      field === 'width' || field === 'depth'
                                        ? Math.max(1.6, v)
                                        : v,
                                  }
                                : g,
                            ),
                          }));
                        }}
                        className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 font-mono text-white"
                      />
                    </label>
                  ))}
                </div>
                <label className="block space-y-1">
                  <span className="text-[11px] text-slate-400">Estrutura Pergolado</span>
                  <select
                    value={selectedGourmet.pergolaMaterial}
                    onChange={(e) =>
                      updateLandscaping((cur) => ({
                        ...cur,
                        gourmetAreas: cur.gourmetAreas.map((g) =>
                          g.id === selectedGourmet.id
                            ? {
                                ...g,
                                pergolaMaterial: e.target.value as GourmetAreaSpec['pergolaMaterial'],
                              }
                            : g,
                        ),
                      }))
                    }
                    className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 text-white"
                  >
                    <option value="madeira_cumaru">Madeira Cumaru Aparelhada</option>
                    <option value="aco_preto">Estrutura Metálica Preta</option>
                  </select>
                </label>
                {(
                  [
                    ['hasPergola', 'Pergolado vazado'],
                    ['hasChurrasqueira', 'Churrasqueira com chaminé'],
                    ['hasCounterSink', 'Bancada granito com pia'],
                    ['hasDiningSet', 'Mesa & banquetas externas'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedGourmet[key]}
                      onChange={(e) =>
                        updateLandscaping((cur) => ({
                          ...cur,
                          gourmetAreas: cur.gourmetAreas.map((g) =>
                            g.id === selectedGourmet.id ? { ...g, [key]: e.target.checked } : g,
                          ),
                        }))
                      }
                    />
                    {label}
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    updateLandscaping((cur) => ({
                      ...cur,
                      gourmetAreas: cur.gourmetAreas.filter((g) => g.id !== selectedGourmet.id),
                    }));
                    setSelected(null);
                  }}
                  className="w-full rounded border border-red-500/40 bg-red-950/50 py-1.5 text-red-300 hover:bg-red-900/60"
                >
                  Remover Área Gourmet
                </button>
              </div>
            )}

            {selectedPlant && (() => {
              const meta = getBotanicalMeta(selectedPlant.speciesId);
              return (
                <div className="space-y-2.5 text-xs">
                  <div className="font-semibold text-emerald-300">{meta.commonName}</div>
                  <div className="italic text-[11px] text-slate-400">{meta.scientificName}</div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{meta.description}</p>
                  <div className="rounded border border-slate-800 bg-[#14161A] p-2 text-[10.5px] text-slate-400">
                    <div>Porte adulto: {meta.matureHeightM}m alt. × {meta.canopyDiameterM}m copa</div>
                    <div className="text-amber-300/90 mt-0.5">{meta.rootNote}</div>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-[11px] text-slate-400">Espécie</span>
                    <select
                      value={selectedPlant.speciesId}
                      onChange={(e) =>
                        updateLandscaping((cur) => ({
                          ...cur,
                          plants: cur.plants.map((p) =>
                            p.id === selectedPlant.id
                              ? { ...p, speciesId: e.target.value as BotanicalSpeciesId }
                              : p,
                          ),
                        }))
                      }
                      className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 text-white"
                    >
                      {BOTANICAL_SPECIES_CATALOG.map((sp) => (
                        <option key={sp.id} value={sp.id}>
                          {sp.commonName} ({sp.categoryLabel})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] text-slate-400">
                      Porte / Escala ({Math.round(selectedPlant.scale * 100)}%)
                    </span>
                    <input
                      type="range"
                      min={0.55}
                      max={1.45}
                      step={0.05}
                      value={selectedPlant.scale}
                      onChange={(e) =>
                        updateLandscaping((cur) => ({
                          ...cur,
                          plants: cur.plants.map((p) =>
                            p.id === selectedPlant.id ? { ...p, scale: Number(e.target.value) } : p,
                          ),
                        }))
                      }
                      className="w-full accent-emerald-500"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      updateLandscaping((cur) => ({
                        ...cur,
                        plants: cur.plants.filter((p) => p.id !== selectedPlant.id),
                      }));
                      setSelected(null);
                    }}
                    className="w-full rounded border border-red-500/40 bg-red-950/50 py-1.5 text-red-300 hover:bg-red-900/60"
                  >
                    Remover Exemplar
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};
