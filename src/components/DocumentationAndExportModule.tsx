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
import type { Project, ProjectStage, TechnicalProfessional } from '../types/project';

interface DocumentationAndExportModuleProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
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

  const memorials = useMemo(() => generateAllMemorials(project), [project]);
  const activeMemorial =
    memorials.find((m) => m.key === selectedMemorialKey) ?? memorials[0];
  const activeSheet =
    TECHNICAL_SHEETS.find((s) => s.id === selectedSheetId) ?? TECHNICAL_SHEETS[0];

  const quantities = useMemo(() => calculateQuantities(project), [project]);
  const siteCheck = useMemo(() => analyzeSiteGeometry(project.site), [project.site]);
  const safeFloorIdx = Math.min(selectedFloorIdx, Math.max(0, project.floors.length - 1));

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

  const handleDownloadXLSX = () => {
    const buf = generateProjectXLSXBuffer(project);
    triggerBrowserDownload(
      new Blob([new Uint8Array(buf)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `${project.code}_Quantitativos_Orcamento.xlsx`,
    );
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
    <div className="h-full overflow-y-auto bg-[#14161A] p-6 text-slate-100">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">
              Pranchas Técnicas, Memoriais, Responsabilidade & Exportação
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Documentação gerada diretamente do modelo paramétrico · Revisão atual:{' '}
              <span className="font-mono text-white">
                {project.revisions[project.revisions.length - 1]?.revisionCode ?? 'R00'}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSubTab('pranchas')}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
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
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
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
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
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
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
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
              className="inline-flex items-center gap-1.5 rounded-md bg-[#2F7CF6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2567d4] whitespace-nowrap shrink-0"
            >
              <Archive className="h-3.5 w-3.5" />
              EXPORTAR EMPREENDIMENTO COMPLETO (.zip)
            </button>
          </div>
        </div>

        {busyMessage && (
          <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-2.5 text-xs text-blue-200">
            {busyMessage}
          </div>
        )}

        {subTab === 'pranchas' && (
          <div className="grid gap-5 lg:grid-cols-12">
            <div className="max-h-[760px] space-y-1.5 overflow-y-auto rounded-lg border border-slate-800 bg-[#1B1E24] p-3 lg:col-span-3">
              {TECHNICAL_SHEETS.map((sh) => (
                <button
                  key={sh.id}
                  type="button"
                  onClick={() => setSelectedSheetId(sh.id)}
                  className={`w-full rounded border px-3 py-2 text-left text-xs transition ${
                    selectedSheetId === sh.id
                      ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                      : 'border-slate-800 bg-[#14161A] text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono font-semibold">
                    <span>
                      {sh.id} — {sh.title}
                    </span>
                    <span className="text-[11px] text-slate-400">{sh.scale}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {sh.discipline} · {sh.description}
                  </div>
                </button>
              ))}
            </div>

            <div className="space-y-4 lg:col-span-9">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#1B1E24] p-3.5">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Prévia da Prancha {activeSheet.id} — {activeSheet.title}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Escala: {activeSheet.scale} · Formato de saída: {paperFormat}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {project.floors.length > 0 && activeSheet.id !== 'R01' && (
                    <select
                      value={safeFloorIdx}
                      onChange={(e) => setSelectedFloorIdx(Number(e.target.value))}
                      className="rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
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
                        className={`rounded px-2 py-1 font-medium transition ${
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
                        className={`rounded px-2 py-1 font-medium transition ${
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
                    className="rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
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
                    className="inline-flex items-center gap-1.5 rounded bg-[#2F7CF6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2567d4]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Exportar PDF
                  </button>
                </div>
              </div>

              {/* Technical Sheet Preview (Full-Width AutoCAD Vector CAD + ABNT Footer Strip) */}
              <div className="rounded-lg border-2 border-slate-700 bg-white p-3.5 text-slate-900 shadow-xl">
                <div className="border border-slate-900 p-2.5">
                  <div className="flex flex-wrap items-center justify-between border-b border-slate-300 pb-2 text-[11px]">
                    <span className="font-bold tracking-wide">
                      {activeSheet.id} — {activeSheet.title.toUpperCase()} ({activeSheet.discipline})
                    </span>
                    <span className="font-mono">
                      ESCALA {activeSheet.scale} · FOLHA {paperFormat} · ABNT NBR 6492
                    </span>
                  </div>

                  <div className="mt-2.5">
                    <CadSheetPreview
                      project={project}
                      sheetId={activeSheet.id}
                      floorIndex={safeFloorIdx}
                      cadTheme={cadTheme}
                      onRemoveRender={handleRemoveRender}
                    />
                  </div>

                  {/* ABNT Bottom Engineering Strip: Quadro Resumo + Tipologias + Carimbo Técnico */}
                  <div className="mt-2.5 grid gap-3 border-t border-slate-300 pt-2.5 md:grid-cols-12">
                    <div className="rounded border border-slate-300 bg-slate-50 p-2.5 text-[10px] md:col-span-4">
                      <div className="mb-1 font-bold uppercase tracking-wide text-slate-800">
                        Quadro Resumo do Empreendimento
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono">
                        <span>Terreno:</span>
                        <span className="text-right font-semibold">{siteCheck.calculatedArea} m²</span>
                        <span>Pavimentos:</span>
                        <span className="text-right font-semibold">{project.floors.length}</span>
                        <span>Unidades:</span>
                        <span className="text-right font-semibold">{quantities.summary.totalUnits} un</span>
                        <span>Área Privativa:</span>
                        <span className="text-right font-semibold">{quantities.summary.totalPrivateAreaM2} m²</span>
                        <span>Área Construída:</span>
                        <span className="text-right font-semibold">{quantities.summary.totalBuiltAreaM2} m²</span>
                      </div>
                    </div>

                    <div className="rounded border border-slate-300 bg-slate-50 p-2.5 text-[10px] md:col-span-4">
                      <div className="mb-1 font-bold uppercase tracking-wide text-slate-800">
                        Tipologias &amp; Sistema Construtivo
                      </div>
                      <div className="text-[10px] text-slate-700">
                        <strong>Método:</strong> {project.constructionMethod.name}
                      </div>
                      <div className="mt-1 space-y-0.5 font-mono text-[10px] text-slate-700">
                        {project.unitTypes.length === 0 ? (
                          <div className="text-slate-500">Nenhuma tipologia cadastrada.</div>
                        ) : (
                          project.unitTypes.map((ut) => (
                            <div key={ut.id}>
                              • {ut.code}: {ut.width}×{ut.depth}m ({round2(ut.width * ut.depth)}m²) · PD {ut.ceilingHeight}m
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Official Carimbo ABNT */}
                    <div className="border-2 border-slate-900 text-[10px] md:col-span-4">
                      <div className="border-b border-slate-900 bg-slate-100 px-2 py-1 font-bold">
                        KITNET PRO STUDIO — CARIMBO TÉCNICO
                      </div>
                      <div className="border-b border-slate-400 px-2 py-0.5">
                        <strong>Obra:</strong> {project.name} ({project.municipality}/{project.state})
                      </div>
                      <div className="border-b border-slate-400 px-2 py-0.5">
                        <strong>Prancha:</strong> {activeSheet.id} — {activeSheet.title}
                      </div>
                      <div className="grid grid-cols-3 border-b border-slate-400 font-mono">
                        <div className="border-r border-slate-400 px-2 py-0.5">
                          <strong>Esc:</strong> {activeSheet.scale}
                        </div>
                        <div className="border-r border-slate-400 px-2 py-0.5">
                          <strong>Rev:</strong> {project.revisions[project.revisions.length - 1]?.revisionCode ?? 'R00'}
                        </div>
                        <div className="px-2 py-0.5">
                          {new Date().toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      <div className="px-2 py-0.5">
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
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-2 lg:col-span-4">
              <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-3">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Memoriais por Disciplina
                </h2>
                <div className="space-y-1.5">
                  {memorials.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setSelectedMemorialKey(m.key)}
                      className={`w-full rounded border px-3 py-2 text-left text-xs transition ${
                        selectedMemorialKey === m.key
                          ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                          : 'border-slate-800 bg-[#14161A] text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-medium">{m.title}</div>
                      <div className="text-[11px] text-slate-400">
                        {m.discipline}
                        {project.memorialOverrides[m.key] ? ' · Editado manualmente' : ' · Automático'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownloadDOCX}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#2F7CF6] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2567d4]"
              >
                <FileText className="h-4 w-4" />
                Exportar Todos Memoriais (.docx)
              </button>
            </div>

            <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-4 lg:col-span-8">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-white">{activeMemorial.title}</h2>
                  <p className="text-xs text-slate-400">
                    Campos sem entrada permanecem explicitamente como NÃO INFORMADO. Você pode editar o texto abaixo se desejar customizar antes da exportação.
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
                    className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 text-xs text-slate-300 hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restaurar Texto Automático
                  </button>
                )}
              </div>

              <textarea
                rows={22}
                value={activeMemorial.content}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdateProject((prev) => ({
                    ...prev,
                    memorialOverrides: { ...prev.memorialOverrides, [activeMemorial.key]: val },
                  }));
                }}
                className="w-full rounded border border-slate-700 bg-white p-4 font-mono text-xs leading-relaxed text-slate-900"
              />
            </div>
          </div>
        )}

        {subTab === 'rt' && (
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-5 lg:col-span-7">
              <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <UserCheck className="h-4 w-4 text-[#2F7CF6]" />
                  Profissionais, Responsabilidade Técnica (CAU/CREA) & Etapa
                </h2>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Etapa Atual do Projeto</span>
                    <select
                      value={project.stage}
                      onChange={(e) =>
                        onUpdateProject(
                          (prev) => ({ ...prev, stage: e.target.value as ProjectStage }),
                          `Etapa alterada para ${e.target.value}`,
                        )
                      }
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
                    >
                      {STAGES.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-end text-xs text-slate-400">
                    Etapa &quot;Validado pelo RT&quot; exige registro de profissional habilitado e ART/RRT emitida.
                  </div>
                </div>

                <form onSubmit={addProfessional} className="mt-4 grid gap-2 border-t border-slate-800 pt-4 sm:grid-cols-5">
                  <select
                    value={profRole}
                    onChange={(e) =>
                      setProfRole(e.target.value as TechnicalProfessional['role'])
                    }
                    className="rounded border border-slate-700 bg-[#14161A] px-2 py-1.5 text-xs text-white"
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
                    className="rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 text-xs text-white sm:col-span-2"
                  />
                  <input
                    type="text"
                    placeholder="Registro (CAU/CREA)"
                    value={profReg}
                    onChange={(e) => setProfReg(e.target.value)}
                    className="rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                  />
                  <div className="flex gap-1">
                    <input
                      type="text"
                      placeholder="ART/RRT"
                      value={profArt}
                      onChange={(e) => setProfArt(e.target.value)}
                      className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1.5 text-xs text-white"
                    />
                    <button
                      type="submit"
                      className="rounded bg-[#2F7CF6] px-2.5 py-1.5 text-white hover:bg-[#2567d4]"
                      title="Adicionar"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </form>

                <div className="mt-4 divide-y divide-slate-800 rounded border border-slate-800 bg-[#14161A]">
                  {project.professionals.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div>
                        <span className="font-semibold text-white">{p.name || 'Não informado'}</span>{' '}
                        <span className="text-slate-400">· {p.profession}</span>
                        <div className="font-mono text-[11px] text-slate-400">
                          {p.council}: {p.registrationNumber || 'N/I'} · ART/RRT:{' '}
                          {p.artRrtCode || 'Pendente'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeProfessional(p.id)}
                        className="text-slate-500 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {project.professionals.length === 0 && (
                    <div className="px-3 py-4 text-center text-xs text-slate-500">
                      Nenhum responsável técnico cadastrado.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-lg border border-slate-800 bg-[#1B1E24] p-4 lg:col-span-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <History className="h-4 w-4 text-[#2F7CF6]" />
                Histórico de Revisões (R00, R01...)
              </h2>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Descrição da nova revisão..."
                  value={revisionDesc}
                  onChange={(e) => setRevisionDesc(e.target.value)}
                  className="flex-1 rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!revisionDesc.trim()) return;
                    onUpdateProject((prev) => appendRevision(prev, revisionDesc.trim()));
                    setRevisionDesc('');
                  }}
                  className="rounded bg-[#2F7CF6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2567d4] whitespace-nowrap"
                >
                  Emitir Revisão
                </button>
              </div>

              <div className="max-h-96 space-y-2 overflow-y-auto">
                {[...project.revisions].reverse().map((rev) => (
                  <div
                    key={rev.id}
                    className="rounded border border-slate-800 bg-[#14161A] p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
                      <span className="font-semibold text-[#2F7CF6]">{rev.revisionCode}</span>
                      <span>{new Date(rev.timestamp).toLocaleString('pt-BR')}</span>
                    </div>
                    <p className="mt-1 text-slate-200">{rev.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {subTab === 'exportacao' && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <button
                type="button"
                onClick={handleDownloadZIP}
                className="flex items-start gap-3 rounded-lg border border-[#2F7CF6] bg-[#2F7CF6]/15 p-4 text-left hover:bg-[#2F7CF6]/20"
              >
                <Archive className="mt-0.5 h-5 w-5 shrink-0 text-[#2F7CF6]" />
                <div>
                  <div className="text-sm font-semibold text-white">
                    EXPORTAR EMPREENDIMENTO COMPLETO (.zip)
                  </div>
                  <div className="mt-1 text-xs text-slate-300">
                    Pacote organizado em 12 pastas (01 — Arquitetura até 12 — Backup do projeto).
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleDownloadSheetPDF}
                className="flex items-start gap-3 rounded-lg border border-slate-800 bg-[#1B1E24] p-4 text-left hover:border-slate-700"
              >
                <Download className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                <div>
                  <div className="text-sm font-semibold text-white">
                    Prancha Técnica Atual (.pdf)
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    Gera PDF vetorial A3 com planta, quadro resumo e carimbo técnico ({selectedSheetId}).
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleDownloadDOCX}
                className="flex items-start gap-3 rounded-lg border border-slate-800 bg-[#1B1E24] p-4 text-left hover:border-slate-700"
              >
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
                <div>
                  <div className="text-sm font-semibold text-white">
                    Memoriais Descritivos (.docx)
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    Documento Word editável contendo todas as 10 disciplinas.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleDownloadXLSX}
                className="flex items-start gap-3 rounded-lg border border-slate-800 bg-[#1B1E24] p-4 text-left hover:border-slate-700"
              >
                <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                <div>
                  <div className="text-sm font-semibold text-white">
                    Quantitativos & Orçamento (.xlsx)
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    Planilha Excel com 5 abas: Resumo, Quantitativos, Orçamento, Quadro de Cargas e Pontos MEP.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleDownloadDXF(0)}
                className="flex items-start gap-3 rounded-lg border border-slate-800 bg-[#1B1E24] p-4 text-left hover:border-slate-700"
              >
                <FileCode2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                <div>
                  <div className="text-sm font-semibold text-white">
                    Planta CAD Vetorial (.dxf)
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    Layers separados (TERRENO, RECUOS, PAREDES_EXT, PAREDES_INT, MOBILIARIO, ELETRICA, HIDRAULICA).
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleDownloadJSON}
                className="flex items-start gap-3 rounded-lg border border-slate-800 bg-[#1B1E24] p-4 text-left hover:border-slate-700"
              >
                <Download className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />
                <div>
                  <div className="text-sm font-semibold text-white">
                    Backup Integral do Projeto (.json)
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    Exportação completa de dados paramétricos, revisões e configurações para restauração futura.
                  </div>
                </div>
              </button>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24]">
              <div className="border-b border-slate-800 bg-[#14161A] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-300">
                Matriz Transparente de Formatos & Capacidades
              </div>
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Formato</th>
                    <th className="px-4 py-2.5 font-medium">Status Real</th>
                    <th className="px-4 py-2.5 font-medium">Escopo Técnico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {EXPORT_CAPABILITIES.map((cap) => (
                    <tr key={cap.format}>
                      <td className="px-4 py-2.5 font-mono font-semibold text-white">
                        {cap.format}
                      </td>
                      <td className="px-4 py-2.5">
                        {cap.status === 'IMPLEMENTADO' ? (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            IMPLEMENTADO
                          </span>
                        ) : (
                          <span className="font-medium text-amber-400">{cap.status}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-300">{cap.scope}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
