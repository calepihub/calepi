import React, { useRef, useState } from 'react';
import { AlertTriangle, CloudRain, Droplets, Move, Plus, Trash2 } from 'lucide-react';
import {
  calculateDrainageSizing,
  calculateHydraulicSizing,
  calculateRainwaterSizing,
} from '../engine/engineering';
import { getOpeningWorldPosition, getWallAngleRad, round2 } from '../engine/geometry';
import { nextId } from '../engine/parametricGenerator';
import { FurnitureCadBlock } from './CadArchitecturalSymbols';
import type { DrainageCategory, DrainagePoint, Project, UnitType, WaterCategory, WaterPoint } from '../types/project';

interface MepHydraulicSanitaryModuleProps {
  project: Project;
  selectedUnitTypeId: string;
  onSelectUnitType: (id: string) => void;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
}

function findRoomIdAtPoint(
  ut: UnitType,
  x: number,
  y: number,
  fallbackId: string,
): string {
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

  // Interactive 2D plan state (synced with Editor CAD 2D)
  const hydSvgRef = useRef<SVGSVGElement>(null);
  const drainSvgRef = useRef<SVGSVGElement>(null);
  const [selectedWpId, setSelectedWpId] = useState<string | null>(null);
  const [selectedDpId, setSelectedDpId] = useState<string | null>(null);
  const [draggingWp, setDraggingWp] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [draggingDp, setDraggingDp] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);

  const snapCoord = (v: number) => Math.round(v / 0.05) * 0.05;

  const clientToUnitCoords = (svg: SVGSVGElement | null, clientX: number, clientY: number) => {
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const world = pt.matrixTransform(ctm.inverse());
    return { x: world.x, y: world.y };
  };

  const updateWaterPoint = (pointId: string, patch: Partial<WaterPoint>, autoDetectRoom = false) => {
    if (!activeUt) return;
    onUpdateProject((prev) => ({
      ...prev,
      unitTypes: prev.unitTypes.map((u) => {
        if (u.id !== activeUt.id) return u;
        return {
          ...u,
          waterPoints: u.waterPoints.map((p) => {
            if (p.id !== pointId) return p;
            const nextPt = { ...p, ...patch };
            if (autoDetectRoom) {
              nextPt.roomId = findRoomIdAtPoint(u, nextPt.x, nextPt.y, p.roomId);
            }
            return nextPt;
          }),
        };
      }),
    }));
  };

  const updateDrainagePoint = (pointId: string, patch: Partial<DrainagePoint>, autoDetectRoom = false) => {
    if (!activeUt) return;
    onUpdateProject((prev) => ({
      ...prev,
      unitTypes: prev.unitTypes.map((u) => {
        if (u.id !== activeUt.id) return u;
        return {
          ...u,
          drainagePoints: u.drainagePoints.map((p) => {
            if (p.id !== pointId) return p;
            const nextPt = { ...p, ...patch };
            if (autoDetectRoom) {
              nextPt.roomId = findRoomIdAtPoint(u, nextPt.x, nextPt.y, p.roomId);
            }
            return nextPt;
          }),
        };
      }),
    }));
  };

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

              {/* Interactive 2D Hydraulic Plan (AF/AQ) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start pt-1">
                <div className="lg:col-span-7 rounded border border-[#2A2F38] bg-[#111317] p-2">
                  <div className="flex items-center justify-between px-1 pb-1.5 text-[11px] text-[#949BA8]">
                    <span className="inline-flex items-center gap-1.5 text-sky-300 font-medium">
                      <Move className="w-3.5 h-3.5" />
                      Planta Hidráulica Interativa (arraste AF/AQ — sincronizada com Editor 2D)
                    </span>
                    <span>Snap 0,05m</span>
                  </div>
                  <svg
                    ref={hydSvgRef}
                    viewBox={`${-0.35} ${-0.35} ${activeUt.width + 0.7} ${activeUt.depth + 0.7}`}
                    className="w-full max-h-[360px] select-none touch-none"
                    onPointerMove={(e) => {
                      if (!draggingWp) return;
                      const pt = clientToUnitCoords(hydSvgRef.current, e.clientX, e.clientY);
                      const nx = round2(Math.max(0.05, Math.min(activeUt.width - 0.05, snapCoord(pt.x - draggingWp.offsetX))));
                      const ny = round2(Math.max(0.05, Math.min(activeUt.depth - 0.05, snapCoord(pt.y - draggingWp.offsetY))));
                      updateWaterPoint(draggingWp.id, { x: nx, y: ny }, true);
                    }}
                    onPointerUp={() => setDraggingWp(null)}
                    onPointerLeave={() => setDraggingWp(null)}
                  >
                    {activeUt.rooms
                      .filter((r) => r.category !== 'mezanino')
                      .map((rm) => (
                        <g key={rm.id}>
                          <rect
                            x={rm.x}
                            y={rm.y}
                            width={rm.width}
                            height={rm.depth}
                            fill="#171A21"
                            stroke="#262B35"
                            strokeWidth={0.02}
                          />
                          <text
                            x={rm.x + rm.width / 2}
                            y={rm.y + rm.depth / 2}
                            textAnchor="middle"
                            fill="#4B5563"
                            fontSize="0.18"
                            fontWeight="bold"
                          >
                            {rm.code}
                          </text>
                        </g>
                      ))}
                    {activeUt.furniture
                      .filter((f) => (f.elevationM ?? 0) < 0.8 && f.category !== 'luminaria')
                      .map((fur) => (
                        <g key={fur.id} opacity={0.38} pointerEvents="none">
                          <FurnitureCadBlock
                            category={fur.category}
                            x={fur.x}
                            y={fur.y}
                            width={fur.width}
                            depth={fur.depth}
                            stroke="#64748B"
                            fill="rgba(30,41,59,0.2)"
                            strokeWidth={0.015}
                            detailed={false}
                            stairSpec={fur.stairSpec}
                            rotationDeg={fur.rotationDeg}
                          />
                        </g>
                      ))}
                    {activeUt.walls.map((w) => (
                      <line
                        key={w.id}
                        x1={w.start.x}
                        y1={w.start.y}
                        x2={w.end.x}
                        y2={w.end.y}
                        stroke={w.isExternal ? '#E2E8F0' : '#94A3B8'}
                        strokeWidth={w.thickness}
                        strokeLinecap="square"
                        pointerEvents="none"
                      />
                    ))}
                    {activeUt.openings.map((op) => {
                      const wall = activeUt.walls.find((w) => w.id === op.wallId);
                      if (!wall) return null;
                      const { center } = getOpeningWorldPosition(wall, op);
                      const deg = (getWallAngleRad(wall) * 180) / Math.PI;
                      return (
                        <g key={op.id} transform={`translate(${center.x}, ${center.y}) rotate(${deg})`} pointerEvents="none">
                          <rect x={-op.width / 2} y={-wall.thickness * 0.58} width={op.width} height={wall.thickness * 1.16} fill="#111317" />
                          <line x1={-op.width / 2} y1={0} x2={op.width / 2} y2={0} stroke={op.type === 'janela' ? '#38BDF8' : '#F59E0B'} strokeWidth={0.03} />
                        </g>
                      );
                    })}
                    {activeUt.waterPoints.map((wp) => {
                      const isSel = selectedWpId === wp.id;
                      const col = wp.waterType === 'quente' ? '#EF4444' : '#3B82F6';
                      return (
                        <g
                          key={wp.id}
                          transform={`translate(${wp.x}, ${wp.y})`}
                          className="cursor-move"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setSelectedWpId(wp.id);
                            const pt = clientToUnitCoords(hydSvgRef.current, e.clientX, e.clientY);
                            setDraggingWp({ id: wp.id, offsetX: pt.x - wp.x, offsetY: pt.y - wp.y });
                          }}
                        >
                          <circle
                            r={0.15}
                            fill={isSel ? 'rgba(59,130,246,0.28)' : 'transparent'}
                            stroke={isSel ? '#60A5FA' : 'transparent'}
                            strokeWidth={0.025}
                          />
                          <rect
                            x={-0.08}
                            y={-0.08}
                            width={0.16}
                            height={0.16}
                            rx={0.025}
                            fill={col}
                            stroke={isSel ? '#FFFFFF' : '#0F1115'}
                            strokeWidth={0.02}
                          />
                          <text
                            x={0.12}
                            y={0.04}
                            fill={wp.waterType === 'quente' ? '#FCA5A5' : '#93C5FD'}
                            fontSize="0.11"
                            fontWeight={isSel ? 'bold' : undefined}
                            fontFamily="JetBrains Mono, monospace"
                          >
                            {wp.code}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                <div className="lg:col-span-5 rounded border border-[#2A2F38] bg-[#14161A] p-3 space-y-2.5 text-xs">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">
                    Ponto Hidráulico Selecionado
                  </div>
                  {(() => {
                    const selWp = activeUt.waterPoints.find((p) => p.id === selectedWpId);
                    if (!selWp) {
                      return (
                        <p className="text-[11px] text-[#949BA8]">
                          Arraste qualquer ponto AF/AQ na planta ao lado (ou clique em uma linha da tabela) para reposicionar e sincronizar com o Editor CAD 2D.
                        </p>
                      );
                    }
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-white">
                            {selWp.code} — {selWp.equipment}
                          </span>
                          <span className={selWp.waterType === 'quente' ? 'text-red-400' : 'text-sky-400'}>
                            {selWp.waterType === 'quente' ? 'Água Quente' : 'Água Fria'}
                          </span>
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#949BA8] mb-0.5">Ambiente</label>
                          <select
                            value={selWp.roomId}
                            onChange={(e) => updateWaterPoint(selWp.id, { roomId: e.target.value })}
                            className="w-full px-2 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                          >
                            {activeUt.rooms.map((rm) => (
                              <option key={rm.id} value={rm.id}>
                                {rm.name} ({rm.code})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] text-[#949BA8] mb-0.5">X (m)</label>
                            <input
                              type="number"
                              step="0.05"
                              value={selWp.x}
                              onChange={(e) => updateWaterPoint(selWp.id, { x: round2(Number(e.target.value)) }, true)}
                              className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#949BA8] mb-0.5">Y (m)</label>
                            <input
                              type="number"
                              step="0.05"
                              value={selWp.y}
                              onChange={(e) => updateWaterPoint(selWp.id, { y: round2(Number(e.target.value)) }, true)}
                              className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#949BA8] mb-0.5">Altura Z (m)</label>
                            <input
                              type="number"
                              step="0.05"
                              value={selWp.z}
                              onChange={(e) => updateWaterPoint(selWp.id, { z: round2(Number(e.target.value)) })}
                              className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] text-[#949BA8] mb-0.5">Diâmetro (mm)</label>
                            <input
                              type="number"
                              step="5"
                              value={selWp.diameterMm}
                              onChange={(e) => updateWaterPoint(selWp.id, { diameterMm: Number(e.target.value) })}
                              className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#949BA8] mb-0.5">Peso NBR</label>
                            <input
                              type="number"
                              step="0.1"
                              value={selWp.weightHunter}
                              onChange={(e) => updateWaterPoint(selWp.id, { weightHunter: Number(e.target.value) })}
                              className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#181B20] text-[11px] text-[#949BA8]">
                    <tr>
                      <th className="py-2 px-3">Código</th>
                      <th className="py-2 px-3">Equipamento</th>
                      <th className="py-2 px-3">Ambiente</th>
                      <th className="py-2 px-3">X / Y / Z (m)</th>
                      <th className="py-2 px-3">Tipo</th>
                      <th className="py-2 px-3 text-right">Ø (mm)</th>
                      <th className="py-2 px-3 text-right">Peso NBR</th>
                      <th className="py-2 px-3">Material</th>
                      <th className="py-2 px-3 text-right">Remover</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#252A33]">
                    {activeUt.waterPoints.map((wp) => {
                      const isSel = selectedWpId === wp.id;
                      return (
                        <tr
                          key={wp.id}
                          onClick={() => setSelectedWpId(wp.id)}
                          className={`cursor-pointer ${isSel ? 'bg-[#2F7CF6]/15' : 'hover:bg-[#22262E]/50'}`}
                        >
                          <td className="py-2 px-3 font-mono text-[#60A5FA]">{wp.code}</td>
                          <td className="py-2 px-3 text-white">{wp.equipment}</td>
                          <td className="py-2 px-3">
                            <select
                              value={wp.roomId}
                              aria-label={`Ambiente de ${wp.code}`}
                              onChange={(e) => updateWaterPoint(wp.id, { roomId: e.target.value })}
                              className="px-1.5 py-0.5 bg-[#14161A] border border-[#2A2F38] rounded text-white text-xs"
                            >
                              {activeUt.rooms.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap">
                            <input
                              type="number"
                              step="0.05"
                              value={wp.x}
                              aria-label={`Coordenada X de ${wp.code}`}
                              onChange={(e) => updateWaterPoint(wp.id, { x: round2(Number(e.target.value)) }, true)}
                              className="w-14 px-1 py-0.5 bg-[#14161A] border border-[#2A2F38] rounded text-white inline-block mr-1"
                            />
                            <input
                              type="number"
                              step="0.05"
                              value={wp.y}
                              aria-label={`Coordenada Y de ${wp.code}`}
                              onChange={(e) => updateWaterPoint(wp.id, { y: round2(Number(e.target.value)) }, true)}
                              className="w-14 px-1 py-0.5 bg-[#14161A] border border-[#2A2F38] rounded text-white inline-block mr-1"
                            />
                            <input
                              type="number"
                              step="0.05"
                              value={wp.z}
                              aria-label={`Altura Z de ${wp.code}`}
                              onChange={(e) => updateWaterPoint(wp.id, { z: round2(Number(e.target.value)) })}
                              className="w-14 px-1 py-0.5 bg-[#14161A] border border-[#2A2F38] rounded text-white inline-block"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <span className={wp.waterType === 'quente' ? 'text-red-400' : 'text-sky-400'}>
                              {wp.waterType === 'quente' ? 'Água Quente' : 'Água Fria'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono">{wp.diameterMm}</td>
                          <td className="py-2 px-3 text-right font-mono">{wp.weightHunter}</td>
                          <td className="py-2 px-3 text-[#C4C9D4]">{wp.material}</td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
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
                                }));
                              }}
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

            {/* Interactive 2D Sanitary Plan */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start pt-1">
              <div className="lg:col-span-7 rounded border border-[#2A2F38] bg-[#111317] p-2">
                <div className="flex items-center justify-between px-1 pb-1.5 text-[11px] text-[#949BA8]">
                  <span className="inline-flex items-center gap-1.5 text-emerald-300 font-medium">
                    <Move className="w-3.5 h-3.5" />
                    Planta Sanitária Interativa (arraste pontos & ralos — sincronizada com Editor 2D)
                  </span>
                  <span>Snap 0,05m</span>
                </div>
                <svg
                  ref={drainSvgRef}
                  viewBox={`${-0.35} ${-0.35} ${activeUt.width + 0.7} ${activeUt.depth + 0.7}`}
                  className="w-full max-h-[360px] select-none touch-none"
                  onPointerMove={(e) => {
                    if (!draggingDp) return;
                    const pt = clientToUnitCoords(drainSvgRef.current, e.clientX, e.clientY);
                    const nx = round2(Math.max(0.05, Math.min(activeUt.width - 0.05, snapCoord(pt.x - draggingDp.offsetX))));
                    const ny = round2(Math.max(0.05, Math.min(activeUt.depth - 0.05, snapCoord(pt.y - draggingDp.offsetY))));
                    updateDrainagePoint(draggingDp.id, { x: nx, y: ny }, true);
                  }}
                  onPointerUp={() => setDraggingDp(null)}
                  onPointerLeave={() => setDraggingDp(null)}
                >
                  {activeUt.rooms
                    .filter((r) => r.category !== 'mezanino')
                    .map((rm) => (
                      <g key={rm.id}>
                        <rect
                          x={rm.x}
                          y={rm.y}
                          width={rm.width}
                          height={rm.depth}
                          fill="#171A21"
                          stroke="#262B35"
                          strokeWidth={0.02}
                        />
                        <text
                          x={rm.x + rm.width / 2}
                          y={rm.y + rm.depth / 2}
                          textAnchor="middle"
                          fill="#4B5563"
                          fontSize="0.18"
                          fontWeight="bold"
                        >
                          {rm.code}
                        </text>
                      </g>
                    ))}
                  {activeUt.furniture
                    .filter((f) => (f.elevationM ?? 0) < 0.8 && f.category !== 'luminaria')
                    .map((fur) => (
                      <g key={fur.id} opacity={0.38} pointerEvents="none">
                        <FurnitureCadBlock
                          category={fur.category}
                          x={fur.x}
                          y={fur.y}
                          width={fur.width}
                          depth={fur.depth}
                          stroke="#64748B"
                          fill="rgba(30,41,59,0.2)"
                          strokeWidth={0.015}
                          detailed={false}
                          stairSpec={fur.stairSpec}
                          rotationDeg={fur.rotationDeg}
                        />
                      </g>
                    ))}
                  {activeUt.walls.map((w) => (
                    <line
                      key={w.id}
                      x1={w.start.x}
                      y1={w.start.y}
                      x2={w.end.x}
                      y2={w.end.y}
                      stroke={w.isExternal ? '#E2E8F0' : '#94A3B8'}
                      strokeWidth={w.thickness}
                      strokeLinecap="square"
                      pointerEvents="none"
                    />
                  ))}
                  {activeUt.openings.map((op) => {
                    const wall = activeUt.walls.find((w) => w.id === op.wallId);
                    if (!wall) return null;
                    const { center } = getOpeningWorldPosition(wall, op);
                    const deg = (getWallAngleRad(wall) * 180) / Math.PI;
                    return (
                      <g key={op.id} transform={`translate(${center.x}, ${center.y}) rotate(${deg})`} pointerEvents="none">
                        <rect x={-op.width / 2} y={-wall.thickness * 0.58} width={op.width} height={wall.thickness * 1.16} fill="#111317" />
                        <line x1={-op.width / 2} y1={0} x2={op.width / 2} y2={0} stroke={op.type === 'janela' ? '#38BDF8' : '#F59E0B'} strokeWidth={0.03} />
                      </g>
                    );
                  })}
                  {/* Pipe connections */}
                  {activeUt.drainagePoints.map((dp) => {
                    const target = activeUt.drainagePoints.find((t) => t.id === dp.connectedToId);
                    if (!target) return null;
                    return (
                      <line
                        key={`dr-conn-${dp.id}`}
                        x1={dp.x}
                        y1={dp.y}
                        x2={target.x}
                        y2={target.y}
                        stroke="#10B981"
                        strokeOpacity={0.55}
                        strokeWidth={0.028}
                        strokeDasharray="0.07 0.05"
                        pointerEvents="none"
                      />
                    );
                  })}
                  {activeUt.drainagePoints.map((dp) => {
                    const isSel = selectedDpId === dp.id;
                    return (
                      <g
                        key={dp.id}
                        transform={`translate(${dp.x}, ${dp.y})`}
                        className="cursor-move"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelectedDpId(dp.id);
                          const pt = clientToUnitCoords(drainSvgRef.current, e.clientX, e.clientY);
                          setDraggingDp({ id: dp.id, offsetX: pt.x - dp.x, offsetY: pt.y - dp.y });
                        }}
                      >
                        <circle
                          r={0.15}
                          fill={isSel ? 'rgba(16,185,129,0.28)' : 'transparent'}
                          stroke={isSel ? '#60A5FA' : 'transparent'}
                          strokeWidth={0.025}
                        />
                        <circle
                          r={0.09}
                          fill="#0F1115"
                          stroke={isSel ? '#FFFFFF' : '#10B981'}
                          strokeWidth={0.032}
                        />
                        <text
                          x={0.12}
                          y={0.04}
                          fill="#34D399"
                          fontSize="0.11"
                          fontWeight={isSel ? 'bold' : undefined}
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {dp.code}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="lg:col-span-5 rounded border border-[#2A2F38] bg-[#14161A] p-3 space-y-2.5 text-xs">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                  Ponto Sanitário Selecionado
                </div>
                {(() => {
                  const selDp = activeUt.drainagePoints.find((p) => p.id === selectedDpId);
                  if (!selDp) {
                    return (
                      <p className="text-[11px] text-[#949BA8]">
                        Arraste qualquer ponto sanitário ou ralo na planta ao lado (ou clique em uma linha da tabela) para reposicionar e atualizar as conexões no Editor CAD 2D.
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-white">
                          {selDp.code} — {selDp.category.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono text-[11px] text-emerald-400">Ø{selDp.diameterMm}mm</span>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">Ambiente</label>
                        <select
                          value={selDp.roomId}
                          onChange={(e) => updateDrainagePoint(selDp.id, { roomId: e.target.value })}
                          className="w-full px-2 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                        >
                          {activeUt.rooms.map((rm) => (
                            <option key={rm.id} value={rm.id}>
                              {rm.name} ({rm.code})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] text-[#949BA8] mb-0.5">X (m)</label>
                          <input
                            type="number"
                            step="0.05"
                            value={selDp.x}
                            onChange={(e) => updateDrainagePoint(selDp.id, { x: round2(Number(e.target.value)) }, true)}
                            className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#949BA8] mb-0.5">Y (m)</label>
                          <input
                            type="number"
                            step="0.05"
                            value={selDp.y}
                            onChange={(e) => updateDrainagePoint(selDp.id, { y: round2(Number(e.target.value)) }, true)}
                            className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#949BA8] mb-0.5">Decliv. (%)</label>
                          <input
                            type="number"
                            step="0.5"
                            value={selDp.slopePercent}
                            onChange={(e) => updateDrainagePoint(selDp.id, { slopePercent: Number(e.target.value) })}
                            className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">Conectado a</label>
                        <select
                          value={selDp.connectedToId}
                          onChange={(e) => updateDrainagePoint(selDp.id, { connectedToId: e.target.value })}
                          className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                        >
                          <option value="CI-GERAL">CI-GERAL (Caixa Inspeção Externa)</option>
                          {activeUt.drainagePoints
                            .filter((t) => t.id !== selDp.id)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.code} ({t.category.replace(/_/g, ' ')})
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#181B20] text-[11px] text-[#949BA8]">
                  <tr>
                    <th className="py-2 px-3">Código</th>
                    <th className="py-2 px-3">Elemento</th>
                    <th className="py-2 px-3">Ambiente</th>
                    <th className="py-2 px-3">X / Y (m)</th>
                    <th className="py-2 px-3 text-right">Ø (mm)</th>
                    <th className="py-2 px-3 text-right">Decliv. (%)</th>
                    <th className="py-2 px-3 text-right">UHC</th>
                    <th className="py-2 px-3">Conectado a</th>
                    <th className="py-2 px-3 text-right">Remover</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#252A33]">
                  {activeUt.drainagePoints.map((dp) => {
                    const isSel = selectedDpId === dp.id;
                    return (
                      <tr
                        key={dp.id}
                        onClick={() => setSelectedDpId(dp.id)}
                        className={`cursor-pointer ${isSel ? 'bg-emerald-500/15' : 'hover:bg-[#22262E]/50'}`}
                      >
                        <td className="py-2 px-3 font-mono text-emerald-400">{dp.code}</td>
                        <td className="py-2 px-3 text-white">{dp.category.replace(/_/g, ' ')}</td>
                        <td className="py-2 px-3">
                          <select
                            value={dp.roomId}
                            aria-label={`Ambiente de ${dp.code}`}
                            onChange={(e) => updateDrainagePoint(dp.id, { roomId: e.target.value })}
                            className="px-1.5 py-0.5 bg-[#14161A] border border-[#2A2F38] rounded text-white text-xs"
                          >
                            {activeUt.rooms.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap">
                          <input
                            type="number"
                            step="0.05"
                            value={dp.x}
                            aria-label={`Coordenada X de ${dp.code}`}
                            onChange={(e) => updateDrainagePoint(dp.id, { x: round2(Number(e.target.value)) }, true)}
                            className="w-14 px-1 py-0.5 bg-[#14161A] border border-[#2A2F38] rounded text-white inline-block mr-1"
                          />
                          <input
                            type="number"
                            step="0.05"
                            value={dp.y}
                            aria-label={`Coordenada Y de ${dp.code}`}
                            onChange={(e) => updateDrainagePoint(dp.id, { y: round2(Number(e.target.value)) }, true)}
                            className="w-14 px-1 py-0.5 bg-[#14161A] border border-[#2A2F38] rounded text-white inline-block"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono">{dp.diameterMm}</td>
                        <td className="py-2 px-3 text-right font-mono">
                          <input
                            type="number"
                            step="0.5"
                            value={dp.slopePercent}
                            onChange={(e) => updateDrainagePoint(dp.id, { slopePercent: Number(e.target.value) })}
                            className="w-16 px-1.5 py-0.5 text-right font-mono bg-[#14161A] border border-[#2A2F38] rounded text-white"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono">{dp.uhc}</td>
                        <td className="py-2 px-3 font-mono text-[#C4C9D4]">
                          <select
                            value={dp.connectedToId}
                            onChange={(e) => updateDrainagePoint(dp.id, { connectedToId: e.target.value })}
                            className="px-1.5 py-0.5 bg-[#14161A] border border-[#2A2F38] rounded text-white text-xs font-mono"
                          >
                            <option value="CI-GERAL">CI-GERAL</option>
                            {activeUt.drainagePoints
                              .filter((t) => t.id !== dp.id)
                              .map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.code}
                                </option>
                              ))}
                          </select>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
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
                              }));
                            }}
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
