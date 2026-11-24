import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  buildElevationData,
  buildJoinerySchedule,
  buildSheetTabulations,
  computeFloorFootprint,
  getCadPalette,
  getWallQuadWorld,
  splitWallByOpenings,
  unitLocalToWorld,
  type CadPalette,
  type CadTheme,
} from '../engine/cadDrawings';
import {
  analyzeSiteGeometry,
  getBoundingBox,
  getFurnitureWorldRect,
  getOpeningWorldPosition,
  getRoomArea,
  round2,
} from '../engine/geometry';
import {
  detectSharedWallsAndGaps,
  getGateWorldPosition,
  getLotBoundarySegments,
  normalizeSiteData,
} from '../engine/implantation';
import { getBotanicalMeta, getExteriorSurfaceMeta } from '../engine/landscaping';
import { computeElectricalRouting, computeHydraulicRouting, getQdcPosition } from '../engine/mepRouting';
import { ElectricalSymbolSvg, FurnitureCadBlock } from './CadArchitecturalSymbols';
import type { Project, UnitType } from '../types/project';

interface CadSheetPreviewProps {
  project: Project;
  sheetId: string;
  floorIndex: number;
  cadTheme: CadTheme;
  onRemoveRender?: (renderId: string) => void;
}

const isSpecialCategory = (cat: string) =>
  ['dados', 'tv', 'antena_tv', 'wifi_ap', 'cftv', 'rack_ti', 'interfone'].includes(cat);

function clipText(txt: string, maxLen: number): string {
  return txt.length > maxLen ? `${txt.slice(0, maxLen - 1)}…` : txt;
}

