import type {
  AttributeKey,
  AttributeSlot,
  DecomposedAttributes,
  KernelDialect,
  MacroFormat,
  StructureSlot,
} from '../types/promptEngine'

const ATTRIBUTE_TAG_RULES: Record<
  Exclude<AttributeKey, 'projeto_cliente' | 'estrutura'>,
  Record<string, RegExp>
> = {
  sujeito: {
    pose_em_pe: /\b(standing|upright posture|de p[eé]|em p[eé])\b/i,
    pose_sentada: /\b(sitting|seated|sentad[oa]|chair|sofa|couch|bench|poltrona)\b/i,
    pose_deitada: /\b(lying|reclined|reclining|deitad[oa]|recostad[oa])\b/i,
    pose_caminhando: /\b(walking|stride|mid-step|caminhando|andando)\b/i,
    pose_agachada: /\b(crouching|crouched|squatting|agachad[oa])\b/i,
    pose_mirror_selfie: /\b(mirror selfie|selfie no espelho|holding (?:a |the )?(?:phone|smartphone))\b/i,
    pose_maos_tateis: /\b(hand(?:s)?\s+(?:on|near|holding|brushing|tucking|adjusting|resting)|m[ãa]os?\s+(?:no|na|em|segurando))\b/i,
    pose_torcao_ombro: /\b(counter-rotation|twist|over (?:her|the) shoulder|olhando sobre o ombro)\b/i,
    identidade_facs: /\b(facs|orbicularis|masseter|zygomatic|microexpression|poros|pores|freckles|sardas|skin texture)\b/i,
    identidade_lock: /\b(identity|preserve|reference|attached image|input a|woman|mulher|man|homem|cyclist|person)\b/i,
  },
  cenario: {
    cen_quarto: /\b(bedroom|bed linen|quarto|cama|mattress)\b/i,
    cen_banheiro_espelho: /\b(bathroom|banheiro|hallway|corredor|mirror|espelho)\b/i,
    cen_sala_escritorio: /\b(living room|sala|kitchen|apartment|apartamento|office|escrit[óo]rio|desk|gym)\b/i,
    cen_estudio: /\b(backdrop|seamless|gradient sky|fundo\s+(?:azul|branco|neutro|infinito|cinza)|est[úu]dio|studio)\b/i,
    cen_praia_agua: /\b(beach|praia|sand|pool|piscina|ocean|mar|water|underwater)\b/i,
    cen_rua_urbano: /\b(street|rua|sidewalk|asphalt|rooftop|terra[çc]o|balcony|varanda|city|urban|alley)\b/i,
    cen_cafe_bar: /\b(cafe|caf[ée]|coffee|restaurant|bar|diner|nightclub)\b/i,
    cen_transito: /\b(car|carro|train|trem|subway|elevator|vehicle)\b/i,
    cen_brutalista_museu: /\b(concrete|concreto|stairwell|escada|travertine|museum|gallery|marble|m[áa]rmore|brutalist|plaster)\b/i,
    cen_natureza_botanica: /\b(greenhouse|estufa|forest|foliage|garden|park|nature|grass|mountain|sky|trees|[áa]rvores|flowers)\b/i,
  },
  luz: {
    luz_janela_suave: /\b(window light|diffused?|difusa|luz de janela|daylight|luz do dia|overcast|nublado|soft light|natural light|no flash|sem flash)\b/i,
    luz_sol_direto: /\b(midday sun|direct sun(?:light)?|harsh sun|sunlight|sunlit|luz solar)\b/i,
    luz_estudio_softbox: /\b(softbox|strobe|high[- ]key|key light|fill light|studio light|ilumina[çc][ãa]o de est[úu]dio)\b/i,
    luz_golden_rim: /\b(golden hour|sunset|backlight|backlit|rim light|contra-luz|entardecer|luz dourada)\b/i,
    luz_flash_direto: /\b(on-camera flash|harsh flash|xenon flash|direct flash|flash direto|\bflash\b)\b/i,
    luz_noite_neon: /\b(neon|sodium-vapor|streetlamp|fluorescent|noturn[oa]|night|noite|low-light|dim)\b/i,
    luz_chiaroscuro_gobo: /\b(chiaroscuro|gobo|venetian blind|dappled|caustics|split light|penumbra|high[- ]contrast|sombras?\s+(?:duras|profundas|marcadas))\b/i,
    luz_ambiente_interna: /\b(indoor ambient|mixed indoor|tungsten|ambient(?:e)? light|luz ambiente|warm light|cool light|lamp|l[âa]mpada)\b/i,
  },
  camera: {
    cam_smartphone_24_28mm: /\b(21mm|23mm|24mm|26mm|28mm|wide[- ]angle|grande angular|iphone|samsung|xperia|smartphone|deep focus)\b/i,
    cam_prime_35_85mm: /\b(35mm|50mm|85mm|100mm|135mm|telephoto|prime lens|hasselblad|canon|fujifilm|leica|sony|shallow depth)\b/i,
    cam_eye_level: /\b(eye[- ]level|frontal|n[íi]vel dos olhos|straight[- ]on)\b/i,
    cam_plongee_alta: /\b(high[- ]angle|plong[ée]e|from above|de cima|top[- ]down|overhead)\b/i,
    cam_contra_plongee: /\b(low[- ]angle|contra[- ]plong[ée]e|from below|de baixo|worm'?s eye)\b/i,
    cam_perfil_34: /\b(profile|perfil|three[- ]quarter|3\/4|side view)\b/i,
    cam_dorsal: /\b(dorsal|from behind|over the shoulder|de costas)\b/i,
    cam_dutch_roll: /\b(dutch angle|dutch roll|tilted|canted|z-roll)\b/i,
    cam_closeup_macro: /\b(extreme close[- ]up|close[- ]up|macro|tight crop|corte fechado|headshot)\b/i,
    cam_oclusao_3planos: /\b(foreground|oclus[ãa]o|occluder|frame[- ]within[- ]a[- ]frame|peeking)\b/i,
  },
  textura_material: {
    mat_algodao: /\b(cotton|jersey|algod[ãa]o|ribbed|canelado|poplin|terry|flannel)\b/i,
    mat_linho: /\b(linen|linho|gauze|slubbed|raffia|straw)\b/i,
    mat_seda_cetim: /\b(silk|satin|organza|seda|cetim|chiffon|crepe)\b/i,
    mat_denim: /\b(denim|jeans|selvedge|canvas|twill|sarja)\b/i,
    mat_couro_camurca: /\b(leather|suede|couro|camur[çc]a)\b/i,
    mat_la_trico: /\b(wool|merino|tweed|cashmere|l[ãa]|knit|tric[ôo]|crochet)\b/i,
    mat_veludo_cotelê: /\b(velvet|corduroy|veludo|cotel[êe]|fur|shearling)\b/i,
    mat_renda_tule: /\b(lace|sheer|mesh|renda|tulle|sequin|paet[êe])\b/i,
    mat_tecnico_nylon: /\b(nylon|neoprene|ripstop|technical|carbon|gore[- ]tex|metallic|chrome)\b/i,
    mat_pele_organica: /\b(pores|poros|vellus|skin texture|unretouched|grain|granula[çc][ãa]o)\b/i,
  },
  estilo: {
    est_editorial: /\b(editorial|high[- ]fashion|lookbook|campaign|art[- ]directed|vogue)\b/i,
    est_candid_amador: /\b(candid|amateur|snapshot|photo dump|camera roll|ugc|ugly realism|unfiltered|unedited)\b/i,
    est_documental: /\b(documentary|documental|photojournal|unstaged|witness|street photography)\b/i,
    est_arquivo_analogico: /\b(archival|temporal patina|35mm film|kodak|analog|nostalgic|grain|patina)\b/i,
    est_estudio_limpo: /\b(minimalist|clean|commercial|studio|ecommerce|e-commerce)\b/i,
    est_narrativo_surreal: /\b(surreal|gothic|romanticism|cinematic|narrative|symbol)\b/i,
  },
}

const PREAMBLE_PATTERNS: RegExp[] = [
  /^(?:aqui est[áa]|here is|here are|based on|com base na|entendido|certamente|sure,|claro,)[^:{[\n]{0,500}?(?:prompt\s*:|formato\s+json\.?|📝[^\n]*\n)/i,
  /^i am nano banan[a]?\s*g?\d*[^:{[\n]{0,220}?:\s*/i,
]

const JSON_FENCE_RE = /```(?:json)?\s*(\{[\s\S]*\})\s*```/i
const AR_FLAG_RE = /--ar\s+(\d+:\d+)/i
const NO_FLAG_RE = /(?:^|\s)--no\s+([\s\S]+)$/i
const AVOID_CLAUSE_RE = /\bAvoid\s*:[^\n.]+(?:\.|$)/gi

function extractJsonBlock(raw: string): { obj: Record<string, unknown> | null; cleanBody: string } {
  const trimmed = raw.trim()
  const fence = trimmed.match(JSON_FENCE_RE)
  const candidate = fence ? fence[1] : trimmed

  // Suporte a JSON headless iniciando com `"subject": {`
  if (!fence && /^"[a-zA-Z0-9_ -]+"\s*:\s*[{["]/.test(candidate)) {
    const wrapped = `{\n${candidate.replace(/,\s*$/, '')}\n}`
    try {
      const parsed = JSON.parse(wrapped) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { obj: parsed as Record<string, unknown>, cleanBody: wrapped }
      }
    } catch {
      // ignore
    }
  }

  let searchFrom = 0
  while (searchFrom < candidate.length) {
    const braceIdx = candidate.indexOf('{', searchFrom)
    if (braceIdx === -1) break
    const sub = candidate.slice(braceIdx)
    const sanitized = sub.replace(/,\s*([}\]])/g, '$1')
    try {
      const parsed = JSON.parse(sanitized) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { obj: parsed as Record<string, unknown>, cleanBody: sanitized }
      }
    } catch {
      // Tenta delimitar pelo último '}' balanceado
      let depth = 0
      let inStr = false
      let escape = false
      for (let i = 0; i < sanitized.length; i++) {
        const ch = sanitized[i]
        if (escape) {
          escape = false
          continue
        }
        if (ch === '\\') {
          escape = true
          continue
        }
        if (ch === '"') {
          inStr = !inStr
          continue
        }
        if (!inStr) {
          if (ch === '{') depth++
          else if (ch === '}') {
            depth--
            if (depth === 0) {
              const slice = sanitized.slice(0, i + 1)
              try {
                const parsed = JSON.parse(slice) as unknown
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  return { obj: parsed as Record<string, unknown>, cleanBody: slice }
                }
              } catch {
                // keep searching
              }
              break
            }
          }
        }
      }
    }
    searchFrom = braceIdx + 1
  }

  return { obj: null, cleanBody: trimmed }
}

function flattenValue(val: unknown): string {
  if (val === null || val === undefined || typeof val === 'boolean') return ''
  if (typeof val === 'string') {
    const t = val.trim()
    return /^(none|n\/a|null|nil|unspecified|\[attach\])$/i.test(t) ? '' : t
  }
  if (typeof val === 'number') return String(val)
  if (Array.isArray(val)) {
    return val.map(flattenValue).filter(Boolean).join('; ')
  }
  if (typeof val === 'object') {
    const parts: string[] = []
    for (const [k, v] of Object.entries(val)) {
      const s = flattenValue(v)
      if (!s) continue
      if (s.length > 72 || /^(description|text|summary|value|main|details|prompt)$/i.test(k)) {
        parts.push(s)
      } else {
        parts.push(`${k}: ${s}`)
      }
    }
    return parts.join('; ')
  }
  return String(val)
}

function stripPreamble(raw: string): string {
  let out = raw.replace(/\u00a0/g, ' ').trim()
  for (const pat of PREAMBLE_PATTERNS) {
    const next = out.replace(pat, '').trim()
    if (next.length > 60) out = next
  }
  return out
}

function detectSections(text: string): {
  isSections: boolean
  dialectHint: KernelDialect | null
  sections: Array<{ header: string; body: string }>
} {
  // 1. Camadas FDR Direct [SHOT_TYPE] & [DEVICE] / [VISUAL DESCRIPTION]
  if (/\[(SHOT_TYPE|CAPTURE QUALITY|VISUAL DESCRIPTION|LIGHTING|LOCATION)\]/i.test(text)) {
    const parts = text.split(/(\[[A-Z0-9_&\s()]+\]\s*:?)/g).filter(Boolean)
    const sections: Array<{ header: string; body: string }> = []
    let currentHeader = 'PREAMBLE'
    for (const p of parts) {
      const t = p.trim()
      if (!t) continue
      if (t.startsWith('[') && t.includes(']')) {
        currentHeader = t.replace(/[:\]]+$/, '').replace(/^\[/, '').trim()
      } else {
        sections.push({ header: currentHeader, body: t })
      }
    }
    return { isSections: true, dialectHint: 'fdr_direct', sections }
  }

  // 2. Body Mechanics / Studio Editorial
  if (/BODY MECHANICS\s*:|\[BODY MECHANICS|STUDIO EDITORIAL|STEP\s*[1-4]\s*[—\-:]/i.test(text)) {
    const lines = text.split(/\n+/)
    const sections: Array<{ header: string; body: string }> = []
    let currentHeader = 'IDENTITY / OPENING'
    let buf: string[] = []
    const flush = () => {
      const body = buf.join(' ').trim()
      if (body) sections.push({ header: currentHeader, body })
      buf = []
    }
    for (const line of lines) {
      const m = line.match(
        /^\s*(?:\[(IDENTITY LOCK|SUBJECT[^\]]*|BODY MECHANICS[^\]]*|CLOTHING[^\]]*|LIGHTING[^\]]*|ENVIRONMENT[^\]]*|CAMERA[^\]]*)\]|(BODY MECHANICS|Wardrobe & materials|Lighting physics|Environment & props|Camera & sensor texture|Anatomical verification|POSE DIRECTION|STEP\s*[1-4][^:\n]*)\s*:)/i
      )
      if (m) {
        flush()
        currentHeader = (m[1] || m[2] || 'SECTION').trim()
        const rest = line.slice(m[0].length).trim()
        if (rest) buf.push(rest)
      } else {
        buf.push(line.trim())
      }
    }
    flush()
    const dialectHint: KernelDialect = /STUDIO EDITORIAL|STEP\s*4|\[BODY MECHANICS ::/i.test(text)
      ? 'studio_editorial_v5'
      : 'body_mechanics_12block'
    return { isSections: true, dialectHint, sections }
  }

  // 3. Seções por rótulos em caixa alta ou numeradas (ex: "EDITORIAL CONCEPT:", "1. Camera framing/crop")
  const sectionLineRe =
    /^\s*(?:\d+\.\s+[A-Za-z][^\n]{2,42}|[A-Z][A-Z0-9\s&/()-]{2,40}:|Editorial Direction:|Photographic Style:|Visual Aesthetic:|Composition:|Lighting:|Subject:|Camera:|Wardrobe:|Environment:)/gm
  const matches = text.match(sectionLineRe)
  if (matches && matches.length >= 2) {
    const lines = text.split(/\n+/)
    const sections: Array<{ header: string; body: string }> = []
    let currentHeader = 'INTRO'
    let buf: string[] = []
    const flush = () => {
      const body = buf.join(' ').trim()
      if (body) sections.push({ header: currentHeader, body })
      buf = []
    }
    for (const line of lines) {
      const trimmed = line.trim()
      const colonMatch = trimmed.match(/^([A-Za-z0-9\s&/()-]{3,42}):\s*(.*)$/)
      const numMatch = trimmed.match(/^(\d+\.\s+[A-Za-z][^\n]{2,42})$/)
      if (numMatch) {
        flush()
        currentHeader = numMatch[1].trim()
      } else if (colonMatch && (colonMatch[1] === colonMatch[1].toUpperCase() || /^(Editorial|Photographic|Visual|Composition|Lighting|Subject|Camera|Wardrobe|Environment|Art Direction|Color)/i.test(colonMatch[1]))) {
        flush()
        currentHeader = colonMatch[1].trim()
        if (colonMatch[2]) buf.push(colonMatch[2].trim())
      } else {
        buf.push(trimmed)
      }
    }
    flush()
    if (sections.length >= 2) {
      return { isSections: true, dialectHint: 'numbered_sections', sections }
    }
  }

  return { isSections: false, dialectHint: null, sections: [] }
}

