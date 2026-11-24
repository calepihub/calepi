import type {
  FloorFinishMaterial,
  Project,
  RenderMaterialSettings,
  RoofFinishMaterial,
  RoofShapeType,
  SanitaryFixturesSpec,
  WallExteriorFinish,
  WallInteriorFinish,
} from '../types/project';

export interface CatalogOption<T extends string> {
  id: T;
  label: string;
  spec: string;
  swatchHex: string;
  accentHex?: string;
}

export const DEFAULT_SANITARY_FIXTURES: SanitaryFixturesSpec = {
  toiletType: 'caixa_acoplada_dual',
  sanitaryWareColor: 'branco_gelo',
  showerType: 'eletrico_multitemperatura',
  washbasinType: 'cuba_apoio_granito',
  washbasinFaucet: 'bica_alta_apoio',
  kitchenSinkType: 'granito_cuba_inox',
  kitchenFaucet: 'bica_movel_mesa',
  laundryTubType: 'louca_suspensa',
  drainType: 'ralo_linear_oculto',
  metalsFinish: 'cromado',
};

export function getNormalizedSanitaryFixtures(project: Project): SanitaryFixturesSpec {
  return {
    ...DEFAULT_SANITARY_FIXTURES,
    ...(project.hydraulicConfig?.sanitaryFixtures ?? {}),
  };
}

export const WALL_EXTERIOR_OPTIONS: Array<CatalogOption<WallExteriorFinish>> = [
  {
    id: 'textura_acrilica',
    label: 'Textura Acrílica Grafiato/Rolada',
    spec: 'Argamassa de regularização + selador + textura acrílica hidrorepelente',
    swatchHex: '#D8DCE2',
  },
  {
    id: 'reboco_liso',
    label: 'Reboco Liso + Pintura Acrílica Fosca',
    spec: 'Massa corrida acrílica exterior + 3 demãos tinta acrílica premium UV',
    swatchHex: '#ECEEF1',
  },
  {
    id: 'tijolinho_aparente',
    label: 'Tijolinho Aparente Terracota',
    spec: 'Plaquetas/tijolos cerâmicos à vista rejuntados + resina hidrofugante fosca',
    swatchHex: '#A65239',
    accentHex: '#7A3B27',
  },
  {
    id: 'pedra_madeira',
    label: 'Pedra Madeira / Filete Canjiquinha',
    spec: 'Revestimento natural em pedra São Tomé / Madeira assentada com AC-III',
    swatchHex: '#B6A896',
    accentHex: '#8E806E',
  },
  {
    id: 'ripado_madeira',
    label: 'Painel Ripado Amadeirado (WPC/Cumaru)',
    spec: 'Ripado externo em madeira tratada ou WPC ecológico resistente a intempéries',
    swatchHex: '#8C5932',
    accentHex: '#59371E',
  },
  {
    id: 'cimento_queimado',
    label: 'Cimento Queimado / Microcimento Externo',
    spec: 'Revestimento cimentício polimérico desempenado + verniz PU fosco',
    swatchHex: '#8F959C',
  },
];

export const WALL_INTERIOR_OPTIONS: Array<CatalogOption<WallInteriorFinish>> = [
  {
    id: 'pintura_fosca',
    label: 'Pintura Látex Acrílica Fosca',
    spec: 'Massa corrida PVA/acrílica + 2 demãos tinta acrílica fosca lavável',
    swatchHex: '#F3F4F6',
  },
  {
    id: 'cimento_queimado',
    label: 'Efeito Cimento Queimado Acetinado',
    spec: 'Textura microcimento interno acetinado em parede destaque ou geral',
    swatchHex: '#9BA1A8',
  },
  {
    id: 'ceramica_metro',
    label: 'Revestimento Cerâmico Retangular',
    spec: 'Placas cerâmicas 10×20cm assentadas com junta mínima 2mm',
    swatchHex: '#E8ECEF',
  },
  {
    id: 'madeira_acoplada',
    label: 'Painel Amadeirado / Ripado Interno',
    spec: 'MDF melamínico ou ripado decorativo sobre paredes secas da sala/dormitório',
    swatchHex: '#A17148',
  },
];

