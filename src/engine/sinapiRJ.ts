import { round2 } from './geometry';
import type { QuantitiesReport } from './quantitiesAndBudget';
import type { BudgetEntry, ConstructionMethodId, Project } from '../types/project';

export type SinapiRJRegime = 'desonerado' | 'nao_desonerado';

export type ConstructionStageName =
  | '01. Serviços Preliminares e Canteiro'
  | '02. Infraestrutura e Fundações'
  | '03. Superestrutura e Lajes'
  | '04. Alvenaria, Vedações e Cobertura'
  | '05. Instalações Elétricas e Especiais'
  | '06. Instalações Hidrossanitárias'
  | '07. Impermeabilização, Revestimentos e Pintura'
  | '08. Esquadrias, Louças e Bancadas';

export interface SinapiRJReferenceItem {
  internalCode: string;
  sinapiCode: string;
  sinapiDescription: string;
  unit: string;
  priceDesoneradoRJ: number;
  priceNaoDesoneradoRJ: number;
  materialRatio: number; // Fração de Material (0..1); complemento (1 - materialRatio) = Mão de Obra + Encargos RJ
  stageGroup: ConstructionStageName;
  category: BudgetEntry['category'];
}

export const SINAPI_RJ_METADATA = {
  uf: 'RJ',
  stateName: 'Rio de Janeiro',
  sourceLabel: 'CAIXA / IBGE — Tabela SINAPI Rio de Janeiro (RJ)',
  competenceLabel: 'Referência Base SINAPI-RJ (Com / Sem Desoneração)',
  encargosDesoneradoPercent: 86.87,
  encargosNaoDesoneradoPercent: 114.45,
  recommendedBdiPercent: 22.0,
  disclaimer:
    'Composições unitárias referenciais SINAPI-RJ (CAIXA/IBGE) com e sem desoneração de folha (encargos sociais RJ). Os preços são aplicados automaticamente conforme a quantificação do modelo e permanecem 100% editáveis.',
};

/**
 * Mapeamento completo das composições CAIXA SINAPI aplicadas ao Estado do Rio de Janeiro (RJ).
 */
