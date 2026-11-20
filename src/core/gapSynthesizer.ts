import type {
  CoreContentAttributeKey,
  GapAttributeSourceMode,
  GapRecord,
  MacroFormat,
  PromptItem,
} from '../types/promptEngine'

const MOTIF_TO_SLOT: Record<string, CoreContentAttributeKey> = {
  fisheye_optics: 'camera',
  long_exposure: 'camera',
  double_exposure: 'camera',
  prism_refraction: 'luz',
  projector_light: 'luz',
  stained_glass: 'luz',
  candlelight_amber: 'luz',
  shadow_play_gobo: 'luz',
  rain_wet_glass: 'cenario',
  fog_mist_veil: 'cenario',
  smoke_haze: 'cenario',
  snow_frost: 'cenario',
  underwater_weightless: 'cenario',
  library_stacks: 'cenario',
  subway_transit: 'cenario',
  elevator_box: 'cenario',
  supermarket_aisle: 'cenario',
  theater_stage: 'cenario',
  arcade_neon: 'cenario',
  greenhouse_glass: 'cenario',
  stairwell_echo: 'cenario',
  laundromat_glow: 'cenario',
  feathers_plume: 'textura_material',
  sequins_sparkle: 'textura_material',
  monochrome_noir: 'estilo',
  polaroid_patina: 'estilo',
  surreal_dream: 'estilo',
}

export function axisToAttributeKey(axis: string, tag?: string): CoreContentAttributeKey {
  const low = axis.toLowerCase()
  if (low === 'motif' && tag && MOTIF_TO_SLOT[tag]) {
    return MOTIF_TO_SLOT[tag]
  }
  switch (low) {
    case 'pose':
    case 'identity':
      return 'sujeito'
    case 'environment':
      return 'cenario'
    case 'lighting':
      return 'luz'
    case 'angle':
      return 'camera'
    case 'fabric':
    case 'wardrobe':
    case 'color':
      return 'textura_material'
    default:
      return 'estilo'
  }
}

