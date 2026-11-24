import { round2 } from './geometry';
import { getNormalizedSanitaryFixtures } from './finishesCatalog';
import type { QuantitiesReport } from './quantitiesAndBudget';
import type { BudgetEntry, ConstructionMethodId, Project } from '../types/project';

export type SinapiRJRegime = 'desonerado' | 'nao_desonerado';

export type ConstructionStageName =
  | '01. Serviços Preliminares e Canteiro'
  | '02. Infraestrutura e Fundações'
  | '03. Superestrutura, Lajes e Mezaninos'
  | '04. Alvenaria, Drywall e Vedações'
  | '05. Cobertura, Laje Superior e Impermeabilização'
  | '06. Esquadrias (Portas, Janelas e Vidros)'
  | '07. Instalações Elétricas e Especiais'
  | '08. Instalações Hidrossanitárias e Pluviais'
  | '09. Revestimentos, Pisos, Forros e Pintura'
  | '10. Louças, Metais, Bancadas e Paisagismo';

export const CONSTRUCTION_STAGE_ORDER: ConstructionStageName[] = [
  '01. Serviços Preliminares e Canteiro',
  '02. Infraestrutura e Fundações',
  '03. Superestrutura, Lajes e Mezaninos',
  '04. Alvenaria, Drywall e Vedações',
  '05. Cobertura, Laje Superior e Impermeabilização',
  '06. Esquadrias (Portas, Janelas e Vidros)',
  '07. Instalações Elétricas e Especiais',
  '08. Instalações Hidrossanitárias e Pluviais',
  '09. Revestimentos, Pisos, Forros e Pintura',
  '10. Louças, Metais, Bancadas e Paisagismo',
];

export interface SinapiRJReferenceItem {
  internalCode: string;
  sinapiCode: string;
  sinapiDescription: string;
  unit: string;
  priceDesoneradoRJ: number;
  priceNaoDesoneradoRJ: number;
  materialRatio: number; // Fração de Material (0..1); complemento = Mão de Obra + Encargos RJ
  stageGroup: ConstructionStageName;
  category: BudgetEntry['category'];
}

export const SINAPI_RJ_METADATA = {
  uf: 'RJ',
  stateName: 'Rio de Janeiro',
  sourceLabel: 'CAIXA / IBGE — Tabela SINAPI Rio de Janeiro (RJ)',
  competenceLabel: 'Planilha Orçamentária 10 Etapas EAP · Referência SINAPI-RJ (Com / Sem Desoneração)',
  encargosDesoneradoPercent: 86.87,
  encargosNaoDesoneradoPercent: 114.45,
  recommendedBdiPercent: 22.0,
  disclaimer:
    'Planilha orçamentária referencial SINAPI-RJ (CAIXA/IBGE) vinculada às especificações reais de revestimentos, esquadrias, cobertura, louças e metais do projeto. Valores permanecem 100% editáveis.',
};

