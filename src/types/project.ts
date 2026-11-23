export type ProjectStatus = 'em_andamento' | 'concluido' | 'arquivado';

export type ProjectStage =
  | 'estudo_conceitual'
  | 'estudo_preliminar'
  | 'anteprojeto'
  | 'aprovacao'
  | 'executivo'
  | 'dimensionado'
  | 'revisado'
  | 'validado_rt';

export type ConstructionMethodId =
  | 'alvenaria_convencional'
  | 'alvenaria_estrutural'
  | 'light_steel_frame'
  | 'wood_frame'
  | 'pre_moldado'
  | 'modular'
  | 'misto'
  | 'personalizado';

export type EntrySide = 'frente' | 'lateral_direita' | 'lateral_esquerda';

export type InternalPartitionType = 'alvenaria' | 'drywall';

export type MezzanineZone =
  | 'sobre_banho_cozinha'
  | 'fundos'
  | 'lateral_esquerda'
  | 'lateral_direita';

export type MezzanineStairLayout = 'reta' | 'em_l' | 'caracol_compacta';

export type MezzanineStructureType =
  | 'metalica_madeira'
  | 'steel_deck'
  | 'madeira_estrutural'
  | 'concreto_armado';

export type MezzanineUsage =
  | 'dormitorio'
  | 'home_office'
  | 'dormitorio_home_office'
  | 'deposito_estar';

export interface MezzanineConfig {
  enabled: boolean;
  zone: MezzanineZone;
  elevationM: number; // floor height of mezzanine platform above unit ground floor (e.g. 2.15m)
  slabThicknessM: number; // e.g. 0.12m
  coverageRatio: number; // 0.10 .. 0.65 (% of interior useful floor area)
  sizingMode?: 'percent' | 'dimensions';
  customWidthM?: number;
  customDepthM?: number;
  x: number;
  y: number;
  width: number;
  depth: number;
  usage: MezzanineUsage;
  structureType: MezzanineStructureType;
  stairLayout: MezzanineStairLayout;
  stairSide: 'esquerda' | 'direita';
  guardrailHeightM: number; // e.g. 1.05m
}

export interface StairSpec {
  steps: number;
  riserM: number; // espelho h (m)
  treadM: number; // piso p (m)
  blondelSumM: number; // 2*h + p (ideal 0.62 - 0.65m)
  direction: 'norte' | 'sul' | 'leste' | 'oeste';
  layout: MezzanineStairLayout;
  widthM: number;
}

export type SiteShapeType =
  | 'retangular'
  | 'quadrado'
  | 'trapezoidal'
  | 'irregular'
  | 'poligonal';

export type TopographyType = 'plano' | 'aclive' | 'declive' | 'irregular';

export interface Point2D {
  x: number; // meters
  y: number; // meters
}

export interface Setbacks {
  front: number; // m
  back: number;  // m
  left: number;  // m
  right: number; // m
}

export type MeasurementUnit = 'm' | 'cm';

export type LotFrontSide = 'baixo' | 'cima' | 'esquerda' | 'direita';

export type LotSideKey = 'front' | 'back' | 'left' | 'right';

export type BoundaryCondition = 'murada' | 'aberta' | 'compartilhada' | 'cerca' | 'outra';

export interface SiteEdgeBoundary {
  condition: BoundaryCondition;
  heightM: number;
  hasNeighborBuilding: boolean;
  notes?: string;
}

export type AccessGateType = 'pedestre' | 'veiculo' | 'misto';

export interface SiteAccessGate {
  id: string;
  label: string;
  type: AccessGateType;
  side: LotSideKey;
  offsetM: number; // distance from start of that edge (clockwise or left-to-right from street perspective)
  widthM: number;
  enabled: boolean;
}

