import React, { useState } from 'react';
import { AlertTriangle, Plus, Trash2, Zap } from 'lucide-react';
import { calculateElectricalSizing } from '../engine/engineering';
import { nextId } from '../engine/parametricGenerator';
import type { ElectricalCategory, ElectricalPoint, Project } from '../types/project';

interface MepElectricalModuleProps {
  project: Project;
  selectedUnitTypeId: string;
  onSelectUnitType: (id: string) => void;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
}

const CATEGORIES: Array<{ value: ElectricalCategory; label: string; defPower: number; defZKey: keyof Project['electricalHeights'] }> = [
  { value: 'tomada_baixa', label: 'Tomada Baixa (TUG)', defPower: 100, defZKey: 'tomadaBaixa' },
  { value: 'tomada_media', label: 'Tomada Média (TUG)', defPower: 600, defZKey: 'tomadaMedia' },
  { value: 'tomada_alta', label: 'Tomada Alta (TUG)', defPower: 600, defZKey: 'tomadaAlta' },
  { value: 'tomada_tue', label: 'Tomada Uso Específico (TUE)', defPower: 1500, defZKey: 'tomadaMedia' },
  { value: 'interruptor', label: 'Interruptor', defPower: 0, defZKey: 'interruptor' },
  { value: 'iluminacao_teto', label: 'Ponto Iluminação Teto', defPower: 100, defZKey: 'iluminacaoTeto' },
  { value: 'arandela', label: 'Arandela', defPower: 60, defZKey: 'tomadaAlta' },
  { value: 'ar_condicionado', label: 'Ar-Condicionado', defPower: 1200, defZKey: 'arCondicionado' },
  { value: 'chuveiro', label: 'Chuveiro Elétrico', defPower: 5500, defZKey: 'chuveiro' },
  { value: 'forno', label: 'Forno Elétrico', defPower: 2000, defZKey: 'tomadaMedia' },
  { value: 'cooktop', label: 'Cooktop', defPower: 1800, defZKey: 'tomadaMedia' },
  { value: 'maquina_lavar', label: 'Máquina de Lavar', defPower: 1000, defZKey: 'tomadaMedia' },
  { value: 'geladeira', label: 'Geladeira', defPower: 350, defZKey: 'tomadaMedia' },
  { value: 'microondas', label: 'Micro-ondas', defPower: 1400, defZKey: 'tomadaMedia' },
  { value: 'coifa', label: 'Coifa / Depurador', defPower: 250, defZKey: 'tomadaAlta' },
  { value: 'dados', label: 'Internet / Rede Dados RJ45 Cat6', defPower: 0, defZKey: 'tomadaBaixa' },
  { value: 'tv', label: 'Ponto TV / HDMI', defPower: 0, defZKey: 'tomadaMedia' },
  { value: 'antena_tv', label: 'Antena Coletiva / Coaxial RG6', defPower: 0, defZKey: 'tomadaMedia' },
  { value: 'wifi_ap', label: 'Roteador / Access Point Wi-Fi PoE', defPower: 15, defZKey: 'tomadaAlta' },
  { value: 'cftv', label: 'Câmera CFTV IP PoE', defPower: 15, defZKey: 'tomadaAlta' },
  { value: 'rack_ti', label: 'Rack Telecom / NVR / Switch PoE', defPower: 120, defZKey: 'tomadaAlta' },
  { value: 'interfone', label: 'Interfone / Vídeo Porteiro', defPower: 20, defZKey: 'tomadaMedia' },
  { value: 'personalizado', label: 'Personalizado', defPower: 100, defZKey: 'tomadaMedia' },
];

