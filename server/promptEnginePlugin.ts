import type { Plugin } from 'vite'
import { spawn, type ChildProcess } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { decomposePrompt } from '../src/core/promptDecomposer'
import {
  classifyQuadrant,
  computeIdfWeight,
  computePromptMaturity,
  computePromptRarity,
} from '../src/core/rarityEngine'
import type {
  AttributeTagStat,
  DecomposedAttributes,
  GapDraftRecord,
  GapMissionStage,
  KernelDialect,
  MacroFormat,
  MapPointCompact,
  MaturityBreakdown,
  PoseTelemetry,
  PromptItem,
  RarityBreakdown,
  RarityQuadrant,
  RarityTier,
  SyncLibraryStatus,
  SyncStatusResponse,
  TagDriftRecord,
  TestedBridgeItemThumb,
  TestedGapBridgeSummary,
  TimelineCohortRecord,
  TimelineInsightsResponse,
} from '../src/types/promptEngine'

const GOOGLE_FLOW_MTIME = 'D:\\Meus Documentos\\Imagens\\Eagle.cool\\Google Flow + Prompts.library\\mtime.json'
const GEMINI_KIMI_MTIME = 'D:\\Meus Documentos\\Imagens\\Eagle.cool\\Gemini Kimi + Antigravity.library\\mtime.json'

function inferAxisForDriftTag(tag: string): string {
  if (/^(standing_|mirror_|seated_|reclining_|crouching_|walking_|leaning_|counter_|action_|hands_)/.test(tag)) {
    return 'pose'
  }
  if (/^(frontal_|arm_|high_angle|low_angle|three_quarter|dorsal_|dutch_|close_up|three_plane|wide_angle|telephoto_)/.test(tag)) {
    return 'angle'
  }
  if (/^(indoor_|window_|harsh_|studio_softbox|golden_|direct_flash|night_|chiaroscuro_)/.test(tag)) {
    return 'lighting'
  }
  if (/^(bedroom_|bathroom_|living_|studio_seamless|beach_|urban_|cafe_|car_|brutalist_|botanical_)/.test(tag)) {
    return 'environment'
  }
  if (/^(cotton_|denim_canvas|silk_|wool_|linen_|leather_|velvet_|lace_|technical_)/.test(tag)) {
    return 'fabric'
  }
  if (/^(tank_top|t_shirt|hoodie|blazer|dress|bikini|knitwear|tailored|denim_jeans|utilitarian|accessories)/.test(tag)) {
    return 'wardrobe'
  }
  return 'sensor / identidade'
}

function formatPeriodLabel(period: string): string {
  if (period === 'pre_2026_07') return 'Dez/25 – Fev/26 (Sementes)'
  const [yr, mo] = period.split('-')
  const months: Record<string, string> = {
    '01': 'Jan',
    '02': 'Fev',
    '03': 'Mar',
    '04': 'Abr',
    '05': 'Mai',
    '06': 'Jun',
    '07': 'Jul',
    '08': 'Ago',
    '09': 'Set',
    '10': 'Out',
    '11': 'Nov',
    '12': 'Dez',
  }
  const base = `${months[mo] || mo}/${yr}`
  if (period === '2026-07') return `${base} · Safra Flow Inicial`
  if (period === '2026-08') return `${base} · Safra Gemini Kimi`
  if (period === '2026-10') return `${base} · Expansão Projetos`
  if (period === '2026-11') return `${base} · Safra Atual`
  return base
}

function loadMtimeLookup(): Map<string, number> {
  const map = new Map<string, number>()
  for (const p of [GOOGLE_FLOW_MTIME, GEMINI_KIMI_MTIME]) {
    try {
      if (!fs.existsSync(p)) continue
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>
      for (const [k, v] of Object.entries(parsed)) {
        const num = Number(v)
        if (Number.isFinite(num) && num > 1700000000000) map.set(k, num)
      }
    } catch {
      // ignore missing external file
    }
  }
  return map
}

function decodePromptPeriod(id: string, sourceLib: string, mtimeFallback = 0): string {
  const b36 = Number.parseInt(id.slice(0, 8), 36)
  const validB36 = Number.isFinite(b36) && b36 >= 1700000000000 && b36 <= 1900000000000
  const tsMs = validB36 ? b36 : mtimeFallback
  if (tsMs > 0) {
    const ym = new Date(tsMs).toISOString().slice(0, 7)
    return ym <= '2026-06' ? 'pre_2026_07' : ym
  }
  return sourceLib === 'gemini_kimi' ? '2026-08' : '2026-10'
}

const DECOMPOSER_TO_SQLITE_TAG: Record<string, string> = {
  pose_em_pe: 'standing_static',
  pose_sentada: 'seated_relaxed',
  pose_deitada: 'reclining_lying',
  pose_caminhando: 'walking_stride',
  pose_agachada: 'crouching_squat',
  pose_mirror_selfie: 'mirror_selfie_pose',
  pose_maos_tateis: 'hands_tactile_framing',
  pose_torcao_ombro: 'counter_rotation_twist',
  identidade_facs: 'facs_microexpression_gaze',
  identidade_lock: 'reference_identity_lock',
  cen_quarto: 'bedroom_bed',
  cen_banheiro_espelho: 'bathroom_mirror',
  cen_sala_escritorio: 'living_room_office',
  cen_estudio: 'studio_seamless_backdrop',
  cen_praia_agua: 'beach_pool_water',
  cen_rua_urbano: 'urban_street_rooftop',
  cen_cafe_bar: 'cafe_bar_restaurant',
  cen_transito: 'car_train_transit',
  cen_brutalista_museu: 'brutalist_museum_interior',
  cen_natureza_botanica: 'botanical_greenhouse_nature',
  luz_janela_suave: 'window_daylight_soft',
  luz_sol_direto: 'harsh_midday_sun',
  luz_estudio_softbox: 'studio_softbox_strobe',
  luz_golden_rim: 'golden_hour_rim',
  luz_flash_direto: 'direct_flash_on_axis',
  luz_noite_neon: 'night_neon_sodium',
  luz_chiaroscuro_gobo: 'chiaroscuro_gobo_caustics',
  luz_ambiente_interna: 'indoor_ambient_mixed',
  cam_smartphone_24_28mm: 'wide_angle_smartphone_optics',
  cam_prime_35_85mm: 'telephoto_prime_optics',
  cam_eye_level: 'frontal_eye_level',
  cam_plongee_alta: 'high_angle_plongee',
  cam_contra_plongee: 'low_angle_contra_plongee',
  cam_perfil_34: 'three_quarter_profile',
  cam_dorsal: 'dorsal_over_shoulder',
  cam_dutch_roll: 'dutch_tilt_roll',
  cam_closeup_macro: 'close_up_macro',
  cam_oclusao_3planos: 'three_plane_occlusion',
  mat_algodao: 'cotton_jersey',
  mat_linho: 'linen_raw',
  mat_seda_cetim: 'silk_satin_organza',
  mat_denim: 'denim_canvas',
  mat_couro_camurca: 'leather_suede',
  mat_la_trico: 'wool_tweed_merino',
  mat_veludo_cotelê: 'velvet_corduroy',
  mat_renda_tule: 'lace_sheer_mesh',
  mat_tecnico_nylon: 'technical_metallic_nylon',
  mat_pele_organica: 'natural_pores_unretouched',
}

const GOOGLE_FLOW_IMAGES = 'D:\\Meus Documentos\\Imagens\\Eagle.cool\\Google Flow + Prompts.library\\images'
const GEMINI_KIMI_IMAGES = 'D:\\Meus Documentos\\Imagens\\Eagle.cool\\Gemini Kimi + Antigravity.library\\images'

const SAFE_ID_RE = /^[A-Za-z0-9_-]{4,64}$/
const THUMB_EXTS = ['_thumbnail.png', '_thumbnail.webp', '_thumbnail.jpg']
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'])

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
}

const MAX_RAM_THUMBNAILS = 1000
const thumbnailRamCache = new Map<string, { buf: Buffer; mime: string }>()

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(body)
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf-8')
  if (!raw.trim()) return {}
  return JSON.parse(raw) as Record<string, unknown>
}

function resolveEagleThumbnailPath(sourceLib: string, itemId: string): string | null {
  if (!SAFE_ID_RE.test(itemId)) return null
  const roots =
    sourceLib === 'gemini_kimi'
      ? [GEMINI_KIMI_IMAGES, GOOGLE_FLOW_IMAGES]
      : [GOOGLE_FLOW_IMAGES, GEMINI_KIMI_IMAGES]

  for (const root of roots) {
    const infoDir = path.join(root, `${itemId}.info`)
    if (!fs.existsSync(infoDir)) continue
    try {
      const files = fs.readdirSync(infoDir)
      let fallback: string | null = null
      for (const f of files) {
        const low = f.toLowerCase()
        if (low === 'metadata.json') continue
        if (THUMB_EXTS.some((ext) => low.endsWith(ext))) {
          return path.join(infoDir, f)
        }
        const ext = path.extname(low)
        if (!fallback && IMAGE_EXTS.has(ext)) {
          fallback = path.join(infoDir, f)
        }
      }
      if (fallback) return fallback
    } catch {
      continue
    }
  }
  return null
}

function resolveEagleFullImagePath(sourceLib: string, itemId: string): string | null {
  if (!SAFE_ID_RE.test(itemId)) return null
  const roots =
    sourceLib === 'gemini_kimi'
      ? [GEMINI_KIMI_IMAGES, GOOGLE_FLOW_IMAGES]
      : [GOOGLE_FLOW_IMAGES, GEMINI_KIMI_IMAGES]

  for (const root of roots) {
    const infoDir = path.join(root, `${itemId}.info`)
    if (!fs.existsSync(infoDir)) continue
    try {
      const files = fs.readdirSync(infoDir)
      let thumbFallback: string | null = null
      for (const f of files) {
        const low = f.toLowerCase()
        if (low === 'metadata.json') continue
        const ext = path.extname(low)
        if (!IMAGE_EXTS.has(ext)) continue
        if (THUMB_EXTS.some((tExt) => low.endsWith(tExt))) {
          if (!thumbFallback) thumbFallback = path.join(infoDir, f)
          continue
        }
        return path.join(infoDir, f)
      }
      if (thumbFallback) return thumbFallback
    } catch {
      continue
    }
  }
  return null
}

function buildFtsMatchQuery(rawQuery: string): string | null {
  const tokens = rawQuery
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 8)
  if (tokens.length === 0) return null
  return tokens.map((t) => `"${t.replace(/"/g, '')}"*`).join(' AND ')
}

function hydratePromptRow(row: Record<string, unknown>): PromptItem {
  const attributes = JSON.parse(String(row.attributes_json || '{}')) as DecomposedAttributes
  const rarity = JSON.parse(String(row.rarity_breakdown_json || '{}')) as RarityBreakdown
  const maturity = JSON.parse(String(row.maturity_breakdown_json || '{}')) as MaturityBreakdown
  const poseTelemetry = row.pose_telemetry_json
    ? (JSON.parse(String(row.pose_telemetry_json)) as PoseTelemetry)
    : null

  return {
    id: String(row.id),
    sourceLib: (row.source_lib === 'gemini_kimi' ? 'gemini_kimi' : 'google_flow'),
    title: String(row.title || row.id),
    project: String(row.project_name || 'Sem Projeto'),
    folders: JSON.parse(String(row.folders_json || '[]')) as string[],
    eagleTags: JSON.parse(String(row.eagle_tags_json || '[]')) as string[],
    star: Number(row.star || 0),
    btime: Number(row.btime || 0),
    thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : `/api/thumbnail/${String(row.source_lib)}/${String(row.id)}`,
    rawPrompt: String(row.raw_prompt || ''),
    cleanPrompt: String(row.clean_prompt || ''),
    excerpt: String(row.excerpt || ''),
    attributes,
    rarity,
    maturity,
    quadrant: String(row.quadrant) as RarityQuadrant,
    poseTelemetry,
    mapClusterId: Number(row.map_cluster_id || 1),
    x: Number(row.x || 0),
    y: Number(row.y || 0),
    structClusterId: Number(row.struct_cluster_id || 1),
    structX: Number(row.struct_x || 0),
    structY: Number(row.struct_y || 0),
  }
}