export const WET_WALL_BATHROOM_OPTIONS: Array<
  CatalogOption<NonNullable<RenderMaterialSettings['wetWallBathroom']>>
> = [
  {
    id: 'porcelanato_marmorizado',
    label: 'Porcelanato Marmorizado Calacatta (Piso ao Teto)',
    spec: 'Porcelanato acetinado/polido 60×120cm em todo o BWC com argamassa AC-III',
    swatchHex: '#EFECE6',
    accentHex: '#C6BEB2',
  },
  {
    id: 'ceramica_branca',
    label: 'Cerâmica Branca Retificada 30×60cm',
    spec: 'Revestimento cerâmico branco brilhante/acetinado com rejunte epóxi branco',
    swatchHex: '#F8FAFC',
  },
  {
    id: 'azulejo_metro',
    label: 'Azulejo Metrô (Subway Tile) 10×20cm',
    spec: 'Assentamento amarração tijolinho em área do box e meia-parede seca',
    swatchHex: '#E2E8F0',
  },
  {
    id: 'cimento_queimado_resinado',
    label: 'Microcimento Impermeabilizado PU',
    spec: 'Monolítico sem rejuntes no box com dupla camada de selador poliuretano',
    swatchHex: '#848B92',
  },
  {
    id: 'porcelanato_amadeirado',
    label: 'Porcelanato Ripado Amadeirado (Box Destaque)',
    spec: 'Porcelanato régua madeira na parede do chuveiro + neutro nas demais',
    swatchHex: '#9D6D47',
  },
];

export const WET_WALL_KITCHEN_OPTIONS: Array<
  CatalogOption<NonNullable<RenderMaterialSettings['wetWallKitchen']>>
> = [
  {
    id: 'azulejo_metro',
    label: 'Azulejo Metrô na Bancada / Frontão',
    spec: 'Azulejo 10×20cm na parede hidráulica (pia/cooktop) + pintura lavável acima',
    swatchHex: '#E5E7EB',
  },
  {
    id: 'porcelanato_acetinado',
    label: 'Porcelanato Acetinado Grande Formato',
    spec: 'Porcelanato 60×60 ou 60×120cm de fácil limpeza sobre bancada e área de serviço',
    swatchHex: '#D6D9DF',
  },
  {
    id: 'ceramica_esmaltada',
    label: 'Cerâmica Esmaltada Retificada',
    spec: 'Revestimento cerâmico classe A até h=1,60m ou pé-direito total',
    swatchHex: '#F1F5F9',
  },
  {
    id: 'cimento_queimado_resinado',
    label: 'Cimento Queimado c/ Resina Anti-Gordura',
    spec: 'Acabamento contínuo com proteção oleofugante para área gourmet/cozinha',
    swatchHex: '#8E949C',
  },
];

export const FLOOR_INTERNAL_OPTIONS: Array<CatalogOption<FloorFinishMaterial>> = [
  {
    id: 'porcelanato_cinza',
    label: 'Porcelanato Cinza Acetinado 80×80cm',
    spec: 'Retificado junta seca 1,5mm, rejunte acrílico cinza platina',
    swatchHex: '#9CA3AF',
  },
  {
    id: 'porcelanato_marmorizado',
    label: 'Porcelanato Marmorizado Polido',
    spec: 'Veios suaves em alto brilho ou acetinado 80×80cm para amplitude visual',
    swatchHex: '#EAE7E0',
    accentHex: '#B8B0A4',
  },
  {
    id: 'ceramica_bege',
    label: 'Cerâmica Bege Clássica 60×60cm',
    spec: 'Placa cerâmica PEI-4 antiderrapante leve de manutenção econômica',
    swatchHex: '#D8C7AE',
  },
  {
    id: 'madeira_carvalho',
    label: 'Porcelanato / Piso Madeira Carvalho',
    spec: 'Réguas 20×120cm texturizadas com toque amadeirado acolhedor',
    swatchHex: '#9C6B3F',
    accentHex: '#704926',
  },
  {
    id: 'piso_vinilico',
    label: 'Piso Vinílico LVT Click Acústico',
    spec: 'Réguas vinílicas 4mm com manta acústica integrada (ideal para kitnets)',
    swatchHex: '#B5895F',
  },
  {
    id: 'cimento_queimado',
    label: 'Piso Cimento Queimado / Granilite',
    spec: 'Piso cimentício monolítico com juntas de dilatação em perfil metálico',
    swatchHex: '#7D838A',
  },
];

