import React, { useRef, useState } from 'react';
import {
  Archive,
  Building2,
  Copy,
  Download,
  FolderOpen,
  Layers,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { analyzeSiteGeometry, round2 } from '../engine/geometry';
import { generateProjectJSON, triggerBrowserDownload } from '../engine/exporters';
import { sanitizeImportedProject } from '../engine/storage';
import type { ConstructionMethodId, Project, ProjectStatus } from '../types/project';

interface ProjectHubProps {
  projects: Project[];
  activeProjectId: string;
  openNewModalSignal?: number;
  onOpenProject: (id: string) => void;
  onCreateProject: (params: {
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
  }) => void;
  onDuplicateProject: (id: string) => void;
  onToggleArchiveProject: (id: string, nextStatus: ProjectStatus) => void;
  onDeleteProject: (id: string) => void;
  onImportProjectJSON: (project: Project) => void;
  onNavigateModule: (moduleId: string) => void;
}

export const ProjectHub: React.FC<ProjectHubProps> = ({
  projects,
  activeProjectId,
  openNewModalSignal,
  onOpenProject,
  onCreateProject,
  onDuplicateProject,
  onToggleArchiveProject,
  onDeleteProject,
  onImportProjectJSON,
  onNavigateModule,
}) => {
  const [filterTab, setFilterTab] = useState<'todos' | ProjectStatus>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  React.useEffect(() => {
    if (openNewModalSignal && openNewModalSignal > 0) {
      setShowNewModal(true);
    }
  }, [openNewModalSignal]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New project form state
  const [newName, setNewName] = useState('');
  const [newClient, setNewClient] = useState('');
  const [newMunicipality, setNewMunicipality] = useState('');
  const [newState, setNewState] = useState('');
  const [newFront, setNewFront] = useState(12);
  const [newDepth, setNewDepth] = useState(25);
  const [newFloors, setNewFloors] = useState(2);
  const [newMethod, setNewMethod] = useState<ConstructionMethodId>('alvenaria_convencional');
  const [newUnit, setNewUnit] = useState<'m' | 'cm'>('m');
  const [newStreetSide, setNewStreetSide] = useState<'baixo' | 'cima' | 'esquerda' | 'direita'>('baixo');
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = projects.filter((p) => {
    if (filterTab !== 'todos' && p.status !== filterTab) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.client.toLowerCase().includes(q) ||
      p.municipality.toLowerCase().includes(q)
    );
  });

  const getProjectStats = (p: Project) => {
    const unitsCount = p.floors.reduce((s, fl) => s + fl.units.length, 0);
    const builtArea = p.floors.reduce((s, fl) => {
      const uArea = fl.units.reduce((us, u) => {
        const ut = p.unitTypes.find((t) => t.id === u.unitTypeId);
        return us + (ut ? ut.width * ut.depth : 0);
      }, 0);
      return s + uArea + (fl.commonAreaM2 || 0);
    }, 0);
    const siteArea = analyzeSiteGeometry(p.site).calculatedArea;
    return { unitsCount, builtArea: round2(builtArea), siteArea };
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setFormError('Informe o nome do empreendimento.');
      return;
    }
    if (newFront < 4 || newDepth < 6) {
      setFormError('Dimensões mínimas do terreno para implantação: 4,0 m de frente × 6,0 m de profundidade.');
      return;
    }
    setFormError(null);
    onCreateProject({
      name: newName,
      client: newClient,
      municipality: newMunicipality,
      state: newState,
      front: newFront,
      depth: newDepth,
      floorsCount: newFloors,
      methodId: newMethod,
      measurementUnit: newUnit,
      streetSide: newStreetSide,
    });
    setShowNewModal(false);
    setNewName('');
    setNewClient('');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rawParsed = JSON.parse(text);
      const sanitized = sanitizeImportedProject(rawParsed);
      onImportProjectJSON(sanitized);
    } catch (err) {
      setImportError(
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível validar o arquivo de backup JSON.',
      );
    } finally {
      e.target.value = '';
    }
  };

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? projects[0];
  const activeStats = activeProject ? getProjectStats(activeProject) : null;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-[#2A2F38] pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-[#F1F4F9] tracking-tight">
            Central de Empreendimentos
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#949BA8] mt-1">
            Gerenciamento de projetos BIM, terrenos, tipologias e revisões sincronizados na sua conta.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md border border-slate-300 dark:border-[#323844] bg-white dark:bg-[#1E222A] text-slate-800 dark:text-[#E6E9EF] hover:bg-slate-50 dark:hover:bg-[#262B35] transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            Importar Backup JSON
          </button>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-[#1D5B6E] dark:bg-[#2F7CF6] text-white hover:bg-[#164857] dark:hover:bg-[#2569D6] transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Novo Empreendimento
          </button>
        </div>
      </div>

      {importError && (
        <div className="p-3 rounded-md border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-200 text-xs">
          {importError}
        </div>
      )}

      {/* Active Project Quick Access Banner */}
      {activeProject && activeStats && (
        <div className="rounded-lg border border-slate-200 dark:border-[#2A2F38] bg-white dark:bg-[#1B1E24] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#949BA8] font-mono">
                <span>EMPREENDIMENTO ATIVO</span>
                <span aria-hidden="true">·</span>
                <span>{activeProject.code}</span>
                <span aria-hidden="true">·</span>
                <span>{activeProject.revisions[activeProject.revisions.length - 1]?.revisionCode ?? 'R00'}</span>
              </div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mt-1">
                {activeProject.name}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-[#949BA8] mt-1.5 tabular-nums">
                <span>Terreno: {activeStats.siteArea} m²</span>
                <span aria-hidden="true">·</span>
                <span>{activeProject.floors.length} pavimento(s)</span>
                <span aria-hidden="true">·</span>
                <span>{activeStats.unitsCount} unidade(s)</span>
                <span aria-hidden="true">·</span>
                <span>Área construída: {activeStats.builtArea} m²</span>
                <span aria-hidden="true">·</span>
                <span>Sistema: {activeProject.constructionMethod.name}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateModule('kitnets')}
              className="px-3.5 py-1.5 text-xs font-medium rounded bg-[#1D5B6E] dark:bg-[#2F7CF6] text-white hover:bg-[#164857] dark:hover:bg-[#2569D6] transition-colors whitespace-nowrap shrink-0"
            >
              Abrir no Estúdio
            </button>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 rounded-md bg-slate-100 dark:bg-[#1B1E24] border border-slate-200 dark:border-[#2A2F38]">
          {(
            [
              { id: 'todos', label: `Todos (${projects.length})` },
              { id: 'em_andamento', label: 'Em Andamento' },
              { id: 'concluido', label: 'Concluídos' },
              { id: 'arquivado', label: 'Arquivados' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilterTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                filterTab === t.id
                  ? 'bg-[#1D5B6E] dark:bg-[#2F7CF6] text-white'
                  : 'text-slate-600 dark:text-[#949BA8] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 dark:text-[#949BA8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome, código ou cidade..."
            aria-label="Buscar empreendimento"
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md bg-white dark:bg-[#1B1E24] border border-slate-300 dark:border-[#2A2F38] text-slate-900 dark:text-[#E6E9EF] placeholder-slate-400 dark:placeholder-[#6B7280] focus:outline-none focus:border-[#1D5B6E] dark:focus:border-[#2F7CF6]"
          />
        </div>
      </div>

      {/* Projects Table */}
      <div className="rounded-lg border border-slate-200 dark:border-[#2A2F38] bg-white dark:bg-[#1B1E24] overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <Building2 className="w-8 h-8 text-slate-400 dark:text-[#6B7280] mx-auto" />
            <p className="text-sm text-slate-800 dark:text-[#E6E9EF] font-medium">
              Nenhum empreendimento encontrado neste filtro.
            </p>
            <p className="text-xs text-slate-500 dark:text-[#949BA8]">
              Clique em &quot;Novo Empreendimento&quot; para iniciar um projeto do zero ou importe um backup JSON.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#2A2F38] text-[11px] font-medium text-slate-500 dark:text-[#949BA8] bg-slate-50 dark:bg-[#181B20]">
                <th className="py-3 px-4">Código / Empreendimento</th>
                <th className="py-3 px-4">Localização</th>
                <th className="py-3 px-4 text-right">Unidades</th>
                <th className="py-3 px-4 text-right">Área Construída</th>
                <th className="py-3 px-4">Situação / Etapa</th>
                <th className="py-3 px-4">Última Alteração</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#252A33] text-xs">
              {filtered.map((p) => {
                const st = getProjectStats(p);
                const isSelected = p.id === activeProjectId;
                return (
                  <tr
                    key={p.id}
                    className={`hover:bg-slate-50 dark:hover:bg-[#22262E]/70 transition-colors ${
                      isSelected ? 'bg-[#1D5B6E]/5 dark:bg-[#2F7CF6]/10' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-[#F1F4F9] flex items-center gap-2">
                        <span>{p.name}</span>
                        {isSelected && (
                          <span className="text-[11px] font-mono text-[#1D5B6E] dark:text-[#2F7CF6]">
                            [Ativo]
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-[#949BA8] font-mono mt-0.5">
                        {p.code} · {p.client}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-[#C4C9D4]">
                      {p.municipality} / {p.state}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-[#E6E9EF]">
                      {st.unitsCount} ({p.unitTypes.length} tip.)
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-[#E6E9EF]">
                      {st.builtArea.toFixed(2)} m²
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-[#C4C9D4]">
                      <div>
                        {p.status === 'em_andamento'
                          ? 'Em andamento'
                          : p.status === 'concluido'
                            ? 'Concluído'
                            : 'Arquivado'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-[#949BA8]">
                        {p.stage.replace(/_/g, ' ')}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500 dark:text-[#949BA8]">
                      {new Date(p.updatedAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            onOpenProject(p.id);
                            onNavigateModule('kitnets');
                          }}
                          title={`Abrir "${p.name}"`}
                          aria-label={`Abrir ${p.name}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#1D5B6E] dark:bg-[#2F7CF6] text-white hover:bg-[#164857] dark:hover:bg-[#2569D6] transition-colors whitespace-nowrap"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          Abrir
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateProject(p.id)}
                          title={`Duplicar "${p.name}"`}
                          aria-label={`Duplicar ${p.name}`}
                          className="p-1.5 rounded border border-slate-300 dark:border-[#323844] text-slate-600 dark:text-[#C4C9D4] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#2A2F38]"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            triggerBrowserDownload(
                              generateProjectJSON(p),
                              `${p.code}_backup.json`,
                              'application/json',
                            )
                          }
                          title={`Exportar backup JSON de "${p.name}"`}
                          aria-label={`Exportar backup de ${p.name}`}
                          className="p-1.5 rounded border border-slate-300 dark:border-[#323844] text-slate-600 dark:text-[#C4C9D4] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#2A2F38]"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onToggleArchiveProject(
                              p.id,
                              p.status === 'arquivado' ? 'em_andamento' : 'arquivado',
                            )
                          }
                          title={p.status === 'arquivado' ? 'Recuperar projeto' : 'Arquivar projeto'}
                          aria-label={
                            p.status === 'arquivado'
                              ? `Recuperar ${p.name}`
                              : `Arquivar ${p.name}`
                          }
                          className="p-1.5 rounded border border-slate-300 dark:border-[#323844] text-slate-600 dark:text-[#C4C9D4] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#2A2F38]"
                        >
                          {p.status === 'arquivado' ? (
                            <Layers className="w-3.5 h-3.5" />
                          ) : (
                            <Archive className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(p.id)}
                          title={`Excluir "${p.name}"`}
                          aria-label={`Excluir ${p.name}`}
                          className="p-1.5 rounded border border-slate-300 dark:border-[#323844] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* New Project Modal */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 dark:bg-black/70 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-proj-title"
        >
          <div className="w-full max-w-lg rounded-lg border border-slate-200 dark:border-[#323844] bg-white dark:bg-[#1B1E24] p-6 space-y-4">
            <h3 id="new-proj-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Criar Novo Empreendimento
            </h3>

            {formError && (
              <div className="p-2.5 rounded border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-200">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs text-slate-600 dark:text-[#949BA8] mb-1">
                  Nome do Empreendimento *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex.: Residencial Vila Nova — 8 Kitnets"
                  className="w-full px-3 py-2 text-xs rounded bg-slate-50 dark:bg-[#14161A] border border-slate-300 dark:border-[#2A2F38] text-slate-900 dark:text-white focus:border-[#1D5B6E] dark:focus:border-[#2F7CF6] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-600 dark:text-[#949BA8] mb-1">
                    Contratante / Proprietário
                  </label>
                  <input
                    type="text"
                    value={newClient}
                    onChange={(e) => setNewClient(e.target.value)}
                    placeholder="Nome do cliente"
                    className="w-full px-3 py-2 text-xs rounded bg-slate-50 dark:bg-[#14161A] border border-slate-300 dark:border-[#2A2F38] text-slate-900 dark:text-white focus:border-[#1D5B6E] dark:focus:border-[#2F7CF6] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-[#949BA8] mb-1">UF</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="Ex: RJ"
                    value={newState}
                    onChange={(e) => setNewState(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-xs rounded bg-slate-50 dark:bg-[#14161A] border border-slate-300 dark:border-[#2A2F38] text-slate-900 dark:text-white uppercase focus:border-[#1D5B6E] dark:focus:border-[#2F7CF6] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 dark:text-[#949BA8] mb-1">Município</label>
                  <input
                    type="text"
                    value={newMunicipality}
                    onChange={(e) => setNewMunicipality(e.target.value)}
                    placeholder="Ex.: Campinas"
                    className="w-full px-3 py-2 text-xs rounded bg-slate-50 dark:bg-[#14161A] border border-slate-300 dark:border-[#2A2F38] text-slate-900 dark:text-white focus:border-[#1D5B6E] dark:focus:border-[#2F7CF6] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-[#949BA8] mb-1">
                    Método Construtivo
                  </label>
                  <select
                    value={newMethod}
                    onChange={(e) => setNewMethod(e.target.value as ConstructionMethodId)}
                    className="w-full px-3 py-2 text-xs rounded bg-slate-50 dark:bg-[#14161A] border border-slate-300 dark:border-[#2A2F38] text-slate-900 dark:text-white focus:border-[#1D5B6E] dark:focus:border-[#2F7CF6] focus:outline-none"
                  >
                    <option value="alvenaria_convencional">Alvenaria Convencional</option>
                    <option value="alvenaria_estrutural">Alvenaria Estrutural</option>
                    <option value="light_steel_frame">Light Steel Frame</option>
                    <option value="wood_frame">Wood Frame</option>
                    <option value="pre_moldado">Concreto Pré-Moldado</option>
                    <option value="modular">Construção Modular</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 dark:text-[#949BA8] mb-1">Frente (m)</label>
                  <input
                    type="number"
                    step="0.5"
                    min={4}
                    value={newFront}
                    onChange={(e) => setNewFront(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono rounded bg-slate-50 dark:bg-[#14161A] border border-slate-300 dark:border-[#2A2F38] text-slate-900 dark:text-white focus:border-[#1D5B6E] dark:focus:border-[#2F7CF6] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-[#949BA8] mb-1">
                    Profundidade (m)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={6}
                    value={newDepth}
                    onChange={(e) => setNewDepth(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono rounded bg-slate-50 dark:bg-[#14161A] border border-slate-300 dark:border-[#2A2F38] text-slate-900 dark:text-white focus:border-[#1D5B6E] dark:focus:border-[#2F7CF6] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-[#949BA8] mb-1">Pavimentos</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={newFloors}
                    onChange={(e) => setNewFloors(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono rounded bg-slate-50 dark:bg-[#14161A] border border-slate-300 dark:border-[#2A2F38] text-slate-900 dark:text-white focus:border-[#1D5B6E] dark:focus:border-[#2F7CF6] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 dark:text-[#949BA8] mb-1">
                    Unidade de Medida
                  </label>
                  <select
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value as 'm' | 'cm')}
                    className="w-full px-3 py-2 text-xs rounded bg-slate-50 dark:bg-[#14161A] border border-slate-300 dark:border-[#2A2F38] text-slate-900 dark:text-white focus:border-[#1D5B6E] dark:focus:border-[#2F7CF6] focus:outline-none"
                  >
                    <option value="m">Metros (m)</option>
                    <option value="cm">Centímetros (cm)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-[#949BA8] mb-1">
                    Localização da Rua (Frente)
                  </label>
                  <select
                    value={newStreetSide}
                    onChange={(e) =>
                      setNewStreetSide(e.target.value as 'baixo' | 'cima' | 'esquerda' | 'direita')
                    }
                    className="w-full px-3 py-2 text-xs rounded bg-slate-50 dark:bg-[#14161A] border border-slate-300 dark:border-[#2A2F38] text-slate-900 dark:text-white focus:border-[#1D5B6E] dark:focus:border-[#2F7CF6] focus:outline-none"
                  >
                    <option value="baixo">Borda Inferior (Padrão)</option>
                    <option value="cima">Borda Superior</option>
                    <option value="esquerda">Lateral Esquerda</option>
                    <option value="direita">Lateral Direita</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-[#2A2F38]">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 text-xs rounded border border-slate-300 dark:border-[#323844] text-slate-700 dark:text-[#C4C9D4] hover:text-slate-900 dark:hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded bg-[#1D5B6E] dark:bg-[#2F7CF6] text-white hover:bg-[#164857] dark:hover:bg-[#2569D6]"
                >
                  Criar Empreendimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 dark:bg-black/70 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 dark:border-[#323844] bg-white dark:bg-[#1B1E24] p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Confirmar Exclusão</h3>
            <p className="text-xs text-slate-600 dark:text-[#C4C9D4]">
              Deseja excluir permanentemente o empreendimento selecionado do banco de dados? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-xs rounded border border-slate-300 dark:border-[#323844] text-slate-700 dark:text-[#C4C9D4] hover:text-slate-900 dark:hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteProject(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                className="px-4 py-2 text-xs font-semibold rounded bg-red-600 text-white hover:bg-red-700"
              >
                Excluir Definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
