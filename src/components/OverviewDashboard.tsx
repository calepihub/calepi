import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Box,
  Calculator,
  CheckCircle2,
  FileText,
  FolderKanban,
  LayoutGrid,
  MapPin,
  PenTool,
  Plus,
} from 'lucide-react';
import { analyzeSiteGeometry, checkImplantationFeasibility, getBoundingBox, round2 } from '../engine/geometry';
import { runCompatibilityAnalysis } from '../engine/engineering';
import { calculateQuantities } from '../engine/quantitiesAndBudget';
import { TECHNICAL_SHEETS } from '../engine/exporters';
import type { Project } from '../types/project';

interface OverviewDashboardProps {
  project: Project;
  projectsCount: number;
  onNavigateStep: (step: 'terreno' | 'planta2d' | 'bim3d' | 'engenharia' | 'documentacao', subTab?: string) => void;
  onOpenProjectsManager: () => void;
  onCreateNewProject: () => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  project,
  projectsCount,
  onNavigateStep,
  onOpenProjectsManager,
  onCreateNewProject,
}) => {
  const [previewFloorIdx, setPreviewFloorIdx] = useState(0);

  const siteCheck = useMemo(() => analyzeSiteGeometry(project.site), [project.site]);
  const quantities = useMemo(() => calculateQuantities(project), [project]);
  const clashes = useMemo(() => runCompatibilityAnalysis(project), [project]);

  const criticalCount = useMemo(
    () => clashes.filter((c) => c.severity === 'CRITICO').length,
    [clashes],
  );

  const floor = project.floors[previewFloorIdx] ?? project.floors[0];
  const feasibility = useMemo(
    () =>
      floor
        ? checkImplantationFeasibility(project.site, floor.units, project.unitTypes)
        : null,
    [floor, project.site, project.unitTypes],
  );

  const siteBox = useMemo(() => getBoundingBox(project.site.vertices), [project.site.vertices]);
  const svgW = 460;
  const svgH = 340;
  const scale = Math.min(
    (svgW - 56) / Math.max(1, siteBox.width),
    (svgH - 56) / Math.max(1, siteBox.depth),
  );
  const offX = (svgW - siteBox.width * scale) / 2 - siteBox.minX * scale;
  const offY = (svgH - siteBox.depth * scale) / 2 - siteBox.minY * scale;

  const steps = [
    {
      num: '01',
      title: 'Terreno, Recuos & Leis',
      summary: `${project.site.front}×${project.site.leftDepth}m (${siteCheck.calculatedArea} m²) · Taxa ocupação ${feasibility?.occupancyRatePercent ?? 0}%`,
      actionLabel: 'Editar Terreno',
      icon: MapPin,
      onClick: () => onNavigateStep('terreno', 'terreno'),
    },
    {
      num: '02',
      title: 'Tipologias & Planta 2D',
      summary: `${project.unitTypes.length} tipologias · ${quantities.summary.totalUnits} unidades em ${project.floors.length} pavimentos`,
      actionLabel: 'Abrir Editor 2D',
      icon: PenTool,
      onClick: () => onNavigateStep('planta2d', 'editor2d'),
    },
    {
      num: '03',
      title: 'Modelo BIM 3D Interativo',
      summary: 'Orbitar edificação completa, cortar pavimentos e simular luz solar',
      actionLabel: 'Explorar em 3D',
      icon: Box,
      onClick: () => onNavigateStep('bim3d'),
    },
    {
      num: '04',
      title: 'Engenharia, Conflitos & Custos',
      summary: `${criticalCount} conflitos críticos · ${quantities.items.length} itens levantados (${quantities.summary.totalBuiltAreaM2} m²)`,
      actionLabel: 'Ver Análises',
      icon: Calculator,
      onClick: () => onNavigateStep('engenharia', 'quantitativos'),
    },
    {
      num: '05',
      title: 'Pranchas, Memoriais & Exportação',
      summary: `${TECHNICAL_SHEETS.length} pranchas técnicas · 10 memoriais · PDF, DOCX, XLSX, DXF e ZIP`,
      actionLabel: 'Gerar Documentos',
      icon: FileText,
      onClick: () => onNavigateStep('documentacao'),
    },
  ];

  return (
    <div className="mx-auto max-w-[1360px] space-y-6 p-6">
      {/* Welcome / Active Project Summary Banner */}
      <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Projeto Ativo</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-300">{project.code}</span>
            <span aria-hidden="true">·</span>
            <span>{project.constructionMethod.name}</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
            {project.name}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Siga os 5 passos abaixo para avaliar ou editar o projeto completo, do terreno às pranchas executivas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenProjectsManager}
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-[#1B1E24] px-3.5 py-2 text-xs font-medium text-slate-200 hover:border-slate-500 hover:text-white whitespace-nowrap shrink-0"
          >
            <FolderKanban className="h-3.5 w-3.5" />
            Meus Projetos ({projectsCount})
          </button>
          <button
            type="button"
            onClick={onCreateNewProject}
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-[#1B1E24] px-3.5 py-2 text-xs font-medium text-slate-200 hover:border-[#2F7CF6] hover:text-white whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo Projeto
          </button>
          <button
            type="button"
            onClick={() => onNavigateStep('bim3d')}
            className="inline-flex items-center gap-2 rounded-md bg-[#2F7CF6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2567d4] whitespace-nowrap shrink-0"
          >
            <Box className="h-4 w-4" />
            Explorar Modelo 3D
          </button>
        </div>
      </div>

      {/* Main Split: 5-Step Guided Flow (Left) + Interactive Site/Floor Preview (Right) */}
      <div className="grid items-stretch gap-6 lg:grid-cols-12">
        {/* Left: Guided Step Cards */}
        <div className="flex flex-col justify-between space-y-2.5 lg:col-span-7">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <button
                key={step.num}
                type="button"
                onClick={step.onClick}
                className="group flex w-full items-center justify-between gap-4 rounded-lg border border-slate-800 bg-[#1B1E24] p-4 text-left transition hover:border-[#2F7CF6] hover:bg-[#20242c]"
              >
                <div className="flex min-w-0 items-center gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-[#14161A] font-mono text-xs font-semibold text-[#2F7CF6] group-hover:border-[#2F7CF6]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-500">{step.num}.</span>
                      <span className="text-sm font-semibold text-white">{step.title}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-400">{step.summary}</p>
                  </div>
                </div>

                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-[#2F7CF6] group-hover:translate-x-0.5 transition-transform whitespace-nowrap">
                  {step.actionLabel}
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </button>
            );
          })}
        </div>

        {/* Right: Live Implantation & Floor Preview */}
        <div className="flex flex-col justify-between rounded-lg border border-slate-800 bg-[#1B1E24] p-4 lg:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Prévia da Implantação</h2>
              <p className="text-xs text-slate-400">
                Terreno {project.site.front}×{project.site.leftDepth}m · Recuos em tracejado
              </p>
            </div>
            <div className="flex items-center gap-1 rounded bg-[#14161A] p-0.5">
              {project.floors.map((fl, idx) => (
                <button
                  key={fl.id}
                  type="button"
                  onClick={() => setPreviewFloorIdx(idx)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                    previewFloorIdx === idx
                      ? 'bg-[#2F7CF6] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {fl.levelIndex === 0 ? 'Térreo' : `${fl.levelIndex}º Pav`}
                </button>
              ))}
            </div>
          </div>

          <div className="my-3 flex flex-1 items-center justify-center rounded border border-slate-800 bg-[#111317] p-2">
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="max-h-[290px] w-full">
              {/* Site polygon */}
              <polygon
                points={project.site.vertices
                  .map((v) => `${offX + v.x * scale},${offY + v.y * scale}`)
                  .join(' ')}
                fill="#181c23"
                stroke="#475569"
                strokeWidth="1.5"
              />
              {/* Setback box */}
              <rect
                x={offX + siteCheck.buildableBox.x * scale}
                y={offY + siteCheck.buildableBox.y * scale}
                width={Math.max(0, siteCheck.buildableBox.width * scale)}
                height={Math.max(0, siteCheck.buildableBox.depth * scale)}
                fill="none"
                stroke="#f59e0b"
                strokeDasharray="4 3"
                strokeWidth="1.2"
              />
              {/* Units on selected floor */}
              {floor?.units.map((inst) => {
                const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
                if (!ut) return null;
                const ux = offX + inst.x * scale;
                const uy = offY + inst.y * scale;
                const uw = ut.width * scale;
                const ud = ut.depth * scale;
                const numFontSize = Math.max(7, Math.min(10, uw * 0.22));
                const codeFontSize = Math.max(6, Math.min(8, uw * 0.16));
                return (
                  <g key={inst.id}>
                    <rect
                      x={ux}
                      y={uy}
                      width={uw}
                      height={ud}
                      fill="#2F7CF6"
                      fillOpacity={0.18}
                      stroke="#60a5fa"
                      strokeWidth="1.2"
                    />
                    <text
                      x={ux + uw / 2}
                      y={uy + ud / 2 - 4}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#f8fafc"
                      fontSize={numFontSize}
                      fontWeight="600"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {inst.unitNumber}
                    </text>
                    <text
                      x={ux + uw / 2}
                      y={uy + ud / 2 + 7}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#93c5fd"
                      fontSize={codeFontSize}
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {ut.code}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
            <span
              className={`inline-flex items-center gap-1.5 ${
                feasibility?.fitsInBuildableArea ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {feasibility?.fitsInBuildableArea
                ? 'Implantação dentro dos recuos'
                : 'Verificar recuos'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigateStep('planta2d', 'editor2d')}
                className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#14161A] px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-[#2F7CF6]"
              >
                <LayoutGrid className="h-3.5 w-3.5 text-[#2F7CF6]" />
                Editar Planta 2D
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom 4-Column Quick Indicators */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-4">
          <div className="text-xs text-slate-400">Terreno & Capacidade</div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-white">
            {siteCheck.calculatedArea} m²
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            Área edificável: {siteCheck.buildableBox.area} m²
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-4">
          <div className="text-xs text-slate-400">Unidades & Área Construída</div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-white">
            {quantities.summary.totalUnits} unid · {quantities.summary.totalBuiltAreaM2} m²
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            Privativa: {quantities.summary.totalPrivateAreaM2} m² · Comum: {quantities.summary.totalCommonAreaM2} m²
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-4">
          <div className="text-xs text-slate-400">Tipologias do Modelo</div>
          <div className="mt-1 font-mono text-sm font-semibold text-white">
            {project.unitTypes.length > 0
              ? project.unitTypes.map((u) => `${u.code} (${round2(u.width * u.depth)}m²)`).join(' · ')
              : 'Nenhuma tipologia criada ainda'}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Sistema: {project.constructionMethod.name}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-[#1B1E24] p-4">
          <div className="text-xs text-slate-400">Saúde Técnica do Modelo</div>
          <div
            className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
              criticalCount === 0 ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {criticalCount === 0 ? '0 Conflitos Críticos' : `${criticalCount} Conflitos`}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {TECHNICAL_SHEETS.length} pranchas e 10 memoriais prontos
          </div>
        </div>
      </div>
    </div>
  );
};