export const WET_FLOOR_OPTIONS: Array<
  CatalogOption<NonNullable<RenderMaterialSettings['wetFloorMaterial']>>
> = [
  {
    id: 'porcelanato_antiderrapante',
    label: 'Porcelanato Antiderrapante COF ≥ 0,4 (EXT/ABS)',
    spec: 'Superfície aderente para BWC, box e área de serviço conforme NBR 15575',
    swatchHex: '#8E959D',
  },
  {
    id: 'ceramica_acetinada',
    label: 'Cerâmica Antiderrapante PEI-4 / Classe B',
    spec: 'Revestimento cerâmico fosco seguro para áreas molhadas com caimento 1,5%',
    swatchHex: '#C5BBA8',
  },
  {
    id: 'cimento_queimado_fosco',
    label: 'Cimento Queimado Fosco Antiderrapante',
    spec: 'Acabamento contínuo com aditivo antiderrapante e impermeabilização sob o piso',
    swatchHex: '#73787F',
  },
];

export const BASEBOARD_OPTIONS: Array<
  CatalogOption<NonNullable<RenderMaterialSettings['baseboardType']>>
> = [
  {
    id: 'porcelanato_10cm',
    label: 'Rodapé Porcelanato Cortado (h=10cm)',
    spec: 'Mesmo material do piso com acabamento meia-esquadria e resistente à umidade',
    swatchHex: '#9CA3AF',
  },
  {
    id: 'poliestireno_branco_10cm',
    label: 'Rodapé Poliestireno Branco (h=10cm)',
    spec: 'Imune a cupins e umidade (estilo Santa Luzia), frisado ou liso',
    swatchHex: '#F8FAFC',
  },
  {
    id: 'madeira_mdf_7cm',
    label: 'Rodapé MDF Ultra / Madeira (h=7cm)',
    spec: 'Acabamento amadeirado ou laqueado para áreas secas com cordão de vedação',
    swatchHex: '#8C5E35',
  },
  {
    id: 'negativo_embutido',
    label: 'Rodapé Invertido / Negativo Embutido',
    spec: 'Perfil alumínio embutido no reboco/drywall para visual minimalista rente à parede',
    swatchHex: '#334155',
  },
];

export const CEILING_OPTIONS: Array<
  CatalogOption<NonNullable<RenderMaterialSettings['ceilingType']>>
> = [
  {
    id: 'gesso_drywall_tabica',
    label: 'Forro Drywall Liso c/ Tabica Metálica',
    spec: 'Chapa gesso 12,5mm estruturada para embutir spots LED e passar tubulação',
    swatchHex: '#F3F4F6',
  },
  {
    id: 'laje_pintada',
    label: 'Laje Maciça / Pré-Moldada Pintada',
    spec: 'Massa corrida e pintura látex fosca direta sobre laje nivelada',
    swatchHex: '#E5E7EB',
  },
  {
    id: 'forro_pvc_amadeirado',
    label: 'Forro PVC Amadeirado / Branco Térmico',
    spec: 'Réguas de PVC com instalação rápida, baixa manutenção e fácil acesso ao forro',
    swatchHex: '#C29368',
  },
  {
    id: 'forro_madeira_cumaru',
    label: 'Forro Ripado de Madeira Nobre / Cumaru',
    spec: 'Lambri ou ripado em madeira tratada com manta termoacústica superior',
    swatchHex: '#84502A',
  },
];

