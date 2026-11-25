import React, { useMemo, useState } from 'react';
import {
  Accessibility,
  AlertOctagon,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Compass,
  Flame,
  Info,
  ShieldAlert,
} from 'lucide-react';
import {
  evaluateAccessibility,
  evaluateFireSafety,
  runCompatibilityAnalysis,
  type ClashSeverity,
} from '../engine/engineering';
import { PaginationBar, paginateItems, useViewportPageSize } from './PaginationBar';
import type { NormativeReference, Project } from '../types/project';

interface EngineeringComplianceModuleProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
  onFocusUnitTypeIn2D: (unitTypeId: string) => void;
  onOpen3D: () => void;
}

export const EngineeringComplianceModule: React.FC<EngineeringComplianceModuleProps> = ({
  project,
  onUpdateProject,
  onFocusUnitTypeIn2D,
  onOpen3D,
}) => {
  const [activeTab, setActiveTab] = useState<'clash' | 'acessibilidade' | 'incendio' | 'normas'>(
    'clash',
  );
  const [severityFilter, setSeverityFilter] = useState<'TODAS' | ClashSeverity>('TODAS');
  const [normFilter, setNormFilter] = useState('');

  const [clashPage, setClashPage] = useState(0);
  const [accPage, setAccPage] = useState(0);
  const [firePage, setFirePage] = useState(0);
  const [normPage, setNormPage] = useState(0);

  const clashPageSize = useViewportPageSize(260, 108, 2, 7);
  const accPageSize = useViewportPageSize(200, 42, 4, 14);
  const firePageSize = useViewportPageSize(200, 46, 4, 12);
  const normPageSize = useViewportPageSize(235, 52, 3, 12);

  const clashes = useMemo(() => runCompatibilityAnalysis(project), [project]);
  const accItems = useMemo(() => evaluateAccessibility(project), [project]);
  const fireItems = useMemo(() => evaluateFireSafety(project), [project]);

  const counts = useMemo(
    () => ({
      CRITICO: clashes.filter((c) => c.severity === 'CRITICO').length,
      ATENCAO: clashes.filter((c) => c.severity === 'ATENCAO').length,
      INFORMATIVO: clashes.filter((c) => c.severity === 'INFORMATIVO').length,
    }),
    [clashes],
  );

  const visibleClashes = useMemo(
    () =>
      severityFilter === 'TODAS'
        ? clashes
        : clashes.filter((c) => c.severity === severityFilter),
    [clashes, severityFilter],
  );

  const filteredNorms = useMemo(() => {
    const q = normFilter.trim().toLowerCase();
    if (!q) return project.normativeRefs;
    return project.normativeRefs.filter(
      (n) =>
        n.code.toLowerCase().includes(q) ||
        n.title.toLowerCase().includes(q) ||
        n.discipline.toLowerCase().includes(q),
    );
  }, [project.normativeRefs, normFilter]);

  const clashPaged = paginateItems(visibleClashes, clashPage, clashPageSize);
  const accPaged = paginateItems(accItems, accPage, accPageSize);
  const firePaged = paginateItems(fireItems, firePage, firePageSize);
  const normPaged = paginateItems(filteredNorms, normPage, normPageSize);

  const updateNorm = (id: string, patch: Partial<NormativeReference>) => {
    onUpdateProject((prev) => ({
      ...prev,
      normativeRefs: prev.normativeRefs.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#14161A] p-3 text-slate-100">
      <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-2.5 overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-white">
              Compatibilização, Acessibilidade, Incêndio & Normas Técnicas
            </h1>
            <p className="truncate text-xs text-slate-400">
              Verificação cruzada entre geometria arquitetônica, mobiliário, instalações MEP, rotas acessíveis e referências normativas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('clash')}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition ${
                activeTab === 'clash'
                  ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                  : 'border-slate-800 bg-[#1B1E24] text-slate-300 hover:border-slate-700'
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Compatibilização ({clashes.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('acessibilidade')}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition ${
                activeTab === 'acessibilidade'
                  ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                  : 'border-slate-800 bg-[#1B1E24] text-slate-300 hover:border-slate-700'
              }`}
            >
              <Accessibility className="h-3.5 w-3.5" />
              Acessibilidade
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('incendio')}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition ${
                activeTab === 'incendio'
                  ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                  : 'border-slate-800 bg-[#1B1E24] text-slate-300 hover:border-slate-700'
              }`}
            >
              <Flame className="h-3.5 w-3.5" />
              Incêndio
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('normas')}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition ${
                activeTab === 'normas'
                  ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                  : 'border-slate-800 bg-[#1B1E24] text-slate-300 hover:border-slate-700'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              Normas ({project.normativeRefs.length})
            </button>
          </div>
        </div>

        {activeTab === 'clash' && (
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
            <div className="grid shrink-0 grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setSeverityFilter(severityFilter === 'CRITICO' ? 'TODAS' : 'CRITICO');
                  setClashPage(0);
                }}
                className={`flex items-center justify-between rounded-lg border px-3.5 py-2 text-left transition ${
                  severityFilter === 'CRITICO'
                    ? 'border-red-500 bg-red-500/10'
                    : 'border-slate-800 bg-[#1B1E24] hover:border-slate-700'
                }`}
              >
                <div>
                  <span className="text-[11px] text-red-400">Críticos (Impeditivos)</span>
                  <p className="font-mono text-xl font-semibold tabular-nums text-white">
                    {counts.CRITICO}
                  </p>
                </div>
                <AlertOctagon className="h-5 w-5 text-red-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setSeverityFilter(severityFilter === 'ATENCAO' ? 'TODAS' : 'ATENCAO');
                  setClashPage(0);
                }}
                className={`flex items-center justify-between rounded-lg border px-3.5 py-2 text-left transition ${
                  severityFilter === 'ATENCAO'
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-800 bg-[#1B1E24] hover:border-slate-700'
                }`}
              >
                <div>
                  <span className="text-[11px] text-amber-400">Atenção (Interferências / Divergências)</span>
                  <p className="font-mono text-xl font-semibold tabular-nums text-white">
                    {counts.ATENCAO}
                  </p>
                </div>
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setSeverityFilter(severityFilter === 'INFORMATIVO' ? 'TODAS' : 'INFORMATIVO');
                  setClashPage(0);
                }}
                className={`flex items-center justify-between rounded-lg border px-3.5 py-2 text-left transition ${
                  severityFilter === 'INFORMATIVO'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-800 bg-[#1B1E24] hover:border-slate-700'
                }`}
              >
                <div>
                  <span className="text-[11px] text-blue-400">Informativos / Escopo Técnico</span>
                  <p className="font-mono text-xl font-semibold tabular-nums text-white">
                    {counts.INFORMATIVO}
                  </p>
                </div>
                <Info className="h-5 w-5 text-blue-400" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24]">
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2.5">
                {clashPaged.slice.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-slate-800 bg-[#14161A] px-3.5 py-2.5"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          {c.severity === 'CRITICO' && (
                            <span className="inline-flex items-center gap-1 font-semibold text-red-400">
                              <AlertOctagon className="h-3 w-3" />
                              CRÍTICO
                            </span>
                          )}
                          {c.severity === 'ATENCAO' && (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-400">
                              <AlertTriangle className="h-3 w-3" />
                              ATENÇÃO
                            </span>
                          )}
                          {c.severity === 'INFORMATIVO' && (
                            <span className="inline-flex items-center gap-1 font-semibold text-blue-400">
                              <Info className="h-3 w-3" />
                              INFORMATIVO
                            </span>
                          )}
                          <span className="text-slate-500">·</span>
                          <span className="font-medium text-slate-300">{c.disciplines}</span>
                          <span className="text-slate-500">·</span>
                          <span className="text-slate-400">
                            {c.location} · {c.roomName}
                          </span>
                        </div>
                        <p className="truncate text-xs font-medium text-white">{c.description}</p>
                        <p className="truncate text-[11px] text-slate-400">
                          <strong className="text-slate-300">Causa:</strong> {c.reason}
                        </p>
                        <p className="truncate text-[11px] text-emerald-300/90">
                          <strong className="text-emerald-300">Correção recomendada:</strong>{' '}
                          {c.suggestion}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {c.targetUnitTypeId && (
                          <button
                            type="button"
                            onClick={() => onFocusUnitTypeIn2D(c.targetUnitTypeId!)}
                            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#1B1E24] px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:border-[#2F7CF6] hover:text-white whitespace-nowrap"
                          >
                            <Compass className="h-3 w-3 text-[#2F7CF6]" />
                            Localizar no 2D
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={onOpen3D}
                          className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#1B1E24] px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:border-[#2F7CF6] hover:text-white whitespace-nowrap"
                        >
                          Ver no 3D
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {visibleClashes.length === 0 && (
                  <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-200">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    <span>Nenhum conflito encontrado para o filtro selecionado.</span>
                  </div>
                )}
              </div>

              <PaginationBar
                page={clashPaged.safePage}
                totalPages={clashPaged.totalPages}
                totalItems={visibleClashes.length}
                startIndex={clashPaged.start}
                endIndex={clashPaged.end}
                onPageChange={setClashPage}
                itemLabel="ocorrências"
              />
            </div>
          </div>
        )}

        {activeTab === 'acessibilidade' && (
          <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-12">
            <div className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24] p-3.5 lg:col-span-4">
              <h2 className="text-sm font-semibold text-white">
                Critérios de Acessibilidade
              </h2>
              <label className="block space-y-1">
                <span className="text-xs text-slate-400">Norma de Referência</span>
                <input
                  type="text"
                  value={project.accessibilityConfig.normReference}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      accessibilityConfig: {
                        ...prev.accessibilityConfig,
                        normReference: e.target.value,
                      },
                    }))
                  }
                  className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                />
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={project.accessibilityConfig.requireAccessibleUnits}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      accessibilityConfig: {
                        ...prev.accessibilityConfig,
                        requireAccessibleUnits: e.target.checked,
                      },
                    }))
                  }
                  className="rounded border-slate-600"
                />
                Exigir tipologia adaptada no empreendimento
              </label>

              <div className="grid grid-cols-3 gap-2">
                <label className="block space-y-1">
                  <span className="text-[11px] text-slate-400">Vão Porta (m)</span>
                  <input
                    type="number"
                    step="0.05"
                    value={project.accessibilityConfig.minDoorWidthM}
                    onChange={(e) =>
                      onUpdateProject((prev) => ({
                        ...prev,
                        accessibilityConfig: {
                          ...prev.accessibilityConfig,
                          minDoorWidthM: Number(e.target.value) || 0.8,
                        },
                      }))
                    }
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1.5 font-mono text-xs tabular-nums text-white"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] text-slate-400">Corredor (m)</span>
                  <input
                    type="number"
                    step="0.05"
                    value={project.accessibilityConfig.minCorridorWidthM}
                    onChange={(e) =>
                      onUpdateProject((prev) => ({
                        ...prev,
                        accessibilityConfig: {
                          ...prev.accessibilityConfig,
                          minCorridorWidthM: Number(e.target.value) || 1.2,
                        },
                      }))
                    }
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1.5 font-mono text-xs tabular-nums text-white"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] text-slate-400">Giro Ø (m)</span>
                  <input
                    type="number"
                    step="0.05"
                    value={project.accessibilityConfig.turningCircleDiameterM}
                    onChange={(e) =>
                      onUpdateProject((prev) => ({
                        ...prev,
                        accessibilityConfig: {
                          ...prev.accessibilityConfig,
                          turningCircleDiameterM: Number(e.target.value) || 1.5,
                        },
                      }))
                    }
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1.5 font-mono text-xs tabular-nums text-white"
                  />
                </label>
              </div>
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24] lg:col-span-8">
              <div className="min-h-0 flex-1 overflow-hidden">
                <table className="w-full table-fixed text-left text-xs">
                  <thead className="border-b border-slate-800 bg-[#14161A] text-slate-400">
                    <tr>
                      <th className="w-20 px-3 py-2 font-medium">Código</th>
                      <th className="px-3 py-2 font-medium">Critério</th>
                      <th className="w-28 px-3 py-2 font-medium">Esperado</th>
                      <th className="px-3 py-2 font-medium">Encontrado no Modelo</th>
                      <th className="w-28 px-3 py-2 font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {accPaged.slice.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 font-mono text-slate-300">{item.code}</td>
                        <td className="px-3 py-2 text-white">{item.criterion}</td>
                        <td className="px-3 py-2 font-mono text-slate-300">{item.expected}</td>
                        <td className="px-3 py-2 text-slate-300">{item.found}</td>
                        <td className="px-3 py-2 font-semibold">
                          <span
                            className={
                              item.status === 'ATENDIDO'
                                ? 'text-emerald-400'
                                : item.status === 'NAO_ATENDIDO'
                                  ? 'text-red-400'
                                  : 'text-amber-400'
                            }
                          >
                            {item.status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={accPaged.safePage}
                totalPages={accPaged.totalPages}
                totalItems={accItems.length}
                startIndex={accPaged.start}
                endIndex={accPaged.end}
                onPageChange={setAccPage}
                itemLabel="critérios"
              />
            </div>
          </div>
        )}

        {activeTab === 'incendio' && (
          <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-12">
            <div className="flex min-h-0 flex-col gap-2.5 overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24] p-3.5 lg:col-span-5">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Prevenção e Combate a Incêndio (Preliminar)
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Parâmetros preliminares de arquitetura. A aprovação de PPCI/CLCB depende da legislação estadual (Corpo de Bombeiros) e RT habilitado.
                </p>
              </div>

              <label className="block space-y-1">
                <span className="text-[11px] text-slate-400">Classificação de Ocupação</span>
                <input
                  type="text"
                  value={project.fireSafetyNotes.occupancyClass}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      fireSafetyNotes: { ...prev.fireSafetyNotes, occupancyClass: e.target.value },
                    }))
                  }
                  className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 text-xs text-white"
                />
              </label>

              <div className="grid grid-cols-3 gap-2">
                <label className="col-span-2 block space-y-1">
                  <span className="text-[11px] text-slate-400">Regulamentação Estadual (Decreto / IT)</span>
                  <input
                    type="text"
                    value={project.fireSafetyNotes.stateRegulation}
                    onChange={(e) =>
                      onUpdateProject((prev) => ({
                        ...prev,
                        fireSafetyNotes: { ...prev.fireSafetyNotes, stateRegulation: e.target.value },
                      }))
                    }
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 text-xs text-white"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] text-slate-400">Pop. / Unid.</span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={project.fireSafetyNotes.estimatedPopulationPerUnit}
                    onChange={(e) =>
                      onUpdateProject((prev) => ({
                        ...prev,
                        fireSafetyNotes: {
                          ...prev.fireSafetyNotes,
                          estimatedPopulationPerUnit: Math.max(1, Number(e.target.value) || 2),
                        },
                      }))
                    }
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 font-mono text-xs tabular-nums text-white"
                  />
                </label>
              </div>

              <div className="space-y-1.5 pt-1 text-xs text-slate-200">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={project.fireSafetyNotes.hasExtinguishers}
                    onChange={(e) =>
                      onUpdateProject((prev) => ({
                        ...prev,
                        fireSafetyNotes: { ...prev.fireSafetyNotes, hasExtinguishers: e.target.checked },
                      }))
                    }
                  />
                  Extintores previstos nas circulações comuns
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={project.fireSafetyNotes.hasEmergencyLighting}
                    onChange={(e) =>
                      onUpdateProject((prev) => ({
                        ...prev,
                        fireSafetyNotes: {
                          ...prev.fireSafetyNotes,
                          hasEmergencyLighting: e.target.checked,
                        },
                      }))
                    }
                  />
                  Iluminação de emergência prevista
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={project.fireSafetyNotes.hasSignage}
                    onChange={(e) =>
                      onUpdateProject((prev) => ({
                        ...prev,
                        fireSafetyNotes: { ...prev.fireSafetyNotes, hasSignage: e.target.checked },
                      }))
                    }
                  />
                  Sinalização de rotas de fuga prevista
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={project.fireSafetyNotes.hasHydrants}
                    onChange={(e) =>
                      onUpdateProject((prev) => ({
                        ...prev,
                        fireSafetyNotes: { ...prev.fireSafetyNotes, hasHydrants: e.target.checked },
                      }))
                    }
                  />
                  Sistema de hidrantes (se exigido por área/altura)
                </label>
                <label className="flex items-center gap-2 text-emerald-300">
                  <input
                    type="checkbox"
                    checked={project.fireSafetyNotes.verifiedByProfessional}
                    onChange={(e) =>
                      onUpdateProject((prev) => ({
                        ...prev,
                        fireSafetyNotes: {
                          ...prev.fireSafetyNotes,
                          verifiedByProfessional: e.target.checked,
                        },
                      }))
                    }
                  />
                  Conferido por Responsável Técnico habilitado
                </label>
              </div>
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24] lg:col-span-7">
              <div className="min-h-0 flex-1 overflow-hidden">
                <table className="w-full table-fixed text-left text-xs">
                  <thead className="border-b border-slate-800 bg-[#14161A] text-slate-400">
                    <tr>
                      <th className="w-20 px-3 py-2 font-medium">Código</th>
                      <th className="px-3 py-2 font-medium">Requisito</th>
                      <th className="px-3 py-2 font-medium">Situação Atual</th>
                      <th className="w-28 px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {firePaged.slice.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 font-mono text-slate-300">{item.code}</td>
                        <td className="px-3 py-2 text-white">
                          <div className="truncate">{item.criterion}</div>
                          <div className="truncate text-[11px] text-slate-500">{item.reference}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-300">{item.found}</td>
                        <td className="px-3 py-2 font-semibold">
                          <span
                            className={
                              item.status === 'ATENDIDO'
                                ? 'text-emerald-400'
                                : item.status === 'NAO_AVALIADO'
                                  ? 'text-slate-400'
                                  : 'text-amber-400'
                            }
                          >
                            {item.status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={firePaged.safePage}
                totalPages={firePaged.totalPages}
                totalItems={fireItems.length}
                startIndex={firePaged.start}
                endIndex={firePaged.end}
                onPageChange={setFirePage}
                itemLabel="requisitos"
              />
            </div>
          </div>
        )}

        {activeTab === 'normas' && (
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#1B1E24] px-3.5 py-2.5">
              <div>
                <h2 className="text-xs font-semibold text-white">
                  Registro de Normas Técnicas e Critérios Aplicados
                </h2>
                <p className="text-[11px] text-slate-400">
                  Normas cadastradas devem ter vigência e aplicabilidade local confirmadas pelo responsável técnico.
                </p>
              </div>
              <input
                type="search"
                placeholder="Filtrar por NBR, disciplina..."
                value={normFilter}
                onChange={(e) => {
                  setNormFilter(e.target.value);
                  setNormPage(0);
                }}
                className="w-60 rounded border border-slate-700 bg-[#14161A] px-3 py-1 text-xs text-white"
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24]">
              <div className="min-h-0 flex-1 overflow-hidden">
                <table className="w-full table-fixed text-left text-xs">
                  <thead className="border-b border-slate-800 bg-[#14161A] text-slate-400">
                    <tr>
                      <th className="w-28 px-3 py-2 font-medium">Norma</th>
                      <th className="w-28 px-3 py-2 font-medium">Disciplina</th>
                      <th className="px-3 py-2 font-medium">Título / Aplicação</th>
                      <th className="px-3 py-2 font-medium">Parâmetros Adotados</th>
                      <th className="w-40 px-3 py-2 font-medium">Vigência</th>
                      <th className="w-36 px-3 py-2 font-medium">Conferido por</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {normPaged.slice.map((n) => (
                      <tr key={n.id} className="hover:bg-slate-800/30">
                        <td className="truncate px-3 py-2 font-mono font-semibold text-white">
                          {n.code}
                        </td>
                        <td className="truncate px-3 py-2 text-slate-300">{n.discipline}</td>
                        <td className="px-3 py-2">
                          <div className="truncate font-medium text-slate-200">{n.title}</div>
                          <div className="truncate text-[11px] text-slate-400">{n.application}</div>
                        </td>
                        <td className="truncate px-3 py-2 text-slate-300" title={n.parametersSummary}>
                          {n.parametersSummary}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={n.updateStatus}
                            onChange={(e) =>
                              updateNorm(n.id, {
                                updateStatus: e.target.value as NormativeReference['updateStatus'],
                              })
                            }
                            className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1 text-[11px] text-slate-200"
                          >
                            <option value="verificar_vigencia">Verificar vigência</option>
                            <option value="verificada_usuario">Verificada pelo usuário</option>
                            <option value="pendente">Pendente</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            placeholder="Nome / CAU-CREA"
                            value={n.verifiedBy}
                            onChange={(e) => updateNorm(n.id, { verifiedBy: e.target.value })}
                            className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1 text-[11px] text-white"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={normPaged.safePage}
                totalPages={normPaged.totalPages}
                totalItems={filteredNorms.length}
                startIndex={normPaged.start}
                endIndex={normPaged.end}
                onPageChange={setNormPage}
                itemLabel="normas"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
