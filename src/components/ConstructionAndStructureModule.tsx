import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Columns3,
  Hammer,
  Layers,
  Plus,
  Scale,
  Trash2,
} from 'lucide-react';
import { round2 } from '../engine/geometry';
import { compareConstructionMethodsForTypology } from '../engine/quantitiesAndBudget';
import { nextId } from '../engine/parametricGenerator';
import type {
  ConstructionMethodDetails,
  ConstructionMethodId,
  InternalPartitionType,
  Project,
  StructuralElement,
} from '../types/project';

interface ConstructionAndStructureModuleProps {
  project: Project;
  selectedUnitTypeId: string;
  onSelectUnitType: (id: string) => void;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
}

const METHOD_TEMPLATES: Record<
  ConstructionMethodId,
  Omit<ConstructionMethodDetails, 'roofType' | 'roofSlopePercent'>
> = {
  alvenaria_convencional: {
    methodId: 'alvenaria_convencional',
    name: 'Alvenaria Convencional',
    externalWallThickness: 0.15,
    internalWallThickness: 0.1,
    masonryBlockType: 'Bloco cerâmico vedação 14x19x29cm (ext) / 9x19x29cm (int)',
    mortarType: 'Argamassa mista 1:2:8 (cimento, cal e areia média)',
    insulationSpec: 'Sem isolamento específico (avaliar desempenho térmico NBR 15575)',
    notes: 'Estrutura independente em concreto armado (pilares/vigas/lajes) e vedação cerâmica.',
  },
  alvenaria_estrutural: {
    methodId: 'alvenaria_estrutural',
    name: 'Alvenaria Estrutural',
    externalWallThickness: 0.14,
    internalWallThickness: 0.14,
    structuralBlockFamily: 'Família 14x29cm (modulação 15cm)',
    structuralResistanceMpa: 4.5,
    groutSpec: 'Graute fck >= 15 MPa nos pontos armados e cintas de amarração',
    mortarType: 'Argamassa de assentamento estrutural (faixa >= 4,0 MPa conforme projeto)',
    insulationSpec: 'Paredes portantes moduladas — vedado rasgo horizontal não projetado',
    notes: 'Paredes acumulam função portante; exige compatibilização prévia de shafts e prumadas.',
  },
  light_steel_frame: {
    methodId: 'light_steel_frame',
    name: 'Light Steel Frame (LSF)',
    externalWallThickness: 0.14,
    internalWallThickness: 0.1,
    lsfProfileSpec: 'Perfis aço galvanizado ZAR-230 Z275 — Montantes Ue 90x40x0,95mm',
    lsfStudSpacingM: 0.4,
    lsfSheathing: 'Ext: OSB 11,1mm + membrana hidrófuga + placa cimentícia 10mm | Int: Gesso ST/RU 12,5mm',
    insulationSpec: 'Lã de vidro ou lã de rocha 50mm no miolo das paredes',
    notes: 'Sistema industrializado a seco, peso reduzido sobre fundações e alta precisão dimensional.',
  },
  wood_frame: {
    methodId: 'wood_frame',
    name: 'Wood Frame',
    externalWallThickness: 0.14,
    internalWallThickness: 0.1,
    woodSpecies: 'Pinus autoclavado CCA (classe de uso IV/V conforme exposição)',
    woodSection: 'Montantes 38x89mm (ou 38x140mm) espaçados a cada 0,40m / 0,60m',
    lsfSheathing: 'OSB estrutural + barreira vapor/água + placa cimentícia / drywall RU',
    insulationSpec: 'Lã mineral 50–75mm entre montantes',
    notes: 'Verificar atendimento à NBR 7190, diretrizes SINAT e resistência ao fogo exigida.',
  },
  pre_moldado: {
    methodId: 'pre_moldado',
    name: 'Concreto Pré-Moldado',
    externalWallThickness: 0.12,
    internalWallThickness: 0.1,
    precastPanelSpec: 'Painéis maciços/alveolares de concreto armado fck >= 30 MPa com juntas seladas',
    insulationSpec: 'Avaliar inércia térmica e selagem elastomérica de juntas',
    notes: 'Exige estudo de acesso de caminhão munck/guindaste e sequência de montagem.',
  },
  modular: {
    methodId: 'modular',
    name: 'Construção Modular Off-Site',
    externalWallThickness: 0.12,
    internalWallThickness: 0.09,
    precastPanelSpec: 'Módulos volumétricos metálicos/mistos fabricados em galpão',
    insulationSpec: 'Painéis isotérmicos PIR/lã de rocha + placas cimentícias',
    notes: 'Dimensões condicionadas ao gabarito rodoviário de transporte e içamento.',
  },
  misto: {
    methodId: 'misto',
    name: 'Sistema Misto (Estrutura + Drywall Interno)',
    externalWallThickness: 0.15,
    internalWallThickness: 0.095,
    masonryBlockType: 'Fechamento externo em alvenaria 15cm / Divisórias internas em Drywall 9,5cm',
    lsfSheathing: 'Drywall ST (seco) / RU (áreas molhadas) com dupla chapa onde necessário',
    insulationSpec: 'Lã de vidro nas divisórias internas entre unidades para desempenho acústico',
    notes: 'Combina resistência externa de alvenaria com flexibilidade e redução de carga interna.',
  },
  personalizado: {
    methodId: 'personalizado',
    name: 'Sistema Personalizado',
    externalWallThickness: 0.15,
    internalWallThickness: 0.1,
    notes: 'Parâmetros configuráveis manualmente pelo projetista.',
  },
};