export const ROOF_SHAPE_OPTIONS: Array<CatalogOption<RoofShapeType>> = [
  {
    id: 'platibanda',
    label: 'Telhado Embutido com Platibanda',
    spec: 'Alvenaria periférica ocultando telhas e calhas, visual contemporâneo limpo',
    swatchHex: '#CBD5E1',
  },
  {
    id: 'duas_aguas',
    label: 'Telhado Aparente Duas Águas',
    spec: 'Cumeeira central com dois caimentos laterais e beirais protetores de 60cm',
    swatchHex: '#B95E38',
  },
  {
    id: 'uma_agua',
    label: 'Telhado Uma Água (Caimento Único)',
    spec: 'Inclinado em plano contínuo ideal para kitnets em fita ou geminadas',
    swatchHex: '#64748B',
  },
  {
    id: 'laje_plana',
    label: 'Laje Plana Impermeabilizada Aparente',
    spec: 'Laje com manta asfáltica/poliuretano e rufo metálico perimetral',
    swatchHex: '#94A3B8',
  },
];

export const ROOF_MATERIAL_OPTIONS: Array<CatalogOption<RoofFinishMaterial>> = [
  {
    id: 'termoacustica_zinco',
    label: 'Telha Termoacústica Sanduíche PIR/EPS',
    spec: 'Chapa galvalume dupla com núcleo isolante 30/50mm — máximo conforto térmico/acústico',
    swatchHex: '#94A3B8',
  },
  {
    id: 'ceramica_terracota',
    label: 'Telha Cerâmica Portuguesa / Americana',
    spec: 'Telha cerâmica esmaltada ou natural terracota sobre madeiramento tratado',
    swatchHex: '#B85D3B',
  },
  {
    id: 'fibrocimento_cinza',
    label: 'Telha Fibrocimento Onda Alta 6mm',
    spec: 'Solução econômica sem amianto CRFS para coberturas embutidas por platibanda',
    swatchHex: '#6B7280',
  },
  {
    id: 'concreto_impermeabilizado',
    label: 'Laje Impermeabilizada c/ Manta Aluminizada',
    spec: 'Regularização + manta asfáltica 4mm ou membrana líquida refletiva UV',
    swatchHex: '#CBD5E1',
  },
];

export const WINDOW_FRAME_OPTIONS: Array<
  CatalogOption<RenderMaterialSettings['windowFrameColor']>
> = [
  {
    id: 'aluminio_preto',
    label: 'Alumínio Preto Fosco (Linha Suprema)',
    spec: 'Perfis extrudados pintura eletrostática preto fosco + vedações EPDM',
    swatchHex: '#1E242D',
  },
  {
    id: 'aluminio_branco',
    label: 'Alumínio Branco Anodizado / Eletrostático',
    spec: 'Esquadria leve e clássica de alta durabilidade para regiões litorâneas',
    swatchHex: '#F1F5F9',
  },
  {
    id: 'madeira',
    label: 'Esquadria em Madeira Maciça / Angelim',
    spec: 'Folhas e batentes em madeira de lei envernizada com ferragens reforçadas',
    swatchHex: '#7C4D2B',
  },
];

export const INTERIOR_DOOR_OPTIONS: Array<
  CatalogOption<NonNullable<RenderMaterialSettings['interiorDoorMaterial']>>
> = [
  {
    id: 'madeira_pintada_branca',
    label: 'Porta Lisa Madeira Pintura Esmalte Branco',
    spec: 'Folha semi-oca/maciça encabeçada + caixilho regulável e borracha amortecedora',
    swatchHex: '#F3F4F6',
  },
  {
    id: 'madeira_verniz_natural',
    label: 'Porta Madeira Natural / Curupixá Verniz',
    spec: 'Lâmina natural selecionada com selador e verniz PU acetinado',
    swatchHex: '#8F5D38',
  },
  {
    id: 'mdf_melaminico_cinza',
    label: 'Kit Porta Pronta Melamínica Cinza / Grafite',
    spec: 'Fábrica padrão construtora resistente a riscos com batente ajustável',
    swatchHex: '#64748B',
  },
  {
    id: 'aluminio_vidro',
    label: 'Porta Alumínio c/ Veneziana (BWC / Serviço)',
    spec: 'Imune à água para banheiros compactos e acessos à lavanderia',
    swatchHex: '#334155',
  },
];

