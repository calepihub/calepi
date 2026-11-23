import type {
  BotanicalSpeciesId,
  ExteriorSurfaceType,
  ExteriorSurfaceZone,
  GourmetAreaSpec,
  LandscapePlantItem,
  PoolSpec,
  Project,
  Site,
  SiteLandscaping,
} from '../types/project';
import { getBoundingBox, getUnitWorldRect, rectsOverlap, round2 } from './geometry';
import { normalizeSiteData } from './implantation';

export interface BotanicalSpeciesMeta {
  id: BotanicalSpeciesId;
  commonName: string;
  scientificName: string;
  category: 'frutifera' | 'palmeira' | 'arvore_ornamental' | 'tropical_arbusto';
  categoryLabel: string;
  matureHeightM: number;
  canopyDiameterM: number;
  sunExposure: 'Sol pleno' | 'Sol pleno / Meia-sombra' | 'Meia-sombra / Sombra';
  rootNote: string;
  foliageHex: string;
  secondaryFoliageHex: string;
  trunkHex: string;
  accentHex: string;
  accentLabel: string;
  unitCostBRL: number;
  description: string;
}

export const BOTANICAL_SPECIES_CATALOG: BotanicalSpeciesMeta[] = [
  {
    id: 'jabuticabeira',
    commonName: 'Jabuticabeira Sabará',
    scientificName: 'Plinia cauliflora',
    category: 'frutifera',
    categoryLabel: 'Frutífera Nativa',
    matureHeightM: 4.5,
    canopyDiameterM: 3.0,
    sunExposure: 'Sol pleno / Meia-sombra',
    rootNote: 'Raízes pouco agressivas; manter recuo >= 1,20 m de fundações e tubulações.',
    foliageHex: '#2E6B34',
    secondaryFoliageHex: '#4E8F43',
    trunkHex: '#8E6F55',
    accentHex: '#2A162B',
    accentLabel: 'Frutos negros no tronco (caulifloria)',
    unitCostBRL: 680,
    description: 'Árvore frutífera nativa de copa densa e arredondada, tronco marmorizado liso com frutos escuros aderidos diretamente ao caule e ramos.',
  },
  {
    id: 'mangueira',
    commonName: 'Mangueira Anã (Espada / Tommy)',
    scientificName: 'Mangifera indica',
    category: 'frutifera',
    categoryLabel: 'Frutífera',
    matureHeightM: 5.5,
    canopyDiameterM: 3.8,
    sunExposure: 'Sol pleno',
    rootNote: 'Copa ampla sombreada; plantar a >= 2,0 m de muros e calçadas.',
    foliageHex: '#22592A',
    secondaryFoliageHex: '#7A3E26',
    trunkHex: '#5A4331',
    accentHex: '#E8852A',
    accentLabel: 'Mangas pendentes amarelo-avermelhadas',
    unitCostBRL: 490,
    description: 'Folhagem alongada verde-escura com brotações bronzeadas, copa perene vigorosa e excelente sombreamento para áreas de lazer.',
  },
  {
    id: 'limoeiro',
    commonName: 'Limoeiro Tahiti',
    scientificName: 'Citrus × latifolia',
    category: 'frutifera',
    categoryLabel: 'Frutífera Cítrica',
    matureHeightM: 3.4,
    canopyDiameterM: 2.2,
    sunExposure: 'Sol pleno',
    rootNote: 'Porte compacto ideal para corredores largos e jardins frontais.',
    foliageHex: '#337530',
    secondaryFoliageHex: '#5EA345',
    trunkHex: '#6F5843',
    accentHex: '#7ED321',
    accentLabel: 'Limões verdes e flores brancas aromáticas',
    unitCostBRL: 220,
    description: 'Cítrico compacto de alta produtividade, folhas verde-brilhantes perfumadas, florada branca e frutos verdes abundantes.',
  },
  {
    id: 'pitangueira',
    commonName: 'Pitangueira',
    scientificName: 'Eugenia uniflora',
    category: 'frutifera',
    categoryLabel: 'Frutífera Nativa',
    matureHeightM: 3.8,
    canopyDiameterM: 2.3,
    sunExposure: 'Sol pleno / Meia-sombra',
    rootNote: 'Raiz pivotante delicada; aceita proximidade moderada de decks e muros.',
    foliageHex: '#3C7A37',
    secondaryFoliageHex: '#A64B33',
    trunkHex: '#7D634E',
    accentHex: '#D92B2B',
    accentLabel: 'Pitangas sulcadas vermelho-rubi',
    unitCostBRL: 260,
    description: 'Frutífera nativa de porte elegante, brotos avermelhados na estação seca e frutos vermelho-rubi que atraem avifauna.',
  },
  {
    id: 'aceroleira',
    commonName: 'Aceroleira',
    scientificName: 'Malpighia emarginata',
    category: 'frutifera',
    categoryLabel: 'Frutífera',
    matureHeightM: 3.0,
    canopyDiameterM: 2.1,
    sunExposure: 'Sol pleno',
    rootNote: 'Arbusto/arvoreta de raízes rasas e fáceis de conduzir.',
    foliageHex: '#3B7C3A',
    secondaryFoliageHex: '#599E4E',
    trunkHex: '#735B46',
    accentHex: '#E0343A',
    accentLabel: 'Frutos escarlates e flores rosadas',
    unitCostBRL: 195,
    description: 'Arvoreta frondosa de fácil manutenção, frutificação intensa em tons de cereja vibrante e pequenas flores rosadas.',
  },
  {
    id: 'bananeira',
    commonName: 'Bananeira Anã / Ornamental',
    scientificName: 'Musa acuminata',
    category: 'frutifera',
    categoryLabel: 'Frutífera Tropical',
    matureHeightM: 2.8,
    canopyDiameterM: 2.4,
    sunExposure: 'Sol pleno / Meia-sombra',
    rootNote: 'Rizoma não invasivo; ideal junto a muros para efeito tropical denso.',
    foliageHex: '#438938',
    secondaryFoliageHex: '#6DB34D',
    trunkHex: '#638344',
    accentHex: '#E6C229',
    accentLabel: 'Cacho pendente amarelo + bráctea púrpura',
    unitCostBRL: 165,
    description: 'Pseudocaule verde robusto com grandes folhas largas em leque arqueado e cachos tropicais decorativos e comestíveis.',
  },
  {
    id: 'coqueiro_anao',
    commonName: 'Coqueiro-Anão Verde',
    scientificName: 'Cocos nucifera',
    category: 'frutifera',
    categoryLabel: 'Palmeira Frutífera',
    matureHeightM: 5.8,
    canopyDiameterM: 3.6,
    sunExposure: 'Sol pleno',
    rootNote: 'Raízes fasciculadas não agressivas; muito usado ao redor de piscinas.',
    foliageHex: '#3D7D32',
    secondaryFoliageHex: '#69A84B',
    trunkHex: '#7E6A58',
    accentHex: '#60992D',
    accentLabel: 'Cocos verdes agrupados sob a copa',
    unitCostBRL: 540,
    description: 'Palmeira tropical icônica de estipe anelado, folhas pinadas arqueadas e cachos de coco verde sob a coroa.',
  },
  {
    id: 'palmeira_imperial',
    commonName: 'Palmeira Imperial',
    scientificName: 'Roystonea oleracea',
    category: 'palmeira',
    categoryLabel: 'Palmeira Monumental',
    matureHeightM: 8.5,
    canopyDiameterM: 3.4,
    sunExposure: 'Sol pleno',
    rootNote: 'Raízes fasciculadas verticais; excelente para eixo frontal de entrada.',
    foliageHex: '#2F6F31',
    secondaryFoliageHex: '#509446',
    trunkHex: '#9C968D',
    accentHex: '#3A7D3B',
    accentLabel: 'Capitel verde-esmeralda liso e estipe cinza-claro',
    unitCostBRL: 920,
    description: 'Palmeira arquitetônica imponente de tronco colunar cinza-claro, palmito verde brilhante no topo e plumagem simétrica.',
  },
  {
    id: 'palmeira_areca',
    commonName: 'Palmeira Areca-Bambu (Touceira)',
    scientificName: 'Dypsis lutescens',
    category: 'palmeira',
    categoryLabel: 'Palmeira de Touceira',
    matureHeightM: 3.6,
    canopyDiameterM: 2.0,
    sunExposure: 'Sol pleno / Meia-sombra',
    rootNote: 'Não danifica pisos ou muros; ideal como tela verde privativa.',
    foliageHex: '#468C3B',
    secondaryFoliageHex: '#7CC055',
    trunkHex: '#7D9E49',
    accentHex: '#9BC458',
    accentLabel: 'Múltiplos caules anelados amarelo-esverdeados',
    unitCostBRL: 240,
    description: 'Touceira elegante de múltiplos caules anelados amarelados e folhagem leve plumosa, perfeita para privacidade entre divisas.',
  },
  {
    id: 'ipe_amarelo',
    commonName: 'Ipê-Amarelo de Jardim',
    scientificName: 'Handroanthus chrysotrichus',
    category: 'arvore_ornamental',
    categoryLabel: 'Árvore Ornamental Nativa',
    matureHeightM: 5.5,
    canopyDiameterM: 3.4,
    sunExposure: 'Sol pleno',
    rootNote: 'Sistema radicular profundo e pouco superficial; bom para recuo frontal.',
    foliageHex: '#3A6B35',
    secondaryFoliageHex: '#578A46',
    trunkHex: '#634E3C',
    accentHex: '#F7C918',
    accentLabel: 'Copa dourada exuberante em florada',
    unitCostBRL: 520,
    description: 'Árvore símbolo brasileira de copa escultural com florada dourada intensa em cachos globosos.',
  },
  {
    id: 'pata_de_vaca',
    commonName: 'Pata-de-Vaca Rosa',
    scientificName: 'Bauhinia variegata',
    category: 'arvore_ornamental',
    categoryLabel: 'Árvore Ornamental',
    matureHeightM: 4.8,
    canopyDiameterM: 3.0,
    sunExposure: 'Sol pleno',
    rootNote: 'Raízes moderadas, recomendada para jardins e calçadas largas.',
    foliageHex: '#3D783B',
    secondaryFoliageHex: '#5F9954',
    trunkHex: '#6E5A49',
    accentHex: '#EE6EA8',
    accentLabel: 'Flores orquideáceas rosa-lilás',
    unitCostBRL: 390,
    description: 'Árvore de médio porte com folhas bilobadas características e flores delicadas em tons de rosa e magenta.',
  },
  {
    id: 'costela_de_adao',
    commonName: 'Costela-de-Adão',
    scientificName: 'Monstera deliciosa',
    category: 'tropical_arbusto',
    categoryLabel: 'Tropical Escultural',
    matureHeightM: 1.4,
    canopyDiameterM: 1.5,
    sunExposure: 'Meia-sombra / Sombra',
    rootNote: 'Planta herbácea de canteiro sob beirais, pergolados ou sombra de árvores.',
    foliageHex: '#25602C',
    secondaryFoliageHex: '#3F8642',
    trunkHex: '#366832',
    accentHex: '#579E4C',
    accentLabel: 'Grandes folhas fenestradas e recortadas',
    unitCostBRL: 145,
    description: 'Folhagem tropical icônica com grandes lâminas verde-escuras brilhantes profundamente recortadas.',
  },
  {
    id: 'heliconia',
    commonName: 'Helicônia Rostrata / Papagaio',
    scientificName: 'Heliconia rostrata',
    category: 'tropical_arbusto',
    categoryLabel: 'Tropical Florida',
    matureHeightM: 1.9,
    canopyDiameterM: 1.3,
    sunExposure: 'Sol pleno / Meia-sombra',
    rootNote: 'Forma maciços lineares rente a muros e piscinas sem sujar a água.',
    foliageHex: '#367A34',
    secondaryFoliageHex: '#5DA349',
    trunkHex: '#4E7B3A',
    accentHex: '#E63329',
    accentLabel: 'Inflorescências pendentes vermelho e amarelo',
    unitCostBRL: 115,
    description: 'Planta tropical rizomatosa com hastes eretas, folhas largas estilo bananeira e brácteas pendentes bicolores vibrantes.',
  },
  {
    id: 'bougainvillea',
    commonName: 'Primavera / Bougainvillea',
    scientificName: 'Bougainvillea spectabilis',
    category: 'tropical_arbusto',
    categoryLabel: 'Arbusto Florífero',
    matureHeightM: 2.6,
    canopyDiameterM: 2.0,
    sunExposure: 'Sol pleno',
    rootNote: 'Excelente junto a muros frontais ou próximo ao pergolado gourmet.',
    foliageHex: '#356E33',
    secondaryFoliageHex: '#528B44',
    trunkHex: '#695240',
    accentHex: '#D91E85',
    accentLabel: 'Brácteas vibrantes magenta/fúcsia',
    unitCostBRL: 155,
    description: 'Arbusto lenhoso escandente de florada contínua em cachos magenta vibrantes sob sol intenso.',
  },
  {
    id: 'moreia',
    commonName: 'Moréia Bicolor (Íris-da-Praia)',
    scientificName: 'Dietes bicolor',
    category: 'tropical_arbusto',
    categoryLabel: 'Bordadura / Forração',
    matureHeightM: 0.75,
    canopyDiameterM: 0.85,
    sunExposure: 'Sol pleno / Meia-sombra',
    rootNote: 'Ideal para bordar caminhos de piso, brita e decks sem sujar piscinas.',
    foliageHex: '#3F7D3B',
    secondaryFoliageHex: '#67A355',
    trunkHex: '#396E34',
    accentHex: '#F2E59F',
    accentLabel: 'Flores creme com mácula castanho-alaranjada',
    unitCostBRL: 48,
    description: 'Touceira linear de folhas laminares rígidas dispostas em leque e delicadas flores creme duradouras.',
  },
  {
    id: 'buxinho',
    commonName: 'Buxinho Topiado (Esfera)',
    scientificName: 'Buxus sempervirens',
    category: 'tropical_arbusto',
    categoryLabel: 'Arbusto Topiado',
    matureHeightM: 0.85,
    canopyDiameterM: 0.9,
    sunExposure: 'Sol pleno / Meia-sombra',
    rootNote: 'Raízes muito compactas; perfeito para canteiros geométricos e entrada.',
    foliageHex: '#2E672F',
    secondaryFoliageHex: '#4E8F46',
    trunkHex: '#634E3C',
    accentHex: '#6EA857',
    accentLabel: 'Foliagem densa podada em forma escultural',
    unitCostBRL: 95,
    description: 'Arbusto clássico de folhas miúdas e densas conduzido em geometria compacta junto a pórticos e acessos.',
  },
  {
    id: 'podocarpus',
    commonName: 'Podocarpo (Pinheiro-de-Buda)',
    scientificName: 'Podocarpus macrophyllus',
    category: 'tropical_arbusto',
    categoryLabel: 'Cerca-Viva Colunar',
    matureHeightM: 3.2,
    canopyDiameterM: 0.95,
    sunExposure: 'Sol pleno / Meia-sombra',
    rootNote: 'Zero raízes invasivas; melhor cerca-viva colunar para corredores estreitos.',
    foliageHex: '#275E2D',
    secondaryFoliageHex: '#458441',
    trunkHex: '#5D4838',
    accentHex: '#5FA04F',
    accentLabel: 'Copa colunar ereta densa e uniforme',
    unitCostBRL: 165,
    description: 'Conífera ornamental de silhueta vertical estreita e folhagem acetinada perene ideal ao longo de muros.',
  },
];

