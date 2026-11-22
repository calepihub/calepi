import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import JSZip from 'jszip';
import {
  analyzeSiteGeometry,
  getBoundingBox,
  getOpeningWorldPosition,
  getRoomArea,
  round2,
} from './geometry';
import {
  buildElevationData,
  buildJoinerySchedule,
  computeFloorFootprint,
  getWallQuadWorld,
  splitWallByOpenings,
  unitLocalToWorld,
} from './cadDrawings';
import {
  calculateDrainageSizing,
  calculateElectricalSizing,
  calculateHydraulicSizing,
  runCompatibilityAnalysis,
} from './engineering';
import {
  buildConstructionSchedule,
  calculateAnalyticalBreakdown,
  calculateBudgetSummary,
  calculateQuantities,
} from './quantitiesAndBudget';
import { generateAllMemorials } from './memorialGenerator';
import type { Project, UnitType } from '../types/project';

export interface SheetDefinition {
  id: string;
  discipline:
    | 'Arquitetura'
    | 'Renderização'
    | 'Elétrica'
    | 'Hidráulica e Sanitária'
    | 'Estrutura'
    | 'Incêndio';
  title: string;
  scale: string;
  description: string;
}

export const TECHNICAL_SHEETS: SheetDefinition[] = [
  { id: 'R01', discipline: 'Renderização', title: 'Projeto Executivo Renderizado (Perspectivas 3D)', scale: 'S/ESC', description: 'Prancha de apresentação com perspectivas fotorrealistas salvas, paleta de acabamentos PBR e resumo técnico' },
  { id: 'A01', discipline: 'Arquitetura', title: 'Situação e Localização', scale: '1:500', description: 'Terreno, confrontações, via pública, norte geográfico e inserção urbana' },
  { id: 'A02', discipline: 'Arquitetura', title: 'Implantação e Recuos', scale: '1:100', description: 'Perímetro do terreno, recuos obrigatórios, projeção dos pavimentos e taxa de ocupação' },
  { id: 'A03', discipline: 'Arquitetura', title: 'Plantas Baixas dos Pavimentos', scale: '1:50', description: 'Paredes duplas com hachura, portas com arco de giro, janelas, eixos e cotas executivas' },
  { id: 'A04', discipline: 'Arquitetura', title: 'Planta de Layout e Mobiliário', scale: '1:50', description: 'Layout humanizado com mobiliário dimensionado, louças e fluxos' },
  { id: 'A05', discipline: 'Arquitetura', title: 'Planta de Cobertura', scale: '1:100', description: 'Águas da cobertura, sentido de caimento, calhas, descidas AP e platibandas' },
  { id: 'A06', discipline: 'Arquitetura', title: 'Plantas de Cotas e Níveis', scale: '1:50', description: 'Cotas externas encadeadas, eixos estruturais, níveis acabados e cotas de peitoril' },
  { id: 'A07', discipline: 'Arquitetura', title: 'Quadro de Esquadrias Ilustrado', scale: 'S/ESC', description: 'Elevações esquemáticas cotadas de portas e janelas, materiais e quantitativos' },
  { id: 'A08', discipline: 'Arquitetura', title: 'Fachadas (Frontal e Lateral)', scale: '1:75', description: 'Elevações externas paramétricas com alturas de pavimentos, platibanda e esquadrias' },
  { id: 'A09', discipline: 'Arquitetura', title: 'Cortes Esquemáticos (AA / BB)', scale: '1:75', description: 'Cortes longitudinais e transversais com pé-direito, lajes hachuradas e níveis' },
  { id: 'A10', discipline: 'Arquitetura', title: 'Detalhes Construtivos', scale: '1:20', description: 'Seção típica de parede, viga baldrame, vergas, contravergas e platibanda' },
  { id: 'A11', discipline: 'Arquitetura', title: 'Detalhes de Áreas Molhadas', scale: '1:25', description: 'Banheiro, cozinha e área de serviço com impermeabilização e shaft' },
  { id: 'A12', discipline: 'Arquitetura', title: 'Quadro Geral de Áreas', scale: 'S/ESC', description: 'Áreas privativas por tipologia, área comum, TO e CA' },
  { id: 'A13', discipline: 'Arquitetura', title: 'Acessibilidade (ABNT NBR 9050)', scale: '1:50', description: 'Rotas acessíveis, vãos de portas e módulos de manobra Ø1,50m' },
  { id: 'E01', discipline: 'Elétrica', title: 'Planta de Iluminação', scale: '1:50', description: 'Pontos de teto, arandelas, interruptores e eletrodutos de comando' },
  { id: 'E02', discipline: 'Elétrica', title: 'Planta de Tomadas e Pontos de Força', scale: '1:50', description: 'Tomadas baixas, médias, altas e TUE com alturas Z e circuitos' },
  { id: 'E03', discipline: 'Elétrica', title: 'Planta de Circuitos e Eletrodutos', scale: '1:50', description: 'Caminhamento paramétrico de eletrodutos até o QDC por circuito' },
  { id: 'E04', discipline: 'Elétrica', title: 'Quadro de Cargas e Circuitos', scale: 'S/ESC', description: 'Potência instalada, corrente, disjuntores e condutores' },
  { id: 'E05', discipline: 'Elétrica', title: 'Diagrama Unifilar', scale: 'S/ESC', description: 'Esquema unifilar de distribuição por unidade (DR, disjuntor geral e ramais)' },
  { id: 'E06', discipline: 'Elétrica', title: 'Instalações Especiais: CFTV, Antena/TV & Internet/Dados', scale: '1:50', description: 'Câmeras IP CFTV, Rack TI 12U, pontos RJ45 Cat6, Wi-Fi 6 AP, Antena Coletiva UHF e Interfonia' },
  { id: 'H01', discipline: 'Hidráulica e Sanitária', title: 'Planta de Água Fria', scale: '1:50', description: 'Pontos AF, ramais, diâmetros, colunas e reservação' },
  { id: 'H02', discipline: 'Hidráulica e Sanitária', title: 'Planta de Água Quente', scale: '1:50', description: 'Pontos AQ, material CPVC/PPR e sistema de aquecimento' },
  { id: 'H03', discipline: 'Hidráulica e Sanitária', title: 'Planta de Esgoto Sanitário', scale: '1:50', description: 'Ramais, caixas sifonadas, gordura, TQ e declividades' },
  { id: 'H04', discipline: 'Hidráulica e Sanitária', title: 'Planta de Ventilação Sanitária', scale: '1:50', description: 'Colunas e ramais de ventilação sanitária' },
  { id: 'H05', discipline: 'Hidráulica e Sanitária', title: 'Planta de Águas Pluviais', scale: '1:100', description: 'Captação, calhas e tubos de descida' },
  { id: 'H06', discipline: 'Hidráulica e Sanitária', title: 'Esquema Vertical Hidrossanitário', scale: '1:25', description: 'Esquema vertical de colunas AF/AQ e tubo de queda sanitário' },
  { id: 'S01', discipline: 'Estrutura', title: 'Lançamento Estrutural Conceitual', scale: '1:75', description: 'Locação conceitual de pilares, vigas, lajes e eixos (não dimensionado)' },
  { id: 'I01', discipline: 'Incêndio', title: 'Planta Preliminar de Prevenção a Incêndio', scale: '1:100', description: 'Rotas de fuga, extintores, iluminação de emergência e sinalização preliminar' },
];

export const EXPORT_CAPABILITIES = [
  { format: 'PDF (.pdf)', status: 'IMPLEMENTADO', scope: 'Pranchas técnicas CAD com paredes duplas, cotas, fachadas, cortes, R01 renderizada e carimbo' },
  { format: 'DOCX (.docx)', status: 'IMPLEMENTADO', scope: 'Memoriais descritivos editáveis e especificações por ambiente' },
  { format: 'XLSX (.xlsx)', status: 'IMPLEMENTADO', scope: 'Quantitativos, orçamento analítico com códigos SINAPI-RJ, quadro de cargas e pontos MEP' },
  { format: 'DXF (.dxf)', status: 'IMPLEMENTADO', scope: 'Geometria vetorial AutoCAD (LWPOLYLINE paredes duplas, ARC portas, CIRCLE eixos/pontos, layers)' },
  { format: 'JSON (.json)', status: 'IMPLEMENTADO', scope: 'Backup integral paramétrico, revisões, renders e configurações' },
  { format: 'PNG (.png)', status: 'IMPLEMENTADO', scope: 'Capturas do estúdio de renderização 3D arquitetônica incorporadas à R01 e ZIP' },
  { format: 'ZIP Completo (.zip)', status: 'IMPLEMENTADO', scope: 'Pacote completo organizado nas pastas 01 a 12' },
  { format: 'IFC (.ifc)', status: 'NÃO IMPLEMENTADO (Exige esquema IFC STEP completo)', scope: 'Requer serializador STEP/IFC certificado para evitar arquivos inválidos' },
  { format: 'DWG (.dwg)', status: 'NÃO IMPLEMENTADO (Formato proprietário)', scope: 'Use o arquivo DXF gerado para abertura direta no AutoCAD/BricsCAD/LibreCAD sem perda de geometria' },
];

// ============================================================================
// 1. JSON BACKUP
// ============================================================================
export function generateProjectJSON(project: Project): string {
  return JSON.stringify(project, null, 2);
}

// ============================================================================
// 2. AUTOCAD ASCII DXF EXPORTER (LWPOLYLINE double walls, ARC swings, CIRCLEs)
// ============================================================================
function dxfLine(x1: number, y1: number, x2: number, y2: number, layer: string): string {
  return [
    '0',
    'LINE',
    '8',
    layer,
    '10',
    x1.toFixed(4),
    '20',
    y1.toFixed(4),
    '30',
    '0.0',
    '11',
    x2.toFixed(4),
    '21',
    y2.toFixed(4),
    '31',
    '0.0',
  ].join('\n');
}

function dxfClosedPoly(pts: Array<{ x: number; y: number }>, layer: string): string {
  const lines = [
    '0',
    'LWPOLYLINE',
    '8',
    layer,
    '90',
    String(pts.length),
    '70',
    '1',
  ];
  for (const p of pts) {
    lines.push('10', p.x.toFixed(4), '20', p.y.toFixed(4));
  }
  return lines.join('\n');
}

function dxfCircle(cx: number, cy: number, radius: number, layer: string): string {
  return [
    '0',
    'CIRCLE',
    '8',
    layer,
    '10',
    cx.toFixed(4),
    '20',
    cy.toFixed(4),
    '30',
    '0.0',
    '40',
    radius.toFixed(4),
  ].join('\n');
}

