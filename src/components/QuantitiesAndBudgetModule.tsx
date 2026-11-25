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
  buildConstructionSchedule,
  calculateAnalyticalBreakdown,
  calculateBudgetSummary,
  calculateInvestorROI,
  calculateQuantities,
  syncBudgetWithQuantities,
} from '../engine/quantitiesAndBudget';
import {
  generateAnalyticalBudgetAndSchedulePDFBlob,
  generateProjectXLSXBuffer,
  triggerBrowserDownload,
} from '../engine/exporters';
import { nextId } from '../engine/parametricGenerator';
import {
  applySinapiRJToBudget,
  CONSTRUCTION_STAGE_ORDER,
  getDynamicSinapiRJItem,
  SINAPI_RJ_METADATA,
  type ConstructionStageName,
  type SinapiRJRegime,
} from '../engine/sinapiRJ';
import { PaginationBar, paginateItems, useViewportPageSize } from './PaginationBar';
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
  const [budgetView, setBudgetView] = useState<'planilha' | 'resumo_roi' | 'bdi_manual'>('planilha');
  const [stageFilter, setStageFilter] = useState<string>('TODAS');
  const [disciplineFilter, setDisciplineFilter] = useState<string>('TODAS');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMemoryId, setExpandedMemoryId] = useState<string | null>(null);
  const [customDesc, setCustomDesc] = useState('');
  const [customUnit, setCustomUnit] = useState('vb');
  const [customQty, setCustomQty] = useState(1);
  const [customPrice, setCustomPrice] = useState('');
  const [scheduleMonths, setScheduleMonths] = useState(6);

  const [qtyPage, setQtyPage] = useState(0);
  const [budgetPage, setBudgetPage] = useState(0);
  const [eapPage, setEapPage] = useState(0);
  const [customPage, setCustomPage] = useState(0);
  const [schedStagePage, setSchedStagePage] = useState(0);
  const [schedMonthPage, setSchedMonthPage] = useState(0);

  const qtyPageSize = useViewportPageSize(340, 36, 4, 14);
  const budgetPageSize = useViewportPageSize(390, 36, 4, 14);
  const eapPageSize = useViewportPageSize(320, 32, 5, 10);
  const customPageSize = useViewportPageSize(380, 42, 3, 8);
  const schedStagePageSize = useViewportPageSize(300, 42, 4, 10);
  const schedMonthPageSize = useViewportPageSize(300, 34, 4, 12);

  const quantities = useMemo(() => calculateQuantities(project), [project]);
  const budget = useMemo(
    () => calculateBudgetSummary(project, quantities),
    [project, quantities],
  );
  const analytical = useMemo(
    () => calculateAnalyticalBreakdown(budget, project),
    [budget, project],
  );
  const roi = useMemo(
    () => calculateInvestorROI(project, budget.grandTotalCost),
    [project, budget.grandTotalCost],
  );

  const groupedBudgetStages = useMemo(() => {
    const groups = new Map<
      ConstructionStageName,
      {
        stageName: ConstructionStageName;
        lines: typeof budget.lines;
        directSubtotal: number;
      }
    >();
    for (const stage of CONSTRUCTION_STAGE_ORDER) {
      groups.set(stage, { stageName: stage, lines: [], directSubtotal: 0 });
    }
    for (const line of budget.lines) {
      const ref = getDynamicSinapiRJItem(line.code, project);
      const stageName: ConstructionStageName =
        ref?.stageGroup ?? '10. Louças, Metais, Bancadas e Paisagismo';
      const bucket = groups.get(stageName)!;
      bucket.lines.push(line);
      if (line.subtotal !== null) {
        bucket.directSubtotal = Math.round((bucket.directSubtotal + line.subtotal) * 100) / 100;
      }
    }
    return CONSTRUCTION_STAGE_ORDER.map((s) => groups.get(s)!).filter((g) => g.lines.length > 0);
  }, [budget.lines, project]);

  const flatBudgetRows = useMemo(() => {
    return groupedBudgetStages
      .filter((g) => stageFilter === 'TODAS' || g.stageName === stageFilter)
      .flatMap((g) =>
        g.lines.map((line) => ({
          line,
          stageName: g.stageName,
          stageSubtotal: g.directSubtotal,
        })),
      );
  }, [groupedBudgetStages, stageFilter]);

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

  const expandedMemoryItem = useMemo(
    () => filteredQuantities.find((q) => q.id === expandedMemoryId) ?? null,
    [filteredQuantities, expandedMemoryId],
  );

  const qtyPaged = paginateItems(filteredQuantities, qtyPage, qtyPageSize);
  const budgetPaged = paginateItems(flatBudgetRows, budgetPage, budgetPageSize);
  const eapPaged = paginateItems(analytical.stageSummaries, eapPage, eapPageSize);

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

  const customBudgetLines = useMemo(
    () => budget.lines.filter((line) => !autoCodes.has(line.code)),
    [budget.lines, autoCodes],
  );
  const customPaged = paginateItems(customBudgetLines, customPage, customPageSize);

  const schedulePlan = useMemo(
    () => buildConstructionSchedule(budget.grandTotalCost, scheduleMonths),
    [budget.grandTotalCost, scheduleMonths],
  );
  const schedStagesPaged = paginateItems(schedulePlan.stages, schedStagePage, schedStagePageSize);
  const schedMonthsPaged = paginateItems(
    schedulePlan.monthlyTotals.map((mVal, idx) => ({
      idx,
      mVal,
      pct: schedulePlan.monthlyPercents[idx],
      cumVal: schedulePlan.cumulativeTotals[idx],
      cumPct: schedulePlan.cumulativePercents[idx],
    })),
    schedMonthPage,
    schedMonthPageSize,
  );

  const handleExportXLSX = async () => {
    const buffer = await generateProjectXLSXBuffer(project, scheduleMonths);
    triggerBrowserDownload(
      new Blob([new Uint8Array(buffer)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `${project.code}_Quantitativos_Orcamento.xlsx`,
    );
  };

  const handleExportBudgetPDF = () => {
    const blob = generateAnalyticalBudgetAndSchedulePDFBlob(project, scheduleMonths);
    triggerBrowserDownload(blob, `${project.code}_Orcamento_Analitico_Cronograma.pdf`);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#14161A] p-3 text-slate-100">
      <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-2 overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-white">
              Quantitativos, Orçamento Analítico & Cronograma
            </h1>
            <p className="truncate text-xs text-slate-400">
              Levantamento direto das geometrias ({quantities.summary.totalUnits} unidades ·{' '}
              <span className="font-mono tabular-nums text-slate-200">
                {quantities.summary.totalBuiltAreaM2} m²
              </span>{' '}
              construídos). Itens sem preço permanecem como SEM COTAÇÃO.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setSubTab('quantitativos')}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition ${
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
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition ${
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
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition ${
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
              onClick={handleExportBudgetPDF}
              className="inline-flex items-center gap-1 rounded-md border border-[#2F7CF6] bg-[#14161A] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#2F7CF6]/20 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5 text-[#2F7CF6]" />
              PDF Executivo
            </button>
            <button
              type="button"
              onClick={handleExportXLSX}
              className="inline-flex items-center gap-1 rounded-md bg-[#2F7CF6] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#2567d4] whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              XLSX (7 Abas)
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-5">
          <div className="rounded-lg border border-slate-800 bg-[#1B1E24] px-3 py-1.5">
            <span className="text-[10px] text-slate-400">Área Privativa / Construída</span>
            <p className="font-mono text-sm font-semibold tabular-nums text-white">
              {quantities.summary.totalPrivateAreaM2} / {quantities.summary.totalBuiltAreaM2} m²
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#1B1E24] px-3 py-1.5">
            <span className="text-[10px] text-slate-400">Paredes Líq. / Pisos</span>
            <p className="font-mono text-sm font-semibold tabular-nums text-white">
              {quantities.summary.totalWallNetAreaM2} / {quantities.summary.totalFloorAreaM2} m²
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#1B1E24] px-3 py-1.5">
            <span className="text-[10px] text-slate-400">Total Geral Cotado</span>
            <p className="truncate font-mono text-sm font-semibold tabular-nums text-white">
              {budget.grandTotalCost > 0 ? brl(budget.grandTotalCost) : 'SEM COTAÇÃO'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#1B1E24] px-3 py-1.5">
            <span className="text-[10px] text-slate-400">Custo/m² · Custo/Unidade</span>
            <p className="truncate font-mono text-xs font-semibold tabular-nums text-slate-200">
              {brl(budget.costPerM2)} · {brl(budget.costPerUnit)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#1B1E24] px-3 py-1.5">
            <span className="text-[10px] text-slate-400">Itens Sem Cotação</span>
            <p
              className={`font-mono text-sm font-semibold tabular-nums ${
                budget.unquotedCount > 0 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {budget.unquotedCount} de {budget.lines.length}
            </p>
          </div>
        </div>

        {quantities.summary.totalUnits === 0 && (
          <div className="shrink-0 truncate rounded-lg border border-dashed border-slate-700 bg-[#1B1E24] px-3 py-1.5 text-xs text-amber-300">
            Nenhuma unidade posicionada nos pavimentos ainda — crie tipologias e posicione unidades no pavimento para levantar quantitativos e aplicar a tabela SINAPI-RJ.
          </div>
        )}

        {subTab === 'quantitativos' && (
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#1B1E24] px-3 py-2">
              <div className="flex flex-wrap items-center gap-1">
                {[
                  'TODAS',
                  'Arquitetura',
                  'Estrutura',
                  'Elétrica',
                  'Hidráulica',
                  'Sanitária',
                  'Louças e Metais',
                  'Mobiliário',
                  'Paisagismo',
                ].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDisciplineFilter(d);
                      setQtyPage(0);
                    }}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
                      disciplineFilter === d
                        ? 'bg-[#2F7CF6] text-white'
                        : 'bg-[#14161A] text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="search"
                  placeholder="Buscar item ou código..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setQtyPage(0);
                  }}
                  className="w-52 rounded border border-slate-700 bg-[#14161A] py-1 pl-8 pr-2.5 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24]">
              <div className="min-h-0 flex-1 overflow-hidden">
                <table className="w-full table-fixed text-left text-xs">
                  <thead className="border-b border-slate-800 bg-[#14161A] text-slate-400">
                    <tr>
                      <th className="w-24 px-3 py-2 font-medium">Código</th>
                      <th className="w-28 px-3 py-2 font-medium">Disciplina</th>
                      <th className="px-3 py-2 font-medium">Descrição</th>
                      <th className="w-16 px-3 py-2 font-medium">Unid.</th>
                      <th className="w-24 px-3 py-2 text-right font-medium">Qtd. Líquida</th>
                      <th className="w-20 px-3 py-2 text-right font-medium">Perda (%)</th>
                      <th className="w-24 px-3 py-2 text-right font-medium">Qtd. Bruta</th>
                      <th className="w-28 px-3 py-2 font-medium">Memória</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {qtyPaged.slice.map((q) => {
                      const isOpen = expandedMemoryId === q.id;
                      return (
                        <tr
                          key={q.id}
                          className={isOpen ? 'bg-[#2F7CF6]/10' : 'hover:bg-slate-800/30'}
                        >
                          <td className="truncate px-3 py-1.5 font-mono font-semibold text-white">
                            {q.code}
                          </td>
                          <td className="truncate px-3 py-1.5 text-slate-300">{q.discipline}</td>
                          <td className="truncate px-3 py-1.5 text-slate-200" title={q.description}>
                            {q.description}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-slate-400">{q.unit}</td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-200">
                            {q.netQuantity}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-400">
                            {q.lossFactorPercent}%
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums text-white">
                            {q.grossQuantity}
                          </td>
                          <td className="px-3 py-1.5">
                            <button
                              type="button"
                              onClick={() => setExpandedMemoryId(isOpen ? null : q.id)}
                              className="text-[11px] font-medium text-[#2F7CF6] hover:underline"
                            >
                              {isOpen ? 'Ocultar' : 'Ver memória'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {expandedMemoryItem && (
                <div className="shrink-0 border-t border-slate-700 bg-[#14161A] px-3.5 py-2 text-[11px] text-slate-300">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-white">
                      {expandedMemoryItem.code} — {expandedMemoryItem.description}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpandedMemoryId(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      Fechar
                    </button>
                  </div>
                  <div className="mt-0.5 truncate">
                    <strong className="text-slate-200">Critério:</strong>{' '}
                    {expandedMemoryItem.measurementCriterion} ·{' '}
                    <strong className="text-slate-200">Origem:</strong> {expandedMemoryItem.sourceOrigin}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-emerald-300">
                    Memória: {expandedMemoryItem.calculationMemory}
                  </div>
                </div>
              )}

              <PaginationBar
                page={qtyPaged.safePage}
                totalPages={qtyPaged.totalPages}
                totalItems={filteredQuantities.length}
                startIndex={qtyPaged.start}
                endIndex={qtyPaged.end}
                onPageChange={setQtyPage}
                itemLabel="itens"
              />
            </div>
          </div>
        )}

        {subTab === 'orcamento' && (
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            {/* Sub-bar SINAPI + Sub-views */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2F7CF6]/40 bg-[#182130] px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setBudgetView('planilha')}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                    budgetView === 'planilha'
                      ? 'bg-[#2F7CF6] text-white'
                      : 'bg-[#14161A] text-slate-300 hover:text-white'
                  }`}
                >
                  Planilha SINAPI-RJ ({budget.lines.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBudgetView('resumo_roi')}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                    budgetView === 'resumo_roi'
                      ? 'bg-[#2F7CF6] text-white'
                      : 'bg-[#14161A] text-slate-300 hover:text-white'
                  }`}
                >
                  Resumo EAP &amp; Viabilidade (ROI)
                </button>
                <button
                  type="button"
                  onClick={() => setBudgetView('bdi_manual')}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                    budgetView === 'bdi_manual'
                      ? 'bg-[#2F7CF6] text-white'
                      : 'bg-[#14161A] text-slate-300 hover:text-white'
                  }`}
                >
                  BDI &amp; Itens Complementares
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <span className="hidden text-[11px] text-slate-400 xl:inline" title={SINAPI_RJ_METADATA.disclaimer}>
                  {SINAPI_RJ_METADATA.sourceLabel}
                </span>
                <button
                  type="button"
                  onClick={() => handleApplySinapiRJ('desonerado')}
                  className={`rounded px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition ${
                    project.budgetSettings.sinapiRegime === 'desonerado'
                      ? 'bg-[#2F7CF6] text-white'
                      : 'border border-[#2F7CF6]/60 bg-[#14161A] text-white hover:bg-[#2F7CF6]/20'
                  }`}
                >
                  SINAPI-RJ Com Desoneração
                </button>
                <button
                  type="button"
                  onClick={() => handleApplySinapiRJ('nao_desonerado')}
                  className={`rounded px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition ${
                    project.budgetSettings.sinapiRegime === 'nao_desonerado'
                      ? 'bg-[#2F7CF6] text-white'
                      : 'border border-slate-700 bg-[#14161A] text-slate-200 hover:border-slate-500'
                  }`}
                >
                  Sem Desoneração
                </button>
                <button
                  type="button"
                  onClick={handleClearQuotations}
                  className="rounded border border-slate-700 bg-[#14161A] px-2.5 py-1 text-[11px] text-slate-300 hover:text-white whitespace-nowrap"
                >
                  Limpar
                </button>
              </div>
            </div>

            {budgetView === 'planilha' && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24]">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-[#14161A] px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">Etapa EAP:</span>
                    <select
                      value={stageFilter}
                      onChange={(e) => {
                        setStageFilter(e.target.value);
                        setBudgetPage(0);
                      }}
                      className="rounded border border-slate-700 bg-[#1B1E24] px-2 py-0.5 text-xs text-white"
                    >
                      <option value="TODAS">Todas as 10 Etapas ({budget.lines.length} itens)</option>
                      {groupedBudgetStages.map((g) => (
                        <option key={g.stageName} value={g.stageName}>
                          {g.stageName} ({g.lines.length}) — {brl(g.directSubtotal)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    {budget.unquotedCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-300">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {budget.unquotedCount} sem cotação
                      </span>
                    )}
                    <span className="font-mono text-slate-300">
                      Direto: <strong className="text-white">{brl(budget.directTotalCost)}</strong> · Com BDI:{' '}
                      <strong className="text-emerald-400">{brl(budget.grandTotalCost)}</strong>
                    </span>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">
                  <table className="w-full table-fixed text-left text-xs">
                    <thead className="border-b border-slate-800 bg-[#14161A] text-slate-400">
                      <tr>
                        <th className="w-20 px-2.5 py-2 font-medium">Código</th>
                        <th className="w-24 px-2.5 py-2 font-medium">SINAPI-RJ</th>
                        <th className="px-2.5 py-2 font-medium">Descrição &amp; Etapa</th>
                        <th className="w-14 px-2 py-2 font-medium">Unid.</th>
                        <th className="w-20 px-2 py-2 text-right font-medium">Qtd.</th>
                        <th className="w-16 px-2 py-2 text-right font-medium">Perda%</th>
                        <th className="w-28 px-2 py-2 text-right font-medium">Preço Unit.</th>
                        <th className="w-28 px-2 py-2 text-right font-medium">Total Direto</th>
                        <th className="w-12 px-2 py-2 font-medium">ABC</th>
                        <th className="w-28 px-2 py-2 font-medium">Fornecedor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {budgetPaged.slice.map(({ line, stageName }) => {
                        const isCustom = !autoCodes.has(line.code);
                        return (
                          <tr key={line.id} className="hover:bg-slate-800/30">
                            <td className="truncate px-2.5 py-1.5 font-mono text-slate-300">{line.code}</td>
                            <td className="truncate px-2.5 py-1.5 font-mono text-[11px] text-sky-400">
                              {line.sinapiCode || '—'}
                            </td>
                            <td className="px-2.5 py-1.5 text-white">
                              <div className="flex items-center justify-between gap-1">
                                <span className="truncate" title={line.description}>
                                  {line.description}
                                </span>
                                {isCustom && (
                                  <button
                                    type="button"
                                    onClick={() => removeCustomEntry(line.code)}
                                    className="shrink-0 text-slate-500 hover:text-red-400"
                                    title="Remover item manual"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              <div className="truncate text-[10px] text-slate-400">{stageName}</div>
                            </td>
                            <td className="px-2 py-1.5 font-mono text-slate-400">{line.unit}</td>
                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-200">
                              {line.effectiveQuantity}
                            </td>
                            <td className="px-2 py-1.5 text-right">
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
                                className="w-14 rounded border border-slate-700 bg-[#14161A] px-1 py-0.5 text-right font-mono text-[11px] tabular-nums text-white"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="SEM COT."
                                value={line.unitPrice ?? ''}
                                onChange={(e) =>
                                  updateBudgetLine(line.code, {
                                    unitPrice:
                                      e.target.value === ''
                                        ? null
                                        : Math.max(0, Number(e.target.value)),
                                  })
                                }
                                className="w-24 rounded border border-slate-700 bg-[#14161A] px-1.5 py-0.5 text-right font-mono text-[11px] tabular-nums text-white placeholder:text-amber-400/70"
                              />
                            </td>
                            <td className="truncate px-2 py-1.5 text-right font-mono font-semibold tabular-nums">
                              <span
                                className={
                                  line.subtotal === null ? 'text-amber-400' : 'text-emerald-300'
                                }
                              >
                                {brl(line.subtotal)}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 font-mono">
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
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                placeholder="Fornecedor"
                                value={line.supplier}
                                onChange={(e) =>
                                  updateBudgetLine(line.code, { supplier: e.target.value })
                                }
                                className="w-full rounded border border-slate-700 bg-[#14161A] px-1.5 py-0.5 text-[11px] text-white"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <PaginationBar
                  page={budgetPaged.safePage}
                  totalPages={budgetPaged.totalPages}
                  totalItems={flatBudgetRows.length}
                  startIndex={budgetPaged.start}
                  endIndex={budgetPaged.end}
                  onPageChange={setBudgetPage}
                  itemLabel="itens orçamentários"
                />
              </div>
            )}

            {budgetView === 'resumo_roi' && (
              <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-12">
                <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24] lg:col-span-7">
                  <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-[#14161A] px-3.5 py-2 text-xs font-semibold text-slate-300">
                    <span>Resumo Orçamentário por Etapa da Obra (EAP SINAPI-RJ)</span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {analytical.stageSummaries.length} etapas ativas
                    </span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <table className="w-full table-fixed text-left text-[11.5px]">
                      <thead className="border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="px-3 py-2 font-medium">Etapa Construtiva (EAP)</th>
                          <th className="w-14 px-2 py-2 text-right font-medium">Itens</th>
                          <th className="w-28 px-2 py-2 text-right font-medium">Custo Direto</th>
                          <th className="w-28 px-2 py-2 text-right font-medium">Com BDI</th>
                          <th className="w-16 px-2 py-2 text-right font-medium">% Obra</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {eapPaged.slice.map((st) => (
                          <tr key={st.stageName} className="hover:bg-slate-800/20">
                            <td className="truncate px-3 py-1.5 text-slate-200">{st.stageName}</td>
                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400">
                              {st.itemsCount}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-white">
                              {brl(st.directTotal)}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-emerald-300">
                              {brl(st.withBdiTotal)}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400">
                              {st.sharePercent.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                        {analytical.stageSummaries.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                              Posicione unidades nos pavimentos para detalhar as etapas construtivas.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar
                    page={eapPaged.safePage}
                    totalPages={eapPaged.totalPages}
                    totalItems={analytical.stageSummaries.length}
                    startIndex={eapPaged.start}
                    endIndex={eapPaged.end}
                    onPageChange={setEapPage}
                    itemLabel="etapas"
                    compact
                  />
                </div>

                <div className="flex min-h-0 flex-col justify-between overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24] p-3.5 lg:col-span-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                        Viabilidade Financeira &amp; Retorno (ROI)
                      </span>
                      <span className="font-mono text-[11px] text-sky-400">
                        {roi.totalUnits} unidade(s)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                      <label className="space-y-1">
                        <span className="text-slate-400">Valor do Terreno (R$)</span>
                        <input
                          type="number"
                          min="0"
                          step="1000"
                          value={project.budgetSettings.landCost ?? 0}
                          onChange={(e) =>
                            onUpdateProject((prev) => ({
                              ...prev,
                              budgetSettings: {
                                ...prev.budgetSettings,
                                landCost: Math.max(0, Number(e.target.value) || 0),
                              },
                            }))
                          }
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1 font-mono text-xs tabular-nums text-white"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-slate-400">Aluguel Médio / Unidade (R$)</span>
                        <input
                          type="number"
                          min="0"
                          step="50"
                          value={project.budgetSettings.monthlyRentPerUnit ?? 1450}
                          onChange={(e) =>
                            onUpdateProject((prev) => ({
                              ...prev,
                              budgetSettings: {
                                ...prev.budgetSettings,
                                monthlyRentPerUnit: Math.max(0, Number(e.target.value) || 0),
                              },
                            }))
                          }
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1 font-mono text-xs tabular-nums text-white"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-slate-400">Vacância (%)</span>
                        <input
                          type="number"
                          min="0"
                          max="80"
                          step="1"
                          value={project.budgetSettings.vacancyRatePercent ?? 5}
                          onChange={(e) =>
                            onUpdateProject((prev) => ({
                              ...prev,
                              budgetSettings: {
                                ...prev.budgetSettings,
                                vacancyRatePercent: Math.min(80, Math.max(0, Number(e.target.value) || 0)),
                              },
                            }))
                          }
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1 font-mono text-xs tabular-nums text-white"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-slate-400">Taxa Adm. (%) · Desp./un</span>
                        <div className="flex gap-1.5">
                          <input
                            type="number"
                            min="0"
                            max="35"
                            step="1"
                            title="Taxa de administração (%)"
                            value={project.budgetSettings.adminFeePercent ?? 8}
                            onChange={(e) =>
                              onUpdateProject((prev) => ({
                                ...prev,
                                budgetSettings: {
                                  ...prev.budgetSettings,
                                  adminFeePercent: Math.min(35, Math.max(0, Number(e.target.value) || 0)),
                                },
                              }))
                            }
                            className="w-1/2 rounded border border-slate-700 bg-[#14161A] px-2 py-1 font-mono text-xs tabular-nums text-white"
                          />
                          <input
                            type="number"
                            min="0"
                            step="10"
                            title="Custo operacional / condomínio por unidade (R$/mês)"
                            value={project.budgetSettings.monthlyCondoCostPerUnit ?? 95}
                            onChange={(e) =>
                              onUpdateProject((prev) => ({
                                ...prev,
                                budgetSettings: {
                                  ...prev.budgetSettings,
                                  monthlyCondoCostPerUnit: Math.max(0, Number(e.target.value) || 0),
                                },
                              }))
                            }
                            className="w-1/2 rounded border border-slate-700 bg-[#14161A] px-2 py-1 font-mono text-xs tabular-nums text-white"
                          />
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-slate-800 pt-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Investimento Total (Obra + Terreno)</span>
                      <span className="font-mono font-semibold tabular-nums text-white">
                        {brl(roi.totalInvestment)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Receita Líquida Mensal / Anual</span>
                      <span className="font-mono font-semibold tabular-nums text-emerald-300">
                        {brl(roi.netMonthlyIncome)}/mês · {brl(roi.netAnnualIncome)}/ano
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Yield Líquido (Mensal / Anual)</span>
                      <span className="font-mono font-semibold tabular-nums text-sky-300">
                        {roi.monthlyYieldPercent.toFixed(2)}% a.m. · {roi.annualYieldPercent.toFixed(2)}% a.a.
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Payback Estimado</span>
                      <span className="font-mono font-semibold tabular-nums text-amber-300">
                        {roi.paybackMonths !== null
                          ? `${roi.paybackMonths} meses (${roi.paybackYears?.toFixed(1)} anos)`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {budgetView === 'bdi_manual' && (
              <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-12">
                <div className="flex min-h-0 flex-col justify-between rounded-lg border border-slate-800 bg-[#1B1E24] p-4 lg:col-span-5">
                  <div className="space-y-3">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                      Configurações Gerais, Indiretos &amp; BDI
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="col-span-2 block space-y-1">
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
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                        />
                      </label>
                      <label className="block space-y-1">
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
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                        />
                      </label>
                      <label className="block space-y-1">
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
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 font-mono text-xs tabular-nums text-white"
                        />
                      </label>
                      <label className="block space-y-1">
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
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 font-mono text-xs tabular-nums text-white"
                        />
                      </label>
                      <label className="block space-y-1">
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
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 font-mono text-xs tabular-nums text-white"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="space-y-1.5 border-t border-slate-800 pt-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Subtotal Custo Direto</span>
                      <span className="font-mono font-semibold text-white">
                        {brl(budget.directTotalCost)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Indiretos + BDI − Desconto</span>
                      <span className="font-mono text-sky-300">
                        {brl(Math.round((budget.grandTotalCost - budget.directTotalCost) * 100) / 100)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-slate-800 pt-1.5">
                      <span className="font-semibold text-white">TOTAL GERAL DA OBRA</span>
                      <span className="font-mono text-sm font-bold text-emerald-400">
                        {brl(budget.grandTotalCost)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex min-h-0 flex-col gap-2.5 overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24] p-4 lg:col-span-7">
                  <form onSubmit={addCustomBudgetEntry} className="shrink-0 space-y-2 border-b border-slate-800 pb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                      Adicionar Item Complementar / Serviço Manual
                    </h3>
                    <div className="grid grid-cols-12 gap-2">
                      <label className="col-span-6 space-y-1">
                        <span className="text-[11px] text-slate-400">Descrição</span>
                        <input
                          type="text"
                          placeholder="Ex: Projetos complementares e taxas"
                          value={customDesc}
                          onChange={(e) => setCustomDesc(e.target.value)}
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 text-xs text-white"
                        />
                      </label>
                      <label className="col-span-2 space-y-1">
                        <span className="text-[11px] text-slate-400">Unid.</span>
                        <input
                          type="text"
                          value={customUnit}
                          onChange={(e) => setCustomUnit(e.target.value)}
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1.5 text-xs text-white"
                        />
                      </label>
                      <label className="col-span-2 space-y-1">
                        <span className="text-[11px] text-slate-400">Qtd.</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={customQty}
                          onChange={(e) => setCustomQty(Number(e.target.value))}
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1.5 font-mono text-xs tabular-nums text-white"
                        />
                      </label>
                      <label className="col-span-2 space-y-1">
                        <span className="text-[11px] text-slate-400">Unit. (R$)</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Opc."
                          value={customPrice}
                          onChange={(e) => setCustomPrice(e.target.value)}
                          className="w-full rounded border border-slate-700 bg-[#14161A] px-2 py-1.5 font-mono text-xs tabular-nums text-white"
                        />
                      </label>
                    </div>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 rounded bg-[#2F7CF6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2567d4]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Incluir Item Complementar
                    </button>
                  </form>

                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-slate-800 bg-[#14161A]">
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <table className="w-full table-fixed text-left text-xs">
                        <thead className="border-b border-slate-800 text-slate-400">
                          <tr>
                            <th className="w-20 px-3 py-1.5 font-medium">Código</th>
                            <th className="px-3 py-1.5 font-medium">Descrição</th>
                            <th className="w-16 px-2 py-1.5 font-medium">Unid.</th>
                            <th className="w-24 px-2 py-1.5 text-right font-medium">Total</th>
                            <th className="w-12 px-2 py-1.5 text-right font-medium">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70">
                          {customPaged.slice.map((line) => (
                            <tr key={line.id}>
                              <td className="px-3 py-1.5 font-mono text-slate-300">{line.code}</td>
                              <td className="truncate px-3 py-1.5 text-white">{line.description}</td>
                              <td className="px-2 py-1.5 font-mono text-slate-400">{line.unit}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-emerald-300">
                                {brl(line.subtotal)}
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => removeCustomEntry(line.code)}
                                  className="text-slate-400 hover:text-red-400"
                                  title="Remover item"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {customBudgetLines.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                                Nenhum item manual adicionado ainda.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <PaginationBar
                      page={customPaged.safePage}
                      totalPages={customPaged.totalPages}
                      totalItems={customBudgetLines.length}
                      startIndex={customPaged.start}
                      endIndex={customPaged.end}
                      onPageChange={setCustomPage}
                      itemLabel="itens manuais"
                      compact
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {subTab === 'cronograma' && (
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#1B1E24] px-3.5 py-2">
              <div>
                <h2 className="text-xs font-semibold text-white">
                  Cronograma Físico-Financeiro Executivo
                </h2>
                <p className="text-[11px] text-slate-400">
                  Distribuição mensal de desembolso aplicada sobre o orçamento total cotado com avanço físico acumulado.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <span>Prazo estimado (meses):</span>
                <input
                  type="number"
                  min={2}
                  max={24}
                  value={scheduleMonths}
                  onChange={(e) => {
                    setScheduleMonths(Math.max(2, Math.min(24, Number(e.target.value) || 6)));
                    setSchedMonthPage(0);
                  }}
                  className="w-16 rounded border border-slate-700 bg-[#14161A] px-2 py-1 font-mono text-xs tabular-nums text-white"
                />
              </label>
            </div>

            <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-12">
              <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24] lg:col-span-7">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <table className="w-full table-fixed text-left text-xs">
                    <thead className="border-b border-slate-800 bg-[#14161A] text-slate-400">
                      <tr>
                        <th className="px-3 py-2 font-medium">Etapa da Obra</th>
                        <th className="w-24 px-2 py-2 font-medium">Período</th>
                        <th className="w-16 px-2 py-2 text-right font-medium">Peso</th>
                        <th className="w-28 px-2 py-2 text-right font-medium">Desembolso</th>
                        <th className="w-28 px-3 py-2 font-medium">Barra</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {schedStagesPaged.slice.map((row) => {
                        const leftPct = ((row.startMonth - 1) / schedulePlan.months) * 100;
                        const widthPct =
                          ((row.endMonth - row.startMonth + 1) / schedulePlan.months) * 100;
                        return (
                          <tr key={row.code}>
                            <td className="truncate px-3 py-2 font-medium text-white" title={row.name}>
                              <span className="mr-1.5 font-mono text-[10px] text-slate-400">{row.code}</span>
                              {row.name}
                            </td>
                            <td className="px-2 py-2 font-mono tabular-nums text-slate-300">
                              M{row.startMonth}–{row.endMonth}
                            </td>
                            <td className="px-2 py-2 text-right font-mono tabular-nums text-slate-300">
                              {row.weightPercent}%
                            </td>
                            <td className="px-2 py-2 text-right font-mono tabular-nums text-emerald-300">
                              {budget.grandTotalCost > 0 ? brl(row.totalValue) : 'SEM COT.'}
                            </td>
                            <td className="px-3 py-2">
                              <div className="relative h-2.5 w-full rounded bg-[#14161A]">
                                <div
                                  className="absolute top-0 h-2.5 rounded bg-[#2F7CF6]"
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
                <PaginationBar
                  page={schedStagesPaged.safePage}
                  totalPages={schedStagesPaged.totalPages}
                  totalItems={schedulePlan.stages.length}
                  startIndex={schedStagesPaged.start}
                  endIndex={schedStagesPaged.end}
                  onPageChange={setSchedStagePage}
                  itemLabel="etapas"
                />
              </div>

              <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#1B1E24] lg:col-span-5">
                <div className="shrink-0 border-b border-slate-800 bg-[#14161A] px-3 py-2 text-xs font-semibold text-slate-300">
                  Fluxo Mensal e Avanço Acumulado ({schedulePlan.months} meses)
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                  <table className="w-full table-fixed text-left text-xs">
                    <thead className="border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="w-20 px-2.5 py-2 font-medium">Mês</th>
                        <th className="px-2 py-2 text-right font-medium">Desembolso</th>
                        <th className="w-16 px-2 py-2 text-right font-medium">% Mês</th>
                        <th className="px-2 py-2 text-right font-medium">Acumulado</th>
                        <th className="w-16 px-2.5 py-2 text-right font-medium">% Acum.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {schedMonthsPaged.slice.map((m) => (
                        <tr key={m.idx}>
                          <td className="px-2.5 py-1.5 font-mono text-white">
                            Mês {String(m.idx + 1).padStart(2, '0')}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-200">
                            {budget.grandTotalCost > 0 ? brl(m.mVal) : 'SEM COT.'}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400">
                            {m.pct.toFixed(1)}%
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-emerald-300">
                            {budget.grandTotalCost > 0 ? brl(m.cumVal) : 'SEM COT.'}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-sky-300">
                            {m.cumPct.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PaginationBar
                  page={schedMonthsPaged.safePage}
                  totalPages={schedMonthsPaged.totalPages}
                  totalItems={schedulePlan.monthlyTotals.length}
                  startIndex={schedMonthsPaged.start}
                  endIndex={schedMonthsPaged.end}
                  onPageChange={setSchedMonthPage}
                  itemLabel="meses"
                  compact
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
