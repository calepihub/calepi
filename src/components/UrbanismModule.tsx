import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Plus, Trash2 } from 'lucide-react';
import { evaluateUrbanCompliance } from '../engine/engineering';
import { nextId } from '../engine/parametricGenerator';
import type { Project, UrbanRule } from '../types/project';

interface UrbanismModuleProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
}

export const UrbanismModule: React.FC<UrbanismModuleProps> = ({ project, onUpdateProject }) => {
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState<UrbanRule['category']>('uso_ocupacao');
  const [lawRef, setLawRef] = useState('');
  const [paramKey, setParamKey] = useState('occupancyRate');
  const [limitVal, setLimitVal] = useState<string>('');
  const [unit, setUnit] = useState('%');
  const [condition, setCondition] = useState<'max' | 'min' | 'info'>('max');

  const evaluations = evaluateUrbanCompliance(project);

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
  };

  const countByStatus = {
    atendido: evaluations.filter((e) => e.status === 'atendido').length,
    nao_atendido: evaluations.filter((e) => e.status === 'nao_atendido').length,
    nao_informado: evaluations.filter((e) => e.status === 'nao_informado').length,
    confirmacao_tecnica: evaluations.filter((e) => e.status === 'confirmacao_tecnica').length,
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="border-b border-[#2A2F38] pb-4">
        <h1 className="text-xl font-semibold text-white">
          Legislação Municipal & Parâmetros Urbanísticos
        </h1>
        <p className="text-xs text-[#949BA8] mt-1">
          Cadastro de Código de Obras, Plano Diretor, Uso e Ocupação do Solo e verificação preliminar rastreável. O sistema não inventa legislação municipal.
        </p>
      </div>

      {/* Municipality Context Warning */}
      <div className="p-3.5 rounded-lg border border-amber-500/40 bg-amber-950/20 text-xs text-amber-100 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">Atenção Legal:</span> Município atual:{' '}
          <strong className="font-mono">{project.municipality} / {project.state}</strong>. Índices sem norma municipal cadastrada e validada são marcados como{' '}
          <strong>Confirmação Técnica</strong> ou <strong>Não Informado</strong> — nunca como aprovados legalmente.
        </div>
      </div>

      {/* Summary Counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4">
          <div className="text-[11px] text-[#949BA8]">Atendidos (Norma Informada)</div>
          <div className="text-2xl font-mono font-semibold text-emerald-400 mt-1 tabular-nums">
            {countByStatus.atendido}
          </div>
        </div>
        <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4">
          <div className="text-[11px] text-[#949BA8]">Não Atendidos</div>
          <div className="text-2xl font-mono font-semibold text-red-400 mt-1 tabular-nums">
            {countByStatus.nao_atendido}
          </div>
        </div>
        <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4">
          <div className="text-[11px] text-[#949BA8]">Confirmação Técnica</div>
          <div className="text-2xl font-mono font-semibold text-amber-400 mt-1 tabular-nums">
            {countByStatus.confirmacao_tecnica}
          </div>
        </div>
        <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4">
          <div className="text-[11px] text-[#949BA8]">Não Informados</div>
          <div className="text-2xl font-mono font-semibold text-[#C4C9D4] mt-1 tabular-nums">
            {countByStatus.nao_informado}
          </div>
        </div>
      </div>

      {/* Evaluation Table */}
      <div className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-[#181B20] border-b border-[#2A2F38] text-[11px] text-[#949BA8]">
            <tr>
              <th className="py-3 px-4">Parâmetro / Descrição</th>
              <th className="py-3 px-4">Norma / Lei de Referência</th>
              <th className="py-3 px-4 text-right">Limite Cadastrado</th>
              <th className="py-3 px-4 text-right">Valor Calculado</th>
              <th className="py-3 px-4">Resultado Preliminar</th>
              <th className="py-3 px-4 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#252A33]">
            {evaluations.map((ev) => {
              const rule = project.urbanRules.find((r) => r.id === ev.ruleId);
              return (
                <tr key={ev.ruleId} className="hover:bg-[#22262E]/60">
                  <td className="py-3 px-4">
                    <div className="font-medium text-white">{ev.description}</div>
                    <div className="text-[11px] text-[#949BA8] mt-0.5">{ev.notes}</div>
                  </td>
                  <td className="py-3 px-4 font-mono text-[#C4C9D4]">
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
                        className="w-44 px-2 py-1 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
                      />
                    ) : (
                      ev.lawReference
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {rule ? (
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
                        className="w-20 px-2 py-1 text-xs text-right font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
                      />
                    ) : (
                      ev.limitDisplay
                    )}
                    <span className="ml-1 text-[#949BA8]">{rule?.unit}</span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-white">
                    {ev.measuredDisplay}
                  </td>
                  <td className="py-3 px-4">
                    {ev.status === 'atendido' && (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Atendido
                      </span>
                    )}
                    {ev.status === 'nao_atendido' && (
                      <span className="inline-flex items-center gap-1 text-red-400 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" /> Não Atendido
                      </span>
                    )}
                    {ev.status === 'confirmacao_tecnica' && (
                      <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" /> Confirmação Técnica
                      </span>
                    )}
                    {ev.status === 'nao_informado' && (
                      <span className="inline-flex items-center gap-1 text-[#949BA8]">
                        <Info className="w-3.5 h-3.5" /> Não Informado
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
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
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add New Municipal Rule Form */}
      <form
        onSubmit={handleAddRule}
        className="rounded-lg border border-[#2A2F38] bg-[#1B1E24] p-4 space-y-3"
      >
        <h2 className="text-sm font-semibold text-white">Cadastrar Nova Regra / Exigência Municipal</h2>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-[11px] text-[#949BA8] mb-1">Descrição da Regra *</label>
            <input
              type="text"
              required
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Ex.: Vagas de estacionamento exigidas"
              className="w-full px-2.5 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#949BA8] mb-1">Categoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as UrbanRule['category'])}
              className="w-full px-2 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
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
            <label className="block text-[11px] text-[#949BA8] mb-1">Lei / Artigo</label>
            <input
              type="text"
              value={lawRef}
              onChange={(e) => setLawRef(e.target.value)}
              placeholder="Ex.: LC 123/2020 Art. 45"
              className="w-full px-2.5 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#949BA8] mb-1">Parâmetro / Limite</label>
            <div className="flex gap-1">
              <select
                value={paramKey}
                onChange={(e) => setParamKey(e.target.value)}
                className="w-1/2 px-1.5 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
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
                className="w-1/2 px-2 py-1.5 text-xs font-mono rounded bg-[#14161A] border border-[#2A2F38] text-white"
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="w-20">
              <label className="block text-[11px] text-[#949BA8] mb-1">Condição</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as 'max' | 'min' | 'info')}
                className="w-full px-1.5 py-1.5 text-xs rounded bg-[#14161A] border border-[#2A2F38] text-white"
              >
                <option value="max">Máx ≤</option>
                <option value="min">Mín ≥</option>
                <option value="info">Info</option>
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-[#2F7CF6] text-white hover:bg-[#2569D6] whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