function dxfArc(
  cx: number,
  cy: number,
  radius: number,
  startAngleDeg: number,
  endAngleDeg: number,
  layer: string,
): string {
  return [
    '0',
    'ARC',
    '8',
    layer,
    '10',
    cx.toFixed(4),
    '20',
    cy.toFixed(4),
    '30',
    '0.0',
    '40',
    radius.toFixed(4),
    '50',
    startAngleDeg.toFixed(2),
    '51',
    endAngleDeg.toFixed(2),
  ].join('\n');
}

function dxfText(x: number, y: number, height: number, text: string, layer: string): string {
  return [
    '0',
    'TEXT',
    '8',
    layer,
    '10',
    x.toFixed(4),
    '20',
    y.toFixed(4),
    '30',
    '0.0',
    '40',
    height.toFixed(3),
    '1',
    text.replace(/\n/g, ' '),
  ].join('\n');
}

export function generateProjectDXF(project: Project, floorIndex = 0): string {
  const entities: string[] = [];
  const verts = project.site.vertices;

  // Site boundary (closed LWPOLYLINE)
  if (verts.length >= 3) {
    entities.push(dxfClosedPoly(verts, 'TERRENO'));
  }

  // Buildable box
  const siteCheck = analyzeSiteGeometry(project.site);
  const bx = siteCheck.buildableBox;
  if (bx.width > 0 && bx.depth > 0) {
    entities.push(
      dxfClosedPoly(
        [
          { x: bx.x, y: bx.y },
          { x: bx.x + bx.width, y: bx.y },
          { x: bx.x + bx.width, y: bx.y + bx.depth },
          { x: bx.x, y: bx.y + bx.depth },
        ],
        'RECUOS',
      ),
    );
  }

  const floor = project.floors[floorIndex] ?? project.floors[0];
  const footprint = computeFloorFootprint(project, floor);

  // Structural axes
  if (footprint.hasUnits) {
    footprint.xAxes.forEach((ax, i) => {
      entities.push(dxfLine(ax, footprint.minY - 1.2, ax, footprint.maxY + 1.2, 'EIXOS'));
      entities.push(dxfCircle(ax, footprint.minY - 1.55, 0.32, 'EIXOS'));
      entities.push(dxfText(ax - 0.1, footprint.minY - 1.65, 0.22, String(i + 1), 'EIXOS'));
    });
    footprint.yAxes.forEach((ay, i) => {
      const lbl = String.fromCharCode(65 + (i % 26));
      entities.push(dxfLine(footprint.minX - 1.2, ay, footprint.maxX + 1.2, ay, 'EIXOS'));
      entities.push(dxfCircle(footprint.minX - 1.55, ay, 0.32, 'EIXOS'));
      entities.push(dxfText(footprint.minX - 1.65, ay - 0.1, 0.22, lbl, 'EIXOS'));
    });

    // Overall exterior dimension lines
    entities.push(
      dxfLine(footprint.minX, footprint.maxY + 0.85, footprint.maxX, footprint.maxY + 0.85, 'COTAS'),
    );
    entities.push(
      dxfText(
        (footprint.minX + footprint.maxX) / 2 - 0.4,
        footprint.maxY + 1.0,
        0.2,
        `${footprint.width.toFixed(2)}m`,
        'COTAS',
      ),
    );
    entities.push(
      dxfLine(footprint.maxX + 0.85, footprint.minY, footprint.maxX + 0.85, footprint.maxY, 'COTAS'),
    );
    entities.push(
      dxfText(
        footprint.maxX + 1.0,
        (footprint.minY + footprint.maxY) / 2,
        0.2,
        `${footprint.depth.toFixed(2)}m`,
        'COTAS',
      ),
    );
  }

  if (floor) {
    for (const inst of floor.units) {
      const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
      if (!ut) continue;

      // Double-line walls split by openings (Alvenaria vs Drywall)
      for (const wall of ut.walls) {
        const isDrywall =
          !wall.isExternal && wall.material.toLowerCase().includes('drywall');
        const spans = splitWallByOpenings(wall, ut.openings);
        const layer = wall.isExternal
          ? 'PAREDES_EXT'
          : isDrywall
          ? 'PAREDES_INT_DRYWALL'
          : 'PAREDES_INT';
        for (const sp of spans) {
          const lx0 = wall.start.x + (wall.end.x - wall.start.x) * sp.t0;
          const ly0 = wall.start.y + (wall.end.y - wall.start.y) * sp.t0;
          const lx1 = wall.start.x + (wall.end.x - wall.start.x) * sp.t1;
          const ly1 = wall.start.y + (wall.end.y - wall.start.y) * sp.t1;
          const p0 = unitLocalToWorld(inst, ut, lx0, ly0);
          const p1 = unitLocalToWorld(inst, ut, lx1, ly1);
          const quad = getWallQuadWorld(p0, p1, wall.thickness);
          entities.push(dxfClosedPoly(quad, layer));
        }
      }

      // Mezzanine projection rectangle (never counted as a floor)
      if (ut.hasMezzanine && ut.mezzanine?.enabled && ut.ceilingHeight >= 3.0) {
        const mezRoom = ut.rooms.find((r) => r.category === 'mezanino');
        if (mezRoom) {
          const mp1 = unitLocalToWorld(inst, ut, mezRoom.x, mezRoom.y);
          const mp2 = unitLocalToWorld(inst, ut, mezRoom.x + mezRoom.width, mezRoom.y);
          const mp3 = unitLocalToWorld(inst, ut, mezRoom.x + mezRoom.width, mezRoom.y + mezRoom.depth);
          const mp4 = unitLocalToWorld(inst, ut, mezRoom.x, mezRoom.y + mezRoom.depth);
          entities.push(dxfClosedPoly([mp1, mp2, mp3, mp4], 'MEZANINO'));
          entities.push(
            dxfText(
              mp1.x + 0.1,
              mp1.y + 0.25,
              0.13,
              `MEZANINO +${ut.mezzanine.elevationM.toFixed(2)}m`,
              'MEZANINO',
            ),
          );
        }
      }

      // CAD Doors (leaf + 90 deg arc / sliding) & Windows / Vitrôs
      for (const op of ut.openings) {
        const wall = ut.walls.find((w) => w.id === op.wallId);
        if (!wall) continue;
        const pos = getOpeningWorldPosition(wall, op);
        const wallLen = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) || 1;
        const ux = (wall.end.x - wall.start.x) / wallLen;
        const uy = (wall.end.y - wall.start.y) / wallLen;
        const aLocal = {
          x: pos.center.x - ux * (op.width / 2),
          y: pos.center.y - uy * (op.width / 2),
        };
        const bLocal = {
          x: pos.center.x + ux * (op.width / 2),
          y: pos.center.y + uy * (op.width / 2),
        };
        const pa = unitLocalToWorld(inst, ut, aLocal.x, aLocal.y);
        const pb = unitLocalToWorld(inst, ut, bLocal.x, bLocal.y);

        if (op.type === 'porta') {
          if (op.openingKind === 'porta_correr') {
            const pm = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
            entities.push(dxfLine(pa.x, pa.y, pm.x, pm.y, 'ESQUADRIAS'));
            entities.push(dxfLine(pm.x, pm.y + 0.03, pb.x, pb.y + 0.03, 'ESQUADRIAS'));
          } else {
            const ang = (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI;
            const leafTip = {
              x: pa.x + Math.cos(((ang + 90) * Math.PI) / 180) * op.width,
              y: pa.y + Math.sin(((ang + 90) * Math.PI) / 180) * op.width,
            };
            entities.push(dxfLine(pa.x, pa.y, leafTip.x, leafTip.y, 'ESQUADRIAS'));
            entities.push(dxfArc(pa.x, pa.y, op.width, ang, ang + 90, 'ESQUADRIAS'));
          }
        } else {
          const isVitro =
            op.openingKind?.startsWith('vitro_') ||
            op.subtype.toLowerCase().includes('basculante') ||
            op.subtype.toLowerCase().includes('vitr');
          const quad = getWallQuadWorld(pa, pb, wall.thickness * 0.7);
          entities.push(dxfClosedPoly(quad, 'ESQUADRIAS'));
          entities.push(dxfLine(pa.x, pa.y, pb.x, pb.y, 'ESQUADRIAS'));
          if (isVitro) {
            entities.push(dxfLine(pa.x, pa.y + 0.03, pb.x, pb.y + 0.03, 'ESQUADRIAS'));
          }
        }
      }

      for (const fur of ut.furniture) {
        const p1 = unitLocalToWorld(inst, ut, fur.x, fur.y);
        const p2 = unitLocalToWorld(inst, ut, fur.x + fur.width, fur.y);
        const p3 = unitLocalToWorld(inst, ut, fur.x + fur.width, fur.y + fur.depth);
        const p4 = unitLocalToWorld(inst, ut, fur.x, fur.y + fur.depth);
        const fLayer = fur.category === 'escada' ? 'ESCADA' : 'MOBILIARIO';
        entities.push(dxfClosedPoly([p1, p2, p3, p4], fLayer));
        if (fur.category === 'box') {
          entities.push(dxfLine(p1.x, p1.y, p3.x, p3.y, 'MOBILIARIO'));
          entities.push(dxfLine(p2.x, p2.y, p4.x, p4.y, 'MOBILIARIO'));
        } else if (fur.category === 'geladeira') {
          entities.push(dxfLine(p1.x, p1.y, p3.x, p3.y, 'MOBILIARIO'));
        } else if (fur.category === 'escada') {
          const steps = Math.max(4, fur.stairSpec?.steps ?? 9);
          const horizontal = fur.width >= fur.depth;
          for (let s = 1; s < steps; s++) {
            const frac = s / steps;
            if (horizontal) {
              const a = unitLocalToWorld(inst, ut, fur.x + fur.width * frac, fur.y);
              const b = unitLocalToWorld(inst, ut, fur.x + fur.width * frac, fur.y + fur.depth);
              entities.push(dxfLine(a.x, a.y, b.x, b.y, 'ESCADA'));
            } else {
              const a = unitLocalToWorld(inst, ut, fur.x, fur.y + fur.depth * frac);
              const b = unitLocalToWorld(inst, ut, fur.x + fur.width, fur.y + fur.depth * frac);
              entities.push(dxfLine(a.x, a.y, b.x, b.y, 'ESCADA'));
            }
          }
        }
      }

      const isSpecCat = (cat: string) =>
        ['dados', 'tv', 'antena_tv', 'wifi_ap', 'cftv', 'rack_ti', 'interfone'].includes(cat);

      for (const ep of ut.electricalPoints) {
        const p = unitLocalToWorld(inst, ut, ep.x, ep.y);
        const layer = isSpecCat(ep.category) ? 'ESPECIAIS' : 'ELETRICA';
        entities.push(dxfCircle(p.x, p.y, 0.08, layer));
        entities.push(dxfText(p.x + 0.1, p.y, 0.11, `${ep.code}(z=${ep.z}m)`, layer));
      }

      for (const wp of ut.waterPoints) {
        const p = unitLocalToWorld(inst, ut, wp.x, wp.y);
        entities.push(dxfCircle(p.x, p.y, 0.06, 'HIDRAULICA'));
        entities.push(dxfText(p.x + 0.08, p.y, 0.09, `${wp.code}`, 'HIDRAULICA'));
      }

      for (const dp of ut.drainagePoints) {
        const p = unitLocalToWorld(inst, ut, dp.x, dp.y);
        entities.push(dxfCircle(p.x, p.y, 0.07, 'SANITARIA'));
        entities.push(dxfText(p.x + 0.09, p.y, 0.09, `${dp.code} DN${dp.diameterMm}`, 'SANITARIA'));
      }

      for (const r of ut.rooms) {
        const rp = unitLocalToWorld(inst, ut, r.x + r.width / 2, r.y + r.depth / 2);
        entities.push(
          dxfText(rp.x - 0.35, rp.y, 0.14, `${r.code} ${getRoomArea(r)}m2`, 'TEXTOS'),
        );
      }

      const labelPos = unitLocalToWorld(inst, ut, ut.width * 0.25, ut.depth * 0.85);
      entities.push(
        dxfText(
          labelPos.x,
          labelPos.y,
          0.22,
          `UNID ${inst.unitNumber} (${ut.code} - ${round2(ut.width * ut.depth)}m2)`,
          'TEXTOS',
        ),
      );
    }
  }

  for (const s of project.structuralElements) {
    entities.push(
      dxfClosedPoly(
        [
          { x: s.x, y: s.y },
          { x: s.x + s.width, y: s.y },
          { x: s.x + s.width, y: s.y + s.depth },
          { x: s.x, y: s.y + s.depth },
        ],
        'ESTRUTURA',
      ),
    );
  }

  return [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$INSUNITS',
    '70',
    '6', // meters
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    ...entities,
    '0',
    'ENDSEC',
    '0',
    'EOF',
  ].join('\n');
}

