import React, { useState } from 'react';
import { AlertTriangle, CloudRain, Droplets, Plus, Trash2 } from 'lucide-react';
import {
  calculateDrainageSizing,
  calculateHydraulicSizing,
  calculateRainwaterSizing,
} from '../engine/engineering';
import { nextId } from '../engine/parametricGenerator';
import type { DrainageCategory, Project, WaterCategory } from '../types/project';

interface MepHydraulicSanitaryModuleProps {
  project: Project;
  selectedUnitTypeId: string;
  onSelectUnitType: (id: string) => void;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
}

export const MepHydraulicSanitaryModule: React.FC<MepHydraulicSanitaryModuleProps> = ({
  project,
  selectedUnitTypeId,
  onSelectUnitType,
  onUpdateProject,
}) => {
  const [subTab, setSubTab] = useState<'hidraulica' | 'sanitaria' | 'pluviais'>('hidraulica');
  const activeUt =
    project.unitTypes.find((u) => u.id === selectedUnitTypeId) ?? project.unitTypes[0];

  const hydReport = calculateHydraulicSizing(project);
  const drainReports = calculateDrainageSizing(project);
  const rainReport = calculateRainwaterSizing(project);

  const unitHyd = hydReport.byUnitType.find((u) => u.unitTypeId === activeUt?.id);
  const unitDrain = drainReports.find((u) => u.unitTypeId === activeUt?.id);

  // Add Water Point State
  const [wCat, setWCat] = useState<WaterCategory>('pia');
  const [wType, setWType] = useState<'fria' | 'quente'>('fria');
  const [wDiam, setWDiam] = useState(25);
  const [wZ, setWZ] = useState(0.6);

  // Add Drainage Point State
  const [dCat, setDCat] = useState<DrainageCategory>('pia');
  const [dDiam, setDDiam] = useState(50);
  const [dSlope, setDSlope] = useState(2.0);
  const [dUhc, setDUhc] = useState(3);

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2A2F38] pb-4">
        <div>
          <h1 className="text-xl font-semibold text-white">
            Instalações Hidráulicas, Sanitárias & Águas Pluviais
          </h1>
          <p className="text-xs text-[#949BA8] mt-1">
            Água fria, água quente, reservação, rede conectada de esgoto (UHC e declividades) e drenagem pluvial rastreável.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex p-1 rounded bg-[#1B1E24] border border-[#2A2F38]">
            {(
              [
                ['hidraulica', 'Hidráulica (AF/AQ)'],
                ['sanitaria', 'Sanitária & Esgoto'],
                ['pluviais', 'Águas Pluviais'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSubTab(k)}
                className={`px-3 py-1 text-xs font-medium rounded whitespace-nowrap ${
                  subTab === k ? 'bg-[#2F7CF6] text-white' : 'text-[#949BA8] hover:text-white'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <select
            value={activeUt?.id ?? ''}
            onChange={(e) => onSelectUnitType(e.target.value)}
            aria-label="Selecionar tipologia hidráulica"
            className="px-3 py-1.5 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
          >
            {project.unitTypes.map((ut) => (
              <option key={ut.id} value={ut.id}>
                {ut.code} — {ut.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* HIDRÁULICA TAB */}
      {subTab === 'hidraulica' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4">
              <div className="text-[11px] text-[#949BA8]">População Estimada</div>
              <div className="text-xl font-mono font-semibold text-white mt-1 tabular-nums">
                {hydReport.estimatedPopulation} hab.
              </div>
            </div>
            <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4">
              <div className="text-[11px] text-[#949BA8]">Consumo Diário Previsto</div>
              <div className="text-xl font-mono font-semibold text-[#60A5FA] mt-1 tabular-nums">
                {hydReport.dailyConsumptionLiters} L/dia
              </div>
            </div>
            <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4">
              <div className="text-[11px] text-[#949BA8]">Reserva Total ({project.hydraulicConfig.reserveDays} dias)</div>
              <div className="text-xl font-mono font-semibold text-emerald-400 mt-1 tabular-nums">
                {hydReport.recommendedTotalReservoirLiters} L
              </div>
            </div>
            <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4">
              <div className="text-[11px] text-[#949BA8]">Vazão Provável ({activeUt?.code})</div>
              <div className="text-xl font-mono font-semibold text-white mt-1 tabular-nums">
                {unitHyd?.probableFlowColdLs ?? 0} L/s
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 space-y-3">
            <h2 className="text-sm font-semibold text-white">Parâmetros de Reservação & Materiais</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Ocupantes / Unidade</label>
                <input
                  type="number"
                  min={1}
                  value={project.hydraulicConfig.occupantsPerUnit}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      hydraulicConfig: { ...prev.hydraulicConfig, occupantsPerUnit: Number(e.target.value) },
                    }))
                  }
                  className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Consumo (L/hab·dia)</label>
                <input
                  type="number"
                  step="10"
                  min={80}
                  value={project.hydraulicConfig.litersPerPersonDay}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      hydraulicConfig: { ...prev.hydraulicConfig, litersPerPersonDay: Number(e.target.value) },
                    }))
                  }
                  className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Dias de Reserva</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={project.hydraulicConfig.reserveDays}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      hydraulicConfig: { ...prev.hydraulicConfig, reserveDays: Number(e.target.value) },
                    }))
                  }
                  className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Tubulação Água Fria</label>
                <input
                  type="text"
                  value={project.hydraulicConfig.coldWaterMaterial}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      hydraulicConfig: { ...prev.hydraulicConfig, coldWaterMaterial: e.target.value },
                    }))
                  }
                  className="w-full px-2 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Tubulação Água Quente</label>
                <input
                  type="text"
                  value={project.hydraulicConfig.hotWaterMaterial}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      hydraulicConfig: { ...prev.hydraulicConfig, hotWaterMaterial: e.target.value },
                    }))
                  }
                  className="w-full px-2 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
            </div>
            <div className="text-xs text-[#949BA8] pt-1 font-mono">
              Memória: {hydReport.reservoirMethodology}
            </div>
          </div>

          {!activeUt && (
            <div className="rounded-lg border border-dashed border-[#323844] bg-[#1B1E24] p-6 text-center text-xs text-[#949BA8]">
              Nenhuma tipologia criada ainda. Cadastre uma tipologia na etapa &quot;Planta 2D & Tipologias&quot; para lançar pontos hidráulicos e sanitários.
            </div>
          )}

          {activeUt && (
            <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-[#60A5FA]" />
                  Pontos Hidráulicos de {activeUt.code} ({activeUt.waterPoints.length})
                </h2>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={wCat}
                    onChange={(e) => setWCat(e.target.value as WaterCategory)}
                    className="px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                  >
                    <option value="pia">Pia</option>
                    <option value="lavatorio">Lavatório</option>
                    <option value="chuveiro">Chuveiro</option>
                    <option value="vaso_sanitario">Vaso Sanitário</option>
                    <option value="tanque">Tanque</option>
                    <option value="maquina_lavar">Máquina de Lavar</option>
                  </select>
                  <select
                    value={wType}
                    onChange={(e) => setWType(e.target.value as 'fria' | 'quente')}
                    className="px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                  >
                    <option value="fria">Água Fria</option>
                    <option value="quente">Água Quente</option>
                  </select>
                  <input
                    type="number"
                    value={wDiam}
                    onChange={(e) => setWDiam(Number(e.target.value))}
                    className="w-16 px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                    title="Diâmetro (mm)"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={wZ}
                    onChange={(e) => setWZ(Number(e.target.value))}
                    className="w-16 px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                    title="Altura Z (m)"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateProject((prev) => ({
                        ...prev,
                        unitTypes: prev.unitTypes.map((u) =>
                          u.id === activeUt.id
                            ? {
                                ...u,
                                waterPoints: [
                                  ...u.waterPoints,
                                  {
                                    id: nextId('wp'),
                                    code: `${wType === 'quente' ? 'AQ' : 'AF'}-${u.waterPoints.length + 1}`,
                                    category: wCat,
                                    equipment: wCat.replace(/_/g, ' '),
                                    roomId: u.rooms[0]?.id ?? '',
                                    x: 0.5,
                                    y: 0.2,
                                    z: wZ,
                                    waterType: wType,
                                    diameterMm: wDiam,
                                    material:
                                      wType === 'quente'
                                        ? prev.hydraulicConfig.hotWaterMaterial
                                        : prev.hydraulicConfig.coldWaterMaterial,
                                    availablePressureMca: 5.0,
                                    supplySource: 'Coluna 01',
                                    branchName: 'Ramal Principal',
                                    weightHunter: 0.5,
                                    notes: '',
                                  },
                                ],
                              }
                            : u,
                        ),
                      }));
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded bg-[#2F7CF6] text-white"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Ponto
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#181B20] text-[11px] text-[#949BA8]">
                    <tr>
                      <th className="py-2 px-3">Código</th>
                      <th className="py-2 px-3">Equipamento</th>
                      <th className="py-2 px-3">Tipo</th>
                      <th className="py-2 px-3 text-right">Ø (mm)</th>
                      <th className="py-2 px-3 text-right">Altura Z (m)</th>
                      <th className="py-2 px-3 text-right">Peso NBR</th>
                      <th className="py-2 px-3">Material</th>
                      <th className="py-2 px-3 text-right">Remover</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#252A33]">
                    {activeUt.waterPoints.map((wp) => (
                      <tr key={wp.id}>
                        <td className="py-2 px-3 font-mono text-[#60A5FA]">{wp.code}</td>
                        <td className="py-2 px-3 text-white">{wp.equipment}</td>
                        <td className="py-2 px-3">
                          <span className={wp.waterType === 'quente' ? 'text-red-400' : 'text-sky-400'}>
                            {wp.waterType === 'quente' ? 'Água Quente' : 'Água Fria'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono">{wp.diameterMm}</td>
                        <td className="py-2 px-3 text-right font-mono">{wp.z.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-mono">{wp.weightHunter}</td>
                        <td className="py-2 px-3 text-[#C4C9D4]">{wp.material}</td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateProject((prev) => ({
                                ...prev,
                                unitTypes: prev.unitTypes.map((u) =>
                                  u.id === activeUt.id
                                    ? {
                                        ...u,
                                        waterPoints: u.waterPoints.filter((p) => p.id !== wp.id),
                                      }
                                    : u,
                                ),
                              }))
                            }
                            className="p-1 text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {unitHyd && (
                <div className="text-xs text-[#949BA8] font-mono">
                  Dimensionamento {activeUt.code}: {unitHyd.methodology}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SANITÁRIA TAB */}
      {subTab === 'sanitaria' && activeUt && unitDrain && (
        <div className="space-y-5">
          <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Rede Sanitária Conectada — {activeUt.code} (ΣUHC: {unitDrain.totalUHC} · TQ Ø{unitDrain.recommendedStackMm}mm)
                </h2>
                <p className="text-xs text-[#949BA8] mt-0.5 font-mono">{unitDrain.methodology}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={dCat}
                  onChange={(e) => setDCat(e.target.value as DrainageCategory)}
                  className="px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                >
                  <option value="pia">Saída Pia</option>
                  <option value="lavatorio">Saída Lavatório</option>
                  <option value="vaso_sanitario">Vaso Sanitário</option>
                  <option value="chuveiro">Ralo Box</option>
                  <option value="caixa_sifonada">Caixa Sifonada</option>
                  <option value="caixa_gordura">Caixa de Gordura</option>
                  <option value="tubo_queda">Tubo de Queda</option>
                  <option value="ventilacao">Ventilação</option>
                </select>
                <input
                  type="number"
                  value={dDiam}
                  onChange={(e) => setDDiam(Number(e.target.value))}
                  className="w-16 px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                  title="Diâmetro (mm)"
                />
                <input
                  type="number"
                  step="0.5"
                  value={dSlope}
                  onChange={(e) => setDSlope(Number(e.target.value))}
                  className="w-16 px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                  title="Declividade (%)"
                />
                <input
                  type="number"
                  value={dUhc}
                  onChange={(e) => setDUhc(Number(e.target.value))}
                  className="w-14 px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                  title="UHC"
                />
                <button
                  type="button"
                  onClick={() => {
                    const tq = activeUt.drainagePoints.find((d) => d.category === 'tubo_queda');
                    onUpdateProject((prev) => ({
                      ...prev,
                      unitTypes: prev.unitTypes.map((u) =>
                        u.id === activeUt.id
                          ? {
                              ...u,
                              drainagePoints: [
                                ...u.drainagePoints,
                                {
                                  id: nextId('dr'),
                                  code: `ES-${u.drainagePoints.length + 1}`,
                                  category: dCat,
                                  roomId: u.rooms[0]?.id ?? '',
                                  x: 0.4,
                                  y: 0.4,
                                  diameterMm: dDiam,
                                  material: 'PVC Esgoto SN',
                                  slopePercent: dSlope,
                                  uhc: dUhc,
                                  connectedToId: tq?.id ?? 'CI-GERAL',
                                  notes: '',
                                },
                              ],
                            }
                          : u,
                      ),
                    }));
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded bg-[#2F7CF6] text-white"
                >
                  <Plus className="w-3.5 h-3.5" /> Inserir
                </button>
              </div>
            </div>

            {unitDrain.slopeIssues.length > 0 && (
              <div className="p-3 rounded border border-red-500/40 bg-red-950/30 text-xs text-red-200 space-y-1">
                {unitDrain.slopeIssues.map((iss, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span>{iss}</span>
                  </div>
                ))}
              </div>
            )}

            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#181B20] text-[11px] text-[#949BA8]">
                <tr>
                  <th className="py-2 px-3">Código</th>
                  <th className="py-2 px-3">Elemento</th>
                  <th className="py-2 px-3 text-right">Ø (mm)</th>
                  <th className="py-2 px-3 text-right">Decliv. (%)</th>
                  <th className="py-2 px-3 text-right">UHC</th>
                  <th className="py-2 px-3">Conectado a</th>
                  <th className="py-2 px-3 text-right">Remover</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252A33]">
                {activeUt.drainagePoints.map((dp) => {
                  const target = activeUt.drainagePoints.find((t) => t.id === dp.connectedToId);
                  return (
                    <tr key={dp.id}>
                      <td className="py-2 px-3 font-mono text-emerald-400">{dp.code}</td>
                      <td className="py-2 px-3 text-white">{dp.category.replace(/_/g, ' ')}</td>
                      <td className="py-2 px-3 text-right font-mono">{dp.diameterMm}</td>
                      <td className="py-2 px-3 text-right font-mono">
                        <input
                          type="number"
                          step="0.5"
                          value={dp.slopePercent}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            onUpdateProject((prev) => ({
                              ...prev,
                              unitTypes: prev.unitTypes.map((u) =>
                                u.id === activeUt.id
                                  ? {
                                      ...u,
                                      drainagePoints: u.drainagePoints.map((p) =>
                                        p.id === dp.id ? { ...p, slopePercent: val } : p,
                                      ),
                                    }
                                  : u,
                              ),
                            }));
                          }}
                          className="w-16 px-1.5 py-0.5 text-right font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-mono">{dp.uhc}</td>
                      <td className="py-2 px-3 font-mono text-[#C4C9D4]">
                        {target ? target.code : dp.connectedToId}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateProject((prev) => ({
                              ...prev,
                              unitTypes: prev.unitTypes.map((u) =>
                                u.id === activeUt.id
                                  ? {
                                      ...u,
                                      drainagePoints: u.drainagePoints.filter((p) => p.id !== dp.id),
                                    }
                                  : u,
                              ),
                            }))
                          }
                          className="p-1 text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ÁGUAS PLUVIAIS TAB */}
      {subTab === 'pluviais' && (
        <div className="space-y-5">
          <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <CloudRain className="w-4 h-4 text-[#60A5FA]" />
              Parâmetros Pluviométricos (ABNT NBR 10844)
            </h2>

            {rainReport.status === 'pendente_dados_pluviometricos' && (
              <div className="p-3 rounded border border-amber-500/40 bg-amber-950/30 text-xs text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{rainReport.methodology}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Localidade / Município</label>
                <input
                  type="text"
                  value={project.rainwaterConfig.municipality}
                  placeholder="Ex.: Campinas / SP"
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      rainwaterConfig: { ...prev.rainwaterConfig, municipality: e.target.value },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Intensidade I (mm/h)</label>
                <input
                  type="number"
                  step="1"
                  value={project.rainwaterConfig.rainfallIntensityMmH ?? ''}
                  placeholder="Informar (ex: 150)"
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      rainwaterConfig: {
                        ...prev.rainwaterConfig,
                        rainfallIntensityMmH: e.target.value === '' ? null : Number(e.target.value),
                      },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Período Retorno (anos)</label>
                <input
                  type="number"
                  value={project.rainwaterConfig.returnPeriodYears ?? ''}
                  placeholder="Ex.: 5"
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      rainwaterConfig: {
                        ...prev.rainwaterConfig,
                        returnPeriodYears: e.target.value === '' ? null : Number(e.target.value),
                      },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Fonte Normativa / Estação</label>
                <input
                  type="text"
                  value={project.rainwaterConfig.sourceReference}
                  placeholder="Ex.: NBR 10844 / DAEE"
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      rainwaterConfig: { ...prev.rainwaterConfig, sourceReference: e.target.value },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
            </div>

            {rainReport.flowLMin !== null && (
              <div className="p-3 rounded border border-emerald-500/40 bg-emerald-950/20 text-xs text-emerald-200 font-mono">
                Vazão Pluvial Calculada: {rainReport.flowLMin} L/min — {rainReport.methodology}
              </div>
            )}

            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#181B20] text-[11px] text-[#949BA8]">
                <tr>
                  <th className="py-2 px-3">Código</th>
                  <th className="py-2 px-3">Tipo</th>
                  <th className="py-2 px-3">Descrição</th>
                  <th className="py-2 px-3 text-right">Área Contrib. (m²)</th>
                  <th className="py-2 px-3">Seção / Diâmetro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252A33]">
                {project.rainwaterElements.map((rw) => (
                  <tr key={rw.id}>
                    <td className="py-2 px-3 font-mono text-[#60A5FA]">{rw.code}</td>
                    <td className="py-2 px-3">{rw.type}</td>
                    <td className="py-2 px-3 text-white">{rw.description}</td>
                    <td className="py-2 px-3 text-right font-mono">{rw.catchmentAreaM2}</td>
                    <td className="py-2 px-3 font-mono">{rw.diameterOrSection}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
