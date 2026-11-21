import {
  analyzeSiteGeometry,
  getRoomArea,
  getRoomPerimeter,
  round2,
} from './geometry';
import {
  calculateDrainageSizing,
  calculateElectricalSizing,
  calculateHydraulicSizing,
  calculateRainwaterSizing,
  evaluateAccessibility,
  evaluateFireSafety,
} from './engineering';
import { calculateQuantities } from './quantitiesAndBudget';
import type { Project } from '../types/project';

export interface MemorialSection {
  key: string;
  title: string;
  discipline: string;
  content: string;
}

const ni = (val?: string | number | null): string => {
  if (val === null || val === undefined) return 'NÃO INFORMADO';
  const s = String(val).trim();
  return s.length === 0 ? 'NÃO INFORMADO' : s;
};

export function generateAllMemorials(project: Project): MemorialSection[] {
  const site = analyzeSiteGeometry(project.site);
  const quantities = calculateQuantities(project);
  const elec = calculateElectricalSizing(project);
  const hyd = calculateHydraulicSizing(project);
  const drain = calculateDrainageSizing(project);
  const rain = calculateRainwaterSizing(project);
  const acc = evaluateAccessibility(project);
  const fire = evaluateFireSafety(project);

  const unitCounts = new Map<string, number>();
  for (const fl of project.floors) {
    for (const u of fl.units) {
      unitCounts.set(u.unitTypeId, (unitCounts.get(u.unitTypeId) ?? 0) + 1);
    }
  }

  const quadroAreas = project.unitTypes
    .map((ut) => {
      const q = unitCounts.get(ut.id) ?? 0;
      return `- ${ut.code} (${ut.name}): ${q} unid × ${round2(ut.width * ut.depth)} m² (${ut.width}m × ${ut.depth}m) = ${round2(q * ut.width * ut.depth)} m² | Pé-direito: ${ut.ceilingHeight} m`;
    })
    .join('\n');

  const descAmbientes = project.unitTypes
    .map((ut) => {
      const rms = ut.rooms
        .map(
          (r) =>
            `  • ${r.name} (${r.code}): ${r.width}m × ${r.depth}m = ${getRoomArea(r)} m² | Perímetro: ${getRoomPerimeter(r)} m | PD: ${r.ceilingHeight} m`,
        )
        .join('\n');
      return `${ut.code} — ${ut.name}:\n${rms || '  • NÃO INFORMADO'}`;
    })
    .join('\n\n');

  const esquadriasList = project.unitTypes
    .map((ut) => {
      const ops = ut.openings
        .map(
          (o) =>
            `  • ${o.code} (${o.type.toUpperCase()}): ${o.subtype} — ${o.width.toFixed(2)}m × ${o.height.toFixed(2)}m (peitoril ${o.sillHeight.toFixed(2)}m) — ${o.material}`,
        )
        .join('\n');
      return `${ut.code}:\n${ops || '  • Nenhuma abertura cadastrada'}`;
    })
    .join('\n\n');

  const archContent = `1. IDENTIFICAÇÃO DO EMPREENDIMENTO
Empreendimento: ${ni(project.name)} (${project.code})
Contratante: ${ni(project.client)}
Proprietário: ${ni(project.owner)}
Etapa Técnica Atual: ${project.stage.replace(/_/g, ' ').toUpperCase()}

2. OBJETIVO
O presente memorial tem por objetivo descrever as características arquitetônicas, dimensionais, construtivas e de acabamentos do empreendimento residencial compacto denominado "${ni(project.name)}".

3. LOCALIZAÇÃO
Endereço: ${ni(project.address)}
Município / UF: ${ni(project.municipality)} / ${ni(project.state)}

4. CARACTERIZAÇÃO DO TERRENO
Formato: ${project.site.shapeType}
Dimensões: Frente ${project.site.front} m | Fundos ${project.site.back} m | Lat. Esq. ${project.site.leftDepth} m | Lat. Dir. ${project.site.rightDepth} m
Área Calculada pela Geometria: ${site.calculatedArea} m² (Área Informada: ${site.declaredArea} m²)
Perímetro: ${site.calculatedPerimeter} m
Topografia: ${project.site.topography} (Desnível: ${project.site.levelDifference} m | Inclinação: ${project.site.slopePercent}%)
Recuos Cadastrados: Frontal ${project.site.setbacks.front} m | Fundos ${project.site.setbacks.back} m | Lat. Esq. ${project.site.setbacks.left} m | Lat. Dir. ${project.site.setbacks.right} m
Área Edificável Resultante: ${site.buildableBox.width} m × ${site.buildableBox.depth} m (${site.buildableBox.area} m²)
Confrontações: Frente: ${ni(project.site.confrontations.front)} | Fundos: ${ni(project.site.confrontations.back)}

5. DESCRIÇÃO DA EDIFICAÇÃO E PAVIMENTOS
Sistema Construtivo: ${project.constructionMethod.name}
Espessura de Paredes: Externas ${(project.constructionMethod.externalWallThickness * 100).toFixed(0)} cm | Internas ${(project.constructionMethod.internalWallThickness * 100).toFixed(0)} cm
Quantidade de Pavimentos: ${project.floors.length}
${project.floors.map((f) => `- ${f.name}: Cota +${f.elevation.toFixed(2)}m | Pé-direito piso a piso ${f.floorToFloorHeight.toFixed(2)}m | Unidades: ${f.units.length} | Área comum: ${f.commonAreaM2} m²`).join('\n')}

6. QUANTIDADE DE UNIDADES E TIPOLOGIAS
Total de Unidades Implantadas: ${quantities.summary.totalUnits} unidades
${quadroAreas || 'NÃO INFORMADO'}

7. QUADRO GERAL DE ÁREAS
- Área Privativa Total: ${quantities.summary.totalPrivateAreaM2} m²
- Área Comum Total: ${quantities.summary.totalCommonAreaM2} m²
- Área Construída Total Estimada: ${quantities.summary.totalBuiltAreaM2} m²

8. CARACTERÍSTICAS DOS AMBIENTES
${descAmbientes || 'NÃO INFORMADO'}

9. ESQUADRIAS
${esquadriasList || 'NÃO INFORMADO'}

10. COBERTURA
Tipo: ${project.constructionMethod.roofType.replace(/_/g, ' ')} | Inclinação: ${project.constructionMethod.roofSlopePercent}%
Isolamento / Especificação: ${ni(project.constructionMethod.insulationSpec)}

11. ACESSIBILIDADE E CONSIDERAÇÕES TÉCNICAS
Referência utilizada: ${project.accessibilityConfig.normReference}.
Nota de Responsabilidade Técnica: Este memorial reflete os parâmetros cadastrados no modelo digital. A aprovação legal junto aos órgãos municipais e a execução da obra dependem de validação e assinatura por profissionais habilitados (CAU/CREA).`;

  const materialsByRoom = project.unitTypes
    .map((ut) => {
      const body = ut.rooms
        .map((r) => {
          const elPts = ut.electricalPoints.filter((p) => p.roomId === r.id);
          const waPts = ut.waterPoints.filter((p) => p.roomId === r.id);
          const drPts = ut.drainagePoints.filter((p) => p.roomId === r.id);
          return `${r.name.toUpperCase()} (${ut.code} — ${getRoomArea(r)} m²):
- Piso: ${ni(r.finishes.floor)}
- Rodapé: ${ni(r.finishes.baseboard)}
- Parede / Revestimento: ${ni(r.finishes.wall)}
- Teto / Forro: ${ni(r.finishes.ceiling)}
- Pintura: ${ni(r.finishes.paint)}${r.finishes.countertop ? `\n- Bancada: ${r.finishes.countertop}` : ''}${r.finishes.sink ? `\n- Cuba/Lavatório: ${r.finishes.sink}` : ''}${r.finishes.faucet ? `\n- Torneira/Metais: ${r.finishes.faucet}` : ''}
- Pontos Elétricos (${elPts.length}): ${elPts.map((p) => `${p.code} (z=${p.z}m, ${p.powerVA}VA)`).join(', ') || 'Nenhum cadastrado'}
- Pontos Hidráulicos (${waPts.length}): ${waPts.map((p) => `${p.code} (${p.waterType}, Ø${p.diameterMm}mm)`).join(', ') || 'Nenhum cadastrado'}
- Pontos Sanitários (${drPts.length}): ${drPts.map((p) => `${p.code} (Ø${p.diameterMm}mm, i=${p.slopePercent}%)`).join(', ') || 'Nenhum cadastrado'}`;
        })
        .join('\n\n');
      return `=== TIPOLOGIA ${ut.code}: ${ut.name} ===\n\n${body}`;
    })
    .join('\n\n');

  const execContent = `MEMORIAL EXECUTIVO — DIRETRIZES POR ETAPA
Sistema Construtivo Adotado: ${project.constructionMethod.name}

1. SERVIÇOS PRELIMINARES E PREPARAÇÃO DO TERRENO
Limpeza, regularização conforme topografia (${project.site.topography}, desnível ${project.site.levelDifference} m), tapume e ligações provisórias.
2. LOCAÇÃO DA OBRA
Locação por gabarito respeitando recuos: frontal ${project.site.setbacks.front} m, fundos ${project.site.setbacks.back} m, laterais ${project.site.setbacks.left} m / ${project.site.setbacks.right} m.
3. FUNDAÇÃO
NÃO DIMENSIONADO AUTOMATICAMENTE: definir tipo de fundação somente após laudo de sondagem geotécnica (SPT) e projeto estrutural específico (ABNT NBR 6122).
4. ESTRUTURA
Elementos modelados em nível conceitual (${project.structuralElements.length} elementos). A execução exige projeto estrutural completo assinado por Engenheiro Civil.
5. VEDAÇÕES E SISTEMA CONSTRUTIVO
Método: ${project.constructionMethod.name} (${ni(project.constructionMethod.masonryBlockType ?? project.constructionMethod.lsfProfileSpec ?? project.constructionMethod.woodSection ?? project.constructionMethod.precastPanelSpec)}).
Paredes externas: ${(project.constructionMethod.externalWallThickness * 100).toFixed(0)} cm | Internas: ${(project.constructionMethod.internalWallThickness * 100).toFixed(0)} cm.
6. COBERTURA E IMPERMEABILIZAÇÃO
Cobertura em ${project.constructionMethod.roofType.replace(/_/g, ' ')}, inclinação ${project.constructionMethod.roofSlopePercent}%. Impermeabilização obrigatória em áreas molhadas (banheiros, cozinhas, áreas de serviço e baldrames).
7. INSTALAÇÕES, REVESTIMENTOS, ESQUADRIAS E PINTURA
Seguir integralmente os memoriais específicos de elétrica, hidráulica, esgoto e especificações por ambiente.
8. LIMPEZA E ENTREGA
Limpeza fina pós-obra, testes de estanqueidade hidráulica/sanitária e ensaios elétricos antes da entrega.`;

  const specialPtsTotal = project.unitTypes.reduce((acc, ut) => {
    const unitQty = unitCounts.get(ut.id) ?? 0;
    const espCount = ut.electricalPoints.filter((p) =>
      ['dados', 'tv', 'antena_tv', 'wifi_ap', 'cftv', 'rack_ti', 'interfone'].includes(p.category),
    ).length;
    return acc + espCount * unitQty;
  }, 0);

  const elecContent = `MEMORIAL DE INSTALAÇÕES ELÉTRICAS E SISTEMAS ESPECIAIS
Unidades Implantadas: ${elec.totalUnits}
Potência Instalada Total: ${elec.totalInstalledKVA} kVA
Potência de Demanda Estimada (Preliminar): ${elec.totalDemandKVA} kVA
Critério de Demanda: ${elec.diversityNote}

Alturas-Padrão Cadastradas no Projeto:
- Tomada Baixa: ${project.electricalHeights.tomadaBaixa.toFixed(2)} m
- Tomada Média: ${project.electricalHeights.tomadaMedia.toFixed(2)} m
- Tomada Alta: ${project.electricalHeights.tomadaAlta.toFixed(2)} m
- Interruptor: ${project.electricalHeights.interruptor.toFixed(2)} m
- Ar-Condicionado: ${project.electricalHeights.arCondicionado.toFixed(2)} m
- Chuveiro: ${project.electricalHeights.chuveiro.toFixed(2)} m

Instalações Especiais e Telecomunicações (CFTV, Antena Coletiva/TV, Internet/Dados & Interfonia):
- Pontos Especiais Totais nas Unidades: ${specialPtsTotal} pontos (C7-ESP)
- Infraestrutura de Dados/Internet: Cabeamento estruturado UTP Cat6 estrela até Rack TI Central (19" 12U) com Switch PoE Gerenciável e Access Point Wi-Fi 6 por unidade.
- Antena Coletiva / TV Digital: Mastro de captação UHF/HDTV em cobertura, amplificador de linha e distribuidores coaxiais RG6 para pontos de TV em cada tipologia.
- Segurança / CFTV e Interfonia: Gravador NVR 8/16 canais com HD dedicado no Rack Técnico, câmeras IP bullet/dome nas fachadas, acessos e corredores comuns + interfone digital por unidade.

Resumo por Tipologia:
${elec.byUnitType
  .map(
    (u) =>
      `${u.unitTypeName} — Instalada: ${u.installedPowerVA} VA | Demanda: ${u.demandPowerVA} VA\n` +
      u.circuits
        .map(
          (c) =>
            `  • ${c.circuitId}: ${c.voltage}V | ${c.totalPowerVA}VA | ${c.currentA}A | Disj. ${c.recommendedBreakerA}A | Cabo ${c.conductorMm2}mm² | Eletroduto Ø${c.conduitMm}mm | ΔV=${c.voltageDropPercent}%`,
        )
        .join('\n'),
  )
  .join('\n\n')}

Pendências / Alertas:
${elec.pendingItems.length > 0 ? elec.pendingItems.map((p) => `- ${p}`).join('\n') : 'Nenhuma pendência de cadastro detectada nas tipologias.'}`;

  const hydContent = `MEMORIAL DE INSTALAÇÕES HIDRÁULICAS (ÁGUA FRIA E QUENTE)
Material Água Fria: ${project.hydraulicConfig.coldWaterMaterial}
Material Água Quente: ${project.hydraulicConfig.hasHotWaterHeating ? project.hydraulicConfig.hotWaterMaterial : 'Não previsto'}
População Estimada: ${hyd.estimatedPopulation} habitantes (${hyd.totalUnits} unid × ${project.hydraulicConfig.occupantsPerUnit} hab/unid)
Consumo Diário: ${hyd.dailyConsumptionLiters} litros/dia (${project.hydraulicConfig.litersPerPersonDay} L/hab·dia)
Reservação Total Recomendada (${project.hydraulicConfig.reserveDays} dias): ${hyd.recommendedTotalReservoirLiters} litros
- Reservatório Inferior Sugerido (60%): ${hyd.lowerReservoirLiters} L
- Reservatório Superior Sugerido (40%): ${hyd.upperReservoirLiters} L
Metodologia: ${hyd.reservoirMethodology}

Dimensionamento de Sub-ramais por Tipologia (NBR 5626):
${hyd.byUnitType
  .map(
    (u) =>
      `- ${u.unitTypeName}: AF=${u.coldWaterPoints} pts, AQ=${u.hotWaterPoints} pts | ΣP=${u.sumWeightsCold} | Vazão provável Q=${u.probableFlowColdLs} L/s | Ramal Ø${u.recommendedBranchDiameterMm}mm (v=${u.estimatedVelocityMs} m/s)`,
  )
  .join('\n')}`;

  const sanContent = `MEMORIAL DE INSTALAÇÕES SANITÁRIAS E ESGOTO
${drain
  .map(
    (d) =>
      `- ${d.unitTypeName}: ΣUHC = ${d.totalUHC} | Tubo de queda recomendado: Ø${d.recommendedStackMm}mm\n  Metodologia: ${d.methodology}` +
      (d.slopeIssues.length ? `\n  Alertas de declividade: ${d.slopeIssues.join('; ')}` : '') +
      (d.unconnectedPoints.length ? `\n  Alertas de conexão: ${d.unconnectedPoints.join('; ')}` : ''),
  )
  .join('\n\n')}`;

  const rainContent = `MEMORIAL DE ÁGUAS PLUVIAIS
Área de Captação Total Cadastrada: ${rain.totalCatchmentAreaM2} m²
Intensidade Pluviométrica Informada: ${project.rainwaterConfig.rainfallIntensityMmH ?? 'NÃO INFORMADO'} mm/h
Fonte / Período de Referência: ${ni(project.rainwaterConfig.sourceReference)} (${ni(project.rainwaterConfig.referencePeriod)})
Situação do Cálculo: ${rain.status === 'calculado' ? `Vazão de Projeto = ${rain.flowLMin} L/min` : 'PENDENTE — DADOS PLUVIOMÉTRICOS NÃO INFORMADOS'}
${rain.methodology}`;

  const structHasDimensioned = project.structuralElements.some((s) => s.isDimensioned);
  const structContent = structHasDimensioned
    ? `MEMORIAL ESTRUTURAL\nElementos dimensionados cadastrados: ${project.structuralElements.length}.`
    : `MEMORIAL ESTRUTURAL (MODELAGEM CONCEITUAL — NÃO DIMENSIONADO)
AVISO TÉCNICO: Não foi executado motor de cálculo estrutural definitivo. Os ${project.structuralElements.length} elementos estruturais lançados (pilares, lajes, escada) representam apenas geometria conceitual e estimativa volumétrica preliminar.
É obrigatória a elaboração de cálculo estrutural completo (ABNT NBR 6118 / 6120 / 6122 / 8800) por Engenheiro Civil habilitado.`;

  const accContent = `MEMORIAL DE ACESSIBILIDADE (${project.accessibilityConfig.normReference})
${acc.map((i) => `[${i.status}] ${i.code} — ${i.criterion}: Esperado ${i.expected} | Encontrado: ${i.found}`).join('\n')}`;

  const fireContent = `MEMORIAL PRELIMINAR DE PREVENÇÃO E COMBATE A INCÊNDIO
Ocupação: ${project.fireSafetyNotes.occupancyClass}
Regulamentação Estadual: ${project.fireSafetyNotes.stateRegulation}
${fire.map((i) => `[${i.status}] ${i.code} — ${i.criterion}: ${i.found}`).join('\n')}`;

  const rawSections: MemorialSection[] = [
    { key: 'arquitetonico', title: 'Memorial Descritivo Arquitetônico', discipline: 'Arquitetura', content: archContent },
    { key: 'materiais', title: 'Memorial de Materiais por Ambiente', discipline: 'Arquitetura', content: materialsByRoom },
    { key: 'executivo', title: 'Memorial Executivo de Obra', discipline: 'Execução', content: execContent },
    { key: 'eletrico', title: 'Memorial de Instalações Elétricas', discipline: 'Elétrica', content: elecContent },
    { key: 'hidraulico', title: 'Memorial de Instalações Hidráulicas', discipline: 'Hidráulica', content: hydContent },
    { key: 'sanitario', title: 'Memorial de Instalações Sanitárias', discipline: 'Sanitária', content: sanContent },
    { key: 'pluvial', title: 'Memorial de Águas Pluviais', discipline: 'Pluvial', content: rainContent },
    { key: 'estrutural', title: 'Memorial Estrutural (Conceitual)', discipline: 'Estrutura', content: structContent },
    { key: 'acessibilidade', title: 'Memorial de Acessibilidade', discipline: 'Acessibilidade', content: accContent },
    { key: 'incendio', title: 'Memorial de Prevenção e Combate a Incêndio', discipline: 'Incêndio', content: fireContent },
  ];

  // Apply user manual overrides if present
  return rawSections.map((sec) => ({
    ...sec,
    content: project.memorialOverrides[sec.key] ?? sec.content,
  }));
}