export const TAG_PROMPT_PHRASES: Record<string, string> = {
  // Poses & sujeito
  standing_static: 'Subject in a relaxed standing upright posture with balanced weight and natural gaze',
  mirror_selfie_pose: 'Candid mirror selfie pose holding a smartphone with natural off-center framing',
  seated_relaxed: 'Subject seated in a grounded, unforced posture with authentic weight distribution',
  reclining_lying: 'Reclining figure resting naturally along the surface with relaxed shoulder alignment',
  crouching_squat: 'Dynamic crouching squat posture keeping torso angled and center of gravity low',
  walking_stride: 'Mid-stride walking motion captured spontaneously with subtle clothing movement',
  leaning_architectural: 'Figure leaning casually against an architectural plane with natural shoulder weight',
  counter_rotation_twist: 'Subtle torso counter-rotation with shoulders angled and head turned over the shoulder',
  action_airborne_dynamic: 'Expressive dynamic movement with crisp kinetic suspension and natural limb follow-through',
  hands_tactile_framing: 'Expressive hands gently framing the collarbone or brushing hair with authentic gesture',

  // Ângulos & câmera
  frontal_eye_level: 'Eye-level straight-on camera perspective captured with natural 50mm lens proportions',
  arm_length_pov: 'Intimate arm-length POV smartphone camera framing with close handheld immediacy',
  high_angle_plongee: 'High-angle plongee perspective looking down across the scene with clean spatial geometry',
  low_angle_contra_plongee: 'Low-angle contra-plongee camera viewpoint looking subtly upward for vertical presence',
  three_quarter_profile: 'Three-quarter profile framing capturing sculptural cheek and jawline contours',
  dorsal_over_shoulder: 'Over-the-shoulder dorsal framing looking past the foreground silhouette',
  dutch_tilt_roll: 'Pronounced tilted Dutch angle camera roll (~14 deg tilt) introducing dynamic diagonal tension',
  close_up_macro: 'Tight macro close-up camera framing focused on fine facial expression and tactile surface detail',
  three_plane_occlusion: 'Three-plane depth composition with an out-of-focus foreground occluder framing the subject',
  wide_angle_smartphone_optics: '24mm wide-angle smartphone rear camera optics with deep focus across foreground and background',
  telephoto_prime_optics: '85mm telephoto prime lens capture with shallow depth of field and creamy background separation',

  // Luz
  indoor_ambient_mixed: 'Mixed indoor ambient tungsten and practical lamp light with gentle naturalistic falloff',
  window_daylight_soft: 'Soft diffused north window daylight casting smooth tonal wrap across skin and fabric',
  harsh_midday_sun: 'Direct hard midday sunlight carving crisp architectural shadows and bright specular edges',
  studio_softbox_strobe: 'Controlled studio strobe and diffused softbox key light with clean commercial fill',
  golden_hour_rim: 'Warm golden hour sunset backlight etching a luminous rim glow along hair and shoulders',
  direct_flash_on_axis: 'Direct on-camera xenon flash illumination with snappy specular highlights and tight background drop-off',
  night_neon_sodium: 'Low-light night scene lit by mixed neon glow and warm sodium-vapor streetlamps',
  chiaroscuro_gobo_caustics: 'Dramatic chiaroscuro split lighting with carved venetian blind gobo shadows and light caustics',

  // Cenário (neutro quanto ao horário para não conflitar com o eixo de iluminação)
  bedroom_bed: 'Intimate bedroom interior with tousled unbleached bed linen and muted painted plaster walls',
  bathroom_mirror: 'Tiled minimalist bathroom interior with matte porcelain fixtures and warm wall mirror reflections',
  living_room_office: 'Lived-in contemporary studio apartment and desk workspace with mid-century wood furniture',
  studio_seamless_backdrop: 'Clean seamless paper studio backdrop in warm neutral stone gray with controlled floor falloff',
  beach_pool_water: 'Coastal shoreline and tranquil water surface with wet sand reflections and rippling highlights',
  urban_street_rooftop: 'Gritty urban street sidewalk and weathered concrete rooftop overlooking city silhouettes',
  cafe_bar_restaurant: 'Atmospheric wood-paneled cafe and cocktail bar interior with glass reflections and subtle bokeh',
  car_train_transit: 'Compact vintage car interior and transit cabin framed through glass window panels',
  brutalist_museum_interior: 'Monolithic brutalist concrete gallery and travertine stairwell with quiet architectural lines',
  botanical_greenhouse_nature: 'Humid glass botanical greenhouse filled with lush dense tropical foliage and filtered mist',

  // Tecidos & materiais
  cotton_jersey: 'Heavyweight matte combed cotton jersey with authentic natural drape and fine weave texture',
  denim_canvas: 'Structured raw indigo selvedge denim and brushed cotton canvas with visible stitching seams',
  silk_satin_organza: 'Fluid bias-cut silk satin and translucent organza catching soft specular sheen along folds',
  wool_tweed_merino: 'Textured boucle wool tweed and fine merino knitwear showing tactile fiber loft',
  linen_raw: 'Breathable unbleached raw slubbed linen with organic creases and crisp matte weave',
  leather_suede: 'Supple full-grain distressed leather and velvety suede catching directional grazing highlights',
  velvet_corduroy: 'Deep pile crushed velvet and wide-wale corduroy absorbing ambient light into rich midtones',
  lace_sheer_mesh: 'Delicate embroidered floral lace and sheer mesh layering with nuanced skin translucency',
  technical_metallic_nylon: 'Crisp iridescent ripstop technical nylon and brushed metallic hardware accents',

  // Figurinos & extras
  tank_top_camisole: 'Minimalist ribbed cotton camisole tank top fitted comfortably at the collarbone',
  t_shirt_oversized: 'Relaxed oversized boxy t-shirt and crisp open shirt worn effortlessly',
  hoodie_sweatshirt: 'Heavyweight washed cotton fleece hoodie with dropped shoulders',
  blazer_coat_jacket: 'Tailored structured wool-linen blazer coat with sharp lapel geometry',
  dress_slip: 'Architectural minimalist slip dress skimming naturally over the silhouette',
  bikini_swimwear: 'Sculpted matte textured swimwear designed for editorial resort framing',
  knitwear_turtleneck: 'Fine-gauge ribbed merino turtleneck sweater framing the neck',
  tailored_trousers_skirt: 'High-waisted pleated tailored trousers with clean vertical drape',
  denim_jeans: 'Vintage straight-leg washed denim jeans worn with casual authenticity',
  utilitarian_sport_nylon: 'Utilitarian outerwear layers with functional seam details and technical hardware',
  accessories_jewelry_shoes: 'Understated sculpted silver jewelry and worn leather footwear details',
  reference_identity_lock: 'Exact identity preservation with authentic facial bone structure and recognizable likeness',
  natural_pores_unretouched: 'Unretouched natural skin texture with visible pores, vellus hair, and subtle organic sheen',
  facs_microexpression_gaze: 'Nuanced micro-expression with calm orbicularis engagement and poised direct gaze',
  brunette_dark_hair: 'Rich dark brunette hair with effortless natural strands and soft movement',
  blonde_red_colored_hair: 'Luminous blonde and auburn tones catching directional rim highlights',
  hair_styling_updo_bangs: 'Loose tousled updo with delicate face-framing fringe strands',
  editorial_glam_makeup: 'Restrained tonal editorial makeup with satin skin finish and natural lip texture',

  // Fronteiras Criativas (motivos visuais, técnicas ópticas, atmosferas & micro-cenários raros)
  prism_refraction: 'Optical glass prism held near the lens casting vibrant spectral rainbow caustics and refracted light flares across skin and surfaces',
  double_exposure: 'In-camera analog double exposure blending the primary figure silhouette with a secondary translucent architectural or botanical layer',
  long_exposure: 'Slow-shutter long exposure (1/4s) capturing crisp stationary eye focus against fluid kinetic motion blur trails in clothing and ambient lights',
  projector_light: 'High-contrast digital projector light mapping casting sharp geometric patterns, typography fragments, or botanical shadows across skin and fabric',
  stained_glass: 'Luminous stained-glass cathedral windows projecting jewel-toned ruby, cobalt, and amber chromatic patterns across the scene',
  candlelight_amber: 'Intimate cluster of flickering beeswax candles throwing warm 1900K amber pools and dancing highlights across shadowed contours',
  fisheye_optics: '8mm ultra-wide fisheye lens distortion bending architectural verticals and exaggerating foreground hand/limb perspective',
  monochrome_noir: 'Silver-gelatin high-contrast monochrome black-and-white photography with rich selenium shadow depth and crisp micro-grain',
  polaroid_patina: 'Instant Polaroid SX-70 film aesthetics with creamy muted midtones, subtle chemical emulsion shifts, and soft vignette falloff',
  rain_wet_glass: 'Steady rain droplets clinging to glass panes and slick wet surfaces reflecting fragmented specular highlights',
  fog_mist_veil: 'Dense atmospheric fog and drifting mist veiling background depth into layered milky silhouettes',
  smoke_haze: 'Suspended theatrical haze and wisps of curling incense smoke catching crisp volumetric light beams',
  snow_frost: 'Drifting winter snowflakes and crystalline frost textures resting lightly on fabric fibers and hair',
  underwater_weightless: 'Submerged underwater photography with weightless floating fabric, suspended air bubbles, and rippling surface light caustics',
  library_stacks: 'Towering vintage wooden library stacks lined with aged archival volumes, brass reading lamps, and narrow quiet aisles',
  subway_transit: 'Gritty tiled underground subway platform with overhead cool fluorescent tubes, brushed steel turnstiles, and blurred passing train lights',
  elevator_box: 'Confined brushed-stainless-steel vintage elevator interior with overhead diffused ceiling panel and mirrored wall reflections',
  supermarket_aisle: 'Late-night supermarket aisle flanked by vibrant geometric product shelves under stark overhead cool-white fluorescent tubes',
  theater_stage: 'Empty crimson-velvet theater stage bathed in a solitary overhead Fresnel spotlight against deep darkened curtains',
  arcade_neon: 'Retro neon-lit video arcade interior glowing with CRT screen reflections, magenta-cyan signage, and dark mirrored glass',
  greenhouse_glass: 'Steamy Victorian glass greenhouse interior with condensation droplets on iron-framed panes and dense exotic ferns',
  stairwell_echo: 'Spiral brutalist architectural concrete stairwell shot across geometric railings and deep vertical drop-offs',
  feathers_plume: 'Sculptural couture plumage and delicate drifting feathers catching edge-lit micro-textures against heavy garments',
  sequins_sparkle: 'Reflective hand-sewn sequins and metallic paillettes scattering pinpoint specular sparkles across surrounding surfaces',
  surreal_dream: 'Unsettling surrealist visual staging with unexpected spatial scale, levitating props, or impossible mirror geometry',
  shadow_play_gobo: 'Intricate graphic shadow play projected through perforated metal screens or carved architectural shutters',
  laundromat_glow: '24-hour coin laundromat at night with glowing circular dryer drums, linoleum floor reflections, and hum of fluorescent tubes',
}