function jaccardKeys(a: string[], b: string[]): number {
  const sa = new Set(a.map((x) => x.toLowerCase()))
  const sb = new Set(b.map((x) => x.toLowerCase()))
  if (sa.size === 0 && sb.size === 0) return 1
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const x of sa) {
    if (sb.has(x)) inter++
  }
  return inter / (sa.size + sb.size - inter)
}

type LabEngineId =
  | 'fdr_v2'
  | 'fdr_v3_v4'
  | 'fdr_v1_3'
  | 'nano_banana_g3'
  | 'nano_banana_g4'
  | 'nano_banana_g6'
  | 'studio_editorial'
  | 'body_mechanics'
  | 'json2vision'
  | 'latente_v02'
  | 'qwen_natural'

interface LabEngineMeta {
  clusterId: number
  engineId: LabEngineId
  label: string
  family: string
  color: string
  description: string
  cx: number
  cy: number
}

const LAB_ENGINE_CATALOG: readonly LabEngineMeta[] = [
  {
    clusterId: 1,
    engineId: 'fdr_v2',
    label: 'Power FDR v2.x',
    family: 'FDR',
    color: '#38bdf8',
    description: 'Schema fdr_version 2.x · camera_technical & storage_context (anti-bokeh UGC)',
    cx: -720,
    cy: -480,
  },
  {
    clusterId: 2,
    engineId: 'fdr_v3_v4',
    label: 'FDR v3 / v4',
    family: 'FDR',
    color: '#0ea5e9',
    description: 'Evolução FDR v3/v4 estruturada com controle de dispositivo e exposição',
    cx: -1260,
    cy: -240,
  },
  {
    clusterId: 3,
    engineId: 'fdr_v1_3',
    label: 'FDR v1.3 Direct',
    family: 'FDR',
    color: '#7dd3fc',
    description: 'Injeção direta Device-First [shot_type] (seed inicial FDR)',
    cx: -1280,
    cy: -680,
  },
  {
    clusterId: 4,
    engineId: 'nano_banana_g3',
    label: 'Nano Banana G3',
    family: 'Architect',
    color: '#f59e0b',
    description: 'Architect v3.0 — formato misto (JSON/narrativa) e categorias A/B/C',
    cx: 260,
    cy: -620,
  },
  {
    clusterId: 5,
    engineId: 'nano_banana_g4',
    label: 'Nano Banana G4',
    family: 'Architect',
    color: '#fb923c',
    description: 'Architect v4.0 Editorial — 5 categorias estruturais e bloco color_grade',
    cx: 720,
    cy: -520,
  },
  {
    clusterId: 6,
    engineId: 'nano_banana_g6',
    label: 'Nano Banana G5 / G6',
    family: 'Architect',
    color: '#fbbf24',
    description: 'Architect v5/v6 — 7 linhagens, vocabulary_register e câmera vs profile_or_lut',
    cx: 1140,
    cy: -420,
  },
  {
    clusterId: 7,
    engineId: 'studio_editorial',
    label: 'Studio Editorial',
    family: 'Editorial',
    color: '#f472b6',
    description: 'Sistema próprio Single Shot / Lookbook / Ciclorama e Alta Moda',
    cx: -920,
    cy: 340,
  },
  {
    clusterId: 8,
    engineId: 'body_mechanics',
    label: 'Body Mechanics',
    family: 'Biomecânica',
    color: '#34d399',
    description: 'Sistema próprio Candid Capture, anatomia independente e Identity Lock',
    cx: -340,
    cy: 460,
  },
  {
    clusterId: 9,
    engineId: 'json2vision',
    label: 'JSON2VISION',
    family: 'Meta-Schema',
    color: '#a78bfa',
    description: 'Vision-to-JSON: PortraitStruct v1 (retratos) e VisionStruct v1 (cenas)',
    cx: 460,
    cy: 260,
  },
  {
    clusterId: 10,
    engineId: 'latente_v02',
    label: 'Latente v0.2',
    family: 'Latente',
    color: '#c084fc',
    description: 'Kernel latente_version com signature_rules e color_logic',
    cx: 980,
    cy: 140,
  },
  {
    clusterId: 11,
    engineId: 'qwen_natural',
    label: 'Prosa Natural',
    family: 'Prosa',
    color: '#94a3b8',
    description: 'Linguagem natural contínua / prosa livre sem schema estruturado',
    cx: 920,
    cy: 580,
  },
]

const LAB_ENGINE_BY_ID = new Map<LabEngineId, LabEngineMeta>(
  LAB_ENGINE_CATALOG.map((meta) => [meta.engineId, meta])
)