export const GLASS_TYPE_OPTIONS: Array<
  CatalogOption<NonNullable<RenderMaterialSettings['glassType']>>
> = [
  {
    id: 'temperado_incolor',
    label: 'Vidro Temperado Incolor 8mm',
    spec: 'Máxima luminosidade natural (vitrôs BWC com opção mini-boreal privativo)',
    swatchHex: '#BCE3FF',
  },
  {
    id: 'temperado_verde_solar',
    label: 'Vidro Temperado Verde Controle Solar',
    spec: 'Reduz ganho térmico solar mantendo boa transparência visual',
    swatchHex: '#86C7B5',
  },
  {
    id: 'temperado_fume',
    label: 'Vidro Temperado Fumê / Cinza Privativo',
    spec: 'Maior privacidade diurna e conforto contra ofuscamento solar',
    swatchHex: '#64748B',
  },
];

export const TOILET_OPTIONS: Array<CatalogOption<SanitaryFixturesSpec['toiletType']>> = [
  {
    id: 'caixa_acoplada_dual',
    label: 'Bacia c/ Caixa Acoplada (Dual Flush 3/6L)',
    spec: 'Mais econômica na hidráulica (tubo Ø25mm), manutenção simples e economia de até 40% de água',
    swatchHex: '#F8FAFC',
  },
  {
    id: 'caixa_acoplada_monobloco',
    label: 'Bacia Monobloco Premium (Caixa Integrada)',
    spec: 'Peça única sem emenda entre bacia e caixa, design contemporâneo e limpeza facilitada',
    swatchHex: '#E2E8F0',
  },
  {
    id: 'convencional_valvula',
    label: 'Bacia Convencional c/ Válvula na Parede (Hydra)',
    spec: 'Ideal para banheiros supercompactos — exige prumada de Ø40/50mm com pressão alta',
    swatchHex: '#CBD5E1',
  },
  {
    id: 'suspensa_embutida',
    label: 'Bacia Suspensa c/ Caixa Embutida (Drywall)',
    spec: 'Bacia flutuante sem contato com o piso, higiene superior com estrutura embutida na parede',
    swatchHex: '#94A3B8',
  },
];

export const SANITARY_COLOR_OPTIONS: Array<
  CatalogOption<SanitaryFixturesSpec['sanitaryWareColor']>
> = [
  {
    id: 'branco_gelo',
    label: 'Branco Gelo Esmaltado',
    spec: 'Padrão universal de louça sanitária de alta vitrificação',
    swatchHex: '#F8FAFC',
  },
  {
    id: 'cinza_urbano',
    label: 'Cinza Fosco / Matte Stone',
    spec: 'Estética industrial contemporânea combinando com metais pretos ou inox',
    swatchHex: '#6B7280',
  },
  {
    id: 'preto_fosco',
    label: 'Preto Fosco / Ébano',
    spec: 'Louça sofisticada de alto contraste para projetos autorais',
    swatchHex: '#1E242B',
  },
];

export const SHOWER_OPTIONS: Array<CatalogOption<SanitaryFixturesSpec['showerType']>> = [
  {
    id: 'eletrico_multitemperatura',
    label: 'Chuveiro Elétrico Multitemperatura 5500–7500W',
    spec: 'Dispensa rede de água quente (AQ); exige circuito dedicado TUE 220V cabo 4/6mm²',
    swatchHex: '#E5E7EB',
  },
  {
    id: 'ducha_eletronica_haste',
    label: 'Ducha Eletrônica c/ Haste de Controle',
    spec: 'Ajuste gradual de temperatura ao alcance da mão, maior conforto no banho',
    swatchHex: '#CBD5E1',
  },
  {
    id: 'ducha_aquecedor_gas',
    label: 'Ducha Parede AQ/AF (Aquecedor Gás / Solar)',
    spec: 'Misturador de parede duplo comando ou monocomando com alta vazão',
    swatchHex: '#94A3B8',
  },
  {
    id: 'ducha_teto_monocomando',
    label: 'Ducha de Teto Articulada + Monocomando',
    spec: 'Banho tipo SPA com braço de teto 20cm e desviador/misturador embutido',
    swatchHex: '#475569',
  },
];