const EXPLORATORY_SUBJECT_SPARKS: readonly string[] = [
  'Editorial figure caught mid-turn interacting physically with an architectural edge or light beam, unposed peripheral gaze rather than looking straight into the lens',
  'Kinetic off-balance stance with torso angled away from camera axis, one hand adjusting collar or brushing sleeve while light carves across shoulder and jaw contours',
  'Candid mid-action silhouette leaning forward into a foreground frame, weight shifted asymmetrically onto lead hip with unchoreographed hair movement',
  'Sculptural three-quarter profile posture with chin slightly raised toward the key light source, fingers grazing surface texture with natural physical gravity',
  'Unconventional foreground-heavy composition where subject occupies the lower or lateral third, interacting authentically with environment props and reflections',
]

export function describeTagForPrompt(tag: string): string {
  return TAG_PROMPT_PHRASES[tag] || tag.replace(/_/g, ' ')
}

export function collectTargetTagsBySlot(gap: GapRecord): Partial<Record<CoreContentAttributeKey, string[]>> {
  const grouped: Partial<Record<CoreContentAttributeKey, string[]>> = {}
  const pushTag = (axis: string | undefined, tag: string | undefined) => {
    if (!axis || !tag) return
    const key = axisToAttributeKey(axis, tag)
    const list = grouped[key] || []
    if (!list.includes(tag)) list.push(tag)
    grouped[key] = list
  }
  pushTag(gap.axisA, gap.tagA)
  pushTag(gap.axisB, gap.tagB)
  pushTag(gap.axisC, gap.tagC)
  return grouped
}

