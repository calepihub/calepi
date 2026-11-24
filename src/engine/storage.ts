import type { User } from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../firebase';
import type { CapturedRender, Project, ProjectStatus } from '../types/project';

const LEGACY_DB_NAME = 'kitnet_pro_studio_db';
const LEGACY_LOCAL_KEY = 'kitnet_pro_studio_projects_v1';

// Tracks which project IDs already exist in Firestore so updates preserve createdAt
const persistedProjectIds = new Set<string>();

/**
 * Purges any legacy localStorage or IndexedDB cache from earlier builds
 * so zero simulated or cached projects ever persist in the browser.
 */
export function clearLegacyBrowserCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LEGACY_LOCAL_KEY);
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('kitnet_pro_studio')) {
        window.localStorage.removeItem(k);
      }
    }
  } catch {
    // ignore storage access errors
  }

  try {
    if (typeof window.indexedDB !== 'undefined') {
      window.indexedDB.deleteDatabase(LEGACY_DB_NAME);
    }
  } catch {
    // ignore indexedDB deletion errors
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively removes undefined values from plain objects/arrays while preserving
 * Firestore sentinel objects (serverTimestamp(), Timestamp, etc.).
 */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

function timestampToIso(value: unknown, fallbackIso?: string): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return fallbackIso ?? new Date().toISOString();
}

