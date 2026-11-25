import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CloudRain,
  Droplets,
  List,
  Move,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import {
  calculateDrainageSizing,
  calculateHydraulicSizing,
  calculateRainwaterSizing,
} from '../engine/engineering';
import { getOpeningWorldPosition, getWallAngleRad, round2 } from '../engine/geometry';
import { computeDrainageRouting, computeHydraulicRouting } from '../engine/mepRouting';
import { nextId } from '../engine/parametricGenerator';
import { FurnitureCadBlock } from './CadArchitecturalSymbols';
import { PaginationBar, paginateItems, useViewportPageSize } from './PaginationBar';
import type {
  DrainageCategory,
  DrainagePoint,
  Project,
  UnitType,
  WaterCategory,
  WaterPoint,
} from '../types/project';

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
  const [hydView, setHydView] = useState<'planta' | 'tabela' | 'parametros'>('planta');
  const [sanView, setSanView] = useState<'planta' | 'tabela'>('planta');

  const [wpPage, setWpPage] = useState(0);
  const [dpPage, setDpPage] = useState(0);
  const [rwPage, setRwPage] = useState(0);

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
  const [draggingWp, setDraggingWp] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [draggingDp, setDraggingDp] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const hydRouting = activeUt ? computeHydraulicRouting(activeUt) : null;
  const drRouting = activeUt ? computeDrainageRouting(activeUt) : null;

  const wpPerPage = useViewportPageSize(340, 42, 4, 14);
  const dpPerPage = useViewportPageSize(340, 42, 4, 14);
  const rwPerPage = useViewportPageSize(360, 40, 4, 12);

  const waterPoints = activeUt?.waterPoints ?? [];
  const drainagePoints = activeUt?.drainagePoints ?? [];
  const pagedWp = paginateItems(waterPoints, wpPage, wpPerPage);
  const pagedDp = paginateItems(drainagePoints, dpPage, dpPerPage);
  const pagedRw = paginateItems(project.rainwaterElements, rwPage, rwPerPage);

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

  const updateWaterPoint = (
    pointId: string,
    patch: Partial<WaterPoint>,
    autoDetectRoom = false,
  ) => {
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

  const updateDrainagePoint = (
    pointId: string,
    patch: Partial<DrainagePoint>,
    autoDetectRoom = false,
  ) => {
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

  const handleAddWaterPoint = () => {
    if (!activeUt) return;
    const newId = nextId('wp');
    onUpdateProject((prev) => ({
      ...prev,
      unitTypes: prev.unitTypes.map((u) =>
        u.id === activeUt.id
          ? {
              ...u,
              waterPoints: [
                ...u.waterPoints,
                {
                  id: newId,
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
    setSelectedWpId(newId);
  };

  const handleAddDrainagePoint = () => {
    if (!activeUt) return;
    const tq = activeUt.drainagePoints.find((d) => d.category === 'tubo_queda');
    const newId = nextId('dr');
    onUpdateProject((prev) => ({
      ...prev,
      unitTypes: prev.unitTypes.map((u) =>
        u.id === activeUt.id
          ? {
              ...u,
              drainagePoints: [
                ...u.drainagePoints,
                {
                  id: newId,
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
    setSelectedDpId(newId);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col gap-2 overflow-hidden bg-[#14161A] p-3 text-slate-100">
      {/* Compact Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#2A2F38] pb-2">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-white">
            Instalações Hidráulicas, Sanitárias &amp; Águas Pluviais
          </h1>
          <p className="truncate text-[11px] text-[#949BA8]">
            Água fria/quente, reservação, rede conectada de esgoto (UHC e declividades) e drenagem pluvial.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded border border-[#2A2F38] bg-[#1B1E24] p-0.5">
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
                className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                  subTab === k ? 'bg-[#2F7CF6] text-white' : 'text-[#949BA8] hover:text-white'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <select
            value={activeUt?.id ?? ''}
            onChange={(e) => {
              onSelectUnitType(e.target.value);
              setWpPage(0);
              setDpPage(0);
              setSelectedWpId(null);
              setSelectedDpId(null);
            }}
            aria-label="Selecionar tipologia hidráulica"
            className="rounded border border-[#2A2F38] bg-[#1B1E24] px-2.5 py-1 text-xs text-white"
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
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          {/* Compact KPI Strip + Sub-View Tabs */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded border border-[#2A2F38] bg-[#1B1E24] px-3 py-1.5">
                <div className="text-[10px] text-[#949BA8]">População</div>
                <div className="font-mono text-sm font-semibold tabular-nums text-white">
                  {hydReport.estimatedPopulation} hab.
                </div>
              </div>
              <div className="rounded border border-[#2A2F38] bg-[#1B1E24] px-3 py-1.5">
                <div className="text-[10px] text-[#949BA8]">Consumo Diário</div>
                <div className="font-mono text-sm font-semibold tabular-nums text-[#60A5FA]">
                  {hydReport.dailyConsumptionLiters} L/dia
                </div>
              </div>
              <div className="rounded border border-[#2A2F38] bg-[#1B1E24] px-3 py-1.5">
                <div className="text-[10px] text-[#949BA8]">
                  Reserva ({project.hydraulicConfig.reserveDays}d)
                </div>
                <div className="font-mono text-sm font-semibold tabular-nums text-emerald-400">
                  {hydReport.recommendedTotalReservoirLiters} L
                </div>
              </div>
              <div className="rounded border border-[#2A2F38] bg-[#1B1E24] px-3 py-1.5">
                <div className="text-[10px] text-[#949BA8]">Vazão ({activeUt?.code || '—'})</div>
                <div className="font-mono text-sm font-semibold tabular-nums text-white">
                  {unitHyd?.probableFlowColdLs ?? 0} L/s
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 rounded border border-[#2A2F38] bg-[#1B1E24] p-0.5">
              {(
                [
                  ['planta', 'Planta & Inspetor', Move],
                  ['tabela', `Tabela (${waterPoints.length})`, List],
                  ['parametros', 'Reserva & Novo Ponto', SlidersHorizontal],
                ] as const
              ).map(([id, lbl, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setHydView(id)}
                  className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                    hydView === id ? 'bg-[#2F7CF6] text-white' : 'text-[#949BA8] hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {!activeUt ? (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-[#323844] bg-[#1B1E24] p-6 text-center text-xs text-[#949BA8]">
              Nenhuma tipologia criada ainda. Cadastre uma tipologia na etapa &quot;Planta 2D &amp; Tipologias&quot; para lançar pontos hidráulicos.
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-hidden">
              {/* HYDRAULIC VIEW 1: PLANTA & INSPETOR */}
              {hydView === 'planta' && (
                <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12">
                  <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#2A2F38] bg-[#111317] p-2.5 lg:col-span-7">
                    <div className="mb-1.5 flex shrink-0 flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1.5 font-medium text-sky-300">
                        <Move className="h-3.5 w-3.5" />
                        Planta Hidráulica (AF/AQ) —{' '}
                        {hydRouting
                          ? `Prumada (${hydRouting.riser.x.toFixed(2)}, ${hydRouting.riser.y.toFixed(2)}) · MST: ${hydRouting.totalPipeM} m`
                          : 'Arraste os pontos'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateProject(
                            (prev) => ({
                              ...prev,
                              hydraulicConfig: {
                                ...prev.hydraulicConfig,
                                hasHotWaterHeating: false,
                                hotWaterMaterial: 'Sem Água Quente (Chuveiro Elétrico)',
                                heatingSystem:
                                  'Sem aquecimento central (kitnet simples: somente água fria + chuveiro elétrico)',
                              },
                              unitTypes: prev.unitTypes.map((u) =>
                                u.id === activeUt.id
                                  ? {
                                      ...u,
                                      mepProfile: 'simples',
                                      waterPoints: u.waterPoints.filter(
                                        (wp) => wp.waterType !== 'quente',
                                      ),
                                    }
                                  : u,
                              ),
                            }),
                            `Simplificação hidráulica (Só Água Fria) em ${activeUt.code}`,
                          );
                        }}
                        className="rounded border border-emerald-500/40 bg-emerald-600/20 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-200 hover:bg-emerald-600/35"
                      >
                        Modo Só Água Fria
                      </button>
                    </div>

                    <svg
                      ref={hydSvgRef}
                      viewBox={`${-0.35} ${-0.35} ${activeUt.width + 0.7} ${activeUt.depth + 0.7}`}
                      className="min-h-0 h-full w-full flex-1 select-none touch-none"
                      onPointerMove={(e) => {
                        if (!draggingWp) return;
                        const pt = clientToUnitCoords(hydSvgRef.current, e.clientX, e.clientY);
                        const nx = round2(
                          Math.max(
                            0.05,
                            Math.min(activeUt.width - 0.05, snapCoord(pt.x - draggingWp.offsetX)),
                          ),
                        );
                        const ny = round2(
                          Math.max(
                            0.05,
                            Math.min(activeUt.depth - 0.05, snapCoord(pt.y - draggingWp.offsetY)),
                          ),
                        );
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
                          <g
                            key={op.id}
                            transform={`translate(${center.x}, ${center.y}) rotate(${deg})`}
                            pointerEvents="none"
                          >
                            <rect
                              x={-op.width / 2}
                              y={-wall.thickness * 0.58}
                              width={op.width}
                              height={wall.thickness * 1.16}
                              fill="#111317"
                            />
                            <line
                              x1={-op.width / 2}
                              y1={0}
                              x2={op.width / 2}
                              y2={0}
                              stroke={op.type === 'janela' ? '#38BDF8' : '#F59E0B'}
                              strokeWidth={0.03}
                            />
                          </g>
                        );
                      })}
                      {hydRouting && (
                        <g pointerEvents="none">
                          {hydRouting.segments.map((seg) => {
                            const pts = seg.elbow
                              ? `${seg.from.x},${seg.from.y} ${seg.elbow.x},${seg.elbow.y} ${seg.to.x},${seg.to.y}`
                              : `${seg.from.x},${seg.from.y} ${seg.to.x},${seg.to.y}`;
                            return (
                              <polyline
                                key={`hyd-rt-${seg.id}`}
                                points={pts}
                                fill="none"
                                stroke={seg.kind === 'hot_water' ? '#EF4444' : '#38BDF8'}
                                strokeOpacity={0.75}
                                strokeWidth={0.028}
                                strokeDasharray={
                                  seg.kind === 'hot_water' ? '0.07 0.04' : '0.09 0.03'
                                }
                              />
                            );
                          })}
                          <circle
                            cx={hydRouting.riser.x}
                            cy={hydRouting.riser.y}
                            r={0.09}
                            fill="#0EA5E9"
                            stroke="#FFFFFF"
                            strokeWidth={0.02}
                          />
                          <text
                            x={hydRouting.riser.x + 0.11}
                            y={hydRouting.riser.y + 0.04}
                            fill="#BAE6FD"
                            fontSize="0.1"
                            fontWeight="bold"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            PRUMADA AF
                          </text>
                        </g>
                      )}
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
                              setDraggingWp({
                                id: wp.id,
                                offsetX: pt.x - wp.x,
                                offsetY: pt.y - wp.y,
                              });
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

                  {/* Right Inspector + Quick Add */}
                  <div className="flex min-h-0 flex-col justify-between gap-2 overflow-hidden rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-3 text-xs lg:col-span-5">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between border-b border-[#2A2F38] pb-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">
                          Ponto Hidráulico Selecionado
                        </span>
                        <button
                          type="button"
                          onClick={() => setHydView('parametros')}
                          className="inline-flex items-center gap-1 rounded bg-[#2F7CF6] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#2569D6]"
                        >
                          <Plus className="h-3 w-3" /> Novo Ponto
                        </button>
                      </div>

                      {(() => {
                        const selWp = activeUt.waterPoints.find((p) => p.id === selectedWpId);
                        if (!selWp) {
                          return (
                            <p className="rounded border border-dashed border-[#2A2F38] bg-[#14161A] p-3 text-[11px] text-[#949BA8]">
                              Arraste qualquer ponto AF/AQ na planta ao lado (ou selecione na aba Tabela) para reposicionar e sincronizar com o Editor CAD 2D.
                            </p>
                          );
                        }
                        return (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-semibold text-white">
                                {selWp.code} — {selWp.equipment}
                              </span>
                              <span
                                className={
                                  selWp.waterType === 'quente' ? 'text-red-400' : 'text-sky-400'
                                }
                              >
                                {selWp.waterType === 'quente' ? 'Água Quente' : 'Água Fria'}
                              </span>
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10px] text-[#949BA8]">
                                Ambiente
                              </label>
                              <select
                                value={selWp.roomId}
                                onChange={(e) =>
                                  updateWaterPoint(selWp.id, { roomId: e.target.value })
                                }
                                className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 text-xs text-white"
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
                                <label className="mb-0.5 block text-[10px] text-[#949BA8]">
                                  X (m)
                                </label>
                                <input
                                  type="number"
                                  step="0.05"
                                  value={selWp.x}
                                  onChange={(e) =>
                                    updateWaterPoint(
                                      selWp.id,
                                      { x: round2(Number(e.target.value)) },
                                      true,
                                    )
                                  }
                                  className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 font-mono text-xs text-white"
                                />
                              </div>
                              <div>
                                <label className="mb-0.5 block text-[10px] text-[#949BA8]">
                                  Y (m)
                                </label>
                                <input
                                  type="number"
                                  step="0.05"
                                  value={selWp.y}
                                  onChange={(e) =>
                                    updateWaterPoint(
                                      selWp.id,
                                      { y: round2(Number(e.target.value)) },
                                      true,
                                    )
                                  }
                                  className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 font-mono text-xs text-white"
                                />
                              </div>
                              <div>
                                <label className="mb-0.5 block text-[10px] text-[#949BA8]">
                                  Altura Z (m)
                                </label>
                                <input
                                  type="number"
                                  step="0.05"
                                  value={selWp.z}
                                  onChange={(e) =>
                                    updateWaterPoint(selWp.id, {
                                      z: round2(Number(e.target.value)),
                                    })
                                  }
                                  className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 font-mono text-xs text-white"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="mb-0.5 block text-[10px] text-[#949BA8]">
                                  Diâmetro (mm)
                                </label>
                                <input
                                  type="number"
                                  step="5"
                                  value={selWp.diameterMm}
                                  onChange={(e) =>
                                    updateWaterPoint(selWp.id, {
                                      diameterMm: Number(e.target.value),
                                    })
                                  }
                                  className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 font-mono text-xs text-white"
                                />
                              </div>
                              <div>
                                <label className="mb-0.5 block text-[10px] text-[#949BA8]">
                                  Peso NBR
                                </label>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={selWp.weightHunter}
                                  onChange={(e) =>
                                    updateWaterPoint(selWp.id, {
                                      weightHunter: Number(e.target.value),
                                    })
                                  }
                                  className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 font-mono text-xs text-white"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {unitHyd && (
                      <div className="truncate rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-[10.5px] text-[#949BA8]" title={unitHyd.methodology}>
                        {unitHyd.methodology}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* HYDRAULIC VIEW 2: TABELA PAGINADA */}
              {hydView === 'tabela' && (
                <div className="flex h-full min-h-0 flex-col justify-between overflow-hidden rounded-lg border border-[#2A2F38] bg-[#1B1E24]">
                  <div className="flex shrink-0 items-center justify-between border-b border-[#2A2F38] px-3 py-2">
                    <h2 className="flex items-center gap-1.5 text-xs font-semibold text-white">
                      <Droplets className="h-3.5 w-3.5 text-[#60A5FA]" />
                      Pontos Hidráulicos — {activeUt.code} ({waterPoints.length})
                    </h2>
                    {unitHyd && (
                      <span className="hidden truncate font-mono text-[10.5px] text-[#949BA8] lg:inline max-w-md" title={unitHyd.methodology}>
                        {unitHyd.methodology}
                      </span>
                    )}
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <table className="w-full table-fixed border-collapse text-left text-xs">
                      <thead className="bg-[#181B20] text-[11px] text-[#949BA8]">
                        <tr>
                          <th className="w-[9%] px-2.5 py-2">Código</th>
                          <th className="w-[14%] px-2.5 py-2">Equipamento</th>
                          <th className="w-[15%] px-2.5 py-2">Ambiente</th>
                          <th className="w-[21%] px-2.5 py-2">X / Y / Z (m)</th>
                          <th className="w-[10%] px-2.5 py-2">Tipo</th>
                          <th className="w-[7%] px-2 py-2 text-right">Ø</th>
                          <th className="w-[7%] px-2 py-2 text-right">Peso</th>
                          <th className="w-[12%] px-2.5 py-2">Material</th>
                          <th className="w-[46px] px-2 py-2 text-right">Del</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#252A33]">
                        {pagedWp.slice.map((wp) => {
                          const isSel = selectedWpId === wp.id;
                          return (
                            <tr
                              key={wp.id}
                              onClick={() => setSelectedWpId(wp.id)}
                              className={`cursor-pointer ${
                                isSel ? 'bg-[#2F7CF6]/15' : 'hover:bg-[#22262E]/50'
                              }`}
                            >
                              <td className="truncate px-2.5 py-1.5 font-mono text-[#60A5FA]">
                                {wp.code}
                              </td>
                              <td className="truncate px-2.5 py-1.5 text-white">{wp.equipment}</td>
                              <td className="px-2.5 py-1.5">
                                <select
                                  value={wp.roomId}
                                  aria-label={`Ambiente de ${wp.code}`}
                                  onChange={(e) =>
                                    updateWaterPoint(wp.id, { roomId: e.target.value })
                                  }
                                  className="w-full truncate rounded border border-[#2A2F38] bg-[#14161A] px-1.5 py-0.5 text-xs text-white"
                                >
                                  {activeUt.rooms.map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2.5 py-1.5 font-mono tabular-nums whitespace-nowrap">
                                <input
                                  type="number"
                                  step="0.05"
                                  value={wp.x}
                                  aria-label={`Coordenada X de ${wp.code}`}
                                  onChange={(e) =>
                                    updateWaterPoint(
                                      wp.id,
                                      { x: round2(Number(e.target.value)) },
                                      true,
                                    )
                                  }
                                  className="mr-1 inline-block w-12 rounded border border-[#2A2F38] bg-[#14161A] px-1 py-0.5 text-white"
                                />
                                <input
                                  type="number"
                                  step="0.05"
                                  value={wp.y}
                                  aria-label={`Coordenada Y de ${wp.code}`}
                                  onChange={(e) =>
                                    updateWaterPoint(
                                      wp.id,
                                      { y: round2(Number(e.target.value)) },
                                      true,
                                    )
                                  }
                                  className="mr-1 inline-block w-12 rounded border border-[#2A2F38] bg-[#14161A] px-1 py-0.5 text-white"
                                />
                                <input
                                  type="number"
                                  step="0.05"
                                  value={wp.z}
                                  aria-label={`Altura Z de ${wp.code}`}
                                  onChange={(e) =>
                                    updateWaterPoint(wp.id, {
                                      z: round2(Number(e.target.value)),
                                    })
                                  }
                                  className="inline-block w-12 rounded border border-[#2A2F38] bg-[#14161A] px-1 py-0.5 text-white"
                                />
                              </td>
                              <td className="truncate px-2.5 py-1.5">
                                <span
                                  className={
                                    wp.waterType === 'quente' ? 'text-red-400' : 'text-sky-400'
                                  }
                                >
                                  {wp.waterType === 'quente' ? 'Quente' : 'Fria'}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono">{wp.diameterMm}</td>
                              <td className="px-2 py-1.5 text-right font-mono">
                                {wp.weightHunter}
                              </td>
                              <td className="truncate px-2.5 py-1.5 text-[#C4C9D4]" title={wp.material}>
                                {wp.material}
                              </td>
                              <td className="px-2 py-1.5 text-right">
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
                                              waterPoints: u.waterPoints.filter(
                                                (p) => p.id !== wp.id,
                                              ),
                                            }
                                          : u,
                                      ),
                                    }));
                                  }}
                                  className="p-1 text-red-400 hover:text-red-300"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar
                    page={pagedWp.safePage}
                    totalPages={pagedWp.totalPages}
                    totalItems={waterPoints.length}
                    startIndex={pagedWp.start}
                    endIndex={pagedWp.end}
                    onPageChange={setWpPage}
                    itemLabel="pontos AF/AQ"
                  />
                </div>
              )}

              {/* HYDRAULIC VIEW 3: PARÂMETROS DE RESERVAÇÃO & NOVO PONTO */}
              {hydView === 'parametros' && (
                <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12">
                  <div className="flex flex-col justify-between rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 lg:col-span-6">
                    <div className="space-y-3">
                      <h2 className="text-sm font-semibold text-white">
                        Parâmetros de Reservação &amp; Materiais
                      </h2>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block text-[11px] text-[#949BA8]">
                            Ocupantes / Unid.
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={project.hydraulicConfig.occupantsPerUnit}
                            onChange={(e) =>
                              onUpdateProject((prev) => ({
                                ...prev,
                                hydraulicConfig: {
                                  ...prev.hydraulicConfig,
                                  occupantsPerUnit: Number(e.target.value),
                                },
                              }))
                            }
                            className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-[#949BA8]">
                            Consumo (L/hab·dia)
                          </label>
                          <input
                            type="number"
                            step="10"
                            min={80}
                            value={project.hydraulicConfig.litersPerPersonDay}
                            onChange={(e) =>
                              onUpdateProject((prev) => ({
                                ...prev,
                                hydraulicConfig: {
                                  ...prev.hydraulicConfig,
                                  litersPerPersonDay: Number(e.target.value),
                                },
                              }))
                            }
                            className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-[#949BA8]">
                            Dias de Reserva
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={5}
                            value={project.hydraulicConfig.reserveDays}
                            onChange={(e) =>
                              onUpdateProject((prev) => ({
                                ...prev,
                                hydraulicConfig: {
                                  ...prev.hydraulicConfig,
                                  reserveDays: Number(e.target.value),
                                },
                              }))
                            }
                            className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="mb-1 block text-[11px] text-[#949BA8]">
                            Tubulação Água Fria
                          </label>
                          <input
                            type="text"
                            value={project.hydraulicConfig.coldWaterMaterial}
                            onChange={(e) =>
                              onUpdateProject((prev) => ({
                                ...prev,
                                hydraulicConfig: {
                                  ...prev.hydraulicConfig,
                                  coldWaterMaterial: e.target.value,
                                },
                              }))
                            }
                            className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="mb-1 block text-[11px] text-[#949BA8]">
                            Tubulação Água Quente
                          </label>
                          <input
                            type="text"
                            value={project.hydraulicConfig.hotWaterMaterial}
                            onChange={(e) =>
                              onUpdateProject((prev) => ({
                                ...prev,
                                hydraulicConfig: {
                                  ...prev.hydraulicConfig,
                                  hotWaterMaterial: e.target.value,
                                },
                              }))
                            }
                            className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="rounded border border-[#2A2F38] bg-[#14161A] p-2.5 font-mono text-[11px] text-[#949BA8]">
                      Memória: {hydReport.reservoirMethodology}
                    </div>
                  </div>

                  <div className="flex flex-col justify-between rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 lg:col-span-6">
                    <div className="space-y-3">
                      <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Droplets className="h-4 w-4 text-[#60A5FA]" />
                        Inserir Ponto Hidráulico em {activeUt.code}
                      </h2>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-[11px] text-[#949BA8]">
                            Equipamento / Uso
                          </label>
                          <select
                            value={wCat}
                            onChange={(e) => setWCat(e.target.value as WaterCategory)}
                            className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                          >
                            <option value="pia">Pia</option>
                            <option value="lavatorio">Lavatório</option>
                            <option value="chuveiro">Chuveiro</option>
                            <option value="vaso_sanitario">Vaso Sanitário</option>
                            <option value="maquina_lavar">Máquina de Lavar</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-[#949BA8]">
                            Tipo de Água
                          </label>
                          <select
                            value={wType}
                            onChange={(e) => setWType(e.target.value as 'fria' | 'quente')}
                            className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                          >
                            <option value="fria">Água Fria</option>
                            <option value="quente">Água Quente</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-[#949BA8]">
                            Diâmetro (mm)
                          </label>
                          <input
                            type="number"
                            value={wDiam}
                            onChange={(e) => setWDiam(Number(e.target.value))}
                            className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-[#949BA8]">
                            Altura Z (m)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={wZ}
                            onChange={(e) => setWZ(Number(e.target.value))}
                            className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end border-t border-[#2A2F38] pt-3">
                      <button
                        type="button"
                        onClick={() => {
                          handleAddWaterPoint();
                          setHydView('planta');
                        }}
                        className="inline-flex items-center gap-1.5 rounded bg-[#2F7CF6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2569D6]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar Ponto em {activeUt.code}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SANITÁRIA TAB */}
      {subTab === 'sanitaria' && activeUt && unitDrain && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2A2F38] bg-[#1B1E24] px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-white">
                Rede Sanitária — {activeUt.code} (ΣUHC: {unitDrain.totalUHC} · TQ Ø
                {unitDrain.recommendedStackMm}mm{drRouting ? ` · ${drRouting.totalDrainPipeM}m` : ''})
              </div>
              <div className="truncate font-mono text-[10.5px] text-[#949BA8]" title={unitDrain.methodology}>
                {unitDrain.methodology}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={dCat}
                onChange={(e) => setDCat(e.target.value as DrainageCategory)}
                className="rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 text-xs text-white"
              >
                <option value="pia">Saída Pia</option>
                <option value="lavatorio">Saída Lavatório</option>
                <option value="vaso_sanitario">Vaso Sanitário</option>
                <option value="chuveiro">Ralo Box</option>
                <option value="caixa_sifonada">Caixa Sifonada</option>
                <option value="caixa_gordura">Caixa Gordura</option>
                <option value="tubo_queda">Tubo de Queda</option>
                <option value="ventilacao">Ventilação</option>
              </select>
              <input
                type="number"
                value={dDiam}
                onChange={(e) => setDDiam(Number(e.target.value))}
                className="w-14 rounded border border-[#2A2F38] bg-[#14161A] px-1.5 py-1 font-mono text-xs text-white"
                title="Diâmetro (mm)"
              />
              <input
                type="number"
                step="0.5"
                value={dSlope}
                onChange={(e) => setDSlope(Number(e.target.value))}
                className="w-14 rounded border border-[#2A2F38] bg-[#14161A] px-1.5 py-1 font-mono text-xs text-white"
                title="Declividade (%)"
              />
              <input
                type="number"
                value={dUhc}
                onChange={(e) => setDUhc(Number(e.target.value))}
                className="w-12 rounded border border-[#2A2F38] bg-[#14161A] px-1.5 py-1 font-mono text-xs text-white"
                title="UHC"
              />
              <button
                type="button"
                onClick={handleAddDrainagePoint}
                className="inline-flex items-center gap-1 rounded bg-[#2F7CF6] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#2569D6]"
              >
                <Plus className="h-3.5 w-3.5" /> Inserir
              </button>

              <div className="ml-1 flex rounded border border-[#2A2F38] bg-[#14161A] p-0.5">
                <button
                  type="button"
                  onClick={() => setSanView('planta')}
                  className={`rounded px-2 py-0.5 text-xs ${
                    sanView === 'planta' ? 'bg-[#2F7CF6] text-white' : 'text-[#949BA8] hover:text-white'
                  }`}
                >
                  Planta
                </button>
                <button
                  type="button"
                  onClick={() => setSanView('tabela')}
                  className={`rounded px-2 py-0.5 text-xs ${
                    sanView === 'tabela' ? 'bg-[#2F7CF6] text-white' : 'text-[#949BA8] hover:text-white'
                  }`}
                >
                  Tabela ({drainagePoints.length})
                </button>
              </div>
            </div>
          </div>

          {unitDrain.slopeIssues.length > 0 && (
            <div className="flex shrink-0 items-center gap-1.5 truncate rounded border border-red-500/40 bg-red-950/30 px-3 py-1.5 text-xs text-red-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
              <span className="truncate" title={unitDrain.slopeIssues.join(' | ')}>
                {unitDrain.slopeIssues[0]}
                {unitDrain.slopeIssues.length > 1
                  ? ` (+${unitDrain.slopeIssues.length - 1} alertas)`
                  : ''}
              </span>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            {sanView === 'planta' ? (
              <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12">
                <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#2A2F38] bg-[#111317] p-2.5 lg:col-span-7">
                  <div className="mb-1.5 flex shrink-0 items-center justify-between text-[11px] text-[#949BA8]">
                    <span className="inline-flex items-center gap-1.5 font-medium text-emerald-300">
                      <Move className="h-3.5 w-3.5" />
                      Planta Sanitária Interativa (arraste pontos &amp; ralos)
                    </span>
                    <span>Snap 0,05m</span>
                  </div>
                  <svg
                    ref={drainSvgRef}
                    viewBox={`${-0.35} ${-0.35} ${activeUt.width + 0.7} ${activeUt.depth + 0.7}`}
                    className="min-h-0 h-full w-full flex-1 select-none touch-none"
                    onPointerMove={(e) => {
                      if (!draggingDp) return;
                      const pt = clientToUnitCoords(drainSvgRef.current, e.clientX, e.clientY);
                      const nx = round2(
                        Math.max(
                          0.05,
                          Math.min(activeUt.width - 0.05, snapCoord(pt.x - draggingDp.offsetX)),
                        ),
                      );
                      const ny = round2(
                        Math.max(
                          0.05,
                          Math.min(activeUt.depth - 0.05, snapCoord(pt.y - draggingDp.offsetY)),
                        ),
                      );
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
                        <g
                          key={op.id}
                          transform={`translate(${center.x}, ${center.y}) rotate(${deg})`}
                          pointerEvents="none"
                        >
                          <rect
                            x={-op.width / 2}
                            y={-wall.thickness * 0.58}
                            width={op.width}
                            height={wall.thickness * 1.16}
                            fill="#111317"
                          />
                          <line
                            x1={-op.width / 2}
                            y1={0}
                            x2={op.width / 2}
                            y2={0}
                            stroke={op.type === 'janela' ? '#38BDF8' : '#F59E0B'}
                            strokeWidth={0.03}
                          />
                        </g>
                      );
                    })}
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
                            const pt = clientToUnitCoords(
                              drainSvgRef.current,
                              e.clientX,
                              e.clientY,
                            );
                            setDraggingDp({
                              id: dp.id,
                              offsetX: pt.x - dp.x,
                              offsetY: pt.y - dp.y,
                            });
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

                <div className="flex min-h-0 flex-col justify-between rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-3 text-xs lg:col-span-5">
                  <div className="space-y-2.5">
                    <div className="border-b border-[#2A2F38] pb-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                      Ponto Sanitário Selecionado
                    </div>
                    {(() => {
                      const selDp = activeUt.drainagePoints.find((p) => p.id === selectedDpId);
                      if (!selDp) {
                        return (
                          <p className="rounded border border-dashed border-[#2A2F38] bg-[#14161A] p-3 text-[11px] text-[#949BA8]">
                            Arraste qualquer ponto sanitário ou ralo na planta ao lado (ou selecione na aba Tabela) para reposicionar e atualizar as conexões.
                          </p>
                        );
                      }
                      return (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-semibold text-white">
                              {selDp.code} — {selDp.category.replace(/_/g, ' ')}
                            </span>
                            <span className="font-mono text-[11px] text-emerald-400">
                              Ø{selDp.diameterMm}mm
                            </span>
                          </div>
                          <div>
                            <label className="mb-0.5 block text-[10px] text-[#949BA8]">Ambiente</label>
                            <select
                              value={selDp.roomId}
                              onChange={(e) =>
                                updateDrainagePoint(selDp.id, { roomId: e.target.value })
                              }
                              className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 text-xs text-white"
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
                              <label className="mb-0.5 block text-[10px] text-[#949BA8]">
                                X (m)
                              </label>
                              <input
                                type="number"
                                step="0.05"
                                value={selDp.x}
                                onChange={(e) =>
                                  updateDrainagePoint(
                                    selDp.id,
                                    { x: round2(Number(e.target.value)) },
                                    true,
                                  )
                                }
                                className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 font-mono text-xs text-white"
                              />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10px] text-[#949BA8]">
                                Y (m)
                              </label>
                              <input
                                type="number"
                                step="0.05"
                                value={selDp.y}
                                onChange={(e) =>
                                  updateDrainagePoint(
                                    selDp.id,
                                    { y: round2(Number(e.target.value)) },
                                    true,
                                  )
                                }
                                className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 font-mono text-xs text-white"
                              />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10px] text-[#949BA8]">
                                Decliv. (%)
                              </label>
                              <input
                                type="number"
                                step="0.5"
                                value={selDp.slopePercent}
                                onChange={(e) =>
                                  updateDrainagePoint(selDp.id, {
                                    slopePercent: Number(e.target.value),
                                  })
                                }
                                className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 font-mono text-xs text-white"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="mb-0.5 block text-[10px] text-[#949BA8]">
                              Conectado a
                            </label>
                            <select
                              value={selDp.connectedToId}
                              onChange={(e) =>
                                updateDrainagePoint(selDp.id, { connectedToId: e.target.value })
                              }
                              className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 font-mono text-xs text-white"
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

                  <div className="rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-[10.5px] text-emerald-300">
                    ΣUHC: {unitDrain.totalUHC} · Tubo de Queda Ø{unitDrain.recommendedStackMm}mm
                    {drRouting ? ` · Comprimento total: ${drRouting.totalDrainPipeM} m` : ''}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col justify-between overflow-hidden rounded-lg border border-[#2A2F38] bg-[#1B1E24]">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <table className="w-full table-fixed border-collapse text-left text-xs">
                    <thead className="bg-[#181B20] text-[11px] text-[#949BA8]">
                      <tr>
                        <th className="w-[8%] px-2.5 py-2">Código</th>
                        <th className="w-[15%] px-2.5 py-2">Elemento</th>
                        <th className="w-[16%] px-2.5 py-2">Ambiente</th>
                        <th className="w-[16%] px-2.5 py-2">X / Y (m)</th>
                        <th className="w-[8%] px-2 py-2 text-right">Ø (mm)</th>
                        <th className="w-[11%] px-2 py-2 text-right">Decliv. %</th>
                        <th className="w-[7%] px-2 py-2 text-right">UHC</th>
                        <th className="w-[13%] px-2.5 py-2">Conectado a</th>
                        <th className="w-[46px] px-2 py-2 text-right">Del</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#252A33]">
                      {pagedDp.slice.map((dp) => {
                        const isSel = selectedDpId === dp.id;
                        return (
                          <tr
                            key={dp.id}
                            onClick={() => setSelectedDpId(dp.id)}
                            className={`cursor-pointer ${
                              isSel ? 'bg-emerald-500/15' : 'hover:bg-[#22262E]/50'
                            }`}
                          >
                            <td className="truncate px-2.5 py-1.5 font-mono text-emerald-400">
                              {dp.code}
                            </td>
                            <td className="truncate px-2.5 py-1.5 text-white">
                              {dp.category.replace(/_/g, ' ')}
                            </td>
                            <td className="px-2.5 py-1.5">
                              <select
                                value={dp.roomId}
                                aria-label={`Ambiente de ${dp.code}`}
                                onChange={(e) =>
                                  updateDrainagePoint(dp.id, { roomId: e.target.value })
                                }
                                className="w-full truncate rounded border border-[#2A2F38] bg-[#14161A] px-1.5 py-0.5 text-xs text-white"
                              >
                                {activeUt.rooms.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2.5 py-1.5 font-mono tabular-nums whitespace-nowrap">
                              <input
                                type="number"
                                step="0.05"
                                value={dp.x}
                                aria-label={`Coordenada X de ${dp.code}`}
                                onChange={(e) =>
                                  updateDrainagePoint(
                                    dp.id,
                                    { x: round2(Number(e.target.value)) },
                                    true,
                                  )
                                }
                                className="mr-1 inline-block w-12 rounded border border-[#2A2F38] bg-[#14161A] px-1 py-0.5 text-white"
                              />
                              <input
                                type="number"
                                step="0.05"
                                value={dp.y}
                                aria-label={`Coordenada Y de ${dp.code}`}
                                onChange={(e) =>
                                  updateDrainagePoint(
                                    dp.id,
                                    { y: round2(Number(e.target.value)) },
                                    true,
                                  )
                                }
                                className="inline-block w-12 rounded border border-[#2A2F38] bg-[#14161A] px-1 py-0.5 text-white"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">{dp.diameterMm}</td>
                            <td className="px-2 py-1.5 text-right font-mono">
                              <input
                                type="number"
                                step="0.5"
                                value={dp.slopePercent}
                                onChange={(e) =>
                                  updateDrainagePoint(dp.id, {
                                    slopePercent: Number(e.target.value),
                                  })
                                }
                                className="w-14 rounded border border-[#2A2F38] bg-[#14161A] px-1 py-0.5 text-right font-mono text-white"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">{dp.uhc}</td>
                            <td className="px-2.5 py-1.5 font-mono text-[#C4C9D4]">
                              <select
                                value={dp.connectedToId}
                                onChange={(e) =>
                                  updateDrainagePoint(dp.id, { connectedToId: e.target.value })
                                }
                                className="w-full truncate rounded border border-[#2A2F38] bg-[#14161A] px-1.5 py-0.5 font-mono text-xs text-white"
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
                            <td className="px-2 py-1.5 text-right">
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
                                            drainagePoints: u.drainagePoints.filter(
                                              (p) => p.id !== dp.id,
                                            ),
                                          }
                                        : u,
                                    ),
                                  }));
                                }}
                                className="p-1 text-red-400 hover:text-red-300"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <PaginationBar
                  page={pagedDp.safePage}
                  totalPages={pagedDp.totalPages}
                  totalItems={drainagePoints.length}
                  startIndex={pagedDp.start}
                  endIndex={pagedDp.end}
                  onPageChange={setDpPage}
                  itemLabel="pontos sanitários"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ÁGUAS PLUVIAIS TAB */}
      {subTab === 'pluviais' && (
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
          <div className="shrink-0 space-y-2.5 rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-3">
            <h2 className="flex items-center gap-2 text-xs font-semibold text-white">
              <CloudRain className="h-4 w-4 text-[#60A5FA]" />
              Parâmetros Pluviométricos (ABNT NBR 10844)
            </h2>

            {rainReport.status === 'pendente_dados_pluviometricos' && (
              <div className="flex items-center gap-2 rounded border border-amber-500/40 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span className="truncate">{rainReport.methodology}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-[11px] text-[#949BA8]">Localidade / Município</label>
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
                  className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[#949BA8]">Intensidade I (mm/h)</label>
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
                  className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[#949BA8]">
                  Período Retorno (anos)
                </label>
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
                  className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[#949BA8]">
                  Fonte Normativa / Estação
                </label>
                <input
                  type="text"
                  value={project.rainwaterConfig.sourceReference}
                  placeholder="Ex.: NBR 10844 / DAEE"
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      rainwaterConfig: {
                        ...prev.rainwaterConfig,
                        sourceReference: e.target.value,
                      },
                    }))
                  }
                  className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            {rainReport.flowLMin !== null && (
              <div className="truncate rounded border border-emerald-500/40 bg-emerald-950/20 px-3 py-1.5 font-mono text-xs text-emerald-200">
                Vazão Pluvial Calculada: {rainReport.flowLMin} L/min — {rainReport.methodology}
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden rounded-lg border border-[#2A2F38] bg-[#1B1E24]">
            <div className="min-h-0 flex-1 overflow-hidden">
              <table className="w-full table-fixed border-collapse text-left text-xs">
                <thead className="bg-[#181B20] text-[11px] text-[#949BA8]">
                  <tr>
                    <th className="w-[12%] px-3 py-2">Código</th>
                    <th className="w-[16%] px-3 py-2">Tipo</th>
                    <th className="w-[40%] px-3 py-2">Descrição</th>
                    <th className="w-[16%] px-3 py-2 text-right">Área Contrib. (m²)</th>
                    <th className="w-[16%] px-3 py-2">Seção / Diâmetro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#252A33]">
                  {pagedRw.slice.map((rw) => (
                    <tr key={rw.id} className="hover:bg-[#22262E]/50">
                      <td className="truncate px-3 py-2 font-mono text-[#60A5FA]">{rw.code}</td>
                      <td className="truncate px-3 py-2">{rw.type}</td>
                      <td className="truncate px-3 py-2 text-white" title={rw.description}>
                        {rw.description}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{rw.catchmentAreaM2}</td>
                      <td className="truncate px-3 py-2 font-mono">{rw.diameterOrSection}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={pagedRw.safePage}
              totalPages={pagedRw.totalPages}
              totalItems={project.rainwaterElements.length}
              startIndex={pagedRw.start}
              endIndex={pagedRw.end}
              onPageChange={setRwPage}
              itemLabel="elementos pluviais"
            />
          </div>
        </div>
      )}
    </div>
  );
};
