import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  Archive,
  ArrowRight,
  Bath,
  Box,
  Building2,
  Calculator,
  Camera,
  Cloud,
  CloudOff,
  FileText,
  FolderKanban,
  LogIn,
  LogOut,
  MapPin,
  PenTool,
  Redo2,
  Sparkles,
  Trees,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { AssistantDrawer } from './components/AssistantDrawer';
import { Bim3DViewport } from './components/Bim3DViewport';
import { CinematicRenderStudio } from './components/CinematicRenderStudio';
import { ConstructionAndStructureModule } from './components/ConstructionAndStructureModule';
import { DocumentationAndExportModule } from './components/DocumentationAndExportModule';
import { EngineeringComplianceModule } from './components/EngineeringComplianceModule';
import { FinishesAndFixturesModule } from './components/FinishesAndFixturesModule';
import { FloorPlanEditor2D } from './components/FloorPlanEditor2D';
import { LandscapingModule } from './components/LandscapingModule';
import { MepElectricalModule } from './components/MepElectricalModule';
import { MepHydraulicSanitaryModule } from './components/MepHydraulicSanitaryModule';
import { ProjectHub } from './components/ProjectHub';
import { QuantitiesAndBudgetModule } from './components/QuantitiesAndBudgetModule';
import { SiteModule } from './components/SiteModule';
import { TypologiesModule } from './components/TypologiesModule';
import { UrbanismModule } from './components/UrbanismModule';
import { generateCompleteProjectZIPBlob, triggerBrowserDownload } from './engine/exporters';
import { createBlankProject } from './engine/parametricGenerator';
import {
  appendRevision,
  clearLegacyBrowserCache,
  deleteProjectFromFirestore,
  deleteRenderFromFirestore,
  duplicateProjectRecord,
  loadUserProjectsFromFirestore,
  saveProjectToFirestore,
  saveRenderToFirestore,
  setProjectStatusRecord,
  upsertUserProfile,
} from './engine/storage';
import { auth, googleProvider } from './firebase';
import type {
  CapturedRender,
  ConstructionMethodId,
  Project,
  ProjectStatus,
  UnitType,
} from './types/project';

type PrimaryStepId =
  | 'terreno'
  | 'paisagismo'
  | 'planta2d'
  | 'acabamentos'
  | 'bim3d'
  | 'render_studio'
  | 'engenharia'
  | 'documentacao';
type TerrenoSubTab = 'terreno' | 'urbanismo';
type PlantaSubTab = 'tipologias' | 'editor2d';
type EngSubTab = 'quantitativos' | 'compatibilizacao' | 'eletrica' | 'hidraulica' | 'construcao';

const BRAZIL_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const WORKFLOW_STEPS: Array<{
  id: PrimaryStepId;
  num: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'terreno', num: '1', label: 'Terreno & Lote', icon: MapPin },
  { id: 'paisagismo', num: '2', label: 'Paisagismo', icon: Trees },
  { id: 'planta2d', num: '3', label: 'Tipologias & 2D', icon: PenTool },
  { id: 'acabamentos', num: '4', label: 'Acabamentos', icon: Bath },
  { id: 'bim3d', num: '5', label: 'BIM 3D', icon: Box },
  { id: 'render_studio', num: '6', label: 'Render 3D', icon: Camera },
  { id: 'engenharia', num: '7', label: 'Engenharia', icon: Calculator },
  { id: 'documentacao', num: '8', label: 'Pranchas & Docs', icon: FileText },
];