export function defaultAttributeSourcesForGap(
  gap: GapRecord
): Record<CoreContentAttributeKey, GapAttributeSourceMode> {
  const sources: Record<CoreContentAttributeKey, GapAttributeSourceMode> = {
    sujeito: 'donor_a',
    cenario: 'donor_a',
    luz: 'donor_b',
    camera: 'donor_b',
    textura_material: 'donor_a',
    estilo: 'donor_a',
  }

  const slotA = axisToAttributeKey(gap.axisA, gap.tagA)
  const slotB = axisToAttributeKey(gap.axisB, gap.tagB)
  sources[slotA] = gap.axisA === 'motif' ? 'gap_target' : 'donor_a'
  sources[slotB] = gap.axisB === 'motif' ? 'gap_target' : 'donor_b'
  if (gap.axisC && gap.tagC) {
    const slotC = axisToAttributeKey(gap.axisC, gap.tagC)
    // Se o slot C já for o mesmo de A ou B (ex: pose + motif ambos em cenario/sujeito), preserva gap_target
    sources[slotC] = slotC === slotA || slotC === slotB ? 'gap_target' : 'donor_c'
  }
  return sources
}

const META_BOILERPLATE_RE =
  /(?:\[3D Pose:[^\]]+\]|\[(?:IDENTITY LOCK|VISUAL CONTEXT[^\]]*|SUBJECT[^\]]*|BODY MECHANICS[^\]]*|OBJECTS \/ SPACE[^\]]*|ANATOMICAL REINFORCEMENT[^\]]*|NEGATIVE PROMPT[^\]]*|STEP\s*\d+[^\]]*)\]|#prompt\s+\d+[^\n.;]*|\bSTUDIO EDITORIAL\s*[—\-]+[^\n.;]*|\bINPUT\s+[AB]\s*(?:\([^)]*\))?\s*:\s*(?:\[\s*attach\s*\])?|\bSame outfit as base prompt\.?|\bExact garments from INPUT [AB]\.?|\bCreate image:\s*use the attached image as the main facial reference[^.!?\n]*\.?|\bPreserve recognizable identity[^.!?\n]*\.?|\bprimary_lineage\s*:\s*|\bsecondary_influence\s*:\s*[^;\n.]+|\bdirection_spectrum_score\s*:\s*[\d/]+|\bvocabulary_register\s*:|\brequired_terms\s*:\s*[^;\n.]+|\bforbidden_terms\s*:\s*[^;\n.]+|\bsymbolic_function_notes\s*:\s*|"cgi render"\]?|"studio beauty dish"|SNS-like|\bAvoid\s*:[^\n.]+|\bAll descriptive language in this prompt[^\n.]+)/gi

