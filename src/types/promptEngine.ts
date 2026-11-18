export type MacroFormat = 'json' | 'sections' | 'single_paragraph'

export type KernelDialect =
  | 'nano_banana_g6'
  | 'fdr_v3'
  | 'latente_v02'
  | 'fdr_direct'
  | 'body_mechanics_12block'
  | 'studio_editorial_v5'
  | 'numbered_sections'
  | 'qwen_natural'

export type RarityTier = 'S' | 'A' | 'B' | 'C' | 'D'

export type RarityQuadrant =
  | 'raro_maduro'
  | 'raro_imaturo'
  | 'comum_maduro'
  | 'comum_imaturo'

export type SourceLibFilter = 'google_flow' | 'gemini_kimi' | 'all'

export type AttributeKey =
  | 'sujeito'
  | 'cenario'
  | 'luz'
  | 'camera'
  | 'textura_material'
  | 'estilo'
  | 'projeto_cliente'
  | 'estrutura'

export const ATTRIBUTE_META: ReadonlyArray<{
  key: AttributeKey
  label: string
  shortLabel: string
  description: string
}> = [
  {
    key: 'sujeito',
    label: 'Sujeito',
    shortLabel: 'SUJ',
    description: 'Identidade, expressão/FACS, pose, biomecânica e telemetria angular.',
  },
  {
    key: 'cenario',
    label: 'Cenário',
    shortLabel: 'CEN',
    description: 'Locação, arquitetura, ambiente e elementos de fundo/props.',
  },
  {
    key: 'luz',
    label: 'Luz',
    shortLabel: 'LUZ',
    description: 'Física de iluminação, direção, temperatura Kelvin, flash e sombras.',
  },
  {
    key: 'camera',
    label: 'Câmera',
    shortLabel: 'CAM',
    description: 'Dispositivo, distância focal, enquadramento, ângulo e oclusão.',
  },
  {
    key: 'textura_material',
    label: 'Textura / Material',
    shortLabel: 'MAT',
    description: 'Peças, tecidos, acabamentos, textura de pele/superfície e paleta.',
  },
  {
    key: 'estilo',
    label: 'Estilo',
    shortLabel: 'EST',
    description: 'Linhagem estética, color grading, LUT/filme e intenção visual.',
  },
  {
    key: 'projeto_cliente',
    label: 'Projeto / Cliente',
    shortLabel: 'PRJ',
    description: 'Coleção, pasta Eagle, personagem/cliente ou biblioteca de origem.',
  },
  {
    key: 'estrutura',
    label: 'Estrutura / Kernel',
    shortLabel: 'STR',
    description: 'Macro-formato (JSON, Seções, Parágrafo), dialeto e assinatura de esqueleto.',
  },
] as const

export interface AttributeTagStat {
  axis: string
  tag: string
  corpusCount: number
  corpusPct: number
  idfWeight: number
}

export interface AttributeSlot {
  text: string
  tags: string[]
  filled: boolean
  tagStats?: AttributeTagStat[]
}

export interface StructureSlot extends AttributeSlot {
  macroFormat: MacroFormat
  kernelDialect: KernelDialect
  skeletonSignature: string
  filledAttributesCount: number
  hasExplicitNegative: boolean
  aspectRatio: string
  tokenCount: number
  topKeysOrSections: string[]
}

export interface DecomposedAttributes {
  sujeito: AttributeSlot
  cenario: AttributeSlot
  luz: AttributeSlot
  camera: AttributeSlot
  textura_material: AttributeSlot
  estilo: AttributeSlot
  projeto_cliente: AttributeSlot
  estrutura: StructureSlot
}

export interface RarityBreakdown {
  score: number
  percentile: number
  label: string
  tier: RarityTier
  meanIdf: number
  pairRarityBonus: number
  rarestTags: AttributeTagStat[]
  corpusRank: number
  corpusSize: number
}

export interface MaturityBreakdown {
  score: number
  skeletonReuseCount: number
  skeletonReuseScore: number
  completenessScore: number
  technicalPrecisionScore: number
  curationScore: number
}

export interface PoseTelemetry {
  poseType?: string
  yaw?: number | null
  pitch?: number | null
  roll?: number | null
  badge?: string
  faceConfidence?: number | null
}

export interface PromptItem {
  id: string
  sourceLib: 'gemini_kimi' | 'google_flow' | 'posematch_sqlite' | 'custom'
  title: string
  project: string
  folders: string[]
  eagleTags: string[]
  star: number
  btime: number
  thumbnailUrl: string | null
  rawPrompt: string
  cleanPrompt: string
  excerpt: string
  attributes: DecomposedAttributes
  rarity: RarityBreakdown
  maturity: MaturityBreakdown
  quadrant: RarityQuadrant
  poseTelemetry?: PoseTelemetry | null
  mapClusterId?: number
  x?: number
  y?: number
  structClusterId?: number
  structX?: number
  structY?: number
}