export const WASHBASIN_OPTIONS: Array<CatalogOption<SanitaryFixturesSpec['washbasinType']>> = [
  {
    id: 'cuba_apoio_granito',
    label: 'Cuba de Apoio + Bancada Granito/Mármore',
    spec: 'Bancada h=85cm com cuba retangular/redonda sobreposta e gabinete inferior',
    swatchHex: '#E2E8F0',
  },
  {
    id: 'cuba_embutir_granito',
    label: 'Cuba de Embutir Oval + Bancada Pedra',
    spec: 'Fácil limpeza da bancada sem bordas salientes, excelente custo-benefício',
    swatchHex: '#CBD5E1',
  },
  {
    id: 'lavatorio_coluna_suspensa',
    label: 'Lavatório Compacto Suspenso (Sem Bancada)',
    spec: 'Economia máxima de espaço em banheiros compactos (< 1,20m de largura)',
    swatchHex: '#F8FAFC',
  },
  {
    id: 'pia_esculpida_porcelanato',
    label: 'Bancada Esculpida em Porcelanato (Ralo Oculto)',
    spec: 'Rampa removível em porcelanato combinando com o revestimento da parede',
    swatchHex: '#B6ADA0',
  },
];

export const WASHBASIN_FAUCET_OPTIONS: Array<
  CatalogOption<SanitaryFixturesSpec['washbasinFaucet']>
> = [
  {
    id: 'bica_alta_apoio',
    label: 'Torneira Bica Alta 1/4 Volta',
    spec: 'Indicada para cubas de apoio, arejador economizador 6 L/min',
    swatchHex: '#D1D5DB',
  },
  {
    id: 'bica_baixa_cromada',
    label: 'Torneira Bica Baixa Mesa 1/4 Volta',
    spec: 'Indicada para cubas de embutir ou lavatórios suspensos',
    swatchHex: '#CBD5E1',
  },
  {
    id: 'monocomando_mesa',
    label: 'Misturador Monocomando Água Fria/Quente',
    spec: 'Alavanca única de vazão e mistura com cartucho cerâmico de alta durabilidade',
    swatchHex: '#64748B',
  },
  {
    id: 'torneira_parede_arejador',
    label: 'Torneira de Parede c/ Bica Reta',
    spec: 'Libera superfície útil da bancada em lavatórios estreitos',
    swatchHex: '#94A3B8',
  },
];

export const KITCHEN_SINK_OPTIONS: Array<
  CatalogOption<SanitaryFixturesSpec['kitchenSinkType']>
> = [
  {
    id: 'granito_cuba_inox',
    label: 'Bancada Granito + Cuba Inox 304 Escovado',
    spec: 'Granito Preto São Gabriel ou Verde Ubatuba c/ cuba 40×34cm e frontão 15cm',
    swatchHex: '#2F363D',
  },
  {
    id: 'quartzo_cuba_esculpida',
    label: 'Bancada Quartzo Branco/Bege + Cuba Embutida',
    spec: 'Superfície não porosa resistente a manchas com cuba retangular profunda',
    swatchHex: '#E5E3DC',
  },
  {
    id: 'inox_monobloco',
    label: 'Pia Inox Monobloco Integrada (Compacta)',
    spec: 'Tampo + cuba estampados em peça única inoxidável de alta durabilidade',
    swatchHex: '#B8C1CC',
  },
];

export const KITCHEN_FAUCET_OPTIONS: Array<
  CatalogOption<SanitaryFixturesSpec['kitchenFaucet']>