function hashUnit(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

/** Classifica um prompt em sua engine/construtor de origem sem alterar dados persistidos. */
function classifyPromptEngine(
  cleanPrompt: string,
  tagsJson: string,
  macroFormat: string,
  kernelDialect: string
): LabEngineId {
  const low = cleanPrompt.toLowerCase()
  const tags = tagsJson.toLowerCase()
  const textAndTags = `${low} ${tags}`

  if (/latente_version|signature_rules|color_logic/.test(low) || kernelDialect === 'latente_v02') {
    return 'latente_v02'
  }
  if (
    macroFormat === 'json' &&
    /vocabulary_register|required_terms|forbidden_terms|profile_or_lut|visual_context/.test(low)
  ) {
    return 'nano_banana_g6'
  }
  if (macroFormat === 'json' && /color_grade/.test(low) && /camera/.test(low)) {
    return 'nano_banana_g4'
  }
  // Studio Editorial e Body Mechanics são sistemas completamente distintos no acervo.
  if (
    /studio editorial|gradient sky backdrop|ciclorama|cyclorama|\binput a\b|\bstep\s*[1-4]\b/.test(low) &&
    !/--- candid mode ---/.test(low)
  ) {
    return 'studio_editorial'
  }
  if (
    /body mechanics|anatomia independente|weight_distribution|torso[- ]pelvis|candid mode|candid iphone|\[identity lock\]/.test(
      low
    ) ||
    kernelDialect === 'body_mechanics_12block'
  ) {
    return 'body_mechanics'
  }
  if (/i am nano banan|nano_banana|nano banan/.test(low)) {
    return 'nano_banana_g3'
  }
  if (/json2vision|visionstruct|portraitstruct/.test(textAndTags)) {
    return 'json2vision'
  }
  if (/\[shot_type\]|fdr v1\.3|fdr_direct/.test(low) || kernelDialect === 'fdr_direct') {
    return 'fdr_v1_3'
  }
  if (/fdr_version[^0-9]{1,8}[34]|\bfdr\s*[34](?:\.\d)?\b/.test(low)) {
    return 'fdr_v3_v4'
  }
  if (/fdr_version[^0-9]{1,8}2|camera_technical|storage_context/.test(low)) {
    return 'fdr_v2'
  }
  if (macroFormat === 'json') {
    return kernelDialect === 'nano_banana_g6' ? 'nano_banana_g4' : 'fdr_v2'
  }
  if (
    macroFormat === 'sections' ||
    kernelDialect === 'studio_editorial_v5' ||
    kernelDialect === 'numbered_sections'
  ) {
    return 'studio_editorial'
  }
  return 'qwen_natural'
}

export function promptEnginePlugin(): Plugin {
  const projectRoot = process.cwd()
  const suiteJsonPath = path.join(projectRoot, 'data', 'suite_google_flow.json')
  const sampleJsonPath = path.join(projectRoot, 'data', 'sample_50_prompts.json')
  const dbPath = path.join(projectRoot, 'data', 'prompt_engine_v1.sqlite')
  const astCachePath = path.join(projectRoot, 'data', 'ast_cache.sqlite')
  const draftsJsonPath = path.join(projectRoot, 'data', 'gap_drafts.json')

  let db: DatabaseSync | null = null
  let dbMtimeMs = 0
  let idleCloseTimer: ReturnType<typeof setTimeout> | null = null
  let cachedLastSyncedAt: string | null = null
  let cachedPoints: MapPointCompact[] = []
  let cachedVecs = new Float32Array(0)
  let cachedIdToIdx = new Map<string, number>()
  let cachedSortedRarityScores: number[] = []
  let cachedPeriodById = new Map<string, string>()
  let cachedTimelineInsights: TimelineInsightsResponse | null = null
  let cachedEngineMapById = new Map<string, LabEngineId>()
  let cachedEngineFolderById = new Map<string, string>()
  const tagCountCache = new Map<string, number>()

  // Caches leves de leitura de staleness (invalidados por mtimeMs)
  const eagleMtimeCache = new Map<string, { fileMtimeMs: number; map: Map<string, number> }>()
  let astCacheSnapshotMtime = 0
  let astCacheSnapshot = new Map<string, Map<string, { mtimeMs: number; status: string }>>()

  // Estado de sincronização em background
  let syncState: 'idle' | 'running' | 'error' = 'idle'
  let syncRunningSince: string | null = null
  let syncLogLines: string[] = []
  let syncLastError: string | null = null
  let syncLastDurationMs: number | null = null
  let activeSyncProc: ChildProcess | null = null

  function closeDbHandle(): void {
    if (idleCloseTimer) {
      clearTimeout(idleCloseTimer)
      idleCloseTimer = null
    }
    if (db) {
      try {
        db.close()
      } catch {
        // ignore
      }
      db = null
    }
  }

  function scheduleIdleDbClose(): void {
    if (idleCloseTimer) clearTimeout(idleCloseTimer)
    idleCloseTimer = setTimeout(() => {
      idleCloseTimer = null
      closeDbHandle()
    }, 8000)
    idleCloseTimer.unref?.()
  }

  function readEagleMtimeSnapshot(mtimePath: string): { fileMtimeMs: number | null; map: Map<string, number> } {
    try {
      if (!fs.existsSync(mtimePath)) return { fileMtimeMs: null, map: new Map() }
      const stat = fs.statSync(mtimePath)
      const cached = eagleMtimeCache.get(mtimePath)
      if (cached && cached.fileMtimeMs === stat.mtimeMs) {
        return cached
      }
      const parsed = JSON.parse(fs.readFileSync(mtimePath, 'utf-8')) as Record<string, unknown>
      const map = new Map<string, number>()
      for (const [k, v] of Object.entries(parsed)) {
        if (k === 'all') continue
        const num = Number(v)
        if (Number.isFinite(num)) map.set(k, num)
      }
      const next = { fileMtimeMs: stat.mtimeMs, map }
      eagleMtimeCache.set(mtimePath, next)
      return next
    } catch {
      return { fileMtimeMs: null, map: new Map() }
    }
  }

  function readAstCacheSnapshot(): Map<string, Map<string, { mtimeMs: number; status: string }>> {
    if (syncState === 'running') {
      return astCacheSnapshot
    }
    try {
      if (!fs.existsSync(astCachePath)) {
        astCacheSnapshotMtime = 0
        astCacheSnapshot = new Map()
        return astCacheSnapshot
      }
      const stat = fs.statSync(astCachePath)
      if (stat.mtimeMs === astCacheSnapshotMtime && astCacheSnapshot.size > 0) {
        return astCacheSnapshot
      }
      const next = new Map<string, Map<string, { mtimeMs: number; status: string }>>()
      const cacheDb = new DatabaseSync(astCachePath, { readOnly: true })
      try {
        const rows = cacheDb
          .prepare('SELECT source_lib, item_id, mtime_ms, status FROM ast_cache')
          .all() as Array<{ source_lib: string; item_id: string; mtime_ms: number; status: string }>
        for (const r of rows) {
          let libMap = next.get(r.source_lib)
          if (!libMap) {
            libMap = new Map()
            next.set(r.source_lib, libMap)
          }
          libMap.set(r.item_id, { mtimeMs: Number(r.mtime_ms || 0), status: String(r.status || 'active') })
        }
      } finally {
        cacheDb.close()
      }
      astCacheSnapshotMtime = stat.mtimeMs
      astCacheSnapshot = next
      return astCacheSnapshot
    } catch {
      return astCacheSnapshot
    }
  }

  async function replaceFileWithRetry(src: string, dest: string): Promise<void> {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await fsp.rename(src, dest)
        return
      } catch (err) {
        const code = (err as { code?: string })?.code
        if (attempt < 5 && (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES')) {
          await new Promise((r) => setTimeout(r, 120 * (attempt + 1)))
          continue
        }
        throw err
      }
    }
  }

  function promoteStagedIfPresent(): void {
    if (syncState === 'running') return
    const stagedDb = `${dbPath}.next`
    const stagedSuite = `${suiteJsonPath}.next`
    if (!fs.existsSync(stagedDb) || !fs.existsSync(stagedSuite)) return
    try {
      closeDbHandle()
      for (const sidecar of [`${dbPath}-wal`, `${dbPath}-shm`]) {
        if (fs.existsSync(sidecar)) {
          try {
            fs.unlinkSync(sidecar)
          } catch {
            // ignore locked or missing sidecar
          }
        }
      }
      fs.renameSync(stagedDb, dbPath)
      fs.renameSync(stagedSuite, suiteJsonPath)
      dbMtimeMs = 0
      astCacheSnapshotMtime = 0
      eagleMtimeCache.clear()
      thumbnailRamCache.clear()
      cachedTimelineInsights = null
      cachedEngineMapById.clear()
      tagCountCache.clear()
    } catch {
      // ignore transient rename failure; retry on next request/startup
    }
  }

  function buildSyncStatus(): SyncStatusResponse {
    promoteStagedIfPresent()
    if (cachedPoints.length === 0 && fs.existsSync(dbPath)) {
      ensureDbLoaded()
    }

    const astByLib = readAstCacheSnapshot()
    const indexedCounts = { google_flow: 0, gemini_kimi: 0 }
    const indexedIdsByLib = { google_flow: new Set<string>(), gemini_kimi: new Set<string>() }
    for (const pt of cachedPoints) {
      if (pt.sourceLib === 'gemini_kimi') {
        indexedCounts.gemini_kimi++
        indexedIdsByLib.gemini_kimi.add(pt.id)
      } else {
        indexedCounts.google_flow++
        indexedIdsByLib.google_flow.add(pt.id)
      }
    }

    const libsMeta: Array<{
      sourceLib: 'google_flow' | 'gemini_kimi'
      name: string
      mtimePath: string
    }> = [
      { sourceLib: 'google_flow', name: 'Google Flow + Prompts.library', mtimePath: GOOGLE_FLOW_MTIME },
    ]

    const libraries: SyncLibraryStatus[] = libsMeta.map((lib) => {
      const eagleSnap = readEagleMtimeSnapshot(lib.mtimePath)
      const astMap = astByLib.get(lib.sourceLib)
      let pendingNewCount = 0
      let pendingModifiedCount = 0
      let pendingRemovedCount = 0

      if (astMap && astMap.size > 0) {
        for (const [id, ts] of eagleSnap.map.entries()) {
          const entry = astMap.get(id)
          if (!entry) {
            pendingNewCount++
          } else if (entry.mtimeMs !== ts) {
            pendingModifiedCount++
          }
        }
        for (const [id, entry] of astMap.entries()) {
          if (entry.status === 'active' && !eagleSnap.map.has(id)) {
            pendingRemovedCount++
          }
        }
      } else if (eagleSnap.map.size > 0) {
        const indexedSet = indexedIdsByLib[lib.sourceLib]
        for (const [id, ts] of eagleSnap.map.entries()) {
          if (!indexedSet.has(id) && ts > dbMtimeMs) {
            pendingNewCount++
          } else if (indexedSet.has(id) && ts > dbMtimeMs) {
            pendingModifiedCount++
          }
        }
        for (const id of indexedSet) {
          if (!eagleSnap.map.has(id)) {
            pendingRemovedCount++
          }
        }
      }

      return {
        sourceLib: lib.sourceLib,
        name: lib.name,
        eagleItemsCount: eagleSnap.map.size,
        indexedPromptsCount: indexedCounts[lib.sourceLib],
        pendingNewCount,
        pendingModifiedCount,
        pendingRemovedCount,
        eagleUpdatedAt: eagleSnap.fileMtimeMs ? new Date(eagleSnap.fileMtimeMs).toISOString() : null,
      }
    })

    const totalPendingChanges = libraries.reduce(
      (sum, l) => sum + l.pendingNewCount + l.pendingModifiedCount + l.pendingRemovedCount,
      0
    )

    return {
      state: syncState,
      inSync: totalPendingChanges === 0,
      totalPendingChanges,
      lastSyncedAt: cachedLastSyncedAt || (dbMtimeMs > 0 ? new Date(dbMtimeMs).toISOString() : null),
      indexedTotalPrompts: cachedPoints.length,
      libraries,
      runningSince: syncRunningSince,
      lastLogLines: [...syncLogLines],
      lastError: syncLastError,
      lastDurationMs: syncLastDurationMs,
    }
  }

  async function readGapDrafts(): Promise<GapDraftRecord[]> {
    try {
      if (!fs.existsSync(draftsJsonPath)) return []
      const raw = await fsp.readFile(draftsJsonPath, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? (parsed as GapDraftRecord[]) : []
    } catch {
      return []
    }
  }

  async function writeGapDrafts(drafts: GapDraftRecord[]): Promise<void> {
    await fsp.mkdir(path.dirname(draftsJsonPath), { recursive: true })
    const tmpPath = `${draftsJsonPath}.tmp`
    await fsp.writeFile(tmpPath, JSON.stringify(drafts, null, 2), 'utf-8')
    await fsp.rename(tmpPath, draftsJsonPath)
  }

  function sanitizeCanonicalTag(tag: string): string {
    return tag.replace(/[^a-zA-Z0-9_-]/g, '').trim()
  }

const DECOMPOSER_EST_TO_CLEAN_FTS: Record<string, string> = {
  est_editorial: 'editorial',
  est_candid_amador: 'candid',
  est_documental: 'documentary',
  est_arquivo_analogico: 'archival',
  est_estudio_limpo: 'minimalist',
  est_narrativo_surreal: 'cinematic',
}

  function getCachedTagCorpusCount(database: DatabaseSync, rawTag: string): number {
    const clean = sanitizeCanonicalTag(rawTag)
    if (!clean) return 0
    const estTerm = DECOMPOSER_EST_TO_CLEAN_FTS[clean]
    if (estTerm) {
      const cacheKey = `clean:${estTerm}`
      const hit = tagCountCache.get(cacheKey)
      if (hit !== undefined) return hit
      try {
        const row = database
          .prepare('SELECT COUNT(*) AS cnt FROM prompts_fts WHERE prompts_fts MATCH ?')
          .get(`clean_prompt : "${estTerm}"`) as { cnt: number } | undefined
        const cnt = Number(row?.cnt || 0)
        tagCountCache.set(cacheKey, cnt)
        return cnt
      } catch {
        return 500
      }
    }
    const mapped = DECOMPOSER_TO_SQLITE_TAG[clean] || clean
    const hit = tagCountCache.get(mapped)
    if (hit !== undefined) return hit
    try {
      const row = database
        .prepare('SELECT COUNT(*) AS cnt FROM prompts_fts WHERE prompts_fts MATCH ?')
        .get(`tags_text : "${mapped}"`) as { cnt: number } | undefined
      const cnt = Number(row?.cnt || 0)
      tagCountCache.set(mapped, cnt)
      return cnt
    } catch {
      return 0
    }
  }

  function isNamedProjectScope(scope: string): boolean {
    if (!scope || scope === 'all') return false
    return !scope.startsWith('Google Flow') && !scope.startsWith('Global')
  }

  const MOTIF_FTS_TERMS: Record<string, string> = {
    prism_refraction: 'prism',
    double_exposure: '"double exposure"',
    long_exposure: '"long exposure"',
    projector_light: 'projector',
    stained_glass: '"stained glass"',
    candlelight_amber: 'candlelight OR candle',
    fisheye_optics: 'fisheye',
    monochrome_noir: 'monochrome OR "black and white"',
    polaroid_patina: 'polaroid',
    rain_wet_glass: 'rain OR raindrops',
    fog_mist_veil: 'fog OR mist',
    smoke_haze: 'smoke OR haze',
    snow_frost: 'snow OR frost',
    underwater_weightless: 'underwater OR submerged',
    library_stacks: 'library',
    subway_transit: 'subway',
    elevator_box: 'elevator',
    supermarket_aisle: 'supermarket',
    theater_stage: 'theater OR theatre',
    arcade_neon: 'arcade',
    greenhouse_glass: 'greenhouse',
    stairwell_echo: 'stairwell',
    feathers_plume: 'feathers OR feather',
    sequins_sparkle: 'sequins OR sequin',
    surreal_dream: 'surreal',
    shadow_play_gobo: '"shadow play" OR "venetian blind"',
    laundromat_glow: 'laundromat',
  }

  function buildTagFtsClause(rawTag: string): string | null {
    const clean = sanitizeCanonicalTag(rawTag)
    if (!clean) return null
    const mapped = DECOMPOSER_TO_SQLITE_TAG[clean] || clean
    const motifTerm = MOTIF_FTS_TERMS[clean]
    if (motifTerm) {
      return `(tags_text : "${mapped}" OR clean_prompt : (${motifTerm}))`
    }
    return `tags_text : "${mapped}"`
  }

  function inferSlotKeyForTag(rawTag: string): keyof PromptItem['attributes'] {
    if (/^(standing_|mirror_|seated_|reclining_|crouching_|walking_|leaning_|counter_|action_|hands_)/.test(rawTag)) {
      return 'sujeito'
    }
    if (/^(frontal_|arm_|high_angle|low_angle|three_quarter|dorsal_|dutch_|close_up|three_plane|wide_angle|telephoto_)/.test(rawTag)) {
      return 'camera'
    }
    if (/^(indoor_|window_|harsh_|studio_softbox|golden_|direct_flash|night_|chiaroscuro_)/.test(rawTag)) {
      return 'luz'
    }
    if (/^(bedroom_|bathroom_|living_|studio_seamless|beach_|urban_|cafe_|car_|brutalist_|botanical_)/.test(rawTag)) {
      return 'cenario'
    }
    if (/^(cotton_|denim_canvas|silk_|wool_|linen_|leather_|velvet_|lace_|technical_|tank_top|t_shirt|hoodie|blazer|dress|bikini|knitwear|tailored|denim_jeans|utilitarian|accessories)/.test(rawTag)) {
      return 'textura_material'
    }
    return 'estilo'
  }

  function scoreDonorSpecificity(item: PromptItem, rawTag: string): number {
    const slotKey = inferSlotKeyForTag(rawTag)
    const slot = item.attributes[slotKey]
    const tagsLen = slot && 'tags' in slot ? slot.tags.length : 1
    const rawLen = item.rawPrompt.length
    const specificity = 22 / Math.max(1, tagsLen)
    const lengthScore = rawLen >= 300 && rawLen <= 3800 ? 10 : rawLen > 5200 ? -12 : 2
    const boilerplatePen = /^(?:#prompt\s+\d+|Create image:\s*use the attached|STUDIO EDITORIAL)/i.test(
      item.cleanPrompt.trim()
    )
      ? -14
      : 0
    return specificity + lengthScore + boilerplatePen + item.maturity.score * 0.24 + item.rarity.percentile * 0.1
  }

  function pickDiverseDonors(candidates: PromptItem[], rawTag: string, limit: number): PromptItem[] {
    const scored = candidates
      .map((item) => ({ item, score: scoreDonorSpecificity(item, rawTag) }))
      .sort((a, b) => b.score - a.score)

    const out: PromptItem[] = []
    const seenIds = new Set<string>()
    const seenTemplates = new Set<string>()
    const projectCounts = new Map<string, number>()

    // Pass 1: prioriza variedade de projetos e esqueletos únicos (evita 5 clones do mesmo template)
    for (const { item } of scored) {
      if (out.length >= limit) break
      if (seenIds.has(item.id)) continue
      const tplKey = `${item.project}:${item.attributes.estrutura.skeletonSignature}:${item.cleanPrompt.slice(0, 64).toLowerCase()}`
      if (seenTemplates.has(tplKey)) continue
      const pCnt = projectCounts.get(item.project) || 0
      if (pCnt >= 2 && scored.length > limit * 2) continue
      seenIds.add(item.id)
      seenTemplates.add(tplKey)
      projectCounts.set(item.project, pCnt + 1)
      out.push(item)
    }

    // Pass 2: preenche restantes se faltou variedade
    if (out.length < limit) {
      for (const { item } of scored) {
        if (out.length >= limit) break
        if (seenIds.has(item.id)) continue
        seenIds.add(item.id)
        out.push(item)
      }
    }
    return out
  }

  function findDonorsForTag(
    database: DatabaseSync,
    rawTag: string,
    scope: string,
    limit = 8
  ): PromptItem[] {
    const clean = sanitizeCanonicalTag(rawTag)
    if (!clean) return []
    const matchExpr = buildTagFtsClause(clean)
    if (!matchExpr) return []

    const scopedItems: PromptItem[] = []
    const globalItems: PromptItem[] = []
    const seen = new Set<string>()
    const fetchWindow = Math.max(48, limit * 8)

    try {
      if (isNamedProjectScope(scope)) {
        const scopedRows = database
          .prepare(
            `SELECT prompts.* FROM prompts
             JOIN prompts_fts ON prompts.id = prompts_fts.id
             WHERE prompts_fts MATCH ? AND prompts.project_name = ?
             ORDER BY prompts.maturity_score DESC, prompts.rarity_percentile DESC
             LIMIT ?`
          )
          .all(matchExpr, scope, fetchWindow) as Array<Record<string, unknown>>
        for (const r of scopedRows) {
          const item = hydratePromptRow(r)
          if (!seen.has(item.id)) {
            seen.add(item.id)
            scopedItems.push(item)
          }
        }
      }

      if (scopedItems.length < limit) {
        const globalRows = database
          .prepare(
            `SELECT prompts.* FROM prompts
             JOIN prompts_fts ON prompts.id = prompts_fts.id
             WHERE prompts_fts MATCH ?
             ORDER BY prompts.maturity_score DESC, prompts.rarity_percentile DESC
             LIMIT ?`
          )
          .all(matchExpr, fetchWindow) as Array<Record<string, unknown>>
        for (const r of globalRows) {
          const item = hydratePromptRow(r)
          if (!seen.has(item.id)) {
            seen.add(item.id)
            globalItems.push(item)
          }
        }
      }
    } catch {
      return [...pickDiverseDonors(scopedItems, clean, limit)]
    }

    const pickedScoped = pickDiverseDonors(scopedItems, clean, limit)
    if (pickedScoped.length >= limit) return pickedScoped
    const remaining = limit - pickedScoped.length
    return [...pickedScoped, ...pickDiverseDonors(globalItems, clean, remaining)]
  }

  function normalizeBridgeKey(rawBridge: string): string {
    return rawBridge
      .split(/\s*×\s*|\s+[xX]\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(' × ')
  }

  function readTestedBridgesFromDb(database: DatabaseSync): {
    testedBridges: TestedGapBridgeSummary[]
    totalTestedPrompts: number
  } {
    const grouped = new Map<
      string,
      {
        count: number
        latestBtime: number
        projects: Set<string>
        items: TestedBridgeItemThumb[]
      }
    >()
    let totalTestedPrompts = 0

    try {
      const hasTable = Boolean(
        database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gap_bridges'").get()
      )

      const rows = hasTable
        ? (database
            .prepare(
              `SELECT gb.bridge_key AS bridge_key, p.id, p.title, p.project_name, p.source_lib,
                      p.thumbnail_url, p.btime, p.rarity_tier, p.rarity_percentile, p.maturity_score
               FROM gap_bridges gb
               JOIN prompts p ON p.id = gb.prompt_id
               ORDER BY p.btime DESC`
            )
            .all() as Array<Record<string, unknown>>)
        : (database
            .prepare(
              `SELECT id, title, project_name, source_lib, thumbnail_url, btime,
                      rarity_tier, rarity_percentile, maturity_score, raw_prompt
               FROM prompts
               WHERE raw_prompt LIKE '%"gap_bridge"%'
               ORDER BY btime DESC`
            )
            .all() as Array<Record<string, unknown>>)

      for (const r of rows) {
        let bridgeKey = typeof r.bridge_key === 'string' ? r.bridge_key : ''
        if (!bridgeKey && typeof r.raw_prompt === 'string') {
          const m = /"gap_bridge"\s*:\s*"([^"]+)"/i.exec(r.raw_prompt)
          if (m) bridgeKey = normalizeBridgeKey(m[1])
        }
        if (!bridgeKey) continue

        totalTestedPrompts++
        let entry = grouped.get(bridgeKey)
        if (!entry) {
          entry = { count: 0, latestBtime: 0, projects: new Set(), items: [] }
          grouped.set(bridgeKey, entry)
        }
        const btime = Number(r.btime || 0)
        const project = String(r.project_name || 'Sem Projeto')
        entry.count++
        if (btime > entry.latestBtime) entry.latestBtime = btime
        entry.projects.add(project)
        if (entry.items.length < 6) {
          const sourceLib = r.source_lib === 'gemini_kimi' ? 'gemini_kimi' : 'google_flow'
          const id = String(r.id)
          entry.items.push({
            id,
            title: String(r.title || id),
            project,
            sourceLib,
            thumbnailUrl: r.thumbnail_url ? String(r.thumbnail_url) : `/api/thumbnail/${sourceLib}/${id}`,
            btime,
            rarityTier: String(r.rarity_tier || 'B') as RarityTier,
            rarityPercentile: Number(r.rarity_percentile || 50),
            maturityScore: Number(r.maturity_score || 50),
          })
        }
      }
    } catch {
      return { testedBridges: [], totalTestedPrompts: 0 }
    }

    const testedBridges: TestedGapBridgeSummary[] = Array.from(grouped.entries())
      .map(([bridgeKey, v]) => ({
        bridgeKey,
        tags: bridgeKey.split('×').map((s) => s.trim()).filter(Boolean),
        count: v.count,
        latestBtime: v.latestBtime,
        projects: Array.from(v.projects),
        items: v.items,
      }))
      .sort((a, b) => b.latestBtime - a.latestBtime)

    return { testedBridges, totalTestedPrompts }
  }

  function ensureDbLoaded(): DatabaseSync | null {
    promoteStagedIfPresent()
    if (!fs.existsSync(dbPath)) return null
    const stat = fs.statSync(dbPath)
    scheduleIdleDbClose()

    if (db && stat.mtimeMs === dbMtimeMs) return db
    if (!db && stat.mtimeMs === dbMtimeMs && cachedPoints.length > 0) {
      db = new DatabaseSync(dbPath, { readOnly: true })
      return db
    }

    closeDbHandle()

    db = new DatabaseSync(dbPath, { readOnly: true })
    dbMtimeMs = stat.mtimeMs
    tagCountCache.clear()
    cachedTimelineInsights = null
    cachedEngineMapById.clear()
    cachedEngineFolderById.clear()
    cachedLastSyncedAt = new Date(stat.mtimeMs).toISOString()

    try {
      const hasSyncMeta = Boolean(
        db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_meta'").get()
      )
      if (hasSyncMeta) {
        const metaRow = db.prepare("SELECT value FROM sync_meta WHERE key = 'synced_at'").get() as
          | { value?: string }
          | undefined
        if (metaRow?.value) {
          cachedLastSyncedAt = String(metaRow.value)
        }
      }
    } catch {
      // ignore missing sync_meta
    }

    const mtimeMap = loadMtimeLookup()

    // Carrega pontos compactos + blobs sem_vec (24 floats) + scores ordenados de raridade + safras em memória
    const hasMapCols = (
      db.prepare("PRAGMA table_info(prompts)").all() as Array<{ name: string }>
    ).some((c) => c.name === 'sem_vec')

    if (hasMapCols) {
      const rows = db
        .prepare(
          `SELECT id, source_lib, title, project_name, rarity_score, rarity_tier, rarity_percentile,
                  maturity_score, quadrant, macro_format, kernel_dialect,
                  map_cluster_id, x, y, struct_cluster_id, struct_x, struct_y, sem_vec
           FROM prompts`
        )
        .all() as Array<Record<string, unknown>>

      cachedPoints = new Array<MapPointCompact>(rows.length)
      cachedVecs = new Float32Array(rows.length * 24)
      cachedIdToIdx = new Map<string, number>()
      cachedPeriodById = new Map<string, string>()
      const rawScores = new Array<number>(rows.length)

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        const id = String(r.id)
        const srcLib = r.source_lib === 'gemini_kimi' ? 'gemini_kimi' : 'google_flow'
        cachedIdToIdx.set(id, i)
        cachedPeriodById.set(id, decodePromptPeriod(id, srcLib, mtimeMap.get(id) || 0))
        rawScores[i] = Number(r.rarity_score || 3.5)
        cachedPoints[i] = {
          id,
          sourceLib: srcLib,
          title: String(r.title || id),
          project: String(r.project_name || 'Sem Projeto'),
          tier: String(r.rarity_tier) as RarityTier,
          percentile: Number(r.rarity_percentile || 50),
          maturity: Number(r.maturity_score || 50),
          quadrant: String(r.quadrant) as RarityQuadrant,
          format: String(r.macro_format) as MacroFormat,
          dialect: String(r.kernel_dialect) as KernelDialect,
          clusterId: Number(r.map_cluster_id || 1),
          x: Number(r.x || 0),
          y: Number(r.y || 0),
          structClusterId: Number(r.struct_cluster_id || 1),
          structX: Number(r.struct_x || 0),
          structY: Number(r.struct_y || 0),
        }

        const blob = r.sem_vec as Uint8Array | undefined
        if (blob && blob.byteLength >= 96) {
          const f32 = new Float32Array(blob.buffer, blob.byteOffset, 24)
          cachedVecs.set(f32, i * 24)
        }
      }
      rawScores.sort((a, b) => a - b)
      cachedSortedRarityScores = rawScores
    }

    return db
  }

  return {
    name: 'prompt-engine-v1-api',
    configureServer(server) {
      promoteStagedIfPresent()
      server.httpServer?.once('close', () => {
        closeDbHandle()
        if (activeSyncProc && !activeSyncProc.killed) {
          activeSyncProc.kill()
        }
      })

      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || ''
        const [url, qs] = rawUrl.split('?')
        const params = new URLSearchParams(qs || '')

        if (req.method === 'GET' && url === '/api/sync-status') {
          try {
            sendJson(res, 200, buildSyncStatus())
          } catch (err) {
            sendJson(res, 500, { error: String(err) })
          }
          return
        }

        if (req.method === 'POST' && url === '/api/sync') {
          if (syncState === 'running') {
            sendJson(res, 202, buildSyncStatus())
            return
          }
          const tStart = Date.now()
          syncState = 'running'
          syncRunningSince = new Date().toISOString()
          syncLastError = null
          syncLogLines = ['Iniciando sincronização Read-Only das bibliotecas Eagle...']

          const pushLog = (chunk: Buffer | string) => {
            const lines = String(chunk)
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean)
            if (lines.length === 0) return
            syncLogLines = [...syncLogLines, ...lines].slice(-14)
          }

          const child = spawn('python', ['-u', 'scripts/ingest_google_flow.py', '--stage-only'], {
            cwd: projectRoot,
            env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
          })
          activeSyncProc = child
          child.stdout?.on('data', pushLog)
          child.stderr?.on('data', pushLog)

          child.on('error', (err) => {
            activeSyncProc = null
            syncState = 'error'
            syncRunningSince = null
            syncLastError = err.message
          })

          child.on('close', (code) => {
            void (async () => {
              activeSyncProc = null
              const stagedDb = `${dbPath}.next`
              const stagedSuite = `${suiteJsonPath}.next`
              if (code === 0 && fs.existsSync(stagedDb) && fs.existsSync(stagedSuite)) {
                try {
                  closeDbHandle()
                  for (const sidecar of [`${dbPath}-wal`, `${dbPath}-shm`]) {
                    if (fs.existsSync(sidecar)) {
                      try {
                        await fsp.unlink(sidecar)
                      } catch {
                        // ignore stale sidecar
                      }
                    }
                  }
                  await replaceFileWithRetry(stagedDb, dbPath)
                  await replaceFileWithRetry(stagedSuite, suiteJsonPath)

                  dbMtimeMs = 0
                  astCacheSnapshotMtime = 0
                  eagleMtimeCache.clear()
                  thumbnailRamCache.clear()
                  cachedTimelineInsights = null
                  cachedEngineMapById.clear()
                  cachedEngineFolderById.clear()
                  tagCountCache.clear()
                  ensureDbLoaded()

                  syncState = 'idle'
                  syncLastError = null
                  syncRunningSince = null
                  syncLastDurationMs = Date.now() - tStart
                } catch (swapErr) {
                  syncState = 'error'
                  syncRunningSince = null
                  syncLastError = swapErr instanceof Error ? swapErr.message : String(swapErr)
                }
              } else {
                for (const tmpNext of [stagedDb, stagedSuite]) {
                  if (fs.existsSync(tmpNext)) {
                    fsp.unlink(tmpNext).catch(() => null)
                  }
                }
                syncState = 'error'
                syncRunningSince = null
                syncLastError =
                  syncLogLines[syncLogLines.length - 1] ||
                  `Sincronização encerrou com código ${code ?? 'desconhecido'}.`
              }
            })()
          })

          sendJson(res, 202, buildSyncStatus())
          return
        }

        if (req.method === 'GET' && (url === '/api/suite' || url === '/api/collection')) {
          try {
            promoteStagedIfPresent()
            const targetPath = fs.existsSync(suiteJsonPath)
              ? suiteJsonPath
              : fs.existsSync(sampleJsonPath)
                ? sampleJsonPath
                : null
            if (!targetPath) {
              sendJson(res, 404, {
                error: 'Base ainda não ingerida. Execute `python scripts/ingest_google_flow.py`.',
              })
              return
            }
            const content = await fsp.readFile(targetPath, 'utf-8')
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.setHeader('Cache-Control', 'no-store')
            res.end(content)
          } catch (err) {
            sendJson(res, 500, { error: String(err) })
          }
          return
        }

        if (req.method === 'GET' && url === '/api/map-points') {
          try {
            const database = ensureDbLoaded()
            if (!database) {
              sendJson(res, 404, { error: 'Banco SQLite não encontrado.' })
              return
            }
            const sourceLib = params.get('sourceLib') || 'google_flow'
            const project = params.get('project') || 'all'
            const filtered = cachedPoints.filter((p) => {
              if (sourceLib !== 'all' && p.sourceLib !== sourceLib) return false
              if (project !== 'all' && p.project !== project) return false
              return true
            })
            sendJson(res, 200, { total: filtered.length, points: filtered })
          } catch (err) {
            sendJson(res, 500, { error: String(err) })
          }
          return
        }

        if (req.method === 'GET' && url === '/api/lab-engine-map') {
          try {
            const database = ensureDbLoaded()
            if (!database) {
              sendJson(res, 404, { error: 'Banco SQLite não encontrado.' })
              return
            }
            if (cachedEngineMapById.size === 0) {
              const rows = database
                .prepare(
                  'SELECT id, project_name, folders_json, macro_format, kernel_dialect, clean_prompt, eagle_tags_json FROM prompts'
                )
                .all() as Array<Record<string, unknown>>
              const nextMap = new Map<string, LabEngineId>()
              const nextFolderMap = new Map<string, string>()
              for (const r of rows) {
                const id = String(r.id)
                nextMap.set(
                  id,
                  classifyPromptEngine(
                    String(r.clean_prompt || ''),
                    String(r.eagle_tags_json || ''),
                    String(r.macro_format || ''),
                    String(r.kernel_dialect || '')
                  )
                )
                const projectName = String(r.project_name || '').trim()
                let folderDisplay = ''
                try {
                  const parsedFolders = JSON.parse(String(r.folders_json || '[]')) as unknown
                  if (Array.isArray(parsedFolders)) {
                    const firstFolder = parsedFolders
                      .find((item): item is string => typeof item === 'string' && item.trim().length > 0)
                      ?.trim()
                    if (firstFolder && firstFolder.includes('/') && firstFolder !== projectName) {
                      folderDisplay =
                        projectName && firstFolder.startsWith(`${projectName}/`)
                          ? firstFolder.slice(projectName.length + 1).trim()
                          : firstFolder
                    }
                  }
                } catch {
                  // ignora folders_json malformado
                }
                if (folderDisplay) {
                  nextFolderMap.set(id, folderDisplay)
                }
              }
              cachedEngineMapById = nextMap
              cachedEngineFolderById = nextFolderMap
            }

            const sourceLib = params.get('sourceLib') || 'google_flow'
            const project = params.get('project') || 'all'
            const filtered = cachedPoints.filter((p) => {
              if (sourceLib !== 'all' && p.sourceLib !== sourceLib) return false
              if (project !== 'all' && p.project !== project) return false
              return true
            })

            interface EngineAcc {
              count: number
              pctSum: number
              tierSCount: number
              projects: Map<string, number>
            }
            const accByEngine = new Map<LabEngineId, EngineAcc>()
            for (const p of filtered) {
              const engId = cachedEngineMapById.get(p.id) ?? 'qwen_natural'
              let acc = accByEngine.get(engId)
              if (!acc) {
                acc = { count: 0, pctSum: 0, tierSCount: 0, projects: new Map() }
                accByEngine.set(engId, acc)
              }
              acc.count += 1
              acc.pctSum += p.percentile
              if (p.tier === 'S') acc.tierSCount += 1
              acc.projects.set(p.project, (acc.projects.get(p.project) || 0) + 1)
            }

            const radiusByEngine = new Map<LabEngineId, number>()
            const totalFiltered = filtered.length
            const clusters = LAB_ENGINE_CATALOG.flatMap((meta) => {
              const acc = accByEngine.get(meta.engineId)
              if (!acc || acc.count === 0) return []
              const radius = Math.max(82, Math.min(340, Math.round(62 + Math.sqrt(acc.count) * 2.85)))
              radiusByEngine.set(meta.engineId, radius)
              let dominantProject = 'Diversos'
              let bestProjCount = -1
              for (const [projName, cnt] of acc.projects.entries()) {
                if (cnt > bestProjCount) {
                  bestProjCount = cnt
                  dominantProject = projName
                }
              }
              return [
                {
                  clusterId: meta.clusterId,
                  engineId: meta.engineId,
                  label: meta.label,
                  family: meta.family,
                  color: meta.color,
                  description: meta.description,
                  cx: meta.cx,
                  cy: meta.cy,
                  radius,
                  count: acc.count,
                  sharePct: totalFiltered > 0 ? Number(((acc.count / totalFiltered) * 100).toFixed(1)) : 0,
                  avgPercentile: Number((acc.pctSum / acc.count).toFixed(1)),
                  tierSCount: acc.tierSCount,
                  dominantProject,
                },
              ]
            }).sort((a, b) => b.count - a.count)

            const enginePoints = filtered.map((p) => {
              const engId = cachedEngineMapById.get(p.id) ?? 'qwen_natural'
              const meta = LAB_ENGINE_BY_ID.get(engId) ?? LAB_ENGINE_CATALOG[LAB_ENGINE_CATALOG.length - 1]
              const radius = radiusByEngine.get(engId) ?? 120
              const theta = Math.atan2(p.y, p.x) + (hashUnit(`${p.id}:ang`) - 0.5) * 0.65
              const radial = radius * 0.87 * Math.sqrt(0.03 + 0.94 * hashUnit(`${p.id}:rad`))
              const folder = cachedEngineFolderById.get(p.id)
              return {
                id: p.id,
                c: meta.clusterId,
                x: Number((meta.cx + Math.cos(theta) * radial).toFixed(1)),
                y: Number((meta.cy + Math.sin(theta) * radial).toFixed(1)),
                ...(folder ? { f: folder } : {}),
              }
            })

            sendJson(res, 200, {
              total: totalFiltered,
              clusters,
              points: enginePoints,
            })
          } catch (err) {
            sendJson(res, 500, { error: String(err) })
          }
          return
        }

        if (req.method === 'GET' && url === '/api/prompts') {
          try {
            const database = ensureDbLoaded()
            if (!database) {
              sendJson(res, 404, { error: 'Banco SQLite não encontrado.' })
              return
            }

            const qRaw = (params.get('q') || '').trim()
            const ftsQuery = buildFtsMatchQuery(qRaw)
            const sourceLib = params.get('sourceLib') || 'google_flow'
            const tier = params.get('tier') || 'all'
            const quadrant = params.get('quadrant') || 'all'
            const format = params.get('format') || 'all'
            const project = params.get('project') || 'all'
            const clusterIdStr = params.get('clusterId') || ''
            const sort = params.get('sort') || 'rarity_desc'
            const offset = Math.max(0, Number.parseInt(params.get('offset') || '0', 10) || 0)
            const limit = Math.max(1, Math.min(120, Number.parseInt(params.get('limit') || '48', 10) || 48))

            const buildWhere = (opts: {
              includeTier?: boolean
              includeQuadrant?: boolean
              includeFormat?: boolean
              includeProject?: boolean
            }) => {
              const clauses: string[] = []
              const bind: Array<string | number> = []
              let joinClause = ''

              if (ftsQuery) {
                joinClause = 'JOIN prompts_fts ON prompts.id = prompts_fts.id'
                clauses.push('prompts_fts MATCH ?')
                bind.push(ftsQuery)
              }
              if (sourceLib !== 'all') {
                clauses.push('prompts.source_lib = ?')
                bind.push(sourceLib)
              }
              if (opts.includeTier && tier !== 'all') {
                clauses.push('prompts.rarity_tier = ?')
                bind.push(tier)
              }
              if (opts.includeQuadrant && quadrant !== 'all') {
                clauses.push('prompts.quadrant = ?')
                bind.push(quadrant)
              }
              if (opts.includeFormat && format !== 'all') {
                clauses.push('prompts.macro_format = ?')
                bind.push(format)
              }
              if (opts.includeProject && project !== 'all') {
                clauses.push('prompts.project_name = ?')
                bind.push(project)
              }
              if (clusterIdStr) {
                const cid = Number.parseInt(clusterIdStr, 10)
                if (!Number.isNaN(cid)) {
                  clauses.push('prompts.map_cluster_id = ?')
                  bind.push(cid)
                }
              }

              const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
              return { joinClause, whereSql, bind }
            }

            const mainFilter = buildWhere({
              includeTier: true,
              includeQuadrant: true,
              includeFormat: true,
              includeProject: true,
            })

            const countRow = database
              .prepare(`SELECT COUNT(*) AS cnt FROM prompts ${mainFilter.joinClause} ${mainFilter.whereSql}`)
              .get(...mainFilter.bind) as { cnt: number }
            const totalMatching = Number(countRow?.cnt || 0)

            let orderSql = 'ORDER BY prompts.rarity_percentile DESC, prompts.maturity_score DESC'
            if (sort === 'maturity_desc') {
              orderSql = 'ORDER BY prompts.maturity_score DESC, prompts.rarity_percentile DESC'
            } else if (sort === 'rarity_asc') {
              orderSql = 'ORDER BY prompts.rarity_percentile ASC, prompts.maturity_score DESC'
            } else if (sort === 'attributes_desc') {
              orderSql = 'ORDER BY prompts.filled_attributes_count DESC, prompts.rarity_percentile DESC'
            }

            const rows = database
              .prepare(
                `SELECT prompts.* FROM prompts ${mainFilter.joinClause} ${mainFilter.whereSql} ${orderSql} LIMIT ? OFFSET ?`
              )
              .all(...mainFilter.bind, limit, offset) as Array<Record<string, unknown>>

            // Contagens agregadas sobre (sourceLib, q, project) para a régua de Tiers e Matriz 2×2
            const baseFilter = buildWhere({
              includeTier: false,
              includeQuadrant: false,
              includeFormat: false,
              includeProject: true,
            })
            const tierRows = database
              .prepare(
                `SELECT prompts.rarity_tier AS k, COUNT(*) AS cnt FROM prompts ${baseFilter.joinClause} ${baseFilter.whereSql} GROUP BY prompts.rarity_tier`
              )
              .all(...baseFilter.bind) as Array<{ k: RarityTier; cnt: number }>
            const tierCounts: Record<RarityTier, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 }
            for (const tr of tierRows) tierCounts[tr.k] = Number(tr.cnt)

            const quadRows = database
              .prepare(
                `SELECT prompts.quadrant AS k, COUNT(*) AS cnt FROM prompts ${baseFilter.joinClause} ${baseFilter.whereSql} GROUP BY prompts.quadrant`
              )
              .all(...baseFilter.bind) as Array<{ k: RarityQuadrant; cnt: number }>
            const quadrantCounts: Record<RarityQuadrant, number> = {
              raro_maduro: 0,
              raro_imaturo: 0,
              comum_maduro: 0,
              comum_imaturo: 0,
            }
            for (const qr of quadRows) quadrantCounts[qr.k] = Number(qr.cnt)

            const fmtRows = database
              .prepare(
                `SELECT prompts.macro_format AS k, COUNT(*) AS cnt FROM prompts ${baseFilter.joinClause} ${baseFilter.whereSql} GROUP BY prompts.macro_format`
              )
              .all(...baseFilter.bind) as Array<{ k: MacroFormat; cnt: number }>
            const formatCounts: Record<MacroFormat, number> = {
              json: 0,
              sections: 0,
              single_paragraph: 0,
            }
            for (const fr of fmtRows) formatCounts[fr.k] = Number(fr.cnt)

            const projFilter = buildWhere({
              includeTier: false,
              includeQuadrant: false,
              includeFormat: false,
              includeProject: false,
            })
            const projRows = database
              .prepare(
                `SELECT prompts.project_name AS name, COUNT(*) AS count FROM prompts ${projFilter.joinClause} ${projFilter.whereSql} GROUP BY prompts.project_name ORDER BY count DESC`
              )
              .all(...projFilter.bind) as Array<{ name: string; count: number }>

            sendJson(res, 200, {
              totalMatching,
              offset,
              limit,
              tierCounts,
              quadrantCounts,
              formatCounts,
              projects: projRows,
              items: rows.map(hydratePromptRow),
            })
          } catch (err) {
            sendJson(res, 500, { error: String(err) })
          }
          return
        }

        if (req.method === 'GET' && url.startsWith('/api/prompt/')) {
          try {
            const database = ensureDbLoaded()
            if (!database) {
              sendJson(res, 404, { error: 'Banco SQLite não encontrado.' })
              return
            }
            const itemId = decodeURIComponent(url.replace('/api/prompt/', '').trim())
            if (!SAFE_ID_RE.test(itemId)) {
              sendJson(res, 400, { error: 'ID inválido' })
              return
            }

            const row = database
              .prepare('SELECT * FROM prompts WHERE id = ?')
              .get(itemId) as Record<string, unknown> | undefined
            if (!row) {
              sendJson(res, 404, { error: 'Prompt não encontrado' })
              return
            }
            const item = hydratePromptRow(row)

            // Busca os N vizinhos semânticos mais próximos via dot product nos 24d cachedVecs
            const rawLimit = Number.parseInt(params.get('limit') || '8', 10)
            const neighborLimit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(24, rawLimit)) : 8
            const scopeSourceLib = params.get('sourceLib') || 'all'
            const idx = cachedIdToIdx.get(itemId)
            const scored: Array<{ id: string; sem: number }> = []
            if (idx !== undefined && cachedPoints.length > 0) {
              const offA = idx * 24
              for (let j = 0; j < cachedPoints.length; j++) {
                if (j === idx) continue
                if (scopeSourceLib !== 'all' && cachedPoints[j].sourceLib !== scopeSourceLib) continue
                const offB = j * 24
                let dot = 0
                for (let d = 0; d < 24; d++) {
                  dot += cachedVecs[offA + d] * cachedVecs[offB + d]
                }
                if (dot > 0.25) {
                  scored.push({ id: cachedPoints[j].id, sem: Math.min(1, Math.max(0, dot)) })
                }
              }
              scored.sort((a, b) => b.sem - a.sem)
            }

            const topIds = scored.slice(0, neighborLimit)
            const neighbors: Array<{ item: PromptItem; semanticSim: number; structuralSim: number }> = []
            if (topIds.length > 0) {
              const placeholders = topIds.map(() => '?').join(',')
              const nbRows = database
                .prepare(`SELECT * FROM prompts WHERE id IN (${placeholders})`)
                .all(...topIds.map((t) => t.id)) as Array<Record<string, unknown>>
              const nbMap = new Map(nbRows.map((r) => [String(r.id), hydratePromptRow(r)]))

              for (const t of topIds) {
                const nbItem = nbMap.get(t.id)
                if (!nbItem) continue
                const estA = item.attributes.estrutura
                const estB = nbItem.attributes.estrutura
                const sameF = estA.macroFormat === estB.macroFormat ? 1 : 0
                const sameD = estA.kernelDialect === estB.kernelDialect ? 1 : 0
                const structSim = Number(
                  (
                    0.35 * sameF +
                    0.25 * sameD +
                    0.4 * jaccardKeys(estA.topKeysOrSections, estB.topKeysOrSections)
                  ).toFixed(3)
                )
                neighbors.push({
                  item: nbItem,
                  semanticSim: Number(t.sem.toFixed(3)),
                  structuralSim: structSim,
                })
              }
            }

            sendJson(res, 200, { item, neighbors })
          } catch (err) {
            sendJson(res, 500, { error: String(err) })
          }
          return
        }

        if (req.method === 'GET' && url.startsWith('/api/image/')) {
          const cleanUrl = url.split('?')[0]
          const parts = cleanUrl.replace('/api/image/', '').split('/')
          if (parts.length !== 2) {
            res.statusCode = 400
            res.end('Invalid image path')
            return
          }
          const [sourceLib, itemId] = parts
          const filePath = resolveEagleFullImagePath(sourceLib, itemId)
          if (!filePath) {
            res.statusCode = 404
            res.end('Image not found')
            return
          }

          try {
            const buf = await fsp.readFile(filePath)
            const ext = path.extname(filePath).toLowerCase()
            const mime = MIME_MAP[ext] || 'application/octet-stream'
            res.statusCode = 200
            res.setHeader('Content-Type', mime)
            res.setHeader('Cache-Control', 'public, max-age=3600')
            res.end(buf)
          } catch {
            res.statusCode = 404
            res.end('Unable to read image')
          }
          return
        }

        if (req.method === 'GET' && url.startsWith('/api/thumbnail/')) {
          const parts = url.replace('/api/thumbnail/', '').split('/')
          if (parts.length !== 2) {
            res.statusCode = 400
            res.end('Invalid thumbnail path')
            return
          }
          const [sourceLib, itemId] = parts
          const cacheKey = `${sourceLib}:${itemId}`
          const cached = thumbnailRamCache.get(cacheKey)
          if (cached) {
            res.statusCode = 200
            res.setHeader('Content-Type', cached.mime)
            res.setHeader('Cache-Control', 'public, max-age=3600')
            res.end(cached.buf)
            return
          }

          const filePath = resolveEagleThumbnailPath(sourceLib, itemId)
          if (!filePath) {
            res.statusCode = 404
            res.end('Thumbnail not found')
            return
          }

          try {
            const buf = await fsp.readFile(filePath)
            const ext = path.extname(filePath).toLowerCase()
            const mime = MIME_MAP[ext] || 'application/octet-stream'
            if (thumbnailRamCache.size >= MAX_RAM_THUMBNAILS) {
              const oldest = thumbnailRamCache.keys().next().value
              if (oldest) thumbnailRamCache.delete(oldest)
            }
            thumbnailRamCache.set(cacheKey, { buf, mime })
            res.statusCode = 200
            res.setHeader('Content-Type', mime)
            res.setHeader('Cache-Control', 'public, max-age=3600')
            res.end(buf)
          } catch {
            res.statusCode = 404
            res.end('Unable to read thumbnail')
          }
          return
        }

        if (req.method === 'GET' && url === '/api/gap-donors') {
          try {
            const database = ensureDbLoaded()
            if (!database) {
              sendJson(res, 404, { error: 'Banco SQLite não encontrado.' })
              return
            }
            const tagA = (params.get('tagA') || '').trim()
            const tagB = (params.get('tagB') || '').trim()
            const tagC = (params.get('tagC') || '').trim()
            const scope = (params.get('scope') || 'all').trim()

            const donorsA = tagA ? findDonorsForTag(database, tagA, scope, 8) : []
            const donorsB = tagB ? findDonorsForTag(database, tagB, scope, 8) : []
            const donorsC = tagC ? findDonorsForTag(database, tagC, scope, 6) : []
            sendJson(res, 200, { donorsA, donorsB, donorsC })
          } catch (err) {
            sendJson(res, 500, { error: String(err) })
          }
          return
        }

        if (req.method === 'GET' && url === '/api/gap-missions') {
          try {
            const drafts = await readGapDrafts()
            const database = ensureDbLoaded()
            const { testedBridges, totalTestedPrompts } = database
              ? readTestedBridgesFromDb(database)
              : { testedBridges: [], totalTestedPrompts: 0 }
            sendJson(res, 200, { drafts, testedBridges, totalTestedPrompts })
          } catch (err) {
            sendJson(res, 500, { error: String(err) })
          }
          return
        }

        if (req.method === 'GET' && url === '/api/gap-drafts') {
          try {
            const drafts = await readGapDrafts()
            sendJson(res, 200, { drafts })
          } catch (err) {
            sendJson(res, 500, { error: String(err) })
          }
          return
        }

        if (req.method === 'POST' && url === '/api/gap-drafts') {
          try {
            const body = await readJsonBody(req)
            const gapId = typeof body.gapId === 'string' ? body.gapId.trim() : ''
            const rawPrompt = typeof body.rawPrompt === 'string' ? body.rawPrompt.trim() : ''
            if (!gapId || !rawPrompt) {
              sendJson(res, 400, { error: 'gapId e rawPrompt são obrigatórios.' })
              return
            }
            const nowIso = new Date().toISOString()
            const reqStatus: GapMissionStage =
              body.status === 'copied' || body.status === 'tested' ? body.status : 'forged'
            const upsertByGapId = body.upsertByGapId === true
            const existing = await readGapDrafts()
            const prevForGap = upsertByGapId ? existing.find((d) => d.gapId === gapId) : undefined

            const statusRank: Record<GapMissionStage, number> = { copied: 1, forged: 2, tested: 3 }
            const resolvedStatus: GapMissionStage =
              prevForGap?.status && statusRank[prevForGap.status] > statusRank[reqStatus] && body.forceStatus !== true
                ? prevForGap.status
                : reqStatus

            const draft: GapDraftRecord = {
              id:
                typeof body.id === 'string' && body.id.trim()
                  ? body.id.trim()
                  : prevForGap?.id || `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              createdAt:
                typeof body.createdAt === 'string' && body.createdAt
                  ? body.createdAt
                  : prevForGap?.createdAt || nowIso,
              updatedAt: nowIso,
              status: resolvedStatus,
              gapId,
              gapTitle: typeof body.gapTitle === 'string' ? body.gapTitle : gapId,
              scope: typeof body.scope === 'string' ? body.scope : 'all',
              axisA: typeof body.axisA === 'string' ? body.axisA : '',
              tagA: typeof body.tagA === 'string' ? body.tagA : '',
              axisB: typeof body.axisB === 'string' ? body.axisB : '',
              tagB: typeof body.tagB === 'string' ? body.tagB : '',
              axisC: typeof body.axisC === 'string' ? body.axisC : undefined,
              tagC: typeof body.tagC === 'string' ? body.tagC : undefined,
              donorAId: typeof body.donorAId === 'string' ? body.donorAId : null,
              donorBId: typeof body.donorBId === 'string' ? body.donorBId : null,
              donorCId: typeof body.donorCId === 'string' ? body.donorCId : null,
              macroFormat:
                body.macroFormat === 'json' || body.macroFormat === 'sections'
                  ? body.macroFormat
                  : 'single_paragraph',
              aspectRatio: typeof body.aspectRatio === 'string' ? body.aspectRatio : '3:4',
              attributeSources: (body.attributeSources || {}) as GapDraftRecord['attributeSources'],
              rawPrompt,
              rarityPercentile: Number(body.rarityPercentile || 50),
              rarityTier: (typeof body.rarityTier === 'string' ? body.rarityTier : 'B') as RarityTier,
              rarityLabel:
                typeof body.rarityLabel === 'string'
                  ? body.rarityLabel
                  : `mais raro que ${Math.round(Number(body.rarityPercentile || 50))}% da coleção`,
              maturityScore: Number(body.maturityScore || 50),
              quadrant: (typeof body.quadrant === 'string'
                ? body.quadrant
                : 'raro_maduro') as RarityQuadrant,
              filledAttributesCount: Number(body.filledAttributesCount || 8),
            }

            const nextDrafts = [
              draft,
              ...existing.filter((d) => (upsertByGapId ? d.gapId !== gapId && d.id !== draft.id : d.id !== draft.id)),
            ].slice(0, 250)
            await writeGapDrafts(nextDrafts)
            sendJson(res, 200, { draft, drafts: nextDrafts })
          } catch (err) {
            sendJson(res, 500, { error: String(err) })
          }
          return
        }

        if (req.method === 'DELETE' && url.startsWith('/api/gap-drafts/')) {
          try {
            const draftId = decodeURIComponent(url.replace('/api/gap-drafts/', '').trim())
            if (!draftId) {
              sendJson(res, 400, { error: 'ID obrigatório.' })
              return
            }
            const existing = await readGapDrafts()
            const nextDrafts = existing.filter((d) => d.id !== draftId)
            await writeGapDrafts(nextDrafts)
            sendJson(res, 200, { drafts: nextDrafts })
          } catch (err) {
            sendJson(res, 500, { error: String(err) })
          }
          return
        }

        if (req.method === 'GET' && url === '/api/immature-queue') {
          try {
            const database = ensureDbLoaded()
            if (!database) {
              sendJson(res, 404, { error: 'Banco SQLite não encontrado.' })
              return
            }

            const qRaw = (params.get('q') || '').trim()
            const ftsQuery = buildFtsMatchQuery(qRaw)
            const sourceLib = params.get('sourceLib') || 'all'
            const tier = params.get('tier') || 'all'
            const project = params.get('project') || 'all'
            const period = params.get('period') || 'all'
            const offset = Math.max(0, Number.parseInt(params.get('offset') || '0', 10) || 0)
            const limit = Math.max(1, Math.min(60, Number.parseInt(params.get('limit') || '24', 10) || 24))

            const clauses: string[] = ["prompts.quadrant = 'raro_imaturo'"]
            const bind: Array<string | number> = []
            let joinClause = ''

            if (ftsQuery) {
              joinClause = 'JOIN prompts_fts ON prompts.id = prompts_fts.id'
              clauses.push('prompts_fts MATCH ?')
              bind.push(ftsQuery)
            }
            if (sourceLib !== 'all') {
              clauses.push('prompts.source_lib = ?')
              bind.push(sourceLib)
            }
            if (tier !== 'all') {
              clauses.push('prompts.rarity_tier = ?')
              bind.push(tier)
            }
            if (project !== 'all') {
              clauses.push('prompts.project_name = ?')
              bind.push(project)
            }

            const whereSql = `WHERE ${clauses.join(' AND ')}`
            const metaRows = database
              .prepare(
                `SELECT prompts.id, prompts.project_name, prompts.rarity_tier,
                        prompts.rarity_percentile, prompts.maturity_score
                 FROM prompts ${joinClause} ${whereSql}
                 ORDER BY prompts.rarity_percentile DESC, prompts.maturity_score ASC`
              )
              .all(...bind) as Array<{
              id: string
              project_name: string
              rarity_tier: string
              rarity_percentile: number
              maturity_score: number
            }>

            const periodFiltered =
              period === 'all'
                ? metaRows
                : metaRows.filter((r) => cachedPeriodById.get(r.id) === period)

            const totalMatching = periodFiltered.length
            let tierSCount = 0
            let sumMat = 0
            let sumPct = 0
            const projCounter = new Map<string, number>()

            for (const r of periodFiltered) {
              if (r.rarity_tier === 'S') tierSCount++
              sumMat += Number(r.maturity_score || 0)
              sumPct += Number(r.rarity_percentile || 0)
              projCounter.set(r.project_name, (projCounter.get(r.project_name) || 0) + 1)
            }

            const projectsList = Array.from(projCounter.entries())
              .map(([name, count]) => ({ name, count }))
              .sort((a, b) => b.count - a.count)

            const pageIds = periodFiltered.slice(offset, offset + limit).map((r) => r.id)
            let items: PromptItem[] = []
            if (pageIds.length > 0) {
              const placeholders = pageIds.map(() => '?').join(',')
              const fullRows = database
                .prepare(`SELECT * FROM prompts WHERE id IN (${placeholders})`)
                .all(...pageIds) as Array<Record<string, unknown>>
              const byId = new Map(fullRows.map((r) => [String(r.id), hydratePromptRow(r)]))
              items = pageIds.map((id) => byId.get(id)).filter((x): x is PromptItem => Boolean(x))
            }

            sendJson(res, 200, {
              totalMatching,
              tierSCount,
              avgMaturity: totalMatching > 0 ? Number((sumMat / totalMatching).toFixed(1)) : 0,
              avgPercentile: totalMatching > 0 ? Math.round(sumPct / totalMatching) : 0,
              offset,
              limit,
              projects: projectsList,
              items,
            })
          } catch (err) {
            sendJson(res, 500, { error: String(err) })
          }
          return
        }

        if (req.method === 'GET' && url === '/api/timeline-insights') {
          try {
            const database = ensureDbLoaded()
            if (!database) {
              sendJson(res, 404, { error: 'Banco SQLite não encontrado.' })
              return
            }

            if (cachedTimelineInsights) {
              sendJson(res, 200, cachedTimelineInsights)
              return
            }

            const t0 = Date.now()

            type CohortAcc = {
              total: number
              dialects: Map<string, number>
              formats: Map<string, number>
              tierS: number
              raroMaduro: number
              raroImaturo: number
              sumPct: number
              sumMat: number
            }
            const cohortAccMap = new Map<string, CohortAcc>()

            for (const pt of cachedPoints) {
              const period = cachedPeriodById.get(pt.id) || '2026-10'
              let acc = cohortAccMap.get(period)
              if (!acc) {
                acc = {
                  total: 0,
                  dialects: new Map(),
                  formats: new Map(),
                  tierS: 0,
                  raroMaduro: 0,
                  raroImaturo: 0,
                  sumPct: 0,
                  sumMat: 0,
                }
                cohortAccMap.set(period, acc)
              }
              acc.total++
              acc.dialects.set(pt.dialect, (acc.dialects.get(pt.dialect) || 0) + 1)
              acc.formats.set(pt.format, (acc.formats.get(pt.format) || 0) + 1)
              if (pt.tier === 'S') acc.tierS++
              if (pt.quadrant === 'raro_maduro') acc.raroMaduro++
              if (pt.quadrant === 'raro_imaturo') acc.raroImaturo++
              acc.sumPct += pt.percentile
              acc.sumMat += pt.maturity
            }

            const pickTop = <T extends string>(map: Map<string, number>, fallback: T): T => {
              let bestK = fallback as string
              let bestV = -1
              for (const [k, v] of map.entries()) {
                if (v > bestV) {
                  bestV = v
                  bestK = k
                }
              }
              return bestK as T
            }

            const periodOrder = Array.from(cohortAccMap.keys()).sort((a, b) => {
              if (a === 'pre_2026_07') return -1
              if (b === 'pre_2026_07') return 1
              return a.localeCompare(b)
            })

            const cohorts: TimelineCohortRecord[] = periodOrder.map((period) => {
              const acc = cohortAccMap.get(period)!
              const tot = Math.max(1, acc.total)
              return {
                period,
                label: formatPeriodLabel(period),
                totalPrompts: acc.total,
                dominantDialect: pickTop<KernelDialect>(acc.dialects, 'nano_banana_g6'),
                dominantFormat: pickTop<MacroFormat>(acc.formats, 'json'),
                tierSCount: acc.tierS,
                tierSPct: Number(((acc.tierS / tot) * 100).toFixed(1)),
                raroMaduroCount: acc.raroMaduro,
                raroMaduroPct: Number(((acc.raroMaduro / tot) * 100).toFixed(1)),
                raroImaturoCount: acc.raroImaturo,
                raroImaturoPct: Number(((acc.raroImaturo / tot) * 100).toFixed(1)),
                avgPercentile: Math.round(acc.sumPct / tot),
                avgMaturity: Number((acc.sumMat / tot).toFixed(1)),
              }
            })

            // Deriva de ingredientes (safras <= 2026-08 vs >= 2026-10) usando scan sequencial rápido (~180ms)
            const ftsRows = database
              .prepare('SELECT id, tags_text FROM prompts_fts')
              .all() as Array<{ id: string; tags_text: string }>

            let earlierTotal = 0
            let recentTotal = 0
            const earlierTags = new Map<string, number>()
            const recentTags = new Map<string, number>()

            for (const row of ftsRows) {
              const period = cachedPeriodById.get(row.id) || '2026-10'
              const isEarlier = period === 'pre_2026_07' || period <= '2026-08'
              if (isEarlier) earlierTotal++
              else recentTotal++

              const seenRow = new Set<string>()
              const parts = (row.tags_text || '').split(/\s+/)
              for (const t of parts) {
                if (!t || t.includes(':') || seenRow.has(t)) continue
                seenRow.add(t)
                const map = isEarlier ? earlierTags : recentTags
                map.set(t, (map.get(t) || 0) + 1)
              }
            }

            const safeEarlier = Math.max(1, earlierTotal)
            const safeRecent = Math.max(1, recentTotal)
            const allDriftTags = new Set<string>([...earlierTags.keys(), ...recentTags.keys()])
            const driftList: TagDriftRecord[] = []

            for (const tag of allDriftTags) {
              const eCnt = earlierTags.get(tag) || 0
              const rCnt = recentTags.get(tag) || 0
              if (Math.max(eCnt, rCnt) < 80) continue
              const ePct = Number(((eCnt / safeEarlier) * 100).toFixed(1))
              const rPct = Number(((rCnt / safeRecent) * 100).toFixed(1))
              const deltaPct = Number((rPct - ePct).toFixed(1))
              driftList.push({
                tag,
                axis: inferAxisForDriftTag(tag),
                earlierCount: eCnt,
                earlierPct: ePct,
                recentCount: rCnt,
                recentPct: rPct,
                deltaPct,
                status: deltaPct < 0 ? 'dormant' : 'saturated',
              })
            }

            const dormantTags = driftList
              .filter((d) => d.deltaPct <= -1.5)
              .sort((a, b) => a.deltaPct - b.deltaPct)
              .slice(0, 12)

            const saturatedTags = driftList
              .filter((d) => d.deltaPct >= 1.5)
              .sort((a, b) => b.deltaPct - a.deltaPct)
              .slice(0, 12)

            cachedTimelineInsights = {
              generatedAt: new Date().toISOString(),
              totalCorpus: cachedPoints.length,
              cohorts,
              dormantTags,
              saturatedTags,
              computationMs: Date.now() - t0,
            }

            sendJson(res, 200, cachedTimelineInsights)
          } catch (err) {
            sendJson(res, 500, { error: String(err) })
          }
          return
        }

        if (req.method === 'GET' && url === '/api/experiments/sample') {
          try {
            const database = ensureDbLoaded()
            if (!database) {
              sendJson(res, 404, { error: 'Banco SQLite não encontrado.' })
              return
            }

            const mode = params.get('mode') === 'drift' ? 'drift' : 'antithesis'
            const sourceLib = params.get('sourceLib') || 'all'
            const seedId = (params.get('seedId') || '').trim()
            const reqProjA = (params.get('projectA') || '').trim()
            const reqProjB = (params.get('projectB') || '').trim()

            const hydrateByIds = (ids: string[]): Map<string, PromptItem> => {
              const unique = Array.from(new Set(ids.filter(Boolean)))
              const out = new Map<string, PromptItem>()
              if (unique.length === 0) return out
              const placeholders = unique.map(() => '?').join(',')
              const rows = database
                .prepare(`SELECT * FROM prompts WHERE id IN (${placeholders})`)
                .all(...unique) as Array<Record<string, unknown>>
              for (const r of rows) {
                const it = hydratePromptRow(r)
                out.set(it.id, it)
              }
              return out
            }

            const pickWithThumb = (candidates: MapPointCompact[], count: number): MapPointCompact[] => {
              const shuffled = [...candidates]
              for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1))
                const tmp = shuffled[i]
                shuffled[i] = shuffled[j]
                shuffled[j] = tmp
              }
              const withThumb: MapPointCompact[] = []
              const withoutThumb: MapPointCompact[] = []
              for (let i = 0; i < shuffled.length && withThumb.length < count; i++) {
                const pt = shuffled[i]
                if (resolveEagleThumbnailPath(pt.sourceLib, pt.id)) {
                  withThumb.push(pt)
                } else if (withoutThumb.length < count) {
                  withoutThumb.push(pt)
                }
              }
              while (withThumb.length < count && withoutThumb.length > 0) {
                const nextPt = withoutThumb.shift()
                if (nextPt) withThumb.push(nextPt)
              }
              return withThumb
            }

            const basePool = cachedPoints.filter(
              (p) => (sourceLib === 'all' || p.sourceLib === sourceLib) && p.maturity >= 55
            )
            const workingPool = basePool.length >= 12 ? basePool : cachedPoints

            if (mode === 'antithesis') {
              const maturePool = workingPool.filter((p) => p.maturity >= 65)
              const seedPool = maturePool.length >= 12 ? maturePool : workingPool
              let ptA: MapPointCompact | undefined
              if (seedId && cachedIdToIdx.has(seedId)) {
                ptA = cachedPoints[cachedIdToIdx.get(seedId)!]
              }
              if (!ptA) {
                const picked = pickWithThumb(seedPool.slice(0, 1200), 1)
                ptA = picked[0] ?? seedPool[Math.floor(Math.random() * seedPool.length)]
              }
              if (!ptA) {
                sendJson(res, 404, { error: 'Nenhum prompt disponível para antítese.' })
                return
              }

              const idxA = cachedIdToIdx.get(ptA.id)
              const antipodeScored: Array<{ pt: MapPointCompact; dot: number }> = []
              if (idxA !== undefined) {
                const offA = idxA * 24
                for (let j = 0; j < cachedPoints.length; j++) {
                  const ptB = cachedPoints[j]
                  if (ptB.id === ptA.id) continue
                  if (sourceLib !== 'all' && ptB.sourceLib !== sourceLib) continue
                  if (ptB.clusterId === ptA.clusterId) continue
                  if (ptB.maturity < 60) continue
                  const offB = j * 24
                  let dot = 0
                  for (let d = 0; d < 24; d++) {
                    dot += cachedVecs[offA + d] * cachedVecs[offB + d]
                  }
                  antipodeScored.push({ pt: ptB, dot })
                }
                antipodeScored.sort((a, b) => a.dot - b.dot)
              }

              // Seleciona antípodas diversos (priorizando projetos diferentes e com miniatura em disco)
              const topAntipodes: Array<{ pt: MapPointCompact; dot: number }> = []
              const seenProj = new Set<string>()
              for (const cand of antipodeScored.slice(0, 80)) {
                if (topAntipodes.length >= 8) break
                if (cand.pt.project === ptA.project && topAntipodes.length < 4) continue
                if (seenProj.has(cand.pt.project) && topAntipodes.length < 5) continue
                if (!resolveEagleThumbnailPath(cand.pt.sourceLib, cand.pt.id) && topAntipodes.length >= 2) {
                  continue
                }
                seenProj.add(cand.pt.project)
                topAntipodes.push(cand)
              }
              for (const cand of antipodeScored.slice(0, 24)) {
                if (topAntipodes.length >= 8) break
                if (!topAntipodes.some((x) => x.pt.id === cand.pt.id)) {
                  topAntipodes.push(cand)
                }
              }

              const extraA = pickWithThumb(
                seedPool.filter((p) => p.id !== ptA!.id && p.clusterId !== ptA!.clusterId),
                5
              )

              const idMap = hydrateByIds([
                ptA.id,
                ...topAntipodes.map((x) => x.pt.id),
                ...extraA.map((x) => x.id),
              ])
              const poleA = idMap.get(ptA.id)
              if (!poleA) {
                sendJson(res, 404, { error: 'Polo A não encontrado no SQLite.' })
                return
              }

              const antipodes = topAntipodes
                .map((x) => {
                  const item = idMap.get(x.pt.id)
                  if (!item) return null
                  const clamped = Math.max(-1, Math.min(1, x.dot))
                  return {
                    item,
                    cosineSim: Number(clamped.toFixed(3)),
                    angularDeg: Math.round(Math.acos(clamped) * (180 / Math.PI)),
                  }
                })
                .filter((x): x is { item: PromptItem; cosineSim: number; angularDeg: number } =>
                  Boolean(x)
                )

              const poleAPool = [
                poleA,
                ...extraA
                  .map((p) => idMap.get(p.id))
                  .filter((x): x is PromptItem => Boolean(x)),
              ]

              sendJson(res, 200, {
                mode: 'antithesis',
                poleA,
                antipodes,
                poleAPool,
              })
              return
            }

            // mode === 'drift' (Sonda de Deriva Cross-Projeto)
            const byProject = new Map<string, MapPointCompact[]>()
            for (const p of workingPool) {
              if (p.project === 'Sem Projeto') continue
              const arr = byProject.get(p.project) || []
              arr.push(p)
              byProject.set(p.project, arr)
            }
            const projectNames = Array.from(byProject.keys()).filter(
              (name) => (byProject.get(name)?.length || 0) >= 3
            )
            const safeProjects =
              projectNames.length >= 2 ? projectNames : Array.from(byProject.keys())

            const shuffledProjects = [...safeProjects].sort(() => Math.random() - 0.5)
            const projA =
              reqProjA && byProject.has(reqProjA)
                ? reqProjA
                : shuffledProjects[0] || workingPool[0]?.project || 'Sem Projeto'
            const projB =
              reqProjB && reqProjB !== projA && byProject.has(reqProjB)
                ? reqProjB
                : shuffledProjects.find((n) => n !== projA) || projA
            const projC = shuffledProjects.find((n) => n !== projA && n !== projB) || projB

            const listA = byProject.get(projA) || workingPool
            const listB = byProject.get(projB) || workingPool
            const listC = byProject.get(projC) || workingPool

            const poolAPts = pickWithThumb(listA, 6)
            const ptA = poolAPts[0] || listA[0]
            const poolBPts = pickWithThumb(
              listB.filter((p) => p.id !== ptA?.id && p.clusterId !== ptA?.clusterId),
              6
            )
            const ptB = poolBPts[0] || listB.find((p) => p.id !== ptA?.id) || listB[0]
            const poolCPts = pickWithThumb(
              listC.filter((p) => p.id !== ptA?.id && p.id !== ptB?.id),
              2
            )
            const ptC = poolCPts[0] || null

            const idMap = hydrateByIds([
              ...(ptA ? [ptA.id] : []),
              ...(ptB ? [ptB.id] : []),
              ...(ptC ? [ptC.id] : []),
              ...poolAPts.map((p) => p.id),
              ...poolBPts.map((p) => p.id),
            ])

            const donorA = ptA ? idMap.get(ptA.id) : undefined
            const donorB = ptB ? idMap.get(ptB.id) : undefined
            if (!donorA || !donorB) {
              sendJson(res, 404, { error: 'Doadores insuficientes para sonda de deriva.' })
              return
            }

            const poolA = poolAPts
              .map((p) => idMap.get(p.id))
              .filter((x): x is PromptItem => Boolean(x))
            const poolB = poolBPts
              .map((p) => idMap.get(p.id))
              .filter((x): x is PromptItem => Boolean(x))

            sendJson(res, 200, {
              mode: 'drift',
              donorA,
              donorB,
              donorC: ptC ? idMap.get(ptC.id) || null : null,
              poolA,
              poolB,
            })
          } catch (err) {
            sendJson(res, 500, { error: String(err) })
          }
          return
        }

        if (req.method === 'POST' && url === '/api/decompose-preview') {
          try {
            const body = await readJsonBody(req)
            const rawPrompt = typeof body.rawPrompt === 'string' ? body.rawPrompt : ''
            const scope = typeof body.scope === 'string' ? body.scope.trim() : 'all'
            const explicitProj =
              typeof body.project === 'string' && isNamedProjectScope(body.project)
                ? body.project
                : undefined
            const project = explicitProj ?? (isNamedProjectScope(scope) ? scope : undefined)
            const targetTags = Array.isArray(body.targetTags)
              ? body.targetTags
                  .filter((t): t is string => typeof t === 'string')
                  .map(sanitizeCanonicalTag)
                  .filter(Boolean)
              : []
            const inheritedTags = Array.isArray(body.inheritedTags)
              ? body.inheritedTags
                  .filter((t): t is string => typeof t === 'string')
                  .map(sanitizeCanonicalTag)
                  .filter(Boolean)
              : []

            if (!rawPrompt.trim()) {
              sendJson(res, 400, { error: 'rawPrompt obrigatório' })
              return
            }

            const { cleanPrompt, excerpt, attributes } = decomposePrompt(rawPrompt, { project })
            const database = ensureDbLoaded()
            const corpusSize = cachedPoints.length || 1
            const hasSubstantiveBody =
              attributes.estrutura.filledAttributesCount >= 6 && cleanPrompt.length >= 60

            const tagStats: AttributeTagStat[] = []
            const seenTags = new Set<string>()
            const pushTagStat = (axis: string, rawTag: string) => {
              const clean = sanitizeCanonicalTag(rawTag)
              if (!clean) return
              const canonical = DECOMPOSER_TO_SQLITE_TAG[clean] || clean
              if (seenTags.has(canonical)) return
              seenTags.add(canonical)
              const cnt = database ? getCachedTagCorpusCount(database, canonical) : 180
              const pct = Number(((cnt / corpusSize) * 100).toFixed(2))
              tagStats.push({
                axis,
                tag: canonical,
                corpusCount: cnt,
                corpusPct: pct,
                idfWeight: computeIdfWeight(cnt, corpusSize),
              })
            }

            for (const key of ['sujeito', 'cenario', 'luz', 'camera', 'textura_material', 'estilo'] as const) {
              for (const t of attributes[key].tags) {
                pushTagStat(key, t)
              }
            }
            if (hasSubstantiveBody) {
              for (const it of inheritedTags.slice(0, 12)) {
                pushTagStat('inherited', it)
              }
              for (const tt of targetTags) {
                pushTagStat('gap_target', tt)
              }
            }

            let secondaryFtsOccurrences = 0
            if (database && targetTags.length >= 2) {
              try {
                const ftsClauses = targetTags
                  .map((tt) => buildTagFtsClause(tt))
                  .filter((c): c is string => Boolean(c))
                  .join(' AND ')
                if (ftsClauses) {
                  if (isNamedProjectScope(scope)) {
                    const row = database
                      .prepare(
                        'SELECT COUNT(*) AS cnt FROM prompts JOIN prompts_fts ON prompts.id = prompts_fts.id WHERE prompts_fts MATCH ? AND prompts.project_name = ?'
                      )
                      .get(ftsClauses, scope) as { cnt: number } | undefined
                    secondaryFtsOccurrences = Number(row?.cnt || 0)
                  } else if (scope.startsWith('Google Flow')) {
                    const row = database
                      .prepare(
                        "SELECT COUNT(*) AS cnt FROM prompts JOIN prompts_fts ON prompts.id = prompts_fts.id WHERE prompts_fts MATCH ? AND prompts.source_lib = 'google_flow'"
                      )
                      .get(ftsClauses) as { cnt: number } | undefined
                    secondaryFtsOccurrences = Number(row?.cnt || 0)
                  } else {
                    const row = database
                      .prepare('SELECT COUNT(*) AS cnt FROM prompts_fts WHERE prompts_fts MATCH ?')
                      .get(ftsClauses) as { cnt: number } | undefined
                    secondaryFtsOccurrences = Number(row?.cnt || 0)
                  }
                }
              } catch {
                secondaryFtsOccurrences = 0
              }
            }

            // Retorna sempre a contagem real do FTS5 sem mascarar ocorrências preexistentes
            const exactGapOccurrences = secondaryFtsOccurrences

            const pairRarityBonus =
              targetTags.length >= 2 && hasSubstantiveBody
                ? Number((Math.log2((corpusSize + 1) / (exactGapOccurrences + 1)) * 0.16).toFixed(3))
                : 0

            const rarity = computePromptRarity({
              tagStats,
              pairRarityBonus,
              corpusSize,
              referenceSortedScores: cachedSortedRarityScores,
            })

            let skeletonReuseCount = attributes.estrutura.macroFormat === 'json' ? 420 : 85
            if (database) {
              try {
                const skRow = database
                  .prepare(
                    'SELECT COUNT(*) AS cnt FROM prompts WHERE macro_format = ? AND kernel_dialect = ?'
                  )
                  .get(attributes.estrutura.macroFormat, attributes.estrutura.kernelDialect) as
                  | { cnt: number }
                  | undefined
                if (skRow && Number(skRow.cnt) > 0) {
                  skeletonReuseCount = Number(skRow.cnt)
                }
              } catch {
                // keep default
              }
            }

            const maturity = computePromptMaturity({
              attributes,
              skeletonReuseCount,
            })
            const quadrant = classifyQuadrant(rarity.percentile, maturity.score)

            sendJson(res, 200, {
              cleanPrompt,
              excerpt,
              attributes,
              rarity,
              maturity,
              quadrant,
              exactGapOccurrences,
              secondaryFtsOccurrences,
              corpusSize,
            })
          } catch (err) {
            sendJson(res, 500, { error: String(err) })
          }
          return
        }

        next()
      })
    },
  }
}