export interface Site {
  shapeType: SiteShapeType;
  measurementUnit?: MeasurementUnit;
  streetSide?: LotFrontSide;
  front: number;       // m
  back: number;        // m
  leftDepth: number;   // m
  rightDepth: number;  // m
  declaredArea: number; // m2
  vertices: Point2D[]; // real polygon coordinates in meters
  orientationDeg: number; // North angle in degrees (0 = top/+Y)
  topography: TopographyType;
  slopePercent: number; // %
  levelDifference: number; // m
  elevationStart: number; // m
  elevationEnd: number; // m
  confrontations: {
    front: string;
    back: string;
    left: string;
    right: string;
  };
  boundaries?: {
    front: SiteEdgeBoundary;
    back: SiteEdgeBoundary;
    left: SiteEdgeBoundary;
    right: SiteEdgeBoundary;
  };
  accesses?: SiteAccessGate[];
  setbacks: Setbacks;
  easementArea: number; // área de servidão m2
  restrictions: string;
}

export type ImplantationZone =
  | 'frontal'
  | 'central'
  | 'fundos'
  | 'lado_esquerdo'
  | 'lado_direito'
  | 'ambos_lados'
  | 'centralizada'
  | 'personalizada';

export type ImplantationLayoutPattern =
  | 'isolada'
  | 'duas_lado_a_lado'
  | 'sequencia'
  | 'duas_fileiras'
  | 'ambos_lados'
  | 'conjunto_fundos'
  | 'personalizada';

export type ImplantationModelMode =
  | 'todas_iguais'
  | 'modelos_diferentes'
  | 'misto_repeticao';

export type ImplantationCouplingMode =
  | 'geminadas'
  | 'separadas'
  | 'mista'
  | 'personalizada';

export type ImplantationAccessMode = 'independente' | 'compartilhado' | 'misto';

export interface ImplantationGroupSpec {
  id: string;
  label: string;
  zone: Exclude<ImplantationZone, 'ambos_lados' | 'personalizada'>;
  count: number;
  unitTypeId: string;
  coupling: 'geminadas' | 'separadas';
  spacingM: number;
  mirroredRule: 'nenhuma' | 'alternada' | 'todas' | 'oposta_corredor';
  entranceOrientation: 'frente' | 'fundos' | 'lateral_esquerda' | 'lateral_direita';
  shareWallWithNeighbor: boolean;
}

export interface ImplantationCirculationSpec {
  corridorWidthM: number;
  minInterUnitSpacingM: number;
  accessMode: ImplantationAccessMode;
  serviceAreaM2: number;
  uncoveredAreaTargetM2: number;
  notes?: string;
}

export interface ImplantationConfig {
  primaryZone: ImplantationZone;
  layoutPattern: ImplantationLayoutPattern;
  totalUnitsTarget: number;
  leftCount: number;
  rightCount: number;
  frontCount: number;
  backCount: number;
  modelMode: ImplantationModelMode;
  couplingMode: ImplantationCouplingMode;
  interUnitSpacingM: number;
  mirrorAlternate: boolean;
  shareWallsWhenPossible: boolean;
  primaryUnitTypeId?: string;
  groups: ImplantationGroupSpec[];
  circulation: ImplantationCirculationSpec;
  lastGeneratedAt?: string;
}

export type RuleEvaluationStatus =
  | 'atendido'
  | 'nao_atendido'
  | 'nao_informado'
  | 'confirmacao_tecnica';

export interface UrbanRule {
  id: string;
  category:
    | 'codigo_obras'
    | 'plano_diretor'
    | 'uso_ocupacao'
    | 'zoneamento'
    | 'recuos'
    | 'taxa_ocupacao'
    | 'coef_aproveitamento'
    | 'permeabilidade'
    | 'altura_gabarito'
    | 'vagas'
    | 'iluminacao_ventilacao'
    | 'acessibilidade'
    | 'incendio'
    | 'outra';
  description: string;
  municipality: string;
  source: string;
  lawReference: string;
  referenceDate: string;
  effectiveStatus: string;
  parameterKey: string;
  parameterLimit: number | null;
  unit: string;
  condition: 'max' | 'min' | 'info';
  notes: string;
}

export interface RoomFinishes {
  floor: string;
  wall: string;
  ceiling: string;
  paint: string;
  baseboard: string;
  countertop?: string;
  sink?: string;
  faucet?: string;
  cabinets?: string;
}

export type RoomCategory =
  | 'sala_quarto'
  | 'sala'
  | 'quarto'
  | 'cozinha'
  | 'banheiro'
  | 'lavanderia'
  | 'area_servico'
  | 'circulacao'
  | 'varanda'
  | 'escritorio'
  | 'deposito'
  | 'mezanino'
  | 'personalizado';

