import type {
  CoreContentAttributeKey,
  GapAttributeSourceMode,
  GapRecord,
  MacroFormat,
  PromptItem,
} from '../types/promptEngine'

export function axisToAttributeKey(axis: string): CoreContentAttributeKey {
  switch (axis.toLowerCase()) {
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
  dutch_tilt_roll: 'Pronounced tilted Dutch angle camera roll (~12 deg tilt) introducing subtle diagonal tension',
  close_up_macro: 'Tight macro close-up camera framing focused on fine facial expression and surface detail',
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
  chiaroscuro_gobo_caustics: 'Dramatic chiaroscuro split lighting with carved venetian blind gobo shadows and subtle light caustics',

  // Cenário
  bedroom_bed: 'Intimate sunlit bedroom setting with tousled unbleached bed linen and muted painted plaster walls',
  bathroom_mirror: 'Tiled minimalist bathroom interior with matte porcelain fixtures and warm wall mirror reflections',
  living_room_office: 'Lived-in contemporary studio apartment and desk workspace with mid-century wood furniture',
  studio_seamless_backdrop: 'Clean seamless paper studio backdrop in warm neutral stone gray with controlled floor falloff',
  beach_pool_water: 'Sun-bleached coastal beach shoreline and tranquil water surface with wet sand reflections',
  urban_street_rooftop: 'Gritty urban street sidewalk and weathered concrete rooftop overlooking city silhouettes',
  cafe_bar_restaurant: 'Atmospheric wood-paneled cafe and cocktail bar interior with glass reflections and subtle bokeh',
  car_train_transit: 'Compact vintage car interior and transit cabin framed through glass window panels',
  brutalist_museum_interior: 'Monolithic brutalist concrete gallery and travertine stairwell with quiet architectural lines',
  botanical_greenhouse_nature: 'Humid glass botanical greenhouse filled with lush dense tropical foliage and filtered mist',

  // Tecidos & materiais
  cotton_jersey: 'Heavyweight matte combed cotton jersey with authentic natural drape and fine weave texture',
  denim_canvas: 'Structured raw indigo selvedge denim and brushed cotton canvas with visible stitching seams',
  silk_satin_organza: 'Fluid bias-cut silk satin and translucent organza catching soft specular sheen along folds',
  wool_tweed_merino: 'Textured bouclé wool tweed and fine merino knitwear showing tactile fiber loft',
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
  bikini_swimwear: 'Sculpted matte textured swimwear designed for coastal natural lighting',
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
}

export function describeTagForPrompt(tag: string): string {
  return TAG_PROMPT_PHRASES[tag] || tag.replace(/_/g, ' ')
}

export function collectTargetTagsBySlot(gap: GapRecord): Partial<Record<CoreContentAttributeKey, string[]>> {
  const grouped: Partial<Record<CoreContentAttributeKey, string[]>> = {}
  const pushTag = (axis: string | undefined, tag: string | undefined) => {
    if (!axis || !tag) return
    const key = axisToAttributeKey(axis)
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

  const slotA = axisToAttributeKey(gap.axisA)
  const slotB = axisToAttributeKey(gap.axisB)
  sources[slotA] = 'donor_a'
  sources[slotB] = 'donor_b'
  if (gap.axisC) {
    const slotC = axisToAttributeKey(gap.axisC)
    sources[slotC] = 'gap_target'
  }
  return sources
}

function cleanDonorSlotText(raw: string | undefined, maxLen = 210): string {
  if (!raw) return ''
  let cleaned = raw
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
    // Inclui contexto complementar do doador mantendo o ingrediente inédito como âncora principal
    const lowTargets = combined.join(' ').toLowerCase()
    const cleanPieces = donorText
      .split(/\s*;\s*/)
      .map((s) => s.trim())
      .filter((s) => s.length > 6 && !lowTargets.includes(s.toLowerCase().slice(0, 18)))
      .slice(0, 2)
    if (cleanPieces.length > 0) {
      combined.push(cleanPieces.join('; '))
    }
  }
  return combined.join('; ')
}

export interface SynthesizeGapInput {
  gap: GapRecord
  donorA: PromptItem | null
  donorB: PromptItem | null
  format: MacroFormat
  aspectRatio?: string
  includeNegative?: boolean
  attributeSources?: Partial<Record<CoreContentAttributeKey, GapAttributeSourceMode>>
}

export interface SynthesizeGapResult {
  rawPrompt: string
  aspectRatio: string
  attributeSources: Record<CoreContentAttributeKey, GapAttributeSourceMode>
  slotTexts: Record<CoreContentAttributeKey, string>
}

const DEFAULT_FALLBACKS: Record<CoreContentAttributeKey, string> = {
  sujeito: 'Woman in a poised editorial stance with natural expression and preserved facial structure',
  cenario: 'Architectural concrete interior with subtle depth and minimal props',
  luz: 'Directional natural daylight with refined shadow roll-off and balanced highlights',
  camera: 'Captured on Hasselblad X2D with 50mm prime lens framing a medium three-quarter shot',
  textura_material: 'Raw unbleached linen blazer over matte cotton jersey with natural unretouched skin pores',
  estilo: 'Editorial fashion campaign aesthetic, subtle 35mm film archival grain and authentic color science',
}

export function synthesizeGapPrompt(input: SynthesizeGapInput): SynthesizeGapResult {
  const {
    gap,
    donorA,
    donorB,
    format,
    aspectRatio = '3:4',
    includeNegative = true,
    attributeSources: overrides,
  } = input

  const baseSources = defaultAttributeSourcesForGap(gap)
  const attributeSources: Record<CoreContentAttributeKey, GapAttributeSourceMode> = {
    ...baseSources,
    ...overrides,
  }

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
    const primaryDonor = mode === 'donor_b' ? donorB || donorA : donorA || donorB
    const secondaryDonor = mode === 'donor_b' ? donorA : donorB
    const donorRaw =
      cleanDonorSlotText(primaryDonor?.attributes[key]?.text) ||
      cleanDonorSlotText(secondaryDonor?.attributes[key]?.text) ||
      DEFAULT_FALLBACKS[key]

    const tagsForSlot = targetTagsBySlot[key] || []
    const targetPhrases = tagsForSlot.map(describeTagForPrompt)

    slotTexts[key] = mergeTargetAndDonor(targetPhrases, donorRaw, mode)
  }

  const negativeText = 'plastic airbrushed skin, CGI sheen, stock photo stiffness, extra limbs, distorted hands'

  let rawPrompt = ''
  if (format === 'json') {
    const payload: Record<string, unknown> = {
      visual_context: {
        primary_lineage: slotTexts.estilo,
        gap_bridge: `${gap.tagA} × ${gap.tagB}${gap.tagC ? ` × ${gap.tagC}` : ''}`,
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
    // Parágrafo Único contínuo (sem cabeçalhos de seção com ':')
    const stripLabelPrefix = (s: string) =>
      s
        .replace(
          /^(?:Lineage|Pose|Identity|Wardrobe|Camera|Lighting|Environment|Subject)\s*:\s*/i,
          ''
        )
        .replace(/[;\n]+/g, ', ')
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