> = [
  {
    id: 'bica_movel_mesa',
    label: 'Torneira Bica Móvel Alta c/ Arejador',
    spec: 'Giro 360° e jato suave sem respingos para cubas compactas',
    swatchHex: '#CBD5E1',
  },
  {
    id: 'monocomando_gourmet_extensivel',
    label: 'Misturador Monocomando Gourmet Extensível',
    spec: 'Ducha manual retrátil / spray duplo para máxima praticidade culinária',
    swatchHex: '#334155',
  },
  {
    id: 'torneira_parede_flexivel',
    label: 'Torneira de Parede c/ Bica Flexível Silicone',
    spec: 'Economiza profundidade de bancada (1,20m–1,60m) com alcance articulado',
    swatchHex: '#475569',
  },
];

export const LAUNDRY_TUB_OPTIONS: Array<
  CatalogOption<SanitaryFixturesSpec['laundryTubType']>
> = [
  {
    id: 'louca_suspensa',
    label: 'Tanque de Louça 18–22L Suspenso + Torneira Dupla',
    spec: 'Louça vitrificada de fácil limpeza com derivação para máquina lava e seca',
    swatchHex: '#F8FAFC',
  },
  {
    id: 'inox_embutida',
    label: 'Tanque Inox Embutido na Bancada Contínua',
    spec: 'Integrado ao prolongamento da bancada de granito/quartzo',
    swatchHex: '#B8C1CC',
  },
  {
    id: 'marmore_sintetico_compacto',
    label: 'Tanque Mármore Sintético / Resina Compacto',
    spec: 'Formato reduzido 45×42cm ideal para áreas de serviço integradas à cozinha',
    swatchHex: '#E2E8F0',
  },
];

export const DRAIN_OPTIONS: Array<CatalogOption<SanitaryFixturesSpec['drainType']>> = [
  {
    id: 'ralo_linear_oculto',
    label: 'Ralo Linear Inox Oculto (Box) + Caixa Sifonada',
    spec: 'Calha linear 60/70cm rente à parede com tampo oculto no mesmo piso + retentor de odores',
    swatchHex: '#CBD5E1',
  },
  {
    id: 'ralo_seco_click_inox',
    label: 'Ralo Seco Click / Inteligente Inox 10×10cm',
    spec: 'Válvula de fechamento por pressão que bloqueia retorno de insetos e mau cheiro',
    swatchHex: '#94A3B8',
  },
  {
    id: 'ralo_quadrado_convencional',
    label: 'Ralo Quadrado Grelha Inox/PVC 10×10cm + Porta-Grelha',
    spec: 'Solução tradicional econômica ligada à caixa sifonada DN 100×100×50mm',
    swatchHex: '#64748B',
  },
];

export const METALS_FINISH_OPTIONS: Array<
  CatalogOption<SanitaryFixturesSpec['metalsFinish']>
> = [
  {
    id: 'cromado',
    label: 'Cromado Brilhante Tradicional',
    spec: 'Banho duplo de níquel-cromo com alta resistência à corrosão',
    swatchHex: '#D1D5DB',
  },
  {
    id: 'preto_fosco',
    label: 'Preto Fosco (Matte Black)',
    spec: 'Pintura termofixa preta acetinada em torneiras, chuveiros, registros e ralos',
    swatchHex: '#1F242B',
  },
  {
    id: 'aco_escovado',
    label: 'Aço Inox Escovado (Brushed Steel)',
    spec: 'Acabamento fosco acetinado resistente a marcas de dedos e maresia',
    swatchHex: '#B6C0CC',
  },
  {
    id: 'dourado_escovado',
    label: 'Dourado Escovado (Brushed Gold)',
    spec: 'Revestimento PVD dourado acetinado para alto padrão visual',
    swatchHex: '#C9A24B',
  },
];

export function findLabel<T extends string>(list: Array<CatalogOption<T>>, id?: T): string {
  if (!id) return list[0]?.label ?? '';
  return list.find((o) => o.id === id)?.label ?? list[0]?.label ?? id;
}

export function getMetalsColorHex(finish?: SanitaryFixturesSpec['metalsFinish']): string {
  switch (finish) {
    case 'preto_fosco':
      return '#1E232A';
    case 'aco_escovado':
      return '#BAC4CF';
    case 'dourado_escovado':
      return '#C9A24B';
    default:
      return '#D6DCE3';
  }
}

