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
import { PaginationBar, paginateItems, useViewportPageSize } from './PaginationBar';

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
  const [page, setPage] = useState(0);

  React.useEffect(() => {
    if (openNewModalSignal && openNewModalSignal > 0) {
      setShowNewModal(true);
    }
  }, [openNewModalSignal]);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const rowsPerPage = useViewportPageSize(340, 48, 3, 12);
  const paged = paginateItems(filtered, page, rowsPerPage);

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
      setFormError('Dimensões mínimas do terreno: 4,0 m de frente × 6,0 m de profundidade.');
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
    <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col gap-3 overflow-hidden p-4">
      {/* Header Row */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#2A2F38] pb-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-[#F1F4F9]">
            Central de Empreendimentos
          </h1>
          <p className="text-xs text-[#949BA8]">
            Projetos BIM, terrenos, tipologias e revisões sincronizados na nuvem Firebase.
          </p>
        </div>

        <div className="flex items-center gap-2">
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
            className="inline-flex items-center gap-1.5 rounded-md border border-[#323844] bg-[#1E222A] px-3 py-1.5 text-xs font-medium text-[#E6E9EF] hover:bg-[#262B35] whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" />
            Importar JSON
          </button>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#2F7CF6] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#2569D6] whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo Empreendimento
          </button>
        </div>
      </div>

      {importError && (
        <div className="shrink-0 rounded-md border border-red-500/40 bg-red-950/30 p-2.5 text-xs text-red-200">
          {importError}
        </div>
      )}

      {/* Compact Active Project Bar */}
      {activeProject && activeStats && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-[#2A2F38] bg-[#1B1E24] px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <span className="font-mono text-[11px] text-sky-400">ATIVO · {activeProject.code}</span>
            <span className="truncate text-sm font-semibold text-white">{activeProject.name}</span>
            <span className="hidden text-xs text-[#949BA8] tabular-nums md:inline">
              {activeStats.siteArea} m² lote · {activeProject.floors.length} pav. ·{' '}
              {activeStats.unitsCount} un. · {activeStats.builtArea} m² constr. ·{' '}
              {activeProject.constructionMethod.name}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigateModule('planta2d')}
            className="rounded bg-[#2F7CF6] px-3 py-1 text-xs font-medium text-white hover:bg-[#2569D6] whitespace-nowrap shrink-0"
          >
            Abrir no Estúdio
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-md border border-[#2A2F38] bg-[#1B1E24] p-0.5">
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
              onClick={() => {
                setFilterTab(t.id);
                setPage(0);
              }}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                filterTab === t.id
                  ? 'bg-[#2F7CF6] text-white'
                  : 'text-[#949BA8] hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#949BA8]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Buscar nome, código ou cidade..."
            aria-label="Buscar empreendimento"
            className="w-full rounded-md border border-[#2A2F38] bg-[#1B1E24] py-1 pl-8 pr-3 text-xs text-[#E6E9EF] placeholder-[#6B7280] focus:border-[#2F7CF6] focus:outline-none"
          />
        </div>
      </div>

      {/* Paginated Fixed-Table Viewport */}
      <div className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden rounded-lg border border-[#2A2F38] bg-[#1B1E24]">
        {filtered.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center space-y-2">
            <Building2 className="h-7 w-7 text-[#6B7280]" />
            <p className="text-sm font-medium text-[#E6E9EF]">
              Nenhum empreendimento encontrado neste filtro.
            </p>
            <p className="text-xs text-[#949BA8]">
              Clique em &quot;Novo Empreendimento&quot; ou importe um backup JSON.
            </p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden">
            <table className="w-full table-fixed border-collapse text-left">
              <thead>
                <tr className="border-b border-[#2A2F38] bg-[#181B20] text-[11px] font-medium text-[#949BA8]">
                  <th className="w-[27%] px-3 py-2">Código / Empreendimento</th>
                  <th className="w-[15%] px-3 py-2">Localização</th>
                  <th className="w-[11%] px-3 py-2 text-right">Unidades</th>
                  <th className="w-[12%] px-3 py-2 text-right">Área Constr.</th>
                  <th className="w-[13%] px-3 py-2">Situação</th>
                  <th className="w-[11%] px-3 py-2">Atualizado</th>
                  <th className="w-[190px] px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252A33] text-xs">
                {paged.slice.map((p) => {
                  const st = getProjectStats(p);
                  const isSelected = p.id === activeProjectId;
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-[#22262E]/70 transition-colors ${
                        isSelected ? 'bg-[#2F7CF6]/10' : ''
                      }`}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 font-medium text-[#F1F4F9]">
                          <span className="truncate" title={p.name}>
                            {p.name}
                          </span>
                          {isSelected && (
                            <span className="shrink-0 font-mono text-[10px] text-[#2F7CF6]">
                              [Ativo]
                            </span>
                          )}
                        </div>
                        <div className="truncate font-mono text-[10px] text-[#949BA8]">
                          {p.code} · {p.client || '—'}
                        </div>
                      </td>
                      <td className="truncate px-3 py-2 text-[#C4C9D4]" title={`${p.municipality}/${p.state}`}>
                        {p.municipality || '—'} {p.state ? `/ ${p.state}` : ''}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[#E6E9EF]">
                        {st.unitsCount} ({p.unitTypes.length})
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[#E6E9EF]">
                        {st.builtArea.toFixed(1)} m²
                      </td>
                      <td className="truncate px-3 py-2 text-[#C4C9D4]">
                        {p.status === 'em_andamento'
                          ? 'Em andamento'
                          : p.status === 'concluido'
                            ? 'Concluído'
                            : 'Arquivado'}
                      </td>
                      <td className="truncate px-3 py-2 font-mono text-[11px] tabular-nums text-[#949BA8]">
                        {new Date(p.updatedAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              onOpenProject(p.id);
                              onNavigateModule('planta2d');
                            }}
                            title={`Abrir "${p.name}"`}
                            className="inline-flex items-center gap-1 rounded bg-[#2F7CF6] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#2569D6] whitespace-nowrap"
                          >
                            <FolderOpen className="h-3 w-3" />
                            Abrir
                          </button>
                          <button
                            type="button"
                            onClick={() => onDuplicateProject(p.id)}
                            title={`Duplicar "${p.name}"`}
                            className="rounded border border-[#323844] p-1 text-[#C4C9D4] hover:bg-[#2A2F38] hover:text-white"
                          >
                            <Copy className="h-3 w-3" />
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
                            className="rounded border border-[#323844] p-1 text-[#C4C9D4] hover:bg-[#2A2F38] hover:text-white"
                          >
                            <Download className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onToggleArchiveProject(
                                p.id,
                                p.status === 'arquivado' ? 'em_andamento' : 'arquivado',
                              )
                            }
                            title={p.status === 'arquivado' ? 'Recuperar' : 'Arquivar'}
                            className="rounded border border-[#323844] p-1 text-[#C4C9D4] hover:bg-[#2A2F38] hover:text-white"
                          >
                            {p.status === 'arquivado' ? (
                              <Layers className="h-3 w-3" />
                            ) : (
                              <Archive className="h-3 w-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(p.id)}
                            title={`Excluir "${p.name}"`}
                            className="rounded border border-[#323844] p-1 text-red-400 hover:bg-red-950/50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <PaginationBar
          page={paged.safePage}
          totalPages={paged.totalPages}
          totalItems={filtered.length}
          startIndex={paged.start}
          endIndex={paged.end}
          onPageChange={setPage}
          itemLabel="empreendimentos"
        />
      </div>

      {/* New Project Modal */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-proj-title"
        >
          <div className="w-full max-w-lg rounded-lg border border-[#323844] bg-[#1B1E24] p-5 space-y-3">
            <h3 id="new-proj-title" className="text-base font-semibold text-white">
              Criar Novo Empreendimento
            </h3>

            {formError && (
              <div className="rounded border border-red-500/40 bg-red-950/30 p-2 text-xs text-red-200">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-2.5">
              <div>
                <label className="mb-1 block text-[11px] text-[#949BA8]">Nome do Empreendimento *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex.: Residencial Vila Nova — 8 Kitnets"
                  className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs text-white focus:border-[#2F7CF6] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="col-span-2">
                  <label className="mb-1 block text-[11px] text-[#949BA8]">Contratante</label>
                  <input
                    type="text"
                    value={newClient}
                    onChange={(e) => setNewClient(e.target.value)}
                    placeholder="Nome do cliente"
                    className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs text-white focus:border-[#2F7CF6] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[#949BA8]">UF</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="RJ"
                    value={newState}
                    onChange={(e) => setNewState(e.target.value.toUpperCase())}
                    className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs uppercase text-white focus:border-[#2F7CF6] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1 block text-[11px] text-[#949BA8]">Município</label>
                  <input
                    type="text"
                    value={newMunicipality}
                    onChange={(e) => setNewMunicipality(e.target.value)}
                    placeholder="Ex.: Campinas"
                    className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs text-white focus:border-[#2F7CF6] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[#949BA8]">Sistema Construtivo</label>
                  <select
                    value={newMethod}
                    onChange={(e) => setNewMethod(e.target.value as ConstructionMethodId)}
                    className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs text-white focus:border-[#2F7CF6] focus:outline-none"
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

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="mb-1 block text-[11px] text-[#949BA8]">Frente (m)</label>
                  <input
                    type="number"
                    step="0.5"
                    min={4}
                    value={newFront}
                    onChange={(e) => setNewFront(Number(e.target.value))}
                    className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[#949BA8]">Profundidade (m)</label>
                  <input
                    type="number"
                    step="0.5"
                    min={6}
                    value={newDepth}
                    onChange={(e) => setNewDepth(Number(e.target.value))}
                    className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[#949BA8]">Pavimentos</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={newFloors}
                    onChange={(e) => setNewFloors(Number(e.target.value))}
                    className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1 block text-[11px] text-[#949BA8]">Unidade</label>
                  <select
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value as 'm' | 'cm')}
                    className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="m">Metros (m)</option>
                    <option value="cm">Centímetros (cm)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[#949BA8]">Rua (Frente)</label>
                  <select
                    value={newStreetSide}
                    onChange={(e) =>
                      setNewStreetSide(e.target.value as 'baixo' | 'cima' | 'esquerda' | 'direita')
                    }
                    className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="baixo">Borda Inferior</option>
                    <option value="cima">Borda Superior</option>
                    <option value="esquerda">Lateral Esquerda</option>
                    <option value="direita">Lateral Direita</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-[#2A2F38] pt-2.5">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="rounded border border-[#323844] px-3.5 py-1.5 text-xs text-[#C4C9D4] hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#2F7CF6] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#2569D6]"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg border border-[#323844] bg-[#1B1E24] p-5 space-y-3">
            <h3 className="text-base font-semibold text-white">Confirmar Exclusão</h3>
            <p className="text-xs text-[#C4C9D4]">
              Deseja excluir permanentemente o empreendimento selecionado do banco de dados? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="rounded border border-[#323844] px-3.5 py-1.5 text-xs text-[#C4C9D4] hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteProject(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                className="rounded bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
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