export const MepElectricalModule: React.FC<MepElectricalModuleProps> = ({
  project,
  selectedUnitTypeId,
  onSelectUnitType,
  onUpdateProject,
}) => {
  const activeUt =
    project.unitTypes.find((u) => u.id === selectedUnitTypeId) ?? project.unitTypes[0];
  const report = calculateElectricalSizing(project);
  const unitReport = report.byUnitType.find((r) => r.unitTypeId === activeUt?.id);

  // Add point form
  const [cat, setCat] = useState<ElectricalCategory>('tomada_media');
  const [roomId, setRoomId] = useState<string>(activeUt?.rooms[0]?.id ?? '');
  const [label, setLabel] = useState('Tomada Média');
  const [x, setX] = useState(0.5);
  const [y, setY] = useState(0.5);
  const [z, setZ] = useState(project.electricalHeights.tomadaMedia);
  const [powerVA, setPowerVA] = useState(600);
  const [voltage, setVoltage] = useState<127 | 220>(127);
  const [circuitId, setCircuitId] = useState('C2-TUG');
  const [conductor, setConductor] = useState(2.5);

  const handleCategoryChange = (nextCat: ElectricalCategory) => {
    setCat(nextCat);
    const meta = CATEGORIES.find((c) => c.value === nextCat);
    if (meta) {
      setLabel(meta.label);
      setPowerVA(meta.defPower);
      setZ(project.electricalHeights[meta.defZKey]);
      if (nextCat === 'chuveiro' || nextCat === 'ar_condicionado' || nextCat === 'cooktop') {
        setVoltage(220);
      } else {
        setVoltage(127);
      }
    }
  };

  const handleAddPoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUt) return;
    const targetRoomId = roomId || activeUt.rooms[0]?.id || '';
    const newPt: ElectricalPoint = {
      id: nextId('el'),
      code: `PT-${activeUt.electricalPoints.length + 1}`,
      category: cat,
      label: label.trim() || 'Ponto Elétrico',
      roomId: targetRoomId,
      x,
      y,
      z,
      referenceWall: 'Manual',
      referenceDistance: x,
      powerVA,
      voltage,
      powerFactor: 0.9,
      circuitId: circuitId.trim() || 'C2-TUG',
      conductorSectionMm2: conductor,
      conduitDiameterMm: conductor >= 4 ? 25 : 20,
      protection: conductor >= 6 ? 'Disjuntor 32A + DR' : 'Disjuntor 16A',
      notes: '',
    };
    onUpdateProject(
      (prev) => ({
        ...prev,
        unitTypes: prev.unitTypes.map((u) =>
          u.id === activeUt.id
            ? { ...u, electricalPoints: [...u.electricalPoints, newPt] }
            : u,
        ),
      }),
      `Inserção de ponto elétrico ${newPt.code} em ${activeUt.code}`,
    );
  };

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2A2F38] pb-4">
        <div>
          <h1 className="text-xl font-semibold text-white">
            Instalações Elétricas — Pontos X/Y/Z, Circuitos & Quadro de Cargas
          </h1>
          <p className="text-xs text-[#949BA8] mt-1">
            Cadastro individual de pontos por ambiente, alturas configuráveis, cálculo de corrente e queda de tensão rastreáveis (ABNT NBR 5410).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={activeUt?.id ?? ''}
            onChange={(e) => onSelectUnitType(e.target.value)}
            aria-label="Selecionar tipologia elétrica"
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

      {/* Building Global KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4">
          <div className="text-[11px] text-[#949BA8]">Unidades Implantadas</div>
          <div className="text-xl font-mono font-semibold text-white mt-1 tabular-nums">
            {report.totalUnits} unid.
          </div>
        </div>
        <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4">
          <div className="text-[11px] text-[#949BA8]">Potência Instalada Global</div>
          <div className="text-xl font-mono font-semibold text-amber-400 mt-1 tabular-nums">
            {report.totalInstalledKVA} kVA
          </div>
        </div>
        <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4">
          <div className="text-[11px] text-[#949BA8]">Demanda Estimada Coletiva</div>
          <div className="text-xl font-mono font-semibold text-[#60A5FA] mt-1 tabular-nums">
            {report.totalDemandKVA} kVA
          </div>
        </div>
        <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4">
          <div className="text-[11px] text-[#949BA8]">Demanda da Tipologia ({activeUt?.code})</div>
          <div className="text-xl font-mono font-semibold text-emerald-400 mt-1 tabular-nums">
            {unitReport?.demandPowerVA ?? 0} VA
          </div>
        </div>
      </div>

      <div className="text-xs text-[#949BA8] bg-[#1B1E24] border border-[#2A2F38] rounded p-3">
        <strong className="text-[#E6E9EF]">Critério de Demanda:</strong> {report.diversityNote}
      </div>

      {/* Configurable Default Heights */}
      <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-white">
          Cadastro de Alturas-Padrão Editáveis (Z em metros)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-7 gap-2.5">
          {(
            [
              ['tomadaBaixa', 'Tom. Baixa'],
              ['tomadaMedia', 'Tom. Média'],
              ['tomadaAlta', 'Tom. Alta'],
              ['interruptor', 'Interruptor'],
              ['arCondicionado', 'Ar-Cond.'],
              ['chuveiro', 'Chuveiro'],
              ['iluminacaoTeto', 'Ilum. Teto'],
            ] as const
          ).map(([key, lbl]) => (
            <div key={key}>
              <label className="block text-[11px] text-[#949BA8] mb-1">{lbl}</label>
              <input
                type="number"
                step="0.05"
                min={0}
                value={project.electricalHeights[key]}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onUpdateProject((prev) => ({
                    ...prev,
                    electricalHeights: { ...prev.electricalHeights, [key]: val },
                  }));
                }}
                className="w-full px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Empty typology prompt */}
      {!activeUt && (
        <div className="rounded-lg border border-dashed border-[#323844] bg-[#1B1E24] p-6 text-center text-xs text-[#949BA8]">
          Nenhuma tipologia criada ainda. Cadastre uma tipologia na etapa &quot;Planta 2D & Tipologias&quot; para lançar pontos e circuitos elétricos.
        </div>
      )}

      {/* Add Point Form */}
      {activeUt && (
        <form
          onSubmit={handleAddPoint}
          className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 space-y-3"
        >
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Inserir Ponto Elétrico em {activeUt.code}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-8 gap-2.5">
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-[#949BA8] mb-1">Categoria</label>
              <select
                value={cat}
                onChange={(e) => handleCategoryChange(e.target.value as ElectricalCategory)}
                className="w-full px-2 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-[#949BA8] mb-1">Ambiente</label>
              <select
                value={roomId || activeUt.rooms[0]?.id || ''}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
              >
                {activeUt.rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[#949BA8] mb-1">Altura Z (m)</label>
              <input
                type="number"
                step="0.05"
                value={z}
                onChange={(e) => setZ(Number(e.target.value))}
                className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#949BA8] mb-1">Potência (VA)</label>
              <input
                type="number"
                step="50"
                min={0}
                value={powerVA}
                onChange={(e) => setPowerVA(Number(e.target.value))}
                className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#949BA8] mb-1">Tensão / Circ.</label>
              <div className="flex gap-1">
                <select
                  value={voltage}
                  onChange={(e) => setVoltage(Number(e.target.value) as 127 | 220)}
                  className="w-1/2 px-1 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                >
                  <option value={127}>127V</option>
                  <option value={220}>220V</option>
                </select>
                <input
                  type="text"
                  value={circuitId}
                  onChange={(e) => setCircuitId(e.target.value)}
                  className="w-1/2 px-1.5 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full py-1.5 px-3 text-xs font-semibold rounded bg-[#2F7CF6] text-white hover:bg-[#2569D6] flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Inserir
              </button>
            </div>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5">
            <div className="col-span-2">
              <label className="block text-[11px] text-[#949BA8] mb-1">Descrição</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#949BA8] mb-1">X (m)</label>
              <input
                type="number"
                step="0.05"
                value={x}
                onChange={(e) => setX(Number(e.target.value))}
                className="w-full px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#949BA8] mb-1">Y (m)</label>
              <input
                type="number"
                step="0.05"
                value={y}
                onChange={(e) => setY(Number(e.target.value))}
                className="w-full px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#949BA8] mb-1">Cabo (mm²)</label>
              <select
                value={conductor}
                onChange={(e) => setConductor(Number(e.target.value))}
                className="w-full px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
              >
                <option value={1.5}>1.5</option>
                <option value={2.5}>2.5</option>
                <option value={4}>4.0</option>
                <option value={6}>6.0</option>
                <option value={10}>10.0</option>
              </select>
            </div>
          </div>
        </form>
      )}

      {/* Points Table */}
      {activeUt && (
        <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] overflow-x-auto">
          <div className="px-4 py-3 border-b border-[#2A2F38] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Pontos Elétricos Cadastrados — {activeUt.code} ({activeUt.electricalPoints.length})
            </h2>
          </div>
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#181B20] text-[11px] text-[#949BA8]">
              <tr>
                <th className="py-2.5 px-3">Código</th>
                <th className="py-2.5 px-3">Descrição</th>
                <th className="py-2.5 px-3">Ambiente</th>
                <th className="py-2.5 px-3">X / Y / Z (m)</th>
                <th className="py-2.5 px-3 text-right">Potência (VA)</th>
                <th className="py-2.5 px-3">Tensão</th>
                <th className="py-2.5 px-3">Circuito</th>
                <th className="py-2.5 px-3 text-right">Cabo</th>
                <th className="py-2.5 px-3 text-right">Remover</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#252A33]">
              {activeUt.electricalPoints.map((ep) => {
                const rm = activeUt.rooms.find((r) => r.id === ep.roomId);
                return (
                  <tr key={ep.id} className="hover:bg-[#22262E]/50">
                    <td className="py-2 px-3 font-mono text-amber-400">{ep.code}</td>
                    <td className="py-2 px-3 text-white">{ep.label}</td>
                    <td className="py-2 px-3 text-[#C4C9D4]">{rm?.name ?? 'N/I'}</td>
                    <td className="py-2 px-3 font-mono tabular-nums text-[#C4C9D4]">
                      ({ep.x.toFixed(2)}, {ep.y.toFixed(2)},{' '}
                      <input
                        type="number"
                        step="0.05"
                        value={ep.z}
                        aria-label={`Altura Z de ${ep.code}`}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          onUpdateProject((prev) => ({
                            ...prev,
                            unitTypes: prev.unitTypes.map((u) =>
                              u.id === activeUt.id
                                ? {
                                    ...u,
                                    electricalPoints: u.electricalPoints.map((p) =>
                                      p.id === ep.id ? { ...p, z: val } : p,
                                    ),
                                  }
                                : u,
                            ),
                          }));
                        }}
                        className="w-14 px-1 py-0.5 bg-[#14161A] border border-[#2A2F38] rounded text-white inline-block"
                      />
                      )
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{ep.powerVA}</td>
                    <td className="py-2 px-3 font-mono">{ep.voltage}V</td>
                    <td className="py-2 px-3 font-mono text-[#60A5FA]">{ep.circuitId}</td>
                    <td className="py-2 px-3 text-right font-mono">{ep.conductorSectionMm2}mm²</td>
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
                                    electricalPoints: u.electricalPoints.filter(
                                      (p) => p.id !== ep.id,
                                    ),
                                  }
                                : u,
                            ),
                          }))
                        }
                        aria-label={`Remover ponto ${ep.code}`}
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
      )}

      {/* Quadro de Cargas & Diagrama Unifilar SVG */}
      {unitReport && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 rounded-lg border border-[#2A2F38] bg-[#1B1E24] overflow-x-auto">
            <div className="px-4 py-3 border-b border-[#2A2F38]">
              <h2 className="text-sm font-semibold text-white">
                Quadro de Cargas e Circuitos — {activeUt?.code}
              </h2>
            </div>
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#181B20] text-[11px] text-[#949BA8]">
                <tr>
                  <th className="py-2.5 px-3">Circuito</th>
                  <th className="py-2.5 px-3">Tensão</th>
                  <th className="py-2.5 px-3 text-right">Pot. (VA)</th>
                  <th className="py-2.5 px-3 text-right">Corr. (A)</th>
                  <th className="py-2.5 px-3 text-right">Disj. (A)</th>
                  <th className="py-2.5 px-3 text-right">Cabo</th>
                  <th className="py-2.5 px-3 text-right">ΔV (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252A33]">
                {unitReport.circuits.map((c) => (
                  <tr key={c.circuitId}>
                    <td className="py-2 px-3 font-mono font-semibold text-white">
                      {c.circuitId}
                      <div className="text-[10px] font-sans font-normal text-[#949BA8]">
                        {c.methodology}
                      </div>
                    </td>
                    <td className="py-2 px-3 font-mono">{c.voltage}V</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{c.totalPowerVA}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{c.currentA}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-[#60A5FA]">
                      {c.recommendedBreakerA}A
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{c.conductorMm2}mm²</td>
                    <td
                      className={`py-2 px-3 text-right font-mono tabular-nums ${
                        c.voltageDropOk ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {c.voltageDropPercent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {unitReport.warnings.length > 0 && (
              <div className="p-3 border-t border-[#2A2F38] bg-amber-950/20 space-y-1 text-xs text-amber-200">
                {unitReport.warnings.map((w, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unifilar Diagram SVG */}
          <div className="lg:col-span-4 rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 space-y-3">
            <h2 className="text-sm font-semibold text-white">Diagrama Unifilar Esquemático ({activeUt?.code})</h2>
            <svg
              viewBox={`0 0 320 ${Math.max(220, 70 + unitReport.circuits.length * 42)}`}
              className="w-full bg-[#111317] border border-[#2A2F38] rounded"
            >
              {/* Main feeder & QDC */}
              <line x1="30" y1="30" x2="90" y2="30" stroke="#60A5FA" strokeWidth="2" />
              <rect x="90" y="18" width="54" height="24" fill="#1E242E" stroke="#60A5FA" strokeWidth="1.5" />
              <text x="117" y="34" textAnchor="middle" fill="#F1F4F9" fontSize="10" fontFamily="JetBrains Mono, monospace">
                QDC
              </text>
              <line
                x1="117"
                y1="42"
                x2="117"
                y2={42 + unitReport.circuits.length * 40}
                stroke="#94A3B8"
                strokeWidth="2"
              />
              {unitReport.circuits.map((c, idx) => {
                const yPos = 66 + idx * 40;
                return (
                  <g key={c.circuitId}>
                    <line x1="117" y1={yPos} x2="175" y2={yPos} stroke="#F59E0B" strokeWidth="1.5" />
                    <path d={`M 140 ${yPos} Q 148 ${yPos - 8} 156 ${yPos}`} fill="none" stroke="#60A5FA" strokeWidth="1.5" />
                    <text x="182" y={yPos + 3} fill="#E6E9EF" fontSize="10" fontFamily="JetBrains Mono, monospace">
                      {c.circuitId} ({c.recommendedBreakerA}A · {c.conductorMm2}mm²)
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};
