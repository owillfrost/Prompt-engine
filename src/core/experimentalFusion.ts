import { axisToAttributeKey, describeTagForPrompt } from './gapSynthesizer'
import type {
  CoreContentAttributeKey,
  ExperimentalSlotSource,
  MacroFormat,
  PromptItem,
} from '../types/promptEngine'

export interface AntithesisPreset {
  id: string
  title: string
  tensionNote: string
  axisA: string
  tagA: string
  axisB: string
  tagB: string
}

export const ANTITHESIS_PRESETS: ReadonlyArray<AntithesisPreset> = [
  {
    id: 'brutalist-swim',
    title: 'Concreto Brutalista × Beachwear',
    tensionNote: 'Monolito arquitetônico frio contra tecido leve de verão.',
    axisA: 'environment',
    tagA: 'brutalist_museum_interior',
    axisB: 'wardrobe',
    tagB: 'bikini_swimwear',
  },
  {
    id: 'silk-street',
    title: 'Seda & Cetim × Terraço Urbano',
    tensionNote: 'Caimento fluido de alta costura em asfalto e concreto bruto.',
    axisA: 'fabric',
    tagA: 'silk_satin_organza',
    axisB: 'environment',
    tagB: 'urban_street_rooftop',
  },
  {
    id: 'studio-gobo',
    title: 'Fundo Infinito × Chiaroscuro Gobo',
    tensionNote: 'Neutralidade clínica de estúdio cortada por sombras dramáticas.',
    axisA: 'environment',
    tagA: 'studio_seamless_backdrop',
    axisB: 'lighting',
    tagB: 'chiaroscuro_gobo_caustics',
  },
  {
    id: 'botanical-flash',
    title: 'Estufa Botânica × Flash Direto',
    tensionNote: 'Umidade orgânica de folhagens com disparo seco on-axis.',
    axisA: 'environment',
    tagA: 'botanical_greenhouse_nature',
    axisB: 'lighting',
    tagB: 'direct_flash_on_axis',
  },
  {
    id: 'leather-water',
    title: 'Couro & Camurça × Praia / Água',
    tensionNote: 'Material pesado e seco em contraste com reflexo costeiro.',
    axisA: 'fabric',
    tagA: 'leather_suede',
    axisB: 'environment',
    tagB: 'beach_pool_water',
  },
  {
    id: 'tailored-dutch',
    title: 'Alfaiataria Estruturada × Dutch Roll',
    tensionNote: 'Geometria rígida de lapela quebrada por inclinação diagonal.',
    axisA: 'wardrobe',
    tagA: 'blazer_coat_jacket',
    axisB: 'angle',
    tagB: 'dutch_tilt_roll',
  },
]

const CORE_KEYS: readonly CoreContentAttributeKey[] = [
  'sujeito',
  'cenario',
  'luz',
  'camera',
  'textura_material',
  'estilo',
]

export function defaultAntithesisSources(): Record<CoreContentAttributeKey, ExperimentalSlotSource> {
  return {
    sujeito: 'donor_a',
    cenario: 'donor_b',
    luz: 'donor_b',
    camera: 'donor_b',
    textura_material: 'donor_a',
    estilo: 'donor_a',
  }
}

export function buildRandomDriftSources(
  lockedSlots: Partial<Record<CoreContentAttributeKey, boolean>>,
  currentSources: Record<CoreContentAttributeKey, ExperimentalSlotSource>,
  hasDonorC: boolean
): Record<CoreContentAttributeKey, ExperimentalSlotSource> {
  const pool: ExperimentalSlotSource[] = hasDonorC
    ? ['donor_a', 'donor_b', 'donor_c']
    : ['donor_a', 'donor_b']

  const next = { ...currentSources }
  const unlocked = CORE_KEYS.filter((k) => !lockedSlots[k])
  if (unlocked.length === 0) return next

  for (const key of unlocked) {
    const pick = pool[Math.floor(Math.random() * pool.length)]
    next[key] = pick
  }

  // Garante mistura real entre ao menos dois doadores quando há 2+ slots livres
  if (unlocked.length >= 2) {
    const used = new Set(unlocked.map((k) => next[k]))
    if (used.size < 2) {
      const firstVal = next[unlocked[0]]
      const alt = pool.find((p) => p !== firstVal) || 'donor_b'
      next[unlocked[unlocked.length - 1]] = alt
    }
  }

  return next
}

function cleanSlotText(raw: string | undefined, maxLen = 210): string {
  if (!raw) return ''
  const cleaned = raw
    .replace(/\[3D Pose:[^\]]+\]/gi, '')
    .replace(/\bAvoid\s*:[^\n.]+/gi, '')
    .replace(/\s*\|\s*/g, '; ')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length <= maxLen) return cleaned
  const cut = cleaned.slice(0, maxLen)
  const lastBreak = Math.max(cut.lastIndexOf(';'), cut.lastIndexOf('.'), cut.lastIndexOf(','))
  return (lastBreak > 80 ? cut.slice(0, lastBreak) : cut).trim()
}