export const SINAPI_RJ_CATALOG: Record<string, SinapiRJReferenceItem> = {
  'PRE-01': {
    internalCode: 'PRE-01',
    sinapiCode: '99059',
    sinapiDescription: 'Locação convencional de obra com gabarito de tábuas e pontaletes (SINAPI-RJ)',
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
    sinapiDescription: 'Tapume compensado resinado 6mm + placa de obra e ligações provisórias (SINAPI-RJ)',
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
    sinapiDescription: 'Infraestrutura / vigas baldrame e sapatas fck=25MPa (conceitual SINAPI-RJ)',
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
    sinapiDescription: 'Concreto usinado fck=25MPa bombeado c/ lançamento e adensamento em lajes e pilares',
    unit: 'm³',
    priceDesoneradoRJ: 695.0,
    priceNaoDesoneradoRJ: 726.0,
    materialRatio: 0.74,
    stageGroup: '03. Superestrutura, Lajes e Mezaninos',
    category: 'servico',
  },
  'EST-02': {
    internalCode: 'EST-02',
    sinapiCode: '92412',
    sinapiDescription: 'Montagem e desmontagem de fôrma de lajes e pilares em chapa resinada',
    unit: 'm²',
    priceDesoneradoRJ: 118.4,
    priceNaoDesoneradoRJ: 129.8,
    materialRatio: 0.44,
    stageGroup: '03. Superestrutura, Lajes e Mezaninos',
    category: 'servico',
  },
  'EST-03': {
    internalCode: 'EST-03',
    sinapiCode: '101964',
    sinapiDescription: 'Laje de cobertura superior pré-moldada treliçada h=12cm c/ capeamento fck=25MPa',
    unit: 'm²',
    priceDesoneradoRJ: 174.5,
    priceNaoDesoneradoRJ: 189.2,
    materialRatio: 0.66,
    stageGroup: '05. Cobertura, Laje Superior e Impermeabilização',
    category: 'servico',
  },
  'MEZ-01': {
    internalCode: 'MEZ-01',
    sinapiCode: '92543',
    sinapiDescription: 'Plataforma de mezanino em perfis metálicos/madeira + piso estrutural + guarda-corpo',
    unit: 'm²',
    priceDesoneradoRJ: 645.0,
    priceNaoDesoneradoRJ: 688.0,
    materialRatio: 0.71,
    stageGroup: '03. Superestrutura, Lajes e Mezaninos',
    category: 'servico',
  },
  'ESC-01': {
    internalCode: 'ESC-01',
    sinapiCode: '92548',
    sinapiDescription: 'Escada interna planejada p/ mezanino c/ corrimão ergonômico (Blondel)',
    unit: 'un',
    priceDesoneradoRJ: 4250.0,
    priceNaoDesoneradoRJ: 4540.0,
    materialRatio: 0.68,
    stageGroup: '03. Superestrutura, Lajes e Mezaninos',
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
    stageGroup: '04. Alvenaria, Drywall e Vedações',
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
    stageGroup: '04. Alvenaria, Drywall e Vedações',
    category: 'servico',
  },
  'ARQ-03': {
    internalCode: 'ARQ-03',
    sinapiCode: '96359',
    sinapiDescription: 'Divisória Drywall em perfis aço galvanizado 70mm + chapa gesso ST/RU + lã mineral',
    unit: 'm²',
    priceDesoneradoRJ: 128.6,
    priceNaoDesoneradoRJ: 136.8,
    materialRatio: 0.66,
    stageGroup: '04. Alvenaria, Drywall e Vedações',
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
    stageGroup: '04. Alvenaria, Drywall e Vedações',
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
    stageGroup: '04. Alvenaria, Drywall e Vedações',
    category: 'material',
  },
  'COB-01': {
    internalCode: 'COB-01',
    sinapiCode: '94213',
    sinapiDescription: 'Telhamento com telha termoacústica sanduíche / cerâmica / fibrocimento (SINAPI-RJ)',
    unit: 'm²',
    priceDesoneradoRJ: 228.5,
    priceNaoDesoneradoRJ: 243.9,
    materialRatio: 0.72,
    stageGroup: '05. Cobertura, Laje Superior e Impermeabilização',
    category: 'servico',
  },
  'COB-02': {
    internalCode: 'COB-02',
    sinapiCode: '92541',
    sinapiDescription: 'Estrutura de cobertura (trama metálica galvanizada / madeira estrutural de apoio)',
    unit: 'm²',
    priceDesoneradoRJ: 112.4,
    priceNaoDesoneradoRJ: 121.8,
    materialRatio: 0.64,
    stageGroup: '05. Cobertura, Laje Superior e Impermeabilização',
    category: 'servico',
  },
  'COB-03': {
    internalCode: 'COB-03',
    sinapiCode: '94228',
    sinapiDescription: 'Calhas, rufos e pingadeiras em chapa de aço galvanizado nº 24 pintada',
    unit: 'm',
    priceDesoneradoRJ: 86.5,
    priceNaoDesoneradoRJ: 94.2,
    materialRatio: 0.61,
    stageGroup: '05. Cobertura, Laje Superior e Impermeabilização',
    category: 'servico',
  },
  'IMP-01': {
    internalCode: 'IMP-01',
    sinapiCode: '98557',
    sinapiDescription: 'Impermeabilização de áreas molhadas, laje superior e baldrames (argamassa polimérica)',
    unit: 'm²',
    priceDesoneradoRJ: 62.4,
    priceNaoDesoneradoRJ: 68.1,
    materialRatio: 0.58,
    stageGroup: '05. Cobertura, Laje Superior e Impermeabilização',
    category: 'servico',
  },
  'ESQ-01': {
    internalCode: 'ESQ-01',
    sinapiCode: '91306',
    sinapiDescription: 'Kit porta completa instalada (folha, marco, alizar, dobradiças e fechadura)',
    unit: 'un',
    priceDesoneradoRJ: 985.0,
    priceNaoDesoneradoRJ: 1048.0,
    materialRatio: 0.72,
    stageGroup: '06. Esquadrias (Portas, Janelas e Vidros)',
    category: 'servico',
  },
  'ESQ-01A': {
    internalCode: 'ESQ-01A',
    sinapiCode: '91314',
    sinapiDescription: 'Porta de entrada social completa 0,80×2,10m c/ fechadura multiponto e batente',
    unit: 'un',
    priceDesoneradoRJ: 1240.0,
    priceNaoDesoneradoRJ: 1318.0,
    materialRatio: 0.74,
    stageGroup: '06. Esquadrias (Portas, Janelas e Vidros)',
    category: 'servico',
  },
  'ESQ-01B': {
    internalCode: 'ESQ-01B',
    sinapiCode: '91306',
    sinapiDescription: 'Porta interna de dormitório completa 0,70×2,10m c/ guarnição e ferragens',
    unit: 'un',
    priceDesoneradoRJ: 920.0,
    priceNaoDesoneradoRJ: 982.0,
    materialRatio: 0.72,
    stageGroup: '06. Esquadrias (Portas, Janelas e Vidros)',
    category: 'servico',
  },
  'ESQ-01C': {
    internalCode: 'ESQ-01C',
    sinapiCode: '91304',
    sinapiDescription: 'Porta interna de banheiro completa 0,60×2,10m resistente à umidade c/ trinco',
    unit: 'un',
    priceDesoneradoRJ: 865.0,
    priceNaoDesoneradoRJ: 924.0,
    materialRatio: 0.71,
    stageGroup: '06. Esquadrias (Portas, Janelas e Vidros)',
    category: 'servico',
  },
  'ESQ-02': {
    internalCode: 'ESQ-02',
    sinapiCode: '94570',
    sinapiDescription: 'Janela de correr 2/4 folhas com vidro temperado instalado (SINAPI-RJ)',
    unit: 'un',
    priceDesoneradoRJ: 890.0,
    priceNaoDesoneradoRJ: 942.5,
    materialRatio: 0.76,
    stageGroup: '06. Esquadrias (Portas, Janelas e Vidros)',
    category: 'servico',
  },
  'ESQ-02A': {
    internalCode: 'ESQ-02A',
    sinapiCode: '94570',
    sinapiDescription: 'Janela de correr padrão com vidro temperado 8mm e contramarco instalado',
    unit: 'un',
    priceDesoneradoRJ: 915.0,
    priceNaoDesoneradoRJ: 970.0,
    materialRatio: 0.76,
    stageGroup: '06. Esquadrias (Portas, Janelas e Vidros)',
    category: 'servico',
  },
  'ESQ-02B': {
    internalCode: 'ESQ-02B',
    sinapiCode: '94573',
    sinapiDescription: 'Porta-janela de correr p/ varanda com vidro temperado 8mm e fechadura bico-de-papagaio',
    unit: 'un',
    priceDesoneradoRJ: 2180.0,
    priceNaoDesoneradoRJ: 2310.0,
    materialRatio: 0.77,
    stageGroup: '06. Esquadrias (Portas, Janelas e Vidros)',
    category: 'servico',
  },
  'ESQ-03': {
    internalCode: 'ESQ-03',
    sinapiCode: '94565',
    sinapiDescription: 'Vitrô / Janela basculante ou maxim-ar c/ vidro privativo instalado',
    unit: 'un',
    priceDesoneradoRJ: 465.0,
    priceNaoDesoneradoRJ: 492.0,
    materialRatio: 0.74,
    stageGroup: '06. Esquadrias (Portas, Janelas e Vidros)',
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
    stageGroup: '07. Instalações Elétricas e Especiais',
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
    stageGroup: '07. Instalações Elétricas e Especiais',
    category: 'servico',
  },
  'ELE-03': {
    internalCode: 'ELE-03',
    sinapiCode: '97600',
    sinapiDescription: 'Ponto de iluminação com luminária LED instalada no teto/parede',
    unit: 'pt',
    priceDesoneradoRJ: 118.0,
    priceNaoDesoneradoRJ: 126.5,
    materialRatio: 0.68,
    stageGroup: '07. Instalações Elétricas e Especiais',
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
    stageGroup: '07. Instalações Elétricas e Especiais',
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
    stageGroup: '07. Instalações Elétricas e Especiais',
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
    stageGroup: '07. Instalações Elétricas e Especiais',
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
    stageGroup: '08. Instalações Hidrossanitárias e Pluviais',
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
    stageGroup: '08. Instalações Hidrossanitárias e Pluviais',
    category: 'servico',
  },
  'HID-03': {
    internalCode: 'HID-03',
    sinapiCode: '101658',
    sinapiDescription: 'Reservatório superior em polietileno + castelo técnico c/ barrilete e boia automática',
    unit: 'un',
    priceDesoneradoRJ: 3480.0,
    priceNaoDesoneradoRJ: 3740.0,
    materialRatio: 0.68,
    stageGroup: '08. Instalações Hidrossanitárias e Pluviais',
    category: 'equipamento',
  },
  'SAN-01': {
    internalCode: 'SAN-01',
    sinapiCode: '89707',
    sinapiDescription: 'Caixa sifonada / conexões sanitárias PVC 100x100x50mm instaladas',
    unit: 'pt',
    priceDesoneradoRJ: 124.5,
    priceNaoDesoneradoRJ: 134.8,
    materialRatio: 0.58,
    stageGroup: '08. Instalações Hidrossanitárias e Pluviais',
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
    stageGroup: '08. Instalações Hidrossanitárias e Pluviais',
    category: 'servico',
  },
  'REV-00': {
    internalCode: 'REV-00',
    sinapiCode: '87620',
    sinapiDescription: 'Contrapiso argamassa traço 1:4 cimento e areia espessura 3cm nivelado a laser',
    unit: 'm²',
    priceDesoneradoRJ: 46.8,
    priceNaoDesoneradoRJ: 51.4,
    materialRatio: 0.54,
    stageGroup: '09. Revestimentos, Pisos, Forros e Pintura',
    category: 'servico',
  },
  'REV-01': {
    internalCode: 'REV-01',
    sinapiCode: '87248',
    sinapiDescription: 'Revestimento cerâmico / porcelanato para piso interno (SINAPI-RJ)',
    unit: 'm²',
    priceDesoneradoRJ: 112.6,
    priceNaoDesoneradoRJ: 121.4,
    materialRatio: 0.63,
    stageGroup: '09. Revestimentos, Pisos, Forros e Pintura',
    category: 'servico',
  },
  'REV-01A': {
    internalCode: 'REV-01A',
    sinapiCode: '87248',
    sinapiDescription: 'Piso interno áreas secas assentado c/ argamassa AC-II e rejunte flexível',
    unit: 'm²',
    priceDesoneradoRJ: 116.8,
    priceNaoDesoneradoRJ: 126.2,
    materialRatio: 0.64,
    stageGroup: '09. Revestimentos, Pisos, Forros e Pintura',
    category: 'servico',
  },
  'REV-01B': {
    internalCode: 'REV-01B',
    sinapiCode: '87251',
    sinapiDescription: 'Piso antiderrapante/acetinado para áreas molhadas assentado c/ argamassa AC-III',
    unit: 'm²',
    priceDesoneradoRJ: 128.4,
    priceNaoDesoneradoRJ: 138.6,
    materialRatio: 0.65,
    stageGroup: '09. Revestimentos, Pisos, Forros e Pintura',
    category: 'servico',
  },
  'REV-02': {
    internalCode: 'REV-02',
    sinapiCode: '87269',
    sinapiDescription: 'Revestimento cerâmico / porcelanato em paredes de áreas molhadas c/ argamassa AC-II',
    unit: 'm²',
    priceDesoneradoRJ: 104.3,
    priceNaoDesoneradoRJ: 112.9,
    materialRatio: 0.6,
    stageGroup: '09. Revestimentos, Pisos, Forros e Pintura',
    category: 'servico',
  },
  'REV-03': {
    internalCode: 'REV-03',
    sinapiCode: '87879',
    sinapiDescription: 'Chapisco + emboço/reboco massa única interna e externa para alvenaria',
    unit: 'm²',
    priceDesoneradoRJ: 49.6,
    priceNaoDesoneradoRJ: 54.8,
    materialRatio: 0.44,
    stageGroup: '09. Revestimentos, Pisos, Forros e Pintura',
    category: 'servico',
  },
  'FOR-01': {
    internalCode: 'FOR-01',
    sinapiCode: '96111',
    sinapiDescription: 'Forro de teto em gesso acartonado / PVC / madeira nobre estruturado',
    unit: 'm²',
    priceDesoneradoRJ: 79.5,
    priceNaoDesoneradoRJ: 86.2,
    materialRatio: 0.56,
    stageGroup: '09. Revestimentos, Pisos, Forros e Pintura',
    category: 'servico',
  },
  'ROD-01': {
    internalCode: 'ROD-01',
    sinapiCode: '88649',
    sinapiDescription: 'Rodapé instalado (porcelanato / poliestireno / MDF / negativo embutido)',
    unit: 'm',
    priceDesoneradoRJ: 29.4,
    priceNaoDesoneradoRJ: 32.15,
    materialRatio: 0.55,
    stageGroup: '09. Revestimentos, Pisos, Forros e Pintura',
    category: 'servico',
  },
  'PIN-01': {
    internalCode: 'PIN-01',
    sinapiCode: '88489',
    sinapiDescription: 'Pintura / acabamento interno em paredes secas e tetos (selador + massa + 2 demãos)',
    unit: 'm²',
    priceDesoneradoRJ: 34.8,
    priceNaoDesoneradoRJ: 38.9,
    materialRatio: 0.42,
    stageGroup: '09. Revestimentos, Pisos, Forros e Pintura',
    category: 'servico',
  },
  'PIN-02': {
    internalCode: 'PIN-02',
    sinapiCode: '88496',
    sinapiDescription: 'Acabamento / revestimento de fachada externa (textura acrílica / pedra / tijolinho)',
    unit: 'm²',
    priceDesoneradoRJ: 54.6,
    priceNaoDesoneradoRJ: 59.8,
    materialRatio: 0.52,
    stageGroup: '09. Revestimentos, Pisos, Forros e Pintura',
    category: 'servico',
  },
  'LOU-01': {
    internalCode: 'LOU-01',
    sinapiCode: '86888',
    sinapiDescription: 'Bacia sanitária instalada completa c/ anel de vedação, flexível e fixação',
    unit: 'un',
    priceDesoneradoRJ: 765.0,
    priceNaoDesoneradoRJ: 818.0,
    materialRatio: 0.78,
    stageGroup: '10. Louças, Metais, Bancadas e Paisagismo',
    category: 'equipamento',
  },
  'LOU-02': {
    internalCode: 'LOU-02',
    sinapiCode: '86910',
    sinapiDescription: 'Conjunto lavatório c/ bancada, cuba, sifão, válvula e torneira instalada',
    unit: 'un',
    priceDesoneradoRJ: 940.0,
    priceNaoDesoneradoRJ: 1005.0,
    materialRatio: 0.75,
    stageGroup: '10. Louças, Metais, Bancadas e Paisagismo',
    category: 'equipamento',
  },
  'LOU-03': {
    internalCode: 'LOU-03',
    sinapiCode: '86932',
    sinapiDescription: 'Bancada de cozinha completa c/ cuba inox/quartzo, torneira e sifão metálico',
    unit: 'un',
    priceDesoneradoRJ: 1580.0,
    priceNaoDesoneradoRJ: 1685.0,
    materialRatio: 0.76,
    stageGroup: '10. Louças, Metais, Bancadas e Paisagismo',
    category: 'equipamento',
  },
  'LOU-04': {
    internalCode: 'LOU-04',
    sinapiCode: '86905',
    sinapiDescription: 'Tanque de área de serviço instalado c/ torneira dupla e sifão',
    unit: 'un',
    priceDesoneradoRJ: 585.0,
    priceNaoDesoneradoRJ: 628.0,
    materialRatio: 0.73,
    stageGroup: '10. Louças, Metais, Bancadas e Paisagismo',
    category: 'equipamento',
  },
  'LOU-05': {
    internalCode: 'LOU-05',
    sinapiCode: '95470',
    sinapiDescription: 'Conjunto chuveiro/ducha c/ registro de pressão e acabamento de metais instalado',
    unit: 'un',
    priceDesoneradoRJ: 395.0,
    priceNaoDesoneradoRJ: 428.0,
    materialRatio: 0.72,
    stageGroup: '10. Louças, Metais, Bancadas e Paisagismo',
    category: 'equipamento',
  },
  'LOU-06': {
    internalCode: 'LOU-06',
    sinapiCode: '89709',
    sinapiDescription: 'Ralo (linear oculto / click / grelha inox) + kit registros de gaveta e metais BWC',
    unit: 'un',
    priceDesoneradoRJ: 315.0,
    priceNaoDesoneradoRJ: 342.0,
    materialRatio: 0.74,
    stageGroup: '10. Louças, Metais, Bancadas e Paisagismo',
    category: 'equipamento',
  },
  'MOB-01': {
    internalCode: 'MOB-01',
    sinapiCode: '86888',
    sinapiDescription: 'Mobiliário fixo e itens complementares das unidades (camas, armários, box, bancadas)',
    unit: 'un',
    priceDesoneradoRJ: 720.0,
    priceNaoDesoneradoRJ: 762.0,
    materialRatio: 0.8,
    stageGroup: '10. Louças, Metais, Bancadas e Paisagismo',
    category: 'equipamento',
  },
  'EXT-01': {
    internalCode: 'EXT-01',
    sinapiCode: '92396',
    sinapiDescription: 'Pavimentação externa (piso intertravado / antiderrapante / brita / areia / deck)',
    unit: 'm²',
    priceDesoneradoRJ: 118.4,
    priceNaoDesoneradoRJ: 129.8,
    materialRatio: 0.64,
    stageGroup: '10. Louças, Metais, Bancadas e Paisagismo',
    category: 'servico',
  },
  'PAI-01': {
    internalCode: 'PAI-01',
    sinapiCode: '101420',
    sinapiDescription: 'Piscina c/ borda antiderrapante, casa de máquinas e filtragem completa (SINAPI-RJ)',
    unit: 'm²',
    priceDesoneradoRJ: 1680.0,
    priceNaoDesoneradoRJ: 1840.0,
    materialRatio: 0.68,
    stageGroup: '10. Louças, Metais, Bancadas e Paisagismo',
    category: 'servico',
  },
  'PAI-02': {
    internalCode: 'PAI-02',
    sinapiCode: '102154',
    sinapiDescription: 'Área gourmet equipada c/ pergolado, bancada em granito, pia e churrasqueira',
    unit: 'm²',
    priceDesoneradoRJ: 1420.0,
    priceNaoDesoneradoRJ: 1560.0,
    materialRatio: 0.65,
    stageGroup: '10. Louças, Metais, Bancadas e Paisagismo',
    category: 'servico',
  },
  'PAI-03': {
    internalCode: 'PAI-03',
    sinapiCode: '98504',
    sinapiDescription: 'Paisagismo: plantio de árvores, frutíferas, palmeiras e espécies ornamentais',
    unit: 'un',
    priceDesoneradoRJ: 265.0,
    priceNaoDesoneradoRJ: 294.0,
    materialRatio: 0.62,
    stageGroup: '10. Louças, Metais, Bancadas e Paisagismo',
    category: 'material',
  },
};