function normalizeId(rawId: string, prefix: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 128);
  return cleaned.length > 0
    ? cleaned
    : `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
}

function migrateProject(raw: Partial<Project>, renders: CapturedRender[] = []): Project {
  const createdAt = timestampToIso(raw.createdAt);
  const updatedAt = timestampToIso(raw.updatedAt, createdAt);
  return {
    ...(raw as Project),
    schemaVersion: 1,
    client: typeof raw.client === 'string' ? raw.client : 'Não informado',
    owner: typeof raw.owner === 'string' ? raw.owner : 'Não informado',
    address: typeof raw.address === 'string' ? raw.address : 'Não informado',
    municipality: typeof raw.municipality === 'string' ? raw.municipality : 'Não informado',
    state: typeof raw.state === 'string' ? raw.state : '',
    capturedRenders: renders,
    memorialOverrides: raw.memorialOverrides ?? {},
    revisions: raw.revisions ?? [],
    renderSettings: {
      ...raw.renderSettings!,
      wallExteriorFinish: raw.renderSettings?.wallExteriorFinish ?? 'textura_acrilica',
      wallInteriorFinish: raw.renderSettings?.wallInteriorFinish ?? 'pintura_fosca',
      wetWallBathroom: raw.renderSettings?.wetWallBathroom ?? 'porcelanato_marmorizado',
      wetWallKitchen: raw.renderSettings?.wetWallKitchen ?? 'azulejo_metro',
      wetFloorMaterial: raw.renderSettings?.wetFloorMaterial ?? 'porcelanato_antiderrapante',
      baseboardType: raw.renderSettings?.baseboardType ?? 'porcelanato_10cm',
      ceilingType: raw.renderSettings?.ceilingType ?? 'gesso_drywall_tabica',
      interiorDoorMaterial: raw.renderSettings?.interiorDoorMaterial ?? 'madeira_verniz_natural',
      glassType: raw.renderSettings?.glassType ?? 'temperado_incolor',
      roofShape: raw.renderSettings?.roofShape ?? 'platibanda',
      renderQuality: raw.renderSettings?.renderQuality ?? 'arquitetonico',
    },
    hydraulicConfig: {
      ...raw.hydraulicConfig!,
      sanitaryFixtures: {
        toiletType: raw.hydraulicConfig?.sanitaryFixtures?.toiletType ?? 'caixa_acoplada_dual',
        sanitaryWareColor: raw.hydraulicConfig?.sanitaryFixtures?.sanitaryWareColor ?? 'branco_gelo',
        showerType: raw.hydraulicConfig?.sanitaryFixtures?.showerType ?? 'eletrico_multitemperatura',
        washbasinType: raw.hydraulicConfig?.sanitaryFixtures?.washbasinType ?? 'cuba_apoio_granito',
        washbasinFaucet: raw.hydraulicConfig?.sanitaryFixtures?.washbasinFaucet ?? 'bica_alta_apoio',
        kitchenSinkType: raw.hydraulicConfig?.sanitaryFixtures?.kitchenSinkType ?? 'granito_cuba_inox',
        kitchenFaucet: raw.hydraulicConfig?.sanitaryFixtures?.kitchenFaucet ?? 'bica_movel_mesa',
        laundryTubType: raw.hydraulicConfig?.sanitaryFixtures?.laundryTubType ?? 'louca_suspensa',
        drainType: raw.hydraulicConfig?.sanitaryFixtures?.drainType ?? 'ralo_linear_oculto',
        metalsFinish: raw.hydraulicConfig?.sanitaryFixtures?.metalsFinish ?? 'cromado',
      },
    },
    budgetSettings: {
      ...raw.budgetSettings!,
      sinapiRegime: raw.budgetSettings?.sinapiRegime ?? 'desonerado',
    },
    createdAt,
    updatedAt,
  };
}

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SAFE_RENDER_DATAURL_REGEX = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

function stripDangerousObjectKeys<T>(value: T, depth = 0): T {
  if (depth > 24 || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripDangerousObjectKeys(item, depth + 1)) as unknown as T;
  }
  const src = value as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    if (BLOCKED_KEYS.has(key)) continue;
    clean[key] = stripDangerousObjectKeys(src[key], depth + 1);
  }
  return clean as T;
}

/**
 * Sanitiza e valida um JSON de projeto importado manualmente antes de aplicá-lo ao estado ou enviá-lo ao Firestore.
 */
export function sanitizeImportedProject(raw: unknown): Project {
  const clean = stripDangerousObjectKeys(raw);
  if (!clean || typeof clean !== 'object' || Array.isArray(clean)) {
    throw new Error('Estrutura JSON inválida: objeto de projeto esperado.');
  }
  const obj = clean as Partial<Project>;
  if (
    typeof obj.id !== 'string' ||
    !obj.id.trim() ||
    !obj.site ||
    !Array.isArray(obj.site.vertices) ||
    obj.site.vertices.length < 3 ||
    !Array.isArray(obj.floors) ||
    !obj.constructionMethod
  ) {
    throw new Error('Arquivo JSON incompatível: campos obrigatórios do empreendimento ausentes.');
  }

  const validRenders: CapturedRender[] = Array.isArray(obj.capturedRenders)
    ? obj.capturedRenders
        .filter(
          (r): r is CapturedRender =>
            Boolean(r) &&
            typeof r === 'object' &&
            typeof r.dataUrl === 'string' &&
            r.dataUrl.length <= 750000 &&
            SAFE_RENDER_DATAURL_REGEX.test(r.dataUrl),
        )
        .slice(0, 20)
        .map((r) => ({
          id: normalizeId(String(r.id || ''), 'rnd'),
          title: String(r.title || 'Perspectiva 3D').slice(0, 160),
          preset: String(r.preset || 'perspectiva').slice(0, 40),
          timeOfDay: String(r.timeOfDay || 'dia').slice(0, 24),
          dataUrl: r.dataUrl,
          createdAt: String(r.createdAt || new Date().toISOString()).slice(0, 64),
        }))
    : [];

  const bounded: Partial<Project> = {
    ...obj,
    id: normalizeId(obj.id, 'proj'),
    code: String(obj.code || 'KPS-IMP').slice(0, 48),
    name: String(obj.name || 'Empreendimento Importado').slice(0, 160),
    client: String(obj.client || 'Não informado').slice(0, 160),
    owner: String(obj.owner || 'Não informado').slice(0, 160),
    address: String(obj.address || 'Não informado').slice(0, 240),
    municipality: String(obj.municipality || 'Não informado').slice(0, 120),
    state: String(obj.state || '').slice(0, 8),
    status:
      obj.status === 'em_andamento' || obj.status === 'concluido' || obj.status === 'arquivado'
        ? obj.status
        : 'em_andamento',
    urbanRules: Array.isArray(obj.urbanRules) ? obj.urbanRules.slice(0, 40) : [],
    floors: obj.floors.slice(0, 20),
    unitTypes: Array.isArray(obj.unitTypes) ? obj.unitTypes.slice(0, 30) : [],
    structuralElements: Array.isArray(obj.structuralElements)
      ? obj.structuralElements.slice(0, 600)
      : [],
    rainwaterElements: Array.isArray(obj.rainwaterElements)
      ? obj.rainwaterElements.slice(0, 100)
      : [],
    professionals: Array.isArray(obj.professionals) ? obj.professionals.slice(0, 20) : [],
    budgetEntries: Array.isArray(obj.budgetEntries) ? obj.budgetEntries.slice(0, 250) : [],
    normativeRefs: Array.isArray(obj.normativeRefs) ? obj.normativeRefs.slice(0, 50) : [],
    revisions: Array.isArray(obj.revisions) ? obj.revisions.slice(-100) : [],
  };

  return migrateProject(bounded, validRenders);
}

/**
 * Converte erros de sincronização em mensagens seguras para a interface, sem expor metadados internos.
 */
export function formatCloudErrorForUI(err: unknown): string {
  const rawMsg = err instanceof Error ? err.message : String(err ?? '');
  const lower = rawMsg.toLowerCase();
  if (lower.includes('permission') || lower.includes('insufficient permissions')) {
    return 'Permissão negada na sincronização em nuvem. Verifique se sua conta está autenticada.';
  }
  if (lower.includes('quota')) {
    return 'Cota diária gratuita de leitura/escrita do banco excedida. Tente novamente mais tarde.';
  }
  if (lower.includes('offline') || lower.includes('unavailable') || lower.includes('network')) {
    return 'Sem conexão com a nuvem no momento. As alterações serão sincronizadas quando a rede retornar.';
  }
  if (lower.includes('750 kb') || lower.includes('1048576') || lower.includes('exceeds')) {
    return 'O tamanho do projeto ou imagem excede o limite suportado por documento.';
  }
  return 'Falha ao sincronizar alterações com a nuvem. Tente novamente em instantes.';
}

/**
 * Ensures the user's private profile exists and is kept fresh in /users/{uid}.
 */
export async function upsertUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const email = (user.email ?? 'usuario@kitnetpro.app').slice(0, 200);
  const displayName = (user.displayName ?? email.split('@')[0] ?? 'Arquiteto').slice(0, 120);

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        email,
        displayName,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

function buildFirestoreProjectPayload(project: Project, ownerId: string) {
  const safeId = normalizeId(project.id, 'proj');
  const base: Record<string, unknown> = {
    id: safeId,
    ownerId,
    schemaVersion: project.schemaVersion || 1,
    code: (project.code || 'KPS-001').slice(0, 48),
    name: (project.name || 'Novo Empreendimento').slice(0, 160),
    status: project.status,
    stage: project.stage,
    client: (project.client ?? 'Não informado').slice(0, 160),
    owner: (project.owner ?? 'Não informado').slice(0, 160),
    address: (project.address ?? 'Não informado').slice(0, 240),
    municipality: (project.municipality ?? 'Não informado').slice(0, 120),
    state: (project.state ?? '').slice(0, 8),
    site: stripUndefined(project.site),
    urbanRules: stripUndefined((project.urbanRules ?? []).slice(0, 40)),
    constructionMethod: stripUndefined(project.constructionMethod),
    floors: stripUndefined((project.floors ?? []).slice(0, 20)),
    unitTypes: stripUndefined((project.unitTypes ?? []).slice(0, 30)),
    structuralElements: stripUndefined((project.structuralElements ?? []).slice(0, 600)),
    rainwaterElements: stripUndefined((project.rainwaterElements ?? []).slice(0, 100)),
    rainwaterConfig: stripUndefined(project.rainwaterConfig),
    electricalHeights: stripUndefined(project.electricalHeights),
    hydraulicConfig: stripUndefined(project.hydraulicConfig),
    professionals: stripUndefined((project.professionals ?? []).slice(0, 20)),
    budgetEntries: stripUndefined((project.budgetEntries ?? []).slice(0, 250)),
    budgetSettings: stripUndefined(project.budgetSettings),
    normativeRefs: stripUndefined((project.normativeRefs ?? []).slice(0, 50)),
    renderSettings: stripUndefined(project.renderSettings),
    memorialOverrides: stripUndefined(project.memorialOverrides ?? {}),
    revisions: stripUndefined((project.revisions ?? []).slice(-100)),
    fireSafetyNotes: stripUndefined(project.fireSafetyNotes),
    accessibilityConfig: stripUndefined(project.accessibilityConfig),
  };
  if (project.implantation !== undefined) {
    base.implantation = stripUndefined(project.implantation);
  }
  if (project.landscaping !== undefined) {
    base.landscaping = stripUndefined(project.landscaping);
  }
  return base;
}

/**
 * Loads all projects owned by `ownerId` from Firestore alongside their R01 renders subcollection.
 */
export async function loadUserProjectsFromFirestore(ownerId: string): Promise<Project[]> {
  const projectsPath = 'projects';
  try {
    const q = query(collection(db, projectsPath), where('ownerId', '==', ownerId));
    const snapshot = await getDocs(q);

    const loaded = await Promise.all(
      snapshot.docs.map(async (projDoc) => {
        const rawData = projDoc.data() as Partial<Project>;
        persistedProjectIds.add(projDoc.id);

        const rendersPath = `projects/${projDoc.id}/renders`;
        let renders: CapturedRender[] = [];
        try {
          const rq = query(collection(db, rendersPath), where('ownerId', '==', ownerId));
          const rSnap = await getDocs(rq);
          renders = rSnap.docs
            .map((rd) => {
              const r = rd.data() as Record<string, unknown>;
              return {
                id: String(r.id ?? rd.id),
                title: String(r.title ?? 'Perspectiva 3D'),
                preset: String(r.preset ?? 'perspectiva'),
                timeOfDay: String(r.timeOfDay ?? 'dia'),
                dataUrl: String(r.dataUrl ?? ''),
                createdAt: String(r.capturedAt ?? timestampToIso(r.createdAt)),
              };
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, rendersPath);
        }

        return migrateProject({ ...rawData, id: projDoc.id }, renders);
      }),
    );

    return loaded.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, projectsPath);
  }
}

/**
 * Persists a project document to Firestore (/projects/{projectId}) excluding renders subcollection.
 * Uses `isNew: true` fast-path on brand-new projects to avoid unnecessary existence probes.
 */
export async function saveProjectToFirestore(
  project: Project,
  ownerId: string,
  options?: { isNew?: boolean },
): Promise<void> {
  const safeId = normalizeId(project.id, 'proj');
  const docPath = `projects/${safeId}`;
  const projectRef = doc(db, 'projects', safeId);
  const payload = buildFirestoreProjectPayload(project, ownerId);

  let existsInDb = persistedProjectIds.has(safeId);
  if (!existsInDb && !options?.isNew) {
    try {
      const snap = await getDoc(projectRef);
      existsInDb = snap.exists();
      if (existsInDb) persistedProjectIds.add(safeId);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, docPath);
    }
  }

  if (!existsInDb) {
    try {
      await setDoc(projectRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      persistedProjectIds.add(safeId);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    }
  } else {
    try {
      // Omit immutable fields (id, ownerId, createdAt) from updateDoc payload
      const { id: _id, ownerId: _ownerId, ...mutableFields } = payload;
      await updateDoc(projectRef, {
        ...mutableFields,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
  }
}

/**
 * Saves an R01 3D render into /projects/{projectId}/renders/{renderId}.
 */
export async function saveRenderToFirestore(
  projectId: string,
  ownerId: string,
  render: CapturedRender,
): Promise<void> {
  const safeProjId = normalizeId(projectId, 'proj');
  const safeRenderId = normalizeId(render.id, 'rnd');
  const docPath = `projects/${safeProjId}/renders/${safeRenderId}`;

  if (render.dataUrl.length > 750000) {
    throw new Error('A imagem renderizada excede o limite de 750 KB do documento Firestore.');
  }

  try {
    const renderRef = doc(db, 'projects', safeProjId, 'renders', safeRenderId);
    await setDoc(renderRef, {
      id: safeRenderId,
      ownerId,
      projectId: safeProjId,
      title: (render.title || 'Perspectiva 3D').slice(0, 160),
      preset: (render.preset || 'perspectiva').slice(0, 40),
      timeOfDay: (render.timeOfDay || 'dia').slice(0, 24),
      dataUrl: render.dataUrl,
      capturedAt: (render.createdAt || new Date().toISOString()).slice(0, 64),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function deleteRenderFromFirestore(
  projectId: string,
  renderId: string,
): Promise<void> {
  const safeProjId = normalizeId(projectId, 'proj');
  const safeRenderId = normalizeId(renderId, 'rnd');
  const docPath = `projects/${safeProjId}/renders/${safeRenderId}`;

  try {
    await deleteDoc(doc(db, 'projects', safeProjId, 'renders', safeRenderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

/**
 * Deletes all renders in the subcollection first (owner-scoped), then deletes the project document.
 */
export async function deleteProjectFromFirestore(
  projectId: string,
  ownerId: string,
): Promise<void> {
  const safeProjId = normalizeId(projectId, 'proj');
  const rendersPath = `projects/${safeProjId}/renders`;
  const docPath = `projects/${safeProjId}`;

  try {
    const rq = query(collection(db, rendersPath), where('ownerId', '==', ownerId));
    const rSnap = await getDocs(rq);
    await Promise.all(rSnap.docs.map((rd) => deleteDoc(rd.ref)));
    await deleteDoc(doc(db, 'projects', safeProjId));
    persistedProjectIds.delete(safeProjId);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export function duplicateProjectRecord(
  source: Project,
  newName?: string,
  author = 'Usuário',
): Project {
  const now = new Date().toISOString();
  const id = `proj-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
  const copy = JSON.parse(JSON.stringify(source)) as Project;
  return {
    ...copy,
    id,
    code: `${source.code}-COP`.slice(0, 48),
    name: (newName ?? `${source.name} (Cópia)`).slice(0, 160),
    status: 'em_andamento',
    createdAt: now,
    updatedAt: now,
    revisions: [
      ...copy.revisions,
      {
        id: `rev-${Date.now().toString(36)}`,
        revisionCode: `R${String(copy.revisions.length).padStart(2, '0')}`,
        timestamp: now,
        author,
        description: `Projeto duplicado a partir de "${source.name}" (${source.code}).`,
        stage: copy.stage,
      },
    ],
  };
}

export function setProjectStatusRecord(project: Project, status: ProjectStatus): Project {
  return {
    ...project,
    status,
    updatedAt: new Date().toISOString(),
  };
}

export function appendRevision(
  project: Project,
  description: string,
  author = 'Usuário',
): Project {
  const now = new Date().toISOString();
  const nextNum = project.revisions.length;
  return {
    ...project,
    updatedAt: now,
    revisions: [
      ...project.revisions,
      {
        id: `rev-${Date.now().toString(36)}`,
        revisionCode: `R${String(nextNum).padStart(2, '0')}`,
        timestamp: now,
        author,
        description,
        stage: project.stage,
      },
    ],
  };
}