export const ConstructionAndStructureModule: React.FC<ConstructionAndStructureModuleProps> = ({
  project,
  selectedUnitTypeId,
  onSelectUnitType,
  onUpdateProject,
}) => {
  const [subTab, setSubTab] = useState<'metodo' | 'estrutura' | 'comparador'>('metodo');

  // New structural element form
  const [newElType, setNewElType] = useState<StructuralElement['type']>('pilar');
  const [newElCode, setNewElCode] = useState('');
  const [newElFloorId, setNewElFloorId] = useState(project.floors[0]?.id ?? '');
  const [newElX, setNewElX] = useState(1.0);
  const [newElY, setNewElY] = useState(4.0);
  const [newElW, setNewElW] = useState(0.2);
  const [newElD, setNewElD] = useState(0.25);
  const [newElH, setNewElH] = useState(2.8);
  const [newElMat, setNewElMat] = useState('Concreto Armado (Conceitual)');

  const activeUnitType =
    project.unitTypes.find((u) => u.id === selectedUnitTypeId) ?? project.unitTypes[0];

  const comparisonRows = useMemo(
    () => (activeUnitType ? compareConstructionMethodsForTypology(activeUnitType) : []),
    [activeUnitType],
  );

  const cm = project.constructionMethod;

  const applyMethodPreset = (methodId: ConstructionMethodId) => {
    const tpl = METHOD_TEMPLATES[methodId];
    onUpdateProject(
      (prev) => ({
        ...prev,
        constructionMethod: {
          ...tpl,
          roofType: prev.constructionMethod.roofType,
          roofSlopePercent: prev.constructionMethod.roofSlopePercent,
        },
        unitTypes: prev.unitTypes.map((ut) => ({
          ...ut,
          walls: ut.walls.map((w) => ({
            ...w,
            thickness: w.isExternal ? tpl.externalWallThickness : tpl.internalWallThickness,
            constructionSystem: methodId,
            material: tpl.name,
            loadBearing: methodId === 'alvenaria_estrutural' ? true : w.isExternal,
          })),
        })),
      }),
      `Sistema construtivo alterado para ${tpl.name}`,
    );
  };

  const updateCM = (patch: Partial<ConstructionMethodDetails>) => {
    onUpdateProject((prev) => {
      const nextCM = { ...prev.constructionMethod, ...patch };
      const nextPartType = nextCM.internalPartitionType ?? 'alvenaria';
      const intMaterial =
        nextPartType === 'drywall'
          ? 'Drywall Gesso Acartonado ST/RU (9,5cm) + Lã Mineral'
          : nextCM.name;
      return {
        ...prev,
        constructionMethod: nextCM,
        unitTypes: prev.unitTypes.map((ut) => ({
          ...ut,
          ...(patch.internalPartitionType ? { internalPartitionType: nextPartType } : {}),
          walls: ut.walls.map((w) => ({
            ...w,
            thickness: w.isExternal ? nextCM.externalWallThickness : nextCM.internalWallThickness,
            ...(patch.internalPartitionType && !w.isExternal ? { material: intMaterial } : {}),
          })),
        })),
      };
    });
  };

  const handleAddStructural = (e: React.FormEvent) => {
    e.preventDefault();
    const code = newElCode.trim() || `${newElType.slice(0, 1).toUpperCase()}${project.structuralElements.length + 1}`;
    const item: StructuralElement = {
      id: nextId('str'),
      code,
      type: newElType,
      floorId: newElFloorId || project.floors[0]?.id || '',
      x: Number(newElX) || 0,
      y: Number(newElY) || 0,
      width: Math.max(0.05, Number(newElW) || 0.2),
      depth: Math.max(0.05, Number(newElD) || 0.2),
      height: Math.max(0.1, Number(newElH) || 2.8),
      material: newElMat,
      sectionLabel: `${Math.round(newElW * 100)}×${Math.round(newElD * 100)} cm`,
      isDimensioned: false,
      notes: 'Elemento conceitual — pendente cálculo estrutural executivo.',
    };
    onUpdateProject(
      (prev) => ({
        ...prev,
        structuralElements: [...prev.structuralElements, item],
      }),
      `Adicionado elemento estrutural conceitual ${code}`,
    );
    setNewElCode('');
  };

  const removeStructural = (id: string) => {
    onUpdateProject(
      (prev) => ({
        ...prev,
        structuralElements: prev.structuralElements.filter((s) => s.id !== id),
      }),
      'Removido elemento estrutural conceitual',
    );
  };

  const structVolumeSummary = useMemo(() => {
    let pillarsM3 = 0;
    let beamsM3 = 0;
    let othersM3 = 0;
    for (const s of project.structuralElements) {
      const v = s.width * s.depth * s.height;
      if (s.type === 'pilar') pillarsM3 += v;
      else if (s.type === 'viga') beamsM3 += v;
      else othersM3 += v;
    }
    const slabsM3 = project.floors.reduce((sum, fl) => {
      const uArea = fl.units.reduce((us, inst) => {
        const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
        return us + (ut ? ut.width * ut.depth : 0);
      }, 0);
      return sum + (uArea + fl.commonAreaM2) * fl.slabThickness;
    }, 0);
    return {
      pillarsM3: round2(pillarsM3),
      beamsM3: round2(beamsM3),
      slabsM3: round2(slabsM3),
      othersM3: round2(othersM3),
      totalM3: round2(pillarsM3 + beamsM3 + slabsM3 + othersM3),
    };
  }, [project.floors, project.structuralElements, project.unitTypes]);

  return (
    <div className="h-full overflow-y-auto bg-[#14161A] p-6 text-slate-100">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">
              Métodos Construtivos, Estrutura Conceitual & Comparador
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Sistema adotado: <span className="font-medium text-slate-200">{cm.name}</span> · Paredes ext.{' '}
              <span className="font-mono tabular-nums text-slate-200">
                {Math.round(cm.externalWallThickness * 100)} cm
              </span>{' '}
              · int.{' '}
              <span className="font-mono tabular-nums text-slate-200">
                {Math.round(cm.internalWallThickness * 100)} cm
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSubTab('metodo')}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition ${
                subTab === 'metodo'
                  ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                  : 'border-slate-800 bg-[#1B1E24] text-slate-300 hover:border-slate-700'
              }`}
            >
              <Hammer className="h-3.5 w-3.5" />
              Método Construtivo
            </button>
            <button
              type="button"
              onClick={() => setSubTab('estrutura')}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition ${
                subTab === 'estrutura'
                  ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                  : 'border-slate-800 bg-[#1B1E24] text-slate-300 hover:border-slate-700'
              }`}
            >
              <Columns3 className="h-3.5 w-3.5" />
              Estrutura Conceitual ({project.structuralElements.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('comparador')}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition ${
                subTab === 'comparador'
                  ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                  : 'border-slate-800 bg-[#1B1E24] text-slate-300 hover:border-slate-700'
              }`}
            >
              <Scale className="h-3.5 w-3.5" />
              Comparador de Sistemas
            </button>
          </div>
        </div>

        {subTab === 'metodo' && (
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-3 lg:col-span-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Biblioteca de Métodos Construtivos
              </h2>
              <div className="space-y-2">
                {(Object.keys(METHOD_TEMPLATES) as ConstructionMethodId[]).map((id) => {
                  const tpl = METHOD_TEMPLATES[id];
                  const active = cm.methodId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => applyMethodPreset(id)}
                      className={`w-full rounded-lg border p-3.5 text-left transition ${
                        active
                          ? 'border-[#2F7CF6] bg-[#2F7CF6]/10'
                          : 'border-slate-800 bg-[#1B1E24] hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-white">{tpl.name}</span>
                        {active && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#2F7CF6]">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Ativo
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{tpl.notes}</p>
                      <p className="mt-1.5 font-mono text-[11px] tabular-nums text-slate-500">
                        Parede ext. {Math.round(tpl.externalWallThickness * 100)} cm · int.{' '}
                        {Math.round(tpl.internalWallThickness * 100)} cm
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-5 lg:col-span-7">
              <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-5">
                <h2 className="text-sm font-semibold text-white">
                  Parâmetros Técnicos do Sistema Ativo ({cm.name})
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Alterações de espessura propagam automaticamente para as paredes das tipologias e para a estimativa de quantitativos.
                </p>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Espessura Parede Externa (m)</span>
                    <input
                      type="number"
                      step="0.005"
                      min="0.06"
                      max="0.45"
                      value={cm.externalWallThickness}
                      onChange={(e) =>
                        updateCM({ externalWallThickness: Math.max(0.06, Number(e.target.value) || 0.15) })
                      }
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 font-mono text-sm tabular-nums text-white"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Espessura Parede Interna (m)</span>
                    <input
                      type="number"
                      step="0.005"
                      min="0.05"
                      max="0.35"
                      value={cm.internalWallThickness}
                      onChange={(e) =>
                        updateCM({ internalWallThickness: Math.max(0.05, Number(e.target.value) || 0.1) })
                      }
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 font-mono text-sm tabular-nums text-white"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Divisórias Internas Padrão</span>
                    <select
                      value={cm.internalPartitionType ?? 'alvenaria'}
                      onChange={(e) => {
                        const val = e.target.value as InternalPartitionType;
                        updateCM({
                          internalPartitionType: val,
                          internalWallThickness: val === 'drywall' ? 0.095 : 0.1,
                        });
                      }}
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
                    >
                      <option value="alvenaria">Alvenaria (10 cm)</option>
                      <option value="drywall">Drywall Gesso Acartonado (9,5 cm)</option>
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Tipo de Cobertura</span>
                    <select
                      value={cm.roofType}
                      onChange={(e) =>
                        updateCM({ roofType: e.target.value as ConstructionMethodDetails['roofType'] })
                      }
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
                    >
                      <option value="telha_termoacustica">Telha Termoacústica (Sanduíche)</option>
                      <option value="telha_ceramica">Telha Cerâmica</option>
                      <option value="telha_fibrocimento">Telha Fibrocimento</option>
                      <option value="laje_impermeabilizada">Laje Impermeabilizada</option>
                      <option value="personalizada">Personalizada</option>
                    </select>
                  </label>

                  <label className="block space-y-1 sm:col-span-2">
                    <span className="text-xs text-slate-400">Inclinação da Cobertura (%)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="60"
                      value={cm.roofSlopePercent}
                      onChange={(e) =>
                        updateCM({ roofSlopePercent: Math.max(0, Number(e.target.value) || 0) })
                      }
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 font-mono text-sm tabular-nums text-white"
                    />
                  </label>
                </div>

                <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
                  {(cm.methodId === 'alvenaria_convencional' || cm.methodId === 'misto') && (
                    <>
                      <label className="block space-y-1">
                        <span className="text-xs text-slate-400">Especificação de Bloco / Tijolo</span>
                        <input
                          type="text"
                          value={cm.masonryBlockType ?? ''}
                          onChange={(e) => updateCM({ masonryBlockType: e.target.value })}
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs text-slate-400">Argamassa de Assentamento</span>
                        <input
                          type="text"
                          value={cm.mortarType ?? ''}
                          onChange={(e) => updateCM({ mortarType: e.target.value })}
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
                        />
                      </label>
                    </>
                  )}

                  {cm.methodId === 'alvenaria_estrutural' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-1">
                        <span className="text-xs text-slate-400">Família Modular do Bloco</span>
                        <input
                          type="text"
                          value={cm.structuralBlockFamily ?? ''}
                          onChange={(e) => updateCM({ structuralBlockFamily: e.target.value })}
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs text-slate-400">Resistência Fbk Preliminar (MPa)</span>
                        <input
                          type="number"
                          step="0.5"
                          value={cm.structuralResistanceMpa ?? ''}
                          onChange={(e) =>
                            updateCM({
                              structuralResistanceMpa: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 font-mono text-sm tabular-nums text-white"
                        />
                      </label>
                      <label className="block space-y-1 sm:col-span-2">
                        <span className="text-xs text-slate-400">Especificação de Graute e Armação</span>
                        <input
                          type="text"
                          value={cm.groutSpec ?? ''}
                          onChange={(e) => updateCM({ groutSpec: e.target.value })}
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
                        />
                      </label>
                    </div>
                  )}

                  {cm.methodId === 'light_steel_frame' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-1 sm:col-span-2">
                        <span className="text-xs text-slate-400">Perfil Metálico (Montantes / Guias)</span>
                        <input
                          type="text"
                          value={cm.lsfProfileSpec ?? ''}
                          onChange={(e) => updateCM({ lsfProfileSpec: e.target.value })}
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs text-slate-400">Espaçamento entre Montantes (m)</span>
                        <input
                          type="number"
                          step="0.05"
                          value={cm.lsfStudSpacingM ?? 0.4}
                          onChange={(e) => updateCM({ lsfStudSpacingM: Number(e.target.value) || 0.4 })}
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 font-mono text-sm tabular-nums text-white"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs text-slate-400">Chapas de Fechamento</span>
                        <input
                          type="text"
                          value={cm.lsfSheathing ?? ''}
                          onChange={(e) => updateCM({ lsfSheathing: e.target.value })}
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
                        />
                      </label>
                    </div>
                  )}

                  {cm.methodId === 'wood_frame' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-1">
                        <span className="text-xs text-slate-400">Espécie / Tratamento</span>
                        <input
                          type="text"
                          value={cm.woodSpecies ?? ''}
                          onChange={(e) => updateCM({ woodSpecies: e.target.value })}
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs text-slate-400">Seção e Modulação</span>
                        <input
                          type="text"
                          value={cm.woodSection ?? ''}
                          onChange={(e) => updateCM({ woodSection: e.target.value })}
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
                        />
                      </label>
                    </div>
                  )}

                  {(cm.methodId === 'pre_moldado' || cm.methodId === 'modular') && (
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-400">Especificação de Painéis / Módulos</span>
                      <input
                        type="text"
                        value={cm.precastPanelSpec ?? ''}
                        onChange={(e) => updateCM({ precastPanelSpec: e.target.value })}
                        className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
                      />
                    </label>
                  )}

                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Isolamento Térmico / Acústico</span>
                    <input
                      type="text"
                      value={cm.insulationSpec ?? ''}
                      onChange={(e) => updateCM({ insulationSpec: e.target.value })}
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Notas Construtivas</span>
                    <textarea
                      rows={3}
                      value={cm.notes}
                      onChange={(e) => updateCM({ notes: e.target.value })}
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-2 text-sm text-white"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {subTab === 'estrutura' && (
          <div className="space-y-6">
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <p className="font-semibold">
                  MODELAGEM ESTRUTURAL CONCEITUAL — NÃO DIMENSIONADA AUTOMATICAMENTE
                </p>
                <p className="mt-1 text-xs leading-relaxed text-amber-200/85">
                  Os elementos cadastrados abaixo representam locação geométrica preliminar para compatibilização arquitetônica e visualização 3D. Este sistema não executa cálculo estrutural de estabilidade, esforços ou armaduras; a execução exige projeto estrutural definitivo por Engenheiro Civil (ABNT NBR 6118, 6120, 6122 e 8800).
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-4">
                <span className="text-xs text-slate-400">Elementos Lançados</span>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-white">
                  {project.structuralElements.length}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-4">
                <span className="text-xs text-slate-400">Volume Pilares (Conceitual)</span>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-white">
                  {structVolumeSummary.pillarsM3} m³
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-4">
                <span className="text-xs text-slate-400">Volume Lajes (Pavimentos)</span>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-white">
                  {structVolumeSummary.slabsM3} m³
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-4">
                <span className="text-xs text-slate-400">Status de Cálculo</span>
                <p className="mt-1 text-sm font-semibold text-amber-400">NÃO DIMENSIONADO</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-12">
              <form
                onSubmit={handleAddStructural}
                className="space-y-3 rounded-lg border border-slate-800 bg-[#1B1E24] p-4 lg:col-span-4"
              >
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Layers className="h-4 w-4 text-[#2F7CF6]" />
                  Inserir Elemento Conceitual
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Tipo</span>
                    <select
                      value={newElType}
                      onChange={(e) => setNewElType(e.target.value as StructuralElement['type'])}
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 text-sm text-white"
                    >
                      <option value="pilar">Pilar</option>
                      <option value="viga">Viga</option>
                      <option value="laje">Laje</option>
                      <option value="baldrame">Viga Baldrame</option>
                      <option value="sapata">Sapata</option>
                      <option value="estaca">Estaca / Bloco</option>
                      <option value="escada">Escada</option>
                      <option value="metalico">Perfil Metálico</option>
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Código</span>
                    <input
                      type="text"
                      placeholder="Ex: P15"
                      value={newElCode}
                      onChange={(e) => setNewElCode(e.target.value)}
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 text-sm text-white"
                    />
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-xs text-slate-400">Pavimento</span>
                  <select
                    value={newElFloorId}
                    onChange={(e) => setNewElFloorId(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 text-sm text-white"
                  >
                    {project.floors.map((fl) => (
                      <option key={fl.id} value={fl.id}>
                        {fl.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">X no terreno (m)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={newElX}
                      onChange={(e) => setNewElX(Number(e.target.value))}
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 font-mono text-sm tabular-nums text-white"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Y no terreno (m)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={newElY}
                      onChange={(e) => setNewElY(Number(e.target.value))}
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 font-mono text-sm tabular-nums text-white"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Larg. (m)</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0.05"
                      value={newElW}
                      onChange={(e) => setNewElW(Number(e.target.value))}
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1.5 font-mono text-sm tabular-nums text-white"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Prof. (m)</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0.05"
                      value={newElD}
                      onChange={(e) => setNewElD(Number(e.target.value))}
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1.5 font-mono text-sm tabular-nums text-white"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Alt. (m)</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={newElH}
                      onChange={(e) => setNewElH(Number(e.target.value))}
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1.5 font-mono text-sm tabular-nums text-white"
                    />
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-xs text-slate-400">Material Conceitual</span>
                  <input
                    type="text"
                    value={newElMat}
                    onChange={(e) => setNewElMat(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 text-sm text-white"
                  />
                </label>

                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[#2F7CF6] px-4 py-2 text-sm font-medium text-white hover:bg-[#2567d4]"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar Elemento
                </button>
              </form>

              <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24] lg:col-span-8">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800 bg-[#14161A] text-slate-400">
                      <tr>
                        <th className="px-3 py-2.5 font-medium">Código</th>
                        <th className="px-3 py-2.5 font-medium">Tipo</th>
                        <th className="px-3 py-2.5 font-medium">Pavimento</th>
                        <th className="px-3 py-2.5 font-medium">Coord. (X, Y)</th>
                        <th className="px-3 py-2.5 font-medium">Dimensões (m)</th>
                        <th className="px-3 py-2.5 font-medium">Status</th>
                        <th className="px-3 py-2.5 text-right font-medium">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {project.structuralElements.map((s) => {
                        const flName =
                          project.floors.find((f) => f.id === s.floorId)?.name ?? 'Geral';
                        return (
                          <tr key={s.id} className="hover:bg-slate-800/30">
                            <td className="px-3 py-2 font-mono font-semibold text-white">{s.code}</td>
                            <td className="px-3 py-2 capitalize text-slate-300">{s.type}</td>
                            <td className="px-3 py-2 text-slate-400">{flName}</td>
                            <td className="px-3 py-2 font-mono tabular-nums text-slate-300">
                              ({s.x.toFixed(2)}, {s.y.toFixed(2)})
                            </td>
                            <td className="px-3 py-2 font-mono tabular-nums text-slate-300">
                              {s.width.toFixed(2)} × {s.depth.toFixed(2)} × {s.height.toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-amber-400">
                              {s.isDimensioned ? 'Dimensionado' : 'Conceitual'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeStructural(s.id)}
                                className="rounded p-1 text-slate-400 hover:bg-red-500/10 hover:text-red-400"
                                title="Excluir elemento"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {project.structuralElements.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                            Nenhum elemento estrutural conceitual cadastrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {subTab === 'comparador' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#1B1E24] p-4">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Comparativo Técnico de Sistemas para Tipologia
                </h2>
                <p className="text-xs text-slate-400">
                  Custos e prazos não cotados permanecem explicitamente marcados como &quot;DADO NÃO DISPONÍVEL&quot;.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Tipologia base:</span>
                <select
                  value={activeUnitType?.id ?? ''}
                  onChange={(e) => onSelectUnitType(e.target.value)}
                  className="rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
                >
                  {project.unitTypes.map((ut) => (
                    <option key={ut.id} value={ut.id}>
                      {ut.code} — {ut.name} ({round2(ut.width * ut.depth)} m²)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-[#14161A] text-slate-400">
                    <tr>
                      <th className="px-3 py-3 font-medium">Sistema Construtivo</th>
                      <th className="px-3 py-3 font-medium">Espessura Típica</th>
                      <th className="px-3 py-3 font-medium">Área Paredes</th>
                      <th className="px-3 py-3 font-medium">Materiais Principais</th>
                      <th className="px-3 py-3 font-medium">Mão de Obra</th>
                      <th className="px-3 py-3 font-medium">Peso / Carga</th>
                      <th className="px-3 py-3 font-medium">Desempenho / Manutenção</th>
                      <th className="px-3 py-3 font-medium">Custo & Prazo</th>
                      <th className="px-3 py-3 font-medium">Restrições Técnicas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {comparisonRows.map((row) => {
                      const isCurrent = cm.methodId === row.methodId;
                      return (
                        <tr
                          key={row.methodId}
                          className={isCurrent ? 'bg-[#2F7CF6]/10' : 'hover:bg-slate-800/30'}
                        >
                          <td className="px-3 py-3 font-medium text-white">
                            {row.methodName}
                            {isCurrent && (
                              <span className="mt-0.5 block text-[11px] font-normal text-[#2F7CF6]">
                                Sistema Ativo no Projeto
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 font-mono tabular-nums text-slate-300">
                            {row.typicalWallThicknessCm}
                          </td>
                          <td className="px-3 py-3 font-mono tabular-nums text-slate-200">
                            {row.wallAreaM2} m²
                          </td>
                          <td className="px-3 py-3 text-slate-300">{row.primaryMaterials}</td>
                          <td className="px-3 py-3 text-slate-300">{row.specializedLaborRequired}</td>
                          <td className="px-3 py-3 text-slate-300">
                            {row.estimatedWeightNote}
                            <span className="mt-1 block text-[11px] text-slate-400">
                              Perdas: {row.lossesNote}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-300">
                            {row.thermalAcousticNote}
                            <span className="mt-1 block text-[11px] text-slate-400">
                              {row.maintenanceDurabilityNote}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-amber-300">
                            <div>Custo: {row.costEstimate}</div>
                            <div className="mt-0.5">Prazo: {row.scheduleEstimate}</div>
                          </td>
                          <td className="px-3 py-3 text-slate-400">{row.restrictions}</td>
                        </tr>
                      );
                    })}
                    {comparisonRows.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                          Crie ao menos uma tipologia na etapa &quot;Planta 2D & Tipologias&quot; para comparar áreas de paredes e sistemas construtivos.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
