import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  CalendarRange,
  DollarSign,
  Download,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  calculateBudgetSummary,
  calculateQuantities,
  syncBudgetWithQuantities,
} from '../engine/quantitiesAndBudget';
import {
  generateProjectXLSXBuffer,
  triggerBrowserDownload,
} from '../engine/exporters';
import { round2 } from '../engine/geometry';
import { nextId } from '../engine/parametricGenerator';
import {
  applySinapiRJToBudget,
  SINAPI_RJ_METADATA,
  type SinapiRJRegime,
} from '../engine/sinapiRJ';
import type { BudgetEntry, Project } from '../types/project';

interface QuantitiesAndBudgetModuleProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project, revisionNote?: string) => void;
}

const brl = (val: number | null) =>
  val === null
    ? 'SEM COTAÇÃO'
    : val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const QuantitiesAndBudgetModule: React.FC<QuantitiesAndBudgetModuleProps> = ({
  project,
  onUpdateProject,
}) => {
  const [subTab, setSubTab] = useState<'quantitativos' | 'orcamento' | 'cronograma'>(
    'quantitativos',
  );
  const [disciplineFilter, setDisciplineFilter] = useState<string>('TODAS');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMemoryId, setExpandedMemoryId] = useState<string | null>(null);
  const [customDesc, setCustomDesc] = useState('');
  const [customUnit, setCustomUnit] = useState('vb');
  const [customQty, setCustomQty] = useState(1);
  const [customPrice, setCustomPrice] = useState('');
  const [scheduleMonths, setScheduleMonths] = useState(6);

  const quantities = useMemo(() => calculateQuantities(project), [project]);
  const budget = useMemo(
    () => calculateBudgetSummary(project, quantities),
    [project, quantities],
  );

  const filteredQuantities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return quantities.items.filter((item) => {
      if (disciplineFilter !== 'TODAS' && item.discipline !== disciplineFilter) return false;
      if (!q) return true;
      return (
        item.code.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.discipline.toLowerCase().includes(q)
      );
    });
  }, [quantities.items, disciplineFilter, searchQuery]);

  const updateBudgetLine = (code: string, patch: Partial<BudgetEntry>) => {
    onUpdateProject((prev) => {
      const synced = syncBudgetWithQuantities(prev, calculateQuantities(prev));
      const updated = synced.map((entry) =>
        entry.code === code ? { ...entry, ...patch } : entry,
      );
      return { ...prev, budgetEntries: updated };
    });
  };

  const handleApplySinapiRJ = (regime: SinapiRJRegime) => {
    onUpdateProject((prev) => {
      const q = calculateQuantities(prev);
      const res = applySinapiRJToBudget(prev, q, regime);
      return {
        ...prev,
        budgetEntries: res.budgetEntries,
        budgetSettings: res.budgetSettings,
      };
    }, `Preços unitários atualizados via Tabela SINAPI-RJ (${regime === 'desonerado' ? 'Com Desoneração' : 'Sem Desoneração'})`);
  };

  const handleClearQuotations = () => {
    onUpdateProject((prev) => {
      const q = calculateQuantities(prev);
      const synced = syncBudgetWithQuantities(prev, q).map((e) => ({
        ...e,
        unitPrice: null,
        supplier: '',
      }));
      return {
        ...prev,
        budgetEntries: synced,
        budgetSettings: {
          ...prev.budgetSettings,
          sinapiRegime: 'manual',
          sourceBase: 'Orçamento Manual / Sem Cotação',
        },
      };
    }, 'Cotações limpas para preenchimento manual');
  };

  const addCustomBudgetEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customDesc.trim()) return;
    const priceNum = customPrice.trim() === '' ? null : Number(customPrice);
    const entry: BudgetEntry = {
      id: nextId('bdg'),
      code: `EXT-${String(project.budgetEntries.length + 1).padStart(2, '0')}`,
      description: customDesc.trim(),
      discipline: 'Serviços Complementares',
      category: 'servico',
      unit: customUnit.trim() || 'vb',
      quantity: Math.max(0.01, Number(customQty) || 1),
      unitPrice: priceNum !== null && !Number.isNaN(priceNum) ? priceNum : null,
      lossFactorPercent: 0,
      supplier: '',
      sourceBase: project.budgetSettings.sourceBase,
      notes: 'Item manual adicionado pelo usuário.',
    };
    onUpdateProject(
      (prev) => ({
        ...prev,
        budgetEntries: [...syncBudgetWithQuantities(prev, quantities), entry],
      }),
      `Item manual adicionado ao orçamento: ${entry.description}`,
    );
    setCustomDesc('');
    setCustomPrice('');
  };

  const removeCustomEntry = (code: string) => {
    onUpdateProject((prev) => ({
      ...prev,
      budgetEntries: prev.budgetEntries.filter((e) => e.code !== code),
    }));
  };

  const autoCodes = useMemo(
    () => new Set(quantities.items.map((i) => i.code)),
    [quantities.items],
  );

  const scheduleRows = useMemo(() => {
    const months = Math.max(2, Math.min(24, scheduleMonths));
    const stages = [
      { name: 'Serviços Preliminares e Locação', weight: 0.08 },
      { name: 'Infraestrutura / Fundações', weight: 0.14 },
      { name: 'Superestrutura e Lajes', weight: 0.22 },
      { name: 'Vedações / Alvenaria / Cobertura', weight: 0.18 },
      { name: 'Instalações Elétricas e Hidrossanitárias', weight: 0.16 },
      { name: 'Revestimentos, Esquadrias e Pintura', weight: 0.17 },
      { name: 'Limpeza Final e Entrega', weight: 0.05 },
    ];
    return stages.map((st, idx) => {
      const startMonth = Math.min(months, Math.floor((idx / stages.length) * months) + 1);
      const endMonth = Math.min(months, Math.ceil(((idx + 1) / stages.length) * months));
      return {
        ...st,
        startMonth,
        endMonth,
        value: round2(budget.grandTotalCost * st.weight),
      };
    });
  }, [budget.grandTotalCost, scheduleMonths]);

  const handleExportXLSX = () => {
    const buffer = generateProjectXLSXBuffer(project);
    triggerBrowserDownload(
      new Blob([buffer.slice().buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `${project.code}_Quantitativos_Orcamento.xlsx`,
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-[#14161A] p-6 text-slate-100">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">
              Quantitativos, Orçamento Analítico & Cronograma
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Levantamento direto das geometrias do modelo ({quantities.summary.totalUnits} unidades ·{' '}
              <span className="font-mono tabular-nums text-slate-200">
                {quantities.summary.totalBuiltAreaM2} m²
              </span>{' '}
              construídos). Itens sem preço cadastrado permanecem marcados como SEM COTAÇÃO.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSubTab('quantitativos')}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition ${
                subTab === 'quantitativos'
                  ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                  : 'border-slate-800 bg-[#1B1E24] text-slate-300 hover:border-slate-700'
              }`}
            >
              <Calculator className="h-3.5 w-3.5" />
              Quantitativos ({quantities.items.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('orcamento')}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition ${
                subTab === 'orcamento'
                  ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                  : 'border-slate-800 bg-[#1B1E24] text-slate-300 hover:border-slate-700'
              }`}
            >
              <DollarSign className="h-3.5 w-3.5" />
              Orçamento & Curva ABC
            </button>
            <button
              type="button"
              onClick={() => setSubTab('cronograma')}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition ${
                subTab === 'cronograma'
                  ? 'border-[#2F7CF6] bg-[#2F7CF6]/15 text-white'
                  : 'border-slate-800 bg-[#1B1E24] text-slate-300 hover:border-slate-700'
              }`}
            >
              <CalendarRange className="h-3.5 w-3.5" />
              Cronograma Preliminar
            </button>
            <button
              type="button"
              onClick={handleExportXLSX}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#2F7CF6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2567d4] whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar XLSX
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-3.5">
            <span className="text-[11px] text-slate-400">Área Privativa / Construída</span>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-white">
              {quantities.summary.totalPrivateAreaM2} / {quantities.summary.totalBuiltAreaM2} m²
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-3.5">
            <span className="text-[11px] text-slate-400">Paredes Líq. / Pisos</span>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-white">
              {quantities.summary.totalWallNetAreaM2} / {quantities.summary.totalFloorAreaM2} m²
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-3.5">
            <span className="text-[11px] text-slate-400">Total Geral Cotado</span>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-white">
              {budget.grandTotalCost > 0 ? brl(budget.grandTotalCost) : 'SEM COTAÇÃO'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-3.5">
            <span className="text-[11px] text-slate-400">Custo/m² · Custo/Unidade</span>
            <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-200">
              {brl(budget.costPerM2)} · {brl(budget.costPerUnit)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-3.5">
            <span className="text-[11px] text-slate-400">Itens Sem Cotação</span>
            <p
              className={`mt-1 font-mono text-lg font-semibold tabular-nums ${
                budget.unquotedCount > 0 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {budget.unquotedCount} de {budget.lines.length}
            </p>
          </div>
        </div>

        {quantities.summary.totalUnits === 0 && (
          <div className="rounded-lg border border-dashed border-slate-700 bg-[#1B1E24] px-4 py-3 text-xs text-amber-300">
            Nenhuma unidade posicionada nos pavimentos ainda — crie tipologias e posicione unidades no pavimento para levantar quantitativos e aplicar a tabela SINAPI-RJ.
          </div>
        )}

        {subTab === 'quantitativos' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#1B1E24] p-3.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {['TODAS', 'Arquitetura', 'Estrutura', 'Elétrica', 'Hidráulica', 'Sanitária', 'Mobiliário'].map(
                  (d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDisciplineFilter(d)}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                        disciplineFilter === d
                          ? 'bg-[#2F7CF6] text-white'
                          : 'bg-[#14161A] text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {d}
                    </button>
                  ),
                )}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="search"
                  placeholder="Buscar item ou código..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-60 rounded border border-slate-700 bg-[#14161A] py-1.5 pl-8 pr-3 text-xs text-white"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-[#14161A] text-slate-400">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Código</th>
                      <th className="px-3 py-2.5 font-medium">Disciplina</th>
                      <th className="px-3 py-2.5 font-medium">Descrição</th>
                      <th className="px-3 py-2.5 font-medium">Unid.</th>
                      <th className="px-3 py-2.5 text-right font-medium">Qtd. Líquida</th>
                      <th className="px-3 py-2.5 text-right font-medium">Perda (%)</th>
                      <th className="px-3 py-2.5 text-right font-medium">Qtd. Bruta</th>
                      <th className="px-3 py-2.5 font-medium">Critério & Memória</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredQuantities.map((q) => {
                      const isOpen = expandedMemoryId === q.id;
                      return (
                        <React.Fragment key={q.id}>
                          <tr className="hover:bg-slate-800/30">
                            <td className="px-3 py-2.5 font-mono font-semibold text-white">
                              {q.code}
                            </td>
                            <td className="px-3 py-2.5 text-slate-300">{q.discipline}</td>
                            <td className="px-3 py-2.5 text-slate-200">{q.description}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-400">{q.unit}</td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">
                              {q.netQuantity}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-400">
                              {q.lossFactorPercent}%
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums text-white">
                              {q.grossQuantity}
                            </td>
                            <td className="px-3 py-2.5">
                              <button
                                type="button"
                                onClick={() => setExpandedMemoryId(isOpen ? null : q.id)}
                                className="text-xs font-medium text-[#2F7CF6] hover:underline"
                              >
                                {isOpen ? 'Ocultar memória' : 'Ver memória'}
                              </button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-[#14161A]/80">
                              <td colSpan={8} className="px-4 py-3 text-xs text-slate-300">
                                <div>
                                  <strong className="text-slate-200">Critério:</strong>{' '}
                                  {q.measurementCriterion}
                                </div>
                                <div className="mt-1">
                                  <strong className="text-slate-200">Origem:</strong> {q.sourceOrigin}
                                </div>
                                <div className="mt-1 font-mono text-[11px] text-emerald-300">
                                  Memória: {q.calculationMemory}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {subTab === 'orcamento' && (
          <div className="space-y-5">
            {/* SINAPI-RJ Preset Bar */}
            <div className="flex flex-col gap-3 rounded-lg border border-[#2F7CF6]/40 bg-[#182130] p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-white">
                  Base Oficial Referencial — {SINAPI_RJ_METADATA.sourceLabel}
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed max-w-3xl">
                  {SINAPI_RJ_METADATA.disclaimer}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleApplySinapiRJ('desonerado')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                    project.budgetSettings.sinapiRegime === 'desonerado'
                      ? 'bg-[#2F7CF6] text-white'
                      : 'border border-[#2F7CF6]/60 bg-[#14161A] text-white hover:bg-[#2F7CF6]/20'
                  }`}
                >
                  Aplicar SINAPI-RJ (Com Desoneração)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplySinapiRJ('nao_desonerado')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                    project.budgetSettings.sinapiRegime === 'nao_desonerado'
                      ? 'bg-[#2F7CF6] text-white'
                      : 'border border-slate-700 bg-[#14161A] text-slate-200 hover:border-slate-500'
                  }`}
                >
                  Aplicar SINAPI-RJ (Sem Desoneração)
                </button>
                <button
                  type="button"
                  onClick={handleClearQuotations}
                  className="rounded-md border border-slate-700 bg-[#14161A] px-3 py-1.5 text-xs text-slate-300 hover:text-white whitespace-nowrap"
                >
                  Limpar Cotações
                </button>
              </div>
            </div>

            {budget.unquotedCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3.5 text-xs text-amber-200">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <div>
                    Existem <strong>{budget.unquotedCount}</strong> itens sem preço unitário informado. Aplique a tabela SINAPI-RJ acima ou informe cotações manuais na planilha abaixo.
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-4 rounded-lg border border-slate-800 bg-[#1B1E24] p-4 sm:grid-cols-2 lg:grid-cols-12">
              <label className="block space-y-1 lg:col-span-3">
                <span className="text-[11px] text-slate-400">Base de Preços</span>
                <input
                  type="text"
                  value={project.budgetSettings.sourceBase}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      budgetSettings: { ...prev.budgetSettings, sourceBase: e.target.value },
                    }))
                  }
                  className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 text-xs text-white"
                />
              </label>
              <label className="block space-y-1 lg:col-span-2">
                <span className="text-[11px] text-slate-400">Região / UF</span>
                <input
                  type="text"
                  value={project.budgetSettings.region}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      budgetSettings: { ...prev.budgetSettings, region: e.target.value },
                    }))
                  }
                  className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 text-xs text-white"
                />
              </label>
              <label className="block space-y-1 lg:col-span-2">
                <span className="text-[11px] text-slate-400">Custos Indiretos (%)</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={project.budgetSettings.indirectCostsPercent}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      budgetSettings: {
                        ...prev.budgetSettings,
                        indirectCostsPercent: Math.max(0, Number(e.target.value) || 0),
                      },
                    }))
                  }
                  className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 font-mono text-xs tabular-nums text-white"
                />
              </label>
              <label className="block space-y-1 lg:col-span-1">
                <span className="text-[11px] text-slate-400">BDI (%)</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={project.budgetSettings.bdiPercent}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      budgetSettings: {
                        ...prev.budgetSettings,
                        bdiPercent: Math.max(0, Number(e.target.value) || 0),
                      },
                    }))
                  }
                  className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 font-mono text-xs tabular-nums text-white"
                />
              </label>
              <label className="block space-y-1 lg:col-span-2">
                <span className="text-[11px] text-slate-400">Desconto (%)</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={project.budgetSettings.discountPercent}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      budgetSettings: {
                        ...prev.budgetSettings,
                        discountPercent: Math.max(0, Number(e.target.value) || 0),
                      },
                    }))
                  }
                  className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 font-mono text-xs tabular-nums text-white"
                />
              </label>
              <div className="flex flex-col justify-end text-right lg:col-span-2">
                <span className="text-[11px] text-slate-400">Custo Direto + Indireto + BDI</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-emerald-400">
                  {brl(budget.grandTotalCost)}
                </span>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-[#14161A] text-slate-400">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Código</th>
                      <th className="px-3 py-2.5 font-medium">SINAPI-RJ</th>
                      <th className="px-3 py-2.5 font-medium">Descrição</th>
                      <th className="px-3 py-2.5 font-medium">Unid.</th>
                      <th className="px-3 py-2.5 text-right font-medium">Qtd. Efetiva</th>
                      <th className="px-3 py-2.5 text-right font-medium">Perda (%)</th>
                      <th className="px-3 py-2.5 text-right font-medium">Preço Unit. (R$)</th>
                      <th className="px-3 py-2.5 text-right font-medium">Subtotal</th>
                      <th className="px-3 py-2.5 font-medium">ABC</th>
                      <th className="px-3 py-2.5 font-medium">Base / Fornecedor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {budget.lines.map((line) => {
                      const isCustom = !autoCodes.has(line.code);
                      return (
                        <tr key={line.id} className="hover:bg-slate-800/30">
                          <td className="px-3 py-2 font-mono text-slate-300">{line.code}</td>
                          <td className="px-3 py-2 font-mono text-[11px] text-sky-400 whitespace-nowrap">
                            {line.sinapiCode || '—'}
                          </td>
                          <td className="px-3 py-2 text-white">
                            <div className="flex items-center justify-between gap-2">
                              <span>{line.description}</span>
                              {isCustom && (
                                <button
                                  type="button"
                                  onClick={() => removeCustomEntry(line.code)}
                                  className="text-slate-500 hover:text-red-400"
                                  title="Remover item manual"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-400">{line.unit}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-200">
                            {line.effectiveQuantity}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              value={line.lossFactorPercent}
                              onChange={(e) =>
                                updateBudgetLine(line.code, {
                                  lossFactorPercent: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                              className="w-16 rounded border border-slate-700 bg-[#14161A] px-1.5 py-1 text-right font-mono text-xs tabular-nums text-white"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="SEM COTAÇÃO"
                              value={line.unitPrice ?? ''}
                              onChange={(e) =>
                                updateBudgetLine(line.code, {
                                  unitPrice:
                                    e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                                })
                              }
                              className="w-28 rounded border border-slate-700 bg-[#14161A] px-2 py-1 text-right font-mono text-xs tabular-nums text-white placeholder:text-amber-400/70"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                            <span
                              className={line.subtotal === null ? 'text-amber-400' : 'text-emerald-300'}
                            >
                              {brl(line.subtotal)}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono">
                            <span
                              className={
                                line.abcClass === 'A'
                                  ? 'font-bold text-red-400'
                                  : line.abcClass === 'B'
                                    ? 'text-amber-400'
                                    : line.abcClass === 'C'
                                      ? 'text-slate-300'
                                      : 'text-slate-500'
                              }
                            >
                              {line.abcClass === 'SEM_COTACAO' ? '—' : line.abcClass}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              placeholder="Fornecedor / Base"
                              value={line.supplier}
                              onChange={(e) =>
                                updateBudgetLine(line.code, { supplier: e.target.value })
                              }
                              className="w-32 rounded border border-slate-700 bg-[#14161A] px-2 py-1 text-xs text-white"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <form
              onSubmit={addCustomBudgetEntry}
              className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-800 bg-[#1B1E24] p-4"
            >
              <label className="min-w-[240px] flex-1 space-y-1">
                <span className="text-xs text-slate-400">Adicionar Item Complementar / Serviço</span>
                <input
                  type="text"
                  placeholder="Ex: Projetos complementares e taxas de aprovação"
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-[#14161A] px-3 py-1.5 text-sm text-white"
                />
              </label>
              <label className="w-24 space-y-1">
                <span className="text-xs text-slate-400">Unid.</span>
                <input
                  type="text"
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 text-sm text-white"
                />
              </label>
              <label className="w-24 space-y-1">
                <span className="text-xs text-slate-400">Qtd.</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={customQty}
                  onChange={(e) => setCustomQty(Number(e.target.value))}
                  className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 font-mono text-sm tabular-nums text-white"
                />
              </label>
              <label className="w-32 space-y-1">
                <span className="text-xs text-slate-400">Preço Unit. (R$)</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Opcional"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 font-mono text-sm tabular-nums text-white"
                />
              </label>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded bg-[#2F7CF6] px-4 py-2 text-sm font-medium text-white hover:bg-[#2567d4]"
              >
                <Plus className="h-4 w-4" />
                Incluir Item
              </button>
            </form>
          </div>
        )}

        {subTab === 'cronograma' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-800 bg-[#1B1E24] p-4">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Cronograma Físico-Financeiro Preliminar
                </h2>
                <p className="text-xs text-slate-400">
                  Distribuição percentual de desembolso aplicada sobre o total cotado (requer cronograma executivo após definição de equipes e frentes de serviço).
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <span>Prazo estimado (meses):</span>
                <input
                  type="number"
                  min={2}
                  max={24}
                  value={scheduleMonths}
                  onChange={(e) => setScheduleMonths(Number(e.target.value) || 6)}
                  className="w-20 rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 font-mono text-sm tabular-nums text-white"
                />
              </label>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-[#14161A] text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Etapa da Obra</th>
                    <th className="px-4 py-2.5 font-medium">Período (Meses)</th>
                    <th className="px-4 py-2.5 text-right font-medium">Peso (%)</th>
                    <th className="px-4 py-2.5 text-right font-medium">Desembolso Cotado</th>
                    <th className="px-4 py-2.5 font-medium">Barra Temporal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {scheduleRows.map((row) => {
                    const leftPct = ((row.startMonth - 1) / scheduleMonths) * 100;
                    const widthPct =
                      ((row.endMonth - row.startMonth + 1) / scheduleMonths) * 100;
                    return (
                      <tr key={row.name}>
                        <td className="px-4 py-3 font-medium text-white">{row.name}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-300">
                          Mês {row.startMonth} – {row.endMonth}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-300">
                          {Math.round(row.weight * 100)}%
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-300">
                          {budget.grandTotalCost > 0 ? brl(row.value) : 'SEM COTAÇÃO'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="relative h-3 w-full rounded bg-[#14161A]">
                            <div
                              className="absolute top-0 h-3 rounded bg-[#2F7CF6]"
                              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