export interface Room {
  id: string;
  code: string;
  name: string;
  category: RoomCategory;
  x: number; // m relative to unit origin
  y: number; // m relative to unit origin
  width: number; // m
  depth: number; // m
  ceilingHeight: number; // m
  elevationM?: number; // floor elevation above ground (e.g. mezzanine deck)
  naturalLightingArea: number; // m2 (computed from windows)
  ventilationArea: number; // m2 (computed from windows)
  finishes: RoomFinishes;
  notes: string;
}

export interface Wall {
  id: string;
  code: string;
  start: Point2D;
  end: Point2D;
  thickness: number; // m (e.g. 0.15 or 0.10)
  height: number; // m
  isExternal: boolean;
  material: string;
  constructionSystem: ConstructionMethodId;
  loadBearing: boolean;
}

export type OpeningType = 'porta' | 'janela' | 'vao';

export type OpeningRole = 'entrada' | 'banheiro' | 'quarto' | 'outro';

export type OpeningKind =
  | 'porta_abrir'
  | 'porta_correr'
  | 'janela_correr'
  | 'vitro_basculante'
  | 'vitro_maxim_ar'
  | 'vitro_fixo';

export interface Opening {
  id: string;
  code: string;
  wallId: string;
  type: OpeningType;
  role?: OpeningRole; // entrada (0.80m fixo), banheiro (0.60m fixo), quarto (0.70m fixo), outro (livre)
  openingKind?: OpeningKind;
  subtype: string; // ex: 'Porta de abrir', 'Janela de correr', 'Vitrô basculante'
  offsetAlongWall: number; // distance from wall start in meters
  width: number; // m
  height: number; // m
  sillHeight: number; // peitoril in m (0 for doors)
  thickness: number; // m
  swingDirection: 'left_in' | 'left_out' | 'right_in' | 'right_out' | 'sliding' | 'none';
  material: string;
}

export type FurnitureCategory =
  | 'cama'
  | 'guarda_roupa'
  | 'sofa'
  | 'mesa'
  | 'cadeira'
  | 'bancada'
  | 'geladeira'
  | 'fogao'
  | 'cooktop'
  | 'microondas'
  | 'maquina_lavar'
  | 'tanque'
  | 'armario'
  | 'gabinete'
  | 'box'
  | 'vaso_sanitario'
  | 'lavatorio'
  | 'chuveiro'
  | 'espelho'
  | 'luminaria'
  | 'rack_tv'
  | 'tv'
  | 'mesa_cabeceira'
  | 'escada'
  | 'rampa';

export interface FurnitureItem {
  id: string;
  name: string;
  category: FurnitureCategory;
  roomId: string;
  x: number; // center or top-left in unit coords (m) - we store top-left before rotation, or center x,y
  y: number;
  width: number; // m
  depth: number; // m
  height: number; // m
  elevationM?: number; // base height above unit floor (e.g. on mezzanine)
  rotationDeg: number; // 0, 90, 180, 270
  requiresPower?: boolean;
  requiresWater?: boolean;
  requiresDrain?: boolean;
  stairSpec?: StairSpec;
}

export type ElectricalCategory =
  | 'tomada_baixa'
  | 'tomada_media'
  | 'tomada_alta'
  | 'tomada_especifica'
  | 'tomada_tug'
  | 'tomada_tue'
  | 'interruptor'
  | 'iluminacao_teto'
  | 'arandela'
  | 'ar_condicionado'
  | 'chuveiro'
  | 'forno'
  | 'cooktop'
  | 'maquina_lavar'
  | 'geladeira'
  | 'microondas'
  | 'coifa'
  | 'dados'
  | 'campainha'
  | 'tv'
  | 'antena_tv'
  | 'wifi_ap'
  | 'cftv'
  | 'rack_ti'
  | 'interfone'
  | 'personalizado';