const GARMENT_BLEED_RE =
  /\b(?:she wears|he wears|wearing\s+(?:a|an|the)|tank top|denim jeans|denim shorts|hoodie|bikini|sneakers|blazer|slip dress)\b/i

const DAYLIGHT_CONFLICT_RE =
  /\b(?:natural light only|no studio lighting|sun-bleached|harsh midday|(?:natural\s+(?:exterior\s+)?)?daylight|exterior\s+daylight|(?:morning|afternoon|exterior|bright|direct)\s+sunlight|midday sun|golden\s+sunlight)\b/i

const NIGHT_CONFLICT_RE =
  /\b(?:night neon|sodium-vapor|low-light night|pitch black|midnight)\b/i

const NIGHT_TARGET_TAGS = new Set([
  'night_neon_sodium',
  'candlelight_amber',
  'direct_flash_on_axis',
  'studio_softbox_strobe',
  'arcade_neon',
  'laundromat_glow',
  'theater_stage',
])

const DAYLIGHT_TARGET_TAGS = new Set(['harsh_midday_sun', 'window_daylight_soft', 'golden_hour_rim'])

function cleanDonorSlotText(
  raw: string | undefined,
  slotKey: CoreContentAttributeKey,
  allGapTags: Set<string>,
  maxLen = 280
): string {
  if (!raw) return ''
  let cleaned = raw
    .replace(META_BOILERPLATE_RE, ' ')
    .replace(/\s*\|\s*/g, '; ')
    .replace(/\b(?:context|location_details|setting_type|lighting_type|camera_angle)\s*:\s*/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^[;,\s.:-]+/, '')
    .trim()

  if (!cleaned) return ''

  const wantsNightOrControlled = Array.from(allGapTags).some((t) => NIGHT_TARGET_TAGS.has(t))
  const wantsDaylight = Array.from(allGapTags).some((t) => DAYLIGHT_TARGET_TAGS.has(t))

  const clauses = cleaned
    .split(/\s*;\s*|\.\s+/)
    .map((s) => s.trim().replace(/^[;,\s.-]+|[;,\s.-]+$/g, ''))
    .filter((s) => s.length >= 10)
    .filter((s) => {
      if (slotKey === 'luz' && GARMENT_BLEED_RE.test(s)) return false
      if (slotKey === 'cenario' && /\b(?:studio-precision|light-as-protagonist|staged-spontaneity)\b/i.test(s)) {
        return false
      }
      if (wantsNightOrControlled && DAYLIGHT_CONFLICT_RE.test(s)) return false
      if (wantsDaylight && NIGHT_CONFLICT_RE.test(s)) return false
      return true
    })

  if (clauses.length === 0) return ''

  let out = ''
  for (const c of clauses) {
    const candidate = out ? `${out}; ${c}` : c
    if (candidate.length > maxLen) {
      if (!out) out = c.slice(0, maxLen).trim()
      break
    }
    out = candidate
  }
  return out
}