export function App() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [selectedUnitTypeId, setSelectedUnitTypeId] = useState<string>('');

  const [activeStep, setActiveStep] = useState<PrimaryStepId>('terreno');
  const [terrenoSubTab, setTerrenoSubTab] = useState<TerrenoSubTab>('terreno');
  const [plantaSubTab, setPlantaSubTab] = useState<PlantaSubTab>('tipologias');
  const [engSubTab, setEngSubTab] = useState<EngSubTab>('quantitativos');

  const [projectsHubOpen, setProjectsHubOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const [saveState, setSaveState] = useState<'loading' | 'saved' | 'saving' | 'error'>('saved');
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);

  // Zero-state onboarding form states (strictly empty, no pre-filled fake defaults)
  const [zeroName, setZeroName] = useState('');
  const [zeroClient, setZeroClient] = useState('');
  const [zeroMunicipality, setZeroMunicipality] = useState('');
  const [zeroState, setZeroState] = useState('');
  const [zeroFront, setZeroFront] = useState('');
  const [zeroDepth, setZeroDepth] = useState('');
  const [zeroFloors, setZeroFloors] = useState('');
  const [zeroMethod, setZeroMethod] = useState<ConstructionMethodId>('alvenaria_convencional');
  const [zeroError, setZeroError] = useState<string | null>(null);
  const zeroFileRef = useRef<HTMLInputElement>(null);

  const [undoStack, setUndoStack] = useState<Project[]>([]);
  const [redoStack, setRedoStack] = useState<Project[]>([]);
  const saveTimerRef = useRef<number | null>(null);

  // Purge any legacy localStorage / IndexedDB cache immediately on mount
  useEffect(() => {
    clearLegacyBrowserCache();
  }, []);

  // Firebase Auth & Cloud Firestore Sync
  useEffect(() => {
    let mounted = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!mounted) return;
      if (!user) {
        setAuthUser(null);
        setAuthReady(true);
        setProjects([]);
        setActiveProjectId('');
        setSelectedUnitTypeId('');
        setIsStorageLoaded(true);
        setSaveState('saved');
        setCloudError(null);
        return;
      }

      if (!user.emailVerified) {
        setAuthUser(null);
        setAuthReady(true);
        setAuthError(
          'Sua conta precisa de um e-mail verificado para acessar o banco de dados Firebase Firestore.',
        );
        setIsStorageLoaded(true);
        return;
      }

      setAuthUser(user);
      setAuthReady(true);
      setAuthError(null);
      setIsStorageLoaded(false);
      setSaveState('loading');
      setCloudError(null);

      try {
        await upsertUserProfile(user);
        const loaded = await loadUserProjectsFromFirestore(user.uid);
        if (!mounted) return;
        setProjects(loaded);
        if (loaded.length > 0) {
          setActiveProjectId(loaded[0].id);
          setSelectedUnitTypeId(loaded[0].unitTypes[0]?.id ?? '');
          setActiveStep(loaded[0].unitTypes.length > 0 ? 'planta2d' : 'terreno');
          setPlantaSubTab(loaded[0].unitTypes.length > 0 ? 'editor2d' : 'tipologias');
        } else {
          setActiveProjectId('');
          setSelectedUnitTypeId('');
        }
        setSaveState('saved');
        setIsStorageLoaded(true);
      } catch (err) {
        if (!mounted) return;
        setProjects([]);
        setActiveProjectId('');
        setSelectedUnitTypeId('');
        setSaveState('error');
        setCloudError(
          err instanceof Error
            ? err.message
            : 'Falha ao carregar projetos no Firebase Firestore.',
        );
        setIsStorageLoaded(true);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
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

  const handleGoogleSignIn = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('Login cancelado antes da conclusão.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          'O navegador bloqueou o popup de login Google. Permita popups para continuar.',
        );
      } else {
        setAuthError('Não foi possível autenticar com o Google no Firebase Auth.');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await signOut(auth);
  };

  const schedulePersist = useCallback(
    (projectToSave: Project) => {
      if (!authUser) return;
      const uid = authUser.uid;
      setSaveState('saving');
      setCloudError(null);
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveProjectToFirestore(projectToSave, uid)
          .then(() => setSaveState('saved'))
          .catch((err) => {
            setSaveState('error');
            setCloudError(err instanceof Error ? err.message : 'Erro ao gravar no Firestore.');
          });
      }, 400);
    },
    [authUser],
  );

  const authorLabel = authUser?.displayName || authUser?.email || 'Usuário';

  const handleUpdateProject = useCallback(
    (updater: (prev: Project) => Project, revisionNote?: string) => {
      setProjects((prevList) => {
        const current = prevList.find((p) => p.id === activeProjectId) ?? prevList[0];
        if (!current) return prevList;
        let next = updater(current);
        if (revisionNote) {
          next = appendRevision(next, revisionNote, authorLabel);
        } else {
          next = { ...next, updatedAt: new Date().toISOString() };
        }
        setUndoStack((u) => [...u.slice(-49), current]);
        setRedoStack([]);
        schedulePersist(next);
        return prevList.map((p) => (p.id === current.id ? next : p));
      });
    },
    [activeProjectId, authorLabel, schedulePersist],
  );

  const handleSaveRenderToCloud = useCallback(
    async (render: CapturedRender) => {
      if (!authUser || !activeProject) return;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      setSaveState('saving');
      try {
        await saveProjectToFirestore(activeProject, authUser.uid);
        await saveRenderToFirestore(activeProject.id, authUser.uid, render);
        setSaveState('saved');
      } catch (err) {
        setSaveState('error');
        setCloudError(
          err instanceof Error ? err.message : 'Erro ao salvar render 3D no Firestore.',
        );
      }
    },
    [authUser, activeProject],
  );

  const handleDeleteRenderFromCloud = useCallback(
    async (renderId: string) => {
      if (!authUser || !activeProject) return;
      try {
        await deleteRenderFromFirestore(activeProject.id, renderId);
      } catch (err) {
        setSaveState('error');
        setCloudError(
          err instanceof Error ? err.message : 'Erro ao excluir render 3D do Firestore.',
        );
      }
    },
    [authUser, activeProject],
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

  const navigateFromModule = (moduleId: string) => {
    setProjectsHubOpen(false);
    switch (moduleId) {
      case 'terreno':
        setActiveStep('terreno');
        setTerrenoSubTab('terreno');
        break;
      case 'paisagismo':
        setActiveStep('paisagismo');
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
      case 'acabamentos':
        setActiveStep('acabamentos');
        break;
      case 'bim3d':
        setActiveStep('bim3d');
        break;
      case 'render_studio':
        setActiveStep('render_studio');
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
        setActiveStep('terreno');
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
    setProjectsHubOpen(false);
    if (target.unitTypes.length === 0) {
      setActiveStep('terreno');
      setTerrenoSubTab('terreno');
    } else {
      setActiveStep('planta2d');
      setPlantaSubTab('editor2d');
    }
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
    measurementUnit?: 'm' | 'cm';
    streetSide?: 'baixo' | 'cima' | 'esquerda' | 'direita';
  }) => {
    if (!authUser) return;
    const created = createBlankProject(params);
    setProjects((list) => [created, ...list]);
    setActiveProjectId(created.id);
    setSelectedUnitTypeId('');
    setUndoStack([]);
    setRedoStack([]);
    setProjectsHubOpen(false);
    setSaveState('saving');
    saveProjectToFirestore(created, authUser.uid, { isNew: true })
      .then(() => setSaveState('saved'))
      .catch((err) => {
        setSaveState('error');
        setCloudError(err instanceof Error ? err.message : 'Erro ao criar projeto no Firestore.');
      });
    setActiveStep('terreno');
    setTerrenoSubTab('terreno');
  };

  const handleDuplicateProject = (id: string) => {
    if (!authUser) return;
    const src = projects.find((p) => p.id === id);
    if (!src) return;
    const copy = duplicateProjectRecord(src, undefined, authorLabel);
    setProjects((list) => [copy, ...list]);
    setActiveProjectId(copy.id);
    setSaveState('saving');
    saveProjectToFirestore(copy, authUser.uid, { isNew: true })
      .then(() => setSaveState('saved'))
      .catch(() => setSaveState('error'));
  };

  const handleToggleArchiveProject = (id: string, nextStatus: ProjectStatus) => {
    if (!authUser) return;
    const uid = authUser.uid;
    setProjects((list) =>
      list.map((p) => {
        if (p.id !== id) return p;
        const updated = setProjectStatusRecord(p, nextStatus);
        saveProjectToFirestore(updated, uid).catch(() => setSaveState('error'));
        return updated;
      }),
    );
  };

  const handleDeleteProject = (id: string) => {
    if (!authUser) return;
    deleteProjectFromFirestore(id, authUser.uid).catch((err) => {
      setSaveState('error');
      setCloudError(err instanceof Error ? err.message : 'Erro ao excluir projeto do Firestore.');
    });
    setProjects((list) => {
      const remaining = list.filter((p) => p.id !== id);
      if (remaining.length === 0) {
        setActiveProjectId('');
        setSelectedUnitTypeId('');
        setProjectsHubOpen(false);
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
    if (!authUser) return;
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
    setProjectsHubOpen(false);
    setSaveState('saving');
    saveProjectToFirestore(stamped, authUser.uid, { isNew: true })
      .then(async () => {
        for (const r of stamped.capturedRenders ?? []) {
          if (r.dataUrl && r.dataUrl.length <= 750000) {
            await saveRenderToFirestore(stamped.id, authUser.uid, r);
          }
        }
        setSaveState('saved');
      })
      .catch((err) => {
        setSaveState('error');
        setCloudError(
          err instanceof Error ? err.message : 'Erro ao importar projeto para o Firestore.',
        );
      });
    setActiveStep(stamped.unitTypes.length > 0 ? 'planta2d' : 'terreno');
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
    const frontNum = Number(zeroFront);
    const depthNum = Number(zeroDepth);
    const floorsNum = Number(zeroFloors);

    if (!zeroName.trim()) {
      setZeroError('Informe o nome do empreendimento para começar.');
      return;
    }
    if (!Number.isFinite(frontNum) || frontNum < 4 || !Number.isFinite(depthNum) || depthNum < 6) {
      setZeroError(
        'Informe frente (>= 4,0 m) e profundidade (>= 6,0 m) válidas para o terreno.',
      );
      return;
    }
    if (!Number.isFinite(floorsNum) || floorsNum < 1 || floorsNum > 20) {
      setZeroError('Informe entre 1 e 20 pavimentos.');
      return;
    }
    setZeroError(null);
    handleCreateProject({
      name: zeroName,
      client: zeroClient,
      municipality: zeroMunicipality,
      state: zeroState,
      front: frontNum,
      depth: depthNum,
      floorsCount: Math.round(floorsNum),
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

  // 1. Auth Initialization Screen
  if (!authReady) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center overflow-hidden bg-[#14161A] text-sm text-slate-300">
        Inicializando sessão segura no Firebase...
      </div>
    );
  }

  // 2. Firebase Google Auth Gate (zero localStorage / zero unauthenticated demo projects)
  if (!authUser) {
    return (
      <div className="flex h-dvh w-screen flex-col overflow-hidden bg-[#14161A] text-slate-100">
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-slate-800 bg-[#1B1E24] px-5">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#2F7CF6]" />
            <span className="text-sm font-bold tracking-tight text-white">KITNET PRO STUDIO</span>
          </div>
          <span className="font-mono text-xs text-slate-400">
            Firebase Firestore · Sem Cache Local
          </span>
        </header>

        <main className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-[#1B1E24] p-6 shadow-2xl space-y-4">
            <div className="space-y-2 border-b border-slate-800 pb-4">
              <div className="inline-flex items-center gap-1.5 rounded border border-[#2F7CF6]/40 bg-[#2F7CF6]/10 px-2.5 py-1 text-[11px] font-mono text-sky-300">
                <Cloud className="h-3.5 w-3.5" />
                Nuvem Privada Firebase Firestore + SINAPI-RJ
              </div>
              <h1 className="text-xl font-semibold text-white">
                Estúdio Executivo de Arquitetura &amp; Engenharia
              </h1>
              <p className="text-xs leading-relaxed text-slate-400">
                Entre com sua conta Google para acessar seus projetos isolados no banco de dados{' '}
                <strong className="text-slate-200">Firebase Firestore</strong>. Nenhum projeto fictício ou cache em navegador é carregado.
              </p>
            </div>

            {authError && (
              <div className="rounded border border-red-500/40 bg-red-950/30 px-3.5 py-2.5 text-xs text-red-200">
                {authError}
              </div>
            )}

            <ul className="space-y-2 text-xs text-slate-300">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2F7CF6]" />
                Criação 100% do zero: terreno, tipologias paramétricas, planta 2D AutoCAD e modelo BIM 3D PBR.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2F7CF6]" />
                Orçamento analítico integrado à base referencial <strong className="text-white">CAIXA SINAPI-RJ</strong> (com e sem desoneração) e cronograma físico-financeiro.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2F7CF6]" />
                Documentação executiva completa: 28 pranchas PDF/DXF, Memoriais DOCX/PDF e Planilha XLSX 7 abas em pacote ZIP.
              </li>
            </ul>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={authBusy}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-[#2F7CF6] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2567d4] disabled:opacity-60"
            >
              <LogIn className="h-4 w-4" />
              {authBusy ? 'Conectando ao Google...' : 'Entrar com Google'}
            </button>
          </div>
        </main>
      </div>
    );
  }

  // 3. Loading user's Firestore projects
  if (!isStorageLoaded) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center overflow-hidden bg-[#14161A] text-sm text-slate-300">
        Sincronizando empreendimentos no Firebase Firestore...
      </div>
    );
  }

  // 4. Zero-Projects Onboarding (blank fields, zero fake data)
  if (!activeProject) {
    return (
      <div className="flex h-dvh w-screen flex-col overflow-hidden bg-[#14161A] text-slate-100">
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-slate-800 bg-[#1B1E24] px-5">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#2F7CF6]" />
            <span className="text-sm font-bold tracking-tight text-white">KITNET PRO STUDIO</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-xs text-slate-400 sm:inline">
              0 Projetos · {authUser.email}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 text-xs text-slate-300 hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-800 bg-[#1B1E24] p-5 shadow-2xl space-y-3">
            <div className="border-b border-slate-800 pb-3">
              <h1 className="text-lg font-semibold text-white">
                Criar Primeiro Empreendimento do Zero
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                Informe os parâmetros reais do seu lote e sistema construtivo — salvos exclusivamente via Firebase Firestore.
              </p>
            </div>

            {cloudError && (
              <div className="rounded border border-red-500/40 bg-red-950/30 px-3.5 py-2.5 text-xs text-red-200">
                {cloudError}
              </div>
            )}

            {zeroError && (
              <div className="rounded border border-red-500/40 bg-red-950/30 px-3.5 py-2.5 text-xs text-red-200">
                {zeroError}
              </div>
            )}

            <form onSubmit={handleZeroCreateSubmit} className="space-y-4">
              <div className="grid gap-3.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-300">
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
                  <label className="mb-1 block text-[11px] font-medium text-slate-300">
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
                  <label className="mb-1 block text-[11px] font-medium text-slate-300">
                    Município
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Rio de Janeiro"
                    value={zeroMunicipality}
                    onChange={(e) => setZeroMunicipality(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-2 text-xs text-white focus:border-[#2F7CF6] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-300">
                    UF (Estado)
                  </label>
                  <select
                    value={zeroState}
                    onChange={(e) => setZeroState(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-2 font-mono text-xs text-white focus:border-[#2F7CF6] focus:outline-none"
                  >
                    <option value="">Selecione...</option>
                    {BRAZIL_UFS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3.5 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-300">
                    Frente do Lote (m) *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={4}
                    placeholder="Ex: 12"
                    value={zeroFront}
                    onChange={(e) => setZeroFront(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-2 font-mono text-xs tabular-nums text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-300">
                    Profundidade (m) *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={6}
                    placeholder="Ex: 25"
                    value={zeroDepth}
                    onChange={(e) => setZeroDepth(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-2 font-mono text-xs tabular-nums text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-300">
                    Pavimentos *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    placeholder="Ex: 2"
                    value={zeroFloors}
                    onChange={(e) => setZeroFloors(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-2 font-mono text-xs tabular-nums text-white"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-300">
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
                Orçamento analítico pré-integrado à base referencial{' '}
                <strong className="text-slate-200">CAIXA SINAPI-RJ (Com Desoneração)</strong> assim que unidades forem posicionadas, com alternância automática para Sem Desoneração ou edição manual.
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
                  className="inline-flex items-center gap-2 rounded-md bg-[#2F7CF6] px-5 py-2 text-xs font-semibold text-white hover:bg-[#2567d4] whitespace-nowrap"
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

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-[#14161A] text-slate-100">
      {/* Compact Top Command Bar (h-11) */}
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-[#1B1E24] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <Building2 className="h-4 w-4 text-[#2F7CF6]" />
            <span className="text-xs font-bold tracking-tight text-white">KITNET PRO STUDIO</span>
          </div>

          <span className="hidden text-slate-700 sm:inline" aria-hidden="true">
            /
          </span>

          <select
            aria-label="Selecionar empreendimento ativo"
            value={activeProject.id}
            onChange={(e) => handleOpenProject(e.target.value)}
            className="hidden max-w-[240px] truncate rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-slate-500 sm:block"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setProjectsHubOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition ${
              projectsHubOpen
                ? 'border-[#2F7CF6] bg-[#2F7CF6]/20 text-white'
                : 'border-slate-700 bg-[#14161A] text-slate-300 hover:border-slate-500 hover:text-white'
            }`}
          >
            <FolderKanban className="h-3.5 w-3.5 text-[#2F7CF6]" />
            Projetos ({projects.length})
          </button>

          <button
            type="button"
            onClick={() => navigateFromModule('terreno')}
            title="Configurar quantidade de andares, repetições e implantação no lote"
            className="hidden md:inline-flex items-center gap-1.5 rounded border border-slate-700/80 bg-[#14161A] px-2.5 py-1 text-[11px] font-mono text-sky-300 hover:border-[#2F7CF6] hover:text-white whitespace-nowrap shrink-0 transition"
          >
            {activeProject.floors.length} {activeProject.floors.length === 1 ? 'andar' : 'andares'} ·{' '}
            {activeProject.floors.reduce((s, f) => s + f.units.length, 0)} kitnets
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`hidden items-center gap-1.5 font-mono text-[11px] xl:inline-flex whitespace-nowrap ${
              saveState === 'error'
                ? 'text-red-400'
                : saveState === 'saving'
                  ? 'text-amber-300'
                  : 'text-emerald-400'
            }`}
            title={cloudError ?? 'Sincronizado com Firebase Firestore'}
          >
            {saveState === 'error' ? (
              <CloudOff className="h-3.5 w-3.5" />
            ) : (
              <Cloud className="h-3.5 w-3.5" />
            )}
            {saveState === 'saving'
              ? 'Salvando no Firebase...'
              : saveState === 'error'
                ? 'Erro Firebase'
                : 'Sincronizado no Firebase'}
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
            <span className="hidden sm:inline">Assistente</span>
          </button>

          <button
            type="button"
            onClick={handleQuickExportZIP}
            disabled={exportingZip}
            className="inline-flex items-center gap-1.5 rounded bg-[#2F7CF6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2567d4] disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <Archive className="h-3.5 w-3.5" />
            <span className="hidden md:inline">
              {exportingZip ? 'Exportando...' : 'Exportar ZIP'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            title={`Sessão: ${authUser.email}`}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#14161A] px-2 py-1.5 text-xs text-slate-300 hover:border-slate-500 hover:text-white whitespace-nowrap shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Sair</span>
          </button>
        </div>
      </header>

      {cloudError && (
        <div className="flex shrink-0 items-center justify-between border-b border-red-500/40 bg-red-950/50 px-4 py-1.5 text-xs text-red-200">
          <span>{cloudError}</span>
          <button
            type="button"
            onClick={() => setCloudError(null)}
            className="text-red-300 hover:text-white"
            aria-label="Fechar aviso"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Single-Row Top Workflow Navigation Ribbon (reclaims 224px sidebar width) */}
      <nav
        aria-label="Navegação das etapas do projeto"
        className="flex h-9 shrink-0 items-center justify-between gap-1 border-b border-slate-800 bg-[#171A20] px-3"
      >
        <div className="grid w-full grid-cols-8 gap-1">
          {WORKFLOW_STEPS.map((step) => {
            const Icon = step.icon;
            const active = !projectsHubOpen && activeStep === step.id;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => {
                  setProjectsHubOpen(false);
                  setActiveStep(step.id);
                }}
                title={`${step.num}. ${step.label}`}
                className={`flex items-center justify-center gap-1.5 rounded px-2 py-1 text-[11.5px] font-medium transition whitespace-nowrap min-w-0 ${
                  active
                    ? 'bg-[#2F7CF6] text-white'
                    : 'text-slate-300 hover:bg-[#222730] hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="font-mono text-[10px] opacity-80 shrink-0">{step.num}.</span>
                <span className="truncate">{step.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Slim Contextual Sub-Navigation Ribbon (Desktop & Mobile unified, zero scroll) */}
      {!projectsHubOpen &&
        (activeStep === 'terreno' || activeStep === 'planta2d' || activeStep === 'engenharia') && (
          <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-slate-800 bg-[#12151B] px-3">
            <span className="hidden text-[10px] font-mono uppercase tracking-wider text-slate-500 sm:inline">
              Submódulo:
            </span>
            {activeStep === 'terreno' &&
              (
                [
                  ['terreno', 'Implantação, Repetições & Andares'],
                  ['urbanismo', 'Leis Urbanísticas & Índices'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTerrenoSubTab(id)}
                  className={`rounded px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition ${
                    terrenoSubTab === id
                      ? 'bg-[#222730] text-white border border-slate-700'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            {activeStep === 'planta2d' &&
              (
                [
                  ['tipologias', `Tipologias (${activeProject.unitTypes.length})`],
                  ['editor2d', 'Editor CAD 2D'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPlantaSubTab(id)}
                  className={`rounded px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition ${
                    plantaSubTab === id
                      ? 'bg-[#222730] text-white border border-slate-700'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            {activeStep === 'engenharia' &&
              (
                [
                  ['quantitativos', 'Quantitativos & SINAPI-RJ'],
                  ['compatibilizacao', 'Compatibilização & NBR'],
                  ['eletrica', 'Elétrica & Especiais'],
                  ['hidraulica', 'Hidráulica & Sanitária'],
                  ['construcao', 'Sistema & Estrutura'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setEngSubTab(id)}
                  className={`rounded px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition ${
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

      {/* Full-Width Zero-Scroll Content Viewport */}
      <main className="min-h-0 flex-1 overflow-hidden bg-[#14161A]">
        {projectsHubOpen ? (
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex h-8 shrink-0 items-center justify-between border-b border-slate-800/70 px-4 text-xs text-slate-400">
              <span>Gerenciador de Empreendimentos na Nuvem (Firebase Firestore)</span>
              <button
                type="button"
                onClick={() => setProjectsHubOpen(false)}
                className="inline-flex items-center gap-1 rounded border border-slate-700 px-2.5 py-0.5 text-slate-200 hover:border-slate-500"
              >
                <X className="h-3.5 w-3.5" />
                Voltar ao Estúdio
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <ProjectHub
                projects={projects}
                activeProjectId={activeProject.id}
                onOpenProject={handleOpenProject}
                onCreateProject={handleCreateProject}
                onDuplicateProject={handleDuplicateProject}
                onToggleArchiveProject={handleToggleArchiveProject}
                onDeleteProject={handleDeleteProject}
                onImportProjectJSON={handleImportProjectJSON}
                onNavigateModule={navigateFromModule}
              />
            </div>
          </div>
        ) : (
          <div className="h-full w-full overflow-hidden">
            {activeStep === 'terreno' && terrenoSubTab === 'terreno' && (
              <SiteModule
                project={activeProject}
                onUpdateProject={handleUpdateProject}
                onNavigateModule={navigateFromModule}
                onSelectUnitType={setSelectedUnitTypeId}
              />
            )}

            {activeStep === 'terreno' && terrenoSubTab === 'urbanismo' && (
              <UrbanismModule project={activeProject} onUpdateProject={handleUpdateProject} />
            )}

            {activeStep === 'paisagismo' && (
              <LandscapingModule
                project={activeProject}
                onUpdateProject={handleUpdateProject}
                onOpenRenderStudio={() => setActiveStep('render_studio')}
              />
            )}

            {activeStep === 'planta2d' && plantaSubTab === 'tipologias' && (
              <TypologiesModule
                project={activeProject}
                selectedUnitTypeId={selectedUnitTypeId}
                onSelectUnitType={setSelectedUnitTypeId}
                onUpdateProject={handleUpdateProject}
                onOpen2DEditor={() => setPlantaSubTab('editor2d')}
                onOpenImplantation={() => navigateFromModule('terreno')}
              />
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
                onOpenImplantation={() => navigateFromModule('terreno')}
              />
            )}

            {activeStep === 'acabamentos' && (
              <FinishesAndFixturesModule
                project={activeProject}
                onUpdateProject={handleUpdateProject}
                onNavigateModule={navigateFromModule}
              />
            )}

            {activeStep === 'bim3d' && (
              <Bim3DViewport
                project={activeProject}
                onUpdateProject={handleUpdateProject}
                onSaveRender={handleSaveRenderToCloud}
              />
            )}

            {activeStep === 'render_studio' && (
              <CinematicRenderStudio
                project={activeProject}
                onUpdateProject={handleUpdateProject}
                onSaveRender={handleSaveRenderToCloud}
              />
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
              <MepElectricalModule
                project={activeProject}
                selectedUnitTypeId={selectedUnitTypeId}
                onSelectUnitType={setSelectedUnitTypeId}
                onUpdateProject={handleUpdateProject}
              />
            )}

            {activeStep === 'engenharia' && engSubTab === 'hidraulica' && (
              <MepHydraulicSanitaryModule
                project={activeProject}
                selectedUnitTypeId={selectedUnitTypeId}
                onSelectUnitType={setSelectedUnitTypeId}
                onUpdateProject={handleUpdateProject}
              />
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
                onDeleteRenderFromCloud={handleDeleteRenderFromCloud}
              />
            )}
          </div>
        )}
      </main>

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