export interface ElectricalPoint {
  id: string;
  code: string;
  category: ElectricalCategory;
  label: string;
  roomId: string;
  x: number; // m
  y: number; // m
  z: number; // height in m (user configurable)
  referenceWall: string;
  referenceDistance: number; // m
  powerVA: number; // VA or W
  voltage: 127 | 220;
  powerFactor: number;
  circuitId: string;
  conductorSectionMm2: number;
  conduitDiameterMm: number;
  protection: string; // e.g., 'Disjuntor 16A + DR 30mA'
  notes: string;
}

export type WaterCategory =
  | 'agua_fria'
  | 'agua_quente'
  | 'lavatorio'
  | 'pia'
  | 'chuveiro'
  | 'vaso_sanitario'
  | 'tanque'
  | 'maquina_lavar'
  | 'equipamento'
  | 'personalizado';

export interface WaterPoint {
  id: string;
  code: string;
  category: WaterCategory;
  equipment: string;
  roomId: string;
  x: number;
  y: number;
  z: number; // m
  waterType: 'fria' | 'quente';
  diameterMm: number; // e.g., 25, 20
  material: string; // PVC soldável / PPR / CPVC
  availablePressureMca: number | null;
  supplySource: string;
  branchName: string;
  weightHunter: number; // peso relativo NBR 5626
  notes: string;
}

export type DrainageCategory =
  | 'pia'
  | 'lavatorio'
  | 'vaso_sanitario'
  | 'chuveiro'
  | 'ralo'
  | 'caixa_sifonada'
  | 'tanque'
  | 'maquina_lavar'
  | 'caixa_gordura'
  | 'caixa_inspecao'
  | 'tubo_queda'
  | 'ventilacao'
  | 'ramal_descarga'
  | 'ramal_esgoto'
  | 'coletor_predial';

export interface DrainagePoint {
  id: string;
  code: string;
  category: DrainageCategory;
  roomId: string;
  x: number;
  y: number;
  diameterMm: number; // 40, 50, 75, 100
  material: string; // PVC Esgoto SN
  slopePercent: number; // e.g. 2.0 or 1.0
  uhc: number; // Unidade Hunter de Contribuição
  connectedToId: string; // ID of downstream node/box
  notes: string;
}

export interface DimensionAnnotation {
  id: string;
  start: Point2D;
  end: Point2D;
  offset: number;
  label?: string;
}

export interface StructuralElement {
  id: string;
  code: string;
  type: 'fundacao' | 'sapata' | 'bloco' | 'estaca' | 'baldrame' | 'pilar' | 'viga' | 'laje' | 'escada' | 'metalico' | 'pre_moldado';
  floorId: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  material: string;
  sectionLabel: string;
  isDimensioned: boolean; // must be false unless real structural calc engine ran
  notes: string;
}

export interface RainwaterElement {
  id: string;
  code: string;
  type: 'cobertura' | 'calha' | 'condutor' | 'ralo_pluvial' | 'caixa_coletora' | 'tubo_descida' | 'reservatorio_pluvial';
  description: string;
  catchmentAreaM2: number;
  diameterOrSection: string;
  slopePercent: number;
  notes: string;
}

export interface UnitType {
  id: string;
  code: string;
  name: string;
  basePreset: string;
  targetArea: number;
  width: number; // m
  depth: number; // m
  ceilingHeight: number; // m
  bedrooms: number;
  bathrooms: number;
  kitchens: number;
  hasLaundry: boolean;
  hasBalcony: boolean;
  hasMezzanine: boolean;
  mezzanine?: MezzanineConfig;
  entrySide?: EntrySide;
  internalPartitionType?: InternalPartitionType;
  accessible: boolean;
  finishStandard: 'economico' | 'padrao' | 'medio_alto' | 'personalizado';
  rooms: Room[];
  walls: Wall[];
  openings: Opening[];
  furniture: FurnitureItem[];
  electricalPoints: ElectricalPoint[];
  waterPoints: WaterPoint[];
  drainagePoints: DrainagePoint[];
  dimensions: DimensionAnnotation[];
}

export interface UnitInstance {
  id: string;
  unitNumber: string; // e.g. "101", "102", "201"
  unitTypeId: string;
  floorId: string;
  x: number; // m in site/floor coords
  y: number; // m in site/floor coords
  rotationDeg: number; // 0, 90, 180, 270
  mirrored: boolean;
  zoneSide?: 'frontal' | 'central' | 'fundos' | 'esquerdo' | 'direito' | 'personalizada';
  couplingGroupId?: string;
  couplingType?: 'geminada' | 'separada' | 'isolada';
  sharedWallIds?: string[];
  individualName?: string;
  entranceOrientation?: 'frente' | 'fundos' | 'lateral_esquerda' | 'lateral_direita';
  notes?: string;
}

