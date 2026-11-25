import React, { useRef, useState } from 'react';
import { AlertTriangle, LayoutGrid, List, Move, Plus, SlidersHorizontal, Trash2, Zap } from 'lucide-react';
import { calculateElectricalSizing } from '../engine/engineering';
import { getOpeningWorldPosition, getWallAngleRad, round2 } from '../engine/geometry';
import { computeElectricalRouting, getQdcPosition } from '../engine/mepRouting';
import { nextId } from '../engine/parametricGenerator';
import { ElectricalSymbolSvg, FurnitureCadBlock } from './CadArchitecturalSymbols';
import { PaginationBar, paginateItems, useViewportPageSize } from './PaginationBar';
import type { ElectricalCategory, ElectricalPoint, Project, UnitType } from '../types/project';

interface MepElectricalModuleProps {
  project: Project;
  selectedUnitTypeId: string;
  onSelectUnitType: (id: string) => void;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
}

function findRoomIdAtPoint(
  ut: UnitType,
  x: number,
  y: number,
  preferMezzanine: boolean,
  fallbackId: string,
): string {
  if (preferMezzanine) {
    const mez = ut.rooms.find((r) => r.category === 'mezanino');
    if (mez) return mez.id;
  }
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

const CATEGORIES: Array<{
  value: ElectricalCategory;
  label: string;
  defPower: number;
  defZKey: keyof Project['electricalHeights'];
}> = [
  { value: 'quadro_luz', label: 'Quadro de Distribuição (QDC)', defPower: 0, defZKey: 'interruptor' },
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
  const [subTab, setSubTab] = useState<'planta' | 'inserir' | 'tabela' | 'quadro'>('planta');
  const [pointsPage, setPointsPage] = useState(0);
  const [circuitsPage, setCircuitsPage] = useState(0);

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

  // Interactive 2D plan state (synced with Editor CAD 2D)
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedEpId, setSelectedEpId] = useState<string | null>(null);
  const [floorFilter, setFloorFilter] = useState<'todos' | 'terreo' | 'mezanino'>('todos');
  const [draggingEp, setDraggingEp] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
    isMezzanine: boolean;
  } | null>(null);

  const hasMezzanine = Boolean(
    activeUt?.hasMezzanine && activeUt?.mezzanine?.enabled && (activeUt?.ceilingHeight ?? 0) >= 3.0,
  );
  const elRouting = activeUt ? computeElectricalRouting(activeUt) : null;

  const pointsPerPage = useViewportPageSize(340, 42, 4, 14);
  const circuitsPerPage = useViewportPageSize(360, 48, 3, 10);
  const pointsList = activeUt?.electricalPoints ?? [];
  const circuitsList = unitReport?.circuits ?? [];
  const pagedPoints = paginateItems(pointsList, pointsPage, pointsPerPage);
  const pagedCircuits = paginateItems(circuitsList, circuitsPage, circuitsPerPage);

  const handleOptimizeSimpleUnit = (keepAc: boolean) => {
    if (!activeUt) return;
    const qdcPos = getQdcPosition(activeUt);
    const living =
      activeUt.rooms.find((r) => r.category !== 'banheiro' && r.category !== 'mezanino') ??
      activeUt.rooms[0];
    onUpdateProject(
      (prev) => ({
        ...prev,
        unitTypes: prev.unitTypes.map((u) => {
          if (u.id !== activeUt.id) return u;
          const hasQdc = u.electricalPoints.some(
            (ep) => ep.category === 'quadro_luz' || ep.code.toUpperCase().startsWith('QDC'),
          );
          const filtered = u.electricalPoints.filter((ep) => {
            if (
              ep.category === 'antena_tv' ||
              ep.category === 'wifi_ap' ||
              ep.category === 'cftv' ||
              ep.category === 'interfone' ||
              ep.category === 'tv'
            ) {
              return false;
            }
            if (!keepAc && ep.category === 'ar_condicionado') return false;
            return true;
          });
          const remapped: ElectricalPoint[] = filtered.map((ep) => {
            if (ep.category === 'quadro_luz' || ep.code.toUpperCase().startsWith('QDC')) {
              return { ...ep, category: 'quadro_luz', circuitId: 'GERAL', powerVA: 0 };
            }
            if (
              ep.category === 'iluminacao_teto' ||
              ep.category === 'arandela' ||
              ep.category === 'interruptor'
            ) {
              return { ...ep, circuitId: 'C1-ILUM' };
            }
            if (ep.category === 'chuveiro') {
              return { ...ep, circuitId: 'C4-CHUV' };
            }
            if (ep.category === 'ar_condicionado') {
              return { ...ep, circuitId: 'C5-AC' };
            }
            if (ep.category === 'dados' || ep.category === 'rack_ti') {
              return {
                ...ep,
                code: ep.code === 'RJ45-01' ? 'NET-01' : ep.code,
                label: 'Ponto Fibra / Internet Unidade',
                circuitId: 'C-TEL',
              };
            }
            const isKitchenOrLaundry =
              ep.roomId.includes('-rm-coz') ||
              ep.roomId.includes('-rm-lav') ||
              ep.category === 'cooktop' ||
              ep.category === 'geladeira' ||
              ep.category === 'maquina_lavar' ||
              ep.category === 'microondas' ||
              ep.category === 'forno' ||
              ep.code.includes('COZ') ||
              ep.code.includes('MAQ') ||
              ep.code.includes('GEL') ||
              ep.code.includes('COOK');
            return {
              ...ep,
              circuitId: isKitchenOrLaundry ? 'C3-COZ' : 'C2-TUG',
              voltage: ep.category === 'cooktop' ? 127 : ep.voltage,
            };
          });
          if (!hasQdc) {
            remapped.unshift({
              id: nextId('el'),
              code: 'QDC-01',
              category: 'quadro_luz',
              label: 'Quadro de Distribuição (QDC)',
              roomId: living?.id ?? '',
              x: qdcPos.x,
              y: qdcPos.y,
              z: 1.5,
              referenceWall: 'P-INT-BWC2',
              referenceDistance: qdcPos.x,
              powerVA: 0,
              voltage: 220,
              powerFactor: 1,
              circuitId: 'GERAL',
              conductorSectionMm2: 10,
              conduitDiameterMm: 25,
              protection: 'Disjuntor Geral Bipolar + IDR 30mA + DPS',
              notes: 'Parede seca externa ao BWC (menor trajeto)',
            });
          }
          return { ...u, mepProfile: 'simples', electricalPoints: remapped };
        }),
      }),
      `Otimização elétrica Kitnet Simples em ${activeUt.code}`,
    );
  };

  const clientToUnitCoords = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const world = pt.matrixTransform(ctm.inverse());
    return { x: world.x, y: world.y };
  };

  const snapCoord = (v: number) => Math.round(v / 0.05) * 0.05;

  const updateElectricalPoint = (
    pointId: string,
    patch: Partial<ElectricalPoint>,
    autoDetectRoom = false,
  ) => {
    if (!activeUt) return;
    onUpdateProject((prev) => ({
      ...prev,
      unitTypes: prev.unitTypes.map((u) => {
        if (u.id !== activeUt.id) return u;
        return {
          ...u,
          electricalPoints: u.electricalPoints.map((p) => {
            if (p.id !== pointId) return p;
            const nextPt = { ...p, ...patch };
            if (autoDetectRoom) {
              const isMez = p.roomId.endsWith('-rm-mez') || p.code.includes('MEZ');
              nextPt.roomId = findRoomIdAtPoint(u, nextPt.x, nextPt.y, isMez, p.roomId);
            }
            return nextPt;
          }),
        };
      }),
    }));
  };

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
    setSelectedEpId(newPt.id);
    setSubTab('planta');
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col gap-2 overflow-hidden bg-[#14161A] p-3 text-slate-100">
      {/* Compact Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#2A2F38] pb-2">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-white">
            Instalações Elétricas — Pontos X/Y/Z, Circuitos &amp; Quadro de Cargas
          </h1>
          <p className="truncate text-[11px] text-[#949BA8]">
            NBR 5410 · {report.diversityNote}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {activeUt && elRouting && (
            <>
              <span className="hidden rounded border border-[#2A2F38] bg-[#1B1E24] px-2 py-1 font-mono text-[10.5px] text-amber-300 xl:inline">
                {elRouting.qdcPoint.existsInModel
                  ? `QDC (${elRouting.qdcPoint.x.toFixed(2)}, ${elRouting.qdcPoint.y.toFixed(2)})`
                  : 'Sem QDC'}{' '}
                · {elRouting.totalConduitM} m
              </span>
              <button
                type="button"
                onClick={() => handleOptimizeSimpleUnit(false)}
                className="rounded border border-emerald-500/40 bg-emerald-600/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-600/35 whitespace-nowrap"
              >
                Simplificar p/ Kitnet (4 Circ. + QDC)
              </button>
            </>
          )}
          <select
            value={activeUt?.id ?? ''}
            onChange={(e) => {
              onSelectUnitType(e.target.value);
              setPointsPage(0);
              setCircuitsPage(0);
              setSelectedEpId(null);
            }}
            aria-label="Selecionar tipologia elétrica"
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

      {/* Compact KPI Row + Sub-tab Strip */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded border border-[#2A2F38] bg-[#1B1E24] px-3 py-1.5">
            <div className="text-[10px] text-[#949BA8]">Unidades</div>
            <div className="font-mono text-sm font-semibold tabular-nums text-white">
              {report.totalUnits} unid.
            </div>
          </div>
          <div className="rounded border border-[#2A2F38] bg-[#1B1E24] px-3 py-1.5">
            <div className="text-[10px] text-[#949BA8]">Potência Instalada</div>
            <div className="font-mono text-sm font-semibold tabular-nums text-amber-400">
              {report.totalInstalledKVA} kVA
            </div>
          </div>
          <div className="rounded border border-[#2A2F38] bg-[#1B1E24] px-3 py-1.5">
            <div className="text-[10px] text-[#949BA8]">Demanda Coletiva</div>
            <div className="font-mono text-sm font-semibold tabular-nums text-[#60A5FA]">
              {report.totalDemandKVA} kVA
            </div>
          </div>
          <div className="rounded border border-[#2A2F38] bg-[#1B1E24] px-3 py-1.5">
            <div className="text-[10px] text-[#949BA8]">Demanda ({activeUt?.code || '—'})</div>
            <div className="font-mono text-sm font-semibold tabular-nums text-emerald-400">
              {unitReport?.demandPowerVA ?? 0} VA
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded border border-[#2A2F38] bg-[#1B1E24] p-0.5">
          {(
            [
              ['planta', 'Planta & Pontos', Move],
              ['inserir', 'Inserir & Alturas Z', SlidersHorizontal],
              ['tabela', `Tabela (${pointsList.length})`, List],
              ['quadro', `Quadro & Unifilar (${circuitsList.length})`, LayoutGrid],
            ] as const
          ).map(([id, lbl, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition ${
                subTab === id ? 'bg-[#2F7CF6] text-white' : 'text-[#949BA8] hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Empty typology prompt */}
      {!activeUt ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-[#323844] bg-[#1B1E24] p-6 text-center text-xs text-[#949BA8]">
          Nenhuma tipologia criada ainda. Cadastre uma tipologia na etapa &quot;Planta 2D &amp; Tipologias&quot; para lançar pontos e circuitos elétricos.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          {/* SUB-TAB 1: PLANTA INTERATIVA & INSPETOR */}
          {subTab === 'planta' && (
            <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12">
              <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#2A2F38] bg-[#111317] p-2.5 lg:col-span-7">
                <div className="mb-1.5 flex shrink-0 flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1.5 font-medium text-amber-300">
                    <Move className="h-3.5 w-3.5" />
                    Planta Elétrica Interativa — {activeUt.code} (arraste os pontos · Snap 0,05m)
                  </span>
                  {hasMezzanine && (
                    <div className="flex items-center gap-1 rounded border border-[#2A2F38] bg-[#14161A] p-0.5">
                      {(
                        [
                          ['todos', 'Térreo + Mez.'],
                          ['terreo', 'Térreo'],
                          ['mezanino', 'Mezanino'],
                        ] as const
                      ).map(([k, lbl]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setFloorFilter(k)}
                          className={`rounded px-2 py-0.5 text-[10.5px] ${
                            floorFilter === k
                              ? 'bg-[#2F7CF6] text-white'
                              : 'text-[#949BA8] hover:text-white'
                          }`}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <svg
                  ref={svgRef}
                  viewBox={`${-0.35} ${-0.35} ${activeUt.width + 0.7} ${activeUt.depth + 0.7}`}
                  className="min-h-0 h-full w-full flex-1 select-none touch-none"
                  onPointerMove={(e) => {
                    if (!draggingEp) return;
                    const pt = clientToUnitCoords(e.clientX, e.clientY);
                    const nx = round2(
                      Math.max(0.05, Math.min(activeUt.width - 0.05, snapCoord(pt.x - draggingEp.offsetX))),
                    );
                    const ny = round2(
                      Math.max(0.05, Math.min(activeUt.depth - 0.05, snapCoord(pt.y - draggingEp.offsetY))),
                    );
                    updateElectricalPoint(draggingEp.id, { x: nx, y: ny }, true);
                  }}
                  onPointerUp={() => setDraggingEp(null)}
                  onPointerLeave={() => setDraggingEp(null)}
                >
                  {activeUt.rooms.map((rm) => {
                    const isMez = rm.category === 'mezanino';
                    if (floorFilter === 'terreo' && isMez) return null;
                    if (floorFilter === 'mezanino' && !isMez) return null;
                    return (
                      <g key={rm.id}>
                        <rect
                          x={rm.x}
                          y={rm.y}
                          width={rm.width}
                          height={rm.depth}
                          fill={isMez ? 'rgba(56, 189, 248, 0.08)' : '#171A21'}
                          stroke={isMez ? '#38BDF8' : '#262B35'}
                          strokeWidth={0.02}
                          strokeDasharray={isMez ? '0.08 0.05' : undefined}
                        />
                        <text
                          x={rm.x + rm.width / 2}
                          y={rm.y + rm.depth / 2}
                          textAnchor="middle"
                          fill={isMez ? '#7DD3FC' : '#4B5563'}
                          fontSize="0.18"
                          fontWeight="bold"
                        >
                          {rm.code}
                        </text>
                      </g>
                    );
                  })}

                  {activeUt.furniture
                    .filter((f) => f.category !== 'luminaria')
                    .map((fur) => {
                      const isMezFur = (fur.elevationM ?? 0) >= 0.8;
                      if (floorFilter === 'terreo' && isMezFur) return null;
                      if (floorFilter === 'mezanino' && !isMezFur) return null;
                      return (
                        <g key={fur.id} opacity={0.35} pointerEvents="none">
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
                      );
                    })}

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
                      opacity={floorFilter === 'mezanino' && !w.isExternal ? 0.35 : 0.9}
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

                  {elRouting &&
                    elRouting.segments.map((seg) => {
                      const isSpecial = seg.kind === 'special';
                      const pts = seg.elbow
                        ? `${seg.from.x},${seg.from.y} ${seg.elbow.x},${seg.elbow.y} ${seg.to.x},${seg.to.y}`
                        : `${seg.from.x},${seg.from.y} ${seg.to.x},${seg.to.y}`;
                      return (
                        <polyline
                          key={`el-rt-${seg.id}`}
                          points={pts}
                          fill="none"
                          stroke={isSpecial ? '#A855F7' : '#F59E0B'}
                          strokeOpacity={0.45}
                          strokeWidth={0.02}
                          strokeDasharray="0.06 0.04"
                          pointerEvents="none"
                        />
                      );
                    })}

                  {activeUt.electricalPoints.map((ep) => {
                    const isMezEp = ep.roomId.endsWith('-rm-mez') || ep.code.includes('MEZ');
                    if (floorFilter === 'terreo' && isMezEp) return null;
                    if (floorFilter === 'mezanino' && !isMezEp) return null;
                    const isQdc = ep.category === 'quadro_luz' || ep.code.toUpperCase().startsWith('QDC');
                    const isSpec = [
                      'dados',
                      'tv',
                      'antena_tv',
                      'wifi_ap',
                      'cftv',
                      'rack_ti',
                      'interfone',
                    ].includes(ep.category);
                    const isSel = selectedEpId === ep.id;
                    const col = isSel
                      ? '#FFFFFF'
                      : isQdc
                        ? '#FACC15'
                        : isMezEp
                          ? '#22D3EE'
                          : isSpec
                            ? '#C084FC'
                            : '#F59E0B';
                    return (
                      <g
                        key={ep.id}
                        transform={`translate(${ep.x}, ${ep.y})`}
                        className="cursor-move"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelectedEpId(ep.id);
                          const pt = clientToUnitCoords(e.clientX, e.clientY);
                          setDraggingEp({
                            id: ep.id,
                            offsetX: pt.x - ep.x,
                            offsetY: pt.y - ep.y,
                            isMezzanine: isMezEp,
                          });
                        }}
                      >
                        <circle
                          r={isSel ? 0.17 : 0.14}
                          fill={isSel ? 'rgba(245,158,11,0.28)' : 'transparent'}
                          stroke={isSel ? '#60A5FA' : 'transparent'}
                          strokeWidth={0.025}
                        />
                        <ElectricalSymbolSvg
                          category={ep.category}
                          cx={0}
                          cy={0}
                          r={0.09}
                          color={col}
                          bg="#111317"
                        />
                        <text
                          x={0.12}
                          y={0.04}
                          fill={col}
                          fontSize="0.11"
                          fontWeight={isSel ? 'bold' : undefined}
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {ep.code}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Right Selected Point Inspector */}
              <div className="flex min-h-0 flex-col justify-between gap-2 overflow-hidden lg:col-span-5">
                <div className="flex min-h-0 flex-1 flex-col justify-between rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-3.5 text-xs">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-[#2A2F38] pb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                        Inspetor de Ponto Elétrico
                      </span>
                      <button
                        type="button"
                        onClick={() => setSubTab('inserir')}
                        className="inline-flex items-center gap-1 rounded bg-[#2F7CF6] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#2569D6]"
                      >
                        <Plus className="h-3 w-3" /> Novo Ponto
                      </button>
                    </div>

                    {(() => {
                      const selEp = activeUt.electricalPoints.find((p) => p.id === selectedEpId);
                      if (!selEp) {
                        return (
                          <div className="space-y-2 rounded border border-dashed border-[#2A2F38] bg-[#14161A] p-4 text-[11px] text-[#949BA8]">
                            <p>
                              Clique ou arraste qualquer símbolo elétrico na planta ao lado (ou selecione na aba Tabela) para editar coordenadas X/Y/Z, ambiente, potência e circuito.
                            </p>
                            <div className="font-mono text-[10.5px] text-slate-300">
                              Total na tipologia: {activeUt.electricalPoints.length} pontos ·{' '}
                              {circuitsList.length} circuitos
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="truncate font-mono font-semibold text-white">
                              {selEp.code} — {selEp.label}
                            </span>
                            <span className="shrink-0 font-mono text-[11px] text-[#60A5FA]">
                              {selEp.circuitId}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="mb-0.5 block text-[10px] text-[#949BA8]">Categoria</label>
                              <select
                                value={selEp.category}
                                onChange={(e) =>
                                  updateElectricalPoint(selEp.id, {
                                    category: e.target.value as ElectricalCategory,
                                  })
                                }
                                className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 text-xs text-white"
                              >
                                {CATEGORIES.map((c) => (
                                  <option key={c.value} value={c.value}>
                                    {c.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10px] text-[#949BA8]">Ambiente</label>
                              <select
                                value={selEp.roomId}
                                onChange={(e) =>
                                  updateElectricalPoint(selEp.id, { roomId: e.target.value })
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
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="mb-0.5 block text-[10px] text-[#949BA8]">X (m)</label>
                              <input
                                type="number"
                                step="0.05"
                                value={selEp.x}
                                onChange={(e) =>
                                  updateElectricalPoint(
                                    selEp.id,
                                    { x: round2(Number(e.target.value)) },
                                    true,
                                  )
                                }
                                className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 font-mono text-xs text-white"
                              />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10px] text-[#949BA8]">Y (m)</label>
                              <input
                                type="number"
                                step="0.05"
                                value={selEp.y}
                                onChange={(e) =>
                                  updateElectricalPoint(
                                    selEp.id,
                                    { y: round2(Number(e.target.value)) },
                                    true,
                                  )
                                }
                                className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 font-mono text-xs text-white"
                              />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10px] text-[#949BA8]">Altura Z (m)</label>
                              <input
                                type="number"
                                step="0.05"
                                value={selEp.z}
                                onChange={(e) =>
                                  updateElectricalPoint(selEp.id, {
                                    z: round2(Number(e.target.value)),
                                  })
                                }
                                className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 font-mono text-xs text-white"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="mb-0.5 block text-[10px] text-[#949BA8]">Potência (VA)</label>
                              <input
                                type="number"
                                step="50"
                                min={0}
                                value={selEp.powerVA}
                                onChange={(e) =>
                                  updateElectricalPoint(selEp.id, {
                                    powerVA: Number(e.target.value),
                                  })
                                }
                                className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 font-mono text-xs text-white"
                              />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10px] text-[#949BA8]">Circuito</label>
                              <input
                                type="text"
                                value={selEp.circuitId}
                                onChange={(e) =>
                                  updateElectricalPoint(selEp.id, { circuitId: e.target.value })
                                }
                                className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 font-mono text-xs text-white"
                              />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10px] text-[#949BA8]">Tensão</label>
                              <select
                                value={selEp.voltage}
                                onChange={(e) =>
                                  updateElectricalPoint(selEp.id, {
                                    voltage: Number(e.target.value) as 127 | 220,
                                  })
                                }
                                className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 font-mono text-xs text-white"
                              >
                                <option value={127}>127V</option>
                                <option value={220}>220V</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateProject((prev) => ({
                                  ...prev,
                                  unitTypes: prev.unitTypes.map((u) =>
                                    u.id === activeUt.id
                                      ? {
                                          ...u,
                                          electricalPoints: u.electricalPoints.filter(
                                            (p) => p.id !== selEp.id,
                                          ),
                                        }
                                      : u,
                                  ),
                                }));
                                setSelectedEpId(null);
                              }}
                              className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-950/40 px-2.5 py-1 text-[11px] text-red-300 hover:bg-red-900/50"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Remover Ponto
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="flex flex-wrap gap-3 border-t border-[#2A2F38] pt-2 text-[11px] text-[#949BA8]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Energia (TUG/TUE/Ilum.)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-purple-400" /> Telecom / CFTV / Wi-Fi
                    </span>
                    {hasMezzanine && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" /> Mezanino
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SUB-TAB 2: INSERIR PONTO & ALTURAS PADRÃO Z */}
          {subTab === 'inserir' && (
            <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12">
              <div className="flex flex-col justify-between rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 lg:col-span-5">
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-white">
                    Alturas-Padrão Editáveis (Z em metros)
                  </h2>
                  <p className="text-[11px] text-[#949BA8]">
                    Valores aplicados automaticamente ao cadastrar novos pontos elétricos ou gerar novas unidades.
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {(
                      [
                        ['tomadaBaixa', 'Tomada Baixa (m)'],
                        ['tomadaMedia', 'Tomada Média (m)'],
                        ['tomadaAlta', 'Tomada Alta (m)'],
                        ['interruptor', 'Interruptor (m)'],
                        ['arCondicionado', 'Ar-Condicionado (m)'],
                        ['chuveiro', 'Chuveiro (m)'],
                        ['iluminacaoTeto', 'Iluminação Teto (m)'],
                      ] as const
                    ).map(([key, lbl]) => (
                      <div key={key}>
                        <label className="mb-1 block text-[11px] text-[#949BA8]">{lbl}</label>
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
                          className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                {elRouting && (
                  <div className="rounded border border-[#2A2F38] bg-[#14161A] px-3 py-2 font-mono text-[11px] text-amber-300">
                    {elRouting.qdcPoint.existsInModel
                      ? `QDC localizado em (${elRouting.qdcPoint.x.toFixed(2)}, ${elRouting.qdcPoint.y.toFixed(2)})`
                      : 'Sem QDC cadastrado na planta'}{' '}
                    · Eletrodutos otimizados: {elRouting.totalConduitM} m
                  </div>
                )}
              </div>

              <form
                onSubmit={handleAddPoint}
                className="flex flex-col justify-between rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 lg:col-span-7"
              >
                <div className="space-y-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Zap className="h-4 w-4 text-amber-400" />
                    Inserir Novo Ponto Elétrico em {activeUt.code}
                  </h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] text-[#949BA8]">Categoria</label>
                      <select
                        value={cat}
                        onChange={(e) => handleCategoryChange(e.target.value as ElectricalCategory)}
                        className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-[#949BA8]">Ambiente</label>
                      <select
                        value={roomId || activeUt.rooms[0]?.id || ''}
                        onChange={(e) => setRoomId(e.target.value)}
                        className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                      >
                        {activeUt.rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] text-[#949BA8]">Descrição</label>
                      <input
                        type="text"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-[#949BA8]">Circuito</label>
                      <input
                        type="text"
                        value={circuitId}
                        onChange={(e) => setCircuitId(e.target.value)}
                        className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-[#949BA8]">Potência (VA)</label>
                      <input
                        type="number"
                        step="50"
                        min={0}
                        value={powerVA}
                        onChange={(e) => setPowerVA(Number(e.target.value))}
                        className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-[#949BA8]">Tensão</label>
                      <select
                        value={voltage}
                        onChange={(e) => setVoltage(Number(e.target.value) as 127 | 220)}
                        className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                      >
                        <option value={127}>127V</option>
                        <option value={220}>220V</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-[#949BA8]">Cabo (mm²)</label>
                      <select
                        value={conductor}
                        onChange={(e) => setConductor(Number(e.target.value))}
                        className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                      >
                        <option value={1.5}>1.5 mm²</option>
                        <option value={2.5}>2.5 mm²</option>
                        <option value={4}>4.0 mm²</option>
                        <option value={6}>6.0 mm²</option>
                        <option value={10}>10.0 mm²</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-[#949BA8]">Coordenada X (m)</label>
                      <input
                        type="number"
                        step="0.05"
                        value={x}
                        onChange={(e) => setX(Number(e.target.value))}
                        className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-[#949BA8]">Coordenada Y (m)</label>
                      <input
                        type="number"
                        step="0.05"
                        value={y}
                        onChange={(e) => setY(Number(e.target.value))}
                        className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-[#949BA8]">Altura Z (m)</label>
                      <input
                        type="number"
                        step="0.05"
                        value={z}
                        onChange={(e) => setZ(Number(e.target.value))}
                        className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end border-t border-[#2A2F38] pt-3">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded bg-[#2F7CF6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2569D6]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Inserir Ponto em {activeUt.code}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* SUB-TAB 3: TABELA DE PONTOS PAGINADA */}
          {subTab === 'tabela' && (
            <div className="flex h-full min-h-0 flex-col justify-between overflow-hidden rounded-lg border border-[#2A2F38] bg-[#1B1E24]">
              <div className="flex shrink-0 items-center justify-between border-b border-[#2A2F38] px-3 py-2">
                <h2 className="text-xs font-semibold text-white">
                  Pontos Elétricos Cadastrados — {activeUt.code} ({pointsList.length})
                </h2>
                <button
                  type="button"
                  onClick={() => setSubTab('inserir')}
                  className="inline-flex items-center gap-1 rounded bg-[#2F7CF6] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#2569D6]"
                >
                  <Plus className="h-3 w-3" /> Novo Ponto
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <table className="w-full table-fixed border-collapse text-left text-xs">
                  <thead className="bg-[#181B20] text-[11px] text-[#949BA8]">
                    <tr>
                      <th className="w-[8%] px-2.5 py-2">Cód.</th>
                      <th className="w-[20%] px-2.5 py-2">Descrição</th>
                      <th className="w-[15%] px-2.5 py-2">Ambiente</th>
                      <th className="w-[21%] px-2.5 py-2">X / Y / Z (m)</th>
                      <th className="w-[8%] px-2.5 py-2 text-right">VA</th>
                      <th className="w-[7%] px-2.5 py-2">Tensão</th>
                      <th className="w-[9%] px-2.5 py-2">Circuito</th>
                      <th className="w-[7%] px-2.5 py-2 text-right">Cabo</th>
                      <th className="w-[46px] px-2 py-2 text-right">Del</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#252A33]">
                    {pagedPoints.slice.map((ep) => {
                      const isSel = selectedEpId === ep.id;
                      return (
                        <tr
                          key={ep.id}
                          onClick={() => setSelectedEpId(ep.id)}
                          className={`cursor-pointer ${
                            isSel ? 'bg-[#2F7CF6]/15' : 'hover:bg-[#22262E]/50'
                          }`}
                        >
                          <td className="truncate px-2.5 py-1.5 font-mono text-amber-400">{ep.code}</td>
                          <td className="truncate px-2.5 py-1.5 text-white" title={ep.label}>
                            {ep.label}
                          </td>
                          <td className="px-2.5 py-1.5 text-[#C4C9D4]">
                            <select
                              value={ep.roomId}
                              aria-label={`Ambiente de ${ep.code}`}
                              onChange={(e) =>
                                updateElectricalPoint(ep.id, { roomId: e.target.value })
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
                          <td className="px-2.5 py-1.5 font-mono tabular-nums text-[#C4C9D4] whitespace-nowrap">
                            <input
                              type="number"
                              step="0.05"
                              value={ep.x}
                              aria-label={`Coordenada X de ${ep.code}`}
                              onChange={(e) =>
                                updateElectricalPoint(
                                  ep.id,
                                  { x: round2(Number(e.target.value)) },
                                  true,
                                )
                              }
                              className="mr-1 inline-block w-12 rounded border border-[#2A2F38] bg-[#14161A] px-1 py-0.5 text-white"
                            />
                            <input
                              type="number"
                              step="0.05"
                              value={ep.y}
                              aria-label={`Coordenada Y de ${ep.code}`}
                              onChange={(e) =>
                                updateElectricalPoint(
                                  ep.id,
                                  { y: round2(Number(e.target.value)) },
                                  true,
                                )
                              }
                              className="mr-1 inline-block w-12 rounded border border-[#2A2F38] bg-[#14161A] px-1 py-0.5 text-white"
                            />
                            <input
                              type="number"
                              step="0.05"
                              value={ep.z}
                              aria-label={`Altura Z de ${ep.code}`}
                              onChange={(e) =>
                                updateElectricalPoint(ep.id, {
                                  z: round2(Number(e.target.value)),
                                })
                              }
                              className="inline-block w-12 rounded border border-[#2A2F38] bg-[#14161A] px-1 py-0.5 text-white"
                            />
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">
                            {ep.powerVA}
                          </td>
                          <td className="px-2.5 py-1.5 font-mono">{ep.voltage}V</td>
                          <td className="truncate px-2.5 py-1.5 font-mono text-[#60A5FA]">
                            {ep.circuitId}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono">
                            {ep.conductorSectionMm2}mm²
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
                                          electricalPoints: u.electricalPoints.filter(
                                            (p) => p.id !== ep.id,
                                          ),
                                        }
                                      : u,
                                  ),
                                }));
                              }}
                              aria-label={`Remover ponto ${ep.code}`}
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
                page={pagedPoints.safePage}
                totalPages={pagedPoints.totalPages}
                totalItems={pointsList.length}
                startIndex={pagedPoints.start}
                endIndex={pagedPoints.end}
                onPageChange={setPointsPage}
                itemLabel="pontos"
              />
            </div>
          )}

          {/* SUB-TAB 4: QUADRO DE CARGAS & DIAGRAMA UNIFILAR */}
          {subTab === 'quadro' && unitReport && (
            <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12">
              <div className="flex min-h-0 flex-col justify-between overflow-hidden rounded-lg border border-[#2A2F38] bg-[#1B1E24] lg:col-span-8">
                <div className="shrink-0 border-b border-[#2A2F38] px-3 py-2">
                  <h2 className="text-xs font-semibold text-white">
                    Quadro de Cargas e Circuitos — {activeUt.code} ({circuitsList.length})
                  </h2>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                  <table className="w-full table-fixed border-collapse text-left text-xs">
                    <thead className="bg-[#181B20] text-[11px] text-[#949BA8]">
                      <tr>
                        <th className="w-[34%] px-3 py-2">Circuito / Metodologia</th>
                        <th className="w-[9%] px-2 py-2">Tensão</th>
                        <th className="w-[11%] px-2 py-2 text-right">Pot. (VA)</th>
                        <th className="w-[11%] px-2 py-2 text-right">Corr. (A)</th>
                        <th className="w-[11%] px-2 py-2 text-right">Disj. (A)</th>
                        <th className="w-[12%] px-2 py-2 text-right">Cabo</th>
                        <th className="w-[12%] px-3 py-2 text-right">ΔV (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#252A33]">
                      {pagedCircuits.slice.map((c) => (
                        <tr key={c.circuitId}>
                          <td className="px-3 py-2 font-mono font-semibold text-white">
                            <div className="truncate">{c.circuitId}</div>
                            <div className="truncate font-sans text-[10px] font-normal text-[#949BA8]" title={c.methodology}>
                              {c.methodology}
                            </div>
                          </td>
                          <td className="px-2 py-2 font-mono">{c.voltage}V</td>
                          <td className="px-2 py-2 text-right font-mono tabular-nums">
                            {c.totalPowerVA}
                          </td>
                          <td className="px-2 py-2 text-right font-mono tabular-nums">{c.currentA}</td>
                          <td className="px-2 py-2 text-right font-mono tabular-nums text-[#60A5FA]">
                            {c.recommendedBreakerA}A
                          </td>
                          <td className="px-2 py-2 text-right font-mono">{c.conductorMm2}mm²</td>
                          <td
                            className={`px-3 py-2 text-right font-mono tabular-nums ${
                              c.voltageDropOk ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {c.voltageDropPercent}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {unitReport.warnings.length > 0 && (
                  <div className="shrink-0 border-t border-[#2A2F38] bg-amber-950/20 px-3 py-1.5 text-[11px] text-amber-200">
                    <div className="flex items-center gap-1.5 truncate" title={unitReport.warnings.join(' · ')}>
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                      <span className="truncate">
                        {unitReport.warnings[0]}
                        {unitReport.warnings.length > 1 ? ` (+${unitReport.warnings.length - 1})` : ''}
                      </span>
                    </div>
                  </div>
                )}
                <PaginationBar
                  page={pagedCircuits.safePage}
                  totalPages={pagedCircuits.totalPages}
                  totalItems={circuitsList.length}
                  startIndex={pagedCircuits.start}
                  endIndex={pagedCircuits.end}
                  onPageChange={setCircuitsPage}
                  itemLabel="circuitos"
                />
              </div>

              {/* Unifilar Diagram SVG */}
              <div className="flex min-h-0 flex-col gap-2 overflow-hidden rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-3 lg:col-span-4">
                <h2 className="shrink-0 text-xs font-semibold text-white">
                  Diagrama Unifilar Esquemático ({activeUt.code})
                </h2>
                <svg
                  viewBox={`0 0 320 ${Math.max(220, 70 + unitReport.circuits.length * 42)}`}
                  className="min-h-0 h-full w-full flex-1 rounded border border-[#2A2F38] bg-[#111317]"
                >
                  <line x1="30" y1="30" x2="90" y2="30" stroke="#60A5FA" strokeWidth="2" />
                  <rect
                    x="90"
                    y="18"
                    width="54"
                    height="24"
                    fill="#1E242E"
                    stroke="#60A5FA"
                    strokeWidth="1.5"
                  />
                  <text
                    x="117"
                    y="34"
                    textAnchor="middle"
                    fill="#F1F4F9"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
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
                        <line
                          x1="117"
                          y1={yPos}
                          x2="175"
                          y2={yPos}
                          stroke="#F59E0B"
                          strokeWidth="1.5"
                        />
                        <path
                          d={`M 140 ${yPos} Q 148 ${yPos - 8} 156 ${yPos}`}
                          fill="none"
                          stroke="#60A5FA"
                          strokeWidth="1.5"
                        />
                        <text
                          x="182"
                          y={yPos + 3}
                          fill="#E6E9EF"
                          fontSize="10"
                          fontFamily="JetBrains Mono, monospace"
                        >
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
      )}
    </div>
  );
};