export interface ExteriorSurfaceMeta {
  id: ExteriorSurfaceType;
  label: string;
  shortLabel: string;
  colorHex: string;
  accentHex: string;
  permeable: boolean;
  antiSlip: boolean;
  unitCostBRL: number;
  notes: string;
}

export const EXTERIOR_SURFACE_CATALOG: ExteriorSurfaceMeta[] = [
  {
    id: 'grama_esmeralda',
    label: 'Grama Esmeralda (Zoysia japonica)',
    shortLabel: 'Grama Esmeralda',
    colorHex: '#4C8441',
    accentHex: '#66A353',
    permeable: true,
    antiSlip: true,
    unitCostBRL: 42,
    notes: 'Alta resistência ao pisoteio e excelente absorção pluvial (100% permeável).',
  },
  {
    id: 'grama_sao_carlos',
    label: 'Grama São Carlos (Meia-Sombra)',
    shortLabel: 'Grama São Carlos',
    colorHex: '#3E7538',
    accentHex: '#5A944C',
    permeable: true,
    antiSlip: true,
    unitCostBRL: 46,
    notes: 'Folhas largas tolerantes ao sombreamento lateral entre muros e edificações.',
  },
  {
    id: 'grama_amendoim',
    label: 'Grama Amendoim Ornamental',
    shortLabel: 'Grama Amendoim',
    colorHex: '#4A893C',
    accentHex: '#ECC82E',
    permeable: true,
    antiSlip: true,
    unitCostBRL: 58,
    notes: 'Forração perene dispensando podas frequentes, com delicadas flores amarelas.',
  },
  {
    id: 'piso_antiderrapante',
    label: 'Porcelanato Externo Antiderrapante',
    shortLabel: 'Piso Antiderrapante',
    colorHex: '#C5C0B6',
    accentHex: '#9C968B',
    permeable: false,
    antiSlip: true,
    unitCostBRL: 148,
    notes: 'Acabamento abrasivo COF >= 0,50 indicado para borda de piscina, calçadas e área gourmet.',
  },
  {
    id: 'cimento_queimado',
    label: 'Cimento Queimado / Concreto Desempenado',
    shortLabel: 'Cimento Queimado',
    colorHex: '#8C9199',
    accentHex: '#686E76',
    permeable: false,
    antiSlip: true,
    unitCostBRL: 92,
    notes: 'Piso monolítico contemporâneo com juntas de dilatação serradas.',
  },
  {
    id: 'areia',
    label: 'Areia Clara Lavada (Praia / Lazer)',
    shortLabel: 'Areia Lavada',
    colorHex: '#DECBA4',
    accentHex: '#C7B084',
    permeable: true,
    antiSlip: true,
    unitCostBRL: 64,
    notes: 'Superfície drenante natural para lounge de sol, playground ou prainha seca.',
  },
  {
    id: 'brita',
    label: 'Brita Ornamental / Pedrisco Drenante',
    shortLabel: 'Brita / Pedrisco',
    colorHex: '#A2A7AE',
    accentHex: '#7A7F86',
    permeable: true,
    antiSlip: true,
    unitCostBRL: 68,
    notes: 'Camada sobre manta geotêxtil garantindo 100% de drenagem e zero lama em corredores.',
  },
  {
    id: 'deck_madeira',
    label: 'Deck Madeira Cumaru / Ecológica',
    shortLabel: 'Deck Madeira',
    colorHex: '#9E683D',
    accentHex: '#754927',
    permeable: true,
    antiSlip: true,
    unitCostBRL: 265,
    notes: 'Réguas ventiladas com espaçamento drenante para lounge de piscina e pergolado.',
  },
  {
    id: 'paver_intertravado',
    label: 'Piso Intertravado Permeável (Paver)',
    shortLabel: 'Paver Intertravado',
    colorHex: '#A79B8E',
    accentHex: '#7D7267',
    permeable: true,
    antiSlip: true,
    unitCostBRL: 118,
    notes: 'Blocos de concreto assentados sobre colchão de areia, ideais para acesso de veículos e pedestres.',
  },
];