interface TableColumn {
  label: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

function SvgGridTable({
  x,
  y,
  columns,
  rows,
  rowHeight = 24,
  pal,
  accentColor,
}: {
  x: number;
  y: number;
  columns: TableColumn[];
  rows: string[][];
  rowHeight?: number;
  pal: CadPalette;
  accentColor: string;
}) {
  const totalW = columns.reduce((s, c) => s + c.width, 0);
  const headerH = 26;

  let colX = x;
  const colPositions = columns.map((c) => {
    const start = colX;
    colX += c.width;
    return { ...c, start };
  });

  return (
    <g fontFamily="monospace">
      {/* Header Row */}
      <rect
        x={x}
        y={y}
        width={totalW}
        height={headerH}
        fill={accentColor}
        fillOpacity={0.16}
        stroke={pal.paperBorder}
        strokeWidth="1.2"
      />
      {colPositions.map((col, idx) => (
        <g key={`th-${idx}`}>
          {idx > 0 && (
            <line
              x1={col.start}
              y1={y}
              x2={col.start}
              y2={y + headerH + rows.length * rowHeight}
              stroke={pal.gridDot}
              strokeWidth="0.9"
            />
          )}
          <text
            x={
              col.align === 'right'
                ? col.start + col.width - 6
                : col.align === 'center'
                  ? col.start + col.width / 2
                  : col.start + 6
            }
            y={y + 16.5}
            textAnchor={col.align === 'right' ? 'end' : col.align === 'center' ? 'middle' : 'start'}
            fill={accentColor}
            fontSize="9"
            fontWeight="bold"
          >
            {col.label}
          </text>
        </g>
      ))}

      {/* Body Rows */}
      {rows.map((cells, rIdx) => {
        const ry = y + headerH + rIdx * rowHeight;
        return (
          <g key={`tr-${rIdx}`}>
            <rect
              x={x}
              y={ry}
              width={totalW}
              height={rowHeight}
              fill={rIdx % 2 === 1 ? pal.gridDot : 'transparent'}
              fillOpacity={rIdx % 2 === 1 ? 0.25 : 0}
              stroke={pal.gridDot}
              strokeWidth="0.8"
            />
            {colPositions.map((col, cIdx) => {
              const raw = cells[cIdx] ?? '';
              const maxChars = Math.max(4, Math.floor((col.width - 10) / 5.4));
              return (
                <text
                  key={`td-${rIdx}-${cIdx}`}
                  x={
                    col.align === 'right'
                      ? col.start + col.width - 6
                      : col.align === 'center'
                        ? col.start + col.width / 2
                        : col.start + 6
                  }
                  y={ry + rowHeight / 2 + 3}
                  textAnchor={
                    col.align === 'right' ? 'end' : col.align === 'center' ? 'middle' : 'start'
                  }
                  fill={pal.roomText}
                  fontSize="8.5"
                >
                  {clipText(raw, maxChars)}
                </text>
              );
            })}
          </g>
        );
      })}
      {/* Outer Frame */}
      <rect
        x={x}
        y={y}
        width={totalW}
        height={headerH + rows.length * rowHeight}
        fill="none"
        stroke={pal.paperBorder}
        strokeWidth="1.2"
      />
    </g>
  );
}

function GraphicScaleBar({
  x,
  y,
  pxPerMeter,
  pal,
}: {
  x: number;
  y: number;
  pxPerMeter: number;
  pal: CadPalette;
}) {
  const segMeters = pxPerMeter > 35 ? 0.5 : pxPerMeter > 18 ? 1 : 2;
  const segPx = segMeters * pxPerMeter;
  const labels = [0, segMeters, segMeters * 2, segMeters * 4];
  return (
    <g transform={`translate(${x}, ${y})`} fontFamily="monospace" fontSize="7.5" fill={pal.dimension}>
      <text x={0} y={-4} fontWeight="bold">
        ESCALA GRÁFICA (m)
      </text>
      <rect x={0} y={0} width={segPx} height={5} fill={pal.dimension} stroke={pal.dimension} strokeWidth="0.6" />
      <rect x={segPx} y={0} width={segPx} height={5} fill={pal.bg} stroke={pal.dimension} strokeWidth="0.6" />
      <rect x={segPx * 2} y={0} width={segPx * 2} height={5} fill={pal.dimension} stroke={pal.dimension} strokeWidth="0.6" />
      <text x={0} y={14} textAnchor="middle">
        {labels[0]}
      </text>
      <text x={segPx} y={14} textAnchor="middle">
        {labels[1]}
      </text>
      <text x={segPx * 2} y={14} textAnchor="middle">
        {labels[2]}
      </text>
      <text x={segPx * 4} y={14} textAnchor="middle">
        {labels[3]}m
      </text>
    </g>
  );
}

export const CadSheetPreview: React.FC<CadSheetPreviewProps> = ({
  project,
  sheetId,
  floorIndex,
  cadTheme,
  onRemoveRender,
}) => {
  const [enlargedUtIdx, setEnlargedUtIdx] = useState(0);
  const pal = getCadPalette(cadTheme);
  const isLightPaper = cadTheme === 'plot_white';
  const specialStroke = isLightPaper ? '#6D28D9' : '#C084FC';
  const specialCable = isLightPaper ? '#7C3AED' : '#A855F7';
  const specialLabel = isLightPaper ? '#4C1D95' : '#E9D5FF';
  const specialCftvCorridor = isLightPaper ? '#BE123C' : '#F43F5E';
  const svgW = 920;
  const svgH = 560;

  // R01 — Projeto Executivo Renderizado (Perspectivas 3D Salvas)
  if (sheetId === 'R01') {
    const renders = project.capturedRenders ?? [];
    const rs = project.renderSettings;
    return (
      <div className="space-y-3 rounded border border-slate-300 bg-[#0F131A] p-4 text-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-2.5">
          <div>
            <div className="text-xs font-bold tracking-wide text-white uppercase">
              PRANCHA R01 — PROJETO EXECUTIVO RENDERIZADO ({project.name})
            </div>
            <div className="text-[11px] text-slate-400">
              Acabamentos PBR: Parede Ext. {(rs.wallExteriorFinish || 'textura_acrilica').replace(/_/g, ' ')} · Piso{' '}
              {rs.floorMaterial.replace(/_/g, ' ')} · Cobertura {rs.roofMaterial.replace(/_/g, ' ')} (
              {(rs.roofShape || 'embutido_platibanda').replace(/_/g, ' ')}) · Esquadrias{' '}
              {rs.windowFrameColor.replace(/_/g, ' ')} · Metais{' '}
              {(project.hydraulicConfig?.sanitaryFixtures?.metalsFinish || 'cromado').replace(/_/g, ' ')}
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1.5 rounded border border-slate-700 px-2 py-0.5 text-[10px] font-mono"
            style={{ backgroundColor: rs.facadeColor, color: '#111827' }}
          >
            Fachada {rs.facadeColor}
          </span>
        </div>

        {renders.length === 0 ? (
          <div className="flex min-h-[340px] flex-col items-center justify-center rounded border border-dashed border-slate-700 bg-[#141820] p-6 text-center">
            <p className="text-sm font-semibold text-white">
              Nenhuma perspectiva 3D arquitetônica salva nesta prancha ainda
            </p>
            <p className="mt-1.5 max-w-md text-xs text-slate-400 leading-relaxed">
              Acesse a etapa <strong className="text-slate-200">5. Modelo BIM 3D</strong> ou <strong className="text-slate-200">6. Render Cinematográfico</strong>, escolha o ângulo de câmera (Perspectiva, Fachada, Aérea ou Interna) e clique em <strong className="text-emerald-300">&quot;Salvar na Prancha R01&quot;</strong> para compor automaticamente este caderno de apresentação executiva e o PDF/ZIP.
            </p>
          </div>
        ) : (
          <div className={`grid gap-3 ${renders.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
            {renders.map((r, idx) => (
              <div
                key={r.id}
                className="group relative overflow-hidden rounded border border-slate-700 bg-[#141820]"
              >
                <img src={r.dataUrl} alt={r.title} className="h-56 w-full object-cover" />
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px]">
                  <div>
                    <span className="font-mono font-semibold text-[#60A5FA]">
                      VISTA {String(idx + 1).padStart(2, '0')}
                    </span>{' '}
                    <span className="text-slate-200">{r.title}</span>
                  </div>
                  {onRemoveRender && (
                    <button
                      type="button"
                      onClick={() => onRemoveRender(r.id)}
                      className="text-slate-500 hover:text-red-400"
                      title="Remover vista"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const SheetFrame = ({
    children,
    clipRect,
  }: {
    children: React.ReactNode;
    clipRect?: { x: number; y: number; width: number; height: number };
  }) => (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="w-full rounded border"
      style={{ backgroundColor: pal.bg, borderColor: pal.paperBorder }}
    >
      <defs>
        <pattern id="cadMasonryHatch" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M 0 6 L 6 0" stroke={pal.wallExtStroke} strokeWidth="0.45" opacity="0.35" />
        </pattern>
        <pattern id="cadDrywallHatch" width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.6" fill={pal.wallIntStroke} opacity="0.45" />
          <circle cx="4" cy="4" r="0.6" fill={pal.wallIntStroke} opacity="0.45" />
        </pattern>
        <pattern id="cadConcHatch" width="8" height="8" patternUnits="userSpaceOnUse">
          <path
            d="M 0 8 L 8 0 M -2 2 L 2 -2 M 6 10 L 10 6"
            stroke={pal.wallExtStroke}
            strokeWidth="0.6"
            opacity="0.45"
          />
        </pattern>
        {clipRect && (
          <clipPath id="leftViewportClip">
            <rect x={clipRect.x} y={clipRect.y} width={clipRect.width} height={clipRect.height} />
          </clipPath>
        )}
      </defs>
      {/* ABNT Outer & Inner Frame */}
      <rect x={6} y={6} width={svgW - 12} height={svgH - 12} fill="none" stroke={pal.paperBorder} strokeWidth="1.6" />
      <rect x={11} y={11} width={svgW - 22} height={svgH - 22} fill="none" stroke={pal.paperBorder} strokeWidth="0.7" />
      {children}
    </svg>
  );

  // A07 — Quadro de Esquadrias Ilustrado (Tabular + Elevações)
  if (sheetId === 'A07') {
    const rows = [...buildJoinerySchedule(project)].sort(
      (a, b) => b.totalProjectCount - a.totalProjectCount || a.code.localeCompare(b.code),
    );
    return (
      <SheetFrame>
        <text x={24} y={32} fill={pal.unitTag} fontSize="12" fontWeight="bold" fontFamily="monospace">
          QUADRO DE ESQUADRIAS ILUSTRADO — ABNT NBR 6492 ({rows.length} TIPOS)
        </text>
        <line x1={24} y1={40} x2={svgW - 24} y2={40} stroke={pal.gridDot} strokeWidth="1" />
        {rows.length === 0 ? (
          <text x={svgW / 2} y={svgH / 2} textAnchor="middle" fill={pal.roomText} fontSize="12" fontFamily="monospace">
            Nenhuma esquadria cadastrada (crie tipologias na aba Tipologias).
          </text>
        ) : (
          <>
            {/* Top visual schematic cards (up to 4) */}
            {rows.slice(0, 4).map((row, idx) => {
              const bx = 24 + idx * 220;
              const by = 52;
              const maxDim = Math.max(row.width, row.height, 0.9);
              const sc = 60 / maxDim;
              const rw = row.width * sc;
              const rh = row.height * sc;
              return (
                <g key={`card-${row.code}-${idx}`}>
                  <rect x={bx} y={by} width={210} height={116} fill={pal.gridDot} fillOpacity={0.22} stroke={pal.paperBorder} strokeWidth="0.9" />
                  <rect
                    x={bx + 14}
                    y={by + 16 + (74 - rh) / 2}
                    width={rw}
                    height={rh}
                    fill={row.type === 'janela' ? pal.windowGlass : pal.doorLeaf}
                    fillOpacity={0.22}
                    stroke={row.type === 'janela' ? pal.windowFrame : pal.doorLeaf}
                    strokeWidth="1.5"
                  />
                  {row.type === 'janela' ? (
                    <line
                      x1={bx + 14 + rw / 2}
                      y1={by + 16 + (74 - rh) / 2}
                      x2={bx + 14 + rw / 2}
                      y2={by + 16 + (74 - rh) / 2 + rh}
                      stroke={pal.windowFrame}
                      strokeWidth="1"
                    />
                  ) : (
                    <polyline
                      points={`${bx + 14},${by + 16 + (74 - rh) / 2} ${bx + 14 + rw},${by + 53} ${bx + 14},${by + 16 + (74 - rh) / 2 + rh}`}
                      fill="none"
                      stroke={pal.doorSwing}
                      strokeDasharray="3 2"
                      strokeWidth="0.9"
                    />
                  )}
                  <text x={bx + 84} y={by + 28} fill={pal.unitTag} fontSize="11" fontWeight="bold" fontFamily="monospace">
                    {row.code} ({row.type.toUpperCase()})
                  </text>
                  <text x={bx + 84} y={by + 46} fill={pal.roomText} fontSize="9" fontFamily="monospace">
                    {row.width.toFixed(2)}m × {row.height.toFixed(2)}m
                  </text>
                  <text x={bx + 84} y={by + 62} fill={pal.dimension} fontSize="8.5" fontFamily="monospace">
                    Peitoril: {row.sillHeight.toFixed(2)}m
                  </text>
                  <text x={bx + 84} y={by + 80} fill={pal.roomText} fontSize="9" fontWeight="bold" fontFamily="monospace">
                    Obra: {row.totalProjectCount} un
                  </text>
                </g>
              );
            })}

            {/* Full Structured Table */}
            <SvgGridTable
              x={24}
              y={184}
              pal={pal}
              accentColor={pal.unitTag}
              rowHeight={25}
              columns={[
                { label: 'CÓD.', width: 65 },
                { label: 'TIPO', width: 85 },
                { label: 'LARG. (m)', width: 85, align: 'right' },
                { label: 'ALT. (m)', width: 85, align: 'right' },
                { label: 'PEITORIL', width: 85, align: 'right' },
                { label: 'MATERIAL / ESPECIFICAÇÃO', width: 295 },
                { label: 'QTD/PAV', width: 82, align: 'right' },
                { label: 'TOTAL', width: 88, align: 'right' },
              ]}
              rows={rows.slice(0, 12).map((r) => [
                r.code,
                r.type.toUpperCase(),
                r.width.toFixed(2),
                r.height.toFixed(2),
                `${r.sillHeight.toFixed(2)}m`,
                r.material,
                `${r.countPerFloor} un`,
                `${r.totalProjectCount} un`,
              ])}
            />
          </>
        )}
      </SheetFrame>
    );
  }

  // A08 — Fachadas (Frontal & Lateral Direita)
  if (sheetId === 'A08') {
    const front = buildElevationData(project, 'frontal');
    const lateral = buildElevationData(project, 'lateral');
    const drawElev = (
      data: ReturnType<typeof buildElevationData>,
      title: string,
      ox: number,
      baseY: number,
      maxW: number,
      maxH: number,
    ) => {
      const sc = Math.min(maxW / Math.max(4, data.totalWidth), maxH / Math.max(4, data.totalHeight));
      const bw = data.totalWidth * sc;
      const bh = data.totalHeight * sc;
      const roofShape = project.renderSettings.roofShape ?? 'platibanda';
      const wallTopY = baseY - bh + data.parapetHeight * sc;
      const ridgeH = Math.max(18, bw * 0.12);
      return (
        <g>
          <text x={ox} y={baseY - bh - 16} fill={pal.unitTag} fontSize="11" fontWeight="bold" fontFamily="monospace">
            {title} (L={data.totalWidth.toFixed(2)}m · H={data.totalHeight.toFixed(2)}m)
          </text>
          <line x1={ox - 24} y1={baseY} x2={ox + bw + 24} y2={baseY} stroke={pal.wallExtStroke} strokeWidth="2.2" />
          <rect
            x={ox}
            y={roofShape === 'platibanda' || roofShape === 'laje_plana' ? baseY - bh : wallTopY}
            width={bw}
            height={roofShape === 'platibanda' || roofShape === 'laje_plana' ? bh : baseY - wallTopY}
            fill={pal.wallIntFill}
            fillOpacity={0.28}
            stroke={pal.wallExtStroke}
            strokeWidth="1.6"
          />
          {roofShape === 'duas_aguas' ? (
            <polygon
              points={`${ox - 8},${wallTopY} ${ox + bw / 2},${wallTopY - ridgeH} ${ox + bw + 8},${wallTopY}`}
              fill={pal.slabFill}
              fillOpacity={0.65}
              stroke={pal.wallExtStroke}
              strokeWidth="1.6"
            />
          ) : roofShape === 'uma_agua' ? (
            <polygon
              points={`${ox - 8},${wallTopY} ${ox + bw + 8},${wallTopY - ridgeH * 0.72} ${ox + bw + 8},${wallTopY}`}
              fill={pal.slabFill}
              fillOpacity={0.65}
              stroke={pal.wallExtStroke}
              strokeWidth="1.6"
            />
          ) : (
            <line
              x1={ox - 3}
              y1={wallTopY}
              x2={ox + bw + 3}
              y2={wallTopY}
              stroke={pal.axisLine}
              strokeDasharray="5 2.5"
              strokeWidth="1"
            />
          )}
          {data.floors.map((fl, fIdx) => (
            <g key={fIdx}>
              <line
                x1={ox}
                y1={baseY - fl.baseY * sc}
                x2={ox + bw}
                y2={baseY - fl.baseY * sc}
                stroke={pal.dimension}
                strokeDasharray="3 2"
                strokeWidth="0.8"
              />
              <text x={ox + bw + 14} y={baseY - fl.baseY * sc + 3} fill={pal.dimension} fontSize="8.5" fontFamily="monospace">
                ⊕ +{fl.baseY.toFixed(2)}m ({fl.name})
              </text>
              {fl.features.map((ft, idx) => (
                <g key={idx}>
                  <rect
                    x={ox + Math.max(0.2, ft.x) * sc}
                    y={baseY - (ft.y + ft.height) * sc}
                    width={Math.max(5, ft.width * sc)}
                    height={Math.max(5, ft.height * sc)}
                    fill={ft.type === 'janela' ? pal.windowGlass : pal.doorLeaf}
                    fillOpacity={0.28}
                    stroke={ft.type === 'janela' ? pal.windowFrame : pal.doorLeaf}
                    strokeWidth="1.3"
                  />
                  {ft.type === 'janela' && (
                    <line
                      x1={ox + Math.max(0.2, ft.x) * sc + Math.max(5, ft.width * sc) / 2}
                      y1={baseY - (ft.y + ft.height) * sc}
                      x2={ox + Math.max(0.2, ft.x) * sc + Math.max(5, ft.width * sc) / 2}
                      y2={baseY - ft.y * sc}
                      stroke={pal.windowFrame}
                      strokeWidth="0.9"
                    />
                  )}
                </g>
              ))}
            </g>
          ))}
        </g>
      );
    };

    return (
      <SheetFrame>
        {drawElev(front, 'FACHADA FRONTAL PRINCIPAL (ESC. 1:75)', 48, 255, 650, 190)}
        {drawElev(lateral, 'FACHADA LATERAL DIREITA (ESC. 1:75)', 48, 515, 650, 190)}
      </SheetFrame>
    );
  }

  // A09 — Cortes Esquemáticos AA e BB
  if (sheetId === 'A09') {
    const front = buildElevationData(project, 'frontal');
    const sc = Math.min(620 / Math.max(4, front.totalWidth), 330 / Math.max(4, front.totalHeight));
    const ox = 76;
    const baseY = 475;
    const bw = front.totalWidth * sc;
    const bh = front.totalHeight * sc;
    return (
      <SheetFrame>
        <text x={28} y={36} fill={pal.unitTag} fontSize="12" fontWeight="bold" fontFamily="monospace">
          CORTE ESQUEMÁTICO LONGITUDINAL AA — LAJES, PÉ-DIREITO E NÍVEIS
        </text>
        <line x1={ox - 28} y1={baseY} x2={ox + bw + 170} y2={baseY} stroke={pal.wallExtStroke} strokeWidth="2.4" />
        <rect x={ox - 3} y={baseY} width={12} height={22} fill="url(#cadConcHatch)" stroke={pal.wallExtStroke} strokeWidth="1" />
        <rect x={ox + bw - 9} y={baseY} width={12} height={22} fill="url(#cadConcHatch)" stroke={pal.wallExtStroke} strokeWidth="1" />

        {(() => {
          const mezUt = project.unitTypes.find(
            (u) => u.hasMezzanine && u.mezzanine?.enabled && u.ceilingHeight >= 3.0,
          );
          const mez = mezUt?.mezzanine;
          return front.floors.map((fl, idx) => {
            const yBot = baseY - fl.baseY * sc;
            const yTop = baseY - fl.slabTopY * sc;
            const flH = yBot - yTop;
            const slabPx = Math.max(6, 0.15 * sc);
            const mezX = ox + bw * 0.14;
            const mezW = bw * 0.34;
            const mezDeckY = mez ? baseY - (fl.baseY + mez.elevationM) * sc : 0;
            const mezSlabPx = mez ? Math.max(4, mez.slabThicknessM * sc) : 0;
            const railTopY = mez ? mezDeckY - 1.05 * sc : 0;
            return (
              <g key={idx}>
                <rect x={ox} y={yBot - slabPx} width={bw} height={slabPx} fill="url(#cadConcHatch)" stroke={pal.wallExtStroke} strokeWidth="1.2" />
                <rect x={ox} y={yTop} width={8} height={flH} fill={pal.wallExtFill} stroke={pal.wallExtStroke} strokeWidth="1.3" />
                <rect x={ox + bw - 8} y={yTop} width={8} height={flH} fill={pal.wallExtFill} stroke={pal.wallExtStroke} strokeWidth="1.3" />
                <rect x={ox + bw * 0.35} y={yTop} width={5} height={flH} fill={pal.wallIntFill} stroke={pal.wallIntStroke} strokeWidth="1" />
                <rect x={ox + bw * 0.68} y={yTop} width={5} height={flH} fill={pal.wallIntFill} stroke={pal.wallIntStroke} strokeWidth="1" />
                {mez && mezUt && (
                  <g>
                    <rect
                      x={mezX}
                      y={mezDeckY}
                      width={mezW}
                      height={mezSlabPx}
                      fill="url(#cadConcHatch)"
                      stroke={pal.unitTag}
                      strokeWidth="1.1"
                    />
                    <line x1={mezX + mezW - 2} y1={mezDeckY} x2={mezX + mezW - 2} y2={railTopY} stroke={pal.unitTag} strokeWidth="1" />
                    <line x1={mezX} y1={railTopY} x2={mezX + mezW} y2={railTopY} stroke={pal.unitTag} strokeWidth="0.9" strokeDasharray="3 2" />
                    <line x1={mezX + mezW + 2} y1={yBot - slabPx} x2={mezX + mezW + 24} y2={mezDeckY} stroke={pal.furniture} strokeWidth="1.3" />
                    <text x={mezX + 4} y={mezDeckY - 6} fill={pal.unitTag} fontSize="7" fontFamily="monospace">
                      MEZANINO (+{mez.elevationM.toFixed(2)}m · {Math.round((mez.coverageRatio || 0) * 100)}% ·{' '}
                      {mez.structureType === 'madeira_estrutural' ? 'MADEIRA' : 'METÁLICA'})
                    </text>
                    <text x={mezX + 4} y={mezDeckY + mezSlabPx + 10} fill={pal.dimension} fontSize="6.5" fontFamily="monospace">
                      PD Inf. {mez.elevationM.toFixed(2)}m | PD Sup. {round2(mezUt.ceilingHeight - mez.elevationM - mez.slabThicknessM).toFixed(2)}m
                    </text>
                  </g>
                )}
                <line x1={ox - 20} y1={yBot - slabPx} x2={ox - 20} y2={yTop} stroke={pal.dimension} strokeWidth="1" />
                <text x={ox - 26} y={(yBot + yTop) / 2} textAnchor="end" fill={pal.dimension} fontSize="9" fontFamily="monospace">
                  {(fl.slabTopY - fl.baseY).toFixed(2)}m
                </text>
                <text x={ox + bw + 16} y={yBot - 2} fill={pal.roomText} fontSize="9.5" fontFamily="monospace">
                  ⊕ +{fl.baseY.toFixed(2)}m ({fl.name})
                </text>
              </g>
            );
          });
        })()}

        {(() => {
          const roofShape = project.renderSettings.roofShape ?? 'platibanda';
          const wallTopY = baseY - bh + front.parapetHeight * sc;
          const ridgePx = Math.max(22, bw * 0.11);
          if (roofShape === 'duas_aguas') {
            return (
              <>
                <rect x={ox - 8} y={wallTopY - 6} width={bw + 16} height={6} fill="url(#cadConcHatch)" stroke={pal.wallExtStroke} strokeWidth="1.2" />
                <polygon
                  points={`${ox - 10},${wallTopY - 6} ${ox + bw / 2},${wallTopY - 6 - ridgePx} ${ox + bw + 10},${wallTopY - 6}`}
                  fill={pal.slabFill}
                  fillOpacity={0.45}
                  stroke={pal.wallExtStroke}
                  strokeWidth="1.4"
                />
                <text x={ox + bw + 16} y={wallTopY - ridgePx + 4} fill={pal.axisLine} fontSize="9.5" fontFamily="monospace">
                  ⊕ +{(front.totalHeight + ridgePx / Math.max(1, sc)).toFixed(2)}m (Cumeeira 2 Águas)
                </text>
              </>
            );
          }
          if (roofShape === 'uma_agua') {
            return (
              <>
                <rect x={ox - 8} y={wallTopY - 6} width={bw + 16} height={6} fill="url(#cadConcHatch)" stroke={pal.wallExtStroke} strokeWidth="1.2" />
                <polygon
                  points={`${ox - 10},${wallTopY - 6} ${ox + bw + 10},${wallTopY - 6 - ridgePx * 0.72} ${ox + bw + 10},${wallTopY - 6}`}
                  fill={pal.slabFill}
                  fillOpacity={0.45}
                  stroke={pal.wallExtStroke}
                  strokeWidth="1.4"
                />
                <text x={ox + bw + 16} y={wallTopY - ridgePx * 0.72} fill={pal.axisLine} fontSize="9.5" fontFamily="monospace">
                  COBERTURA 1 ÁGUA (i={project.constructionMethod.roofSlopePercent}%)
                </text>
              </>
            );
          }
          return (
            <>
              <rect
                x={ox - 8}
                y={baseY - bh + front.parapetHeight * sc - 7}
                width={bw + 16}
                height={7}
                fill="url(#cadConcHatch)"
                stroke={pal.wallExtStroke}
                strokeWidth="1.3"
              />
              <rect x={ox} y={baseY - bh} width={8} height={front.parapetHeight * sc} fill={pal.wallExtFill} stroke={pal.wallExtStroke} strokeWidth="1.2" />
              <rect x={ox + bw - 8} y={baseY - bh} width={8} height={front.parapetHeight * sc} fill={pal.wallExtFill} stroke={pal.wallExtStroke} strokeWidth="1.2" />
              <text x={ox + bw + 16} y={baseY - bh + 8} fill={pal.axisLine} fontSize="9.5" fontFamily="monospace">
                ⊕ +{front.totalHeight.toFixed(2)}m ({roofShape === 'laje_plana' ? 'Laje Impermeab.' : 'Platibanda'})
              </text>
            </>
          );
        })()}
      </SheetFrame>
    );
  }

  // A10 / A11 — Detalhes Construtivos
  if (sheetId === 'A10' || sheetId === 'A11') {
    const isWet = sheetId === 'A11';
    return (
      <SheetFrame>
        <text x={28} y={36} fill={pal.unitTag} fontSize="12" fontWeight="bold" fontFamily="monospace">
          {isWet
            ? 'DETALHE EXECUTIVO ÁREAS MOLHADAS — IMPERMEABILIZAÇÃO, CONTRAPISO & SHAFT (ESC. 1:25)'
            : 'DETALHE CONSTRUTIVO TÍPICO — BALDRAME, ALVENARIA, VERGA & PLATIBANDA (ESC. 1:20)'}
        </text>
        <rect x={165} y={90} width={64} height={310} fill="url(#cadMasonryHatch)" stroke={pal.wallExtStroke} strokeWidth="2" />
        <rect x={145} y={400} width={104} height={58} fill="url(#cadConcHatch)" stroke={pal.wallExtStroke} strokeWidth="2" />
        <rect x={229} y={376} width={310} height={26} fill="url(#cadConcHatch)" stroke={pal.wallExtStroke} strokeWidth="1.6" />
        <rect x={184} y={160} width={26} height={120} fill={pal.windowGlass} fillOpacity="0.28" stroke={pal.windowFrame} strokeWidth="1.5" />
        <rect x={160} y={142} width={74} height={18} fill={pal.structure} fillOpacity="0.65" stroke={pal.structure} strokeWidth="1.1" />
        <rect x={160} y={280} width={74} height={14} fill={pal.structure} fillOpacity="0.65" stroke={pal.structure} strokeWidth="1.1" />

        <text x={256} y={154} fill={pal.dimension} fontSize="10.5" fontFamily="monospace">
          ← Verga concreto armado (transpasse mínimo 30 cm por lado)
        </text>
        <text x={256} y={222} fill={pal.windowGlass} fontSize="10.5" fontFamily="monospace">
          ← Caixilho alumínio anodizado + vidro temperado + silicone neutro
        </text>
        <text x={256} y={290} fill={pal.dimension} fontSize="10.5" fontFamily="monospace">
          ← Contraverga concreto armado + peitoril com pingadeira externa
        </text>
        <text x={256} y={392} fill={pal.roomText} fontSize="10.5" fontFamily="monospace">
          ← {isWet ? 'Impermeabilização manta/argamassa polimérica + rodapé h=30cm + caimento 1%' : 'Contrapiso regularizado + porcelanato retificado + argamassa AC-III'}
        </text>
        <text x={256} y={432} fill={pal.wallExtStroke} fontSize="10.5" fontFamily="monospace">
          ← Viga baldrame impermeabilizada c/ 3 demãos de emulsão asfáltica
        </text>
      </SheetFrame>
    );
  }

  // A12 / E04 / E05 / H06 — Clean Tabular & Schematic CAD Sheets
  if (sheetId === 'A12' || sheetId === 'E04' || sheetId === 'E05' || sheetId === 'H06') {
    const tabs = buildSheetTabulations(project);
    return (
      <SheetFrame>
        <text x={26} y={34} fill={pal.unitTag} fontSize="12" fontWeight="bold" fontFamily="monospace">
          {sheetId === 'A12' && 'QUADRO GERAL DE ÁREAS — ÍNDICES URBANÍSTICOS E UNIDADES'}
          {sheetId === 'E04' && 'QUADRO DE CARGAS, DISJUNTORES E CONDUTORES (ABNT NBR 5410)'}
          {sheetId === 'E05' && 'DIAGRAMA UNIFILAR DE DISTRIBUIÇÃO — QDC PADRÃO COM DR'}
          {sheetId === 'H06' && 'ESQUEMA VERTICAL HIDROSSANITÁRIO (COLUNAS AF / AQ / TQ / VENT)'}
        </text>
        <line x1={26} y1={42} x2={svgW - 26} y2={42} stroke={pal.gridDot} strokeWidth="1" />

        {sheetId === 'A12' && (
          <g>
            <SvgGridTable
              x={26}
              y={56}
              pal={pal}
              accentColor={pal.dimension}
              rowHeight={26}
              columns={[
                { label: 'TERRENO (m²)', width: 170, align: 'right' },
                { label: 'EDIFICÁVEL (m²)', width: 170, align: 'right' },
                { label: 'PRIVATIVA TOTAL', width: 175, align: 'right' },
                { label: 'ÁREA COMUM', width: 165, align: 'right' },
                { label: 'CONSTRUÍDA TOTAL', width: 188, align: 'right' },
              ]}
              rows={[
                [
                  `${tabs.siteCheck.calculatedArea.toFixed(2)} m²`,
                  `${tabs.siteCheck.buildableBox.area.toFixed(2)} m²`,
                  `${tabs.quantities.summary.totalPrivateAreaM2.toFixed(2)} m²`,
                  `${tabs.quantities.summary.totalCommonAreaM2.toFixed(2)} m²`,
                  `${tabs.quantities.summary.totalBuiltAreaM2.toFixed(2)} m²`,
                ],
              ]}
            />
            <SvgGridTable
              x={26}
              y={132}
              pal={pal}
              accentColor={pal.unitTag}
              rowHeight={28}
              columns={[
                { label: 'CÓDIGO', width: 90 },
                { label: 'TIPOLOGIA', width: 210 },
                { label: 'ÁREA BRUTA', width: 105, align: 'right' },
                { label: 'ÁREA ÚTIL', width: 105, align: 'right' },
                { label: 'AMBIENTES INTERNOS', width: 358 },
              ]}
              rows={
                tabs.areaRows.length > 0
                  ? tabs.areaRows.map((row) => [
                      row.code,
                      row.name,
                      `${row.grossArea.toFixed(2)} m²`,
                      `${row.usefulArea.toFixed(2)} m²`,
                      row.roomsSummary,
                    ])
                  : [['—', 'Nenhuma tipologia cadastrada', '0.00 m²', '0.00 m²', '—']]
              }
            />
          </g>
        )}

        {sheetId === 'E04' && (
          <g>
            {tabs.elec.byUnitType.length === 0 ? (
              <text x={svgW / 2} y={svgH / 2} textAnchor="middle" fill={pal.roomText} fontSize="11" fontFamily="monospace">
                Cadastre tipologias com pontos elétricos para gerar o Quadro de Cargas NBR 5410.
              </text>
            ) : (
              tabs.elec.byUnitType.slice(0, 2).map((u, uIdx) => {
                const startY = 56 + uIdx * 242;
                return (
                  <g key={u.unitTypeId}>
                    <text x={26} y={startY + 12} fill={pal.electric} fontSize="10" fontWeight="bold" fontFamily="monospace">
                      {u.unitTypeName} — Pot. Instalada: {u.installedPowerVA} VA | Demanda Estimada: {u.demandPowerVA} VA
                    </text>
                    <SvgGridTable
                      x={26}
                      y={startY + 20}
                      pal={pal}
                      accentColor={pal.electric}
                      rowHeight={23}
                      columns={[
                        { label: 'CIRCUITO', width: 92 },
                        { label: 'DESCRIÇÃO / PONTOS', width: 292 },
                        { label: 'TENSÃO', width: 70, align: 'center' },
                        { label: 'POT. (VA)', width: 82, align: 'right' },
                        { label: 'CORR. (A)', width: 78, align: 'right' },
                        { label: 'DISJ. (A)', width: 82, align: 'center' },
                        { label: 'CABO (mm²)', width: 86, align: 'center' },
                        { label: 'ELETROD.', width: 86, align: 'center' },
                      ]}
                      rows={u.circuits.slice(0, 7).map((c) => [
                        c.circuitId,
                        c.description || 'Circuito terminal',
                        `${c.voltage}V`,
                        `${c.totalPowerVA}`,
                        `${c.currentA}A`,
                        `${c.recommendedBreakerA}A`,
                        `${c.conductorMm2}mm²`,
                        `Ø${c.conduitMm}mm`,
                      ])}
                    />
                  </g>
                );
              })
            )}
          </g>
        )}

        {sheetId === 'E05' && (
          <g fontFamily="monospace" fontSize="9.5">
            <rect x={44} y={96} width={110} height={54} fill={pal.bg} stroke={pal.electric} strokeWidth="1.6" />
            <text x={99} y={120} textAnchor="middle" fill={pal.electric} fontWeight="bold">MEDIDOR</text>
            <text x={99} y={136} textAnchor="middle" fill={pal.dimension} fontSize="8">Bifásico 127/220V</text>
            <line x1={154} y1={123} x2={230} y2={123} stroke={pal.wallExtStroke} strokeWidth="2.4" />
            <rect x={230} y={96} width={115} height={54} fill={pal.bg} stroke={pal.fire} strokeWidth="1.6" />
            <text x={287} y={118} textAnchor="middle" fill={pal.fire} fontWeight="bold">GERAL + DR 30mA</text>
            <text x={287} y={136} textAnchor="middle" fill={pal.dimension} fontSize="8">+ DPS Classe II</text>
            <line x1={345} y1={123} x2={425} y2={123} stroke={pal.wallExtStroke} strokeWidth="2.8" />
            {/* Busbar */}
            <line x1={425} y1={72} x2={425} y2={480} stroke={pal.wallExtStroke} strokeWidth="3.5" />
            <text x={425} y={64} textAnchor="middle" fill={pal.unitTag} fontSize="9" fontWeight="bold">
              BARRAMENTO QDC
            </text>
            {(tabs.elec.byUnitType[0]?.circuits ?? []).slice(0, 7).map((c, idx) => {
              const cy = 96 + idx * 54;
              return (
                <g key={c.circuitId}>
                  <line x1={425} y1={cy} x2={520} y2={cy} stroke={pal.electric} strokeWidth="1.5" />
                  <circle cx={468} cy={cy} r={10} fill={pal.bg} stroke={pal.electric} strokeWidth="1.5" />
                  <text x={468} y={cy + 3} textAnchor="middle" fill={pal.electric} fontSize="7.5" fontWeight="bold">
                    {c.recommendedBreakerA}A
                  </text>
                  <rect x={520} y={cy - 14} width={356} height={28} fill={pal.gridDot} fillOpacity={0.22} stroke={pal.paperBorder} strokeWidth="0.8" />
                  <text x={530} y={cy + 3} fill={pal.roomText} fontSize="9">
                    {c.circuitId} · {c.voltage}V · {c.conductorMm2}mm² · Ø{c.conduitMm}mm · {c.totalPowerVA}VA ({clipText(c.description, 20)})
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {sheetId === 'H06' && (
          <g fontFamily="monospace" fontSize="9.5">
            <rect x={120} y={64} width={330} height={54} fill={pal.coldWater} fillOpacity="0.18" stroke={pal.coldWater} strokeWidth="1.8" />
            <text x={285} y={88} textAnchor="middle" fill={pal.coldWater} fontWeight="bold" fontSize="10.5">
              RESERVATÓRIO SUPERIOR ({tabs.hyd.recommendedTotalReservoirLiters} L TOTAL)
            </text>
            <text x={285} y={104} textAnchor="middle" fill={pal.dimension} fontSize="8.5">
              Consumo: {tabs.hyd.dailyConsumptionLiters} L/dia · Sup: {tabs.hyd.upperReservoirLiters} L / Inf: {tabs.hyd.lowerReservoirLiters} L
            </text>
            <line x1={185} y1={118} x2={185} y2={485} stroke={pal.coldWater} strokeWidth="2.6" />
            <text x={175} y={260} textAnchor="end" fill={pal.coldWater}>Coluna AF Ø32/25mm</text>
            <line x1={275} y1={140} x2={275} y2={485} stroke={pal.hotWater} strokeWidth="2.2" strokeDasharray="6 3" />
            <text x={283} y={240} fill={pal.hotWater}>Coluna AQ CPVC Ø22mm</text>
            <line x1={430} y1={120} x2={430} y2={485} stroke={pal.sanitary} strokeWidth="3" />
            <text x={442} y={260} fill={pal.sanitary}>Tubo de Queda TQ Ø100mm</text>
            <line x1={520} y1={75} x2={520} y2={485} stroke={pal.rainwater} strokeWidth="1.8" strokeDasharray="4 2" />
            <text x={532} y={220} fill={pal.rainwater}>Coluna Ventilação Ø50mm</text>

            {project.floors.map((fl, idx) => {
              const fy = 435 - idx * 85;
              return (
                <g key={fl.id}>
                  <line x1={40} y1={fy} x2={875} y2={fy} stroke={pal.gridDot} strokeDasharray="4 2" strokeWidth="1" />
                  <line x1={185} y1={fy - 26} x2={345} y2={fy - 26} stroke={pal.coldWater} strokeWidth="1.6" />
                  <line x1={275} y1={fy - 18} x2={345} y2={fy - 18} stroke={pal.hotWater} strokeWidth="1.4" />
                  <line x1={345} y1={fy - 8} x2={430} y2={fy} stroke={pal.sanitary} strokeWidth="1.8" />
                  <text x={48} y={fy - 6} fill={pal.roomText} fontWeight="bold">
                    {fl.name} (+{fl.elevation.toFixed(2)}m)
                  </text>
                  <text x={665} y={fy - 6} fill={pal.dimension} fontSize="8.5">
                    {fl.units.length} unid. · Sub-ramal Ø25mm / Esgoto Ø100mm
                  </text>
                </g>
              );
            })}
          </g>
        )}
      </SheetFrame>
    );
  }

  // Standard Plan / Site / Roof / MEP / Structure / Fire CAD Vector Sheet
  const siteBBox = getBoundingBox(project.site.vertices);
  const siteCheck = analyzeSiteGeometry(project.site);
  const activeFloor = project.floors[floorIndex] ?? project.floors[0];
  const footprint = computeFloorFootprint(project, activeFloor);
  const specials = buildSheetTabulations(project).specials;

  const isPlanWithUnitZoom =
    footprint.hasUnits &&
    project.unitTypes.length > 0 &&
    ['A03', 'A04', 'A06', 'A13', 'E01', 'E02', 'E03', 'E06', 'H01', 'H02', 'H03', 'H04'].includes(
      sheetId,
    );

  // Left CAD Viewport bounds
  const leftZone = isPlanWithUnitZoom
    ? { x: 18, y: 18, w: 518, h: 524 }
    : { x: 18, y: 18, w: 616, h: 524 };

  const zoomToBuilding =
    footprint.hasUnits &&
    ['A03', 'A04', 'A06', 'A13', 'E01', 'E02', 'E03', 'E06', 'H01', 'H02', 'H03', 'H04'].includes(
      sheetId,
    );

  const focusBox = zoomToBuilding
    ? {
        minX: footprint.minX - 2.1,
        minY: footprint.minY - 2.1,
        width: Math.max(4, footprint.width + 4.2),
        depth: Math.max(4, footprint.depth + 4.2),
      }
    : {
        minX: siteBBox.minX - 2.2,
        minY: siteBBox.minY - 2.2,
        width: Math.max(6, siteBBox.width + 4.4),
        depth: Math.max(6, siteBBox.depth + 4.8),
      };

  const scale = Math.min(
    (leftZone.w - 36) / focusBox.width,
    (leftZone.h - 68) / focusBox.depth,
  );
  const offX = leftZone.x + 18 + (leftZone.w - 36 - focusBox.width * scale) / 2 - focusBox.minX * scale;
  const offY = leftZone.y + 28 + (leftZone.h - 68 - focusBox.depth * scale) / 2 - focusBox.minY * scale;

  const mx = (wx: number) => offX + wx * scale;
  const my = (wy: number) => offY + wy * scale;

  const showFurniture = !['A01', 'A02', 'A05', 'H05', 'S01'].includes(sheetId);
  const showElectrical = ['E01', 'E02', 'E03'].includes(sheetId);
  const showSpecials = sheetId === 'E06';
  const showWater = ['H01', 'H02'].includes(sheetId);
  const showDrain = ['H03', 'H04'].includes(sheetId);
  const showRoof = sheetId === 'A05' || sheetId === 'H05';

  // Right 1:25 Enlarged Typical Unit Selection
  const safeUtIdx = Math.min(enlargedUtIdx, Math.max(0, project.unitTypes.length - 1));
  const enlargedUt: UnitType | undefined = project.unitTypes[safeUtIdx];

  const renderEnlargedUnitPanel = (ut: UnitType) => {
    const px = 546;
    const py = 18;
    const pw = 358;
    const ph = 330;
    const uScale = Math.min((pw - 76) / Math.max(2, ut.width), (ph - 88) / Math.max(2, ut.depth));
    const uox = px + 38 + (pw - 76 - ut.width * uScale) / 2;
    const uoy = py + 52 + (ph - 88 - ut.depth * uScale) / 2;
    const ux = (lx: number) => uox + lx * uScale;
    const uy = (ly: number) => uoy + ly * uScale;
    const qdcLocal = getQdcPosition(ut);

    return (
      <g>
        <rect x={px} y={py} width={pw} height={ph} fill={pal.bg} stroke={pal.paperBorder} strokeWidth="1" />
        <rect x={px} y={py} width={pw} height={24} fill={pal.gridDot} fillOpacity={0.35} stroke={pal.paperBorder} strokeWidth="0.9" />
        <text x={px + 10} y={py + 15.5} fill={pal.unitTag} fontSize="9.5" fontWeight="bold" fontFamily="monospace">
          AMPLIAÇÃO {ut.code} ({ut.width}×{ut.depth}m = {round2(ut.width * ut.depth)}m²) — ESC. 1:25
        </text>

        {/* Room background tint */}
        {ut.rooms.map((r) => (
          <rect
            key={`enl-rm-bg-${r.id}`}
            x={ux(r.x)}
            y={uy(r.y)}
            width={r.width * uScale}
            height={r.depth * uScale}
            fill={r.category === 'banheiro' || r.category === 'cozinha' ? pal.coldWater : pal.gridDot}
            fillOpacity={0.07}
            stroke={pal.gridDot}
            strokeWidth="0.5"
          />
        ))}

        {/* Mezzanine dashed perimeter projection (never counted as a floor) */}
        {ut.hasMezzanine &&
          ut.mezzanine?.enabled &&
          ut.ceilingHeight >= 3.0 &&
          (() => {
            const mezRoom = ut.rooms.find((r) => r.category === 'mezanino');
            if (!mezRoom) return null;
            return (
              <g>
                <rect
                  x={ux(mezRoom.x)}
                  y={uy(mezRoom.y)}
                  width={mezRoom.width * uScale}
                  height={mezRoom.depth * uScale}
                  fill={pal.unitTag}
                  fillOpacity={0.07}
                  stroke={pal.unitTag}
                  strokeDasharray="4 2"
                  strokeWidth="1.1"
                />
                <text
                  x={ux(mezRoom.x + 0.12)}
                  y={uy(mezRoom.y + 0.28)}
                  fill={pal.unitTag}
                  fontSize="6.5"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  PROJ. MEZANINO (+{ut.mezzanine.elevationM.toFixed(2)}m)
                </text>
              </g>
            );
          })()}

        {/* Enlarged Furniture CAD Blocks */}
        {ut.furniture.map((f) => {
          const rect = getFurnitureWorldRect(f);
          return (
            <FurnitureCadBlock
              key={`enl-fur-${f.id}`}
              category={f.category}
              x={ux(rect.x)}
              y={uy(rect.y)}
              width={rect.width * uScale}
              depth={rect.depth * uScale}
              stroke={pal.furniture}
              fill={pal.gridDot}
              accent={pal.windowGlass}
              strokeWidth={0.95}
              detailed={true}
              stairSpec={f.stairSpec}
            />
          );
        })}

        {/* Room Tags w/ opaque halo placed in open zones */}
        {ut.rooms.map((r) => {
          const rx =
            r.category === 'banheiro'
              ? ux(r.x + r.width * 0.58)
              : r.category === 'cozinha'
              ? ux(r.x + r.width * 0.52)
              : ux(r.x + r.width * 0.56);
          const ry =
            r.category === 'banheiro'
              ? uy(r.y + r.depth * 0.62)
              : r.category === 'cozinha'
              ? uy(r.y + r.depth * 0.66)
              : uy(r.y + r.depth * 0.44);
          return (
            <g key={`enl-rm-${r.id}`}>
              <rect
                x={rx - 22}
                y={ry - 10}
                width={44}
                height={20}
                rx={2.5}
                fill={pal.bg}
                fillOpacity={0.88}
                stroke={pal.gridDot}
                strokeWidth="0.6"
              />
              <text
                x={rx}
                y={ry - 1}
                textAnchor="middle"
                fill={pal.roomText}
                fontSize="8"
                fontWeight="bold"
                fontFamily="monospace"
              >
                {r.code}
              </text>
              <text
                x={rx}
                y={ry + 8}
                textAnchor="middle"
                fill={pal.dimension}
                fontSize="7"
                fontFamily="monospace"
              >
                {getRoomArea(r).toFixed(2)}m²
              </text>
            </g>
          );
        })}

        {/* Double-line Hatched Walls (Alvenaria vs Drywall) */}
        {ut.walls.map((wall) => {
          const isDrywall =
            !wall.isExternal && wall.material.toLowerCase().includes('drywall');
          const spans = splitWallByOpenings(wall, ut.openings);
          return spans.map((sp, sIdx) => {
            const p0 = {
              x: wall.start.x + (wall.end.x - wall.start.x) * sp.t0,
              y: wall.start.y + (wall.end.y - wall.start.y) * sp.t0,
            };
            const p1 = {
              x: wall.start.x + (wall.end.x - wall.start.x) * sp.t1,
              y: wall.start.y + (wall.end.y - wall.start.y) * sp.t1,
            };
            const quad = getWallQuadWorld(p0, p1, wall.thickness);
            return (
              <polygon
                key={`enl-w-${wall.id}-${sIdx}`}
                points={quad.map((q) => `${ux(q.x)},${uy(q.y)}`).join(' ')}
                fill={isDrywall ? 'url(#cadDrywallHatch)' : 'url(#cadMasonryHatch)'}
                stroke={wall.isExternal ? pal.wallExtStroke : pal.wallIntStroke}
                strokeWidth={wall.isExternal ? 1.6 : isDrywall ? 0.9 : 1.1}
                strokeDasharray={isDrywall ? '3 1.5' : undefined}
              />
            );
          });
        })}

        {/* Openings w/ Door Swing, Sliding & Vitrô Symbols */}
        {ut.openings.map((op) => {
          const wall = ut.walls.find((w) => w.id === op.wallId);
          if (!wall) return null;
          const pos = getOpeningWorldPosition(wall, op);
          const wallLen = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) || 1;
          const wux = (wall.end.x - wall.start.x) / wallLen;
          const wuy = (wall.end.y - wall.start.y) / wallLen;
          const pa = { x: pos.center.x - wux * (op.width / 2), y: pos.center.y - wuy * (op.width / 2) };
          const pb = { x: pos.center.x + wux * (op.width / 2), y: pos.center.y + wuy * (op.width / 2) };

          if (op.type === 'porta') {
            if (op.openingKind === 'porta_correr') {
              const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
              return (
                <g key={`enl-op-${op.id}`}>
                  <line x1={ux(pa.x)} y1={uy(pa.y)} x2={ux(mid.x)} y2={uy(mid.y)} stroke={pal.doorLeaf} strokeWidth="2.0" />
                  <line x1={ux(mid.x)} y1={uy(mid.y) + 2} x2={ux(pb.x)} y2={uy(pb.y) + 2} stroke={pal.doorSwing} strokeWidth="1.4" />
                  <text x={ux(pos.center.x)} y={uy(pos.center.y) - 4} textAnchor="middle" fill={pal.doorLeaf} fontSize="7" fontFamily="monospace">
                    {op.code} ({Math.round(op.width * 100)})
                  </text>
                </g>
              );
            }
            const vx = pb.x - pa.x;
            const vy = pb.y - pa.y;
            const tip = { x: pa.x - vy, y: pa.y + vx };
            const rPx = op.width * uScale;
            return (
              <g key={`enl-op-${op.id}`}>
                <line x1={ux(pa.x)} y1={uy(pa.y)} x2={ux(tip.x)} y2={uy(tip.y)} stroke={pal.doorLeaf} strokeWidth="1.5" />
                <path
                  d={`M ${ux(pb.x)} ${uy(pb.y)} A ${rPx} ${rPx} 0 0 1 ${ux(tip.x)} ${uy(tip.y)}`}
                  fill="none"
                  stroke={pal.doorSwing}
                  strokeDasharray="3 2"
                  strokeWidth="0.9"
                />
                <text x={ux(pos.center.x)} y={uy(pos.center.y) - 4} textAnchor="middle" fill={pal.doorLeaf} fontSize="7" fontFamily="monospace">
                  {op.code} ({Math.round(op.width * 100)})
                </text>
              </g>
            );
          }

          const isVitro =
            op.openingKind?.startsWith('vitro_') ||
            op.subtype.toLowerCase().includes('basculante') ||
            op.subtype.toLowerCase().includes('vitr');
          const quad = getWallQuadWorld(pa, pb, wall.thickness * 0.72);
          const nx = -wuy * 2.2;
          const ny = wux * 2.2;
          return (
            <g key={`enl-op-${op.id}`}>
              <polygon points={quad.map((q) => `${ux(q.x)},${uy(q.y)}`).join(' ')} fill={pal.bg} stroke={pal.windowFrame} strokeWidth="1" />
              <line x1={ux(pa.x)} y1={uy(pa.y)} x2={ux(pb.x)} y2={uy(pb.y)} stroke={pal.windowGlass} strokeWidth="1.2" />
              {isVitro && (
                <line
                  x1={ux(pa.x) + nx}
                  y1={uy(pa.y) + ny}
                  x2={ux(pb.x) + nx}
                  y2={uy(pb.y) + ny}
                  stroke={pal.windowFrame}
                  strokeWidth="0.85"
                  strokeDasharray="2 1.5"
                />
              )}
              <text x={ux(pos.center.x)} y={uy(pos.center.y) - 5} textAnchor="middle" fill={pal.windowGlass} fontSize="7" fontFamily="monospace">
                {op.code}
              </text>
            </g>
          );
        })}

        {/* Discipline-specific overlay inside 1:25 unit enlargement */}
        {showElectrical && (() => {
          const elRt = computeElectricalRouting(ut);
          return (
            <g>
              {elRt.segments
                .filter((s) => s.kind === 'electrical')
                .map((seg) => {
                  const pts = seg.elbow
                    ? `${ux(seg.from.x)},${uy(seg.from.y)} ${ux(seg.elbow.x)},${uy(seg.elbow.y)} ${ux(seg.to.x)},${uy(seg.to.y)}`
                    : `${ux(seg.from.x)},${uy(seg.from.y)} ${ux(seg.to.x)},${uy(seg.to.y)}`;
                  return (
                    <polyline
                      key={`enl-el-rt-${seg.id}`}
                      points={pts}
                      fill="none"
                      stroke={pal.electric}
                      strokeWidth="0.85"
                      strokeDasharray="3 2"
                      opacity={0.78}
                    />
                  );
                })}
              <ElectricalSymbolSvg category="quadro_luz" cx={ux(qdcLocal.x)} cy={uy(qdcLocal.y)} r={5.2} color={pal.electric} bg={pal.bg} />
              <text x={ux(qdcLocal.x) + 7} y={uy(qdcLocal.y) + 2.5} fill={pal.electric} fontSize="7" fontWeight="bold" fontFamily="monospace">
                {qdcLocal.code}
              </text>
              {ut.electricalPoints
                .filter((e) => !isSpecialCategory(e.category) && e.category !== 'quadro_luz' && !e.code.toUpperCase().startsWith('QDC'))
                .map((ep) => (
                  <g key={`enl-el-${ep.id}`}>
                    <ElectricalSymbolSvg category={ep.category} cx={ux(ep.x)} cy={uy(ep.y)} r={4.2} color={pal.electric} bg={pal.bg} />
                    <text x={ux(ep.x) + 5.5} y={uy(ep.y) + 2.5} fill={pal.electric} fontSize="6.5" fontFamily="monospace">
                      {ep.code}
                    </text>
                  </g>
                ))}
            </g>
          );
        })()}

        {showSpecials && (() => {
          const elRt = computeElectricalRouting(ut);
          return (
            <g>
              <ElectricalSymbolSvg category="quadro_luz" cx={ux(qdcLocal.x)} cy={uy(qdcLocal.y)} r={4.5} color={specialCable} bg={pal.bg} />
              <text x={ux(qdcLocal.x) + 6.5} y={uy(qdcLocal.y) + 2.5} fill={specialLabel} fontSize="6.8" fontWeight="bold" fontFamily="monospace">
                {qdcLocal.code} / TI
              </text>
              {elRt.segments
                .filter((s) => s.kind === 'special')
                .map((seg) => {
                  const pts = seg.elbow
                    ? `${ux(seg.from.x)},${uy(seg.from.y)} ${ux(seg.elbow.x)},${uy(seg.elbow.y)} ${ux(seg.to.x)},${uy(seg.to.y)}`
                    : `${ux(seg.from.x)},${uy(seg.from.y)} ${ux(seg.to.x)},${uy(seg.to.y)}`;
                  return (
                    <polyline
                      key={`enl-sp-rt-${seg.id}`}
                      points={pts}
                      fill="none"
                      stroke={specialCable}
                      strokeWidth="0.95"
                      strokeDasharray="4 2"
                      opacity={0.85}
                    />
                  );
                })}
              {ut.electricalPoints
                .filter((e) => isSpecialCategory(e.category))
                .map((ep) => (
                  <g key={`enl-sp-${ep.id}`}>
                    <ElectricalSymbolSvg category={ep.category} cx={ux(ep.x)} cy={uy(ep.y)} r={4.6} color={specialStroke} bg={pal.bg} />
                    <text x={ux(ep.x) + 6} y={uy(ep.y) + 2.5} fill={specialLabel} fontSize="6.8" fontWeight="bold" fontFamily="monospace">
                      {ep.code}
                    </text>
                  </g>
                ))}
            </g>
          );
        })()}

        {showWater && (() => {
          const hydRt = computeHydraulicRouting(ut);
          return (
            <g>
              {hydRt.segments.map((seg) => {
                const col = seg.kind === 'hot_water' ? pal.hotWater : pal.coldWater;
                const pts = seg.elbow
                  ? `${ux(seg.from.x)},${uy(seg.from.y)} ${ux(seg.elbow.x)},${uy(seg.elbow.y)} ${ux(seg.to.x)},${uy(seg.to.y)}`
                  : `${ux(seg.from.x)},${uy(seg.from.y)} ${ux(seg.to.x)},${uy(seg.to.y)}`;
                return (
                  <polyline
                    key={`enl-hyd-rt-${seg.id}`}
                    points={pts}
                    fill="none"
                    stroke={col}
                    strokeWidth="1.2"
                    strokeDasharray={seg.kind === 'hot_water' ? '3 1.5' : undefined}
                    opacity={0.82}
                  />
                );
              })}
              <circle cx={ux(hydRt.riser.x)} cy={uy(hydRt.riser.y)} r={4.5} fill={pal.coldWater} stroke={pal.bg} strokeWidth="1" />
              <text x={ux(hydRt.riser.x) + 6} y={uy(hydRt.riser.y) - 4} fill={pal.coldWater} fontSize="6.2" fontWeight="bold" fontFamily="monospace">
                AF-PRUM
              </text>
              {ut.waterPoints.map((wp) => {
                const col = wp.waterType === 'quente' ? pal.hotWater : pal.coldWater;
                return (
                  <g key={`enl-wp-${wp.id}`}>
                    <circle cx={ux(wp.x)} cy={uy(wp.y)} r={4} fill={col} stroke={pal.bg} strokeWidth="0.8" />
                    <text x={ux(wp.x) + 5.5} y={uy(wp.y) + 2.5} fill={col} fontSize="6.5" fontWeight="bold" fontFamily="monospace">
                      {wp.code} Ø{wp.diameterMm}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })()}

        {showDrain &&
          (() => {
            const dpMap = new Map(ut.drainagePoints.map((d) => [d.id, d]));
            return ut.drainagePoints.map((dp, idx) => {
              const target = dp.connectedToId ? dpMap.get(dp.connectedToId) : undefined;
              const dx =
                dp.category === 'tubo_queda'
                  ? 7
                  : dp.category === 'ventilacao'
                  ? -42
                  : dp.category === 'caixa_sifonada'
                  ? 7
                  : dp.category === 'ralo' && dp.code.startsWith('RS')
                  ? 7
                  : 7;
              const dy =
                dp.category === 'tubo_queda'
                  ? -5
                  : dp.category === 'ventilacao'
                  ? 9
                  : dp.category === 'caixa_sifonada'
                  ? 8
                  : dp.category === 'ralo' && dp.code.startsWith('RS')
                  ? 10
                  : idx % 2 === 0
                  ? -5
                  : 8;
              return (
                <g key={`enl-dp-${dp.id}`}>
                  {target && (
                    <line
                      x1={ux(dp.x)}
                      y1={uy(dp.y)}
                      x2={ux(target.x)}
                      y2={uy(target.y)}
                      stroke={pal.sanitary}
                      strokeWidth="1.5"
                      strokeDasharray={dp.category === 'ventilacao' ? '3 2' : undefined}
                    />
                  )}
                  {dp.category === 'caixa_sifonada' || dp.category === 'caixa_gordura' ? (
                    <rect
                      x={ux(dp.x) - 4.5}
                      y={uy(dp.y) - 4.5}
                      width={9}
                      height={9}
                      fill={pal.bg}
                      stroke={pal.sanitary}
                      strokeWidth="1.4"
                    />
                  ) : (
                    <circle
                      cx={ux(dp.x)}
                      cy={uy(dp.y)}
                      r={dp.category === 'tubo_queda' ? 5 : 3.5}
                      fill={dp.category === 'tubo_queda' ? pal.sanitary : pal.bg}
                      stroke={pal.sanitary}
                      strokeWidth="1.3"
                    />
                  )}
                  <text x={ux(dp.x) + dx} y={uy(dp.y) + dy} fill={pal.sanitary} fontSize="6.2" fontWeight="bold" fontFamily="monospace">
                    {dp.code} {dp.diameterMm ? `Ø${dp.diameterMm}` : ''}
                  </text>
                </g>
              );
            });
          })()}

        {/* Enlarged Unit External Dimensions */}
        <line x1={ux(0)} y1={uy(ut.depth) + 14} x2={ux(ut.width)} y2={uy(ut.depth) + 14} stroke={pal.dimension} strokeWidth="0.9" />
        <text x={ux(ut.width / 2)} y={uy(ut.depth) + 24} textAnchor="middle" fill={pal.dimension} fontSize="8" fontFamily="monospace">
          {ut.width.toFixed(2)} m
        </text>
        <line x1={ux(ut.width) + 14} y1={uy(0)} x2={ux(ut.width) + 14} y2={uy(ut.depth)} stroke={pal.dimension} strokeWidth="0.9" />
        <text x={ux(ut.width) + 19} y={uy(ut.depth / 2)} fill={pal.dimension} fontSize="8" fontFamily="monospace">
          {ut.depth.toFixed(2)} m
        </text>
      </g>
    );
  };

  const renderLegendPanel = () => {
    const lx = isPlanWithUnitZoom ? 546 : 644;
    const ly = isPlanWithUnitZoom ? 356 : 18;
    const lw = isPlanWithUnitZoom ? 358 : 260;
    const lh = isPlanWithUnitZoom ? 186 : 524;

    return (
      <g fontFamily="monospace">
        <rect x={lx} y={ly} width={lw} height={lh} fill={pal.bg} stroke={pal.paperBorder} strokeWidth="1" />
        <rect x={lx} y={ly} width={lw} height={22} fill={pal.gridDot} fillOpacity={0.35} stroke={pal.paperBorder} strokeWidth="0.9" />
        <text x={lx + 10} y={ly + 14.5} fill={pal.unitTag} fontSize="9.5" fontWeight="bold">
          LEGENDA TÉCNICA &amp; CONVENÇÕES
        </text>

        <g transform={`translate(${lx + 12}, ${ly + 36})`} fontSize="8.2" fill={pal.roomText}>
          {/* Universal Architecture Symbols */}
          <rect x={0} y={-6} width={18} height={8} fill="url(#cadMasonryHatch)" stroke={pal.wallExtStroke} strokeWidth="1.2" />
          <text x={24} y={0}>Parede Alvenaria / Vedação c/ Hachura</text>

          <rect x={0} y={6} width={18} height={6} fill="url(#cadDrywallHatch)" stroke={pal.wallIntStroke} strokeDasharray="3 1.5" strokeWidth="0.9" />
          <text x={24} y={11}>Divisória Drywall ST/RU (9,5cm)</text>

          <line x1={0} y1={24} x2={14} y2={24} stroke={pal.doorLeaf} strokeWidth="1.4" />
          <path d="M 0 24 A 11 11 0 0 1 11 13" fill="none" stroke={pal.doorSwing} strokeDasharray="2 1.5" strokeWidth="0.8" />
          <text x={24} y={24}>Porta (80 Entr. · 70 Quarto · 60 BWC)</text>

          <line x1={0} y1={38} x2={18} y2={38} stroke={pal.windowGlass} strokeWidth="1.8" />
          <text x={24} y={41}>Janela / Vitrô Basculante c/ Peitoril</text>

          <line x1={0} y1={54} x2={18} y2={54} stroke={pal.axisLine} strokeDasharray="5 2 1 2" strokeWidth="0.9" />
          <text x={24} y={57}>Eixo Estrutural / Proj. Mezanino</text>

          {showElectrical && (
            <>
              <ElectricalSymbolSvg category="iluminacao_teto" cx={9} cy={74} r={4.5} color={pal.electric} bg={pal.bg} />
              <text x={24} y={77}>Ponto de Iluminação Teto (LED)</text>
              <ElectricalSymbolSvg category="tomada_baixa" cx={9} cy={92} r={4.5} color={pal.electric} bg={pal.bg} />
              <text x={24} y={95}>TUG (z=0,30m / 1,10m) | TUE (Cheia)</text>
              <line x1={0} y1={112} x2={18} y2={112} stroke={pal.electric} strokeDasharray="3 2" strokeWidth="1" />
              <text x={24} y={115}>Eletroduto Corrugado Ø20/25mm</text>
            </>
          )}

          {showSpecials && (
            <>
              <ElectricalSymbolSvg category="cftv" cx={8} cy={72} r={3.8} color={specialStroke} bg={pal.bg} />
              <text x={24} y={76}>Câmera IP CFTV + Cone FOV ({specials.cftvUnitPoints + specials.cftvCommonCameras} un)</text>
              <ElectricalSymbolSvg category="wifi_ap" cx={9} cy={92} r={4} color={specialStroke} bg={pal.bg} />
              <text x={24} y={95}>Access Point Wi-Fi 6 PoE ({specials.wifiApPoints} un)</text>
              <ElectricalSymbolSvg category="dados" cx={9} cy={110} r={4} color={specialStroke} bg={pal.bg} />
              <text x={24} y={113}>Dados RJ45 Cat6 / Antena TV RG6 ({specials.rj45Points}/{specials.tvPoints})</text>
              <text x={0} y={133} fill={pal.unitTag} fontSize="7.8">
                Central: Rack 19&quot; 12U + NVR 16CH + Mastro UHF
              </text>
            </>
          )}

          {showWater && (
            <>
              <circle cx={9} cy={74} r={4} fill={pal.coldWater} />
              <text x={24} y={77}>Ponto Água Fria (PVC Ø25mm)</text>
              <circle cx={9} cy={94} r={4} fill={pal.hotWater} />
              <text x={24} y={97}>Ponto Água Quente (CPVC Ø22mm)</text>
              <text x={0} y={118} fill={pal.dimension} fontSize="7.8">
                Pressão min. 10 kPa · Registro gaveta BWC/Cozinha
              </text>
            </>
          )}

          {showDrain && (
            <>
              <rect x={4} y={69} width={10} height={10} fill={pal.bg} stroke={pal.sanitary} strokeWidth="1.2" />
              <text x={24} y={77}>CS (Caixa Sifonada 150) / CG (Gordura)</text>
              <circle cx={9} cy={94} r={4.5} fill={pal.sanitary} />
              <text x={24} y={97}>TQ (Tubo de Queda Ø100mm) / Ralos Ø40mm</text>
              <line x1={0} y1={113} x2={18} y2={113} stroke={pal.sanitary} strokeWidth="1.5" />
              <text x={24} y={116}>Ramal Esgoto (i=2% Ø≤75mm · i=1% Ø100mm)</text>
            </>
          )}

          {!showElectrical && !showSpecials && !showWater && !showDrain && (
            <>
              <line x1={0} y1={74} x2={18} y2={74} stroke={pal.setback} strokeDasharray="4 2" strokeWidth="1.1" />
              <text x={24} y={77}>Recuos Legais Obrigatórios</text>
              <line x1={0} y1={93} x2={18} y2={93} stroke={pal.dimension} strokeWidth="1" />
              <text x={24} y={96}>Cotas Executivas (m)</text>
              {sheetId === 'S01' && (
                <>
                  <rect x={4} y={108} width={10} height={10} fill={pal.structure} />
                  <text x={24} y={116}>Pilares Conceituais (Não dimensionado)</text>
                </>
              )}
              {sheetId === 'I01' && (
                <>
                  <line x1={0} y1={113} x2={18} y2={113} stroke={pal.fire} strokeDasharray="4 2" strokeWidth="1.6" />
                  <text x={24} y={116}>Rota de Fuga + Extintores PQS/CO2</text>
                </>
              )}
            </>
          )}
        </g>
      </g>
    );
  };

  return (
    <div className="space-y-2">
      {isPlanWithUnitZoom && project.unitTypes.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-300 bg-slate-100 px-3 py-1.5 text-[11px] text-slate-800">
          <span className="font-semibold">Tipologia em Ampliação 1:25 (Painel Direito):</span>
          <div className="flex flex-wrap gap-1.5">
            {project.unitTypes.map((ut, idx) => (
              <button
                key={ut.id}
                type="button"
                onClick={() => setEnlargedUtIdx(idx)}
                className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                  safeUtIdx === idx
                    ? 'border-[#2F7CF6] bg-[#2F7CF6] text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-200'
                }`}
              >
                {ut.code} ({round2(ut.width * ut.depth)}m²)
              </button>
            ))}
          </div>
        </div>
      )}