// ============================================================================
// 3. EXCEL XLSX EXPORTER (7-sheet executive workbook with SINAPI-RJ analytical split)
// ============================================================================
function setSheetCols(ws: XLSX.WorkSheet, widths: number[]) {
  ws['!cols'] = widths.map((wch) => ({ wch }));
}

export function generateProjectXLSXBuffer(
  project: Project,
  scheduleMonths = 6,
): Uint8Array {
  const quantities = calculateQuantities(project);
  const budget = calculateBudgetSummary(project, quantities);
  const analytical = calculateAnalyticalBreakdown(budget, project);
  const schedule = buildConstructionSchedule(budget.grandTotalCost, scheduleMonths);
  const elec = calculateElectricalSizing(project);
  const siteCheck = analyzeSiteGeometry(project.site);
  const detailByCode = new Map(analytical.lineDetails.map((d) => [d.code, d]));
  const wb = XLSX.utils.book_new();

  // Sheet 1: Resumo Executivo
  const summaryRows: Array<Array<string | number>> = [
    ['KITNET PRO STUDIO — RESUMO EXECUTIVO DE ENGENHARIA E ORÇAMENTO'],
    ['Empreendimento', project.name],
    ['Código', project.code],
    ['Contratante / Proprietário', project.client],
    ['Município / UF', `${project.municipality}${project.state ? ` / ${project.state}` : ''}`],
    ['Etapa', project.stage],
    ['Sistema Construtivo', project.constructionMethod.name],
    ['Base Orçamentária', project.budgetSettings.sourceBase],
    ['Região de Referência', project.budgetSettings.region],
    ['Encargos Sociais RJ (%)', analytical.socialChargesRatePercent],
    ['Área do Terreno (m²)', siteCheck.calculatedArea],
    ['Pavimentos', project.floors.length],
    ['Total de Unidades', quantities.summary.totalUnits],
    ['Área Privativa Total (m²)', quantities.summary.totalPrivateAreaM2],
    ['Área Comum Total (m²)', quantities.summary.totalCommonAreaM2],
    ['Área Construída Total (m²)', quantities.summary.totalBuiltAreaM2],
    [],
    ['RESUMO FINANCEIRO CONSOLIDADO (R$)'],
    ['Material Total Estimado (R$)', analytical.totalMaterialCost],
    ['Mão de Obra + Encargos RJ (R$)', analytical.totalLaborCost],
    ['  └─ Parcela Implícita de Encargos Sociais (R$)', analytical.socialChargesImpliedValue],
    ['Custo Direto Total Cotado (R$)', budget.directTotalCost],
    [`Custos Indiretos (${project.budgetSettings.indirectCostsPercent}%)`, budget.indirectCost],
    [`BDI Aplicado (${project.budgetSettings.bdiPercent}%)`, budget.bdiValue],
    ['TOTAL GERAL DO EMPREENDIMENTO (R$)', budget.grandTotalCost],
    ['Custo Médio por m² Construído (R$/m²)', budget.costPerM2 ?? 0],
    ['Custo Médio por Unidade Habitacional (R$/un)', budget.costPerUnit ?? 0],
    ['Itens Sem Cotação', budget.unquotedCount],
    [],
    ['RESUMO POR ETAPA CONSTRUTIVA (WBS)'],
    ['Etapa', 'Itens', 'Material (R$)', 'Mão de Obra (R$)', 'Custo Direto (R$)', 'Com BDI (R$)', '% Participação'],
    ...analytical.stageSummaries.map((st) => [
      st.stageName,
      st.itemsCount,
      st.materialTotal,
      st.laborTotal,
      st.directTotal,
      st.withBdiTotal,
      st.sharePercent,
    ]),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  setSheetCols(wsSummary, [44, 24, 18, 18, 18, 18, 16]);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo Executivo');

  // Sheet 2: Quantitativos
  const qtyRows = [
    [
      'Código',
      'Disciplina',
      'Descrição',
      'Unidade',
      'Qtd Líquida',
      'Perda (%)',
      'Qtd Bruta c/ Perda',
      'Critério de Medição',
      'Origem no Modelo',
      'Memória de Cálculo',
    ],
    ...quantities.items.map((q) => [
      q.code,
      q.discipline,
      q.description,
      q.unit,
      q.netQuantity,
      q.lossFactorPercent,
      q.grossQuantity,
      q.measurementCriterion,
      q.sourceOrigin,
      q.calculationMemory,
    ]),
  ];
  const wsQty = XLSX.utils.aoa_to_sheet(qtyRows);
  setSheetCols(wsQty, [12, 16, 48, 10, 14, 12, 16, 44, 38, 48]);
  XLSX.utils.book_append_sheet(wb, wsQty, 'Quantitativos');

  // Sheet 3: Orçamento Analítico (Material vs Mão de Obra + Encargos + SINAPI-RJ)
  const bdgRows: Array<Array<string | number>> = [
    [
      'Etapa WBS',
      'Código',
      'SINAPI-RJ',
      'Descrição',
      'Unid.',
      'Qtd Efetiva',
      'Unit. Material (R$)',
      'Unit. Mão de Obra (R$)',
      'Unit. Total (R$)',
      'Total Material (R$)',
      'Total Mão de Obra (R$)',
      'Subtotal Direto (R$)',
      '% Part.',
      'ABC',
      'Base / Fornecedor',
    ],
    ...budget.lines.map((l) => {
      const det = detailByCode.get(l.code);
      return [
        det?.stageName ?? '09. Serviços Complementares',
        l.code,
        l.sinapiCode || '—',
        l.description,
        l.unit,
        l.effectiveQuantity,
        det?.materialUnitPrice ?? 'SEM COTAÇÃO',
        det?.laborUnitPrice ?? 'SEM COTAÇÃO',
        l.unitPrice !== null ? l.unitPrice : 'SEM COTAÇÃO',
        det?.materialSubtotal ?? 'SEM COTAÇÃO',
        det?.laborSubtotal ?? 'SEM COTAÇÃO',
        l.subtotal !== null ? l.subtotal : 'SEM COTAÇÃO',
        det?.sharePercent ?? 0,
        l.abcClass,
        `${l.sourceBase}${l.supplier ? ` (${l.supplier})` : ''}`,
      ];
    }),
    [],
    ['Total Material (R$)', analytical.totalMaterialCost],
    ['Total Mão de Obra c/ Encargos RJ (R$)', analytical.totalLaborCost],
    ['Custo Direto Total Cotado (R$)', budget.directTotalCost],
    [`Custos Indiretos (${project.budgetSettings.indirectCostsPercent}%)`, budget.indirectCost],
    [`BDI (${project.budgetSettings.bdiPercent}%)`, budget.bdiValue],
    ['TOTAL GERAL COM BDI (R$)', budget.grandTotalCost],
    ['Itens Sem Cotação', budget.unquotedCount],
  ];
  const wsBudget = XLSX.utils.aoa_to_sheet(bdgRows);
  setSheetCols(wsBudget, [34, 10, 12, 46, 8, 12, 16, 18, 16, 16, 18, 16, 10, 10, 28]);
  XLSX.utils.book_append_sheet(wb, wsBudget, 'Orçamento Analítico');

  // Sheet 4: Curva ABC
  const abcSorted = [...budget.lines]
    .filter((l) => l.subtotal !== null)
    .sort((a, b) => (b.subtotal ?? 0) - (a.subtotal ?? 0));
  const abcRows = [
    ['Ordem', 'Código', 'SINAPI-RJ', 'Descrição', 'Unid.', 'Qtd Efetiva', 'Subtotal (R$)', '% Item', '% Acumulado', 'Classe ABC'],
    ...abcSorted.map((l, idx) => [
      idx + 1,
      l.code,
      l.sinapiCode || '—',
      l.description,
      l.unit,
      l.effectiveQuantity,
      l.subtotal ?? 0,
      budget.directTotalCost > 0 ? round2(((l.subtotal ?? 0) / budget.directTotalCost) * 100) : 0,
      l.cumulativePercent ?? 0,
      l.abcClass,
    ]),
  ];
  const wsAbc = XLSX.utils.aoa_to_sheet(abcRows);
  setSheetCols(wsAbc, [8, 10, 12, 48, 8, 14, 16, 12, 14, 12]);
  XLSX.utils.book_append_sheet(wb, wsAbc, 'Curva ABC');

  // Sheet 5: Cronograma Físico-Financeiro
  const monthHeaders = Array.from({ length: schedule.months }, (_, i) => `Mês ${i + 1} (R$)`);
  const schedRows: Array<Array<string | number>> = [
    ['Código', 'Etapa da Obra', 'Peso (%)', 'Início', 'Término', 'Total Etapa (R$)', ...monthHeaders],
    ...schedule.stages.map((st) => [
      st.code,
      st.name,
      st.weightPercent,
      `Mês ${st.startMonth}`,
      `Mês ${st.endMonth}`,
      st.totalValue,
      ...st.monthlyValues,
    ]),
    [],
    ['', 'DESEMBOLSO MENSAL (R$)', 100, '', '', budget.grandTotalCost, ...schedule.monthlyTotals],
    ['', 'PERCENTUAL MENSAL (%)', '', '', '', 100, ...schedule.monthlyPercents],
    ['', 'DESEMBOLSO ACUMULADO (R$)', '', '', '', budget.grandTotalCost, ...schedule.cumulativeTotals],
    ['', 'AVANÇO FÍSICO-FINANCEIRO ACUMULADO (%)', '', '', '', '', ...schedule.cumulativePercents],
  ];
  const wsSched = XLSX.utils.aoa_to_sheet(schedRows);
  setSheetCols(wsSched, [10, 44, 10, 10, 10, 18, ...Array(schedule.months).fill(14)]);
  XLSX.utils.book_append_sheet(wb, wsSched, 'Cronograma Físico-Fin');

  // Sheet 6: Quadro de Cargas Elétricas
  const elecRows = [
    ['Tipologia', 'Circuito', 'Tensão (V)', 'Potência (VA)', 'Corrente (A)', 'Disjuntor Rec. (A)', 'Condutor (mm²)', 'Eletroduto (mm)', 'Queda Tensão (%)', 'Metodologia'],
    ...elec.byUnitType.flatMap((u) =>
      u.circuits.map((c) => [
        u.unitTypeName,
        c.circuitId,
        c.voltage,
        c.totalPowerVA,
        c.currentA,
        c.recommendedBreakerA,
        c.conductorMm2,
        c.conduitMm,
        c.voltageDropPercent,
        c.methodology,
      ]),
    ),
  ];
  const wsElec = XLSX.utils.aoa_to_sheet(elecRows);
  setSheetCols(wsElec, [30, 14, 12, 14, 14, 16, 14, 14, 16, 36]);
  XLSX.utils.book_append_sheet(wb, wsElec, 'Quadro de Cargas');

  // Sheet 7: Pontos Elétricos, Hidráulicos e Sanitários
  const ptsRows = [
    ['Tipologia', 'Disciplina', 'Código', 'Descrição / Equipamento', 'X (m)', 'Y (m)', 'Altura Z (m)', 'Especificação'],
    ...project.unitTypes.flatMap((ut) => [
      ...ut.electricalPoints.map((p) => [ut.code, 'Elétrica', p.code, p.label, p.x, p.y, p.z, `${p.powerVA}VA / ${p.voltage}V / ${p.circuitId}`]),
      ...ut.waterPoints.map((p) => [ut.code, 'Hidráulica', p.code, p.equipment, p.x, p.y, p.z, `${p.waterType} Ø${p.diameterMm}mm (${p.material})`]),
      ...ut.drainagePoints.map((p) => [ut.code, 'Sanitária', p.code, p.category, p.x, p.y, 0, `Ø${p.diameterMm}mm i=${p.slopePercent}% UHC=${p.uhc}`]),
    ]),
  ];
  const wsPts = XLSX.utils.aoa_to_sheet(ptsRows);
  setSheetCols(wsPts, [12, 14, 12, 34, 10, 10, 12, 36]);
  XLSX.utils.book_append_sheet(wb, wsPts, 'Pontos MEP');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Uint8Array(out);
}

// ============================================================================
// 4. EDITABLE DOCX MEMORIAL EXPORTER (Structured Executive Word Report)
// ============================================================================
function docxCell(text: string, bold = false, shaded = false): TableCell {
  return new TableCell({
    shading: shaded ? { type: ShadingType.CLEAR, fill: 'EEF2F7', color: 'auto' } : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, size: 20 })],
      }),
    ],
  });
}

function buildDocxTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h) => docxCell(h, true, true)),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: r.map((cell) => docxCell(cell, false, false)),
          }),
      ),
    ],
  });
}

export async function generateMemorialDOCXBlob(project: Project): Promise<Blob> {
  const sections = generateAllMemorials(project);
  const quantities = calculateQuantities(project);
  const siteCheck = analyzeSiteGeometry(project.site);
  const today = new Date().toLocaleDateString('pt-BR');

  const idTable = buildDocxTable(
    ['Parâmetro Técnico', 'Especificação do Empreendimento'],
    [
      ['Empreendimento', `${project.name} (${project.code})`],
      ['Contratante / Proprietário', project.client || 'Não informado'],
      ['Localização / Município / UF', `${project.address || 'Não informado'} — ${project.municipality}${project.state ? `/${project.state}` : ''}`],
      ['Sistema Construtivo', project.constructionMethod.name],
      ['Etapa / Revisão', `${project.stage} · ${project.revisions[project.revisions.length - 1]?.revisionCode ?? 'R00'} (${today})`],
      ['Terreno / Pavimentos / Unidades', `${siteCheck.calculatedArea} m² · ${project.floors.length} pavimento(s) · ${quantities.summary.totalUnits} unidade(s)`],
      ['Áreas (Privativa / Comum / Construída)', `${quantities.summary.totalPrivateAreaM2} m² / ${quantities.summary.totalCommonAreaM2} m² / ${quantities.summary.totalBuiltAreaM2} m²`],
    ],
  );

  const finishesRows: string[][] = [];
  for (const ut of project.unitTypes) {
    for (const r of ut.rooms) {
      finishesRows.push([
        ut.code,
        `${r.code} — ${r.name} (${getRoomArea(r)} m²)`,
        r.finishes.floor,
        r.finishes.wall,
        r.finishes.ceiling,
      ]);
    }
  }

  const rtRows =
    project.professionals.length > 0
      ? project.professionals.map((p) => [
          p.name || 'NÃO INFORMADO',
          p.profession,
          `${p.council} ${p.registrationNumber || 'N/I'}`,
          p.artRrtCode || 'Pendente',
        ])
      : [['RT NÃO INFORMADO', 'Arquiteto / Engenheiro Responsável', 'CAU / CREA', 'Pendente']];

  const children: Array<Paragraph | Table> = [
    new Paragraph({
      text: 'MEMORIAL DESCRITIVO EXECUTIVO E ESPECIFICAÇÕES TÉCNICAS',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${project.name} · Código ${project.code} · KITNET PRO STUDIO`,
          bold: true,
          size: 22,
        }),
      ],
    }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: '1. IDENTIFICAÇÃO E QUADRO GERAL DE ÁREAS', heading: HeadingLevel.HEADING_1 }),
    idTable,
    new Paragraph({ text: '' }),
  ];

  if (finishesRows.length > 0) {
    children.push(
      new Paragraph({ text: '2. QUADRO DE ACABAMENTOS POR AMBIENTE', heading: HeadingLevel.HEADING_1 }),
      buildDocxTable(['Tipologia', 'Ambiente', 'Piso', 'Parede', 'Teto / Forro'], finishesRows),
      new Paragraph({ text: '' }),
    );
  }

  for (const sec of sections) {
    children.push(
      new Paragraph({
        text: `${sec.title} — ${sec.discipline}`,
        heading: HeadingLevel.HEADING_1,
      }),
    );
    for (const line of sec.content.split('\n')) {
      const trimmed = line.trim();
      const isHeadingLine =
        trimmed.endsWith(':') || /^\d+\.\s/.test(trimmed) || trimmed.startsWith('===');
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line, bold: isHeadingLine, size: 21 })],
        }),
      );
    }
    children.push(new Paragraph({ text: '' }));
  }

  children.push(
    new Paragraph({ text: 'RESPONSABILIDADE TÉCNICA (CAU / CREA)', heading: HeadingLevel.HEADING_1 }),
    buildDocxTable(['Profissional', 'Especialidade', 'Registro', 'ART / RRT'], rtRows),
  );

  const doc = new Document({
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
}

// ============================================================================
// 4B. EXECUTIVE PDF EXPORTERS (Orçamento Analítico + Cronograma & Memorial)
// ============================================================================
const fmtBRL = (val: number | null) =>
  val === null ? 'SEM COTAÇÃO' : val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function generateAnalyticalBudgetAndSchedulePDFBlob(
  project: Project,
  scheduleMonths = 6,
): Blob {
  const quantities = calculateQuantities(project);
  const budget = calculateBudgetSummary(project, quantities);
  const analytical = calculateAnalyticalBreakdown(budget, project);
  const schedule = buildConstructionSchedule(budget.grandTotalCost, scheduleMonths);
  const detailByCode = new Map(analytical.lineDetails.map((d) => [d.code, d]));

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 12;
  const contentW = pageW - margin * 2;
  const today = new Date().toLocaleDateString('pt-BR');

  const drawHeader = (subtitle: string) => {
    doc.setFillColor(15, 23, 42);
    doc.rect(margin, 10, contentW, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text('ORÇAMENTO ANALÍTICO SINAPI-RJ & CRONOGRAMA FÍSICO-FINANCEIRO', margin + 4, 17);
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(`${project.name} (${project.code}) · ${subtitle} · Emissão: ${today}`, margin + 4, 23);
  };

  drawHeader(project.budgetSettings.sourceBase);

  // Executive KPI Grid
  let y = 31;
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, contentW, 24, 'FD');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(8);
  doc.text(`Terreno / Área Construída: ${analyzeSiteGeometry(project.site).calculatedArea} m² / ${quantities.summary.totalBuiltAreaM2} m² (${quantities.summary.totalUnits} unid.)`, margin + 3, y + 6);
  doc.text(`Regime / Encargos RJ: ${project.budgetSettings.sourceBase} (Encargos: ${analytical.socialChargesRatePercent}%)`, margin + 3, y + 11.5);
  doc.text(`Material: ${fmtBRL(analytical.totalMaterialCost)}  |  Mão de Obra c/ Enc.: ${fmtBRL(analytical.totalLaborCost)}  |  Custo Direto: ${fmtBRL(budget.directTotalCost)}`, margin + 3, y + 17);
  doc.setFontSize(8.5);
  doc.text(`Indiretos (${project.budgetSettings.indirectCostsPercent}%): ${fmtBRL(budget.indirectCost)}  |  BDI (${project.budgetSettings.bdiPercent}%): ${fmtBRL(budget.bdiValue)}  |  TOTAL GERAL: ${fmtBRL(budget.grandTotalCost)}  (${fmtBRL(budget.costPerM2)}/m²)`, margin + 3, y + 22);

  y += 29;
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('1. RESUMO ANALÍTICO POR ETAPA CONSTRUTIVA (WBS)', margin, y);
  y += 3;

  const drawStageHeader = () => {
    doc.setFillColor(226, 232, 240);
    doc.rect(margin, y, contentW, 6.5, 'FD');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text('ETAPA CONSTRUTIVA', margin + 2, y + 4.5);
    doc.text('MAT. (R$)', margin + 88, y + 4.5, { align: 'right' });
    doc.text('M.O.+ENC (R$)', margin + 118, y + 4.5, { align: 'right' });
    doc.text('DIRETO (R$)', margin + 148, y + 4.5, { align: 'right' });
    doc.text('C/ BDI (R$)', margin + 174, y + 4.5, { align: 'right' });
    doc.text('%', margin + contentW - 2, y + 4.5, { align: 'right' });
    y += 6.5;
  };
  drawStageHeader();

  for (const st of analytical.stageSummaries) {
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, contentW, 6);
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);
    doc.text(st.stageName.slice(0, 40), margin + 2, y + 4.2);
    doc.text(fmtBRL(st.materialTotal), margin + 88, y + 4.2, { align: 'right' });
    doc.text(fmtBRL(st.laborTotal), margin + 118, y + 4.2, { align: 'right' });
    doc.text(fmtBRL(st.directTotal), margin + 148, y + 4.2, { align: 'right' });
    doc.text(fmtBRL(st.withBdiTotal), margin + 174, y + 4.2, { align: 'right' });
    doc.text(`${st.sharePercent.toFixed(1)}%`, margin + contentW - 2, y + 4.2, { align: 'right' });
    y += 6;
  }

  y += 7;
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('2. PLANILHA ANALÍTICA DE COMPOSIÇÕES UNITÁRIAS (SINAPI-RJ)', margin, y);
  y += 3;

  const drawItemTableHeader = () => {
    doc.setFillColor(226, 232, 240);
    doc.rect(margin, y, contentW, 6.5, 'FD');
    doc.setFontSize(6.5);
    doc.setTextColor(15, 23, 42);
    doc.text('CÓD / SINAPI', margin + 2, y + 4.5);
    doc.text('DESCRIÇÃO DO SERVIÇO / INSUMO', margin + 25, y + 4.5);
    doc.text('UN', margin + 104, y + 4.5);
    doc.text('QTD EF.', margin + 123, y + 4.5, { align: 'right' });
    doc.text('MAT+MO UNIT.', margin + 148, y + 4.5, { align: 'right' });
    doc.text('SUBTOTAL (R$)', margin + 174, y + 4.5, { align: 'right' });
    doc.text('ABC', margin + contentW - 2, y + 4.5, { align: 'right' });
    y += 6.5;
  };
  drawItemTableHeader();

  for (const line of budget.lines) {
    if (y > 272) {
      doc.addPage('a4', 'portrait');
      drawHeader('Planilha Analítica (Continuação)');
      y = 32;
      drawItemTableHeader();
    }
    const det = detailByCode.get(line.code);
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, contentW, 6.2);
    doc.setFontSize(6.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${line.code} / ${line.sinapiCode || '—'}`, margin + 2, y + 4.3);
    doc.text(line.description.slice(0, 48), margin + 25, y + 4.3);
    doc.text(line.unit, margin + 104, y + 4.3);
    doc.text(String(line.effectiveQuantity), margin + 123, y + 4.3, { align: 'right' });
    doc.text(fmtBRL(line.unitPrice), margin + 148, y + 4.3, { align: 'right' });
    doc.text(fmtBRL(line.subtotal), margin + 174, y + 4.3, { align: 'right' });
    doc.text(
      line.abcClass === 'SEM_COTACAO' ? '—' : `${line.abcClass} (${det?.sharePercent ?? 0}%)`,
      margin + contentW - 2,
      y + 4.3,
      { align: 'right' },
    );
    y += 6.2;
  }

  // Page for Curva ABC + Cronograma Físico-Financeiro
  doc.addPage('a4', 'portrait');
  drawHeader(`Curva ABC & Cronograma Físico-Financeiro (${schedule.months} meses)`);
  y = 33;

  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('3. CRONOGRAMA FÍSICO-FINANCEIRO DE DESEMBOLSO', margin, y);
  y += 3.5;

  doc.setFillColor(226, 232, 240);
  doc.rect(margin, y, contentW, 6.5, 'FD');
  doc.setFontSize(7);
  doc.text('ETAPA DA OBRA', margin + 2, y + 4.5);
  doc.text('PERÍODO', margin + 96, y + 4.5);
  doc.text('PESO', margin + 122, y + 4.5, { align: 'right' });
  doc.text('DESEMBOLSO (R$)', margin + 156, y + 4.5, { align: 'right' });
  doc.text('BARRA DE EXECUÇÃO', margin + 160, y + 4.5);
  y += 6.5;

  for (const st of schedule.stages) {
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, contentW, 7);
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);
    doc.text(`${st.code} — ${st.name.slice(0, 42)}`, margin + 2, y + 4.8);
    doc.text(`Mês ${st.startMonth} a ${st.endMonth}`, margin + 96, y + 4.8);
    doc.text(`${st.weightPercent.toFixed(0)}%`, margin + 122, y + 4.8, { align: 'right' });
    doc.text(fmtBRL(st.totalValue), margin + 156, y + 4.8, { align: 'right' });
    const barX = margin + 160;
    const barW = contentW - 163;
    doc.setFillColor(241, 245, 249);
    doc.rect(barX, y + 2, barW, 3, 'F');
    const segL = ((st.startMonth - 1) / schedule.months) * barW;
    const segW = Math.max(2, ((st.endMonth - st.startMonth + 1) / schedule.months) * barW);
    doc.setFillColor(37, 99, 235);
    doc.rect(barX + segL, y + 2, segW, 3, 'F');
    y += 7;
  }

  y += 8;
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('4. FLUXO MENSAL DE DESEMBOLSO E AVANÇO ACUMULADO', margin, y);
  y += 3.5;

  doc.setFillColor(226, 232, 240);
  doc.rect(margin, y, contentW, 6.5, 'FD');
  doc.setFontSize(7);
  doc.text('MÊS', margin + 3, y + 4.5);
  doc.text('DESEMBOLSO MENSAL (R$)', margin + 62, y + 4.5, { align: 'right' });
  doc.text('% MÊS', margin + 92, y + 4.5, { align: 'right' });
  doc.text('ACUMULADO (R$)', margin + 144, y + 4.5, { align: 'right' });
  doc.text('% ACUMULADO', margin + contentW - 3, y + 4.5, { align: 'right' });
  y += 6.5;

  for (let i = 0; i < schedule.months; i++) {
    if (y > 272) {
      doc.addPage('a4', 'portrait');
      drawHeader('Fluxo Mensal (Continuação)');
      y = 32;
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, contentW, 6);
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);
    doc.text(`Mês ${String(i + 1).padStart(2, '0')}`, margin + 3, y + 4.2);
    doc.text(fmtBRL(schedule.monthlyTotals[i]), margin + 62, y + 4.2, { align: 'right' });
    doc.text(`${schedule.monthlyPercents[i].toFixed(1)}%`, margin + 92, y + 4.2, { align: 'right' });
    doc.text(fmtBRL(schedule.cumulativeTotals[i]), margin + 144, y + 4.2, { align: 'right' });
    doc.text(`${schedule.cumulativePercents[i].toFixed(1)}%`, margin + contentW - 3, y + 4.2, { align: 'right' });
    y += 6;
  }

  // Page numbering
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `KITNET PRO STUDIO · Orçamento Analítico SINAPI-RJ · Página ${p} de ${totalPages}`,
      pageW / 2,
      289,
      { align: 'center' },
    );
  }

  return doc.output('blob');
}

