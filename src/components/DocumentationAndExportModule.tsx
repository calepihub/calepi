import React, { useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  History,
  Plus,
  RotateCcw,
  Trash2,
  UserCheck,
} from 'lucide-react';
import {
  EXPORT_CAPABILITIES,
  TECHNICAL_SHEETS,
  generateCompleteProjectZIPBlob,
  generateMemorialDOCXBlob,
  generateMemorialPDFBlob,
  generateProjectDXF,
  generateProjectJSON,
  generateProjectXLSXBuffer,
  generateTechnicalSheetPDFBlob,
  triggerBrowserDownload,
} from '../engine/exporters';
import { analyzeSiteGeometry, round2 } from '../engine/geometry';
import { generateAllMemorials } from '../engine/memorialGenerator';
import { calculateQuantities } from '../engine/quantitiesAndBudget';
import { appendRevision } from '../engine/storage';
import { nextId } from '../engine/parametricGenerator';
import type { CadTheme } from '../engine/cadDrawings';
import { CadSheetPreview } from './CadSheetPreview';
import { PaginationBar, paginateItems, useViewportPageSize } from './PaginationBar';
import type { Project, ProjectStage, TechnicalProfessional } from '../types/project';

interface DocumentationAndExportModuleProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
  onDeleteRenderFromCloud?: (renderId: string) => void;
}

const STAGES: Array<{ id: ProjectStage; label: string }> = [
  { id: 'estudo_conceitual', label: 'Estudo Conceitual' },
  { id: 'estudo_preliminar', label: 'Estudo Preliminar' },
  { id: 'anteprojeto', label: 'Anteprojeto' },
  { id: 'aprovacao', label: 'Aprovação Legal' },
  { id: 'executivo', label: 'Projeto Executivo' },
  { id: 'dimensionado', label: 'Dimensionado (MEP)' },
  { id: 'revisado', label: 'Revisado' },
  { id: 'validado_rt', label: 'Validado pelo RT' },
];