export interface Floor {
  id: string;
  levelIndex: number; // 0 = Térreo, 1 = 1º Pavimento...
  name: string;
  elevation: number; // m
  floorToFloorHeight: number; // m
  slabThickness: number; // m
  corridorWidth: number; // m
  commonAreaM2: number;
  units: UnitInstance[];
  extraWalls: Wall[]; // building perimeter / corridor / stair walls
  extraOpenings: Opening[];
}

export interface ConstructionMethodDetails {
  methodId: ConstructionMethodId;
  name: string;
  externalWallThickness: number; // m
  internalWallThickness: number; // m
  internalPartitionType?: InternalPartitionType;
  roofType: 'telha_ceramica' | 'telha_fibrocimento' | 'telha_termoacustica' | 'laje_impermeabilizada' | 'personalizada';
  roofSlopePercent: number;
  // Specific attributes per system
  masonryBlockType?: string;
  mortarType?: string;
  structuralBlockFamily?: string;
  structuralResistanceMpa?: number | null;
  groutSpec?: string;
  lsfProfileSpec?: string;
  lsfStudSpacingM?: number;
  lsfSheathing?: string;
  woodSpecies?: string;
  woodSection?: string;
  precastPanelSpec?: string;
  insulationSpec?: string;
  notes: string;
}

export interface ElectricalDefaultHeights {
  tomadaBaixa: number;
  tomadaMedia: number;
  tomadaAlta: number;
  interruptor: number;
  arCondicionado: number;
  chuveiro: number;
  iluminacaoTeto: number;
}

export interface SanitaryFixturesSpec {
  toiletType:
    | 'caixa_acoplada_dual'
    | 'caixa_acoplada_monobloco'
    | 'convencional_valvula'
    | 'suspensa_embutida';
  sanitaryWareColor: 'branco_gelo' | 'preto_fosco' | 'cinza_urbano';
  showerType:
    | 'eletrico_multitemperatura'
    | 'ducha_eletronica_haste'
    | 'ducha_aquecedor_gas'
    | 'ducha_teto_monocomando';
  washbasinType:
    | 'cuba_apoio_granito'
    | 'cuba_embutir_granito'
    | 'lavatorio_coluna_suspensa'
    | 'pia_esculpida_porcelanato';
  washbasinFaucet:
    | 'bica_baixa_cromada'
    | 'bica_alta_apoio'
    | 'monocomando_mesa'
    | 'torneira_parede_arejador';
  kitchenSinkType:
    | 'granito_cuba_inox'
    | 'quartzo_cuba_esculpida'
    | 'inox_monobloco';
  kitchenFaucet:
    | 'bica_movel_mesa'
    | 'monocomando_gourmet_extensivel'
    | 'torneira_parede_flexivel';
  laundryTubType:
    | 'louca_suspensa'
    | 'inox_embutida'
    | 'marmore_sintetico_compacto';
  drainType:
    | 'ralo_linear_oculto'
    | 'ralo_seco_click_inox'
    | 'ralo_quadrado_convencional';
  metalsFinish: 'cromado' | 'preto_fosco' | 'aco_escovado' | 'dourado_escovado';
}

export interface HydraulicConfig {
  occupantsPerUnit: number;
  litersPerPersonDay: number;
  reserveDays: number;
  supplyVoltage: 127 | 220;
  coldWaterMaterial: string;
  hotWaterMaterial: string;
  hasHotWaterHeating: boolean;
  heatingSystem: string;
  sanitaryFixtures?: SanitaryFixturesSpec;
}

export interface RainwaterConfig {
  municipality: string;
  rainfallIntensityMmH: number | null; // mm/h - must be user-supplied with source
  returnPeriodYears: number | null;
  sourceReference: string;
  referencePeriod: string;
}

