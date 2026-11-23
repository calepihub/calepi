import React, { useState } from 'react';
import { Copy, FlipHorizontal2, LayoutGrid, Plus, Trash2, Wand2 } from 'lucide-react';
import { getRoomArea, getRoomPerimeter, getUnitUsefulArea, round2 } from '../engine/geometry';
import {
  autoDistributeUnitsAcrossFloors,
  computeBlondelStairSpec,
  computeMezzanineInteriorBounds,
  generateParametricUnitLayout,
  nextId,
} from '../engine/parametricGenerator';
import type {
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
  const [newCeilingHeight, setNewCeilingHeight] = useState(2.8);
  const [newBedrooms, setNewBedrooms] = useState(0);
  const [newEntrySide, setNewEntrySide] = useState<EntrySide>('frente');
  const [newPartitionType, setNewPartitionType] = useState<InternalPartitionType>(
    project.constructionMethod.internalPartitionType ?? 'alvenaria',
  );
  const [newLaundry, setNewLaundry] = useState(true);
  const [newBalcony, setNewBalcony] = useState(false);
  const [newAcc, setNewAcc] = useState(false);

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

  const canNewMezzanine = newCeilingHeight >= 3.0;
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

  const handleCreateTypology = (e: React.FormEvent) => {
    e.preventDefault();
    const allowMezz = newCeilingHeight >= 3.0 && newMezzEnabled;
    const created = generateParametricUnitLayout({
      code: newCode.trim() || `TIPO-${project.unitTypes.length + 1}`,
      name: newName.trim() || 'Tipologia Personalizada',
      width: newWidth,
      depth: newDepth,
      ceilingHeight: newCeilingHeight,
      bedrooms: newBedrooms,
      hasLaundry: newLaundry,
      hasBalcony: newBalcony,
      hasMezzanine: allowMezz,
      accessible: newAcc,
      extWallThickness: project.constructionMethod.externalWallThickness,
      intWallThickness:
        newPartitionType === 'drywall'
          ? 0.095
          : project.constructionMethod.internalWallThickness,
      constructionSystem: project.constructionMethod.methodId,
      entrySide: newEntrySide,
      internalPartitionType: newPartitionType,
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
    setNewCode(`TIPO-${String.fromCharCode(65 + project.unitTypes.length + 1)}`);
  };

  const handleRegenerateCurrent = (ut: UnitType) => {
    const allowMezz = ut.ceilingHeight >= 3.0 && ut.hasMezzanine;
    const partType = ut.internalPartitionType ?? project.constructionMethod.internalPartitionType ?? 'alvenaria';
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
      hasMezzanine: allowMezz,
      accessible: ut.accessible,
      extWallThickness: project.constructionMethod.externalWallThickness,
      intWallThickness:
        partType === 'drywall' ? 0.095 : project.constructionMethod.internalWallThickness,
      constructionSystem: project.constructionMethod.methodId,
      finishStandard: ut.finishStandard,
      entrySide: ut.entrySide ?? 'lateral_direita',
      internalPartitionType: partType,
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                <label className="block text-[11px] text-[#949BA8] mb-1">Pé-direito (m)</label>
                <input
                  type="number"
                  step="0.05"
                  min={2.4}
                  max={6.0}
                  value={newCeilingHeight}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setNewCeilingHeight(val);
                    if (val < 3.0) {
                      setNewMezzEnabled(false);
                    }
                  }}
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

            <div className="space-y-2 rounded border border-[#2A2F38] bg-[#14161A] p-2.5">
              <div>
                <label className="block text-[11px] font-medium text-[#C4C9D4] mb-1">
                  Entrada Principal da Kitnet (Porta P1 — 0,80m fixo)
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      ['frente', 'Frente'],
                      ['lateral_direita', 'Lat. Direita'],
                      ['lateral_esquerda', 'Lat. Esquerda'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setNewEntrySide(val)}
                      className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                        newEntrySide === val
                          ? 'border-[#2F7CF6] bg-[#2F7CF6]/20 text-white font-semibold'
                          : 'border-[#2A2F38] bg-[#1B1E24] text-[#949BA8] hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#C4C9D4] mb-1">
                  Divisórias Internas
                </label>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setNewPartitionType('alvenaria')}
                    className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                      newPartitionType === 'alvenaria'
                        ? 'border-[#2F7CF6] bg-[#2F7CF6]/20 text-white font-semibold'
                        : 'border-[#2A2F38] bg-[#1B1E24] text-[#949BA8] hover:text-white'
                    }`}
                  >
                    Alvenaria (10 cm)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPartitionType('drywall')}
                    className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                      newPartitionType === 'drywall'
                        ? 'border-[#2F7CF6] bg-[#2F7CF6]/20 text-white font-semibold'
                        : 'border-[#2A2F38] bg-[#1B1E24] text-[#949BA8] hover:text-white'
                    }`}
                  >
                    Drywall (9,5 cm)
                  </button>
                </div>
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

            {canNewMezzanine ? (
              <div className="rounded border border-[#2F7CF6]/40 bg-[#14161A] p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-white">
                    <input
                      type="checkbox"
                      checked={newMezzEnabled}
                      onChange={(e) => setNewMezzEnabled(e.target.checked)}
                    />
                    Incluir Mezanino 100% Interno (PD &ge; 3,00 m)
                  </label>
                  <span className="text-[10px] text-cyan-300">Dormir acima · Sala/Coz/BWC abaixo</span>
                </div>

                {newMezzEnabled && (
                  <div className="space-y-2.5 pt-2 border-t border-[#2A2F38]">
                    <div>
                      <label className="block text-[10px] font-semibold text-cyan-200 mb-0.5">
                        A quantos metros do chão fica o mezanino? (Altura livre inferior)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.05"
                          min={2.0}
                          max={round2(Math.max(2.05, newCeilingHeight - 1.1))}
                          value={newMezzElev}
                          onChange={(e) => setNewMezzElev(Number(e.target.value))}
                          className="w-24 px-2 py-1 text-xs font-mono rounded bg-[#1B1E24] border border-[#2F7CF6]/60 text-white"
                        />
                        <span className="text-[10px] font-mono text-[#949BA8]">
                          m do chão · PD Sup.: {round2(Math.max(0.8, newCeilingHeight - newMezzElev - 0.12)).toFixed(2)}m
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold text-[#C4C9D4]">
                          Tamanho do Mezanino ({newInteriorBounds.innerAreaM2} m² internos)
                        </span>
                        <div className="inline-flex rounded border border-[#2A2F38] bg-[#1B1E24] p-0.5 text-[10px]">
                          <button
                            type="button"
                            onClick={() => setNewMezzSizingMode('percent')}
                            className={`px-2 py-0.5 rounded ${newMezzSizingMode === 'percent' ? 'bg-[#2F7CF6] text-white' : 'text-[#949BA8]'}`}
                          >
                            Por % do Piso
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewMezzSizingMode('dimensions')}
                            className={`px-2 py-0.5 rounded ${newMezzSizingMode === 'dimensions' ? 'bg-[#2F7CF6] text-white' : 'text-[#949BA8]'}`}
                          >
                            Dimensões (m)
                          </button>
                        </div>
                      </div>

                      {newMezzSizingMode === 'percent' ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap gap-1">
                            {[10, 20, 30, 40, 50].map((pct) => (
                              <button
                                key={pct}
                                type="button"
                                onClick={() => setNewMezzCoverage(pct / 100)}
                                className={`px-2 py-0.5 text-[10px] font-mono rounded border ${
                                  Math.round(newMezzCoverage * 100) === pct
                                    ? 'border-[#2F7CF6] bg-[#2F7CF6]/25 text-white font-semibold'
                                    : 'border-[#2A2F38] bg-[#1B1E24] text-[#949BA8]'
                                }`}
                              >
                                {pct}%
                              </button>
                            ))}
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
                              className="w-14 px-1.5 py-0.5 text-[10px] font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                            />
                          </div>
                          <p className="text-[10px] font-mono text-cyan-300">
                            Área resultante: {round2(newInteriorBounds.innerAreaM2 * newMezzCoverage)} m² (100% dentro das paredes)
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[9.5px] text-[#949BA8]">
                              Largura (máx {newInteriorBounds.innerW.toFixed(2)}m)
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              min={1.0}
                              max={newInteriorBounds.innerW}
                              value={newMezzCustomW}
                              onChange={(e) => setNewMezzCustomW(Number(e.target.value))}
                              className="w-full px-2 py-1 text-[11px] font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[9.5px] text-[#949BA8]">
                              Profundidade (máx {newInteriorBounds.innerD.toFixed(2)}m)
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              min={1.0}
                              max={newInteriorBounds.innerD}
                              value={newMezzCustomD}
                              onChange={(e) => setNewMezzCustomD(Number(e.target.value))}
                              className="w-full px-2 py-1 text-[11px] font-mono rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">
                          Posição Interna
                        </label>
                        <select
                          value={newMezzZone}
                          onChange={(e) => setNewMezzZone(e.target.value as MezzanineZone)}
                          className="w-full px-2 py-1 text-[11px] rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                        >
                          <option value="sobre_banho_cozinha">Sobre BWC e Cozinha</option>
                          <option value="fundos">Fundos da Unidade</option>
                          <option value="lateral_esquerda">Lateral Esquerda</option>
                          <option value="lateral_direita">Lateral Direita</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">
                          Uso (Dormitório acima)
                        </label>
                        <select
                          value={newMezzUsage}
                          onChange={(e) => setNewMezzUsage(e.target.value as MezzanineUsage)}
                          className="w-full px-2 py-1 text-[11px] rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                        >
                          <option value="dormitorio">Área de Dormir (Dormitório)</option>
                          <option value="dormitorio_home_office">Dormitório + Home Office</option>
                          <option value="home_office">Home Office (Dormir embaixo)</option>
                          <option value="deposito_estar">Depósito / Estar</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">
                          Estrutura
                        </label>
                        <select
                          value={newMezzStructure}
                          onChange={(e) =>
                            setNewMezzStructure(e.target.value as MezzanineStructureType)
                          }
                          className="w-full px-1.5 py-1 text-[11px] rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                        >
                          <option value="metalica_madeira">Estrutura Metálica + Madeira</option>
                          <option value="madeira_estrutural">Estrutura de Madeira</option>
                          <option value="steel_deck">Metálica Steel Deck</option>
                          <option value="concreto_armado">Concreto Armado</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">
                          Escada
                        </label>
                        <select
                          value={newMezzStairLayout}
                          onChange={(e) =>
                            setNewMezzStairLayout(e.target.value as MezzanineStairLayout)
                          }
                          className="w-full px-1.5 py-1 text-[11px] rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                        >
                          <option value="reta">Lance Reto</option>
                          <option value="em_l">Em L</option>
                          <option value="caracol_compacta">Helicoidal</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#949BA8] mb-0.5">
                          Lado Escada
                        </label>
                        <select
                          value={newMezzStairSide}
                          onChange={(e) =>
                            setNewMezzStairSide(e.target.value as 'esquerda' | 'direita')
                          }
                          className="w-full px-1.5 py-1 text-[11px] rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                        >
                          <option value="direita">Direita</option>
                          <option value="esquerda">Esquerda</option>
                        </select>
                      </div>
                    </div>

                    {previewNewStair && (
                      <div className="rounded bg-[#1B1E24] px-2.5 py-1.5 text-[10px] font-mono text-[#949BA8]">
                        Escada Blondel: {previewNewStair.steps} degraus · h=
                        {(previewNewStair.riserM * 100).toFixed(1)}cm · p=
                        {(previewNewStair.treadM * 100).toFixed(0)}cm · 2h+p=
                        {previewNewStair.blondelSumM.toFixed(3)}m
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-[#949BA8]">
                Pé-direito abaixo de 3,00 m: mezanino indisponível (eleve o pé-direito para &ge; 3,00 m se desejar locar mezanino).
              </p>
            )}

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
                        if (Number.isFinite(val) && val >= 2.8) {
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
                    <label className="block text-[11px] text-[#949BA8] mb-1">Comprimento (m)</label>
                    <input
                      type="number"
                      step="0.1"
                      min={3.6}
                      value={activeUt.depth}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (Number.isFinite(val) && val >= 3.6) {
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
                    <input
                      type="number"
                      step="0.05"
                      min={2.4}
                      max={6.0}
                      value={activeUt.ceilingHeight}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (Number.isFinite(val) && val >= 2.4 && val <= 6.0) {
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

                {/* Entrada Principal & Divisórias Internas da Tipologia Ativa */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#2A2F38]">
                  <div>
                    <label className="block text-[11px] text-[#949BA8] mb-1">
                      Entrada Principal da Kitnet (P1 — 0,80m)
                    </label>
                    <select
                      value={activeUt.entrySide ?? 'lateral_direita'}
                      onChange={(e) => {
                        const val = e.target.value as EntrySide;
                        const updatedUt: UnitType = { ...activeUt, entrySide: val };
                        handleRegenerateCurrent(updatedUt);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                    >
                      <option value="frente">Frente da Kitnet</option>
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
                        const updatedUt: UnitType = {
                          ...activeUt,
                          internalPartitionType: val,
                        };
                        handleRegenerateCurrent(updatedUt);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                    >
                      <option value="alvenaria">Alvenaria Convencional (10 cm)</option>
                      <option value="drywall">Drywall Gesso Acartonado ST/RU (9,5 cm)</option>
                    </select>
                  </div>
                </div>

                {/* Mezanino Condicional (apenas se pé-direito >= 3,00m; nunca é contado como andar) */}
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
                    return (
                      <div className="rounded border border-[#2F7CF6]/40 bg-[#14161A] p-3.5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="inline-flex items-center gap-2 text-xs font-semibold text-white">
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
                            Habilitar Mezanino 100% Interno (Pé-direito {activeUt.ceilingHeight.toFixed(2)} m)
                          </label>
                          <span className="text-[11px] text-cyan-300">
                            Área útil interna: {activeBounds.innerW.toFixed(2)}×{activeBounds.innerD.toFixed(2)}m ({activeBounds.innerAreaM2} m²) · Não conta como andar
                          </span>
                        </div>

                        {activeUt.hasMezzanine && activeUt.mezzanine && (
                          <div className="space-y-3 pt-2 border-t border-[#2A2F38]">
                            {/* Altura do chão + Modo de dimensionamento (% ou m) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="rounded border border-[#2A2F38] bg-[#1B1E24] p-2.5 space-y-1.5">
                                <label className="block text-[11px] font-semibold text-cyan-200">
                                  A quantos metros do chão fica o mezanino?
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    step="0.05"
                                    min={2.0}
                                    max={round2(Math.max(2.05, activeUt.ceilingHeight - 1.05))}
                                    value={activeUt.mezzanine.elevationM}
                                    onChange={(e) =>
                                      handleRegenerateCurrent({
                                        ...activeUt,
                                        mezzanine: {
                                          ...activeUt.mezzanine!,
                                          elevationM: Number(e.target.value),
                                        },
                                      })
                                    }
                                    className="w-24 px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2F7CF6] text-white"
                                  />
                                  <div className="text-[10.5px] font-mono text-[#C4C9D4]">
                                    <div>PD Inferior (embaixo): <strong className="text-white">{activeUt.mezzanine.elevationM.toFixed(2)} m</strong></div>
                                    <div>PD Superior (mezanino): <strong className="text-cyan-300">{round2(activeUt.ceilingHeight - activeUt.mezzanine.elevationM - activeUt.mezzanine.slabThicknessM).toFixed(2)} m</strong></div>
                                  </div>
                                </div>
                              </div>

                              <div className="rounded border border-[#2A2F38] bg-[#1B1E24] p-2.5 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-semibold text-white">
                                    Dimensionamento (% do piso ou m)
                                  </span>
                                  <div className="inline-flex rounded border border-[#2A2F38] bg-[#14161A] p-0.5 text-[10px]">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRegenerateCurrent({
                                          ...activeUt,
                                          mezzanine: {
                                            ...activeUt.mezzanine!,
                                            sizingMode: 'percent',
                                          },
                                        })
                                      }
                                      className={`px-2 py-0.5 rounded ${(activeUt.mezzanine.sizingMode ?? 'percent') === 'percent' ? 'bg-[#2F7CF6] text-white' : 'text-[#949BA8]'}`}
                                    >
                                      % Área Interna
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
                                      Dimensões (m)
                                    </button>
                                  </div>
                                </div>

                                {(activeUt.mezzanine.sizingMode ?? 'percent') === 'percent' ? (
                                  <div className="flex flex-wrap items-center gap-1.5">
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
                                        className={`px-2.5 py-1 text-[11px] font-mono rounded border ${
                                          Math.round(activeUt.mezzanine!.coverageRatio * 100) === pct
                                            ? 'border-[#2F7CF6] bg-[#2F7CF6]/25 text-white font-semibold'
                                            : 'border-[#2A2F38] bg-[#14161A] text-[#C4C9D4] hover:text-white'
                                        }`}
                                      >
                                        {pct}%
                                      </button>
                                    ))}
                                    <input
                                      type="number"
                                      min={10}
                                      max={65}
                                      value={Math.round(activeUt.mezzanine.coverageRatio * 100)}
                                      onChange={(e) =>
                                        handleRegenerateCurrent({
                                          ...activeUt,
                                          mezzanine: {
                                            ...activeUt.mezzanine!,
                                            sizingMode: 'percent',
                                            coverageRatio: Math.min(
                                              0.65,
                                              Math.max(0.1, Number(e.target.value) / 100),
                                            ),
                                          },
                                        })
                                      }
                                      className="w-16 px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                                    />
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-[9.5px] text-[#949BA8]">
                                        Largura (máx {activeBounds.innerW.toFixed(2)}m)
                                      </label>
                                      <input
                                        type="number"
                                        step="0.1"
                                        min={0.9}
                                        max={activeBounds.innerW}
                                        value={activeUt.mezzanine.customWidthM ?? activeUt.mezzanine.width}
                                        onChange={(e) =>
                                          handleRegenerateCurrent({
                                            ...activeUt,
                                            mezzanine: {
                                              ...activeUt.mezzanine!,
                                              sizingMode: 'dimensions',
                                              customWidthM: Number(e.target.value),
                                            },
                                          })
                                        }
                                        className="w-full px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[9.5px] text-[#949BA8]">
                                        Profundidade (máx {activeBounds.innerD.toFixed(2)}m)
                                      </label>
                                      <input
                                        type="number"
                                        step="0.1"
                                        min={0.9}
                                        max={activeBounds.innerD}
                                        value={activeUt.mezzanine.customDepthM ?? activeUt.mezzanine.depth}
                                        onChange={(e) =>
                                          handleRegenerateCurrent({
                                            ...activeUt,
                                            mezzanine: {
                                              ...activeUt.mezzanine!,
                                              sizingMode: 'dimensions',
                                              customDepthM: Number(e.target.value),
                                            },
                                          })
                                        }
                                        className="w-full px-2 py-1 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                              <div>
                                <label className="block text-[10px] text-[#949BA8] mb-0.5">
                                  Localização Interna
                                </label>
                                <select
                                  value={activeUt.mezzanine.zone}
                                  onChange={(e) =>
                                    handleRegenerateCurrent({
                                      ...activeUt,
                                      mezzanine: {
                                        ...activeUt.mezzanine!,
                                        zone: e.target.value as MezzanineZone,
                                      },
                                    })
                                  }
                                  className="w-full px-2 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                >
                                  <option value="sobre_banho_cozinha">Sobre BWC + Cozinha</option>
                                  <option value="fundos">Fundos da Unidade</option>
                                  <option value="lateral_esquerda">Lateral Esquerda</option>
                                  <option value="lateral_direita">Lateral Direita</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] text-[#949BA8] mb-0.5">
                                  Uso (Dormir acima)
                                </label>
                                <select
                                  value={activeUt.mezzanine.usage}
                                  onChange={(e) =>
                                    handleRegenerateCurrent({
                                      ...activeUt,
                                      mezzanine: {
                                        ...activeUt.mezzanine!,
                                        usage: e.target.value as MezzanineUsage,
                                      },
                                    })
                                  }
                                  className="w-full px-2 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                >
                                  <option value="dormitorio">Dormitório (Acima)</option>
                                  <option value="dormitorio_home_office">Dormitório + Office</option>
                                  <option value="home_office">Home Office</option>
                                  <option value="deposito_estar">Depósito / Estar</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] text-[#949BA8] mb-0.5">
                                  Estrutura (Metálica / Madeira)
                                </label>
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
                                  className="w-full px-2 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                >
                                  <option value="metalica_madeira">Estrutura Metálica + Deck Madeira</option>
                                  <option value="madeira_estrutural">Madeira Estrutural (Vigas/Deck)</option>
                                  <option value="steel_deck">Metálica Steel Deck</option>
                                  <option value="concreto_armado">Concreto Armado</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] text-[#949BA8] mb-0.5">
                                  Traçado da Escada
                                </label>
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
                                  className="w-full px-2 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                >
                                  <option value="reta">Lance Reto</option>
                                  <option value="em_l">Escada em L</option>
                                  <option value="caracol_compacta">Helicoidal Compacta</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] text-[#949BA8] mb-0.5">
                                  Lado da Escada
                                </label>
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
                                  className="w-full px-2 py-1 text-xs rounded bg-[#1B1E24] border border-[#2A2F38] text-white"
                                >
                                  <option value="direita">Parede Direita</option>
                                  <option value="esquerda">Parede Esquerda</option>
                                </select>
                              </div>
                            </div>

                            {(() => {
                              const stair = activeUt.furniture.find((f) => f.category === 'escada');
                              const sp = stair?.stairSpec;
                              const mezArea = round2(activeUt.mezzanine!.width * activeUt.mezzanine!.depth);
                              const pctActual = Math.round(activeUt.mezzanine!.coverageRatio * 100);
                              return (
                                <div className="rounded bg-[#1B1E24] px-3 py-2 text-[11px] font-mono text-[#C4C9D4] flex flex-wrap gap-x-4 gap-y-1">
                                  <span className="text-cyan-300">
                                    Plataforma 100% Interna: {activeUt.mezzanine!.width.toFixed(2)}×
                                    {activeUt.mezzanine!.depth.toFixed(2)}m ({mezArea} m² = {pctActual}% do piso)
                                  </span>
                                  <span>
                                    Programa:{' '}
                                    {activeUt.mezzanine!.usage === 'dormitorio' ||
                                    activeUt.mezzanine!.usage === 'dormitorio_home_office'
                                      ? 'Dormitório acima | Sala, Cozinha, BWC e A.S. embaixo'
                                      : 'Escritório/Estar acima | Ambientes sociais/dormir embaixo'}
                                  </span>
                                  {sp && (
                                    <span>
                                      Escada Blondel: {sp.steps} degraus (h={(sp.riserM * 100).toFixed(1)}cm / p=
                                      {(sp.treadM * 100).toFixed(0)}cm · 2h+p={sp.blondelSumM.toFixed(3)}m)
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <p className="text-[11px] text-[#949BA8] pt-1">
                    Mezanino indisponível para pé-direito inferior a 3,00 m (atual:{' '}
                    {activeUt.ceilingHeight.toFixed(2)} m). Eleve o pé-direito para habilitar opções de mezanino.
                  </p>
                )}
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