export interface MapPointCompact {
  id: string
  sourceLib: 'google_flow' | 'gemini_kimi'
  title: string
  project: string
  tier: RarityTier
  percentile: number
  maturity: number
  quadrant: RarityQuadrant
  format: MacroFormat
  dialect: KernelDialect
  clusterId: number
  x: number
  y: number
  structClusterId: number
  structX: number
  structY: number
}

export interface MapPointsResponse {
  total: number
  points: MapPointCompact[]
}

export interface PromptsQueryResponse {
  totalMatching: number
  offset: number
  limit: number
  tierCounts: Record<RarityTier, number>
  quadrantCounts: Record<RarityQuadrant, number>
  formatCounts: Record<MacroFormat, number>
  projects: Array<{ name: string; count: number }>
  items: PromptItem[]
}

export interface PromptNeighborDetail {
  item: PromptItem
  semanticSim: number
  structuralSim: number
}

export interface PromptDetailResponse {
  item: PromptItem
  neighbors: PromptNeighborDetail[]
}

export interface MapClusterRegion {
  clusterId: number
  label: string
  dominantTags: string[]
  dominantProject: string
  dominantFormat: MacroFormat
  count: number
  cohesion: number
  tierSCount: number
  avgPercentile: number
  avgMaturity: number
  cx: number
  cy: number
  radius: number
  exemplarIds: string[]
}

export interface MapVoidGapZone {
  id: string
  label: string
  x: number
  y: number
  radius: number
  betweenClusters: [number, number]
  axisA: string
  tagA: string
  axisB: string
  tagB: string
  observedCount: number
  expectedCount: number
  scopeLabel: string
  gapId?: string
}

export interface MapNeighborLink {
  targetId: string
  semanticSim: number
  structuralSim: number
}

export interface MapPayload {
  clusters: MapClusterRegion[]
  structuralClusters: MapClusterRegion[]
  voidZones: MapVoidGapZone[]
  neighborsById?: Record<string, MapNeighborLink[]>
}

export type PairCategory =
  | 'same_skeleton_diff_subject'
  | 'same_subject_diff_skeleton'
  | 'near_duplicate'

export interface PromptPairRecord {
  id: string
  idA: string
  idB: string
  category: PairCategory
  semanticSim: number
  structuralSim: number
  divergenceScore: number
  changedAttributes: AttributeKey[]
  sharedAttributeCount: number
  reason: string
}

export interface PairsPayload {
  sameSkeletonDiffSubject: PromptPairRecord[]
  sameSubjectDiffSkeleton: PromptPairRecord[]
  nearDuplicates: PromptPairRecord[]
}

export interface CooccurrenceMatrix2D {
  scope: string
  axisA: string
  axisB: string
  axisALabel: string
  axisBLabel: string
  totalPrompts: number
  rows: string[]
  cols: string[]
  rowTotals: Record<string, number>
  colTotals: Record<string, number>
  cells: Array<{
    row: string
    col: string
    observed: number
    expected: number
    lift: number
    isGap: boolean
    isCoherent: boolean
  }>
}

export interface GapRecord {
  id: string
  kind: 'project_2d_zero' | 'global_3d_zero' | 'global_2d_low_lift'
  scope: string
  axisA: string
  tagA: string
  freqA: number
  axisB: string
  tagB: string
  freqB: number
  axisC?: string
  tagC?: string
  freqC?: number
  observedCount: number
  expectedCount: number
  lift: number
  isCoherent: boolean
  donorAId: string | null
  donorBId: string | null
  title: string
  rationale: string
}

export interface GapsPayload {
  matrices: CooccurrenceMatrix2D[]
  projectGaps: GapRecord[]
  globalTriadGaps: GapRecord[]
  globalUnderexplored: GapRecord[]
}

export interface ProjectSummaryRecord {
  id: string
  name: string
  sourceLib: 'google_flow' | 'gemini_kimi'
  totalPrompts: number
  corpusSharePct: number
  sampleCount: number
  avgRarityPercentile: number
  avgMaturityScore: number
  tierDistribution: Record<RarityTier, number>
  formatDistribution: Record<MacroFormat, number>
  quadrantDistribution: Record<RarityQuadrant, number>
  subfolders: Array<{ name: string; count: number }>
  dominantTags: Array<{ axis: string; tag: string; count: number; pct: number }>
  topGaps: GapRecord[]
  exemplarIds: string[]
}

export interface GapPreviewCandidate {
  axisA: string
  tagA: string
  freqA: number
  axisB: string
  tagB: string
  freqB: number
  observedCount: number
  expectedCount: number
}