export interface TechnicalProfessional {
  id: string;
  role: 'contratante' | 'proprietario' | 'arquiteto' | 'eng_civil' | 'eng_eletricista' | 'eng_hidraulico' | 'outro';
  name: string;
  profession: string;
  council: string; // CAU / CREA
  registrationNumber: string;
  state: string;
  attribution: string;
  discipline: string;
  artRrtCode: string;
  attachmentName: string;
}

export interface BudgetEntry {
  id: string;
  code: string;
  sinapiCode?: string;
  description: string;
  discipline: string;
  category: 'material' | 'mao_de_obra' | 'equipamento' | 'servico';
  unit: string;
  quantity: number;
  unitPrice: number | null; // null = SEM COTAÇÃO
  lossFactorPercent: number;
  supplier: string;
  sourceBase: string; // e.g., SINAPI-RJ / Manual
  notes: string;
}

export interface BudgetSettings {
  sourceBase: string;
  region: string;
  sinapiRegime?: 'desonerado' | 'nao_desonerado' | 'manual';
  competence: string;
  referenceDate: string;
  socialChargesPercent: number | null;
  bdiPercent: number;
  indirectCostsPercent: number;
  discountPercent: number;
  criteriaNotes: string;
}

export interface NormativeReference {
  id: string;
  code: string;
  title: string;
  edition: string;
  date: string;
  discipline: string;
  application: string;
  source: string;
  parametersSummary: string;
  updateStatus: 'verificar_vigencia' | 'verificada_usuario' | 'pendente';
  verifiedBy: string;
}

export interface RevisionEntry {
  id: string;
  revisionCode: string; // R00, R01...
  timestamp: string;
  author: string;
  description: string;
  stage: ProjectStage;
}

export interface CapturedRender {
  id: string;
  title: string;
  preset: string;
  timeOfDay: string;
  dataUrl: string;
  createdAt: string;
}

export type WallExteriorFinish =
  | 'textura_acrilica'
  | 'reboco_liso'
  | 'tijolinho_aparente'
  | 'pedra_madeira'
  | 'ripado_madeira'
  | 'cimento_queimado';

export type WallInteriorFinish =
  | 'pintura_fosca'
  | 'cimento_queimado'
  | 'ceramica_metro'
  | 'madeira_acoplada';

export type FloorFinishMaterial =
  | 'porcelanato_cinza'
  | 'porcelanato_marmorizado'
  | 'ceramica_bege'
  | 'madeira_carvalho'
  | 'cimento_queimado'
  | 'piso_vinilico';

export type RoofFinishMaterial =
  | 'termoacustica_zinco'
  | 'ceramica_terracota'
  | 'fibrocimento_cinza'
  | 'concreto_impermeabilizado';

export type RoofShapeType =
  | 'platibanda'
  | 'duas_aguas'
  | 'uma_agua'
  | 'laje_plana';

export type ExteriorSurfaceType =
  | 'grama_esmeralda'
  | 'grama_sao_carlos'
  | 'grama_amendoim'
  | 'piso_antiderrapante'
  | 'cimento_queimado'
  | 'areia'
  | 'brita'
  | 'deck_madeira'
  | 'paver_intertravado';

export type BotanicalSpeciesId =
  | 'jabuticabeira'
  | 'mangueira'
  | 'limoeiro'
  | 'pitangueira'
  | 'aceroleira'
  | 'bananeira'
  | 'coqueiro_anao'
  | 'palmeira_imperial'
  | 'palmeira_areca'
  | 'ipe_amarelo'
  | 'pata_de_vaca'
  | 'costela_de_adao'
  | 'heliconia'
  | 'bougainvillea'
  | 'moreia'
  | 'buxinho'
  | 'podocarpus';

export interface ExteriorSurfaceZone {
  id: string;
  label: string;
  surfaceType: ExteriorSurfaceType;
  x: number;
  y: number;
  width: number;
  depth: number;
  notes?: string;
}

export interface PoolSpec {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  waterDepthM: number;
  style: 'retangular' | 'com_prainha';
  copingMaterial: 'pedra_sao_tome' | 'porcelanato_antiderrapante' | 'deck_madeira';
  linerColor: 'azul_piscina' | 'turquesa_hijau' | 'ardosia';
  hasLedLights: boolean;
  hasWaterfall: boolean;
}

