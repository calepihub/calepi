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
    <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-3 space-y-2">
      <div>
        <h3 className="text-xs font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
      </div>
      <div className={gridCls}>
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect(opt.id)}
              className={`flex items-start gap-2 rounded-lg border p-2 text-left transition ${
                active
                  ? 'border-[#2F7CF6] bg-[#2F7CF6]/15'
                  : 'border-slate-800 bg-[#14161A] hover:border-slate-600'
              }`}
            >
              <span
                className="mt-0.5 h-6 w-6 shrink-0 rounded border border-white/20"
                style={{
                  background: opt.accentHex
                    ? `linear-gradient(135deg, ${opt.swatchHex} 60%, ${opt.accentHex} 100%)`
                    : opt.swatchHex,
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-xs font-semibold text-white">{opt.label}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-[#60A5FA]" />}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{opt.spec}</p>
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
  const [paredesSub, setParedesSub] = useState<'fachada' | 'secas' | 'bwc' | 'cozinha'>('fachada');
  const [pisosSub, setPisosSub] = useState<'seco' | 'molhado' | 'rodape_forro' | 'externo'>('seco');
  const [cobSub, setCobSub] = useState<'formato' | 'telha' | 'janelas' | 'portas_vidros'>('formato');
  const [loucasSub, setLoucasSub] = useState<
    'metais_cor' | 'bacia_chuveiro' | 'ralos' | 'lavatorio' | 'cozinha_pia'
  >('metais_cor');
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
    <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col gap-2.5 overflow-hidden bg-[#14161A] p-3 text-slate-100">
      {/* Compact Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-white">
            Caderno de Acabamentos, Revestimentos, Cobertura, Louças &amp; Metais
          </h1>
          <p className="truncate text-[11px] text-slate-400">
            Sincronizado automaticamente com BIM 3D, Render Cinematográfico, Orçamento SINAPI-RJ e Memorial.
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {syncNotice && (
            <span className="rounded border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1 text-[11px] text-emerald-200">
              {syncNotice}
            </span>
          )}
          <button
            type="button"
            onClick={handleForceSyncRooms}
            className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-600/15 px-2.5 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-600/30 whitespace-nowrap"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Sincronizar Ambientes
          </button>
          <button
            type="button"
            onClick={() => onNavigateModule('paisagismo')}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#1B1E24] px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-emerald-500 whitespace-nowrap"
          >
            <Trees className="h-3.5 w-3.5 text-emerald-400" />
            Paisagismo
          </button>
          <button
            type="button"
            onClick={() => onNavigateModule('bim3d')}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#1B1E24] px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-[#2F7CF6] whitespace-nowrap"
          >
            <Box className="h-3.5 w-3.5 text-[#60A5FA]" />
            BIM 3D
          </button>
          <button
            type="button"
            onClick={() => onNavigateModule('render_studio')}
            className="inline-flex items-center gap-1 rounded bg-[#2F7CF6] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#2567d4] whitespace-nowrap"
          >
            <Camera className="h-3.5 w-3.5" />
            Render
          </button>
        </div>
      </div>

      {/* Compact Spec Summary Strip */}
      <div className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded border border-slate-800 bg-[#1B1E24] px-3 py-2 text-xs">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">Fachada &amp; Paredes</span>
          <div className="truncate font-medium text-white">
            {findLabel(WALL_EXTERIOR_OPTIONS, rs.wallExteriorFinish ?? 'textura_acrilica')}
          </div>
          <div className="truncate text-[10px] text-slate-400">
            BWC: {findLabel(WET_WALL_BATHROOM_OPTIONS, rs.wetWallBathroom)}
          </div>
        </div>
        <div className="rounded border border-slate-800 bg-[#1B1E24] px-3 py-2 text-xs">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">Pisos, Rodapé &amp; Forro</span>
          <div className="truncate font-medium text-white">
            {findLabel(FLOOR_INTERNAL_OPTIONS, rs.floorMaterial)}
          </div>
          <div className="truncate text-[10px] text-slate-400">
            {findLabel(BASEBOARD_OPTIONS, rs.baseboardType)} · {findLabel(CEILING_OPTIONS, rs.ceilingType)}
          </div>
        </div>
        <div className="rounded border border-slate-800 bg-[#1B1E24] px-3 py-2 text-xs">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">Cobertura &amp; Esquadrias</span>
          <div className="truncate font-medium text-white">
            {findLabel(ROOF_SHAPE_OPTIONS, rs.roofShape ?? 'platibanda')}
          </div>
          <div className="truncate text-[10px] text-slate-400">
            {findLabel(ROOF_MATERIAL_OPTIONS, rs.roofMaterial)}
          </div>
        </div>
        <div className="rounded border border-slate-800 bg-[#1B1E24] px-3 py-2 text-xs">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">Louças, Chuveiro &amp; Metais</span>
          <div className="truncate font-medium text-white">
            {findLabel(TOILET_OPTIONS, fx.toiletType)}
          </div>
          <div className="truncate text-[10px] text-slate-400">
            {findLabel(SHOWER_OPTIONS, fx.showerType)} · {findLabel(DRAIN_OPTIONS, fx.drainType)}
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['paredes', '1. Paredes & Áreas Molhadas', Paintbrush],
              ['pisos_forro', '2. Pisos, Rodapés & Forros', Layers],
              ['cobertura_esquadrias', '3. Cobertura & Esquadrias', Home],
              ['loucas_metais', '4. Louças, Chuveiros & Metais', Bath],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
                activeTab === id
                  ? 'border-[#2F7CF6] bg-[#2F7CF6] text-white'
                  : 'border-slate-800 bg-[#1B1E24] text-slate-300 hover:border-slate-600 hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Sub-group selector inside active category so zero scrolling is required */}
        <div className="flex items-center gap-1 rounded border border-slate-800 bg-[#1B1E24] p-0.5">
          {activeTab === 'paredes' &&
            (
              [
                ['fachada', 'Fachada & Cores'],
                ['secas', 'Paredes Secas'],
                ['bwc', 'Banheiro / Box'],
                ['cozinha', 'Cozinha & A.S.'],
              ] as const
            ).map(([id, lbl]) => (
              <button
                key={id}
                type="button"
                onClick={() => setParedesSub(id)}
                className={`rounded px-2.5 py-1 text-[11px] font-medium whitespace-nowrap ${
                  paredesSub === id ? 'bg-[#222730] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {lbl}
              </button>
            ))}
          {activeTab === 'pisos_forro' &&
            (
              [
                ['seco', 'Piso Áreas Secas'],
                ['molhado', 'Piso Áreas Molhadas'],
                ['rodape_forro', 'Rodapé & Forro'],
                ['externo', 'Piso Externo / Quintal'],
              ] as const
            ).map(([id, lbl]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPisosSub(id)}
                className={`rounded px-2.5 py-1 text-[11px] font-medium whitespace-nowrap ${
                  pisosSub === id ? 'bg-[#222730] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {lbl}
              </button>
            ))}
          {activeTab === 'cobertura_esquadrias' &&
            (
              [
                ['formato', 'Formato Telhado'],
                ['telha', 'Telhas & Inclinação'],
                ['janelas', 'Perfis Esquadrias'],
                ['portas_vidros', 'Portas & Vidros'],
              ] as const
            ).map(([id, lbl]) => (
              <button
                key={id}
                type="button"
                onClick={() => setCobSub(id)}
                className={`rounded px-2.5 py-1 text-[11px] font-medium whitespace-nowrap ${
                  cobSub === id ? 'bg-[#222730] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {lbl}
              </button>
            ))}
          {activeTab === 'loucas_metais' &&
            (
              [
                ['metais_cor', 'Metais & Cor Louças'],
                ['bacia_chuveiro', 'Bacia & Chuveiro'],
                ['ralos', 'Ralos & A.S.'],
                ['lavatorio', 'Lavatório BWC'],
                ['cozinha_pia', 'Pia & Torneira Coz.'],
              ] as const
            ).map(([id, lbl]) => (
              <button
                key={id}
                type="button"
                onClick={() => setLoucasSub(id)}
                className={`rounded px-2.5 py-1 text-[11px] font-medium whitespace-nowrap ${
                  loucasSub === id ? 'bg-[#222730] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {lbl}
              </button>
            ))}
        </div>
      </div>

      {/* Zero-scroll Tab Workspace */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {/* TAB 1: PAREDES */}
        {activeTab === 'paredes' && (
          <div className="flex h-full flex-col gap-3 overflow-hidden">
            {paredesSub === 'fachada' && (
              <>
                <div className="grid shrink-0 gap-3 rounded-lg border border-slate-800 bg-[#1B1E24] p-3 sm:grid-cols-3">
                  <label className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-[#14161A] px-3 py-2">
                    <div>
                      <div className="text-xs font-semibold text-white">Cor Base Fachada</div>
                      <div className="font-mono text-[11px] text-slate-400">{rs.facadeColor}</div>
                    </div>
                    <input
                      type="color"
                      value={rs.facadeColor}
                      onChange={(e) => updateRS({ facadeColor: e.target.value })}
                      className="h-8 w-10 cursor-pointer rounded border border-slate-700 bg-transparent"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-[#14161A] px-3 py-2">
                    <div>
                      <div className="text-xs font-semibold text-white">Cor Paredes Internas</div>
                      <div className="font-mono text-[11px] text-slate-400">{rs.interiorWallColor}</div>
                    </div>
                    <input
                      type="color"
                      value={rs.interiorWallColor}
                      onChange={(e) => updateRS({ interiorWallColor: e.target.value })}
                      className="h-8 w-10 cursor-pointer rounded border border-slate-700 bg-transparent"
                    />
                  </label>

                  <div className="rounded border border-slate-800 bg-[#14161A] px-3 py-2">
                    <div className="mb-1 text-xs font-semibold text-white">Divisórias Internas</div>
                    <div className="flex gap-1.5">
                      {(
                        [
                          ['alvenaria', 'Alvenaria (10cm)'],
                          ['drywall', 'Drywall (9,5cm)'],
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
                            className={`flex-1 rounded border px-2 py-1 text-[11px] font-medium ${
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
                  subtitle="Aplicado às paredes externas das unidades e aos muros do terreno."
                  options={WALL_EXTERIOR_OPTIONS}
                  value={rs.wallExteriorFinish ?? 'textura_acrilica'}
                  onSelect={(val) =>
                    updateRS({ wallExteriorFinish: val }, `Revestimento externo: ${val.replace(/_/g, ' ')}`)
                  }
                />
              </>
            )}

            {paredesSub === 'secas' && (
              <OptionCardGrid
                title="Acabamento das Paredes Internas (Sala / Dormitório)"
                options={WALL_INTERIOR_OPTIONS}
                value={rs.wallInteriorFinish ?? 'pintura_fosca'}
                onSelect={(val) =>
                  updateRS({ wallInteriorFinish: val }, `Parede interna: ${val.replace(/_/g, ' ')}`)
                }
                cols={2}
              />
            )}

            {paredesSub === 'bwc' && (
              <OptionCardGrid
                title="Revestimento das Paredes do Banheiro / Box (Áreas Molhadas)"
                options={WET_WALL_BATHROOM_OPTIONS}
                value={rs.wetWallBathroom ?? 'porcelanato_marmorizado'}
                onSelect={(val) =>
                  updateRS({ wetWallBathroom: val }, `Revestimento BWC: ${val.replace(/_/g, ' ')}`)
                }
              />
            )}

            {paredesSub === 'cozinha' && (
              <OptionCardGrid
                title="Revestimento das Paredes da Cozinha & Lavanderia (Frontão)"
                options={WET_WALL_KITCHEN_OPTIONS}
                value={rs.wetWallKitchen ?? 'azulejo_metro'}
                onSelect={(val) =>
                  updateRS({ wetWallKitchen: val }, `Revestimento cozinha: ${val.replace(/_/g, ' ')}`)
                }
                cols={2}
              />
            )}
          </div>
        )}

        {/* TAB 2: PISOS & FORROS */}
        {activeTab === 'pisos_forro' && (
          <div className="h-full overflow-hidden">
            {pisosSub === 'seco' && (
              <OptionCardGrid
                title="Piso Principal das Áreas Secas (Sala, Dormitório & Mezanino)"
                subtitle="Renderizado com textura procedural PBR realista em alta resolução."
                options={FLOOR_INTERNAL_OPTIONS}
                value={rs.floorMaterial}
                onSelect={(val) => updateRS({ floorMaterial: val }, `Piso interno: ${val.replace(/_/g, ' ')}`)}
              />
            )}

            {pisosSub === 'molhado' && (
              <OptionCardGrid
                title="Piso Antiderrapante de Áreas Molhadas (Banheiro, Cozinha & A.S.)"
                options={WET_FLOOR_OPTIONS}
                value={rs.wetFloorMaterial ?? 'porcelanato_antiderrapante'}
                onSelect={(val) =>
                  updateRS({ wetFloorMaterial: val }, `Piso molhado: ${val.replace(/_/g, ' ')}`)
                }
              />
            )}

            {pisosSub === 'rodape_forro' && (
              <div className="grid gap-3 lg:grid-cols-2">
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
            )}

            {pisosSub === 'externo' && (
              <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-[#1B1E24] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Superfície Padrão das Áreas Externas &amp; Quintal do Terreno
                    </h3>
                    <p className="text-xs text-slate-400">
                      Piso base de todo o terreno; para zonas parciais e piscina, abra o módulo Paisagismo.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateModule('paisagismo')}
                    className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                  >
                    <Trees className="h-3.5 w-3.5" />
                    Abrir Paisagismo &amp; Zonas
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
                          <div className="truncate text-[11.5px] font-semibold text-white">
                            {surf.label}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {surf.permeable ? 'Piso Permeável' : 'Piso Impermeável'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: COBERTURA & ESQUADRIAS */}
        {activeTab === 'cobertura_esquadrias' && (
          <div className="h-full overflow-hidden">
            {cobSub === 'formato' && (
              <OptionCardGrid
                title="Formato Arquitetônico da Cobertura (Modelado em 3D e Cortes CAD)"
                subtitle="Define a geometria real do telhado nos cortes A08/A09, no BIM 3D e no Render."
                options={ROOF_SHAPE_OPTIONS}
                value={rs.roofShape ?? 'platibanda'}
                onSelect={(val) => updateRS({ roofShape: val }, `Formato cobertura: ${val.replace(/_/g, ' ')}`)}
                cols={2}
              />
            )}

            {cobSub === 'telha' && (
              <div className="space-y-3 rounded-lg border border-slate-800 bg-[#1B1E24] p-4">
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
                    <span>Inclinação (%):</span>
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
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white">{opt.label}</div>
                          <p className="mt-1 text-[11px] text-slate-400">{opt.spec}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {cobSub === 'janelas' && (
              <OptionCardGrid
                title="Perfil das Esquadrias de Janelas, Vitrôs & Portas Externas"
                options={WINDOW_FRAME_OPTIONS}
                value={rs.windowFrameColor}
                onSelect={(val) =>
                  updateRS({ windowFrameColor: val }, `Esquadrias alteradas para ${val.replace(/_/g, ' ')}`)
                }
              />
            )}

            {cobSub === 'portas_vidros' && (
              <div className="grid gap-3 lg:grid-cols-2">
                <OptionCardGrid
                  title="Folhas de Portas Internas (80 / 70 / 60 cm)"
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
            )}
          </div>
        )}

        {/* TAB 4: LOUÇAS, CHUVEIROS, TORNEIRAS, RALOS & METAIS */}
        {activeTab === 'loucas_metais' && (
          <div className="h-full overflow-hidden">
            {loucasSub === 'metais_cor' && (
              <div className="grid gap-3 lg:grid-cols-2">
                <OptionCardGrid
                  title="Acabamento Geral dos Metais (Torneiras, Registros, Chuveiros & Ralos)"
                  options={METALS_FINISH_OPTIONS}
                  value={fx.metalsFinish}
                  onSelect={(val) =>
                    updateSanitary({ metalsFinish: val }, `Acabamento de metais: ${val.replace(/_/g, ' ')}`)
                  }
                  cols={2}
                />

                <OptionCardGrid
                  title="Cor das Louças Sanitárias (Bacia & Cuba)"
                  options={SANITARY_COLOR_OPTIONS}
                  value={fx.sanitaryWareColor}
                  onSelect={(val) =>
                    updateSanitary({ sanitaryWareColor: val }, `Cor das louças: ${val.replace(/_/g, ' ')}`)
                  }
                  cols={2}
                />
              </div>
            )}

            {loucasSub === 'bacia_chuveiro' && (
              <div className="grid gap-3 lg:grid-cols-2">
                <OptionCardGrid
                  title="Tipo de Bacia Sanitária"
                  options={TOILET_OPTIONS}
                  value={fx.toiletType}
                  onSelect={(val) =>
                    updateSanitary({ toiletType: val }, `Bacia sanitária: ${val.replace(/_/g, ' ')}`)
                  }
                  cols={2}
                />

                <OptionCardGrid
                  title="Chuveiro / Ducha & Aquecimento"
                  options={SHOWER_OPTIONS}
                  value={fx.showerType}
                  onSelect={(val) =>
                    updateSanitary({ showerType: val }, `Chuveiro especificado: ${val.replace(/_/g, ' ')}`)
                  }
                  cols={2}
                />
              </div>
            )}

            {loucasSub === 'ralos' && (
              <div className="space-y-3">
                <OptionCardGrid
                  title="Ralos & Drenagem do Banheiro e Box (SAN-01)"
                  subtitle="Define o ralo no piso 3D do box, especificação sanitária NBR 8160 e orçamento SINAPI-RJ."
                  options={DRAIN_OPTIONS}
                  value={fx.drainType}
                  onSelect={(val) =>
                    updateSanitary({ drainType: val }, `Ralos especificados: ${val.replace(/_/g, ' ')}`)
                  }
                />
                <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] px-4 py-3 text-xs text-[#C4C9D4]">
                  <strong className="text-white">Área de Serviço (A.S.):</strong> Configurada exclusivamente com ponto hidráulico (AF Ø20mm), esgoto (ES Ø50mm) e elétrica (TUE 20A) para{' '}
                  <strong className="text-sky-300">Máquina de Lavar</strong>.
                </div>
                <div className="flex items-center justify-between rounded-lg border border-sky-500/30 bg-sky-950/20 px-4 py-2.5 text-xs text-sky-100">
                  <span className="inline-flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-sky-400" />
                    Editar pontos individuais de água fria/quente, diâmetros e prumadas de esgoto:
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigateModule('hidraulica')}
                    className="rounded border border-sky-400/50 bg-sky-500/20 px-3 py-1 font-medium text-white hover:bg-sky-500/35"
                  >
                    Abrir Hidráulica &amp; Sanitária
                  </button>
                </div>
              </div>
            )}

            {loucasSub === 'lavatorio' && (
              <div className="grid gap-3 lg:grid-cols-2">
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
            )}

            {loucasSub === 'cozinha_pia' && (
              <div className="grid gap-3 lg:grid-cols-2">
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
            )}
          </div>
        )}
      </div>
    </div>
  );
};