export function generateMemorialPDFBlob(project: Project): Blob {
  const sections = generateAllMemorials(project);
  const quantities = calculateQuantities(project);
  const siteCheck = analyzeSiteGeometry(project.site);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 14;
  const contentW = pageW - margin * 2;
  const today = new Date().toLocaleDateString('pt-BR');

  const drawHeader = () => {
    doc.setFillColor(15, 23, 42);
    doc.rect(margin, 10, contentW, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10.5);
    doc.text('MEMORIAL DESCRITIVO EXECUTIVO E ESPECIFICAÇÕES TÉCNICAS', margin + 4, 16.5);
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(`${project.name} (${project.code}) · ${project.municipality}${project.state ? `/${project.state}` : ''} · ${today}`, margin + 4, 22);
  };

  drawHeader();
  let y = 31;

  // Identification summary box
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, contentW, 20, 'FD');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(8);
  doc.text(`Contratante: ${project.client || 'Não informado'}  |  Sistema Construtivo: ${project.constructionMethod.name}`, margin + 3, y + 6);
  doc.text(`Terreno: ${siteCheck.calculatedArea} m²  |  Pavimentos: ${project.floors.length}  |  Unidades: ${quantities.summary.totalUnits}  |  Área Construída: ${quantities.summary.totalBuiltAreaM2} m²`, margin + 3, y + 11.5);
  const rt = project.professionals.find((p) => p.name.trim());
  doc.text(`Responsável Técnico: ${rt ? `${rt.name} (${rt.council} ${rt.registrationNumber})` : 'RT NÃO INFORMADO'}`, margin + 3, y + 17);
  y += 26;

  for (const sec of sections) {
    if (y > 258) {
      doc.addPage('a4', 'portrait');
      drawHeader();
      y = 32;
    }
    doc.setFillColor(226, 232, 240);
    doc.rect(margin, y, contentW, 7, 'F');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`${sec.title.toUpperCase()} (${sec.discipline})`, margin + 3, y + 4.8);
    y += 11;

    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    for (const rawLine of sec.content.split('\n')) {
      const wrapped = doc.splitTextToSize(rawLine || ' ', contentW - 4) as string[];
      for (const wLine of wrapped) {
        if (y > 276) {
          doc.addPage('a4', 'portrait');
          drawHeader();
          y = 32;
        }
        doc.text(wLine, margin + 2, y);
        y += 4.3;
      }
    }
    y += 4;
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `KITNET PRO STUDIO · Memorial Descritivo Executivo · Página ${p} de ${totalPages}`,
      pageW / 2,
      289,
      { align: 'center' },
    );
  }

  return doc.output('blob');
}