function mergeTargetAndDonor(
  targetPhrases: string[],
  donorText: string,
  mode: GapAttributeSourceMode
): string {
  if (mode === 'gap_target' && targetPhrases.length > 0) {
    return targetPhrases.join('; ')
  }
  if (targetPhrases.length === 0) {
    return donorText
  }
  const combined = [...targetPhrases]
  if (donorText) {
    const lowTargets = combined.join(' ').toLowerCase()
    const cleanPieces = donorText
      .split(/\s*;\s*/)
      .map((s) => s.trim())
      .filter((s) => s.length > 8 && !lowTargets.includes(s.toLowerCase().slice(0, 18)))
      .slice(0, 1)
    if (cleanPieces.length > 0) {
      combined.push(cleanPieces[0])
    }
  }
  return combined.join('; ')
}

function pickExploratorySpark(seed: string): string {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return EXPLORATORY_SUBJECT_SPARKS[(hash >>> 0) % EXPLORATORY_SUBJECT_SPARKS.length]
}

export interface SynthesizeGapInput {
  gap: GapRecord
  donorA: PromptItem | null
  donorB: PromptItem | null
  donorC?: PromptItem | null
  format: MacroFormat
  aspectRatio?: string
  includeNegative?: boolean
  preserveIdentity?: boolean
  exploratoryMode?: boolean
  attributeSources?: Partial<Record<CoreContentAttributeKey, GapAttributeSourceMode>>
}

export interface SynthesizeGapResult {
  rawPrompt: string
  aspectRatio: string
  attributeSources: Record<CoreContentAttributeKey, GapAttributeSourceMode>
  slotTexts: Record<CoreContentAttributeKey, string>
}

const DEFAULT_FALLBACKS: Record<CoreContentAttributeKey, string> = {
  sujeito: 'Editorial subject in a dynamic asymmetric stance with natural facial structure and candid peripheral gaze',
  cenario: 'Architectural concrete interior with subtle spatial depth and tactile surface contrast',
  luz: 'Directional light carving crisp tonal separation with natural shadow roll-off',
  camera: 'Captured on 50mm prime lens framing an off-center medium composition',
  textura_material: 'Contrasting woven textile layers with unretouched natural skin pores',
  estilo: 'Editorial fashion campaign aesthetic with subtle 35mm archival film grain and authentic color science',
}