export function getBotanicalMeta(speciesId: BotanicalSpeciesId): BotanicalSpeciesMeta {
  return (
    BOTANICAL_SPECIES_CATALOG.find((s) => s.id === speciesId) ?? BOTANICAL_SPECIES_CATALOG[0]
  );
}

export function getExteriorSurfaceMeta(type: ExteriorSurfaceType): ExteriorSurfaceMeta {
  return (
    EXTERIOR_SURFACE_CATALOG.find((s) => s.id === type) ?? EXTERIOR_SURFACE_CATALOG[0]
  );
}

export function createDefaultLandscaping(site?: Site): SiteLandscaping {
  const defaultZones: ExteriorSurfaceZone[] = [];
  if (site) {
    const norm = normalizeSiteData(site);
    const bbox = getBoundingBox(norm.vertices);
    for (const gate of norm.accesses) {
      if (!gate.enabled) continue;
      const isVeh = gate.type === 'veiculo';
      if (norm.streetSide === 'baixo') {
        defaultZones.push({
          id: `ez-access-${gate.id}`,
          label: isVeh ? 'Acesso Veículos (Paver)' : 'Caminho Acesso Social',
          surfaceType: isVeh ? 'paver_intertravado' : 'piso_antiderrapante',
          x: round2(Math.max(0.2, Math.min(bbox.maxX - gate.widthM, gate.offsetM))),
          y: round2(Math.max(0, bbox.maxY - Math.min(4.0, Math.max(1.8, norm.setbacks.front)))),
          width: round2(gate.widthM),
          depth: round2(Math.min(4.0, Math.max(1.8, norm.setbacks.front))),
        });
      }
    }
  }
  return {
    defaultGroundSurface: 'grama_esmeralda',
    surfaceZones: defaultZones,
    pools: [],
    gourmetAreas: [],
    plants: [],
    gardenLightsOn: true,
  };
}

