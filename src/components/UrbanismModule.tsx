import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Plus, Scale, Trash2 } from 'lucide-react';
import { evaluateUrbanCompliance } from '../engine/engineering';
import { nextId } from '../engine/parametricGenerator';
import type { Project, UrbanRule } from '../types/project';
import { PaginationBar, paginateItems, useViewportPageSize } from './PaginationBar';

interface UrbanismModuleProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
}

export const UrbanismModule: React.FC<UrbanismModuleProps> = ({ project, onUpdateProject }) => {
  const [tab, setTab] = useState<'tabela' | 'nova'>('tabela');
  const [page, setPage] = useState(0);

  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState<UrbanRule['category']>('uso_ocupacao');
  const [lawRef, setLawRef] = useState('');
  const [paramKey, setParamKey] = useState('occupancyRate');
  const [limitVal, setLimitVal] = useState<string>('');
  const [unit, setUnit] = useState('%');
  const [condition, setCondition] = useState<'max' | 'min' | 'info'>('max');

  const evaluations = evaluateUrbanCompliance(project);
  const rowsPerPage = useViewportPageSize(310, 44, 4, 12);
  const paged = paginateItems(evaluations, page, rowsPerPage);

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim()) return;
    const rule: UrbanRule = {
      id: nextId('urb'),
      category,
      description: desc.trim(),
      municipality: project.municipality,
      source: 'Cadastro Técnico do Usuário',
      lawReference: lawRef.trim() || 'NÃO INFORMADO',
      referenceDate: new Date().toISOString().slice(0, 10),
      effectiveStatus: lawRef.trim() ? 'Informada pelo usuário' : 'Pendente confirmação municipal',
      parameterKey: paramKey,
      parameterLimit: limitVal.trim() === '' ? null : Number(limitVal),
      unit,
      condition,
      notes: '',
    };
    onUpdateProject(
      (prev) => ({ ...prev, urbanRules: [...prev.urbanRules, rule] }),
      `Cadastro de regra urbanística: ${rule.description}`,
    );
    setDesc('');
    setLawRef('');
    setLimitVal('');
    setTab('tabela');
  };

  const countByStatus = {
    atendido: evaluations.filter((e) => e.status === 'atendido').length,
    nao_atendido: evaluations.filter((e) => e.status === 'nao_atendido').length,
    nao_informado: evaluations.filter((e) => e.status === 'nao_informado').length,
    confirmacao_tecnica: evaluations.filter((e) => e.status === 'confirmacao_tecnica').length,
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col gap-2.5 overflow-hidden p-3">
      {/* Header + Mode Switch */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#2A2F38] pb-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-base font-semibold text-white">
            <Scale className="h-4 w-4 text-[#2F7CF6]" />
            Legislação Municipal &amp; Parâmetros Urbanísticos
          </h1>
          <p className="truncate text-[11px] text-[#949BA8]">
            Código de Obras e Plano Diretor ({project.municipality || 'Município N/I'} / {project.state || 'UF'}) — verificação preliminar rastreável.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded border border-[#2A2F38] bg-[#1B1E24] p-0.5">
          <button
            type="button"
            onClick={() => setTab('tabela')}
            className={`rounded px-3 py-1 text-xs font-medium whitespace-nowrap ${
              tab === 'tabela' ? 'bg-[#2F7CF6] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Parâmetros &amp; Índices ({evaluations.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('nova')}
            className={`inline-flex items-center gap-1 rounded px-3 py-1 text-xs font-medium whitespace-nowrap ${
              tab === 'nova' ? 'bg-[#2F7CF6] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            Cadastrar Regra Municipal
          </button>
        </div>
      </div>

      {/* Compact Warning + 4 KPI Strip */}
      <div className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-6">
        <div className="col-span-2 flex items-center gap-2 rounded border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-100">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <span className="line-clamp-2">
            Índices sem norma cadastrada ficam como <strong>Confirmação Técnica</strong> ou{' '}
            <strong>Não Informado</strong>.
          </span>
        </div>
        <div className="rounded border border-[#2A2F38] bg-[#1B1E24] px-3 py-2">
          <div className="text-[10px] text-[#949BA8]">Atendidos</div>
          <div className="font-mono text-lg font-semibold tabular-nums text-emerald-400">
            {countByStatus.atendido}
          </div>
        </div>
        <div className="rounded border border-[#2A2F38] bg-[#1B1E24] px-3 py-2">
          <div className="text-[10px] text-[#949BA8]">Não Atendidos</div>
          <div className="font-mono text-lg font-semibold tabular-nums text-red-400">
            {countByStatus.nao_atendido}
          </div>
        </div>
        <div className="rounded border border-[#2A2F38] bg-[#1B1E24] px-3 py-2">
          <div className="text-[10px] text-[#949BA8]">Confirmação Técnica</div>
          <div className="font-mono text-lg font-semibold tabular-nums text-amber-400">
            {countByStatus.confirmacao_tecnica}
          </div>
        </div>
        <div className="rounded border border-[#2A2F38] bg-[#1B1E24] px-3 py-2">
          <div className="text-[10px] text-[#949BA8]">Não Informados</div>
          <div className="font-mono text-lg font-semibold tabular-nums text-[#C4C9D4]">
            {countByStatus.nao_informado}
          </div>
        </div>
      </div>

      {tab === 'tabela' ? (
        <div className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden rounded-lg border border-[#2A2F38] bg-[#1B1E24]">
          <div className="min-h-0 flex-1 overflow-hidden">
            <table className="w-full table-fixed border-collapse text-left text-xs">
              <thead className="border-b border-[#2A2F38] bg-[#181B20] text-[11px] text-[#949BA8]">
                <tr>
                  <th className="w-[30%] px-3 py-2">Parâmetro / Descrição</th>
                  <th className="w-[22%] px-3 py-2">Norma / Lei</th>
                  <th className="w-[15%] px-3 py-2 text-right">Limite</th>
                  <th className="w-[13%] px-3 py-2 text-right">Calculado</th>
                  <th className="w-[15%] px-3 py-2">Resultado</th>
                  <th className="w-[50px] px-2 py-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252A33]">
                {paged.slice.map((ev) => {
                  const rule = project.urbanRules.find((r) => r.id === ev.ruleId);
                  return (
                    <tr key={ev.ruleId} className="hover:bg-[#22262E]/60">
                      <td className="px-3 py-2">
                        <div className="truncate font-medium text-white" title={ev.description}>
                          {ev.description}
                        </div>
                        <div className="truncate text-[10px] text-[#949BA8]" title={ev.notes}>
                          {ev.notes || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-[#C4C9D4]">
                        {rule ? (
                          <input
                            type="text"
                            value={rule.lawReference}
                            onChange={(e) => {
                              const val = e.target.value;
                              onUpdateProject((prev) => ({
                                ...prev,
                                urbanRules: prev.urbanRules.map((r) =>
                                  r.id === rule.id
                                    ? { ...r, lawReference: val, municipality: prev.municipality }
                                    : r,
                                ),
                              }));
                            }}
                            aria-label={`Norma de ${rule.description}`}
                            className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1 text-xs text-white"
                          />
                        ) : (
                          <span className="truncate block">{ev.lawReference}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {rule ? (
                          <div className="inline-flex items-center justify-end gap-1">
                            <input
                              type="number"
                              step="0.1"
                              value={rule.parameterLimit ?? ''}
                              placeholder="N/I"
                              onChange={(e) => {
                                const val = e.target.value === '' ? null : Number(e.target.value);
                                onUpdateProject((prev) => ({
                                  ...prev,
                                  urbanRules: prev.urbanRules.map((r) =>
                                    r.id === rule.id ? { ...r, parameterLimit: val } : r,
                                  ),
                                }));
                              }}
                              aria-label={`Limite de ${rule.description}`}
                              className="w-16 rounded border border-[#2A2F38] bg-[#14161A] px-1.5 py-1 text-right font-mono text-xs text-white"
                            />
                            <span className="text-[11px] text-[#949BA8]">{rule.unit}</span>
                          </div>
                        ) : (
                          ev.limitDisplay
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-white">
                        {ev.measuredDisplay}
                      </td>
                      <td className="px-3 py-2">
                        {ev.status === 'atendido' && (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Atendido
                          </span>
                        )}
                        {ev.status === 'nao_atendido' && (
                          <span className="inline-flex items-center gap-1 font-medium text-red-400">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Não Atend.
                          </span>
                        )}
                        {ev.status === 'confirmacao_tecnica' && (
                          <span className="inline-flex items-center gap-1 font-medium text-amber-400">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Confirmar
                          </span>
                        )}
                        {ev.status === 'nao_informado' && (
                          <span className="inline-flex items-center gap-1 text-[#949BA8]">
                            <Info className="h-3.5 w-3.5 shrink-0" /> N/I
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateProject((prev) => ({
                              ...prev,
                              urbanRules: prev.urbanRules.filter((r) => r.id !== ev.ruleId),
                            }))
                          }
                          aria-label={`Remover regra ${ev.description}`}
                          className="p-1 text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <PaginationBar
            page={paged.safePage}
            totalPages={paged.totalPages}
            totalItems={evaluations.length}
            startIndex={paged.start}
            endIndex={paged.end}
            onPageChange={setPage}
            itemLabel="parâmetros"
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-start justify-center overflow-hidden pt-4">
          <form
            onSubmit={handleAddRule}
            className="w-full max-w-3xl space-y-4 rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-5"
          >
            <h2 className="text-sm font-semibold text-white">
              Cadastrar Nova Regra / Exigência Municipal
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] text-[#949BA8]">Descrição da Regra *</label>
                <input
                  type="text"
                  required
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Ex.: Vagas de estacionamento exigidas"
                  className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[#949BA8]">Categoria</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as UrbanRule['category'])}
                  className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="uso_ocupacao">Uso e Ocupação</option>
                  <option value="codigo_obras">Código de Obras</option>
                  <option value="plano_diretor">Plano Diretor</option>
                  <option value="taxa_ocupacao">Taxa de Ocupação</option>
                  <option value="coef_aproveitamento">Coef. Aproveitamento</option>
                  <option value="permeabilidade">Permeabilidade</option>
                  <option value="altura_gabarito">Altura / Gabarito</option>
                  <option value="vagas">Vagas</option>
                  <option value="iluminacao_ventilacao">Ilum. / Ventilação</option>
                  <option value="recuos">Recuos</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[#949BA8]">Lei / Artigo</label>
                <input
                  type="text"
                  value={lawRef}
                  onChange={(e) => setLawRef(e.target.value)}
                  placeholder="Ex.: LC 123/2020 Art. 45"
                  className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[#949BA8]">Parâmetro / Limite</label>
                <div className="flex gap-2">
                  <select
                    value={paramKey}
                    onChange={(e) => setParamKey(e.target.value)}
                    className="w-1/2 rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1.5 text-xs text-white"
                  >
                    <option value="occupancyRate">TO (%)</option>
                    <option value="far">CA (x)</option>
                    <option value="permeabilityRate">Perm. (%)</option>
                    <option value="buildingHeight">Alt. (m)</option>
                    <option value="custom">Outro</option>
                  </select>
                  <input
                    type="number"
                    step="0.1"
                    value={limitVal}
                    onChange={(e) => setLimitVal(e.target.value)}
                    placeholder="Valor"
                    className="w-1/2 rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 font-mono text-xs text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] text-[#949BA8]">Unidade</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[#949BA8]">Condição</label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as 'max' | 'min' | 'info')}
                    className="w-full rounded border border-[#2A2F38] bg-[#14161A] px-2 py-1.5 text-xs text-white"
                  >
                    <option value="max">Máx ≤</option>
                    <option value="min">Mín ≥</option>
                    <option value="info">Info</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#2A2F38] pt-3">
              <button
                type="button"
                onClick={() => setTab('tabela')}
                className="rounded border border-[#2A2F38] px-3.5 py-1.5 text-xs text-slate-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded bg-[#2F7CF6] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#2569D6]"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar Regra
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