export interface CorpusOverviewStats {
  generatedAt: string
  primaryLibraryName: string
  primaryLibraryPath: string
  totalCorpusSize: number
  googleFlowSize: number
  geminiKimiSize: number
  sampleSize: number
  sourcesReadOnly: Array<{
    name: string
    path: string
    count: number
    mode: 'READ_ONLY'
  }>
  formatDistribution: Record<MacroFormat, number>
  tierDistribution: Record<RarityTier, number>
  quadrantDistribution: Record<RarityQuadrant, number>
  sampleGapPreviews: GapPreviewCandidate[]
}

export interface CollectionPayload {
  stats: CorpusOverviewStats
  items: PromptItem[]
}

export interface SuitePayload {
  stats: CorpusOverviewStats
  items: PromptItem[] // Subconjunto em destaque (pares, doadores, exemplares)
  mapData: MapPayload
  pairsData: PairsPayload
  gapsData: GapsPayload
  projectsData: ProjectSummaryRecord[]
}

export interface PromptDiffSpan {
  text: string
  type: 'shared' | 'unique'
}

export interface SimilarityLayerScore {
  semanticSim: number
  structuralSim: number
  divergenceScore: number
  category: 'same_skeleton_diff_subject' | 'same_subject_diff_skeleton' | 'near_duplicate' | 'distinct'
}

export type CoreContentAttributeKey = Exclude<AttributeKey, 'projeto_cliente' | 'estrutura'>

export type GapAttributeSourceMode = 'donor_a' | 'donor_b' | 'gap_target'

export interface GapDonorsResponse {
  donorsA: PromptItem[]
  donorsB: PromptItem[]
  donorsC: PromptItem[]
}

export interface DecomposePreviewResponse {
  cleanPrompt: string
  excerpt: string
  attributes: DecomposedAttributes
  rarity: RarityBreakdown
  maturity: MaturityBreakdown
  quadrant: RarityQuadrant
  exactGapOccurrences: number
  secondaryFtsOccurrences?: number
  corpusSize: number
}

export interface GapDraftRecord {
  id: string
  createdAt: string
  gapId: string
  gapTitle: string
  scope: string
  axisA: string
  tagA: string
  axisB: string
  tagB: string
  axisC?: string
  tagC?: string
  donorAId: string | null
  donorBId: string | null
  macroFormat: MacroFormat
  aspectRatio: string
  attributeSources: Record<CoreContentAttributeKey, GapAttributeSourceMode>
  rawPrompt: string
  rarityPercentile: number
  rarityTier: RarityTier
  rarityLabel: string
  maturityScore: number
  quadrant: RarityQuadrant
  filledAttributesCount: number
}

export type MatureMoldId = 'studio_editorial_v5' | 'nano_banana_g6' | 'fdr_v3' | 'fdr_direct'

export interface MatureMoldMeta {
  id: MatureMoldId
  label: string
  macroFormat: MacroFormat
  kernelDialect: KernelDialect
  skeletonReuseCount: number
  avgMaturityInCorpus: number
  avgRarityInCorpus: number
  description: string
}

export type ImmaturityBottleneckKind =
  | 'orphan_skeleton'
  | 'missing_negative'
  | 'weak_camera_optics'
  | 'weak_lighting_physics'
  | 'weak_subject_mechanics'
  | 'missing_attributes'

export interface ImmaturityBottleneck {
  kind: ImmaturityBottleneckKind
  tag: string
  title: string
  detail: string
  estimatedGainPts: number
}

export interface PromptRefinementResult {
  mold: MatureMoldMeta
  refinedPrompt: string
  beforeMaturity: MaturityBreakdown
  afterMaturity: MaturityBreakdown
  deltaMaturity: number
  beforeQuadrant: RarityQuadrant
  afterQuadrant: RarityQuadrant
  beforeAttributes: DecomposedAttributes
  afterAttributes: DecomposedAttributes
  injectedFixes: string[]
}

export interface ImmatureQueueResponse {
  totalMatching: number
  tierSCount: number
  avgMaturity: number
  avgPercentile: number
  offset: number
  limit: number
  projects: Array<{ name: string; count: number }>
  items: PromptItem[]
}

export interface TimelineCohortRecord {
  period: string
  label: string
  totalPrompts: number
  dominantDialect: KernelDialect
  dominantFormat: MacroFormat
  tierSCount: number
  tierSPct: number
  raroMaduroCount: number
  raroMaduroPct: number
  raroImaturoCount: number
  raroImaturoPct: number
  avgPercentile: number
  avgMaturity: number
}

export interface TagDriftRecord {
  tag: string
  axis: string
  earlierCount: number
  earlierPct: number
  recentCount: number
  recentPct: number
  deltaPct: number
  status: 'dormant' | 'saturated'
}

export interface TimelineInsightsResponse {
  generatedAt: string
  totalCorpus: number
  cohorts: TimelineCohortRecord[]
  dormantTags: TagDriftRecord[]
  saturatedTags: TagDriftRecord[]
  computationMs: number
}
