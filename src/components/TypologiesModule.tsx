import React, { useState } from 'react';
import { Copy, FlipHorizontal2, LayoutGrid, Plus, Trash2, Wand2 } from 'lucide-react';
import { getRoomArea, getRoomPerimeter, getUnitUsefulArea, round2 } from '../engine/geometry';
import {
  autoDistributeUnitsAcrossFloors,
  generateParametricUnitLayout,
  nextId,
} from '../engine/parametricGenerator';
import type { Project, Room, RoomCategory, UnitType } from '../types/project';

interface TypologiesModuleProps {
  project: Project;
  selectedUnitTypeId: string;
  onSelectUnitType: (id: string) => void;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
  onOpen2DEditor: () => void;
}

const PRESETS = [
  { label: 'Kitnet compacta (20 m²)', width: 4.0, depth: 5.0, bedrooms: 0, laundry: false, balcony: false, acc: false },
  { label: 'Kitnet padrão (25 m²)', width: 4.0, depth: 6.25, bedrooms: 0, laundry: true, balcony: false, acc: false },
  { label: 'Kitnet ampliada (30 m²)', width: 4.0, depth: 7.5, bedrooms: 1, laundry: true, balcony: true, acc: false },
  { label: 'Studio urbano (28 m²)', width: 4.2, depth: 6.7, bedrooms: 0, laundry: true, balcony: true, acc: false },
  { label: 'Loft / Mezanino (35 m²)', width: 5.0, depth: 7.0, bedrooms: 1, laundry: true, balcony: true, acc: false },
  { label: 'Unidade Acessível NBR 9050 (32 m²)', width: 4.5, depth: 7.1, bedrooms: 1, laundry: true, balcony: false, acc: true },
];

