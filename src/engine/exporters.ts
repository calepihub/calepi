import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
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

      // Double-line walls split by openings
      for (const wall of ut.walls) {
        const spans = splitWallByOpenings(wall, ut.openings);
        const layer = wall.isExternal ? 'PAREDES_EXT' : 'PAREDES_INT';
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

      // CAD Doors (leaf + 90 deg arc) & Windows (triple glazing lines)
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
          const ang = (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI;
          const leafTip = {
            x: pa.x + Math.cos(((ang + 90) * Math.PI) / 180) * op.width,
            y: pa.y + Math.sin(((ang + 90) * Math.PI) / 180) * op.width,
          };
          entities.push(dxfLine(pa.x, pa.y, leafTip.x, leafTip.y, 'ESQUADRIAS'));
          entities.push(dxfArc(pa.x, pa.y, op.width, ang, ang + 90, 'ESQUADRIAS'));
        } else {
          const quad = getWallQuadWorld(pa, pb, wall.thickness * 0.7);
          entities.push(dxfClosedPoly(quad, 'ESQUADRIAS'));
          entities.push(dxfLine(pa.x, pa.y, pb.x, pb.y, 'ESQUADRIAS'));
        }
      }

      for (const fur of ut.furniture) {
        const p1 = unitLocalToWorld(inst, ut, fur.x, fur.y);
        const p2 = unitLocalToWorld(inst, ut, fur.x + fur.width, fur.y);
        const p3 = unitLocalToWorld(inst, ut, fur.x + fur.width, fur.y + fur.depth);
        const p4 = unitLocalToWorld(inst, ut, fur.x, fur.y + fur.depth);
        entities.push(dxfClosedPoly([p1, p2, p3, p4], 'MOBILIARIO'));
        if (fur.category === 'box') {
          entities.push(dxfLine(p1.x, p1.y, p3.x, p3.y, 'MOBILIARIO'));
          entities.push(dxfLine(p2.x, p2.y, p4.x, p4.y, 'MOBILIARIO'));
        } else if (fur.category === 'geladeira') {
          entities.push(dxfLine(p1.x, p1.y, p3.x, p3.y, 'MOBILIARIO'));
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
// 3. EXCEL XLSX EXPORTER (Multi-sheet workbook with SINAPI-RJ code)
// ============================================================================
export function generateProjectXLSXBuffer(project: Project): Uint8Array {
  const quantities = calculateQuantities(project);
  const budget = calculateBudgetSummary(project, quantities);
  const elec = calculateElectricalSizing(project);
  const wb = XLSX.utils.book_new();

  // Sheet 1: Resumo do Empreendimento
  const siteCheck = analyzeSiteGeometry(project.site);
  const summaryRows = [
    ['KITNET PRO STUDIO — RESUMO TÉCNICO DO EMPREENDIMENTO'],
    ['Empreendimento', project.name],
    ['Código', project.code],
    ['Contratante', project.client],
    ['Município / UF', `${project.municipality} / ${project.state}`],
    ['Etapa', project.stage],
    ['Sistema Construtivo', project.constructionMethod.name],
    ['Base Orçamentária', project.budgetSettings.sourceBase],
    ['Área do Terreno (Geometria)', `${siteCheck.calculatedArea} m²`],
    ['Pavimentos', project.floors.length],
    ['Total de Unidades', quantities.summary.totalUnits],
    ['Área Privativa Total', `${quantities.summary.totalPrivateAreaM2} m²`],
    ['Área Comum Total', `${quantities.summary.totalCommonAreaM2} m²`],
    ['Área Construída Total', `${quantities.summary.totalBuiltAreaM2} m²`],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Resumo');

  // Sheet 2: Quantitativos
  const qtyRows = [
    ['Código', 'Disciplina', 'Descrição', 'Unidade', 'Qtd Líquida', 'Perda (%)', 'Qtd c/ Perda', 'Critério de Medição', 'Memória de Cálculo'],
    ...quantities.items.map((q) => [
      q.code,
      q.discipline,
      q.description,
      q.unit,
      q.netQuantity,
      q.lossFactorPercent,
      q.grossQuantity,
      q.measurementCriterion,
      q.calculationMemory,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(qtyRows), 'Quantitativos');

  // Sheet 3: Orçamento (with SINAPI-RJ code)
  const bdgRows = [
    ['Código', 'Código SINAPI-RJ', 'Descrição', 'Disciplina', 'Unid.', 'Qtd Efetiva', 'Preço Unit. (R$)', 'Subtotal (R$)', 'Classe ABC', 'Base / Fornecedor'],
    ...budget.lines.map((l) => [
      l.code,
      l.sinapiCode || '—',
      l.description,
      l.discipline,
      l.unit,
      l.effectiveQuantity,
      l.unitPrice !== null ? l.unitPrice : 'SEM COTAÇÃO',
      l.subtotal !== null ? l.subtotal : 'SEM COTAÇÃO',
      l.abcClass,
      `${l.sourceBase} ${l.supplier ? `(${l.supplier})` : ''}`,
    ]),
    [],
    ['Custo Direto Cotado (R$)', budget.directTotalCost],
    [`Custos Indiretos (${project.budgetSettings.indirectCostsPercent}%)`, budget.indirectCost],
    [`BDI (${project.budgetSettings.bdiPercent}%)`, budget.bdiValue],
    ['Total Geral Cotado (R$)', budget.grandTotalCost],
    ['Itens Sem Cotação', budget.unquotedCount],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bdgRows), 'Orçamento');

  // Sheet 4: Quadro de Cargas Elétricas
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
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(elecRows), 'Quadro de Cargas');

  // Sheet 5: Pontos Elétricos, Hidráulicos e Sanitários
  const ptsRows = [
    ['Tipologia', 'Disciplina', 'Código', 'Descrição / Equipamento', 'X (m)', 'Y (m)', 'Altura Z (m)', 'Especificação'],
    ...project.unitTypes.flatMap((ut) => [
      ...ut.electricalPoints.map((p) => [ut.code, 'Elétrica', p.code, p.label, p.x, p.y, p.z, `${p.powerVA}VA / ${p.voltage}V / ${p.circuitId}`]),
      ...ut.waterPoints.map((p) => [ut.code, 'Hidráulica', p.code, p.equipment, p.x, p.y, p.z, `${p.waterType} Ø${p.diameterMm}mm (${p.material})`]),
      ...ut.drainagePoints.map((p) => [ut.code, 'Sanitária', p.code, p.category, p.x, p.y, 0, `Ø${p.diameterMm}mm i=${p.slopePercent}% UHC=${p.uhc}`]),
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ptsRows), 'Pontos MEP');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Uint8Array(out);
}

// ============================================================================
// 4. EDITABLE DOCX MEMORIAL EXPORTER
// ============================================================================
export async function generateMemorialDOCXBlob(project: Project): Promise<Blob> {
  const sections = generateAllMemorials(project);
  const children: Paragraph[] = [
    new Paragraph({
      text: `KITNET PRO STUDIO — MEMORIAIS DESCRITIVOS E ESPECIFICAÇÕES TÉCNICAS`,
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Empreendimento: ${project.name} (${project.code})`, bold: true }),
      ],
    }),
    new Paragraph({
      text: `Município/UF: ${project.municipality}/${project.state} | Etapa: ${project.stage} | Data: ${new Date().toLocaleDateString('pt-BR')}`,
    }),
    new Paragraph({ text: '' }),
  ];

  for (const sec of sections) {
    children.push(
      new Paragraph({
        text: `${sec.title} (${sec.discipline})`,
        heading: HeadingLevel.HEADING_1,
      }),
    );
    for (const line of sec.content.split('\n')) {
      children.push(new Paragraph({ text: line }));
    }
    children.push(new Paragraph({ text: '' }));
  }

  const doc = new Document({
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
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

  // Double-line walls split by openings
  for (const w of ut.walls) {
    const spans = splitWallByOpenings(w, ut.openings);
    doc.setDrawColor(15, 23, 42);
    doc.setFillColor(w.isExternal ? 148 : 203, w.isExternal ? 163 : 213, w.isExternal ? 184 : 225);
    doc.setLineWidth(w.isExternal ? 0.42 : 0.25);

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

  // Openings (Door leaves + quarter-arc approximation / Triple window lines)
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
    } else {
      doc.setDrawColor(2, 132, 199);
      doc.setLineWidth(0.28);
      doc.line(mapX(pa.x), mapY(pa.y), mapX(pb.x), mapY(pb.y));
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
          doc.addImage(r.dataUrl, 'PNG', rx, ry, boxW, boxH);
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
    for (const fl of frontElev.floors) {
      doc.setFillColor(148, 163, 184);
      doc.rect(x0, yBase - fl.baseY * sc, frontElev.totalWidth * sc, 2.2, 'FD');
      doc.setDrawColor(15, 23, 42);
      doc.rect(x0, yBase - fl.slabTopY * sc, 2.2, (fl.slabTopY - fl.baseY) * sc, 'FD');
      doc.rect(x0 + frontElev.totalWidth * sc - 2.2, yBase - fl.slabTopY * sc, 2.2, (fl.slabTopY - fl.baseY) * sc, 'FD');
      doc.setFontSize(7.5);
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
  f07.file(
    'Memoriais_Texto_Completo.txt',
    memorials.map((m) => `### ${m.title}\n\n${m.content}`).join('\n\n---\n\n'),
  );

  // 08 — Quantitativos
  const f08 = zip.folder('08 — Quantitativos')!;
  f08.file('Quantitativos_Empreendimento.xlsx', generateProjectXLSXBuffer(project));

  // 09 — Orçamento
  const f09 = zip.folder('09 — Orçamento')!;
  f09.file('Orcamento_Analitico_SINAPI_RJ_Resumo.json', JSON.stringify(budget, null, 2));

  // 10 — Renderizações
  const f10 = zip.folder('10 — Renderizações')!;
  f10.file('R01_Projeto_Executivo_Renderizado.pdf', generateTechnicalSheetPDFBlob(project, 'R01', 0));
  const renders = project.capturedRenders ?? [];
  if (renders.length > 0) {
    renders.forEach((r, idx) => {
      f10.file(`Render_${String(idx + 1).padStart(2, '0')}_${r.preset}.png`, dataUrlToBase64(r.dataUrl), {
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