export const SINAPI_RJ_CATALOG: Record<string, SinapiRJReferenceItem> = {
  'PRE-01': {
    internalCode: 'PRE-01',
    sinapiCode: '99059',
    sinapiDescription: 'Locação convencional de obra através de gabarito de tábuas corridas pontaletadas (SINAPI-RJ)',
    unit: 'm²',
    priceDesoneradoRJ: 34.9,
    priceNaoDesoneradoRJ: 38.6,
    materialRatio: 0.38,
    stageGroup: '01. Serviços Preliminares e Canteiro',
    category: 'servico',
  },
  'PRE-02': {
    internalCode: 'PRE-02',
    sinapiCode: '74220',
    sinapiDescription: 'Tapume de chapa compensada resinada 6mm + placa de obra e ligações provisórias (SINAPI-RJ)',
    unit: 'm²',
    priceDesoneradoRJ: 124.8,
    priceNaoDesoneradoRJ: 133.4,
    materialRatio: 0.64,
    stageGroup: '01. Serviços Preliminares e Canteiro',
    category: 'servico',
  },
  'FUN-01': {
    internalCode: 'FUN-01',
    sinapiCode: '96556',
    sinapiDescription: 'Concretagem e armação de viga baldrame / blocos de fundação fck=25MPa (conceitual SINAPI-RJ)',
    unit: 'm³',
    priceDesoneradoRJ: 812.0,
    priceNaoDesoneradoRJ: 865.0,
    materialRatio: 0.62,
    stageGroup: '02. Infraestrutura e Fundações',
    category: 'servico',
  },
  'EST-01': {
    internalCode: 'EST-01',
    sinapiCode: '94964',
    sinapiDescription: 'Concreto usinado fck=25MPa bombeado com lançamento e adensamento em lajes e pilares',
    unit: 'm³',
    priceDesoneradoRJ: 695.0,
    priceNaoDesoneradoRJ: 726.0,
    materialRatio: 0.74,
    stageGroup: '03. Superestrutura e Lajes',
    category: 'servico',
  },
  'EST-02': {
    internalCode: 'EST-02',
    sinapiCode: '92412',
    sinapiDescription: 'Montagem e desmontagem de fôrma de laje e pilares em chapa compensada resinada',
    unit: 'm²',
    priceDesoneradoRJ: 118.4,
    priceNaoDesoneradoRJ: 129.8,
    materialRatio: 0.44,
    stageGroup: '03. Superestrutura e Lajes',
    category: 'servico',
  },
  'ARQ-01': {
    internalCode: 'ARQ-01',
    sinapiCode: '87519',
    sinapiDescription: 'Alvenaria de vedação de blocos cerâmicos furados 14x19x19cm e argamassa mista (ext.)',
    unit: 'm²',
    priceDesoneradoRJ: 98.4,
    priceNaoDesoneradoRJ: 106.85,
    materialRatio: 0.54,
    stageGroup: '04. Alvenaria, Vedações e Cobertura',
    category: 'servico',
  },
  'ARQ-02': {
    internalCode: 'ARQ-02',
    sinapiCode: '87495',
    sinapiDescription: 'Alvenaria de vedação de blocos cerâmicos furados 9x19x19cm (parede interna)',
    unit: 'm²',
    priceDesoneradoRJ: 76.9,
    priceNaoDesoneradoRJ: 83.6,
    materialRatio: 0.52,
    stageGroup: '04. Alvenaria, Vedações e Cobertura',
    category: 'servico',
  },
  'ARQ-03': {
    internalCode: 'ARQ-03',
    sinapiCode: '96359',
    sinapiDescription: 'Parede Drywall estruturada em perfis aço galvanizado 70mm + placa gesso ST/RU + lã mineral (interna SINAPI-RJ)',
    unit: 'm²',
    priceDesoneradoRJ: 128.6,
    priceNaoDesoneradoRJ: 136.8,
    materialRatio: 0.66,
    stageGroup: '04. Alvenaria, Vedações e Cobertura',
    category: 'servico',
  },
  'ALV-01': {
    internalCode: 'ALV-01',
    sinapiCode: '00007257',
    sinapiDescription: 'Bloco cerâmico de vedação 9x19x19cm / 14x19x19cm (insumo SINAPI-RJ)',
    unit: 'un',
    priceDesoneradoRJ: 1.68,
    priceNaoDesoneradoRJ: 1.68,
    materialRatio: 1.0,
    stageGroup: '04. Alvenaria, Vedações e Cobertura',
    category: 'material',
  },
  'ALV-02': {
    internalCode: 'ALV-02',
    sinapiCode: '87292',
    sinapiDescription: 'Argamassa traço 1:2:8 (cimento, cal hidratada e areia média) preparo mecânico',
    unit: 'm³',
    priceDesoneradoRJ: 564.2,
    priceNaoDesoneradoRJ: 589.4,
    materialRatio: 0.78,
    stageGroup: '04. Alvenaria, Vedações e Cobertura',
    category: 'material',
  },
  'COB-01': {
    internalCode: 'COB-01',
    sinapiCode: '94213',
    sinapiDescription: 'Telhamento com telha metálica termoacústica sanduíche e estrutura leve de apoio (SINAPI-RJ)',
    unit: 'm²',
    priceDesoneradoRJ: 228.5,
    priceNaoDesoneradoRJ: 243.9,
    materialRatio: 0.72,
    stageGroup: '04. Alvenaria, Vedações e Cobertura',
    category: 'servico',
  },
  'IMP-01': {
    internalCode: 'IMP-01',
    sinapiCode: '98557',
    sinapiDescription: 'Impermeabilização de áreas molhadas e baldrames com argamassa polimérica 3 demãos (SINAPI-RJ)',
    unit: 'm²',
    priceDesoneradoRJ: 62.4,
    priceNaoDesoneradoRJ: 68.1,
    materialRatio: 0.58,
    stageGroup: '07. Impermeabilização, Revestimentos e Pintura',
    category: 'servico',
  },
  'REV-01': {
    internalCode: 'REV-01',
    sinapiCode: '87248',
    sinapiDescription: 'Revestimento cerâmico / porcelanato para piso com placas esmaltadas (RJ)',
    unit: 'm²',
    priceDesoneradoRJ: 112.6,
    priceNaoDesoneradoRJ: 121.4,
    materialRatio: 0.63,
    stageGroup: '07. Impermeabilização, Revestimentos e Pintura',
    category: 'servico',
  },
  'REV-02': {
    internalCode: 'REV-02',
    sinapiCode: '87269',
    sinapiDescription: 'Revestimento cerâmico para paredes internas áreas molhadas c/ argamassa AC-II',
    unit: 'm²',
    priceDesoneradoRJ: 104.3,
    priceNaoDesoneradoRJ: 112.9,
    materialRatio: 0.6,
    stageGroup: '07. Impermeabilização, Revestimentos e Pintura',
    category: 'servico',
  },
  'PIN-01': {
    internalCode: 'PIN-01',
    sinapiCode: '88489',
    sinapiDescription: 'Aplicação manual de tinta látex acrílica em paredes internas e tetos, duas demãos',
    unit: 'm²',
    priceDesoneradoRJ: 34.8,
    priceNaoDesoneradoRJ: 38.9,
    materialRatio: 0.42,
    stageGroup: '07. Impermeabilização, Revestimentos e Pintura',
    category: 'servico',
  },
  'FOR-01': {
    internalCode: 'FOR-01',
    sinapiCode: '96111',
    sinapiDescription: 'Forro em placas de gesso acartonado drywall standard 12,5mm estruturado',
    unit: 'm²',
    priceDesoneradoRJ: 79.5,
    priceNaoDesoneradoRJ: 86.2,
    materialRatio: 0.56,
    stageGroup: '07. Impermeabilização, Revestimentos e Pintura',
    category: 'servico',
  },
  'ROD-01': {
    internalCode: 'ROD-01',
    sinapiCode: '88649',
    sinapiDescription: 'Rodapé cerâmico / porcelanato altura 7 a 10cm assentado com argamassa',
    unit: 'm',
    priceDesoneradoRJ: 29.4,
    priceNaoDesoneradoRJ: 32.15,
    materialRatio: 0.55,
    stageGroup: '07. Impermeabilização, Revestimentos e Pintura',
    category: 'servico',
  },
  'ESQ-01': {
    internalCode: 'ESQ-01',
    sinapiCode: '91306',
    sinapiDescription: 'Kit porta de madeira completa (folha, marco, alizar, dobradiças e fechadura)',
    unit: 'un',
    priceDesoneradoRJ: 985.0,
    priceNaoDesoneradoRJ: 1048.0,
    materialRatio: 0.72,
    stageGroup: '08. Esquadrias, Louças e Bancadas',
    category: 'servico',
  },
  'ESQ-02': {
    internalCode: 'ESQ-02',
    sinapiCode: '94570',
    sinapiDescription: 'Janela de alumínio anodizado de correr 2 folhas com vidro liso instalado',
    unit: 'un',
    priceDesoneradoRJ: 890.0,
    priceNaoDesoneradoRJ: 942.5,
    materialRatio: 0.76,
    stageGroup: '08. Esquadrias, Louças e Bancadas',
    category: 'servico',
  },
  'ESQ-03': {
    internalCode: 'ESQ-03',
    sinapiCode: '94565',
    sinapiDescription: 'Vitrô / Janela basculante ou maxim-ar de alumínio anodizado c/ vidro mini-boreal instalado',
    unit: 'un',
    priceDesoneradoRJ: 465.0,
    priceNaoDesoneradoRJ: 492.0,
    materialRatio: 0.74,
    stageGroup: '08. Esquadrias, Louças e Bancadas',
    category: 'servico',
  },
  'MEZ-01': {
    internalCode: 'MEZ-01',
    sinapiCode: '92543',
    sinapiDescription: 'Plataforma de mezanino em perfis metálicos + piso estrutural + guarda-corpo h=1,05m (SINAPI-RJ)',
    unit: 'm²',
    priceDesoneradoRJ: 645.0,
    priceNaoDesoneradoRJ: 688.0,
    materialRatio: 0.71,
    stageGroup: '03. Superestrutura e Lajes',
    category: 'servico',
  },
  'ESC-01': {
    internalCode: 'ESC-01',
    sinapiCode: '92548',
    sinapiDescription: 'Escada interna planejada p/ mezanino em aço/madeira com corrimão ergonômico (Blondel)',
    unit: 'un',
    priceDesoneradoRJ: 4250.0,
    priceNaoDesoneradoRJ: 4540.0,
    materialRatio: 0.68,
    stageGroup: '03. Superestrutura e Lajes',
    category: 'servico',
  },
  'ELE-01': {
    internalCode: 'ELE-01',
    sinapiCode: '91947',
    sinapiDescription: 'Tomada baixa/média/alta 2P+T 10A/20A 250V embutida c/ placa e suporte',
    unit: 'pt',
    priceDesoneradoRJ: 68.5,
    priceNaoDesoneradoRJ: 74.2,
    materialRatio: 0.55,
    stageGroup: '05. Instalações Elétricas e Especiais',
    category: 'servico',
  },
  'ELE-02': {
    internalCode: 'ELE-02',
    sinapiCode: '91953',
    sinapiDescription: 'Interruptor simples/paralelo 10A 250V embutido c/ suporte e espelho',
    unit: 'pt',
    priceDesoneradoRJ: 59.4,
    priceNaoDesoneradoRJ: 64.6,
    materialRatio: 0.52,
    stageGroup: '05. Instalações Elétricas e Especiais',
    category: 'servico',
  },
  'ELE-03': {
    internalCode: 'ELE-03',
    sinapiCode: '97600',
    sinapiDescription: 'Ponto de iluminação com luminária LED de sobrepor/embutir instalada no teto',
    unit: 'pt',
    priceDesoneradoRJ: 118.0,
    priceNaoDesoneradoRJ: 126.5,
    materialRatio: 0.68,
    stageGroup: '05. Instalações Elétricas e Especiais',
    category: 'servico',
  },
  'ELE-04': {
    internalCode: 'ELE-04',
    sinapiCode: '91834',
    sinapiDescription: 'Eletroduto flexível corrugado PVC DN 25mm embutido em alvenaria/laje',
    unit: 'm',
    priceDesoneradoRJ: 14.2,
    priceNaoDesoneradoRJ: 15.65,
    materialRatio: 0.45,
    stageGroup: '05. Instalações Elétricas e Especiais',
    category: 'servico',
  },
  'ELE-05': {
    internalCode: 'ELE-05',
    sinapiCode: '91926',
    sinapiDescription: 'Cabo de cobre flexível isolado 2,5mm² / 4,0mm² 450/750V instalado em eletroduto',
    unit: 'm',
    priceDesoneradoRJ: 8.95,
    priceNaoDesoneradoRJ: 9.7,
    materialRatio: 0.62,
    stageGroup: '05. Instalações Elétricas e Especiais',
    category: 'servico',
  },
  'ESP-01': {
    internalCode: 'ESP-01',
    sinapiCode: '98298',
    sinapiDescription: 'Ponto lógico/telecom RJ45 Cat6, antena coaxial, Wi-Fi PoE, CFTV IP ou interfone instalado',
    unit: 'pt',
    priceDesoneradoRJ: 164.5,
    priceNaoDesoneradoRJ: 178.2,
    materialRatio: 0.65,
    stageGroup: '05. Instalações Elétricas e Especiais',
    category: 'servico',
  },
  'HID-01': {
    internalCode: 'HID-01',
    sinapiCode: '89957',
    sinapiDescription: 'Ponto de utilização água fria/quente com joelho azul/adaptador e registro',
    unit: 'pt',
    priceDesoneradoRJ: 138.0,
    priceNaoDesoneradoRJ: 149.2,
    materialRatio: 0.56,
    stageGroup: '06. Instalações Hidrossanitárias',
    category: 'servico',
  },
  'HID-02': {
    internalCode: 'HID-02',
    sinapiCode: '89356',
    sinapiDescription: 'Tubo PVC soldável DN 25mm instalado em ramal ou distribuição predial',
    unit: 'm',
    priceDesoneradoRJ: 26.4,
    priceNaoDesoneradoRJ: 28.9,
    materialRatio: 0.54,
    stageGroup: '06. Instalações Hidrossanitárias',
    category: 'servico',
  },
  'SAN-01': {
    internalCode: 'SAN-01',
    sinapiCode: '89707',
    sinapiDescription: 'Caixa sifonada / ralo seco PVC 100x100x50mm com grelha e conexões sanitárias',
    unit: 'pt',
    priceDesoneradoRJ: 124.5,
    priceNaoDesoneradoRJ: 134.8,
    materialRatio: 0.58,
    stageGroup: '06. Instalações Hidrossanitárias',
    category: 'servico',
  },
  'SAN-02': {
    internalCode: 'SAN-02',
    sinapiCode: '89712',
    sinapiDescription: 'Tubo PVC série normal esgoto predial DN 50/100mm instalado',
    unit: 'm',
    priceDesoneradoRJ: 42.6,
    priceNaoDesoneradoRJ: 46.3,
    materialRatio: 0.58,
    stageGroup: '06. Instalações Hidrossanitárias',
    category: 'servico',
  },
  'MOB-01': {
    internalCode: 'MOB-01',
    sinapiCode: '86888',
    sinapiDescription: 'Louça sanitária / bancada pia cozinha e lavatório c/ torneira e sifão (médio padrão)',
    unit: 'un',
    priceDesoneradoRJ: 645.0,
    priceNaoDesoneradoRJ: 682.0,
    materialRatio: 0.76,
    stageGroup: '08. Esquadrias, Louças e Bancadas',
    category: 'equipamento',
  },
};

