import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Box,
  Building2,
  Calculator,
  FileText,
  Home,
  MapPin,
  PenTool,
  Redo2,
  Sparkles,
  Undo2,
  Upload,
} from 'lucide-react';
import { AssistantDrawer } from './components/AssistantDrawer';
import { Bim3DViewport } from './components/Bim3DViewport';
import { ConstructionAndStructureModule } from './components/ConstructionAndStructureModule';
import { DocumentationAndExportModule } from './components/DocumentationAndExportModule';
import { EngineeringComplianceModule } from './components/EngineeringComplianceModule';
import { FloorPlanEditor2D } from './components/FloorPlanEditor2D';
import { MepElectricalModule } from './components/MepElectricalModule';
import { MepHydraulicSanitaryModule } from './components/MepHydraulicSanitaryModule';
import { OverviewDashboard } from './components/OverviewDashboard';
import { ProjectHub } from './components/ProjectHub';
import { QuantitiesAndBudgetModule } from './components/QuantitiesAndBudgetModule';
import { SiteModule } from './components/SiteModule';
import { TypologiesModule } from './components/TypologiesModule';
import { UrbanismModule } from './components/UrbanismModule';
import { generateCompleteProjectZIPBlob, triggerBrowserDownload } from './engine/exporters';
import { createBlankProject } from './engine/parametricGenerator';
import {
  appendRevision,
  deleteProjectFromStorage,
  duplicateProjectRecord,
  loadAllProjects,
  saveProjectToStorage,
  setProjectStatusRecord,
} from './engine/storage';
import type { ConstructionMethodId, Project, ProjectStatus, UnitType } from './types/project';

type PrimaryStepId =
  | 'overview'
  | 'terreno'
  | 'planta2d'
  | 'bim3d'
  | 'engenharia'
  | 'documentacao';

type OverviewSubTab = 'painel' | 'projetos';
type TerrenoSubTab = 'terreno' | 'urbanismo';
type PlantaSubTab = 'editor2d' | 'tipologias';
type EngSubTab = 'quantitativos' | 'compatibilizacao' | 'eletrica' | 'hidraulica' | 'construcao';