/**
 * Generates an architecturally balanced landscaping layout (front access path, pool + deck,
 * gourmet pergola, pebble strips, and well-spaced Brazilian fruit/palm/ornamental species)
 * automatically avoiding all placed buildings in `project.floors[0]`.
 */
export function autoPopulateLandscaping(project: Project): SiteLandscaping {
  const norm = normalizeSiteData(project.site);
  const bbox = getBoundingBox(norm.vertices);
  const unitRects = (project.floors[0]?.units ?? [])
    .map((inst) => {
      const ut = project.unitTypes.find((t) => t.id === inst.unitTypeId);
      return ut ? getUnitWorldRect(inst, ut) : null;
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  const overlapsBuildings = (rx: number, ry: number, rw: number, rd: number, pad = 0.25): boolean => {
    const box = { x: rx - pad, y: ry - pad, width: rw + pad * 2, depth: rd + pad * 2 };
    return unitRects.some((u) => rectsOverlap(box, u, 0.01));
  };

  const zones: ExteriorSurfaceZone[] = [];
  const pools: PoolSpec[] = [];
  const gourmetAreas: GourmetAreaSpec[] = [];
  const plants: LandscapePlantItem[] = [];

  // 1. Paving paths from enabled gates
  for (const gate of norm.accesses) {
    if (!gate.enabled) continue;
    const isVeh = gate.type === 'veiculo';
    const frontStripD = round2(Math.min(Math.max(1.6, norm.setbacks.front), bbox.depth * 0.35));
    if (norm.streetSide === 'baixo') {
      zones.push({
        id: `ez-gate-${gate.id}`,
        label: isVeh ? 'Vaga / Paver Veículos' : 'Passeio Social Antiderrapante',
        surfaceType: isVeh ? 'paver_intertravado' : 'piso_antiderrapante',
        x: round2(Math.max(0.15, Math.min(bbox.maxX - gate.widthM - 0.15, gate.offsetM))),
        y: round2(bbox.maxY - frontStripD),
        width: round2(gate.widthM),
        depth: frontStripD,
      });
    } else if (norm.streetSide === 'cima') {
      zones.push({
        id: `ez-gate-${gate.id}`,
        label: isVeh ? 'Vaga / Paver Veículos' : 'Passeio Social Antiderrapante',
        surfaceType: isVeh ? 'paver_intertravado' : 'piso_antiderrapante',
        x: round2(Math.max(0.15, Math.min(bbox.maxX - gate.widthM - 0.15, gate.offsetM))),
        y: 0,
        width: round2(gate.widthM),
        depth: frontStripD,
      });
    }
  }

  // 2. Find best free leisure rectangle inside the lot (prefer front garden or back courtyard or side yard)
  const candSpaces = [
    // Front setback lounge (when front setback >= 3.2m)
    {
      name: 'front',
      x: round2(bbox.minX + 0.5),
      y: round2(bbox.maxY - Math.max(0.5, norm.setbacks.front - 0.3)),
      w: round2(bbox.width - 1.0),
      d: round2(Math.max(0, norm.setbacks.front - 0.6)),
    },
    // Right yard corridor / side garden
    {
      name: 'right',
      x: round2(Math.max(bbox.minX + 0.5, ...unitRects.map((u) => u.x + u.width + 0.4))),
      y: round2(bbox.minY + 1.2),
      w: round2(
        bbox.maxX - 0.4 - Math.max(bbox.minX + 0.5, ...unitRects.map((u) => u.x + u.width + 0.4)),
      ),
      d: round2(bbox.depth - 2.4),
    },
    // Rear yard (if building doesn't reach back)
    {
      name: 'back',
      x: round2(bbox.minX + 0.5),
      y: round2(bbox.minY + 0.4),
      w: round2(bbox.width - 1.0),
      d: round2(
        Math.min(
          6.0,
          Math.max(0, (unitRects.length > 0 ? Math.min(...unitRects.map((u) => u.y)) : bbox.maxY) - bbox.minY - 0.8),
        ),
      ),
    },
  ];

  let placedPool = false;
  let placedGourmet = false;

  for (const sp of candSpaces) {
    if (sp.w < 2.2 || sp.d < 2.0) continue;
    if (overlapsBuildings(sp.x, sp.y, sp.w, sp.d, 0.2)) continue;

    if (!placedPool && sp.w >= 3.2 && sp.d >= 2.2) {
      const pW = round2(Math.min(4.2, sp.w * 0.56));
      const pD = round2(Math.min(2.6, Math.max(1.8, sp.d - 0.65)));
      const pX = round2(sp.x + 0.45);
      const pY = round2(sp.y + (sp.d - pD) / 2);
      if (!overlapsBuildings(pX - 0.4, pY - 0.4, pW + 0.8, pD + 0.8, 0.15)) {
        zones.push({
          id: 'ez-pool-deck',
          label: 'Deck Madeira Solário Piscina',
          surfaceType: 'deck_madeira',
          x: round2(Math.max(bbox.minX + 0.15, pX - 0.45)),
          y: round2(Math.max(bbox.minY + 0.15, pY - 0.4)),
          width: round2(pW + 0.9),
          depth: round2(pD + 0.8),
        });
        pools.push({
          id: 'pool-main',
          label: 'Piscina Lazer c/ Prainha e LED',
          x: pX,
          y: pY,
          width: pW,
          depth: pD,
          waterDepthM: 1.35,
          style: 'com_prainha',
          copingMaterial: 'pedra_sao_tome',
          linerColor: 'turquesa_hijau',
          hasLedLights: true,
          hasWaterfall: true,
        });
        placedPool = true;

        // Place gourmet pergola next to pool if space permits
        const remW = round2(sp.x + sp.w - (pX + pW + 0.7));
        if (!placedGourmet && remW >= 2.3 && sp.d >= 2.1) {
          const gW = round2(Math.min(3.4, remW));
          const gD = round2(Math.min(2.8, sp.d));
          const gX = round2(pX + pW + 0.6);
          const gY = round2(sp.y + (sp.d - gD) / 2);
          if (!overlapsBuildings(gX, gY, gW, gD, 0.15)) {
            zones.push({
              id: 'ez-gourmet-floor',
              label: 'Piso Cimento Queimado Gourmet',
              surfaceType: 'cimento_queimado',
              x: gX,
              y: gY,
              width: gW,
              depth: gD,
            });
            gourmetAreas.push({
              id: 'gourmet-main',
              label: 'Espaço Gourmet c/ Pergolado e Churrasqueira',
              x: gX,
              y: gY,
              width: gW,
              depth: gD,
              hasPergola: true,
              pergolaMaterial: 'madeira_cumaru',
              hasChurrasqueira: true,
              hasCounterSink: true,
              hasDiningSet: gW >= 2.6,
            });
            placedGourmet = true;
          }
        }
      }
    } else if (!placedGourmet && sp.w >= 2.2 && sp.d >= 2.0) {
      const gW = round2(Math.min(3.4, sp.w - 0.3));
      const gD = round2(Math.min(2.8, sp.d - 0.3));
      const gX = round2(sp.x + 0.15);
      const gY = round2(sp.y + 0.15);
      if (!overlapsBuildings(gX, gY, gW, gD, 0.15)) {
        zones.push({
          id: 'ez-gourmet-floor',
          label: 'Piso Antiderrapante Área Gourmet',
          surfaceType: 'piso_antiderrapante',
          x: gX,
          y: gY,
          width: gW,
          depth: gD,
        });
        gourmetAreas.push({
          id: 'gourmet-main',
          label: 'Espaço Gourmet c/ Pergolado',
          x: gX,
          y: gY,
          width: gW,
          depth: gD,
          hasPergola: true,
          pergolaMaterial: 'madeira_cumaru',
          hasChurrasqueira: true,
          hasCounterSink: true,
          hasDiningSet: true,
        });
        placedGourmet = true;
      }
    }
  }

  // 3. Gravel drainage border strip along back edge
  if (bbox.width >= 3.0) {
    zones.push({
      id: 'ez-brita-dreno',
      label: 'Faixa Drenante Brita Perimetral',
      surfaceType: 'brita',
      x: round2(bbox.minX + 0.15),
      y: round2(bbox.minY + 0.12),
      width: round2(bbox.width - 0.3),
      depth: 0.75,
    });
  }

  // 4. Populate curated Brazilian plants cleanly outside buildings, pools, and gourmet pads
  const blockedRects = [
    ...unitRects.map((u) => ({ x: u.x - 0.6, y: u.y - 0.6, width: u.width + 1.2, depth: u.depth + 1.2 })),
    ...pools.map((p) => ({ x: p.x - 0.7, y: p.y - 0.7, width: p.width + 1.4, depth: p.depth + 1.4 })),
    ...gourmetAreas.map((g) => ({ x: g.x - 0.4, y: g.y - 0.4, width: g.width + 0.8, depth: g.depth + 0.8 })),
  ];

  const isFreeForPlant = (px: number, py: number, minDist = 0.9): boolean => {
    if (px < bbox.minX + 0.45 || px > bbox.maxX - 0.45 || py < bbox.minY + 0.45 || py > bbox.maxY - 0.45) {
      return false;
    }
    const pointRect = { x: px - 0.25, y: py - 0.25, width: 0.5, depth: 0.5 };
    if (blockedRects.some((r) => rectsOverlap(pointRect, r, 0))) return false;
    if (plants.some((pl) => Math.hypot(pl.x - px, pl.y - py) < minDist)) return false;
    return true;
  };

  const candidateSpots: Array<{ speciesId: BotanicalSpeciesId; x: number; y: number; scale: number }> = [
    { speciesId: 'palmeira_imperial', x: bbox.minX + 1.1, y: bbox.maxY - 1.1, scale: 0.92 },
    { speciesId: 'jabuticabeira', x: bbox.maxX - 1.3, y: bbox.maxY - 1.3, scale: 0.95 },
    { speciesId: 'ipe_amarelo', x: bbox.minX + 1.2, y: bbox.minY + 1.4, scale: 0.9 },
    { speciesId: 'coqueiro_anao', x: bbox.maxX - 1.2, y: bbox.minY + 1.6, scale: 0.95 },
    { speciesId: 'limoeiro', x: bbox.maxX - 1.1, y: bbox.minY + bbox.depth * 0.45, scale: 0.9 },
    { speciesId: 'pitangueira', x: bbox.maxX - 1.1, y: bbox.minY + bbox.depth * 0.68, scale: 0.9 },
    { speciesId: 'palmeira_areca', x: bbox.maxX - 0.8, y: bbox.minY + bbox.depth * 0.28, scale: 1.0 },
    { speciesId: 'bougainvillea', x: bbox.minX + 0.85, y: bbox.maxY - 0.8, scale: 0.95 },
    { speciesId: 'heliconia', x: bbox.maxX - 0.85, y: bbox.maxY - 2.3, scale: 1.0 },
    { speciesId: 'costela_de_adao', x: bbox.minX + 0.8, y: bbox.minY + bbox.depth * 0.55, scale: 1.0 },
    { speciesId: 'moreia', x: bbox.minX + 2.4, y: bbox.maxY - 0.75, scale: 1.0 },
    { speciesId: 'buxinho', x: bbox.minX + 3.4, y: bbox.maxY - 0.75, scale: 1.0 },
    { speciesId: 'podocarpus', x: bbox.maxX - 0.7, y: bbox.minY + bbox.depth * 0.82, scale: 1.0 },
  ];

  candidateSpots.forEach((spot, idx) => {
    const px = round2(spot.x);
    const py = round2(spot.y);
    if (isFreeForPlant(px, py, 0.85)) {
      plants.push({
        id: `pl-auto-${idx + 1}`,
        speciesId: spot.speciesId,
        x: px,
        y: py,
        scale: spot.scale,
        rotationDeg: (idx * 47) % 360,
      });
    }
  });

  return {
    defaultGroundSurface: 'grama_esmeralda',
    surfaceZones: zones,
    pools,
    gourmetAreas,
    plants,
    gardenLightsOn: true,
  };
}