// ============================================================================
// 5. VECTOR TECHNICAL SHEET PDF EXPORTER (A3 Landscape CAD Plot & R01 Render)
// ============================================================================
function drawUnitCADInPDF(
  doc: jsPDF,
  ut: UnitType,
  inst: Project['floors'][0]['units'][0],
  offX: number,
  offY: number,
  scale: number,
  sheetId: string,
) {
  const mapX = (wx: number) => offX + wx * scale;
  const mapY = (wy: number) => offY + wy * scale;

  // Double-line walls split by openings (Alvenaria vs Drywall)
  for (const w of ut.walls) {
    const isDrywall =
      !w.isExternal && w.material.toLowerCase().includes('drywall');
    const spans = splitWallByOpenings(w, ut.openings);
    doc.setDrawColor(isDrywall ? 14 : 15, isDrywall ? 116 : 23, isDrywall ? 144 : 42);
    doc.setFillColor(
      w.isExternal ? 148 : isDrywall ? 224 : 203,
      w.isExternal ? 163 : isDrywall ? 242 : 213,
      w.isExternal ? 184 : isDrywall ? 254 : 225,
    );
    doc.setLineWidth(w.isExternal ? 0.42 : isDrywall ? 0.18 : 0.25);

    for (const sp of spans) {
      const lx0 = w.start.x + (w.end.x - w.start.x) * sp.t0;
      const ly0 = w.start.y + (w.end.y - w.start.y) * sp.t0;
      const lx1 = w.start.x + (w.end.x - w.start.x) * sp.t1;
      const ly1 = w.start.y + (w.end.y - w.start.y) * sp.t1;
      const p0 = unitLocalToWorld(inst, ut, lx0, ly0);
      const p1 = unitLocalToWorld(inst, ut, lx1, ly1);
      const quad = getWallQuadWorld(p0, p1, w.thickness);
      doc.lines(
        [
          [(quad[1].x - quad[0].x) * scale, (quad[1].y - quad[0].y) * scale],
          [(quad[2].x - quad[1].x) * scale, (quad[2].y - quad[1].y) * scale],
          [(quad[3].x - quad[2].x) * scale, (quad[3].y - quad[2].y) * scale],
        ],
        mapX(quad[0].x),
        mapY(quad[0].y),
        [1, 1],
        'FD',
        true,
      );
    }
  }

  // Mezzanine dashed projection (never counted as a floor)
  if (ut.hasMezzanine && ut.mezzanine?.enabled && ut.ceilingHeight >= 3.0) {
    const mezRoom = ut.rooms.find((r) => r.category === 'mezanino');
    if (mezRoom) {
      const m1 = unitLocalToWorld(inst, ut, mezRoom.x, mezRoom.y);
      const m3 = unitLocalToWorld(inst, ut, mezRoom.x + mezRoom.width, mezRoom.y + mezRoom.depth);
      const mx0 = Math.min(mapX(m1.x), mapX(m3.x));
      const my0 = Math.min(mapY(m1.y), mapY(m3.y));
      const mw = Math.abs(mapX(m3.x) - mapX(m1.x));
      const mh = Math.abs(mapY(m3.y) - mapY(m1.y));
      doc.setDrawColor(180, 83, 9);
      doc.setLineWidth(0.24);
      doc.setLineDashPattern([1.5, 1.2], 0);
      doc.rect(mx0, my0, mw, mh);
      doc.setLineDashPattern([], 0);
    }
  }

  // Openings (Door leaves + quarter-arc / Sliding / Windows & Vitrôs)
  for (const op of ut.openings) {
    const wall = ut.walls.find((w) => w.id === op.wallId);
    if (!wall) continue;
    const pos = getOpeningWorldPosition(wall, op);
    const len = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) || 1;
    const ux = (wall.end.x - wall.start.x) / len;
    const uy = (wall.end.y - wall.start.y) / len;
    const pa = unitLocalToWorld(inst, ut, pos.center.x - ux * (op.width / 2), pos.center.y - uy * (op.width / 2));
    const pb = unitLocalToWorld(inst, ut, pos.center.x + ux * (op.width / 2), pos.center.y + uy * (op.width / 2));

    if (op.type === 'porta') {
      doc.setDrawColor(180, 83, 9);
      doc.setLineWidth(0.3);
      if (op.openingKind === 'porta_correr') {
        const mx = (mapX(pa.x) + mapX(pb.x)) / 2;
        const my = (mapY(pa.y) + mapY(pb.y)) / 2;
        doc.line(mapX(pa.x), mapY(pa.y), mx, my);
        doc.line(mx, my + 0.6, mapX(pb.x), mapY(pb.y) + 0.6);
      } else {
        const vx = pb.x - pa.x;
        const vy = pb.y - pa.y;
        const perpX = -vy;
        const perpY = vx;
        doc.line(mapX(pa.x), mapY(pa.y), mapX(pa.x + perpX), mapY(pa.y + perpY));
        // 6-segment swing arc
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.18);
        let prevX = pb.x;
        let prevY = pb.y;
        for (let s = 1; s <= 6; s++) {
          const ang = (s / 6) * (Math.PI / 2);
          const nx = pa.x + vx * Math.cos(ang) + perpX * Math.sin(ang);
          const ny = pa.y + vy * Math.cos(ang) + perpY * Math.sin(ang);
          doc.line(mapX(prevX), mapY(prevY), mapX(nx), mapY(ny));
          prevX = nx;
          prevY = ny;
        }
      }
    } else {
      const isVitro =
        op.openingKind?.startsWith('vitro_') ||
        op.subtype.toLowerCase().includes('basculante') ||
        op.subtype.toLowerCase().includes('vitr');
      doc.setDrawColor(2, 132, 199);
      doc.setLineWidth(0.28);
      doc.line(mapX(pa.x), mapY(pa.y), mapX(pb.x), mapY(pb.y));
      if (isVitro) {
        doc.setLineWidth(0.18);
        doc.line(mapX(pa.x), mapY(pa.y) + 0.5, mapX(pb.x), mapY(pb.y) + 0.5);
      }
    }
  }

  // Furniture outline + internal architectural CAD block details
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.18);
  for (const f of ut.furniture) {
    const p1 = unitLocalToWorld(inst, ut, f.x, f.y);
    const p2 = unitLocalToWorld(inst, ut, f.x + f.width, f.y);
    const p3 = unitLocalToWorld(inst, ut, f.x + f.width, f.y + f.depth);
    const p4 = unitLocalToWorld(inst, ut, f.x, f.y + f.depth);
    const rx = Math.min(mapX(p1.x), mapX(p3.x));
    const ry = Math.min(mapY(p1.y), mapY(p3.y));
    const rw = Math.abs(mapX(p3.x) - mapX(p1.x));
    const rh = Math.abs(mapY(p3.y) - mapY(p1.y));
    doc.rect(rx, ry, rw, rh);
    if (f.category === 'box' || f.category === 'geladeira') {
      doc.line(mapX(p1.x), mapY(p1.y), mapX(p3.x), mapY(p3.y));
      if (f.category === 'box') {
        doc.line(mapX(p2.x), mapY(p2.y), mapX(p4.x), mapY(p4.y));
      }
    } else if (f.category === 'vaso_sanitario' || f.category === 'lavatorio') {
      doc.ellipse(rx + rw / 2, ry + rh * 0.55, Math.max(0.8, rw * 0.34), Math.max(0.8, rh * 0.34));
    } else if (f.category === 'bancada') {
      doc.rect(rx + rw * 0.14, ry + rh * 0.18, rw * 0.28, rh * 0.64);
    } else if (f.category === 'escada') {
      const steps = Math.max(4, f.stairSpec?.steps ?? 9);
      const horiz = rw >= rh;
      for (let s = 1; s < steps; s++) {
        const frac = s / steps;
        if (horiz) {
          doc.line(rx + rw * frac, ry, rx + rw * frac, ry + rh);
        } else {
          doc.line(rx, ry + rh * frac, rx + rw, ry + rh * frac);
        }
      }
    }
  }

  // MEP overlays
  const isSpec = (cat: string) =>
    ['dados', 'tv', 'antena_tv', 'wifi_ap', 'cftv', 'rack_ti', 'interfone'].includes(cat);

  if (sheetId === 'E06') {
    for (const ep of ut.electricalPoints.filter((e) => isSpec(e.category))) {
      const p = unitLocalToWorld(inst, ut, ep.x, ep.y);
      doc.setDrawColor(147, 51, 234);
      doc.setFillColor(147, 51, 234);
      doc.circle(mapX(p.x), mapY(p.y), 1.1, 'F');
      doc.setFontSize(4.5);
      doc.setTextColor(126, 34, 206);
      doc.text(ep.code, mapX(p.x) + 1.4, mapY(p.y) + 0.6);
    }
  } else if (sheetId.startsWith('E')) {
    doc.setDrawColor(217, 119, 6);
    doc.setFillColor(217, 119, 6);
    for (const ep of ut.electricalPoints.filter((e) => !isSpec(e.category))) {
      const p = unitLocalToWorld(inst, ut, ep.x, ep.y);
      doc.circle(mapX(p.x), mapY(p.y), 1.0, 'F');
    }
  }
  if (sheetId === 'H01' || sheetId === 'H02') {
    for (const wp of ut.waterPoints) {
      const p = unitLocalToWorld(inst, ut, wp.x, wp.y);
      doc.setFillColor(wp.waterType === 'quente' ? 220 : 37, wp.waterType === 'quente' ? 38 : 99, wp.waterType === 'quente' ? 38 : 235);
      doc.circle(mapX(p.x), mapY(p.y), 0.9, 'F');
    }
  }
  if (sheetId === 'H03' || sheetId === 'H04') {
    const dpMap = new Map(ut.drainagePoints.map((d) => [d.id, d]));
    for (const dp of ut.drainagePoints) {
      const p = unitLocalToWorld(inst, ut, dp.x, dp.y);
      if (dp.connectedToId && dpMap.has(dp.connectedToId)) {
        const target = dpMap.get(dp.connectedToId)!;
        const pt = unitLocalToWorld(inst, ut, target.x, target.y);
        doc.setDrawColor(5, 150, 105);
        doc.setLineWidth(0.32);
        doc.line(mapX(p.x), mapY(p.y), mapX(pt.x), mapY(pt.y));
      }
      doc.setFillColor(5, 150, 105);
      doc.circle(mapX(p.x), mapY(p.y), 0.85, 'F');
    }
  }

  // Room labels
  doc.setFontSize(5.5);
  doc.setTextColor(30, 41, 59);
  for (const r of ut.rooms) {
    const rp = unitLocalToWorld(inst, ut, r.x + r.width / 2, r.y + r.depth / 2);
    doc.text(`${r.code} ${getRoomArea(r)}m²`, mapX(rp.x), mapY(rp.y), { align: 'center' });
  }

  const tagPt = unitLocalToWorld(inst, ut, ut.width / 2, ut.depth - 0.35);
  doc.setFontSize(7);
  doc.setTextColor(29, 78, 216);
  doc.text(`${inst.unitNumber} (${ut.code})`, mapX(tagPt.x), mapY(tagPt.y), { align: 'center' });
}