function matchTags(text: string, axis: Exclude<AttributeKey, 'projeto_cliente' | 'estrutura'>): string[] {
  if (!text) return []
  const rules = ATTRIBUTE_TAG_RULES[axis]
  const tags: string[] = []
  for (const [tag, pat] of Object.entries(rules)) {
    if (pat.test(text)) tags.push(tag)
  }
  return tags
}

function classifyJsonPathToAttr(path: string): Exclude<AttributeKey, 'projeto_cliente' | 'estrutura'> | null {
  const p = path.toLowerCase()
  if (/lighting|light|illumination|shadow|iluminacao|luz/.test(p)) return 'luz'
  if (/camera|lens|shot|framing|angle|aperture|focus|capture|composition|perspective|depth_of_field|foreground/.test(p)) {
    if (/background|environment|setting|location/.test(p)) return 'cenario'
    return 'camera'
  }
  if (/environment|location|setting|background|space|scene_description|prop|cenario|ambiente/.test(p)) return 'cenario'
  if (/wardrobe|cloth|attire|fashion|outfit|garment|dress|footwear|accessor|fabric|material|skin|surface|texture/.test(p)) {
    return 'textura_material'
  }
  if (/color_grade|color_logic|visual_context|lineage|aesthetic|style|development|photographer|quality|look|render|vocab/.test(p)) {
    return 'estilo'
  }
  if (/subject|person|model|face|hair|expression|pose|action|posture|gesture|identity|facs|direction/.test(p)) {
    return 'sujeito'
  }
  return null
}