export interface GourmetAreaSpec {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  hasPergola: boolean;
  pergolaMaterial: 'madeira_cumaru' | 'aco_preto';
  hasChurrasqueira: boolean;
  hasCounterSink: boolean;
  hasDiningSet: boolean;
}

export interface LandscapePlantItem {
  id: string;
  speciesId: BotanicalSpeciesId;
  x: number;
  y: number;
  scale: number;
  rotationDeg?: number;
}

export interface SiteLandscaping {
  defaultGroundSurface: ExteriorSurfaceType;
  surfaceZones: ExteriorSurfaceZone[];
  pools: PoolSpec[];
  gourmetAreas: GourmetAreaSpec[];
  plants: LandscapePlantItem[];
  gardenLightsOn?: boolean;
}

export interface RenderMaterialSettings {
  facadeColor: string;
  interiorWallColor: string;
  wallExteriorFinish?: WallExteriorFinish;
  wallInteriorFinish?: WallInteriorFinish;
  wetWallBathroom?:
    | 'ceramica_branca'
    | 'porcelanato_marmorizado'
    | 'azulejo_metro'
    | 'cimento_queimado_resinado'
    | 'porcelanato_amadeirado';
  wetWallKitchen?:
    | 'azulejo_metro'
    | 'porcelanato_acetinado'
    | 'ceramica_esmaltada'
    | 'cimento_queimado_resinado';
  floorMaterial: FloorFinishMaterial;
  wetFloorMaterial?:
    | 'porcelanato_antiderrapante'
    | 'ceramica_acetinada'
    | 'cimento_queimado_fosco';
  baseboardType?:
    | 'porcelanato_10cm'
    | 'poliestireno_branco_10cm'
    | 'madeira_mdf_7cm'
    | 'negativo_embutido';
  ceilingType?:
    | 'gesso_drywall_tabica'
    | 'laje_pintada'
    | 'forro_pvc_amadeirado'
    | 'forro_madeira_cumaru';
  interiorDoorMaterial?:
    | 'madeira_pintada_branca'
    | 'madeira_verniz_natural'
    | 'mdf_melaminico_cinza'
    | 'aluminio_vidro';
  glassType?: 'temperado_incolor' | 'temperado_verde_solar' | 'temperado_fume';
  roofMaterial: RoofFinishMaterial;
  roofShape?: RoofShapeType;
  windowFrameColor: 'aluminio_preto' | 'aluminio_branco' | 'madeira';
  timeOfDay: 'dia' | 'entardecer' | 'noite';
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  artificialLightsOn: boolean;
  renderQuality?: 'arquitetonico' | 'tecnico';
}

export interface Project {
  schemaVersion: number;
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  stage: ProjectStage;
  client: string;
  owner: string;
  address: string;
  municipality: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  site: Site;
  implantation?: ImplantationConfig;
  landscaping?: SiteLandscaping;
  urbanRules: UrbanRule[];
  constructionMethod: ConstructionMethodDetails;
  floors: Floor[];
  unitTypes: UnitType[];
  structuralElements: StructuralElement[];
  rainwaterElements: RainwaterElement[];
  rainwaterConfig: RainwaterConfig;
  electricalHeights: ElectricalDefaultHeights;
  hydraulicConfig: HydraulicConfig;
  professionals: TechnicalProfessional[];
  budgetEntries: BudgetEntry[];
  budgetSettings: BudgetSettings;
  normativeRefs: NormativeReference[];
  renderSettings: RenderMaterialSettings;
  capturedRenders?: CapturedRender[];
  memorialOverrides: Record<string, string>;
  revisions: RevisionEntry[];
  fireSafetyNotes: {
    occupancyClass: string;
    stateRegulation: string;
    estimatedPopulationPerUnit: number;
    hasExtinguishers: boolean;
    hasEmergencyLighting: boolean;
    hasSignage: boolean;
    hasHydrants: boolean;
    verifiedByProfessional: boolean;
  };
  accessibilityConfig: {
    normReference: string;
    requireAccessibleUnits: boolean;
    minDoorWidthM: number;
    minCorridorWidthM: number;
    turningCircleDiameterM: number;
  };
}