export function synthesizeGapPrompt(input: SynthesizeGapInput): SynthesizeGapResult {
  const {
    gap,
    donorA,
    donorB,
    donorC = null,
    format,
    aspectRatio = '3:4',
    includeNegative = true,
    preserveIdentity = false,
    exploratoryMode = true,
    attributeSources: overrides,
  } = input

  const baseSources = defaultAttributeSourcesForGap(gap)
  const attributeSources: Record<CoreContentAttributeKey, GapAttributeSourceMode> = {
    ...baseSources,
    ...overrides,
  }

  const allGapTags = new Set<string>([gap.tagA, gap.tagB, ...(gap.tagC ? [gap.tagC] : [])])
  const targetTagsBySlot = collectTargetTagsBySlot(gap)
  const keys: CoreContentAttributeKey[] = [
    'sujeito',
    'cenario',
    'luz',
    'camera',
    'textura_material',
    'estilo',
  ]

  const slotTexts = {} as Record<CoreContentAttributeKey, string>

  for (const key of keys) {
    const mode = attributeSources[key]
    const primaryDonor =
      mode === 'donor_c'
        ? donorC || donorB || donorA
        : mode === 'donor_b'
          ? donorB || donorA || donorC
          : donorA || donorB || donorC
    const secondaryDonor = mode === 'donor_b' ? donorA || donorC : donorB || donorC

    const cleanedPrimary = cleanDonorSlotText(primaryDonor?.attributes[key]?.text, key, allGapTags)
    const cleanedSecondary = cleanDonorSlotText(secondaryDonor?.attributes[key]?.text, key, allGapTags)

    let donorRaw = cleanedPrimary || cleanedSecondary || DEFAULT_FALLBACKS[key]

    // Em modo exploratório, se o slot sujeito do doador colapsou para algo curto/genérico após limpar boilerplate, injeta faísca cinética
    if (key === 'sujeito' && exploratoryMode && (!cleanedPrimary || cleanedPrimary.length < 36)) {
      donorRaw = pickExploratorySpark(`${gap.id}:${donorA?.id || ''}:${donorB?.id || ''}`)
    }

    const tagsForSlot = targetTagsBySlot[key] || []
    const targetPhrases = tagsForSlot.map(describeTagForPrompt)

    slotTexts[key] = mergeTargetAndDonor(targetPhrases, donorRaw, mode)
  }

  if (preserveIdentity && !/\bidentity\b|\breference\b/i.test(slotTexts.sujeito)) {
    slotTexts.sujeito = `Preserve exact facial identity and proportions from the reference image; ${slotTexts.sujeito}`
  }

  const bridgeLabel = `${gap.tagA} × ${gap.tagB}${gap.tagC ? ` × ${gap.tagC}` : ''}`
  const negativeText =
    'plastic airbrushed skin, CGI sheen, stock photo stiffness, extra limbs, distorted hands, watermark'

  let rawPrompt = ''
  if (format === 'json') {
    const payload: Record<string, unknown> = {
      visual_context: {
        primary_lineage: slotTexts.estilo,
        gap_bridge: bridgeLabel,
        creative_direction:
          gap.creativeCatalyst ||
          `Visual collision crossing ${describeTagForPrompt(gap.tagA).split(',')[0]} with ${describeTagForPrompt(gap.tagB).split(',')[0]}`,
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
    if (includeNegative) {
      payload.negative_prompt = negativeText
    }
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
    if (includeNegative) {
      lines.push(`Avoid: ${negativeText}. --ar ${aspectRatio}`)
    } else {
      lines.push(`--ar ${aspectRatio}`)
    }
    rawPrompt = lines.join('\n\n')
  } else {
    const stripLabelPrefix = (s: string) =>
      s
        .replace(
          /^(?:Lineage|Pose|Identity|Wardrobe|Camera|Lighting|Environment|Subject)\s*:\s*/i,
          ''
        )
        .replace(/[;\n]+\s*/g, ', ')
        .trim()
    const cleanPieces = [
      stripLabelPrefix(slotTexts.sujeito),
      `Captured with camera framing showing ${stripLabelPrefix(slotTexts.camera)}`,
      `Wearing textured wardrobe of ${stripLabelPrefix(slotTexts.textura_material)}`,
      `Set inside a location featuring ${stripLabelPrefix(slotTexts.cenario)}`,
      `Illuminated by lighting physics with ${stripLabelPrefix(slotTexts.luz)}`,
      `Editorial photographic aesthetic featuring ${stripLabelPrefix(slotTexts.estilo)}`,
    ]
    const flags = includeNegative ? `--ar ${aspectRatio} --no ${negativeText}` : `--ar ${aspectRatio}`
    rawPrompt = `${cleanPieces.map((s) => s.replace(/[.;,]+$/, '')).join('. ')}. ${flags}`
  }

  return {
    rawPrompt,
    aspectRatio,
    attributeSources,
    slotTexts,
  }
}