export function getSinapiRJItem(internalCode: string): SinapiRJReferenceItem | null {
  return SINAPI_RJ_CATALOG[internalCode] ?? null;
}

export function applySinapiRJToBudget(
  project: Project,
  quantities: QuantitiesReport,
  regime: SinapiRJRegime,
): { budgetEntries: BudgetEntry[]; budgetSettings: Project['budgetSettings'] } {
  const existingByCode = new Map(project.budgetEntries.map((e) => [e.code, e]));
  const regimeLabel =
    regime === 'desonerado' ? 'SINAPI-RJ Deson.' : 'SINAPI-RJ S/Des.';

  const entries: BudgetEntry[] = quantities.items.map((q) => {
    const ref = SINAPI_RJ_CATALOG[q.code];
    const prev = existingByCode.get(q.code);
    const price = ref
      ? regime === 'desonerado'
        ? ref.priceDesoneradoRJ
        : ref.priceNaoDesoneradoRJ
      : prev?.unitPrice ?? null;

    return {
      id: prev?.id ?? `bdg-${q.code}`,
      code: q.code,
      sinapiCode: ref?.sinapiCode ?? prev?.sinapiCode,
      description: q.description,
      discipline: q.discipline,
      category: ref?.category ?? prev?.category ?? 'servico',
      unit: q.unit,
      quantity: q.netQuantity,
      unitPrice: price,
      lossFactorPercent: prev?.lossFactorPercent ?? q.lossFactorPercent,
      supplier: regimeLabel,
      sourceBase: ref ? `SINAPI-RJ ${ref.sinapiCode}` : project.budgetSettings.sourceBase,
      notes: ref ? ref.sinapiDescription : prev?.notes ?? '',
    };
  });

  // Preserve custom manual entries
  const autoCodes = new Set(quantities.items.map((q) => q.code));
  for (const e of project.budgetEntries) {
    if (!autoCodes.has(e.code)) {
      entries.push(e);
    }
  }

  return {
    budgetEntries: entries,
    budgetSettings: {
      ...project.budgetSettings,
      sourceBase:
        regime === 'desonerado'
          ? 'SINAPI-RJ (CAIXA/IBGE) — Com Desoneração'
          : 'SINAPI-RJ (CAIXA/IBGE) — Sem Desoneração',
      region: 'Rio de Janeiro (RJ)',
      sinapiRegime: regime,
      socialChargesPercent:
        regime === 'desonerado'
          ? SINAPI_RJ_METADATA.encargosDesoneradoPercent
          : SINAPI_RJ_METADATA.encargosNaoDesoneradoPercent,
      criteriaNotes: SINAPI_RJ_METADATA.disclaimer,
    },
  };
}

/**
 * Estimativa paramétrica referencial SINAPI-RJ de vedação por m² de parede conforme método construtivo.
 */
export function getSinapiRJWallBenchmarkPerM2(
  methodId: ConstructionMethodId,
  regime: SinapiRJRegime = 'desonerado',
): number {
  const factor = regime === 'desonerado' ? 1 : 1.085;
  const map: Record<ConstructionMethodId, number> = {
    alvenaria_convencional: round2(98.4 * factor),
    alvenaria_estrutural: round2(114.2 * factor),
    light_steel_frame: round2(198.5 * factor),
    wood_frame: round2(186.0 * factor),
    pre_moldado: round2(168.0 * factor),
    modular: round2(224.0 * factor),
    misto: round2(138.0 * factor),
    personalizado: round2(125.0 * factor),
  };
  return map[methodId] ?? round2(98.4 * factor);
}
