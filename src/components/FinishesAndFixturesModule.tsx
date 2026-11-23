import React, { useMemo, useState } from 'react';
import {
  Bath,
  Box,
  Camera,
  Check,
  CheckCircle2,
  Droplets,
  Home,
  Layers,
  Paintbrush,
  Sparkles,
  Trees,
} from 'lucide-react';
import {
  BASEBOARD_OPTIONS,
  CEILING_OPTIONS,
  DRAIN_OPTIONS,
  FLOOR_INTERNAL_OPTIONS,
  GLASS_TYPE_OPTIONS,
  INTERIOR_DOOR_OPTIONS,
  KITCHEN_FAUCET_OPTIONS,
  KITCHEN_SINK_OPTIONS,
  LAUNDRY_TUB_OPTIONS,
  METALS_FINISH_OPTIONS,
  ROOF_MATERIAL_OPTIONS,
  ROOF_SHAPE_OPTIONS,
  SANITARY_COLOR_OPTIONS,
  SHOWER_OPTIONS,
  TOILET_OPTIONS,
  WALL_EXTERIOR_OPTIONS,
  WALL_INTERIOR_OPTIONS,
  WASHBASIN_FAUCET_OPTIONS,
  WASHBASIN_OPTIONS,
  WET_FLOOR_OPTIONS,
  WET_WALL_BATHROOM_OPTIONS,
  WET_WALL_KITCHEN_OPTIONS,
  WINDOW_FRAME_OPTIONS,
  findLabel,
  getNormalizedSanitaryFixtures,
  syncFinishesToTypologyRooms,
  type CatalogOption,
} from '../engine/finishesCatalog';
import {
  EXTERIOR_SURFACE_CATALOG,
  createDefaultLandscaping,
} from '../engine/landscaping';
import type {
  ConstructionMethodDetails,
  ExteriorSurfaceType,
  Project,
  RenderMaterialSettings,
  RoofFinishMaterial,
  SanitaryFixturesSpec,
} from '../types/project';

interface FinishesAndFixturesModuleProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
  onNavigateModule: (moduleId: string) => void;
}

type FinishTab = 'paredes' | 'pisos_forro' | 'cobertura_esquadrias' | 'loucas_metais';