export function generateTechnicalSheetPDFBlob(
  project: Project,
  sheetId: string,
  floorIndex = 0,
): Blob {
  const sheet = TECHNICAL_SHEETS.find((s) => s.id === sheetId) ?? TECHNICAL_SHEETS[3];
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });

  // Outer sheet margin & frame
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.6);
  doc.rect(10, 10, 400, 277);
  doc.setLineWidth(0.25);
  doc.rect(13, 13, 394, 271);

  // Carimbo (Bottom Right 120x55 mm)
  const cx = 287;
  const cy = 229;
  doc.setLineWidth(0.5);
  doc.rect(cx, cy, 120, 55);
  doc.setLineWidth(0.2);
  doc.line(cx, cy + 12, cx + 120, cy + 12);
  doc.line(cx, cy + 24, cx + 120, cy + 24);
  doc.line(cx, cy + 36, cx + 120, cy + 36);
  doc.line(cx, cy + 45, cx + 120, cy + 45);
  doc.line(cx + 85, cy + 36, cx + 85, cy + 55);

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('KITNET PRO STUDIO — PRANCHA EXECUTIVA', cx + 4, cy + 8);
  doc.setFontSize(8.5);
  doc.text(`Empreendimento: ${project.name}`, cx + 4, cy + 19);
  doc.text(`Prancha ${sheet.id}: ${sheet.title.slice(0, 42)}`, cx + 4, cy + 31);
  doc.setFontSize(7.5);
  doc.text(`Escala: ${sheet.scale} | Etapa: ${project.stage}`, cx + 4, cy + 42);
  doc.text(`Rev: ${project.revisions[project.revisions.length - 1]?.revisionCode ?? 'R00'}`, cx + 89, cy + 42);
  const rt = project.professionals.find((p) => p.name.trim())?.name || 'RT NÃO INFORMADO';
  doc.text(`Resp. Técnico: ${rt}`, cx + 4, cy + 51);
  doc.text(`${new Date().toLocaleDateString('pt-BR')}`, cx + 89, cy + 51);

  // Sheet header
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`${sheet.id} — ${sheet.title} (${sheet.discipline})`, 18, 22);
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Desenho Executivo Paramétrico (ABNT NBR 6492) · Aprovação e execução dependem de responsável técnico habilitado.`,
    18,
    27,
  );

  const site = project.site;
  const siteCheck = analyzeSiteGeometry(site);
  const quantities = calculateQuantities(project);

  // Sheet-specific vector viewport (x 18..280, y 34..274)
  if (sheetId === 'R01') {
    const renders = project.capturedRenders ?? [];
    if (renders.length === 0) {
      doc.setFontSize(11);
      doc.setTextColor(100, 116, 139);
      doc.text(
        'Nenhuma perspectiva renderizada salva ainda. Acesse o módulo "Modelo BIM 3D" e clique em "Salvar na Prancha R01".',
        148,
        140,
        { align: 'center', maxWidth: 220 },
      );
    } else {
      const cols = renders.length === 1 ? 1 : 2;
      const boxW = cols === 1 ? 250 : 124;
      const boxH = cols === 1 ? 175 : 102;
      renders.slice(0, 4).forEach((r, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const rx = 20 + col * (boxW + 8);
        const ry = 36 + row * (boxH + 14);
        try {
          const imgFormat = r.dataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
          doc.addImage(r.dataUrl, imgFormat, rx, ry, boxW, boxH);
        } catch {
          doc.rect(rx, ry, boxW, boxH);
        }
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text(`${idx + 1}. ${r.title}`, rx, ry + boxH + 5);
      });
    }
  } else if (sheetId === 'A08') {
    // Parametric Elevations (Frontal + Lateral)
    const frontElev = buildElevationData(project, 'frontal');
    const latElev = buildElevationData(project, 'lateral');
    const drawElev = (data: ReturnType<typeof buildElevationData>, label: string, x0: number, yBase: number, maxW: number) => {
      const sc = Math.min(maxW / Math.max(4, data.totalWidth), 95 / Math.max(4, data.totalHeight));
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(label, x0, yBase - data.totalHeight * sc - 5);
      // Ground line
      doc.setLineWidth(0.5);
      doc.line(x0 - 8, yBase, x0 + data.totalWidth * sc + 8, yBase);
      // Facade outline
      doc.setDrawColor(15, 23, 42);
      doc.setFillColor(241, 245, 249);
      doc.rect(x0, yBase - data.totalHeight * sc, data.totalWidth * sc, data.totalHeight * sc, 'FD');
      for (const fl of data.floors) {
        doc.setDrawColor(148, 163, 184);
        doc.line(x0, yBase - fl.baseY * sc, x0 + data.totalWidth * sc, yBase - fl.baseY * sc);
        for (const ft of fl.features) {
          doc.setDrawColor(2, 132, 199);
          doc.setFillColor(186, 230, 253);
          doc.rect(
            x0 + ft.x * sc,
            yBase - (ft.y + ft.height) * sc,
            Math.max(1.5, ft.width * sc),
            Math.max(1.5, ft.height * sc),
            'FD',
          );
        }
      }
    };
    drawElev(frontElev, 'FACHADA FRONTAL (ESCALA GRÁFICA)', 26, 145, 245);
    drawElev(latElev, 'FACHADA LATERAL DIREITA (ESCALA GRÁFICA)', 26, 265, 245);
  } else if (sheetId === 'A09') {
    // Parametric Schematic Section AA
    const frontElev = buildElevationData(project, 'frontal');
    const sc = Math.min(230 / Math.max(4, frontElev.totalWidth), 160 / Math.max(4, frontElev.totalHeight));
    const x0 = 32;
    const yBase = 240;
    doc.setFontSize(9);
    doc.text('CORTE ESQUEMÁTICO AA — PAVIMENTOS, LAJES E NÍVEIS', x0, 42);
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.6);
    doc.line(x0 - 10, yBase, x0 + frontElev.totalWidth * sc + 15, yBase);
    const mezUt = project.unitTypes.find(
      (u) => u.hasMezzanine && u.mezzanine?.enabled && u.ceilingHeight >= 3.0,
    );
    const mez = mezUt?.mezzanine;
    for (const fl of frontElev.floors) {
      doc.setFillColor(148, 163, 184);
      doc.rect(x0, yBase - fl.baseY * sc, frontElev.totalWidth * sc, 2.2, 'FD');
      doc.setDrawColor(15, 23, 42);
      doc.rect(x0, yBase - fl.slabTopY * sc, 2.2, (fl.slabTopY - fl.baseY) * sc, 'FD');
      doc.rect(x0 + frontElev.totalWidth * sc - 2.2, yBase - fl.slabTopY * sc, 2.2, (fl.slabTopY - fl.baseY) * sc, 'FD');
      if (mez) {
        const mezX = x0 + frontElev.totalWidth * sc * 0.15;
        const mezW = frontElev.totalWidth * sc * 0.34;
        const mezY = yBase - (fl.baseY + mez.elevationM) * sc;
        doc.setFillColor(217, 119, 6);
        doc.rect(mezX, mezY, mezW, Math.max(1.4, mez.slabThicknessM * sc), 'FD');
        doc.setDrawColor(180, 83, 9);
        doc.line(mezX, mezY - 1.05 * sc, mezX + mezW, mezY - 1.05 * sc);
        doc.line(mezX + mezW, yBase - fl.baseY * sc, mezX + mezW + 8, mezY);
        doc.setFontSize(6.5);
        doc.text(`Mezanino +${mez.elevationM.toFixed(2)}m (N/C Pav.)`, mezX + 2, mezY - 1.8);
      }
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`${fl.name} (+${fl.baseY.toFixed(2)}m)`, x0 + frontElev.totalWidth * sc + 5, yBase - fl.baseY * sc);
    }
  } else if (sheetId === 'A07') {
    const joinery = buildJoinerySchedule(project);
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('QUADRO DE ESQUADRIAS ILUSTRADO — ABNT NBR 6492 (PORTAS E JANELAS)', 20, 38);
    // Crisp Table Headers
    doc.setFillColor(241, 245, 249);
    doc.rect(20, 42, 255, 8, 'FD');
    doc.setFontSize(7.5);
    doc.text('COD', 23, 47.5);
    doc.text('TIPO', 40, 47.5);
    doc.text('L × H (m)', 66, 47.5);
    doc.text('PEITORIL', 94, 47.5);
    doc.text('ESPECIFICAÇÃO / MATERIAL', 120, 47.5);
    doc.text('QTD/PAV', 226, 47.5);
    doc.text('TOTAL', 252, 47.5);

    let y = 50;
    for (const row of joinery.slice(0, 14)) {
      doc.setDrawColor(148, 163, 184);
      doc.rect(20, y, 255, 11);
      doc.setTextColor(15, 23, 42);
      doc.text(row.code, 23, y + 7);
      doc.text(row.type.toUpperCase(), 40, y + 7);
      doc.text(`${row.width.toFixed(2)} × ${row.height.toFixed(2)}`, 66, y + 7);
      doc.text(`${row.sillHeight.toFixed(2)}m`, 94, y + 7);
      doc.text(row.material.slice(0, 48), 120, y + 7);
      doc.text(`${row.countPerFloor} un`, 226, y + 7);
      doc.text(`${row.totalProjectCount} un`, 252, y + 7);
      y += 11;
    }
  } else {
    // Plan CAD viewport (Site, Setbacks, Grid Axes, Double-Line Walls, Doors, Furniture, Cotas)
    const bbox = getBoundingBox(site.vertices);
    const drawW = 240;
    const drawH = 220;
    const scale = Math.min(drawW / Math.max(1, bbox.width), drawH / Math.max(1, bbox.depth)) * 0.82;
    const offX = 36;
    const offY = 44;

    // Site Polygon
    doc.setDrawColor(71, 85, 105);
    doc.setLineWidth(0.4);
    for (let i = 0; i < site.vertices.length; i++) {
      const a = site.vertices[i];
      const b = site.vertices[(i + 1) % site.vertices.length];
      doc.line(offX + a.x * scale, offY + a.y * scale, offX + b.x * scale, offY + b.y * scale);
    }

    // Buildable Setback Box
    const bBox = siteCheck.buildableBox;
    doc.setDrawColor(217, 119, 6);
    doc.setLineDashPattern([2, 2], 0);
    doc.rect(offX + bBox.x * scale, offY + bBox.y * scale, bBox.width * scale, bBox.depth * scale);
    doc.setLineDashPattern([], 0);

    const floor = project.floors[floorIndex] ?? project.floors[0];
    const fp = computeFloorFootprint(project, floor);

    // Structural Grid Axes
    if (fp.hasUnits) {
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.15);
      doc.setLineDashPattern([3, 1.5, 0.8, 1.5], 0);
      fp.xAxes.forEach((ax, idx) => {
        const px = offX + ax * scale;
        doc.line(px, offY + (fp.minY - 0.8) * scale, px, offY + (fp.maxY + 0.8) * scale);
        doc.setLineDashPattern([], 0);
        doc.circle(px, offY + (fp.minY - 1.1) * scale, 2.2);
        doc.setFontSize(6);
        doc.setTextColor(185, 28, 28);
        doc.text(String(idx + 1), px, offY + (fp.minY - 1.1) * scale + 0.8, { align: 'center' });
        doc.setLineDashPattern([3, 1.5, 0.8, 1.5], 0);
      });
      fp.yAxes.forEach((ay, idx) => {
        const py = offY + ay * scale;
        doc.line(offX + (fp.minX - 0.8) * scale, py, offX + (fp.maxX + 0.8) * scale, py);
        doc.setLineDashPattern([], 0);
        doc.circle(offX + (fp.minX - 1.1) * scale, py, 2.2);
        doc.setFontSize(6);
        doc.setTextColor(185, 28, 28);
        doc.text(String.fromCharCode(65 + (idx % 26)), offX + (fp.minX - 1.1) * scale, py + 0.8, { align: 'center' });
        doc.setLineDashPattern([3, 1.5, 0.8, 1.5], 0);
      });
      doc.setLineDashPattern([], 0);
    }

    if (floor) {
      for (const inst of floor.units) {
        const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
        if (!ut) continue;
        drawUnitCADInPDF(doc, ut, inst, offX, offY, scale, sheetId);
      }
    }

    if (sheetId === 'S01') {
      doc.setFillColor(185, 28, 28);
      for (const s of project.structuralElements) {
        doc.rect(
          offX + s.x * scale,
          offY + s.y * scale,
          Math.max(1.2, s.width * scale),
          Math.max(1.2, s.depth * scale),
          'F',
        );
      }
    }
  }

  // Right Side Summary Table (x 287..407, y 35..220)
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('QUADRO RESUMO DO MODELO', 287, 38);
  doc.setFontSize(7.5);
  doc.setTextColor(55, 65, 81);
  const summaryLines = [
    `Terreno: ${site.front}m x ${site.leftDepth}m (${siteCheck.calculatedArea} m²)`,
    `Local: ${project.municipality}/${project.state}`,
    `Sistema: ${project.constructionMethod.name}`,
    `Pavimentos: ${project.floors.length} | Unidades: ${quantities.summary.totalUnits}`,
    `Área Privativa: ${quantities.summary.totalPrivateAreaM2} m²`,
    `Área Construída: ${quantities.summary.totalBuiltAreaM2} m²`,
    '',
    'TIPOLOGIAS:',
    ...(project.unitTypes.length > 0
      ? project.unitTypes.map(
          (ut) => `• ${ut.code}: ${ut.width}x${ut.depth}m (${round2(ut.width * ut.depth)}m²)`,
        )
      : ['• Nenhuma tipologia cadastrada']),
    '',
    'CONVENÇÃO CAD EXECUTIVO:',
    '— Paredes duplas c/ hachura de alvenaria',
    '— Arcos de giro 90° em portas',
    '— Eixos estruturais alfanuméricos (A-Z / 1-N)',
    '-- Linha tracejada laranja: Recuos obrigatórios',
  ];
  doc.text(summaryLines, 287, 45);

  // Page 2: Memorial & Quantitativos Resumo
  doc.addPage('a3', 'landscape');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`ANEXO TÉCNICO — QUANTITATIVOS E MEMORIAL (${project.name})`, 18, 20);
  doc.setFontSize(8);
  let yCursor = 30;
  for (const q of quantities.items.slice(0, 22)) {
    doc.text(
      `${q.code.padEnd(8)} | ${q.discipline.padEnd(12)} | ${q.description.slice(0, 62).padEnd(64)} | ${String(q.grossQuantity).padStart(8)} ${q.unit}`,
      18,
      yCursor,
    );
    yCursor += 5.5;
  }

  const memorials = generateAllMemorials(project);
  const archMem = memorials[0]?.content.split('\n').slice(0, 24) ?? [];
  doc.setFontSize(8);
  doc.text('EXTRATO DO MEMORIAL ARQUITETÔNICO:', 18, yCursor + 8);
  doc.text(archMem, 18, yCursor + 14);

  return doc.output('blob');
}

function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

// ============================================================================
// 6. COMPLETE 12-FOLDER ZIP PACKAGE ("EXPORTAR EMPREENDIMENTO COMPLETO")
// ============================================================================
export async function generateCompleteProjectZIPBlob(project: Project): Promise<Blob> {
  const zip = new JSZip();
  const memorials = generateAllMemorials(project);
  const quantities = calculateQuantities(project);
  const budget = calculateBudgetSummary(project, quantities);
  const elec = calculateElectricalSizing(project);
  const hyd = calculateHydraulicSizing(project);
  const drain = calculateDrainageSizing(project);
  const clashes = runCompatibilityAnalysis(project);

  // 01 — Arquitetura
  const f01 = zip.folder('01 — Arquitetura')!;
  f01.file('A03_Planta_Baixa_Terreo.pdf', generateTechnicalSheetPDFBlob(project, 'A03', 0));
  f01.file('A08_Fachadas_Parametricas.pdf', generateTechnicalSheetPDFBlob(project, 'A08', 0));
  f01.file('A09_Cortes_Esquematicos.pdf', generateTechnicalSheetPDFBlob(project, 'A09', 0));
  f01.file('Planta_CAD_Terreo.dxf', generateProjectDXF(project, 0));
  if (project.floors.length > 1) {
    f01.file('Planta_CAD_Superior.dxf', generateProjectDXF(project, 1));
  }

  // 02 — Elétrica & Sistemas Especiais
  const f02 = zip.folder('02 — Elétrica')!;
  f02.file('E04_Quadro_Cargas.pdf', generateTechnicalSheetPDFBlob(project, 'E04', 0));
  f02.file('E06_Instalacoes_Especiais_CFTV_Dados_TV.pdf', generateTechnicalSheetPDFBlob(project, 'E06', 0));
  f02.file('Relatorio_Dimensionamento_Eletrico.json', JSON.stringify(elec, null, 2));

  // 03 — Hidráulica
  const f03 = zip.folder('03 — Hidráulica')!;
  f03.file('H01_Agua_Fria.pdf', generateTechnicalSheetPDFBlob(project, 'H01', 0));
  f03.file('Relatorio_Hidraulico.json', JSON.stringify(hyd, null, 2));

  // 04 — Sanitária
  const f04 = zip.folder('04 — Sanitária')!;
  f04.file('H03_Esgoto_Sanitario.pdf', generateTechnicalSheetPDFBlob(project, 'H03', 0));
  f04.file('Relatorio_Sanitario.json', JSON.stringify(drain, null, 2));

  // 05 — Estrutural
  const f05 = zip.folder('05 — Estrutural')!;
  f05.file('S01_Conceitual_Nao_Dimensionado.pdf', generateTechnicalSheetPDFBlob(project, 'S01', 0));

  // 06 — Incêndio
  const f06 = zip.folder('06 — Incêndio')!;
  f06.file('I01_Prevencao_Incendio_Preliminar.pdf', generateTechnicalSheetPDFBlob(project, 'I01', 0));

  // 07 — Memorial descritivo
  const f07 = zip.folder('07 — Memorial descritivo')!;
  f07.file('Memoriais_Descritivos.docx', await generateMemorialDOCXBlob(project));
  f07.file('Memorial_Descritivo_Executivo.pdf', generateMemorialPDFBlob(project));
  f07.file(
    'Memoriais_Texto_Completo.txt',
    memorials.map((m) => `### ${m.title}\n\n${m.content}`).join('\n\n---\n\n'),
  );

  // 08 — Quantitativos
  const f08 = zip.folder('08 — Quantitativos')!;
  f08.file('Quantitativos_Empreendimento.xlsx', generateProjectXLSXBuffer(project));

  // 09 — Orçamento
  const f09 = zip.folder('09 — Orçamento')!;
  f09.file('Orcamento_Analitico_Cronograma_SINAPI_RJ.pdf', generateAnalyticalBudgetAndSchedulePDFBlob(project));
  f09.file('Orcamento_Analitico_SINAPI_RJ_Resumo.json', JSON.stringify(budget, null, 2));

  // 10 — Renderizações
  const f10 = zip.folder('10 — Renderizações')!;
  f10.file('R01_Projeto_Executivo_Renderizado.pdf', generateTechnicalSheetPDFBlob(project, 'R01', 0));
  const renders = project.capturedRenders ?? [];
  if (renders.length > 0) {
    renders.forEach((r, idx) => {
      const ext = r.dataUrl.startsWith('data:image/jpeg') ? 'jpg' : 'png';
      f10.file(`Render_${String(idx + 1).padStart(2, '0')}_${r.preset}.${ext}`, dataUrlToBase64(r.dataUrl), {
        base64: true,
      });
    });
  } else {
    f10.file(
      'LEIA_ME_RENDERIZACOES.txt',
      'Para incluir imagens PNG de renderização neste pacote, utilize o botão "Salvar na Prancha R01" dentro do módulo Modelo BIM 3D.',
    );
  }

  // 11 — Documentação
  const f11 = zip.folder('11 — Documentação')!;
  f11.file('Compatibilizacao_Conflitos.json', JSON.stringify(clashes, null, 2));
  f11.file('Capacidades_Exportacao.json', JSON.stringify(EXPORT_CAPABILITIES, null, 2));

  // 12 — Backup do projeto
  const f12 = zip.folder('12 — Backup do projeto')!;
  f12.file(`${project.code}_backup_integral.json`, generateProjectJSON(project));

  return zip.generateAsync({ type: 'blob' });
}

export function triggerBrowserDownload(blob: Blob | string, filename: string, mimeType?: string): void {
  const realBlob = typeof blob === 'string' ? new Blob([blob], { type: mimeType ?? 'text/plain;charset=utf-8' }) : blob;
  const url = URL.createObjectURL(realBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