function routeSentenceToAttr(sentence: string): Array<Exclude<AttributeKey, 'projeto_cliente' | 'estrutura'>> {
  const s = sentence.toLowerCase()
  const targets: Array<Exclude<AttributeKey, 'projeto_cliente' | 'estrutura'>> = []
  if (/\b(woman|girl|man|person|model|cyclist|subject|mulher|homem|hair|cabelo|face|rosto|skin|pele|eyes|olhos|pose|standing|sitting|seated|lying|leaning|crouching|walking|hand|hands|m[ãa]o|shoulder|ombro|expression|smile|gaze|olhar)\b/.test(s)) {
    targets.push('sujeito')
  }
  if (/\b(room|quarto|bedroom|bathroom|banheiro|studio|est[úu]dio|backdrop|background|fundo|street|rua|beach|praia|cafe|office|escrit[óo]rio|concrete|concreto|wall|parede|floor|piso|mirror|espelho|forest|garden|location|interior|outdoor)\b/.test(s)) {
    targets.push('cenario')
  }
  if (/\b(light|lighting|luz|ilumina[çc][ãa]o|sun|sunlight|sol|shadow|sombra|flash|softbox|strobe|window|janela|kelvin|\d{4}k|neon|golden hour|daylight|overcast|chiaroscuro|backlight|rim light)\b/.test(s)) {
    targets.push('luz')
  }
  if (/\b(\d{2,3}mm|f\/\d|lens|lente|camera|c[âa]mera|iphone|canon|sony|hasselblad|leica|fujifilm|samsung|xperia|angle|[âa]ngulo|close-up|medium shot|full-body|framing|enquadramento|plong[ée]e|dutch|profile|perfil|depth of field|focus|foco|pov)\b/.test(s)) {
    targets.push('camera')
  }
  if (/\b(wearing|vestindo|usando|dress|vestido|shirt|camisa|t-shirt|camiseta|jacket|jaqueta|blazer|coat|jeans|denim|skirt|saia|bikini|top|hoodie|sweater|cotton|algod[ãa]o|linen|linho|silk|seda|leather|couro|velvet|nylon|fabric|tecido|texture|textura|pores|poros|metallic|matte)\b/.test(s)) {
    targets.push('textura_material')
  }
  if (/\b(editorial|candid|snapshot|documentary|documental|archival|35mm film|kodak|aesthetic|est[ée]tica|color science|color grade|lut|grain|granula[çc][ãa]o|realism|photorealistic|cinematic|minimalist|raw|unfiltered)\b/.test(s)) {
    targets.push('estilo')
  }
  return targets
}