export const TypologiesModule: React.FC<TypologiesModuleProps> = ({
  project,
  selectedUnitTypeId,
  onSelectUnitType,
  onUpdateProject,
  onOpen2DEditor,
}) => {
  const activeUt =
    project.unitTypes.find((u) => u.id === selectedUnitTypeId) ?? project.unitTypes[0];

  const [newCode, setNewCode] = useState(`TIPO-${String.fromCharCode(65 + project.unitTypes.length)}`);
  const [newName, setNewName] = useState('Nova Kitnet Paramétrica');
  const [newWidth, setNewWidth] = useState(4.2);
  const [newDepth, setNewDepth] = useState(6.0);
  const [newBedrooms, setNewBedrooms] = useState(0);
  const [newLaundry, setNewLaundry] = useState(true);
  const [newBalcony, setNewBalcony] = useState(false);
  const [newAcc, setNewAcc] = useState(false);
  const [distNotice, setDistNotice] = useState<string | null>(null);

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

  const handleCreateTypology = (e: React.FormEvent) => {
    e.preventDefault();
    const created = generateParametricUnitLayout({
      code: newCode.trim() || `TIPO-${project.unitTypes.length + 1}`,
      name: newName.trim() || 'Tipologia Personalizada',
      width: newWidth,
      depth: newDepth,
      ceilingHeight: 2.8,
      bedrooms: newBedrooms,
      hasLaundry: newLaundry,
      hasBalcony: newBalcony,
      hasMezzanine: false,
      accessible: newAcc,
      extWallThickness: project.constructionMethod.externalWallThickness,
      intWallThickness: project.constructionMethod.internalWallThickness,
      constructionSystem: project.constructionMethod.methodId,
    });
    onUpdateProject(
      (prev) => ({ ...prev, unitTypes: [...prev.unitTypes, created] }),
      `Criação de tipologia paramétrica ${created.code}`,
    );
    onSelectUnitType(created.id);
    setNewCode(`TIPO-${String.fromCharCode(65 + project.unitTypes.length + 1)}`);
  };

  const handleRegenerateCurrent = (ut: UnitType) => {
    const regenerated = generateParametricUnitLayout({
      id: ut.id,
      code: ut.code,
      name: ut.name,
      basePreset: ut.basePreset,
      width: ut.width,
      depth: ut.depth,
      ceilingHeight: ut.ceilingHeight,
      bedrooms: ut.bedrooms,
      hasLaundry: ut.hasLaundry,
      hasBalcony: ut.hasBalcony,
      hasMezzanine: ut.hasMezzanine,
      accessible: ut.accessible,
      extWallThickness: project.constructionMethod.externalWallThickness,
      intWallThickness: project.constructionMethod.internalWallThickness,
      constructionSystem: project.constructionMethod.methodId,
      finishStandard: ut.finishStandard,
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
    const mirrored: UnitType = {
      ...ut,
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

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2A2F38] pb-4">
        <div>
          <h1 className="text-xl font-semibold text-white">
            Tipologias de Kitnets, Ambientes & Acabamentos
          </h1>
          <p className="text-xs text-[#949BA8] mt-1">
            Gerador paramétrico sem limites de modelos. Defina dimensões, cômodos, especificações e edite livremente na planta 2D.
          </p>
        </div>
        {activeUt && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAutoDistribute}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded border border-emerald-500/50 bg-emerald-600/20 text-emerald-200 hover:bg-emerald-600/35 whitespace-nowrap"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Distribuir Unidades nos Pavimentos
            </button>
            <button
              type="button"
              onClick={onOpen2DEditor}
              className="px-4 py-2 text-xs font-semibold rounded bg-[#2F7CF6] text-white hover:bg-[#2569D6] whitespace-nowrap"
            >
              Editar {activeUt.code} na Planta 2D
            </button>
          </div>
        )}
      </div>

      {distNotice && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-4 py-2.5 text-xs text-emerald-200">
          {distNotice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Typologies list & Generator */}
        <div className="lg:col-span-4 space-y-5">
          <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 space-y-3">
            <h2 className="text-sm font-semibold text-white">
              Tipologias Cadastradas ({project.unitTypes.length})
            </h2>
            <div className="space-y-2">
              {project.unitTypes.map((ut) => {
                const isSelected = activeUt?.id === ut.id;
                const countImpl = project.floors.reduce(
                  (s, f) => s + f.units.filter((u) => u.unitTypeId === ut.id).length,
                  0,
                );
                return (
                  <button
                    key={ut.id}
                    type="button"
                    onClick={() => onSelectUnitType(ut.id)}
                    className={`w-full text-left p-3 rounded border transition-colors ${
                      isSelected
                        ? 'border-[#2F7CF6] bg-[#2F7CF6]/10'
                        : 'border-[#2A2F38] bg-[#14161A] hover:border-[#3F4654]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">{ut.name}</span>
                      <span className="text-[11px] font-mono text-[#949BA8]">
                        {round2(ut.width * ut.depth)} m²
                      </span>
                    </div>
                    <div className="text-[11px] text-[#949BA8] mt-1 font-mono">
                      {ut.code} · {ut.width}m × {ut.depth}m · {ut.rooms.length} amb. · {countImpl} unid. implantadas
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Parametric Creator */}
          <form
            onSubmit={handleCreateTypology}
            className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 space-y-3"
          >
            <h2 className="text-sm font-semibold text-white">Nova Tipologia Paramétrica</h2>

            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((pr) => (
                <button
                  key={pr.label}
                  type="button"
                  onClick={() => {
                    setNewName(pr.label);
                    setNewWidth(pr.width);
                    setNewDepth(pr.depth);
                    setNewBedrooms(pr.bedrooms);
                    setNewLaundry(pr.laundry);
                    setNewBalcony(pr.balcony);
                    setNewAcc(pr.acc);
                  }}
                  className="px-2 py-1 text-[11px] rounded bg-[#14161A] border border-[#2A2F38] text-[#C4C9D4] hover:border-[#2F7CF6]"
                >
                  {pr.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Código</label>
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] text-[#949BA8] mb-1">Nome</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Largura (m)</label>
                <input
                  type="number"
                  step="0.1"
                  min={2.8}
                  value={newWidth}
                  onChange={(e) => setNewWidth(Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Comp. (m)</label>
                <input
                  type="number"
                  step="0.1"
                  min={3.6}
                  value={newDepth}
                  onChange={(e) => setNewDepth(Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#949BA8] mb-1">Quartos</label>
                <input
                  type="number"
                  min={0}
                  max={3}
                  value={newBedrooms}
                  onChange={(e) => setNewBedrooms(Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-xs text-[#C4C9D4]">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={newLaundry}
                  onChange={(e) => setNewLaundry(e.target.checked)}
                />
                Área de Serviço
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={newBalcony}
                  onChange={(e) => setNewBalcony(e.target.checked)}
                />
                Varanda
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={newAcc}
                  onChange={(e) => setNewAcc(e.target.checked)}
                />
                Acessível NBR 9050
              </label>
            </div>

            <button
              type="submit"
              className="w-full py-2 text-xs font-semibold rounded bg-[#2F7CF6] text-white hover:bg-[#2569D6] flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Gerar Tipologia ({round2(newWidth * newDepth)} m²)
            </button>
          </form>
        </div>

        {/* Right: Active Typology Parameters & Rooms Technical Sheets */}
        <div className="lg:col-span-8 space-y-5">
          {!activeUt && (
            <div className="rounded-lg border border-dashed border-[#323844] bg-[#1B1E24] p-8 text-center space-y-2">
              <p className="text-sm font-semibold text-white">
                Nenhuma tipologia criada ainda
              </p>
              <p className="text-xs text-[#949BA8] max-w-md mx-auto">
                Preencha os parâmetros à esquerda (código, dimensões, quarto, área de serviço, varanda e acessibilidade NBR 9050) e clique em &quot;Gerar Tipologia&quot; para iniciar a modelagem da primeira unidade.
              </p>
            </div>
          )}
          {activeUt && (
            <>
              <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-white">{activeUt.name}</h2>
                    <div className="text-xs text-[#949BA8] font-mono mt-0.5 tabular-nums">
                      Área Bruta: {round2(activeUt.width * activeUt.depth)} m² · Área Útil Ambientes:{' '}
                      {getUnitUsefulArea(activeUt)} m² · Pé-direito: {activeUt.ceilingHeight} m
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRegenerateCurrent(activeUt)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-[#323844] bg-[#22262E] text-white hover:border-[#2F7CF6]"
                    >
                      <Wand2 className="w-3.5 h-3.5 text-[#2F7CF6]" />
                      Regerar Layout
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMirrorTypology(activeUt)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-[#323844] bg-[#22262E] text-white hover:border-[#2F7CF6]"
                    >
                      <FlipHorizontal2 className="w-3.5 h-3.5" />
                      Espelhar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicateTypology(activeUt)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-[#323844] bg-[#22262E] text-white hover:border-[#2F7CF6]"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Duplicar
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#949BA8] mb-1">Largura (m)</label>
                    <input
                      type="number"
                      step="0.1"
                      min={2.8}
                      value={activeUt.width}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        onUpdateProject((prev) => ({
                          ...prev,
                          unitTypes: prev.unitTypes.map((t) =>
                            t.id === activeUt.id
                              ? { ...t, width: val, targetArea: round2(val * t.depth) }
                              : t,
                          ),
                        }));
                      }}
                      className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#949BA8] mb-1">Comprimento (m)</label>
                    <input
                      type="number"
                      step="0.1"
                      min={3.6}
                      value={activeUt.depth}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        onUpdateProject((prev) => ({
                          ...prev,
                          unitTypes: prev.unitTypes.map((t) =>
                            t.id === activeUt.id
                              ? { ...t, depth: val, targetArea: round2(t.width * val) }
                              : t,
                          ),
                        }));
                      }}
                      className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#949BA8] mb-1">Pé-direito (m)</label>
                    <input
                      type="number"
                      step="0.05"
                      min={2.4}
                      value={activeUt.ceilingHeight}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        onUpdateProject((prev) => ({
                          ...prev,
                          unitTypes: prev.unitTypes.map((t) =>
                            t.id === activeUt.id ? { ...t, ceilingHeight: val } : t,
                          ),
                        }));
                      }}
                      className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#949BA8] mb-1">Padrão Acabamento</label>
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
                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-1.5 text-xs text-[#E6E9EF] pb-1.5">
                      <input
                        type="checkbox"
                        checked={activeUt.accessible}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          onUpdateProject((prev) => ({
                            ...prev,
                            unitTypes: prev.unitTypes.map((t) =>
                              t.id === activeUt.id ? { ...t, accessible: checked } : t,
                            ),
                          }));
                        }}
                      />
                      Acessível
                    </label>
                  </div>
                </div>
              </div>

              {/* Rooms / Ambientes */}
              <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">
                    Ficha Técnica dos Ambientes ({activeUt.rooms.length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => handleAddRoom(activeUt)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-[#323844] bg-[#22262E] text-white hover:border-[#2F7CF6]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Ambiente
                  </button>
                </div>

                <div className="space-y-3">
                  {activeUt.rooms.map((rm) => (
                    <div
                      key={rm.id}
                      className="rounded border border-[#2A2F38] bg-[#14161A] p-3.5 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
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
                            className="w-16 px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-[#60A5FA]"
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
                            className="w-48 px-2 py-1 text-xs font-medium rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
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
                            className="px-2 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-[#C4C9D4]"
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
                          <span>Área: {getRoomArea(rm)} m²</span>
                          <span>Perím.: {getRoomPerimeter(rm)} m</span>
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
                            className="p-1 text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                        <div>
                          <label className="block text-[10px] text-[#949BA8]">Largura (m)</label>
                          <input
                            type="number"
                            step="0.05"
                            min={0.6}
                            value={rm.width}
                            onChange={(e) => {
                              const val = Number(e.target.value);
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
                            className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#949BA8]">Comp. (m)</label>
                          <input
                            type="number"
                            step="0.05"
                            min={0.6}
                            value={rm.depth}
                            onChange={(e) => {
                              const val = Number(e.target.value);
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
                            className="w-full px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
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
                            className="w-full px-2 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
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
                            className="w-full px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
