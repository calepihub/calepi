import type { Project, ProjectStatus } from '../types/project';

const DB_NAME = 'kitnet_pro_studio_db';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const LOCAL_FALLBACK_KEY = 'kitnet_pro_studio_projects_v1';

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function migrateProject(raw: Project): Project {
  // Forward-compatible migration hook
  return {
    ...raw,
    schemaVersion: 1,
    capturedRenders: raw.capturedRenders ?? [],
    memorialOverrides: raw.memorialOverrides ?? {},
    revisions: raw.revisions ?? [],
    renderSettings: {
      ...raw.renderSettings,
      renderQuality: raw.renderSettings?.renderQuality ?? 'arquitetonico',
    },
    budgetSettings: {
      ...raw.budgetSettings,
      sinapiRegime: raw.budgetSettings?.sinapiRegime ?? 'manual',
    },
  };
}

export async function loadAllProjects(): Promise<Project[]> {
  const db = await openDB();
  if (db) {
    const projects = await new Promise<Project[]>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as Project[]) ?? []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
    if (projects.length > 0) {
      return projects
        .map(migrateProject)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
  }

  // Fallback from localStorage (never auto-seeds simulated projects)
  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Project[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        for (const p of parsed) {
          await saveProjectToStorage(p);
        }
        return parsed.map(migrateProject);
      }
    }
  } catch {
    // ignore localStorage read issues
  }

  return [];
}

export async function saveProjectToStorage(project: Project): Promise<void> {
  const stamped: Project = {
    ...project,
    updatedAt: new Date().toISOString(),
  };

  const db = await openDB();
  if (db) {
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(stamped);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Also mirror to localStorage safely for redundancy if small enough
  try {
    const existingRaw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    const list: Project[] = existingRaw ? (JSON.parse(existingRaw) as Project[]) : [];
    const idx = list.findIndex((p) => p.id === stamped.id);
    if (idx >= 0) list[idx] = stamped;
    else list.unshift(stamped);
    localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(list));
  } catch {
    // ignore quota errors
  }
}

export async function deleteProjectFromStorage(projectId: string): Promise<void> {
  const db = await openDB();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(projectId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  try {
    const existingRaw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    if (existingRaw) {
      const list = (JSON.parse(existingRaw) as Project[]).filter((p) => p.id !== projectId);
      localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(list));
    }
  } catch {
    // ignore
  }
}

export function duplicateProjectRecord(source: Project, newName?: string): Project {
  const now = new Date().toISOString();
  const id = `proj-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
  const copy = JSON.parse(JSON.stringify(source)) as Project;
  return {
    ...copy,
    id,
    code: `${source.code}-COP`,
    name: newName ?? `${source.name} (Cópia)`,
    status: 'em_andamento',
    createdAt: now,
    updatedAt: now,
    revisions: [
      ...copy.revisions,
      {
        id: `rev-${Date.now().toString(36)}`,
        revisionCode: `R${String(copy.revisions.length).padStart(2, '0')}`,
        timestamp: now,
        author: 'Usuário',
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

export function appendRevision(project: Project, description: string, author = 'Usuário'): Project {
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