const WORKFLOW_STEPS: Array<{
  id: PrimaryStepId;
  num: string;
  label: string;
  tip: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'overview',
    num: '1',
    label: 'Visão Geral',
    tip: 'Acompanhe o resumo do empreendimento, abra qualquer etapa ou gerencie seus projetos salvos.',
    icon: Home,
  },
  {
    id: 'terreno',
    num: '2',
    label: 'Terreno & Leis',
    tip: 'Configure dimensões do terreno, recuos, pavimentos e regras urbanísticas do município.',
    icon: MapPin,
  },
  {
    id: 'planta2d',
    num: '3',
    label: 'Planta 2D & Tipologias',
    tip: 'Clique em paredes, portas ou móveis para editar na planta, ou alterne entre as tipologias no topo.',
    icon: PenTool,
  },
  {
    id: 'bim3d',
    num: '4',
    label: 'Modelo BIM 3D',
    tip: 'Arraste para orbitar o prédio em 3D e use o painel inferior para cortar pavimentos ou filtrar disciplinas.',
    icon: Box,
  },
  {
    id: 'engenharia',
    num: '5',
    label: 'Engenharia & Custos',
    tip: 'Navegue pelas abas acima para conferir quantitativos, orçamento, conflitos, elétrica, hidráulica e estrutura.',
    icon: Calculator,
  },
  {
    id: 'documentacao',
    num: '6',
    label: 'Pranchas & Exportar',
    tip: 'Visualize as 28 pranchas (R01 Renderizada + CAD 2D) com carimbo técnico, edite os memoriais e exporte PDF, DOCX, XLSX, DXF ou ZIP.',
    icon: FileText,
  },
];

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [selectedUnitTypeId, setSelectedUnitTypeId] = useState<string>('');

  const [activeStep, setActiveStep] = useState<PrimaryStepId>('overview');
  const [overviewSubTab, setOverviewSubTab] = useState<OverviewSubTab>('painel');
  const [terrenoSubTab, setTerrenoSubTab] = useState<TerrenoSubTab>('terreno');
  const [plantaSubTab, setPlantaSubTab] = useState<PlantaSubTab>('editor2d');
  const [engSubTab, setEngSubTab] = useState<EngSubTab>('quantitativos');
  const [openNewModalSignal, setOpenNewModalSignal] = useState(0);

  const [assistantOpen, setAssistantOpen] = useState(false);
  const [saveState, setSaveState] = useState<'loading' | 'saved' | 'saving' | 'error'>('loading');
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);

  // Zero-state onboarding form states
  const [zeroName, setZeroName] = useState('');
  const [zeroClient, setZeroClient] = useState('');
  const [zeroMunicipality, setZeroMunicipality] = useState('Rio de Janeiro');
  const [zeroState, setZeroState] = useState('RJ');
  const [zeroFront, setZeroFront] = useState(12);
  const [zeroDepth, setZeroDepth] = useState(25);
  const [zeroFloors, setZeroFloors] = useState(2);
  const [zeroMethod, setZeroMethod] = useState<ConstructionMethodId>('alvenaria_convencional');
  const [zeroError, setZeroError] = useState<string | null>(null);
  const zeroFileRef = useRef<HTMLInputElement>(null);

  const [undoStack, setUndoStack] = useState<Project[]>([]);
  const [redoStack, setRedoStack] = useState<Project[]>([]);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    loadAllProjects()
      .then((loaded) => {
        if (!active) return;
        setProjects(loaded);
        if (loaded.length > 0) {
          setActiveProjectId(loaded[0].id);
          setSelectedUnitTypeId(loaded[0].unitTypes[0]?.id ?? '');
        } else {
          setActiveProjectId('');
          setSelectedUnitTypeId('');
        }
        setIsStorageLoaded(true);
        setSaveState('saved');
      })
      .catch(() => {
        if (!active) return;
        setProjects([]);
        setActiveProjectId('');
        setSelectedUnitTypeId('');
        setIsStorageLoaded(true);
        setSaveState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0],
    [projects, activeProjectId],
  );

  useEffect(() => {
    if (!activeProject) return;
    if (!activeProject.unitTypes.some((u) => u.id === selectedUnitTypeId)) {
      setSelectedUnitTypeId(activeProject.unitTypes[0]?.id ?? '');
    }
  }, [activeProject, selectedUnitTypeId]);

  const schedulePersist = useCallback((projectToSave: Project) => {
    setSaveState('saving');
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveProjectToStorage(projectToSave)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, 350);
  }, []);

  const handleUpdateProject = useCallback(
    (updater: (prev: Project) => Project, revisionNote?: string) => {
      setProjects((prevList) => {
        const current = prevList.find((p) => p.id === activeProjectId) ?? prevList[0];
        if (!current) return prevList;
        let next = updater(current);
        if (revisionNote) {
          next = appendRevision(next, revisionNote);
        } else {
          next = { ...next, updatedAt: new Date().toISOString() };
        }
        setUndoStack((u) => [...u.slice(-49), current]);
        setRedoStack([]);
        schedulePersist(next);
        return prevList.map((p) => (p.id === current.id ? next : p));
      });
    },
    [activeProjectId, schedulePersist],
  );

  const handleUndo = useCallback(() => {
    if (!activeProject || undoStack.length === 0) return;
    const prevSnapshot = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, activeProject]);
    setProjects((list) => list.map((p) => (p.id === activeProject.id ? prevSnapshot : p)));
    schedulePersist(prevSnapshot);
  }, [activeProject, undoStack, schedulePersist]);

  const handleRedo = useCallback(() => {
    if (!activeProject || redoStack.length === 0) return;
    const nextSnapshot = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, activeProject]);
    setProjects((list) => list.map((p) => (p.id === activeProject.id ? nextSnapshot : p)));
    schedulePersist(nextSnapshot);
  }, [activeProject, redoStack, schedulePersist]);

  const navigateFromLegacyModule = (moduleId: string) => {
    switch (moduleId) {
      case 'terreno':
        setActiveStep('terreno');
        setTerrenoSubTab('terreno');
        break;
      case 'urbanismo':
        setActiveStep('terreno');
        setTerrenoSubTab('urbanismo');
        break;
      case 'tipologias':
        setActiveStep('planta2d');
        setPlantaSubTab('tipologias');
        break;
      case 'planta2d':
        setActiveStep('planta2d');
        setPlantaSubTab('editor2d');
        break;
      case 'bim3d':
        setActiveStep('bim3d');
        break;
      case 'eletrica':
        setActiveStep('engenharia');
        setEngSubTab('eletrica');
        break;
      case 'hidraulica':
        setActiveStep('engenharia');
        setEngSubTab('hidraulica');
        break;
      case 'construcao':
        setActiveStep('engenharia');
        setEngSubTab('construcao');
        break;
      case 'compatibilizacao':
        setActiveStep('engenharia');
        setEngSubTab('compatibilizacao');
        break;
      case 'orcamento':
        setActiveStep('engenharia');
        setEngSubTab('quantitativos');
        break;
      case 'documentacao':
        setActiveStep('documentacao');
        break;
      default:
        setActiveStep('overview');
    }
  };

  // Project Hub Actions
  const handleOpenProject = (id: string) => {
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    setActiveProjectId(id);
    setSelectedUnitTypeId(target.unitTypes[0]?.id ?? '');
    setUndoStack([]);
    setRedoStack([]);
    setActiveStep('overview');
    setOverviewSubTab('painel');
  };

  const handleCreateProject = (params: {
    name: string;
    client: string;
    municipality: string;
    state: string;
    front: number;
    depth: number;
    floorsCount: number;
    methodId: ConstructionMethodId;
  }) => {
    const created = createBlankProject(params);
    setProjects((list) => [created, ...list]);
    setActiveProjectId(created.id);
    setSelectedUnitTypeId(created.unitTypes[0]?.id ?? '');
    setUndoStack([]);
    setRedoStack([]);
    saveProjectToStorage(created).catch(() => setSaveState('error'));
    setActiveStep('terreno');
    setTerrenoSubTab('terreno');
  };

  const handleDuplicateProject = (id: string) => {
    const src = projects.find((p) => p.id === id);
    if (!src) return;
    const copy = duplicateProjectRecord(src);
    setProjects((list) => [copy, ...list]);
    setActiveProjectId(copy.id);
    saveProjectToStorage(copy).catch(() => setSaveState('error'));
  };

  const handleToggleArchiveProject = (id: string, nextStatus: ProjectStatus) => {
    setProjects((list) =>
      list.map((p) => {
        if (p.id !== id) return p;
        const updated = setProjectStatusRecord(p, nextStatus);
        saveProjectToStorage(updated).catch(() => setSaveState('error'));
        return updated;
      }),
    );
  };

  const handleDeleteProject = (id: string) => {
    deleteProjectFromStorage(id).catch(() => {});
    setProjects((list) => {
      const remaining = list.filter((p) => p.id !== id);
      if (remaining.length === 0) {
        setActiveProjectId('');
        setSelectedUnitTypeId('');
        return [];
      }
      if (id === activeProjectId) {
        setActiveProjectId(remaining[0].id);
        setSelectedUnitTypeId(remaining[0].unitTypes[0]?.id ?? '');
      }
      return remaining;
    });
  };

  const handleImportProjectJSON = (imported: Project) => {
    const exists = projects.some((p) => p.id === imported.id);
    const stamped: Project = {
      ...imported,
      id: exists ? `proj-${Date.now().toString(36)}` : imported.id,
      capturedRenders: imported.capturedRenders ?? [],
      updatedAt: new Date().toISOString(),
    };
    setProjects((list) => [stamped, ...list]);
    setActiveProjectId(stamped.id);
    setSelectedUnitTypeId(stamped.unitTypes[0]?.id ?? '');
    saveProjectToStorage(stamped).catch(() => setSaveState('error'));
    setActiveStep('overview');
    setOverviewSubTab('painel');
  };

  const handleQuickExportZIP = async () => {
    if (!activeProject || exportingZip) return;
    setExportingZip(true);
    try {
      const blob = await generateCompleteProjectZIPBlob(activeProject);
      triggerBrowserDownload(blob, `${activeProject.code}_EMPREENDIMENTO_COMPLETO.zip`);
    } finally {
      setExportingZip(false);
    }
  };

  const handleAuthorizeTypology = (ut: UnitType) => {
    handleUpdateProject(
      (prev) => ({
        ...prev,
        unitTypes: [...prev.unitTypes, ut],
      }),
      `Tipologia ${ut.code} (${ut.name}) criada após autorização do usuário`,
    );
    setSelectedUnitTypeId(ut.id);
  };

  const handleZeroCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!zeroName.trim()) {
      setZeroError('Informe o nome do empreendimento para começar.');
      return;
    }
    if (zeroFront < 4 || zeroDepth < 6) {
      setZeroError('Dimensões mínimas do lote: 4,0 m de frente × 6,0 m de profundidade.');
      return;
    }
    setZeroError(null);
    handleCreateProject({
      name: zeroName,
      client: zeroClient,
      municipality: zeroMunicipality,
      state: zeroState,
      front: zeroFront,
      depth: zeroDepth,
      floorsCount: zeroFloors,
      methodId: zeroMethod,
    });
  };

  const handleZeroFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setZeroError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Project;
      if (!parsed || !parsed.id || !parsed.site || !Array.isArray(parsed.floors)) {
        setZeroError('Arquivo JSON inválido: estrutura não compatível com KITNET PRO STUDIO.');
        return;
      }
      handleImportProjectJSON(parsed);
    } catch {
      setZeroError('Não foi possível ler o arquivo de backup JSON.');
    } finally {
      e.target.value = '';
    }
  };

  if (!isStorageLoaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#14161A] text-sm text-slate-300">
        Carregando base local do KITNET PRO STUDIO...
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="flex min-h-screen w-screen flex-col bg-[#14161A] text-slate-100">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 bg-[#1B1E24] px-6">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#2F7CF6]" />
            <span className="text-sm font-bold tracking-tight text-white">KITNET PRO STUDIO</span>
          </div>
          <span className="font-mono text-xs text-slate-400">0 Projetos Locais · Criação do Zero</span>
        </header>

        <main className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-2xl rounded-xl border border-slate-800 bg-[#1B1E24] p-7 shadow-2xl space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <h1 className="text-xl font-semibold text-white">
                Começar Novo Empreendimento do Zero
              </h1>
              <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                Nenhum projeto ou dado simulado é pré-carregado. Informe os parâmetros iniciais do terreno e sistema construtivo para iniciar sua modelagem BIM, plantas executivas padrão AutoCAD, renderização 3D e orçamento referenciado pela tabela SINAPI-RJ (CAIXA).
              </p>
            </div>

            {zeroError && (
              <div className="rounded border border-red-500/40 bg-red-950/30 px-3.5 py-2.5 text-xs text-red-200">
                {zeroError}
              </div>
            )}

            <form onSubmit={handleZeroCreateSubmit} className="space-y-4">
              <div className="grid gap-3.5 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Nome do Empreendimento *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Residencial Copacabana Studios"
                    value={zeroName}
                    onChange={(e) => setZeroName(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-2 text-xs text-white focus:border-[#2F7CF6] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Contratante / Proprietário
                  </label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={zeroClient}
                    onChange={(e) => setZeroClient(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-2 text-xs text-white focus:border-[#2F7CF6] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-3.5 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Município
                  </label>
                  <input
                    type="text"
                    value={zeroMunicipality}
                    onChange={(e) => setZeroMunicipality(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-2 text-xs text-white focus:border-[#2F7CF6] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    UF (Estado)
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    value={zeroState}
                    onChange={(e) => setZeroState(e.target.value.toUpperCase())}
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-2 font-mono text-xs text-white uppercase focus:border-[#2F7CF6] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-3.5 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Frente do Lote (m)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={4}
                    value={zeroFront}
                    onChange={(e) => setZeroFront(Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-2 font-mono text-xs tabular-nums text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Profundidade (m)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={6}
                    value={zeroDepth}
                    onChange={(e) => setZeroDepth(Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-2 font-mono text-xs tabular-nums text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Pavimentos
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={zeroFloors}
                    onChange={(e) => setZeroFloors(Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-2 font-mono text-xs tabular-nums text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Sistema Construtivo Principal
                </label>
                <select
                  value={zeroMethod}
                  onChange={(e) => setZeroMethod(e.target.value as ConstructionMethodId)}
                  className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-2 text-xs text-white"
                >
                  <option value="alvenaria_convencional">Alvenaria Convencional (15cm / 10cm)</option>
                  <option value="alvenaria_estrutural">Alvenaria Estrutural (14cm / 14cm)</option>
                  <option value="light_steel_frame">Light Steel Frame (14cm / 11cm)</option>
                  <option value="wood_frame">Wood Frame (14cm / 11cm)</option>
                  <option value="pre_moldado">Concreto Pré-Moldado</option>
                  <option value="modular">Construção Modular</option>
                </select>
              </div>

              <div className="rounded border border-slate-800 bg-[#14161A] px-3.5 py-2.5 text-[11px] text-slate-400">
                Base orçamentária inicial configurada para <strong className="text-slate-200">SINAPI-RJ (CAIXA/IBGE)</strong> quando UF = RJ, mantendo todos os custos unitários editáveis após a modelagem.
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div>
                  <input
                    ref={zeroFileRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleZeroFileImport}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => zeroFileRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-[#14161A] px-4 py-2 text-xs font-medium text-slate-200 hover:border-slate-500 whitespace-nowrap"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Importar Backup (.json)
                  </button>
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-md bg-[#2F7CF6] px-5 py-2 text-xs font-semibold text-white hover:bg-[#2569D6] whitespace-nowrap"
                >
                  Criar Empreendimento do Zero
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    );
  }

  const currentStepIdx = WORKFLOW_STEPS.findIndex((s) => s.id === activeStep);
  const currentStepMeta = WORKFLOW_STEPS[currentStepIdx] ?? WORKFLOW_STEPS[0];
  const prevStepMeta = currentStepIdx > 0 ? WORKFLOW_STEPS[currentStepIdx - 1] : null;
  const nextStepMeta =
    currentStepIdx < WORKFLOW_STEPS.length - 1 ? WORKFLOW_STEPS[currentStepIdx + 1] : null;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#14161A] text-slate-100">
      {/* Row 1: Clean Workspace Header */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-slate-800 bg-[#1B1E24] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setActiveStep('overview');
              setOverviewSubTab('painel');
            }}
            className="flex items-center gap-2 text-left whitespace-nowrap shrink-0"
          >
            <Building2 className="h-5 w-5 text-[#2F7CF6]" />
            <span className="text-sm font-bold tracking-tight text-white">
              KITNET PRO STUDIO
            </span>
          </button>

          <span className="hidden text-slate-700 sm:inline" aria-hidden="true">
            /
          </span>

          {/* Quick Project Switcher */}
          <select
            aria-label="Selecionar projeto ativo"
            value={activeProject.id}
            onChange={(e) => handleOpenProject(e.target.value)}
            className="hidden max-w-[280px] truncate rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-slate-500 sm:block"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden font-mono text-[11px] text-slate-400 md:inline whitespace-nowrap">
            {saveState === 'saving'
              ? 'Salvando...'
              : saveState === 'error'
                ? 'Erro ao salvar'
                : 'Salvo automaticamente'}
          </span>

          <div className="flex items-center rounded border border-slate-700 bg-[#14161A]">
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="p-1.5 text-slate-300 hover:text-white disabled:opacity-35"
              title="Desfazer"
              aria-label="Desfazer"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="border-l border-slate-700 p-1.5 text-slate-300 hover:text-white disabled:opacity-35"
              title="Refazer"
              aria-label="Refazer"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setAssistantOpen(true)}
            className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-[#2F7CF6] hover:text-white whitespace-nowrap shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#2F7CF6]" />
            Assistente
          </button>

          <button
            type="button"
            onClick={handleQuickExportZIP}
            disabled={exportingZip}
            className="inline-flex items-center gap-1.5 rounded bg-[#2F7CF6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2567d4] disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <Archive className="h-3.5 w-3.5" />
            {exportingZip ? 'Exportando...' : 'Exportar ZIP'}
          </button>
        </div>
      </header>

      {/* Row 2: Intuitive 6-Step Workflow Bar */}
      <nav
        aria-label="Etapas do projeto"
        className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-slate-800 bg-[#171A20] px-4 py-1.5"
      >
        {WORKFLOW_STEPS.map((step) => {
          const Icon = step.icon;
          const active = activeStep === step.id;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => setActiveStep(step.id)}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-[#2F7CF6] text-white'
                  : 'text-slate-300 hover:bg-[#222730] hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="font-mono text-[11px] opacity-80">{step.num}.</span>
              <span>{step.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Row 3: Contextual Sub-Navigation Bar (only on multi-view steps) */}
      {(activeStep === 'overview' ||
        activeStep === 'terreno' ||
        activeStep === 'planta2d' ||
        activeStep === 'engenharia') && (
        <div
          role="navigation"
          aria-label="Subseções da etapa"
          className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-800/80 bg-[#12151B] px-4 py-1.5"
        >
          <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap shrink-0">
            Visualização:
          </span>

          {activeStep === 'overview' && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setOverviewSubTab('painel')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition whitespace-nowrap shrink-0 ${
                  overviewSubTab === 'painel'
                    ? 'bg-[#222730] text-white border border-slate-700'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Painel Guiado
              </button>
              <button
                type="button"
                onClick={() => setOverviewSubTab('projetos')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition whitespace-nowrap shrink-0 ${
                  overviewSubTab === 'projetos'
                    ? 'bg-[#222730] text-white border border-slate-700'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Meus Projetos ({projects.length})
              </button>
            </div>
          )}

          {activeStep === 'terreno' && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setTerrenoSubTab('terreno')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition whitespace-nowrap shrink-0 ${
                  terrenoSubTab === 'terreno'
                    ? 'bg-[#222730] text-white border border-slate-700'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Terreno & Pavimentos
              </button>
              <button
                type="button"
                onClick={() => setTerrenoSubTab('urbanismo')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition whitespace-nowrap shrink-0 ${
                  terrenoSubTab === 'urbanismo'
                    ? 'bg-[#222730] text-white border border-slate-700'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Leis Urbanísticas
              </button>
            </div>
          )}

          {activeStep === 'planta2d' && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPlantaSubTab('editor2d')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition whitespace-nowrap shrink-0 ${
                  plantaSubTab === 'editor2d'
                    ? 'bg-[#222730] text-white border border-slate-700'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Editor CAD 2D
              </button>
              <button
                type="button"
                onClick={() => setPlantaSubTab('tipologias')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition whitespace-nowrap shrink-0 ${
                  plantaSubTab === 'tipologias'
                    ? 'bg-[#222730] text-white border border-slate-700'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Tipologias ({activeProject.unitTypes.length})
              </button>
            </div>
          )}

          {activeStep === 'engenharia' && (
            <div className="flex items-center gap-1">
              {(
                [
                  ['quantitativos', 'Quantitativos & Custos'],
                  ['compatibilizacao', 'Compatibilização & NBR'],
                  ['eletrica', 'Elétrica'],
                  ['hidraulica', 'Hidráulica & Sanitária'],
                  ['construcao', 'Sistema & Estrutura'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setEngSubTab(id)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition whitespace-nowrap shrink-0 ${
                    engSubTab === id
                      ? 'bg-[#222730] text-white border border-slate-700'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <main className="min-h-0 flex-1 overflow-hidden bg-[#14161A]">
        {activeStep === 'overview' && overviewSubTab === 'painel' && (
          <div className="h-full overflow-y-auto">
            <OverviewDashboard
              project={activeProject}
              projectsCount={projects.length}
              onNavigateStep={(step, subTab) => {
                setActiveStep(step);
                if (step === 'terreno' && subTab) setTerrenoSubTab(subTab as TerrenoSubTab);
                if (step === 'planta2d' && subTab) setPlantaSubTab(subTab as PlantaSubTab);
                if (step === 'engenharia' && subTab) setEngSubTab(subTab as EngSubTab);
              }}
              onOpenProjectsManager={() => setOverviewSubTab('projetos')}
              onCreateNewProject={() => {
                setOverviewSubTab('projetos');
                setOpenNewModalSignal((n) => n + 1);
              }}
            />
          </div>
        )}

        {activeStep === 'overview' && overviewSubTab === 'projetos' && (
          <div className="h-full overflow-y-auto">
            <ProjectHub
              projects={projects}
              activeProjectId={activeProject.id}
              openNewModalSignal={openNewModalSignal}
              onOpenProject={handleOpenProject}
              onCreateProject={handleCreateProject}
              onDuplicateProject={handleDuplicateProject}
              onToggleArchiveProject={handleToggleArchiveProject}
              onDeleteProject={handleDeleteProject}
              onImportProjectJSON={handleImportProjectJSON}
              onNavigateModule={navigateFromLegacyModule}
            />
          </div>
        )}

        {activeStep === 'terreno' && terrenoSubTab === 'terreno' && (
          <div className="h-full overflow-y-auto">
            <SiteModule project={activeProject} onUpdateProject={handleUpdateProject} />
          </div>
        )}

        {activeStep === 'terreno' && terrenoSubTab === 'urbanismo' && (
          <div className="h-full overflow-y-auto">
            <UrbanismModule project={activeProject} onUpdateProject={handleUpdateProject} />
          </div>
        )}

        {activeStep === 'planta2d' && plantaSubTab === 'editor2d' && (
          <FloorPlanEditor2D
            project={activeProject}
            selectedUnitTypeId={selectedUnitTypeId}
            onSelectUnitType={setSelectedUnitTypeId}
            onUpdateProject={handleUpdateProject}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
          />
        )}

        {activeStep === 'planta2d' && plantaSubTab === 'tipologias' && (
          <div className="h-full overflow-y-auto">
            <TypologiesModule
              project={activeProject}
              selectedUnitTypeId={selectedUnitTypeId}
              onSelectUnitType={setSelectedUnitTypeId}
              onUpdateProject={handleUpdateProject}
              onOpen2DEditor={() => setPlantaSubTab('editor2d')}
            />
          </div>
        )}

        {activeStep === 'bim3d' && (
          <Bim3DViewport project={activeProject} onUpdateProject={handleUpdateProject} />
        )}

        {activeStep === 'engenharia' && engSubTab === 'quantitativos' && (
          <QuantitiesAndBudgetModule
            project={activeProject}
            onUpdateProject={handleUpdateProject}
          />
        )}

        {activeStep === 'engenharia' && engSubTab === 'compatibilizacao' && (
          <EngineeringComplianceModule
            project={activeProject}
            onUpdateProject={handleUpdateProject}
            onFocusUnitTypeIn2D={(utId) => {
              setSelectedUnitTypeId(utId);
              setActiveStep('planta2d');
              setPlantaSubTab('editor2d');
            }}
            onOpen3D={() => setActiveStep('bim3d')}
          />
        )}

        {activeStep === 'engenharia' && engSubTab === 'eletrica' && (
          <div className="h-full overflow-y-auto">
            <MepElectricalModule
              project={activeProject}
              selectedUnitTypeId={selectedUnitTypeId}
              onSelectUnitType={setSelectedUnitTypeId}
              onUpdateProject={handleUpdateProject}
            />
          </div>
        )}

        {activeStep === 'engenharia' && engSubTab === 'hidraulica' && (
          <div className="h-full overflow-y-auto">
            <MepHydraulicSanitaryModule
              project={activeProject}
              selectedUnitTypeId={selectedUnitTypeId}
              onSelectUnitType={setSelectedUnitTypeId}
              onUpdateProject={handleUpdateProject}
            />
          </div>
        )}

        {activeStep === 'engenharia' && engSubTab === 'construcao' && (
          <ConstructionAndStructureModule
            project={activeProject}
            selectedUnitTypeId={selectedUnitTypeId}
            onSelectUnitType={setSelectedUnitTypeId}
            onUpdateProject={handleUpdateProject}
          />
        )}

        {activeStep === 'documentacao' && (
          <DocumentationAndExportModule
            project={activeProject}
            onUpdateProject={handleUpdateProject}
          />
        )}
      </main>

      {/* Contextual Step Guidance Footer (omitted on 3D view so 3D dock stays unobstructed) */}
      {activeStep !== 'bim3d' && (
        <footer className="flex h-10 shrink-0 items-center justify-between gap-4 border-t border-slate-800 bg-[#171A20] px-4 text-xs">
          <div className="flex items-center gap-2 shrink-0">
            {prevStepMeta ? (
              <button
                type="button"
                onClick={() => setActiveStep(prevStepMeta.id)}
                className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-[#1B1E24] px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-slate-500 hover:text-white whitespace-nowrap"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {prevStepMeta.label}
              </button>
            ) : (
              <span className="text-slate-500 whitespace-nowrap">Etapa 1 de 6</span>
            )}
          </div>

          <p className="hidden truncate text-center text-[11px] text-slate-400 lg:block">
            {currentStepMeta.tip}
          </p>

          <div className="flex items-center gap-2 shrink-0">
            {nextStepMeta ? (
              <button
                type="button"
                onClick={() => setActiveStep(nextStepMeta.id)}
                className="inline-flex items-center gap-1.5 rounded bg-[#2F7CF6]/15 border border-[#2F7CF6]/50 px-3 py-1 text-xs font-medium text-white hover:bg-[#2F7CF6] whitespace-nowrap"
              >
                Próximo: {nextStepMeta.label}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleQuickExportZIP}
                className="inline-flex items-center gap-1.5 rounded bg-[#2F7CF6] px-3 py-1 text-xs font-medium text-white hover:bg-[#2567d4] whitespace-nowrap"
              >
                <Archive className="h-3.5 w-3.5" />
                Baixar Pacote Completo
              </button>
            )}
          </div>
        </footer>
      )}

      <AssistantDrawer
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        project={activeProject}
        onAuthorizeTypology={handleAuthorizeTypology}
      />
    </div>
  );
}

export default App;
