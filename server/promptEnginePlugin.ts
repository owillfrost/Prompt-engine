import type { Plugin } from 'vite'
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
  KernelDialect,
  MacroFormat,
  MapPointCompact,
  MaturityBreakdown,
  PoseTelemetry,
  PromptItem,
  RarityBreakdown,
  RarityQuadrant,
  RarityTier,
  TagDriftRecord,
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

export function promptEnginePlugin(): Plugin {
  const projectRoot = process.cwd()
  const suiteJsonPath = path.join(projectRoot, 'data', 'suite_google_flow.json')
  const sampleJsonPath = path.join(projectRoot, 'data', 'sample_50_prompts.json')
  const dbPath = path.join(projectRoot, 'data', 'prompt_engine_v1.sqlite')
  const draftsJsonPath = path.join(projectRoot, 'data', 'gap_drafts.json')

  let db: DatabaseSync | null = null
  let dbMtimeMs = 0
  let cachedPoints: MapPointCompact[] = []
  let cachedVecs = new Float32Array(0)
  let cachedIdToIdx = new Map<string, number>()
  let cachedSortedRarityScores: number[] = []
  let cachedPeriodById = new Map<string, string>()
  let cachedTimelineInsights: TimelineInsightsResponse | null = null
  const tagCountCache = new Map<string, number>()

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

  function findDonorsForTag(
    database: DatabaseSync,
    rawTag: string,
    scope: string,
    limit = 8
  ): PromptItem[] {
    const clean = sanitizeCanonicalTag(rawTag)
    if (!clean) return []
    const mapped = DECOMPOSER_TO_SQLITE_TAG[clean] || clean
    const matchExpr = `tags_text : "${mapped}"`
    const out: PromptItem[] = []
    const seen = new Set<string>()

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
          .all(matchExpr, scope, limit) as Array<Record<string, unknown>>
        for (const r of scopedRows) {
          const item = hydratePromptRow(r)
          if (!seen.has(item.id)) {
            seen.add(item.id)
            out.push(item)
          }
        }
      }

      if (out.length < limit) {
        const globalRows = database
          .prepare(
            `SELECT prompts.* FROM prompts
             JOIN prompts_fts ON prompts.id = prompts_fts.id
             WHERE prompts_fts MATCH ?
             ORDER BY prompts.maturity_score DESC, prompts.rarity_percentile DESC
             LIMIT ?`
          )
          .all(matchExpr, limit + out.length) as Array<Record<string, unknown>>
        for (const r of globalRows) {
          const item = hydratePromptRow(r)
          if (!seen.has(item.id)) {
            seen.add(item.id)
            out.push(item)
            if (out.length >= limit) break
          }
        }
      }
    } catch {
      return out
    }
    return out
  }

  function ensureDbLoaded(): DatabaseSync | null {
    if (!fs.existsSync(dbPath)) return null
    const stat = fs.statSync(dbPath)
    if (db && stat.mtimeMs === dbMtimeMs) return db

    if (db) {
      try {
        db.close()
      } catch {
        // ignore
      }
      db = null
    }

    db = new DatabaseSync(dbPath, { readOnly: true })
    dbMtimeMs = stat.mtimeMs
    tagCountCache.clear()
    cachedTimelineInsights = null
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
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || ''
        const [url, qs] = rawUrl.split('?')
        const params = new URLSearchParams(qs || '')

        if (req.method === 'GET' && (url === '/api/suite' || url === '/api/collection')) {
          try {
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

            // Busca os 8 vizinhos semânticos mais próximos via dot product nos 24d cachedVecs
            const idx = cachedIdToIdx.get(itemId)
            const scored: Array<{ id: string; sem: number }> = []
            if (idx !== undefined && cachedPoints.length > 0) {
              const offA = idx * 24
              for (let j = 0; j < cachedPoints.length; j++) {
                if (j === idx) continue
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

            const topIds = scored.slice(0, 8)
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
            const draft: GapDraftRecord = {
              id:
                typeof body.id === 'string' && body.id.trim()
                  ? body.id.trim()
                  : `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              createdAt: typeof body.createdAt === 'string' && body.createdAt ? body.createdAt : nowIso,
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

            const existing = await readGapDrafts()
            const nextDrafts = [draft, ...existing.filter((d) => d.id !== draft.id)].slice(0, 200)
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
            const knownGapZero = body.knownGapZero === true

            if (!rawPrompt.trim()) {
              sendJson(res, 400, { error: 'rawPrompt obrigatório' })
              return
            }

            const { cleanPrompt, excerpt, attributes } = decomposePrompt(rawPrompt, { project })
            const database = ensureDbLoaded()
            const corpusSize = cachedPoints.length || 22282
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
                  .map((tt) => `tags_text : "${DECOMPOSER_TO_SQLITE_TAG[tt] || tt}"`)
                  .join(' AND ')
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
              } catch {
                secondaryFtsOccurrences = 0
              }
            }

            const exactGapOccurrences =
              knownGapZero && hasSubstantiveBody ? 0 : secondaryFtsOccurrences

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