export function getSanitaryWareHex(color?: SanitaryFixturesSpec['sanitaryWareColor']): string {
  switch (color) {
    case 'preto_fosco':
      return '#22272E';
    case 'cinza_urbano':
      return '#7B828C';
    default:
      return '#F5F7FA';
  }
}

/**
 * Synchronizes global project finishes and sanitary/kitchen fixtures into each typology's
 * room.finishes table so Memorial Descritivo, CAD legends, and 3D views stay 100% consistent.
 */
export function syncFinishesToTypologyRooms(project: Project): Project {
  const rs = project.renderSettings;
  const fx = getNormalizedSanitaryFixtures(project);

  const floorDry = findLabel(FLOOR_INTERNAL_OPTIONS, rs.floorMaterial);
  const floorWet = findLabel(WET_FLOOR_OPTIONS, rs.wetFloorMaterial);
  const wallDry = findLabel(WALL_INTERIOR_OPTIONS, rs.wallInteriorFinish);
  const wallBath = findLabel(WET_WALL_BATHROOM_OPTIONS, rs.wetWallBathroom);
  const wallKitchen = findLabel(WET_WALL_KITCHEN_OPTIONS, rs.wetWallKitchen);
  const ceilingLbl = findLabel(CEILING_OPTIONS, rs.ceilingType);
  const baseboardLbl = findLabel(BASEBOARD_OPTIONS, rs.baseboardType);
  const metalsLbl = findLabel(METALS_FINISH_OPTIONS, fx.metalsFinish);

  const toiletLbl = findLabel(TOILET_OPTIONS, fx.toiletType);
  const showerLbl = findLabel(SHOWER_OPTIONS, fx.showerType);
  const drainLbl = findLabel(DRAIN_OPTIONS, fx.drainType);
  const wbLbl = findLabel(WASHBASIN_OPTIONS, fx.washbasinType);
  const wbFaucetLbl = findLabel(WASHBASIN_FAUCET_OPTIONS, fx.washbasinFaucet);
  const kSinkLbl = findLabel(KITCHEN_SINK_OPTIONS, fx.kitchenSinkType);
  const kFaucetLbl = findLabel(KITCHEN_FAUCET_OPTIONS, fx.kitchenFaucet);
  const tubLbl = findLabel(LAUNDRY_TUB_OPTIONS, fx.laundryTubType);

  return {
    ...project,
    unitTypes: project.unitTypes.map((ut) => ({
      ...ut,
      rooms: ut.rooms.map((r) => {
        if (r.category === 'banheiro') {
          return {
            ...r,
            finishes: {
              ...r.finishes,
              floor: floorWet,
              wall: wallBath,
              ceiling: ceilingLbl,
              paint: `Teto acrílica anti-mofo | Metais: ${metalsLbl}`,
              baseboard: 'Embutido / Impermeabilizado na junta piso-parede',
              countertop: `${wbLbl}`,
              sink: `${toiletLbl} · ${showerLbl} · ${drainLbl}`,
              faucet: `${wbFaucetLbl} (${metalsLbl})`,
            },
          };
        }
        if (r.category === 'cozinha' || r.category === 'area_servico') {
          return {
            ...r,
            finishes: {
              ...r.finishes,
              floor: floorWet,
              wall: wallKitchen,
              ceiling: ceilingLbl,
              paint: `Pintura acrílica lavável (${rs.interiorWallColor})`,
              baseboard: baseboardLbl,
              countertop: kSinkLbl,
              sink: r.category === 'area_servico' ? tubLbl : kSinkLbl,
              faucet: `${kFaucetLbl} (${metalsLbl})`,
            },
          };
        }
        return {
          ...r,
          finishes: {
            ...r.finishes,
            floor: floorDry,
            wall: wallDry,
            ceiling: ceilingLbl,
            paint: `Pintura acrílica fosca (${rs.interiorWallColor})`,
            baseboard: baseboardLbl,
          },
        };
      }),
    })),
  };
}