const FALLBACK_TEXTS: Record<CoreContentAttributeKey, string> = {
  sujeito: 'Subject in a poised editorial stance with natural facial structure and calm gaze',
  cenario: 'Architectural gallery interior with subtle depth and minimal ambient props',
  luz: 'Directional studio key light with sculpted shadow roll-off and crisp highlights',
  camera: 'Captured on 50mm prime lens framing a balanced three-quarter medium shot',
  textura_material: 'Contrasting woven textile layers with natural unretouched skin pores',
  estilo: 'Editorial photographic lineage with restrained tonal grading and fine film grain',
}

export interface SynthesizeExperimentalInput {
  modeLabel: string
  donorA: PromptItem | null
  donorB: PromptItem | null
  donorC?: PromptItem | null
  sources: Record<CoreContentAttributeKey, ExperimentalSlotSource>
  format: MacroFormat
  aspectRatio: string
  includeNegative: boolean
  contrastTags?: Array<{ axis: string; tag: string }>
}

export function synthesizeExperimentalPrompt(input: SynthesizeExperimentalInput): {
  rawPrompt: string
  slotTexts: Record<CoreContentAttributeKey, string>
} {
  const {
    modeLabel,
    donorA,
    donorB,
    donorC = null,
    sources,
    format,
    aspectRatio,
    includeNegative,
    contrastTags = [],
  } = input

  const contrastBySlot = new Map<CoreContentAttributeKey, string[]>()
  for (const ct of contrastTags) {
    const slotKey = axisToAttributeKey(ct.axis)
    const arr = contrastBySlot.get(slotKey) || []
    arr.push(describeTagForPrompt(ct.tag))
    contrastBySlot.set(slotKey, arr)
  }

  const resolveDonor = (src: ExperimentalSlotSource): PromptItem | null => {
    if (src === 'donor_c') return donorC || donorB || donorA
    if (src === 'donor_b') return donorB || donorA
    return donorA || donorB
  }

  const slotTexts = {} as Record<CoreContentAttributeKey, string>

  for (const key of CORE_KEYS) {
    const chosen = resolveDonor(sources[key])
    const fallbackDonor = chosen === donorA ? donorB : donorA
    const baseText =
      cleanSlotText(chosen?.attributes[key]?.text) ||
      cleanSlotText(fallbackDonor?.attributes[key]?.text) ||
      FALLBACK_TEXTS[key]

    const forced = contrastBySlot.get(key)
    if (forced && forced.length > 0) {
      slotTexts[key] = `${forced.join('; ')}; ${baseText}`
    } else {
      slotTexts[key] = baseText
    }
  }

  const negativeText =
    'plastic airbrushed skin, CGI sheen, stock photo stiffness, extra limbs, distorted hands'

  let rawPrompt = ''
  if (format === 'json') {
    const payload: Record<string, unknown> = {
      visual_context: {
        primary_lineage: slotTexts.estilo,
        experimental_mode: modeLabel,
        aspect_ratio: aspectRatio,
      },
      subject: {
        description: slotTexts.sujeito,
      },
      wardrobe_and_materials: {
        garments_and_texture: slotTexts.textura_material,
      },
      environment: {
        location: slotTexts.cenario,
      },
      lighting: slotTexts.luz,
      camera: {
        framing_and_optics: slotTexts.camera,
      },
    }
    if (includeNegative) payload.negative_prompt = negativeText
    rawPrompt = JSON.stringify(payload, null, 2)
  } else if (format === 'sections') {
    const lines = [
      `[SHOT_TYPE] & [DEVICE]:\n${slotTexts.camera}`,
      `[SUBJECT & POSE]:\n${slotTexts.sujeito}`,
      `[WARDROBE & MATERIALS]:\n${slotTexts.textura_material}`,
      `[LIGHTING]:\n${slotTexts.luz}`,
      `[LOCATION]:\n${slotTexts.cenario}`,
      `[CAPTURE QUALITY]:\n${slotTexts.estilo}`,
    ]
    lines.push(includeNegative ? `Avoid: ${negativeText}. --ar ${aspectRatio}` : `--ar ${aspectRatio}`)
    rawPrompt = lines.join('\n\n')
  } else {
    const stripPrefix = (s: string) =>
      s
        .replace(/^(?:Lineage|Pose|Identity|Wardrobe|Camera|Lighting|Environment|Subject)\s*:\s*/i, '')
        .replace(/[;\n]+/g, ', ')
        .trim()
    const sentences = [
      stripPrefix(slotTexts.sujeito),
      `Captured with camera framing showing ${stripPrefix(slotTexts.camera)}`,
      `Wearing textured wardrobe of ${stripPrefix(slotTexts.textura_material)}`,
      `Set inside a location featuring ${stripPrefix(slotTexts.cenario)}`,
      `Illuminated by lighting physics with ${stripPrefix(slotTexts.luz)}`,
      `Editorial photographic aesthetic featuring ${stripPrefix(slotTexts.estilo)}`,
    ]
    const flags = includeNegative ? `--ar ${aspectRatio} --no ${negativeText}` : `--ar ${aspectRatio}`
    rawPrompt = `${sentences.map((s) => s.replace(/[.;,]+$/, '')).join('. ')}. ${flags}`
  }

  return { rawPrompt, slotTexts }
}