function scaleSinapiPrice(
  base: SinapiRJReferenceItem,
  multiplier: number,
  overrideCode?: string,
  overrideDesc?: string,
): SinapiRJReferenceItem {
  return {
    ...base,
    sinapiCode: overrideCode ?? base.sinapiCode,
    sinapiDescription: overrideDesc ?? base.sinapiDescription,
    priceDesoneradoRJ: round2(base.priceDesoneradoRJ * multiplier),
    priceNaoDesoneradoRJ: round2(base.priceNaoDesoneradoRJ * multiplier),
  };
}

export function getSinapiRJItem(internalCode: string): SinapiRJReferenceItem | null {
  return SINAPI_RJ_CATALOG[internalCode] ?? null;
}

/**
 * Resolve o item SINAPI-RJ ajustado exatamente aos acabamentos, esquadrias,
 * telhado, louças e metais escolhidos pelo usuário no projeto.
 */
export function getDynamicSinapiRJItem(
  internalCode: string,
  project: Project,
): SinapiRJReferenceItem | null {
  const base = SINAPI_RJ_CATALOG[internalCode];
  if (!base) return null;

  const rs = project.renderSettings;
  const fx = getNormalizedSanitaryFixtures(project);

  const metalsMult =
    fx.metalsFinish === 'dourado_escovado'
      ? 1.38
      : fx.metalsFinish === 'preto_fosco'
        ? 1.24
        : fx.metalsFinish === 'aco_escovado'
          ? 1.18
          : 1.0;

  const wareColorMult =
    fx.sanitaryWareColor === 'preto_fosco'
      ? 1.28
      : fx.sanitaryWareColor === 'cinza_urbano'
        ? 1.16
        : 1.0;

  const frameMult =
    rs.windowFrameColor === 'madeira'
      ? 1.22
      : rs.windowFrameColor === 'aluminio_preto'
        ? 1.12
        : 1.0;

  const glassMult =
    rs.glassType === 'temperado_fume'
      ? 1.12
      : rs.glassType === 'temperado_verde_solar'
        ? 1.08
        : 1.0;

  switch (internalCode) {
    case 'COB-01': {
      if (rs.roofMaterial === 'ceramica_terracota') {
        return scaleSinapiPrice(base, 0.84, '94201', 'Telhamento com telha cerâmica capa-canal / romana (SINAPI-RJ)');
      }
      if (rs.roofMaterial === 'fibrocimento_cinza') {
        return scaleSinapiPrice(base, 0.58, '94207', 'Telhamento com telha ondulada de fibrocimento 6mm (SINAPI-RJ)');
      }
      if (rs.roofMaterial === 'concreto_impermeabilizado') {
        return scaleSinapiPrice(base, 0.72, '98547', 'Impermeabilização de cobertura plana com manta asfáltica aluminizada 4mm');
      }
      return base;
    }
    case 'REV-01':
    case 'REV-01A': {
      const m =
        rs.floorMaterial === 'porcelanato_marmorizado'
          ? 1.32
          : rs.floorMaterial === 'madeira_carvalho'
            ? 1.28
            : rs.floorMaterial === 'cimento_queimado'
              ? 0.92
              : rs.floorMaterial === 'piso_vinilico'
                ? 0.88
                : rs.floorMaterial === 'ceramica_bege'
                  ? 0.76
                  : 1.0;
      return scaleSinapiPrice(base, m);
    }
    case 'REV-01B': {
      const m =
        rs.wetFloorMaterial === 'ceramica_acetinada'
          ? 0.78
          : rs.wetFloorMaterial === 'cimento_queimado_fosco'
            ? 0.94
            : 1.05;
      return scaleSinapiPrice(base, m);
    }
    case 'REV-02': {
      const bathMult =
        rs.wetWallBathroom === 'porcelanato_amadeirado'
          ? 1.24
          : rs.wetWallBathroom === 'porcelanato_marmorizado'
            ? 1.2
            : rs.wetWallBathroom === 'azulejo_metro'
              ? 1.12
              : rs.wetWallBathroom === 'cimento_queimado_resinado'
                ? 0.95
                : 0.85;
      return scaleSinapiPrice(base, bathMult);
    }
    case 'PIN-01': {
      const m =
        rs.wallInteriorFinish === 'cimento_queimado'
          ? 1.45
          : rs.wallInteriorFinish === 'ceramica_metro'
            ? 2.1
            : rs.wallInteriorFinish === 'madeira_acoplada'
              ? 2.4
              : 1.0;
      return scaleSinapiPrice(base, m);
    }
    case 'PIN-02': {
      const m =
        rs.wallExteriorFinish === 'tijolinho_aparente'
          ? 1.95
          : rs.wallExteriorFinish === 'pedra_madeira'
            ? 2.65
            : rs.wallExteriorFinish === 'ripado_madeira'
              ? 2.85
              : rs.wallExteriorFinish === 'cimento_queimado'
                ? 1.35
                : rs.wallExteriorFinish === 'reboco_liso'
                  ? 0.82
                  : 1.0;
      return scaleSinapiPrice(base, m);
    }
    case 'FOR-01': {
      const m =
        rs.ceilingType === 'forro_madeira_cumaru'
          ? 2.35
          : rs.ceilingType === 'forro_pvc_amadeirado'
            ? 0.88
            : rs.ceilingType === 'laje_pintada'
              ? 0.48
              : 1.0;
      return scaleSinapiPrice(base, m);
    }
    case 'ROD-01': {
      const m =
        rs.baseboardType === 'negativo_embutido'
          ? 1.45
          : rs.baseboardType === 'poliestireno_branco_10cm'
            ? 1.18
            : rs.baseboardType === 'madeira_mdf_7cm'
              ? 0.92
              : 1.0;
      return scaleSinapiPrice(base, m);
    }
    case 'ESQ-01A':
    case 'ESQ-01B':
    case 'ESQ-01C': {
      const doorMult =
        rs.interiorDoorMaterial === 'aluminio_vidro'
          ? 1.22
          : rs.interiorDoorMaterial === 'madeira_verniz_natural'
            ? 1.15
            : rs.interiorDoorMaterial === 'mdf_melaminico_cinza'
              ? 1.05
              : 1.0;
      return scaleSinapiPrice(base, doorMult);
    }
    case 'ESQ-02':
    case 'ESQ-02A':
    case 'ESQ-02B':
    case 'ESQ-03':
      return scaleSinapiPrice(base, round2(frameMult * glassMult));
    case 'LOU-01': {
      const tMult =
        fx.toiletType === 'suspensa_embutida'
          ? 2.45
          : fx.toiletType === 'caixa_acoplada_monobloco'
            ? 1.65
            : fx.toiletType === 'convencional_valvula'
              ? 1.22
              : 1.0;
      return scaleSinapiPrice(base, round2(tMult * wareColorMult));
    }
    case 'LOU-02': {
      const wbMult =
        fx.washbasinType === 'pia_esculpida_porcelanato'
          ? 1.42
          : fx.washbasinType === 'cuba_apoio_granito'
            ? 1.18
            : fx.washbasinType === 'lavatorio_coluna_suspensa'
              ? 0.58
              : 1.0;
      const fMult = fx.washbasinFaucet === 'monocomando_mesa' ? 1.25 : 1.0;
      return scaleSinapiPrice(base, round2(wbMult * fMult * metalsMult * 0.92));
    }
    case 'LOU-03': {
      const ksMult =
        fx.kitchenSinkType === 'quartzo_cuba_esculpida'
          ? 1.55
          : fx.kitchenSinkType === 'inox_monobloco'
            ? 0.62
            : 1.0;
      const kfMult = fx.kitchenFaucet === 'monocomando_gourmet_extensivel' ? 1.24 : 1.0;
      return scaleSinapiPrice(base, round2(ksMult * kfMult * (0.85 + (metalsMult - 1) * 0.5)));
    }
    case 'LOU-04': {
      const tubMult =
        fx.laundryTubType === 'inox_embutida'
          ? 1.32
          : fx.laundryTubType === 'marmore_sintetico_compacto'
            ? 0.84
            : 1.0;
      return scaleSinapiPrice(base, round2(tubMult * (0.9 + (metalsMult - 1) * 0.3)));
    }
    case 'LOU-05': {
      const shMult =
        fx.showerType === 'ducha_teto_monocomando'
          ? 2.25
          : fx.showerType === 'ducha_aquecedor_gas'
            ? 1.65
            : fx.showerType === 'ducha_eletronica_haste'
              ? 1.22
              : 0.72;
      return scaleSinapiPrice(base, round2(shMult * metalsMult));
    }
    case 'LOU-06': {
      const drMult =
        fx.drainType === 'ralo_linear_oculto'
          ? 1.48
          : fx.drainType === 'ralo_seco_click_inox'
            ? 1.08
            : 0.78;
      return scaleSinapiPrice(base, round2(drMult * metalsMult));
    }
    case 'MEZ-01': {
      const mezSample = project.unitTypes.find((u) => u.hasMezzanine && u.mezzanine?.enabled)?.mezzanine;
      const mezMult =
        mezSample?.structureType === 'concreto_armado'
          ? 1.15
          : mezSample?.structureType === 'steel_deck'
            ? 1.08
            : mezSample?.structureType === 'madeira_estrutural'
              ? 0.92
              : 1.0;
      return scaleSinapiPrice(base, mezMult);
    }
    default:
      return base;
  }
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
    const ref = getDynamicSinapiRJItem(q.code, project);
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