function buildSkeletonSignature(
  macroFormat: MacroFormat,
  dialect: KernelDialect,
  topKeysOrSections: string[],
  hasExplicitNegative: boolean
): string {
  const normalizedKeys = topKeysOrSections
    .map((k) => k.toLowerCase().replace(/[^a-z0-9_]+/g, '_'))
    .filter(Boolean)
    .slice(0, 6)
    .join('+')
  const negFlag = hasExplicitNegative ? 'neg1' : 'neg0'
  return `${macroFormat}:${dialect}:${normalizedKeys || 'prose'}:${negFlag}`
}

export interface DecomposeOptions {
  project?: string
  folders?: string[]
  eagleTags?: string[]
  sourceLib?: string
}

export function decomposePrompt(rawPrompt: string, options: DecomposeOptions = {}): {
  cleanPrompt: string
  excerpt: string
  attributes: DecomposedAttributes
} {
  const raw = (rawPrompt || '').trim()
  const preCleaned = stripPreamble(raw)

  const buckets: Record<Exclude<AttributeKey, 'projeto_cliente' | 'estrutura'>, string[]> = {
    sujeito: [],
    cenario: [],
    luz: [],
    camera: [],
    textura_material: [],
    estilo: [],
  }

  let macroFormat: MacroFormat = 'single_paragraph'
  let kernelDialect: KernelDialect = 'qwen_natural'
  let topKeysOrSections: string[] = []
  let hasExplicitNegative = false
  let aspectRatio = '3:4'
  let cleanPrompt = preCleaned

  const arMatch = raw.match(AR_FLAG_RE)
  if (arMatch) aspectRatio = arMatch[1]
  if (NO_FLAG_RE.test(raw) || AVOID_CLAUSE_RE.test(raw)) {
    hasExplicitNegative = true
  }

  // Caso A: JSON
  const { obj: jsonObj, cleanBody } = extractJsonBlock(preCleaned)
  if (jsonObj) {
    macroFormat = 'json'
    topKeysOrSections = Object.keys(jsonObj).sort()
    const keysLow = new Set(topKeysOrSections.map((k) => k.toLowerCase()))
    const metaObj = typeof jsonObj.metadata === 'object' && jsonObj.metadata ? (jsonObj.metadata as Record<string, unknown>) : {}
    const frameworkStr = String(metaObj.framework || '').toLowerCase()

    if (frameworkStr.includes('latente') || keysLow.has('latente_version') || (keysLow.has('capture') && keysLow.has('color_logic'))) {
      kernelDialect = 'latente_v02'
    } else if (keysLow.has('visual_context') || keysLow.has('vocabulary_register') || (keysLow.has('subject') && keysLow.has('color_grade'))) {
      kernelDialect = 'nano_banana_g6'
    } else {
      kernelDialect = 'fdr_v3'
    }

    if (keysLow.has('negative_prompt') || keysLow.has('restraint_rules')) {
      hasExplicitNegative = true
    }

    const walkJson = (node: unknown, path = '') => {
      if (node === null || node === undefined) return
      if (typeof node === 'object' && !Array.isArray(node)) {
        for (const [k, v] of Object.entries(node)) {
          const kl = k.toLowerCase()
          if (/(negative|forbidden|restraint_rules)/.test(kl)) {
            hasExplicitNegative = true
            continue
          }
          if (/^(metadata|storage_context|latente_version|fdr_version|fdr_framework_version)$/.test(kl)) continue
          const nextPath = path ? `${path}.${k}` : k
          if (typeof v === 'object' && v !== null) {
            walkJson(v, nextPath)
          } else {
            const s = flattenValue(v)
            if (!s) continue
            const target = classifyJsonPathToAttr(nextPath)
            if (target) buckets[target].push(s)
          }
        }
      } else if (Array.isArray(node)) {
        for (const item of node) {
          if (typeof item === 'object' && item !== null) {
            walkJson(item, path)
          } else {
            const s = flattenValue(item)
            if (!s) continue
            const target = classifyJsonPathToAttr(path)
            if (target) buckets[target].push(s)
          }
        }
      }
    }

    walkJson(jsonObj)
    cleanPrompt = Object.values(buckets)
      .flat()
      .filter(Boolean)
      .join(' | ')
      .slice(0, 1200) || cleanBody

    // Se o JSON tinha um único campo "prompt" (como alguns Nano Banana wraps), rotear o texto livre também
    if (typeof jsonObj.prompt === 'string' && jsonObj.prompt.length > 60) {
      cleanPrompt = jsonObj.prompt.trim()
      const sentences = cleanPrompt.split(/(?<=[.!?])\s+|\n+/).filter((x) => x.trim().length > 4)
      for (const sent of sentences) {
        for (const target of routeSentenceToAttr(sent)) {
          if (!buckets[target].includes(sent.trim())) buckets[target].push(sent.trim())
        }
      }
    }
  } else {
    // Caso B: Seções vs Parágrafo Único
    const secInfo = detectSections(preCleaned)
    if (secInfo.isSections) {
      macroFormat = 'sections'
      kernelDialect = secInfo.dialectHint || 'numbered_sections'
      topKeysOrSections = secInfo.sections.map((s) => s.header).slice(0, 10)
      for (const sec of secInfo.sections) {
        const h = sec.header.toLowerCase()
        const b = sec.body.replace(NO_FLAG_RE, '').replace(AVOID_CLAUSE_RE, '').trim()
        if (!b) continue
        if (/shot_type|device|camera|framing|optical|composition/.test(h)) buckets.camera.push(b)
        else if (/light/.test(h)) buckets.luz.push(b)
        else if (/location|env|space|setting|background/.test(h)) buckets.cenario.push(b)
        else if (/wardrobe|cloth|material|surface|textur/.test(h)) buckets.textura_material.push(b)
        else if (/style|aesthetic|capture quality|editorial|color|direction|subculture/.test(h)) buckets.estilo.push(b)
        else if (/identity|subject|body mechanics|pose|expression/.test(h)) buckets.sujeito.push(b)
        else {
          for (const target of routeSentenceToAttr(b)) {
            buckets[target].push(b)
          }
        }
      }
      // Enriquece atributos ainda vazios com roteamento sentencial sobre as seções
      const joinedClean = secInfo.sections.map((s) => s.body).join(' ')
      cleanPrompt = joinedClean.replace(NO_FLAG_RE, '').replace(AR_FLAG_RE, '').trim()
      const sentences = cleanPrompt.split(/(?<=[.!?])\s+|\n+/).filter((x) => x.trim().length > 6)
      for (const sent of sentences) {
        for (const target of routeSentenceToAttr(sent)) {
          if (buckets[target].length === 0) buckets[target].push(sent.trim())
        }
      }
    } else {
      // Caso C: Parágrafo Único
      macroFormat = 'single_paragraph'
      kernelDialect = 'qwen_natural'
      cleanPrompt = preCleaned.replace(NO_FLAG_RE, '').replace(AR_FLAG_RE, '').trim()
      topKeysOrSections = ['single_paragraph']
      const clauses = cleanPrompt
        .split(/(?<=[.!?])\s+|\s*\|\s*|\s*;\s*/)
        .map((c) => c.trim())
        .filter((c) => c.length > 4)
      for (const clause of clauses) {
        const targets = routeSentenceToAttr(clause)
        if (targets.length === 0 && buckets.sujeito.length === 0) {
          buckets.sujeito.push(clause)
        } else {
          for (const target of targets) {
            if (!buckets[target].includes(clause)) buckets[target].push(clause)
          }
        }
      }
    }
  }

  const makeSlot = (key: Exclude<AttributeKey, 'projeto_cliente' | 'estrutura'>): AttributeSlot => {
    const text = Array.from(new Set(buckets[key])).join('; ').trim()
    const tags = matchTags(`${text} ${(options.eagleTags || []).join(' ')}`, key)
    return {
      text,
      tags,
      filled: text.length >= 6 || tags.length > 0,
    }
  }

  const sujeito = makeSlot('sujeito')
  const cenario = makeSlot('cenario')
  const luz = makeSlot('luz')
  const camera = makeSlot('camera')
  const textura_material = makeSlot('textura_material')
  const estilo = makeSlot('estilo')

  const folderClean = (options.folders || []).filter(Boolean)
  const projectLabel =
    options.project ||
    folderClean[0] ||
    (options.sourceLib === 'gemini_kimi' ? 'Gemini Kimi + Antigravity' : 'Sem Projeto')
  const projectTags = (options.eagleTags || []).filter((t) =>
    /^(char:|app:|arq:|mod:|estilo:)/i.test(t)
  )
  const projeto_cliente: AttributeSlot = {
    text: projectLabel,
    tags: projectTags.slice(0, 6),
    filled: projectLabel !== 'Sem Projeto' || projectTags.length > 0,
  }

  const coreSlots = [sujeito, cenario, luz, camera, textura_material, estilo, projeto_cliente]
  const filledAttributesCount = coreSlots.filter((s) => s.filled).length + 1 // + estrutura sempre presente
  const skeletonSignature = buildSkeletonSignature(macroFormat, kernelDialect, topKeysOrSections, hasExplicitNegative)
  const tokenCount = cleanPrompt.split(/\s+/).filter(Boolean).length

  const estrutura: StructureSlot = {
    text: `${macroFormat.toUpperCase()} · ${kernelDialect} · ${topKeysOrSections.slice(0, 4).join(', ')}`,
    tags: [macroFormat, kernelDialect],
    filled: true,
    macroFormat,
    kernelDialect,
    skeletonSignature,
    filledAttributesCount,
    hasExplicitNegative,
    aspectRatio,
    tokenCount,
    topKeysOrSections,
  }

  const attributes: DecomposedAttributes = {
    sujeito,
    cenario,
    luz,
    camera,
    textura_material,
    estilo,
    projeto_cliente,
    estrutura,
  }

  const excerptSource = [sujeito.text, cenario.text, luz.text, cleanPrompt]
    .find((v) => v && v.length > 12) || raw
  const excerpt = excerptSource.replace(/\s+/g, ' ').trim().slice(0, 175)

  return { cleanPrompt, excerpt, attributes }
}
