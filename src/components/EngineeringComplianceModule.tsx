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

  const updateNorm = (id: string, patch: Partial<NormativeReference>) => {
    onUpdateProject((prev) => ({
      ...prev,
      normativeRefs: prev.normativeRefs.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
  };

  return (
    <div className="h-full overflow-y-auto bg-[#14161A] p-6 text-slate-100">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">
              Compatibilização, Acessibilidade, Incêndio & Normas Técnicas
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Verificação cruzada entre geometria arquitetônica, mobiliário, instalações MEP, rotas acessíveis e referências normativas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('clash')}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition ${
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
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition ${
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
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition ${
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
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition ${
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
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setSeverityFilter(severityFilter === 'CRITICO' ? 'TODAS' : 'CRITICO')}
                className={`rounded-lg border p-4 text-left transition ${
                  severityFilter === 'CRITICO'
                    ? 'border-red-500 bg-red-500/10'
                    : 'border-slate-800 bg-[#1B1E24] hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-red-400">
                  <span>Críticos (Impeditivos)</span>
                  <AlertOctagon className="h-4 w-4" />
                </div>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-white">
                  {counts.CRITICO}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSeverityFilter(severityFilter === 'ATENCAO' ? 'TODAS' : 'ATENCAO')}
                className={`rounded-lg border p-4 text-left transition ${
                  severityFilter === 'ATENCAO'
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-800 bg-[#1B1E24] hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-amber-400">
                  <span>Atenção (Interferências / Divergências)</span>
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-white">
                  {counts.ATENCAO}
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  setSeverityFilter(severityFilter === 'INFORMATIVO' ? 'TODAS' : 'INFORMATIVO')
                }
                className={`rounded-lg border p-4 text-left transition ${
                  severityFilter === 'INFORMATIVO'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-800 bg-[#1B1E24] hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-blue-400">
                  <span>Informativos / Escopo Técnico</span>
                  <Info className="h-4 w-4" />
                </div>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-white">
                  {counts.INFORMATIVO}
                </p>
              </button>
            </div>

            <div className="space-y-3">
              {visibleClashes.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-slate-800 bg-[#1B1E24] p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {c.severity === 'CRITICO' && (
                          <span className="inline-flex items-center gap-1 font-semibold text-red-400">
                            <AlertOctagon className="h-3.5 w-3.5" />
                            CRÍTICO
                          </span>
                        )}
                        {c.severity === 'ATENCAO' && (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-400">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            ATENÇÃO
                          </span>
                        )}
                        {c.severity === 'INFORMATIVO' && (
                          <span className="inline-flex items-center gap-1 font-semibold text-blue-400">
                            <Info className="h-3.5 w-3.5" />
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
                      <p className="text-sm font-medium text-white">{c.description}</p>
                      <p className="text-xs text-slate-400">
                        <strong className="text-slate-300">Causa:</strong> {c.reason}
                      </p>
                      <p className="text-xs text-emerald-300/90">
                        <strong className="text-emerald-300">Correção recomendada:</strong>{' '}
                        {c.suggestion}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {c.targetUnitTypeId && (
                        <button
                          type="button"
                          onClick={() => onFocusUnitTypeIn2D(c.targetUnitTypeId!)}
                          className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-[#2F7CF6] hover:text-white whitespace-nowrap"
                        >
                          <Compass className="h-3.5 w-3.5 text-[#2F7CF6]" />
                          Localizar no 2D
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={onOpen3D}
                        className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-[#2F7CF6] hover:text-white whitespace-nowrap"
                      >
                        Ver no 3D
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {visibleClashes.length === 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-5 text-sm text-emerald-200">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  <span>Nenhum conflito encontrado para o filtro selecionado.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'acessibilidade' && (
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-4 rounded-lg border border-slate-800 bg-[#1B1E24] p-4 lg:col-span-4">
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
                  className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
                />
              </label>

              <label className="flex items-center gap-2 pt-1 text-xs text-slate-200">
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
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1.5 font-mono text-sm tabular-nums text-white"
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
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1.5 font-mono text-sm tabular-nums text-white"
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
                    className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1.5 font-mono text-sm tabular-nums text-white"
                  />
                </label>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24] lg:col-span-8">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-[#14161A] text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Código</th>
                    <th className="px-3 py-2.5 font-medium">Critério</th>
                    <th className="px-3 py-2.5 font-medium">Esperado</th>
                    <th className="px-3 py-2.5 font-medium">Encontrado no Modelo</th>
                    <th className="px-3 py-2.5 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {accItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2.5 font-mono text-slate-300">{item.code}</td>
                      <td className="px-3 py-2.5 text-white">{item.criterion}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-300">{item.expected}</td>
                      <td className="px-3 py-2.5 text-slate-300">{item.found}</td>
                      <td className="px-3 py-2.5 font-semibold">
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
          </div>
        )}

        {activeTab === 'incendio' && (
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-4 rounded-lg border border-slate-800 bg-[#1B1E24] p-4 lg:col-span-5">
              <h2 className="text-sm font-semibold text-white">
                Prevenção e Combate a Incêndio (Preliminar)
              </h2>
              <p className="text-xs text-slate-400">
                Parâmetros preliminares de arquitetura. A aprovação de PPCI/CLCB depende da legislação estadual (Corpo de Bombeiros) e RT habilitado.
              </p>

              <label className="block space-y-1">
                <span className="text-xs text-slate-400">Classificação de Ocupação</span>
                <input
                  type="text"
                  value={project.fireSafetyNotes.occupancyClass}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      fireSafetyNotes: { ...prev.fireSafetyNotes, occupancyClass: e.target.value },
                    }))
                  }
                  className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-slate-400">Regulamentação Estadual (Decreto / IT)</span>
                <input
                  type="text"
                  value={project.fireSafetyNotes.stateRegulation}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      fireSafetyNotes: { ...prev.fireSafetyNotes, stateRegulation: e.target.value },
                    }))
                  }
                  className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-slate-400">População Estimada por Unidade</span>
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
                  className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 font-mono text-sm tabular-nums text-white"
                />
              </label>

              <div className="space-y-2 pt-1 text-xs text-slate-200">
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

            <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24] lg:col-span-7">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-[#14161A] text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Código</th>
                    <th className="px-3 py-2.5 font-medium">Requisito</th>
                    <th className="px-3 py-2.5 font-medium">Situação Atual</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {fireItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2.5 font-mono text-slate-300">{item.code}</td>
                      <td className="px-3 py-2.5 text-white">
                        <div>{item.criterion}</div>
                        <div className="text-[11px] text-slate-500">{item.reference}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-300">{item.found}</td>
                      <td className="px-3 py-2.5 font-semibold">
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
          </div>
        )}

        {activeTab === 'normas' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#1B1E24] p-4">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Registro de Normas Técnicas e Critérios Aplicados
                </h2>
                <p className="text-xs text-slate-400">
                  Normas cadastradas devem ter vigência e aplicabilidade local confirmadas pelo responsável técnico.
                </p>
              </div>
              <input
                type="search"
                placeholder="Filtrar por NBR, disciplina..."
                value={normFilter}
                onChange={(e) => setNormFilter(e.target.value)}
                className="w-64 rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
              />
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-[#14161A] text-slate-400">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Norma</th>
                      <th className="px-3 py-2.5 font-medium">Disciplina</th>
                      <th className="px-3 py-2.5 font-medium">Título / Aplicação</th>
                      <th className="px-3 py-2.5 font-medium">Parâmetros Adotados</th>
                      <th className="px-3 py-2.5 font-medium">Vigência</th>
                      <th className="px-3 py-2.5 font-medium">Conferido por</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredNorms.map((n) => (
                      <tr key={n.id} className="hover:bg-slate-800/30">
                        <td className="px-3 py-2.5 font-mono font-semibold text-white whitespace-nowrap">
                          {n.code}
                        </td>
                        <td className="px-3 py-2.5 text-slate-300">{n.discipline}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-slate-200">{n.title}</div>
                          <div className="text-[11px] text-slate-400">{n.application}</div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-300">{n.parametersSummary}</td>
                        <td className="px-3 py-2.5">
                          <select
                            value={n.updateStatus}
                            onChange={(e) =>
                              updateNorm(n.id, {
                                updateStatus: e.target.value as NormativeReference['updateStatus'],
                              })
                            }
                            className="rounded border border-slate-700 bg-[#14161A] px-2 py-1 text-xs text-slate-200"
                          >
                            <option value="verificar_vigencia">Verificar vigência</option>
                            <option value="verificada_usuario">Verificada pelo usuário</option>
                            <option value="pendente">Pendente</option>
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="text"
                            placeholder="Nome / CAU-CREA"
                            value={n.verifiedBy}
                            onChange={(e) => updateNorm(n.id, { verifiedBy: e.target.value })}
                            className="w-36 rounded border border-slate-700 bg-[#14161A] px-2 py-1 text-xs text-white"
                          />
                        </td>
                      </tr>
                    ))}
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