function OptionCardGrid<T extends string>({
  title,
  subtitle,
  options,
  value,
  onSelect,
  cols = 3,
}: {
  title: string;
  subtitle?: string;
  options: Array<CatalogOption<T>>;
  value: T;
  onSelect: (id: T) => void;
  cols?: 2 | 3 | 4;
}) {
  const gridCls =
    cols === 4
      ? 'grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4'
      : cols === 2
        ? 'grid gap-2.5 sm:grid-cols-2'
        : 'grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className={gridCls}>
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect(opt.id)}
              className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition ${
                active
                  ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 shadow-sm'
                  : 'border-slate-800 bg-[#14161A] hover:border-slate-600'
              }`}
            >
              <span
                className="mt-0.5 h-7 w-7 shrink-0 rounded border border-white/20 shadow-inner"
                style={{
                  background: opt.accentHex
                    ? `linear-gradient(135deg, ${opt.swatchHex} 60%, ${opt.accentHex} 100%)`
                    : opt.swatchHex,
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-white leading-snug">
                    {opt.label}
                  </span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-[#60A5FA]" />}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{opt.spec}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const FinishesAndFixturesModule: React.FC<FinishesAndFixturesModuleProps> = ({
  project,
  onUpdateProject,
  onNavigateModule,
}) => {
  const [activeTab, setActiveTab] = useState<FinishTab>('paredes');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const rs = project.renderSettings;
  const fx = useMemo(() => getNormalizedSanitaryFixtures(project), [project]);
  const landscaping = useMemo(
    () => project.landscaping ?? createDefaultLandscaping(project.site),
    [project.landscaping, project.site],
  );

  const updateRS = (patch: Partial<RenderMaterialSettings>, note?: string) => {
    onUpdateProject((prev) => {
      const next: Project = {
        ...prev,
        renderSettings: {
          ...prev.renderSettings,
          ...patch,
        },
      };
      return syncFinishesToTypologyRooms(next);
    }, note);
  };

  const updateRoofMaterial = (roofMaterial: RoofFinishMaterial) => {
    const roofTypeMap: Record<RoofFinishMaterial, ConstructionMethodDetails['roofType']> = {
      termoacustica_zinco: 'telha_termoacustica',
      ceramica_terracota: 'telha_ceramica',
      fibrocimento_cinza: 'telha_fibrocimento',
      concreto_impermeabilizado: 'laje_impermeabilizada',
    };
    onUpdateProject(
      (prev) => ({
        ...prev,
        renderSettings: { ...prev.renderSettings, roofMaterial },
        constructionMethod: {
          ...prev.constructionMethod,
          roofType: roofTypeMap[roofMaterial],
        },
      }),
      `Tipo de telha/cobertura atualizado para ${findLabel(ROOF_MATERIAL_OPTIONS, roofMaterial)}`,
    );
  };

  const updateSanitary = (patch: Partial<SanitaryFixturesSpec>, note?: string) => {
    onUpdateProject((prev) => {
      const currentFx = getNormalizedSanitaryFixtures(prev);
      const nextFx = { ...currentFx, ...patch };
      const needsGasWater =
        nextFx.showerType === 'ducha_aquecedor_gas' ||
        nextFx.showerType === 'ducha_teto_monocomando';

      const next: Project = {
        ...prev,
        hydraulicConfig: {
          ...prev.hydraulicConfig,
          hasHotWaterHeating: needsGasWater ? true : prev.hydraulicConfig.hasHotWaterHeating,
          sanitaryFixtures: nextFx,
        },
      };
      return syncFinishesToTypologyRooms(next);
    }, note);
  };

  const updateDefaultGroundSurface = (surface: ExteriorSurfaceType) => {
    onUpdateProject(
      (prev) => ({
        ...prev,
        landscaping: {
          ...(prev.landscaping ?? createDefaultLandscaping(prev.site)),
          defaultGroundSurface: surface,
        },
      }),
      `Piso externo padrão alterado para ${surface.replace(/_/g, ' ')}`,
    );
  };

  const handleForceSyncRooms = () => {
    onUpdateProject(
      (prev) => syncFinishesToTypologyRooms(prev),
      'Acabamentos, louças e metais aplicados a todos os ambientes das tipologias',
    );
    setSyncNotice('Especificações aplicadas em todos os ambientes, 3D e Memorial Descritivo!');
    setTimeout(() => setSyncNotice(null), 4000);
  };

  return (
    <div className="h-full overflow-y-auto bg-[#14161A] p-6 text-slate-100">
      <div className="mx-auto max-w-[1440px] space-y-6">
        {/* Top Studio Header */}
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">
              Caderno Completo de Acabamentos, Revestimentos, Cobertura, Louças &amp; Metais
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Especifique cada detalhe de paredes, pisos internos/externos, rodapés, forros, telhados, esquadrias, chuveiros, torneiras, ralos e bacias sanitárias — tudo sincronizado com o BIM 3D, Render Cinematográfico, Orçamento SINAPI-RJ e Memorial Descritivo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleForceSyncRooms}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-600/15 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-600/30"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Sincronizar nos Ambientes
            </button>
            <button
              type="button"
              onClick={() => onNavigateModule('paisagismo')}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#1B1E24] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-500"
            >
              <Trees className="h-3.5 w-3.5 text-emerald-400" />
              Jardins, Piscina &amp; Gourmet
            </button>
            <button
              type="button"
              onClick={() => onNavigateModule('bim3d')}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#1B1E24] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-[#2F7CF6]"
            >
              <Box className="h-3.5 w-3.5 text-[#60A5FA]" />
              Ver em BIM 3D
            </button>
            <button
              type="button"
              onClick={() => onNavigateModule('render_studio')}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#2F7CF6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2567d4]"
            >
              <Camera className="h-3.5 w-3.5" />
              Render Cinematográfico
            </button>
          </div>
        </div>

        {syncNotice && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-4 py-2.5 text-xs font-medium text-emerald-200">
            {syncNotice}
          </div>
        )}

        {/* Active Spec Summary Strip */}
        <div className="grid gap-3 rounded-lg border border-slate-800 bg-[#1B1E24] p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="text-xs">
            <span className="text-[11px] uppercase tracking-wider text-slate-400">Fachada &amp; Paredes</span>
            <div className="mt-0.5 font-medium text-white truncate">
              {findLabel(WALL_EXTERIOR_OPTIONS, rs.wallExteriorFinish ?? 'textura_acrilica')}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              BWC: {findLabel(WET_WALL_BATHROOM_OPTIONS, rs.wetWallBathroom)}
            </div>
          </div>
          <div className="text-xs">
            <span className="text-[11px] uppercase tracking-wider text-slate-400">Pisos, Rodapé &amp; Forro</span>
            <div className="mt-0.5 font-medium text-white truncate">
              {findLabel(FLOOR_INTERNAL_OPTIONS, rs.floorMaterial)}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {findLabel(BASEBOARD_OPTIONS, rs.baseboardType)} · {findLabel(CEILING_OPTIONS, rs.ceilingType)}
            </div>
          </div>
          <div className="text-xs">
            <span className="text-[11px] uppercase tracking-wider text-slate-400">Cobertura &amp; Esquadrias</span>
            <div className="mt-0.5 font-medium text-white truncate">
              {findLabel(ROOF_SHAPE_OPTIONS, rs.roofShape ?? 'platibanda')}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {findLabel(ROOF_MATERIAL_OPTIONS, rs.roofMaterial)}
            </div>
          </div>
          <div className="text-xs">
            <span className="text-[11px] uppercase tracking-wider text-slate-400">Louças, Chuveiro &amp; Metais</span>
            <div className="mt-0.5 font-medium text-white truncate">
              {findLabel(TOILET_OPTIONS, fx.toiletType)}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {findLabel(SHOWER_OPTIONS, fx.showerType)} · {findLabel(DRAIN_OPTIONS, fx.drainType)}
            </div>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['paredes', '1. Paredes, Fachada & Áreas Molhadas', Paintbrush],
              ['pisos_forro', '2. Pisos Internos, Externos, Rodapés & Forros', Layers],
              ['cobertura_esquadrias', '3. Cobertura, Telhados, Portas & Vidros', Home],
              ['loucas_metais', '4. Louças, Chuveiros, Torneiras, Ralos & Metais', Bath],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold transition ${
                activeTab === id
                  ? 'border-[#2F7CF6] bg-[#2F7CF6] text-white'
                  : 'border-slate-800 bg-[#1B1E24] text-slate-300 hover:border-slate-600 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* TAB 1: PAREDES & FACHADA */}
        {activeTab === 'paredes' && (
          <div className="space-y-5">
            <div className="grid gap-4 rounded-lg border border-slate-800 bg-[#1B1E24] p-4 sm:grid-cols-3">
              <label className="flex items-center justify-between gap-3 rounded border border-slate-800 bg-[#14161A] p-3">
                <div>
                  <div className="text-xs font-semibold text-white">Cor Base da Fachada</div>
                  <div className="text-[11px] text-slate-400 font-mono">{rs.facadeColor}</div>
                </div>
                <input
                  type="color"
                  value={rs.facadeColor}
                  onChange={(e) => updateRS({ facadeColor: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded border border-slate-700 bg-transparent"
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded border border-slate-800 bg-[#14161A] p-3">
                <div>
                  <div className="text-xs font-semibold text-white">Cor Paredes Internas Secas</div>
                  <div className="text-[11px] text-slate-400 font-mono">{rs.interiorWallColor}</div>
                </div>
                <input
                  type="color"
                  value={rs.interiorWallColor}
                  onChange={(e) => updateRS({ interiorWallColor: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded border border-slate-700 bg-transparent"
                />
              </label>

              <div className="rounded border border-slate-800 bg-[#14161A] p-3">
                <div className="text-xs font-semibold text-white mb-1.5">Divisórias Internas</div>
                <div className="flex gap-2">
                  {(
                    [
                      ['alvenaria', 'Alvenaria (10cm)'],
                      ['drywall', 'Drywall Gesso (9,5cm)'],
                    ] as const
                  ).map(([val, lbl]) => {
                    const active = (project.constructionMethod.internalPartitionType ?? 'alvenaria') === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() =>
                          onUpdateProject(
                            (prev) => ({
                              ...prev,
                              constructionMethod: {
                                ...prev.constructionMethod,
                                internalPartitionType: val,
                                internalWallThickness: val === 'drywall' ? 0.095 : 0.1,
                              },
                              unitTypes: prev.unitTypes.map((ut) => ({
                                ...ut,
                                internalPartitionType: val,
                                walls: ut.walls.map((w) =>
                                  w.isExternal
                                    ? w
                                    : {
                                        ...w,
                                        thickness: val === 'drywall' ? 0.095 : 0.1,
                                        material:
                                          val === 'drywall'
                                            ? 'Drywall Gesso Acartonado ST/RU (9,5cm) + Lã Mineral'
                                            : prev.constructionMethod.name,
                                      },
                                ),
                              })),
                            }),
                            `Divisórias internas padronizadas em ${lbl}`,
                          )
                        }
                        className={`flex-1 rounded border px-2 py-1.5 text-[11px] font-medium ${
                          active
                            ? 'border-[#2F7CF6] bg-[#2F7CF6]/20 text-white'
                            : 'border-slate-700 bg-[#1B1E24] text-slate-300'
                        }`}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <OptionCardGrid
              title="Revestimento da Fachada Externa & Muros (PBR 3D)"
              subtitle="Aplicado às paredes externas das kitnets e aos muros do terreno no 3D e Render Cinematográfico."
              options={WALL_EXTERIOR_OPTIONS}
              value={rs.wallExteriorFinish ?? 'textura_acrilica'}
              onSelect={(val) =>
                updateRS({ wallExteriorFinish: val }, `Revestimento externo: ${val.replace(/_/g, ' ')}`)
              }
            />

            <OptionCardGrid
              title="Acabamento das Paredes Internas (Sala / Dormitório)"
              options={WALL_INTERIOR_OPTIONS}
              value={rs.wallInteriorFinish ?? 'pintura_fosca'}
              onSelect={(val) =>
                updateRS({ wallInteriorFinish: val }, `Parede interna: ${val.replace(/_/g, ' ')}`)
              }
              cols={2}
            />

            <OptionCardGrid
              title="Revestimento das Paredes do Banheiro / Box (Áreas Molhadas)"
              options={WET_WALL_BATHROOM_OPTIONS}
              value={rs.wetWallBathroom ?? 'porcelanato_marmorizado'}
              onSelect={(val) =>
                updateRS({ wetWallBathroom: val }, `Revestimento BWC: ${val.replace(/_/g, ' ')}`)
              }
            />

            <OptionCardGrid
              title="Revestimento das Paredes da Cozinha & Lavanderia (Frontão)"
              options={WET_WALL_KITCHEN_OPTIONS}
              value={rs.wetWallKitchen ?? 'azulejo_metro'}
              onSelect={(val) =>
                updateRS({ wetWallKitchen: val }, `Revestimento cozinha: ${val.replace(/_/g, ' ')}`)
              }
              cols={2}
            />
          </div>
        )}

        {/* TAB 2: PISOS, RODAPÉS, FORROS & PISO EXTERNO */}
        {activeTab === 'pisos_forro' && (
          <div className="space-y-5">
            <OptionCardGrid
              title="Piso Principal das Áreas Secas (Sala, Dormitório & Mezanino)"
              subtitle="Renderizado com textura procedural PBR realista em alta resolução."
              options={FLOOR_INTERNAL_OPTIONS}
              value={rs.floorMaterial}
              onSelect={(val) => updateRS({ floorMaterial: val }, `Piso interno: ${val.replace(/_/g, ' ')}`)}
            />

            <OptionCardGrid
              title="Piso Antiderrapante de Áreas Molhadas (Banheiro, Cozinha & A.S.)"
              options={WET_FLOOR_OPTIONS}
              value={rs.wetFloorMaterial ?? 'porcelanato_antiderrapante'}
              onSelect={(val) =>
                updateRS({ wetFloorMaterial: val }, `Piso molhado: ${val.replace(/_/g, ' ')}`)
              }
            />

            <div className="grid gap-5 lg:grid-cols-2">
              <OptionCardGrid
                title="Rodapés Internos"
                options={BASEBOARD_OPTIONS}
                value={rs.baseboardType ?? 'porcelanato_10cm'}
                onSelect={(val) => updateRS({ baseboardType: val }, `Rodapé: ${val.replace(/_/g, ' ')}`)}
                cols={2}
              />

              <OptionCardGrid
                title="Forro & Acabamento de Teto"
                options={CEILING_OPTIONS}
                value={rs.ceilingType ?? 'gesso_drywall_tabica'}
                onSelect={(val) => updateRS({ ceilingType: val }, `Forro: ${val.replace(/_/g, ' ')}`)}
                cols={2}
              />
            </div>

            <div className="rounded-lg border border-emerald-500/30 bg-[#1B1E24] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Superfície Padrão das Áreas Externas &amp; Quintal do Terreno
                  </h3>
                  <p className="text-xs text-slate-400">
                    Escolha o piso base de todo o terreno (gramas, antiderrapante, cimento queimado, areia, brita, deck ou paver). Para desenhar zonas parciais, piscina e jardim, abra a aba Paisagismo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateModule('paisagismo')}
                  className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                >
                  <Trees className="h-3.5 w-3.5" />
                  Desenhar Zonas, Piscina &amp; Plantas
                </button>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                {EXTERIOR_SURFACE_CATALOG.map((surf) => {
                  const active = landscaping.defaultGroundSurface === surf.id;
                  return (
                    <button
                      key={surf.id}
                      type="button"
                      onClick={() => updateDefaultGroundSurface(surf.id)}
                      className={`flex items-start gap-2 rounded-lg border p-2.5 text-left transition ${
                        active
                          ? 'border-emerald-400 bg-emerald-500/15'
                          : 'border-slate-800 bg-[#14161A] hover:border-slate-600'
                      }`}
                    >
                      <span
                        className="mt-0.5 h-5 w-5 shrink-0 rounded border border-white/20"
                        style={{ backgroundColor: surf.colorHex }}
                      />
                      <div className="min-w-0">
                        <div className="text-[11.5px] font-semibold text-white leading-tight">
                          {surf.label}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {surf.permeable ? 'Piso Permeável' : 'Piso Impermeável'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: COBERTURA, TELHADO & ESQUADRIAS */}
        {activeTab === 'cobertura_esquadrias' && (
          <div className="space-y-5">
            <OptionCardGrid
              title="Formato Arquitetônico da Cobertura (Modelado em 3D e Cortes CAD)"
              subtitle="Define a geometria real do telhado nos cortes A08/A09, no BIM 3D e no Render Cinematográfico."
              options={ROOF_SHAPE_OPTIONS}
              value={rs.roofShape ?? 'platibanda'}
              onSelect={(val) => updateRS({ roofShape: val }, `Formato cobertura: ${val.replace(/_/g, ' ')}`)}
              cols={2}
            />

            <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Tipo de Telha / Material da Cobertura &amp; Inclinação
                  </h3>
                  <p className="text-xs text-slate-400">
                    Sincronizado automaticamente com o orçamento SINAPI-RJ (COB-01) e memória descritiva.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <span>Inclinação do Telhado (%):</span>
                  <input
                    type="number"
                    min={1}
                    max={55}
                    step={1}
                    value={project.constructionMethod.roofSlopePercent}
                    onChange={(e) =>
                      onUpdateProject((prev) => ({
                        ...prev,
                        constructionMethod: {
                          ...prev.constructionMethod,
                          roofSlopePercent: Math.max(1, Math.min(55, Number(e.target.value) || 8)),
                        },
                      }))
                    }
                    className="w-20 rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 font-mono text-xs text-white"
                  />
                </label>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {ROOF_MATERIAL_OPTIONS.map((opt) => {
                  const active = rs.roofMaterial === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateRoofMaterial(opt.id)}
                      className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition ${
                        active
                          ? 'border-[#2F7CF6] bg-[#2F7CF6]/15'
                          : 'border-slate-800 bg-[#14161A] hover:border-slate-600'
                      }`}
                    >
                      <span
                        className="mt-0.5 h-6 w-6 shrink-0 rounded border border-white/20"
                        style={{ backgroundColor: opt.swatchHex }}
                      />
                      <div>
                        <div className="text-xs font-semibold text-white">{opt.label}</div>
                        <p className="mt-1 text-[11px] text-slate-400">{opt.spec}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <OptionCardGrid
              title="Perfil das Esquadrias de Janelas, Vitrôs & Portas Externas"
              options={WINDOW_FRAME_OPTIONS}
              value={rs.windowFrameColor}
              onSelect={(val) =>
                updateRS({ windowFrameColor: val }, `Esquadrias alteradas para ${val.replace(/_/g, ' ')}`)
              }
            />

            <div className="grid gap-5 lg:grid-cols-2">
              <OptionCardGrid
                title="Folhas de Portas Internas (80cm Entrada / 70cm Quarto / 60cm BWC)"
                options={INTERIOR_DOOR_OPTIONS}
                value={rs.interiorDoorMaterial ?? 'madeira_verniz_natural'}
                onSelect={(val) =>
                  updateRS({ interiorDoorMaterial: val }, `Portas: ${val.replace(/_/g, ' ')}`)
                }
                cols={2}
              />

              <OptionCardGrid
                title="Especificação dos Vidros das Janelas & Box"
                options={GLASS_TYPE_OPTIONS}
                value={rs.glassType ?? 'temperado_incolor'}
                onSelect={(val) => updateRS({ glassType: val }, `Vidros: ${val.replace(/_/g, ' ')}`)}
                cols={2}
              />
            </div>
          </div>
        )}

        {/* TAB 4: LOUÇAS, CHUVEIROS, TORNEIRAS, RALOS & METAIS */}
        {activeTab === 'loucas_metais' && (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <OptionCardGrid
                title="Acabamento Geral dos Metais (Torneiras, Registros, Chuveiros & Ralos)"
                subtitle="Aplicado em tempo real nas peças 3D do banheiro e cozinha."
                options={METALS_FINISH_OPTIONS}
                value={fx.metalsFinish}
                onSelect={(val) =>
                  updateSanitary({ metalsFinish: val }, `Acabamento de metais: ${val.replace(/_/g, ' ')}`)
                }
                cols={2}
              />

              <OptionCardGrid
                title="Cor das Louças Sanitárias (Bacia, Cuba & Tanque)"
                options={SANITARY_COLOR_OPTIONS}
                value={fx.sanitaryWareColor}
                onSelect={(val) =>
                  updateSanitary({ sanitaryWareColor: val }, `Cor das louças: ${val.replace(/_/g, ' ')}`)
                }
                cols={2}
              />
            </div>

            <OptionCardGrid
              title="Tipo de Bacia Sanitária (Com Caixa Acoplada, Válvula ou Suspensa)"
              subtitle="Refletido diretamente na geometria 3D do vaso sanitário, dimensionamento hidráulico e memorial descritivo."
              options={TOILET_OPTIONS}
              value={fx.toiletType}
              onSelect={(val) =>
                updateSanitary({ toiletType: val }, `Bacia sanitária: ${val.replace(/_/g, ' ')}`)
              }
              cols={2}
            />

            <OptionCardGrid
              title="Chuveiro / Ducha & Sistema de Aquecimento"
              subtitle="Selecionar ducha a gás/solar habilita automaticamente rede de Água Quente no módulo hidráulico."
              options={SHOWER_OPTIONS}
              value={fx.showerType}
              onSelect={(val) =>
                updateSanitary({ showerType: val }, `Chuveiro especificado: ${val.replace(/_/g, ' ')}`)
              }
              cols={2}
            />

            <OptionCardGrid
              title="Ralos & Drenagem do Banheiro e Box (SAN-01)"
              subtitle="Define o ralo no piso 3D do box, especificação sanitária NBR 8160 e orçamento SINAPI-RJ."
              options={DRAIN_OPTIONS}
              value={fx.drainType}
              onSelect={(val) =>
                updateSanitary({ drainType: val }, `Ralos especificados: ${val.replace(/_/g, ' ')}`)
              }
            />

            <div className="grid gap-5 lg:grid-cols-2">
              <OptionCardGrid
                title="Lavatório / Cuba do Banheiro"
                options={WASHBASIN_OPTIONS}
                value={fx.washbasinType}
                onSelect={(val) =>
                  updateSanitary({ washbasinType: val }, `Lavatório BWC: ${val.replace(/_/g, ' ')}`)
                }
                cols={2}
              />

              <OptionCardGrid
                title="Torneira / Misturador do Lavatório"
                options={WASHBASIN_FAUCET_OPTIONS}
                value={fx.washbasinFaucet}
                onSelect={(val) =>
                  updateSanitary({ washbasinFaucet: val }, `Torneira lavatório: ${val.replace(/_/g, ' ')}`)
                }
                cols={2}
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <OptionCardGrid
                title="Pia & Bancada da Cozinha"
                options={KITCHEN_SINK_OPTIONS}
                value={fx.kitchenSinkType}
                onSelect={(val) =>
                  updateSanitary({ kitchenSinkType: val }, `Pia cozinha: ${val.replace(/_/g, ' ')}`)
                }
                cols={2}
              />

              <OptionCardGrid
                title="Torneira da Cozinha / Espaço Gourmet"
                options={KITCHEN_FAUCET_OPTIONS}
                value={fx.kitchenFaucet}
                onSelect={(val) =>
                  updateSanitary({ kitchenFaucet: val }, `Torneira cozinha: ${val.replace(/_/g, ' ')}`)
                }
                cols={2}
              />
            </div>

            <OptionCardGrid
              title="Tanque da Área de Serviço / Lavanderia"
              options={LAUNDRY_TUB_OPTIONS}
              value={fx.laundryTubType}
              onSelect={(val) =>
                updateSanitary({ laundryTubType: val }, `Tanque lavanderia: ${val.replace(/_/g, ' ')}`)
              }
            />

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-500/30 bg-sky-950/20 px-4 py-3 text-xs text-sky-100">
              <span className="inline-flex items-center gap-2">
                <Droplets className="h-4 w-4 text-sky-400" />
                Deseja editar pontos individuais de água fria/quente, diâmetros e prumadas de esgoto?
              </span>
              <button
                type="button"
                onClick={() => onNavigateModule('hidraulica')}
                className="inline-flex items-center gap-1 rounded border border-sky-400/50 bg-sky-500/20 px-3 py-1 font-medium text-white hover:bg-sky-500/35"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Ir para Hidráulica &amp; Sanitária
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