export const DocumentationAndExportModule: React.FC<DocumentationAndExportModuleProps> = ({
  project,
  onUpdateProject,
  onDeleteRenderFromCloud,
}) => {
  const [subTab, setSubTab] = useState<'pranchas' | 'memoriais' | 'rt' | 'exportacao'>(
    'pranchas',
  );
  const [selectedSheetId, setSelectedSheetId] = useState<string>('A03');
  const [selectedFloorIdx, setSelectedFloorIdx] = useState<number>(0);
  const [cadTheme, setCadTheme] = useState<CadTheme>('autocad_dark');
  const [paperFormat, setPaperFormat] = useState<'A0' | 'A1' | 'A2' | 'A3' | 'A4'>('A3');
  const [selectedMemorialKey, setSelectedMemorialKey] = useState<string>('arquitetonico');
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [revisionDesc, setRevisionDesc] = useState('');

  // New professional form
  const [profRole, setProfRole] = useState<TechnicalProfessional['role']>('arquiteto');
  const [profName, setProfName] = useState('');
  const [profCouncil, setProfCouncil] = useState('CAU');
  const [profReg, setProfReg] = useState('');
  const [profArt, setProfArt] = useState('');

  const [sheetsPage, setSheetsPage] = useState(0);
  const [memorialsPage, setMemorialsPage] = useState(0);
  const [profsPage, setProfsPage] = useState(0);
  const [revsPage, setRevsPage] = useState(0);
  const [capsPage, setCapsPage] = useState(0);

  const sheetsPageSize = useViewportPageSize(220, 62, 4, 12);
  const memorialsPageSize = useViewportPageSize(320, 56, 3, 10);
  const profsPageSize = useViewportPageSize(340, 48, 3, 8);
  const revsPageSize = useViewportPageSize(280, 62, 3, 10);
  const capsPageSize = useViewportPageSize(430, 38, 3, 10);

  const memorials = useMemo(() => generateAllMemorials(project), [project]);
  const activeMemorial =
    memorials.find((m) => m.key === selectedMemorialKey) ?? memorials[0];
  const activeSheet =
    TECHNICAL_SHEETS.find((s) => s.id === selectedSheetId) ?? TECHNICAL_SHEETS[0];

  const quantities = useMemo(() => calculateQuantities(project), [project]);
  const siteCheck = useMemo(() => analyzeSiteGeometry(project.site), [project.site]);
  const safeFloorIdx = Math.min(selectedFloorIdx, Math.max(0, project.floors.length - 1));

  const reversedRevisions = useMemo(() => [...project.revisions].reverse(), [project.revisions]);
  const sheetsPaged = paginateItems(TECHNICAL_SHEETS, sheetsPage, sheetsPageSize);
  const memorialsPaged = paginateItems(memorials, memorialsPage, memorialsPageSize);
  const profsPaged = paginateItems(project.professionals, profsPage, profsPageSize);
  const revsPaged = paginateItems(reversedRevisions, revsPage, revsPageSize);
  const capsPaged = paginateItems(EXPORT_CAPABILITIES, capsPage, capsPageSize);

  const handleDownloadSheetPDF = () => {
    const blob = generateTechnicalSheetPDFBlob(project, selectedSheetId, safeFloorIdx);
    triggerBrowserDownload(blob, `${project.code}_${selectedSheetId}_${paperFormat}.pdf`);
  };

  const handleRemoveRender = (renderId: string) => {
    onUpdateProject(
      (prev) => ({
        ...prev,
        capturedRenders: (prev.capturedRenders ?? []).filter((r) => r.id !== renderId),
      }),
      'Vista 3D removida da prancha R01',
    );
    onDeleteRenderFromCloud?.(renderId);
  };

  const handleDownloadDOCX = async () => {
    setBusyMessage('Gerando arquivo DOCX editável...');
    try {
      const blob = await generateMemorialDOCXBlob(project);
      triggerBrowserDownload(blob, `${project.code}_Memoriais_Descritivos.docx`);
    } finally {
      setBusyMessage(null);
    }
  };

  const handleDownloadMemorialPDF = () => {
    const blob = generateMemorialPDFBlob(project);
    triggerBrowserDownload(blob, `${project.code}_Memorial_Descritivo.pdf`);
  };

  const handleDownloadXLSX = async () => {
    setBusyMessage('Gerando planilha orçamentária SINAPI-RJ (7 abas .xlsx)...');
    try {
      const buf = await generateProjectXLSXBuffer(project);
      triggerBrowserDownload(
        new Blob([new Uint8Array(buf)], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `${project.code}_Quantitativos_Orcamento.xlsx`,
      );
    } finally {
      setBusyMessage(null);
    }
  };

  const handleDownloadDXF = (floorIdx: number) => {
    const dxf = generateProjectDXF(project, floorIdx);
    triggerBrowserDownload(
      dxf,
      `${project.code}_Pavimento_${floorIdx + 1}.dxf`,
      'application/dxf;charset=utf-8',
    );
  };

  const handleDownloadJSON = () => {
    const json = generateProjectJSON(project);
    triggerBrowserDownload(
      json,
      `${project.code}_backup_integral.json`,
      'application/json;charset=utf-8',
    );
  };

  const handleDownloadZIP = async () => {
    setBusyMessage('Empacotando empreendimento completo em 12 pastas (.zip)...');
    try {
      const zipBlob = await generateCompleteProjectZIPBlob(project);
      triggerBrowserDownload(zipBlob, `${project.code}_EMPREENDIMENTO_COMPLETO.zip`);
    } finally {
      setBusyMessage(null);
    }
  };

  const addProfessional = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profName.trim()) return;
    const item: TechnicalProfessional = {
      id: nextId('rt'),
      role: profRole,
      name: profName.trim(),
      profession:
        profRole === 'arquiteto'
          ? 'Arquiteto(a) e Urbanista'
          : profRole.startsWith('eng_')
            ? 'Engenheiro(a)'
            : 'Responsável / Contratante',
      council: profCouncil,
      registrationNumber: profReg.trim() || 'A informar',
      state: project.state,
      attribution: 'Projeto / Compatibilização',
      discipline: profRole === 'arquiteto' ? 'Arquitetura' : 'Engenharia',
      artRrtCode: profArt.trim() || 'Pendente emissão',
      attachmentName: '',
    };
    onUpdateProject(
      (prev) => ({ ...prev, professionals: [...prev.professionals, item] }),
      `Cadastrado profissional: ${item.name}`,
    );
    setProfName('');
    setProfReg('');
    setProfArt('');
  };

  const removeProfessional = (id: string) => {
    onUpdateProject((prev) => ({
      ...prev,
      professionals: prev.professionals.filter((p) => p.id !== id),
    }));
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#14161A] p-3 text-slate-100">
      <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-2.5 overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-white">
              Pranchas Técnicas, Memoriais, Responsabilidade & Exportação
            </h1>
            <p className="truncate text-xs text-slate-400">
              Documentação gerada diretamente do modelo paramétrico · Revisão atual:{' '}
              <span className="font-mono text-white">
                {project.revisions[project.revisions.length - 1]?.revisionCode ?? 'R00'}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setSubTab('pranchas')}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                subTab === 'pranchas'
                  ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                  : 'border-slate-800 bg-[#1B1E24] text-slate-300'
              }`}
            >
              Pranchas ({TECHNICAL_SHEETS.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('memoriais')}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                subTab === 'memoriais'
                  ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                  : 'border-slate-800 bg-[#1B1E24] text-slate-300'
              }`}
            >
              Memoriais ({memorials.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('rt')}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                subTab === 'rt'
                  ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                  : 'border-slate-800 bg-[#1B1E24] text-slate-300'
              }`}
            >
              RT & Revisões
            </button>
            <button
              type="button"
              onClick={() => setSubTab('exportacao')}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                subTab === 'exportacao'
                  ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                  : 'border-slate-800 bg-[#1B1E24] text-slate-300'
              }`}
            >
              Exportação
            </button>
            <button
              type="button"
              onClick={handleDownloadZIP}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#2F7CF6] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#2567d4] whitespace-nowrap shrink-0"
            >
              <Archive className="h-3.5 w-3.5" />
              EXPORTAR EMPREENDIMENTO (.zip)
            </button>
          </div>
        </div>

        {busyMessage && (
          <div className="shrink-0 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3.5 py-1.5 text-xs text-blue-200">
            {busyMessage}
          </div>
        )}

        {subTab === 'pranchas' && (
          <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-12">
            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24] lg:col-span-3">
              <div className="shrink-0 border-b border-slate-800 bg-[#14161A] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Índice de Pranchas ({TECHNICAL_SHEETS.length})
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden p-2">
                {sheetsPaged.slice.map((sh) => (
                  <button
                    key={sh.id}
                    type="button"
                    onClick={() => setSelectedSheetId(sh.id)}
                    className={`w-full rounded border px-2.5 py-1.5 text-left text-xs transition ${
                      selectedSheetId === sh.id
                        ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                        : 'border-slate-800 bg-[#14161A] text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 font-mono text-[11px] font-semibold">
                      <span className="truncate">
                        {sh.id} — {sh.title}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">{sh.scale}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-slate-400">
                      {sh.discipline} · {sh.description}
                    </div>
                  </button>
                ))}
              </div>
              <PaginationBar
                page={sheetsPaged.safePage}
                totalPages={sheetsPaged.totalPages}
                totalItems={TECHNICAL_SHEETS.length}
                startIndex={sheetsPaged.start}
                endIndex={sheetsPaged.end}
                onPageChange={setSheetsPage}
                itemLabel="pranchas"
                compact
              />
            </div>

            <div className="flex min-h-0 flex-col gap-2 overflow-hidden lg:col-span-9">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#1B1E24] px-3 py-2">
                <div className="min-w-0">
                  <h2 className="truncate text-xs font-semibold text-white">
                    Prévia da Prancha {activeSheet.id} — {activeSheet.title}
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Escala: {activeSheet.scale} · Formato de saída: {paperFormat}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {project.floors.length > 0 && activeSheet.id !== 'R01' && (
                    <select
                      value={safeFloorIdx}
                      onChange={(e) => setSelectedFloorIdx(Number(e.target.value))}
                      className="rounded border border-slate-700 bg-[#14161A] px-2 py-1 text-xs text-white"
                      aria-label="Selecionar pavimento da prancha"
                    >
                      {project.floors.map((fl, idx) => (
                        <option key={fl.id} value={idx}>
                          {fl.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {activeSheet.id !== 'R01' && (
                    <div className="flex rounded border border-slate-700 bg-[#14161A] p-0.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setCadTheme('autocad_dark')}
                        className={`rounded px-2 py-0.5 font-medium transition ${
                          cadTheme === 'autocad_dark'
                            ? 'bg-[#2F7CF6] text-white'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        AutoCAD Escuro
                      </button>
                      <button
                        type="button"
                        onClick={() => setCadTheme('plot_white')}
                        className={`rounded px-2 py-0.5 font-medium transition ${
                          cadTheme === 'plot_white'
                            ? 'bg-slate-200 text-slate-900'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Plotagem Branca
                      </button>
                    </div>
                  )}
                  <select
                    value={paperFormat}
                    onChange={(e) => setPaperFormat(e.target.value as typeof paperFormat)}
                    className="rounded border border-slate-700 bg-[#14161A] px-2 py-1 text-xs text-white"
                  >
                    <option value="A0">Formato A0</option>
                    <option value="A1">Formato A1</option>
                    <option value="A2">Formato A2</option>
                    <option value="A3">Formato A3 (Padrão)</option>
                    <option value="A4">Formato A4</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleDownloadSheetPDF}
                    className="inline-flex items-center gap-1 rounded bg-[#2F7CF6] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#2567d4]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Exportar PDF
                  </button>
                </div>
              </div>

              {/* Technical Sheet Preview (Zero-scroll AutoCAD Vector CAD + ABNT Footer Strip) */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border-2 border-slate-700 bg-white p-2 text-slate-900 shadow-xl">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-slate-900 p-2">
                  <div className="flex shrink-0 flex-wrap items-center justify-between border-b border-slate-300 pb-1 text-[10px]">
                    <span className="font-bold tracking-wide">
                      {activeSheet.id} — {activeSheet.title.toUpperCase()} ({activeSheet.discipline})
                    </span>
                    <span className="font-mono">
                      ESCALA {activeSheet.scale} · FOLHA {paperFormat} · ABNT NBR 6492
                    </span>
                  </div>

                  <div className="my-1.5 flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                    <CadSheetPreview
                      project={project}
                      sheetId={activeSheet.id}
                      floorIndex={safeFloorIdx}
                      cadTheme={cadTheme}
                      onRemoveRender={handleRemoveRender}
                    />
                  </div>

                  {/* Compact ABNT Bottom Engineering Strip */}
                  <div className="grid shrink-0 gap-2 border-t border-slate-300 pt-1.5 md:grid-cols-12">
                    <div className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-[9.5px] md:col-span-4">
                      <div className="font-bold uppercase tracking-wide text-slate-800">
                        Quadro Resumo
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 font-mono">
                        <span>Terreno: {siteCheck.calculatedArea} m²</span>
                        <span>Pav.: {project.floors.length} · Unid.: {quantities.summary.totalUnits}</span>
                        <span>Priv.: {quantities.summary.totalPrivateAreaM2} m²</span>
                        <span>Constr.: {quantities.summary.totalBuiltAreaM2} m²</span>
                      </div>
                    </div>

                    <div className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-[9.5px] md:col-span-4">
                      <div className="font-bold uppercase tracking-wide text-slate-800">
                        Tipologias &amp; Método ({project.constructionMethod.name})
                      </div>
                      <div className="mt-0.5 space-y-0.5 font-mono text-slate-700">
                        {project.unitTypes.length === 0 ? (
                          <div className="text-slate-500">Nenhuma tipologia cadastrada.</div>
                        ) : (
                          project.unitTypes.slice(0, 2).map((ut) => (
                            <div key={ut.id} className="truncate">
                              • {ut.code}: {ut.width}×{ut.depth}m ({round2(ut.width * ut.depth)}m²) · PD {ut.ceilingHeight}m
                            </div>
                          ))
                        )}
                        {project.unitTypes.length > 2 && (
                          <div className="text-slate-500">+{project.unitTypes.length - 2} tipologias</div>
                        )}
                      </div>
                    </div>

                    {/* Official Carimbo ABNT */}
                    <div className="border border-slate-900 text-[9.5px] md:col-span-4">
                      <div className="border-b border-slate-900 bg-slate-100 px-1.5 py-0.5 font-bold">
                        CARIMBO TÉCNICO — {project.name} ({project.municipality}/{project.state})
                      </div>
                      <div className="grid grid-cols-3 border-b border-slate-400 font-mono">
                        <div className="border-r border-slate-400 px-1.5 py-0.5">
                          <strong>Prancha:</strong> {activeSheet.id}
                        </div>
                        <div className="border-r border-slate-400 px-1.5 py-0.5">
                          <strong>Esc:</strong> {activeSheet.scale}
                        </div>
                        <div className="px-1.5 py-0.5">
                          <strong>Rev:</strong> {project.revisions[project.revisions.length - 1]?.revisionCode ?? 'R00'}
                        </div>
                      </div>
                      <div className="truncate px-1.5 py-0.5">
                        <strong>RT:</strong>{' '}
                        {project.professionals.find((p) => p.name.trim())?.name ||
                          'RT NÃO INFORMADO'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {subTab === 'memoriais' && (
          <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-12">
            <div className="flex min-h-0 flex-col justify-between gap-2 overflow-hidden lg:col-span-4">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24]">
                <h2 className="shrink-0 border-b border-slate-800 bg-[#14161A] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Memoriais por Disciplina ({memorials.length})
                </h2>
                <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden p-2.5">
                  {memorialsPaged.slice.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setSelectedMemorialKey(m.key)}
                      className={`w-full rounded border px-3 py-1.5 text-left text-xs transition ${
                        selectedMemorialKey === m.key
                          ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                          : 'border-slate-800 bg-[#14161A] text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="truncate font-medium">{m.title}</div>
                      <div className="truncate text-[10px] text-slate-400">
                        {m.discipline}
                        {project.memorialOverrides[m.key] ? ' · Editado manualmente' : ' · Automático'}
                      </div>
                    </button>
                  ))}
                </div>
                <PaginationBar
                  page={memorialsPaged.safePage}
                  totalPages={memorialsPaged.totalPages}
                  totalItems={memorials.length}
                  startIndex={memorialsPaged.start}
                  endIndex={memorialsPaged.end}
                  onPageChange={setMemorialsPage}
                  itemLabel="memoriais"
                  compact
                />
              </div>

              <div className="shrink-0 space-y-1.5">
                <button
                  type="button"
                  onClick={handleDownloadDOCX}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-[#2F7CF6] px-3 py-2 text-xs font-medium text-white hover:bg-[#2567d4]"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Exportar Memoriais (.docx)
                </button>
                <button
                  type="button"
                  onClick={handleDownloadMemorialPDF}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-[#2F7CF6] bg-[#14161A] px-3 py-2 text-xs font-medium text-white hover:bg-[#2F7CF6]/15"
                >
                  <Download className="h-3.5 w-3.5 text-[#2F7CF6]" />
                  Exportar Memorial Executivo (.pdf)
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24] p-3.5 lg:col-span-8">
              <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-white">{activeMemorial.title}</h2>
                  <p className="truncate text-[11px] text-slate-400">
                    Campos sem entrada permanecem como NÃO INFORMADO. Edite abaixo se desejar customizar antes da exportação.
                  </p>
                </div>
                {project.memorialOverrides[activeMemorial.key] && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateProject((prev) => {
                        const next = { ...prev.memorialOverrides };
                        delete next[activeMemorial.key];
                        return { ...prev, memorialOverrides: next };
                      })
                    }
                    className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 text-xs text-slate-300 hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restaurar Automático
                  </button>
                )}
              </div>

              <textarea
                value={activeMemorial.content}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdateProject((prev) => ({
                    ...prev,
                    memorialOverrides: { ...prev.memorialOverrides, [activeMemorial.key]: val },
                  }));
                }}
                className="min-h-0 w-full flex-1 resize-none rounded border border-slate-700 bg-white p-3.5 font-mono text-xs leading-relaxed text-slate-900"
              />
            </div>
          </div>
        )}

        {subTab === 'rt' && (
          <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-12">
            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24] p-3.5 lg:col-span-7">
              <h2 className="flex shrink-0 items-center gap-2 text-xs font-semibold text-white">
                <UserCheck className="h-4 w-4 text-[#2F7CF6]" />
                Profissionais, Responsabilidade Técnica (CAU/CREA) & Etapa
              </h2>

              <div className="mt-2.5 grid shrink-0 gap-2.5 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-[11px] text-slate-400">Etapa Atual do Projeto</span>
                  <select
                    value={project.stage}
                    onChange={(e) =>
                      onUpdateProject(
                        (prev) => ({ ...prev, stage: e.target.value as ProjectStage }),
                        `Etapa alterada para ${e.target.value}`,
                      )
                    }
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 text-xs text-white"
                  >
                    {STAGES.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end text-[11px] text-slate-400">
                  Etapa &quot;Validado pelo RT&quot; exige registro de profissional habilitado e ART/RRT emitida.
                </div>
              </div>

              <form
                onSubmit={addProfessional}
                className="mt-2.5 grid shrink-0 gap-2 border-t border-slate-800 pt-2.5 sm:grid-cols-5"
              >
                <select
                  value={profRole}
                  onChange={(e) =>
                    setProfRole(e.target.value as TechnicalProfessional['role'])
                  }
                  className="rounded border border-slate-700 bg-[#14161A] px-2 py-1 text-xs text-white"
                >
                  <option value="arquiteto">Arquiteto</option>
                  <option value="eng_civil">Eng. Civil</option>
                  <option value="eng_eletricista">Eng. Eletricista</option>
                  <option value="eng_hidraulico">Eng. Hidráulico</option>
                  <option value="proprietario">Proprietário</option>
                </select>
                <input
                  type="text"
                  placeholder="Nome completo"
                  value={profName}
                  onChange={(e) => setProfName(e.target.value)}
                  className="rounded border border-slate-700 bg-[#14161A] px-2 py-1 text-xs text-white sm:col-span-2"
                />
                <input
                  type="text"
                  placeholder="Registro (CAU/CREA)"
                  value={profReg}
                  onChange={(e) => setProfReg(e.target.value)}
                  className="rounded border border-slate-700 bg-[#14161A] px-2 py-1 text-xs text-white"
                />
                <div className="flex gap-1">
                  <input
                    type="text"
                    placeholder="ART/RRT"
                    value={profArt}
                    onChange={(e) => setProfArt(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1 text-xs text-white"
                  />
                  <button
                    type="submit"
                    className="rounded bg-[#2F7CF6] px-2 py-1 text-white hover:bg-[#2567d4]"
                    title="Adicionar"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </form>

              <div className="mt-2.5 flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-slate-800 bg-[#14161A]">
                <div className="min-h-0 flex-1 divide-y divide-slate-800 overflow-hidden">
                  {profsPaged.slice.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <span className="font-semibold text-white">{p.name || 'Não informado'}</span>{' '}
                        <span className="text-slate-400">· {p.profession}</span>
                        <div className="truncate font-mono text-[11px] text-slate-400">
                          {p.council}: {p.registrationNumber || 'N/I'} · ART/RRT:{' '}
                          {p.artRrtCode || 'Pendente'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeProfessional(p.id)}
                        className="shrink-0 text-slate-500 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {project.professionals.length === 0 && (
                    <div className="px-3 py-6 text-center text-xs text-slate-500">
                      Nenhum responsável técnico cadastrado.
                    </div>
                  )}
                </div>
                <PaginationBar
                  page={profsPaged.safePage}
                  totalPages={profsPaged.totalPages}
                  totalItems={project.professionals.length}
                  startIndex={profsPaged.start}
                  endIndex={profsPaged.end}
                  onPageChange={setProfsPage}
                  itemLabel="profissionais"
                  compact
                />
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-2.5 overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24] p-3.5 lg:col-span-5">
              <h2 className="flex shrink-0 items-center gap-2 text-xs font-semibold text-white">
                <History className="h-4 w-4 text-[#2F7CF6]" />
                Histórico de Revisões (R00, R01...)
              </h2>

              <div className="flex shrink-0 gap-2">
                <input
                  type="text"
                  placeholder="Descrição da nova revisão..."
                  value={revisionDesc}
                  onChange={(e) => setRevisionDesc(e.target.value)}
                  className="flex-1 rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!revisionDesc.trim()) return;
                    onUpdateProject((prev) => appendRevision(prev, revisionDesc.trim()));
                    setRevisionDesc('');
                    setRevsPage(0);
                  }}
                  className="rounded bg-[#2F7CF6] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#2567d4] whitespace-nowrap"
                >
                  Emitir Revisão
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-slate-800 bg-[#14161A]">
                <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden p-2">
                  {revsPaged.slice.map((rev) => (
                    <div
                      key={rev.id}
                      className="rounded border border-slate-800 bg-[#1B1E24] px-2.5 py-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between font-mono text-[10px] text-slate-400">
                        <span className="font-semibold text-[#2F7CF6]">{rev.revisionCode}</span>
                        <span>{new Date(rev.timestamp).toLocaleString('pt-BR')}</span>
                      </div>
                      <p className="mt-0.5 truncate text-slate-200">{rev.description}</p>
                    </div>
                  ))}
                </div>
                <PaginationBar
                  page={revsPaged.safePage}
                  totalPages={revsPaged.totalPages}
                  totalItems={reversedRevisions.length}
                  startIndex={revsPaged.start}
                  endIndex={revsPaged.end}
                  onPageChange={setRevsPage}
                  itemLabel="revisões"
                  compact
                />
              </div>
            </div>
          </div>
        )}

        {subTab === 'exportacao' && (
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
            <div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <button
                type="button"
                onClick={handleDownloadZIP}
                className="flex items-start gap-2.5 rounded-lg border border-[#2F7CF6] bg-[#2F7CF6]/15 p-2.5 text-left hover:bg-[#2F7CF6]/20"
              >
                <Archive className="mt-0.5 h-4 w-4 shrink-0 text-[#2F7CF6]" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-white">
                    EMPREENDIMENTO COMPLETO (.zip)
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-300">
                    12 pastas organizadas (01 Arquitetura até 12 Backup).
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleDownloadSheetPDF}
                className="flex items-start gap-2.5 rounded-lg border border-slate-800 bg-[#1B1E24] p-2.5 text-left hover:border-slate-700"
              >
                <Download className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-white">
                    Prancha Técnica ({selectedSheetId}.pdf)
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
                    PDF vetorial {paperFormat} com planta, quadro resumo e carimbo.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleDownloadDOCX}
                className="flex items-start gap-2.5 rounded-lg border border-slate-800 bg-[#1B1E24] p-2.5 text-left hover:border-slate-700"
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-white">
                    Memoriais Descritivos (.docx)
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
                    Word estruturado com quadros de áreas, acabamentos e RT.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleDownloadMemorialPDF}
                className="flex items-start gap-2.5 rounded-lg border border-slate-800 bg-[#1B1E24] p-2.5 text-left hover:border-slate-700"
              >
                <Download className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-white">
                    Memorial Executivo (.pdf)
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
                    Relatório A4 paginado com identificação e especificações.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleDownloadXLSX}
                className="flex items-start gap-2.5 rounded-lg border border-slate-800 bg-[#1B1E24] p-2.5 text-left hover:border-slate-700"
              >
                <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-white">
                    Quantitativos & Orçamento (.xlsx)
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
                    Excel com 7 abas: Resumo, SINAPI-RJ, Curva ABC e Cronograma.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleDownloadDXF(0)}
                className="flex items-start gap-2.5 rounded-lg border border-slate-800 bg-[#1B1E24] p-2.5 text-left hover:border-slate-700"
              >
                <FileCode2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-white">
                    Planta CAD Vetorial (.dxf)
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
                    Layers CAD separados (TERRENO, PAREDES, MEP).
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleDownloadJSON}
                className="flex items-start gap-2.5 rounded-lg border border-slate-800 bg-[#1B1E24] p-2.5 text-left hover:border-slate-700 sm:col-span-2"
              >
                <Download className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-white">
                    Backup Integral do Projeto (.json)
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
                    Exportação completa de dados paramétricos, revisões e configurações para restauração futura.
                  </div>
                </div>
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24]">
              <div className="shrink-0 border-b border-slate-800 bg-[#14161A] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                Matriz Transparente de Formatos & Capacidades
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <table className="w-full table-fixed text-left text-xs">
                  <thead className="border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="w-40 px-3.5 py-2 font-medium">Formato</th>
                      <th className="w-36 px-3.5 py-2 font-medium">Status Real</th>
                      <th className="px-3.5 py-2 font-medium">Escopo Técnico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {capsPaged.slice.map((cap) => (
                      <tr key={cap.format}>
                        <td className="truncate px-3.5 py-1.5 font-mono font-semibold text-white">
                          {cap.format}
                        </td>
                        <td className="px-3.5 py-1.5">
                          {cap.status === 'IMPLEMENTADO' ? (
                            <span className="inline-flex items-center gap-1 font-medium text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              IMPLEMENTADO
                            </span>
                          ) : (
                            <span className="font-medium text-amber-400">{cap.status}</span>
                          )}
                        </td>
                        <td className="truncate px-3.5 py-1.5 text-slate-300" title={cap.scope}>
                          {cap.scope}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={capsPaged.safePage}
                totalPages={capsPaged.totalPages}
                totalItems={EXPORT_CAPABILITIES.length}
                startIndex={capsPaged.start}
                endIndex={capsPaged.end}
                onPageChange={setCapsPage}
                itemLabel="formatos"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