      <SheetFrame
        clipRect={{
          x: leftZone.x + 1,
          y: leftZone.y + 22,
          width: leftZone.w - 2,
          height: leftZone.h - 24,
        }}
      >
        {/* Left Drawing Viewport Frame */}
        <rect
          x={leftZone.x}
          y={leftZone.y}
          width={leftZone.w}
          height={leftZone.h}
          fill="none"
          stroke={pal.gridDot}
          strokeWidth="0.9"
        />
        <text x={leftZone.x + 10} y={leftZone.y + 16} fill={pal.unitTag} fontSize="9.5" fontWeight="bold" fontFamily="monospace">
          PLANTA GERAL DO PAVIMENTO ({activeFloor?.name ?? 'Térreo'})
        </text>

        <g clipPath="url(#leftViewportClip)">

        {/* Street label + Per-Edge Site Boundaries + Gate Openings */}
        {(() => {
          const normSite = normalizeSiteData(project.site);
          const boundarySegs = getLotBoundarySegments(normSite);
          const frontSeg = boundarySegs.find((s) => s.side === 'front');

          return (
            <g>
              {(sheetId === 'A01' || sheetId === 'A02') && frontSeg && (() => {
                const midX = (frontSeg.a.x + frontSeg.b.x) / 2;
                const midY = (frontSeg.a.y + frontSeg.b.y) / 2;
                const outX = -frontSeg.inwardNormal.x;
                const outY = -frontSeg.inwardNormal.y;
                const sx = mx(midX) + outX * 18;
                const sy = my(midY) + outY * 18;
                const isSideVert =
                  normSite.streetSide === 'esquerda' || normSite.streetSide === 'direita';
                return (
                  <text
                    x={sx}
                    y={sy}
                    textAnchor="middle"
                    transform={isSideVert ? `rotate(-90 ${sx} ${sy})` : undefined}
                    fill={pal.dimension}
                    fontSize="8.5"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    VIA PÚBLICA / RUA ({frontSeg.lengthM.toFixed(2)}m)
                  </text>
                );
              })()}

              {/* Lot polygon subtle fill */}
              <polygon
                points={project.site.vertices.map((v) => `${mx(v.x)},${my(v.y)}`).join(' ')}
                fill="none"
                stroke={pal.siteBound}
                strokeWidth="0.4"
                opacity={0.35}
              />

              {/* Individual Boundary Edges honoring murada / aberta / compartilhada / cerca */}
              {boundarySegs.map((seg) => {
                if (seg.lengthM < 0.1) return null;
                const ux = (seg.b.x - seg.a.x) / seg.lengthM;
                const uy = (seg.b.y - seg.a.y) / seg.lengthM;
                const gatesOnSeg = normSite.accesses
                  .filter((g) => g.enabled && g.side === seg.side)
                  .map((g) => {
                    const start = Math.max(0, Math.min(seg.lengthM - 0.3, g.offsetM));
                    const end = Math.min(seg.lengthM, start + Math.max(0.5, g.widthM));
                    return { gate: g, start, end };
                  })
                  .sort((a, b) => a.start - b.start);

                const spans: Array<[number, number]> = [];
                let cursor = 0;
                for (const gi of gatesOnSeg) {
                  if (gi.start > cursor + 0.05) spans.push([cursor, gi.start]);
                  cursor = Math.max(cursor, gi.end);
                }
                if (cursor < seg.lengthM - 0.05) spans.push([cursor, seg.lengthM]);

                const cond = seg.boundary.condition;
                const strokeW =
                  cond === 'murada' ? 2.1 : cond === 'compartilhada' ? 1.8 : cond === 'cerca' ? 1.2 : 0.9;
                const dash =
                  cond === 'compartilhada'
                    ? '7 2 2 2'
                    : cond === 'cerca'
                      ? '4 2.2'
                      : cond === 'aberta'
                        ? '2 3'
                        : undefined;

                return (
                  <g key={`cad-bound-${seg.side}`}>
                    {spans.map(([s0, s1], idx) => (
                      <line
                        key={idx}
                        x1={mx(seg.a.x + ux * s0)}
                        y1={my(seg.a.y + uy * s0)}
                        x2={mx(seg.a.x + ux * s1)}
                        y2={my(seg.a.y + uy * s1)}
                        stroke={pal.siteBound}
                        strokeWidth={strokeW}
                        strokeDasharray={dash}
                      />
                    ))}
                    {gatesOnSeg.map((gi) => {
                      const gw = getGateWorldPosition(normSite, gi.gate);
                      if (!gw) return null;
                      return (
                        <g key={gi.gate.id}>
                          <line
                            x1={mx(gw.p1.x)}
                            y1={my(gw.p1.y)}
                            x2={mx(gw.p2.x)}
                            y2={my(gw.p2.y)}
                            stroke={pal.doorLeaf}
                            strokeWidth="1.6"
                            strokeDasharray="2.2 1.2"
                          />
                          {(sheetId === 'A01' || sheetId === 'A02') && (
                            <text
                              x={mx(gw.center.x) + gw.inwardNormal.x * 9}
                              y={my(gw.center.y) + gw.inwardNormal.y * 9}
                              textAnchor="middle"
                              fill={pal.doorLeaf}
                              fontSize="6"
                              fontWeight="bold"
                              fontFamily="monospace"
                            >
                              {gi.gate.type === 'veiculo' ? 'VEÍC.' : 'PED.'}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* Setbacks */}
        {siteCheck.buildableBox.width > 0 && siteCheck.buildableBox.depth > 0 && (
          <rect
            x={mx(siteCheck.buildableBox.x)}
            y={my(siteCheck.buildableBox.y)}
            width={siteCheck.buildableBox.width * scale}
            height={siteCheck.buildableBox.depth * scale}
            fill="none"
            stroke={pal.setback}
            strokeDasharray="5 3"
            strokeWidth="0.95"
          />
        )}

        {/* Paisagismo, Pisos Externos, Piscina & Área Gourmet (A01 / A02) */}
        {(sheetId === 'A01' || sheetId === 'A02') && project.landscaping && (
          <g>
            {project.landscaping.surfaceZones.map((z) => {
              const meta = getExteriorSurfaceMeta(z.surfaceType);
              return (
                <rect
                  key={z.id}
                  x={mx(z.x)}
                  y={my(z.y)}
                  width={z.width * scale}
                  height={z.depth * scale}
                  fill={meta.colorHex}
                  fillOpacity={0.22}
                  stroke={meta.colorHex}
                  strokeWidth="0.7"
                  strokeDasharray="3 2"
                />
              );
            })}
            {project.landscaping.pools.map((p) => (
              <g key={p.id}>
                <rect
                  x={mx(p.x)}
                  y={my(p.y)}
                  width={p.width * scale}
                  height={p.depth * scale}
                  fill="#0ea5e9"
                  fillOpacity={0.3}
                  stroke="#0284c7"
                  strokeWidth="1.2"
                />
                <text
                  x={mx(p.x + p.width / 2)}
                  y={my(p.y + p.depth / 2) + 2}
                  textAnchor="middle"
                  fill="#0284c7"
                  fontSize="6"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  PISCINA
                </text>
              </g>
            ))}
            {project.landscaping.gourmetAreas.map((g) => (
              <g key={g.id}>
                <rect
                  x={mx(g.x)}
                  y={my(g.y)}
                  width={g.width * scale}
                  height={g.depth * scale}
                  fill="#b45309"
                  fillOpacity={0.18}
                  stroke="#b45309"
                  strokeWidth="1.0"
                />
                <text
                  x={mx(g.x + g.width / 2)}
                  y={my(g.y + g.depth / 2) + 2}
                  textAnchor="middle"
                  fill="#d97706"
                  fontSize="5.5"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  GOURMET
                </text>
              </g>
            ))}
            {project.landscaping.plants.map((pl) => {
              const meta = getBotanicalMeta(pl.speciesId);
              const r = Math.max(2.5, (meta.canopyDiameterM / 2) * pl.scale * scale);
              return (
                <g key={pl.id}>
                  <circle
                    cx={mx(pl.x)}
                    cy={my(pl.y)}
                    r={r}
                    fill={meta.foliageHex}
                    fillOpacity={0.28}
                    stroke={meta.foliageHex}
                    strokeWidth="0.7"
                  />
                  <circle cx={mx(pl.x)} cy={my(pl.y)} r={1.2} fill={meta.foliageHex} />
                </g>
              );
            })}
          </g>
        )}

        {/* Structural Grid Axes with Bubbles */}
        {footprint.hasUnits && (
          <g>
            {footprint.xAxes.map((ax, i) => (
              <g key={`ax-${i}`}>
                <line
                  x1={mx(ax)}
                  y1={my(footprint.minY - 1.0)}
                  x2={mx(ax)}
                  y2={my(footprint.maxY + 1.0)}
                  stroke={pal.axisLine}
                  strokeDasharray="6 2 1.5 2"
                  strokeWidth="0.6"
                  opacity="0.65"
                />
                <circle
                  cx={mx(ax)}
                  cy={my(footprint.minY - 1.3)}
                  r={6.5}
                  fill={pal.axisBubbleFill}
                  stroke={pal.axisBubbleStroke}
                  strokeWidth="0.9"
                />
                <text
                  x={mx(ax)}
                  y={my(footprint.minY - 1.3) + 2.5}
                  textAnchor="middle"
                  fill={pal.axisText}
                  fontSize="6.5"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {i + 1}
                </text>
              </g>
            ))}
            {footprint.yAxes.map((ay, i) => {
              const lbl = String.fromCharCode(65 + (i % 26));
              return (
                <g key={`ay-${i}`}>
                  <line
                    x1={mx(footprint.minX - 1.0)}
                    y1={my(ay)}
                    x2={mx(footprint.maxX + 1.0)}
                    y2={my(ay)}
                    stroke={pal.axisLine}
                    strokeDasharray="6 2 1.5 2"
                    strokeWidth="0.6"
                    opacity="0.65"
                  />
                  <circle
                    cx={mx(footprint.minX - 1.3)}
                    cy={my(ay)}
                    r={6.5}
                    fill={pal.axisBubbleFill}
                    stroke={pal.axisBubbleStroke}
                    strokeWidth="0.9"
                  />
                  <text
                    x={mx(footprint.minX - 1.3)}
                    y={my(ay) + 2.5}
                    textAnchor="middle"
                    fill={pal.axisText}
                    fontSize="6.5"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    {lbl}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* Building Units CAD Double-Line Geometry */}
        {activeFloor?.units.map((inst) => {
          const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
          if (!ut) return null;
          const qdcLocal = getQdcPosition(ut);
          const qdcPt = unitLocalToWorld(inst, ut, qdcLocal.x, qdcLocal.y);

          return (
            <g key={inst.id}>
              {/* Double-Line Walls with masonry / drywall hatch */}
              {!showRoof &&
                ut.walls.map((wall) => {
                  const isDrywall =
                    !wall.isExternal && wall.material.toLowerCase().includes('drywall');
                  const spans = splitWallByOpenings(wall, ut.openings);
                  return spans.map((sp, sIdx) => {
                    const p0 = unitLocalToWorld(
                      inst,
                      ut,
                      wall.start.x + (wall.end.x - wall.start.x) * sp.t0,
                      wall.start.y + (wall.end.y - wall.start.y) * sp.t0,
                    );
                    const p1 = unitLocalToWorld(
                      inst,
                      ut,
                      wall.start.x + (wall.end.x - wall.start.x) * sp.t1,
                      wall.start.y + (wall.end.y - wall.start.y) * sp.t1,
                    );
                    const quad = getWallQuadWorld(p0, p1, wall.thickness);
                    return (
                      <polygon
                        key={`${wall.id}-${sIdx}`}
                        points={quad.map((q) => `${mx(q.x)},${my(q.y)}`).join(' ')}
                        fill={isDrywall ? 'url(#cadDrywallHatch)' : 'url(#cadMasonryHatch)'}
                        stroke={wall.isExternal ? pal.wallExtStroke : pal.wallIntStroke}
                        strokeWidth={wall.isExternal ? 1.3 : isDrywall ? 0.75 : 0.85}
                        strokeDasharray={isDrywall ? '2.5 1.2' : undefined}
                      />
                    );
                  });
                })}

              {/* Mezzanine dashed perimeter projection (never counted as a floor) */}
              {!showRoof &&
                ut.hasMezzanine &&
                ut.mezzanine?.enabled &&
                ut.ceilingHeight >= 3.0 &&
                (() => {
                  const mezRoom = ut.rooms.find((r) => r.category === 'mezanino');
                  if (!mezRoom) return null;
                  const mp0 = unitLocalToWorld(inst, ut, mezRoom.x, mezRoom.y);
                  const mp1 = unitLocalToWorld(inst, ut, mezRoom.x + mezRoom.width, mezRoom.y);
                  const mp2 = unitLocalToWorld(inst, ut, mezRoom.x + mezRoom.width, mezRoom.y + mezRoom.depth);
                  const mp3 = unitLocalToWorld(inst, ut, mezRoom.x, mezRoom.y + mezRoom.depth);
                  return (
                    <polygon
                      points={`${mx(mp0.x)},${my(mp0.y)} ${mx(mp1.x)},${my(mp1.y)} ${mx(mp2.x)},${my(mp2.y)} ${mx(mp3.x)},${my(mp3.y)}`}
                      fill={pal.unitTag}
                      fillOpacity={0.06}
                      stroke={pal.unitTag}
                      strokeDasharray="3.5 2"
                      strokeWidth="0.8"
                    />
                  );
                })()}

              {/* Door 90° Swing Arcs, Sliding & Vitrô Glazing */}
              {!showRoof &&
                ut.openings.map((op) => {
                  const wall = ut.walls.find((w) => w.id === op.wallId);
                  if (!wall) return null;
                  const pos = getOpeningWorldPosition(wall, op);
                  const wallLen = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) || 1;
                  const ux = (wall.end.x - wall.start.x) / wallLen;
                  const uy = (wall.end.y - wall.start.y) / wallLen;
                  const pa = unitLocalToWorld(inst, ut, pos.center.x - ux * (op.width / 2), pos.center.y - uy * (op.width / 2));
                  const pb = unitLocalToWorld(inst, ut, pos.center.x + ux * (op.width / 2), pos.center.y + uy * (op.width / 2));

                  if (op.type === 'porta') {
                    if (op.openingKind === 'porta_correr') {
                      const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
                      return (
                        <g key={op.id}>
                          <line x1={mx(pa.x)} y1={my(pa.y)} x2={mx(mid.x)} y2={my(mid.y)} stroke={pal.doorLeaf} strokeWidth="1.5" />
                          <line x1={mx(mid.x)} y1={my(mid.y) + 1.5} x2={mx(pb.x)} y2={my(pb.y) + 1.5} stroke={pal.doorSwing} strokeWidth="1" />
                        </g>
                      );
                    }
                    const vx = pb.x - pa.x;
                    const vy = pb.y - pa.y;
                    const tip = { x: pa.x - vy, y: pa.y + vx };
                    const rPx = Math.hypot(mx(pb.x) - mx(pa.x), my(pb.y) - my(pa.y));
                    return (
                      <g key={op.id}>
                        <line x1={mx(pa.x)} y1={my(pa.y)} x2={mx(tip.x)} y2={my(tip.y)} stroke={pal.doorLeaf} strokeWidth="1.15" />
                        <path
                          d={`M ${mx(pb.x)} ${my(pb.y)} A ${rPx} ${rPx} 0 0 1 ${mx(tip.x)} ${my(tip.y)}`}
                          fill="none"
                          stroke={pal.doorSwing}
                          strokeDasharray="2.5 2"
                          strokeWidth="0.7"
                        />
                      </g>
                    );
                  }

                  const isVitro =
                    op.openingKind?.startsWith('vitro_') ||
                    op.subtype.toLowerCase().includes('basculante') ||
                    op.subtype.toLowerCase().includes('vitr');
                  const quad = getWallQuadWorld(pa, pb, wall.thickness * 0.72);
                  return (
                    <g key={op.id}>
                      <polygon points={quad.map((q) => `${mx(q.x)},${my(q.y)}`).join(' ')} fill={pal.bg} stroke={pal.windowFrame} strokeWidth="0.85" />
                      <line x1={mx(pa.x)} y1={my(pa.y)} x2={mx(pb.x)} y2={my(pb.y)} stroke={pal.windowGlass} strokeWidth="1" />
                      {isVitro && (
                        <line
                          x1={mx(pa.x)}
                          y1={my(pa.y) + 1.5}
                          x2={mx(pb.x)}
                          y2={my(pb.y) + 1.5}
                          stroke={pal.windowFrame}
                          strokeWidth="0.6"
                          strokeDasharray="1.8 1"
                        />
                      )}
                    </g>
                  );
                })}

              {/* Detailed Architectural Furniture Blocks via Affine Matrix Transform */}
              {showFurniture &&
                (() => {
                  const o = unitLocalToWorld(inst, ut, 0, 0);
                  const oxPt = unitLocalToWorld(inst, ut, 1, 0);
                  const oyPt = unitLocalToWorld(inst, ut, 0, 1);
                  const a = mx(oxPt.x) - mx(o.x);
                  const b = my(oxPt.y) - my(o.y);
                  const c = mx(oyPt.x) - mx(o.x);
                  const d = my(oyPt.y) - my(o.y);
                  const e = mx(o.x);
                  const fMat = my(o.y);
                  return (
                    <g transform={`matrix(${a} ${b} ${c} ${d} ${e} ${fMat})`}>
                      {ut.furniture.map((fur) => {
                        const r = getFurnitureWorldRect(fur);
                        return (
                          <FurnitureCadBlock
                            key={fur.id}
                            category={fur.category}
                            x={r.x}
                            y={r.y}
                            width={r.width}
                            depth={r.depth}
                            stroke={pal.furniture}
                            fill="none"
                            accent={pal.windowGlass}
                            strokeWidth={0.032}
                            detailed={scale >= 12}
                            stairSpec={fur.stairSpec}
                          />
                        );
                      })}
                    </g>
                  );
                })()}

              {/* NBR 9050 Turning Circle on A13 */}
              {sheetId === 'A13' &&
                (() => {
                  const cp = unitLocalToWorld(inst, ut, ut.width * 0.5, ut.depth * 0.5);
                  return (
                    <circle
                      cx={mx(cp.x)}
                      cy={my(cp.y)}
                      r={0.75 * scale}
                      fill="none"
                      stroke={pal.rainwater}
                      strokeDasharray="3 2"
                      strokeWidth="1.1"
                    />
                  );
                })()}

              {/* Electrical Shortest-Path Conduits + Symbols */}
              {showElectrical && (() => {
                const elRt = computeElectricalRouting(ut);
                return (
                  <g>
                    {elRt.segments
                      .filter((s) => s.kind === 'electrical')
                      .map((seg) => {
                        const wFrom = unitLocalToWorld(inst, ut, seg.from.x, seg.from.y);
                        const wTo = unitLocalToWorld(inst, ut, seg.to.x, seg.to.y);
                        const wElbow = seg.elbow ? unitLocalToWorld(inst, ut, seg.elbow.x, seg.elbow.y) : null;
                        const pts = wElbow
                          ? `${mx(wFrom.x)},${my(wFrom.y)} ${mx(wElbow.x)},${my(wElbow.y)} ${mx(wTo.x)},${my(wTo.y)}`
                          : `${mx(wFrom.x)},${my(wFrom.y)} ${mx(wTo.x)},${my(wTo.y)}`;
                        return (
                          <polyline
                            key={`fp-el-rt-${seg.id}`}
                            points={pts}
                            fill="none"
                            stroke={pal.electric}
                            strokeWidth="0.7"
                            strokeDasharray="2.5 2"
                            opacity="0.72"
                          />
                        );
                      })}
                    <ElectricalSymbolSvg category="quadro_luz" cx={mx(qdcPt.x)} cy={my(qdcPt.y)} r={3.6} color={pal.electric} bg={pal.bg} />
                    {ut.electricalPoints
                      .filter((ep) => !isSpecialCategory(ep.category) && ep.category !== 'quadro_luz' && !ep.code.toUpperCase().startsWith('QDC'))
                      .map((ep) => {
                        const p = unitLocalToWorld(inst, ut, ep.x, ep.y);
                        return (
                          <ElectricalSymbolSvg key={ep.id} category={ep.category} cx={mx(p.x)} cy={my(p.y)} r={2.8} color={pal.electric} bg={pal.bg} />
                        );
                      })}
                  </g>
                );
              })()}

              {/* Special Installations (CFTV, Wi-Fi, Dados, Antena TV, Interfone) */}
              {showSpecials &&
                ut.electricalPoints
                  .filter((ep) => isSpecialCategory(ep.category))
                  .map((ep) => {
                    const p = unitLocalToWorld(inst, ut, ep.x, ep.y);
                    return (
                      <ElectricalSymbolSvg
                        key={ep.id}
                        category={ep.category}
                        cx={mx(p.x)}
                        cy={my(p.y)}
                        r={3.0}
                        color={specialStroke}
                        bg={pal.bg}
                      />
                    );
                  })}

              {/* Hydraulic Water Pipelines (Shortest-Path MST from Wet Riser) */}
              {showWater && (() => {
                const hydRt = computeHydraulicRouting(ut);
                const wRiser = unitLocalToWorld(inst, ut, hydRt.riser.x, hydRt.riser.y);
                return (
                  <g>
                    {hydRt.segments.map((seg) => {
                      const col = seg.kind === 'hot_water' ? pal.hotWater : pal.coldWater;
                      const wFrom = unitLocalToWorld(inst, ut, seg.from.x, seg.from.y);
                      const wTo = unitLocalToWorld(inst, ut, seg.to.x, seg.to.y);
                      const wElbow = seg.elbow ? unitLocalToWorld(inst, ut, seg.elbow.x, seg.elbow.y) : null;
                      const pts = wElbow
                        ? `${mx(wFrom.x)},${my(wFrom.y)} ${mx(wElbow.x)},${my(wElbow.y)} ${mx(wTo.x)},${my(wTo.y)}`
                        : `${mx(wFrom.x)},${my(wFrom.y)} ${mx(wTo.x)},${my(wTo.y)}`;
                      return (
                        <polyline
                          key={`fp-hyd-rt-${seg.id}`}
                          points={pts}
                          fill="none"
                          stroke={col}
                          strokeWidth="0.95"
                          strokeDasharray={seg.kind === 'hot_water' ? '2.5 1.5' : undefined}
                        />
                      );
                    })}
                    <circle cx={mx(wRiser.x)} cy={my(wRiser.y)} r={2.8} fill={pal.coldWater} stroke={pal.bg} strokeWidth="0.6" />
                    {ut.waterPoints.map((wp) => {
                      const p = unitLocalToWorld(inst, ut, wp.x, wp.y);
                      const col = wp.waterType === 'quente' ? pal.hotWater : pal.coldWater;
                      return <circle key={wp.id} cx={mx(p.x)} cy={my(p.y)} r={2.4} fill={col} />;
                    })}
                  </g>
                );
              })()}

              {/* Sanitary Drainage Network */}
              {showDrain &&
                (() => {
                  const dpMap = new Map(ut.drainagePoints.map((d) => [d.id, d]));
                  return ut.drainagePoints.map((dp) => {
                    const p = unitLocalToWorld(inst, ut, dp.x, dp.y);
                    const target = dp.connectedToId ? dpMap.get(dp.connectedToId) : undefined;
                    const pt = target ? unitLocalToWorld(inst, ut, target.x, target.y) : null;
                    return (
                      <g key={dp.id}>
                        {pt && (
                          <line
                            x1={mx(p.x)}
                            y1={my(p.y)}
                            x2={mx(pt.x)}
                            y2={my(pt.y)}
                            stroke={pal.sanitary}
                            strokeWidth="1.1"
                            strokeDasharray={dp.category === 'ventilacao' ? '3 1.5' : undefined}
                          />
                        )}
                        <circle cx={mx(p.x)} cy={my(p.y)} r={2.2} fill={pal.sanitary} />
                      </g>
                    );
                  });
                })()}

              {/* Room Tags (shown cleanly only on single-unit closeups so multi-unit floor plans stay legible) */}
              {!showRoof &&
                (activeFloor?.units.length ?? 0) <= 1 &&
                ut.rooms.map((r) => {
                  const rp = unitLocalToWorld(inst, ut, r.x + r.width / 2, r.y + r.depth / 2);
                  return (
                    <text
                      key={r.id}
                      x={mx(rp.x)}
                      y={my(rp.y)}
                      textAnchor="middle"
                      fill={pal.roomText}
                      fontSize="5.2"
                      fontFamily="monospace"
                    >
                      {r.code} ({getRoomArea(r)}m²)
                    </text>
                  );
                })}

              {/* Unit Tag w/ crisp backing pill */}
              {(() => {
                const tp = unitLocalToWorld(inst, ut, ut.width * 0.5, ut.depth * 0.58);
                return (
                  <g>
                    <rect
                      x={mx(tp.x) - 11}
                      y={my(tp.y) - 6.5}
                      width={22}
                      height={10}
                      rx={2}
                      fill={pal.bg}
                      fillOpacity={0.86}
                      stroke={pal.unitTag}
                      strokeWidth="0.5"
                    />
                    <text
                      x={mx(tp.x)}
                      y={my(tp.y) + 1}
                      textAnchor="middle"
                      fill={pal.unitTag}
                      fontSize="6.2"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {inst.unitNumber}
                    </text>
                  </g>
                );
              })()}
            </g>
          );
        })}

        {/* Shared Geminated Party Walls Highlight (A01 / A02 / A03) */}
        {(sheetId === 'A01' || sheetId === 'A02' || sheetId === 'A03') &&
          activeFloor &&
          (() => {
            const { sharedWalls } = detectSharedWallsAndGaps(activeFloor.units, project.unitTypes);
            return sharedWalls.map((sw) => (
              <g key={sw.id}>
                <line
                  x1={mx(sw.p1.x)}
                  y1={my(sw.p1.y)}
                  x2={mx(sw.p2.x)}
                  y2={my(sw.p2.y)}
                  stroke={pal.setback}
                  strokeWidth="2.4"
                  opacity={0.9}
                />
              </g>
            ));
          })()}

        {/* Common Area Corridor CFTV Cameras on E06 */}
        {showSpecials && footprint.hasUnits && (
          <g>
            <ElectricalSymbolSvg
              category="cftv"
              cx={mx((footprint.minX + footprint.maxX) / 2)}
              cy={my(footprint.minY + 0.6)}
              r={3.8}
              color={specialCftvCorridor}
              bg={pal.bg}
            />
            <ElectricalSymbolSvg
              category="cftv"
              cx={mx((footprint.minX + footprint.maxX) / 2)}
              cy={my(footprint.maxY - 0.6)}
              r={3.8}
              color={specialCftvCorridor}
              bg={pal.bg}
            />
          </g>
        )}

        {/* Roof Projection on A05 / H05 */}
        {showRoof && footprint.hasUnits && (
          <g>
            <rect
              x={mx(footprint.minX - 0.35)}
              y={my(footprint.minY - 0.35)}
              width={(footprint.width + 0.7) * scale}
              height={(footprint.depth + 0.7) * scale}
              fill={pal.slabFill}
              fillOpacity={0.35}
              stroke={pal.wallExtStroke}
              strokeWidth="1.6"
            />
            <line
              x1={mx(footprint.minX - 0.35)}
              y1={my((footprint.minY + footprint.maxY) / 2)}
              x2={mx(footprint.maxX + 0.35)}
              y2={my((footprint.minY + footprint.maxY) / 2)}
              stroke={pal.axisLine}
              strokeWidth="1.3"
            />
            <text
              x={mx((footprint.minX + footprint.maxX) / 2)}
              y={my((footprint.minY + footprint.maxY) / 2) - 8}
              textAnchor="middle"
              fill={pal.unitTag}
              fontSize="8"
              fontFamily="monospace"
            >
              CUMEEIRA · CAIMENTO i={project.constructionMethod.roofSlopePercent}% ↓↑
            </text>
          </g>
        )}

        {/* Structural Pillars on S01 */}
        {sheetId === 'S01' &&
          project.structuralElements.map((s) => (
            <rect
              key={s.id}
              x={mx(s.x)}
              y={my(s.y)}
              width={Math.max(4, s.width * scale)}
              height={Math.max(4, s.depth * scale)}
              fill={pal.structure}
            />
          ))}

        {/* Fire Safety Overlay on I01 */}
        {sheetId === 'I01' && footprint.hasUnits && (
          <g>
            <line
              x1={mx((footprint.minX + footprint.maxX) / 2)}
              y1={my(footprint.minY + 0.5)}
              x2={mx((footprint.minX + footprint.maxX) / 2)}
              y2={my(siteBBox.maxY)}
              stroke={pal.fire}
              strokeWidth="1.6"
              strokeDasharray="5 3"
            />
            <text
              x={mx((footprint.minX + footprint.maxX) / 2) + 8}
              y={my(footprint.maxY) + 12}
              fill={pal.fire}
              fontSize="7.5"
              fontFamily="monospace"
            >
              ROTA DE FUGA / SAÍDA ↓
            </text>
          </g>
        )}

        {/* Exterior Architectural Dimension Chains */}
        {footprint.hasUnits && (
          <g>
            <line x1={mx(footprint.minX)} y1={my(footprint.maxY) + 12} x2={mx(footprint.maxX)} y2={my(footprint.maxY) + 12} stroke={pal.dimension} strokeWidth="0.9" />
            <text x={mx((footprint.minX + footprint.maxX) / 2)} y={my(footprint.maxY) + 9} textAnchor="middle" fill={pal.dimension} fontSize="7.5" fontFamily="monospace">
              {footprint.width.toFixed(2)} m
            </text>
            <line x1={mx(footprint.maxX) + 12} y1={my(footprint.minY)} x2={mx(footprint.maxX) + 12} y2={my(footprint.maxY)} stroke={pal.dimension} strokeWidth="0.9" />
            <text x={mx(footprint.maxX) + 16} y={my((footprint.minY + footprint.maxY) / 2)} fill={pal.dimension} fontSize="7.5" fontFamily="monospace">
              {footprint.depth.toFixed(2)} m
            </text>
          </g>
        )}
        </g>

        {/* North Arrow + Graphic Scale */}
        <g transform={`translate(${leftZone.x + leftZone.w - 28}, ${leftZone.y + 32}) rotate(${project.site.orientationDeg})`}>
          <circle cx="0" cy="0" r="11" fill="none" stroke={pal.dimension} strokeWidth="0.9" />
          <polygon points="0,-9 -3.5,4 0,1.5 3.5,4" fill={pal.axisLine} />
          <text x="0" y="-13" textAnchor="middle" fill={pal.axisText} fontSize="7" fontWeight="bold">
            N
          </text>
        </g>
        <GraphicScaleBar x={leftZone.x + 14} y={leftZone.y + leftZone.h - 22} pxPerMeter={scale} pal={pal} />

        {/* Right Zone: 1:25 Unit Enlargement + Executive Legend */}
        {isPlanWithUnitZoom && enlargedUt && renderEnlargedUnitPanel(enlargedUt)}
        {renderLegendPanel()}

        {/* Empty Building Guidance */}
        {(!activeFloor || activeFloor.units.length === 0) && (
          <text
            x={leftZone.x + leftZone.w / 2}
            y={leftZone.y + leftZone.h / 2}
            textAnchor="middle"
            fill={pal.dimension}
            fontSize="10.5"
            fontFamily="monospace"
          >
            Adicione tipologias e posicione unidades no pavimento para plotagem executiva.
          </text>
        )}
      </SheetFrame>
    </div>
  );
};
