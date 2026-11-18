import { decomposePrompt } from './promptDecomposer'
import { classifyQuadrant, computePromptMaturity } from './rarityEngine'
import type {
  ImmaturityBottleneck,
  MatureMoldId,
  MatureMoldMeta,
  PromptItem,
  PromptRefinementResult,
} from '../types/promptEngine'

export const MATURE_MOLDS: ReadonlyArray<MatureMoldMeta> = [
  {
    id: 'studio_editorial_v5',
    label: 'Studio Editorial v5',
    macroFormat: 'sections',
    kernelDialect: 'studio_editorial_v5',
    skeletonReuseCount: 1353,
    avgMaturityInCorpus: 95.0,
    avgRarityInCorpus: 71.2,
    description: 'Seções em 6 blocos físicos + STEP 4 + Avoid (maior reuso e maturidade média do corpus).',
  },
  {
    id: 'nano_banana_g6',
    label: 'Nano Banana G6',
    macroFormat: 'json',
    kernelDialect: 'nano_banana_g6',
    skeletonReuseCount: 839,
    avgMaturityInCorpus: 85.3,
    avgRarityInCorpus: 41.2,
    description: 'JSON canônico com visual_context, subject, camera, lighting, color_grade e negative_prompt.',
  },
  {
    id: 'fdr_v3',
    label: 'FDR v3 Técnico',
    macroFormat: 'json',
    kernelDialect: 'fdr_v3',
    skeletonReuseCount: 402,
    avgMaturityInCorpus: 81.9,
    avgRarityInCorpus: 62.6,
    description: 'JSON técnico estruturado com rendering_directive, camera_technical e isolamento semântico.',
  },
  {
    id: 'fdr_direct',
    label: 'FDR Direct / Body Mechanics',
    macroFormat: 'sections',
    kernelDialect: 'fdr_direct',
    skeletonReuseCount: 240,
    avgMaturityInCorpus: 78.5,
    avgRarityInCorpus: 71.8,
    description: 'Seções diretas orientadas a câmera/dispositivo, postura, luz e qualidade de captura.',
  },
]

const CAM_OPTICS_RE = /\b(\d{2,3}mm|f\/\d|iphone|canon|sony|hasselblad|leica|fujifilm|35mm|85mm)\b/i
const LUZ_PHYS_RE = /\b(kelvin|\d{4}k|flash|softbox|strobe|window|chiaroscuro|backlight|daylight|sunlight|luz)\b/i
const SUJ_MECH_RE = /\b(facs|pores|poros|weight|pelvis|torso|shoulder|ombro|olhar|gaze|expression|pose)\b/i

export function diagnosePromptImmaturity(item: PromptItem): ImmaturityBottleneck[] {
  const diagnostics: ImmaturityBottleneck[] = []
  const attrs = item.attributes
  const { maturity } = item

  if (maturity.skeletonReuseScore < 45) {
    diagnostics.push({
      kind: 'orphan_skeleton',
      tag: 'ESQUELETO ÓRFÃO',
      title: `Baixo reuso do molde (${maturity.skeletonReuseCount}×)`,
      detail: 'Migrar estrutura experimental para um dos 4 esqueletos consolidados do corpus.',
      estimatedGainPts: Math.round((95 - maturity.skeletonReuseScore) * 0.34),
    })
  }

  if (!attrs.estrutura.hasExplicitNegative) {
    diagnostics.push({
      kind: 'missing_negative',
      tag: 'SEM NEGATIVO',
      title: 'Ausência de cláusula negativa explícita',
      detail: 'Adicionar restrições anti-plástico / isolamento anatômico para elevar precisão técnica.',
      estimatedGainPts: 4,
    })
  }

  if (!CAM_OPTICS_RE.test(attrs.camera.text)) {
    diagnostics.push({
      kind: 'weak_camera_optics',
      tag: 'ÓPTICA',
      title: 'Câmera / distância focal subespecificada',
      detail: 'Explicitar lente (ex.: 50mm f/2.8), sensor/câmera e plano focal sem alterar a composição.',
      estimatedGainPts: 4,
    })
  }

  if (!LUZ_PHYS_RE.test(attrs.luz.text)) {
    diagnostics.push({
      kind: 'weak_lighting_physics',
      tag: 'FÍSICA DE LUZ',
      title: 'Temperatura de cor ou direção implícita',
      detail: 'Explicitar fonte física (daylight / 5200K / direção) mantendo a atmosfera original.',
      estimatedGainPts: 4,
    })
  }

  if (!SUJ_MECH_RE.test(attrs.sujeito.text)) {
    diagnostics.push({
      kind: 'weak_subject_mechanics',
      tag: 'BIOMECÂNICA',
      title: 'Microexpressão e distribuição de peso ausentes',
      detail: 'Ancorar gaze, posture weight e microtextura natural de pele (natural pores).',
      estimatedGainPts: 4,
    })
  }

  const missingCore = (
    ['sujeito', 'cenario', 'luz', 'camera', 'textura_material', 'estilo'] as const
  ).filter((k) => !attrs[k].filled)

  if (missingCore.length > 0) {
    diagnostics.push({
      kind: 'missing_attributes',
      tag: `${missingCore.length} VAZIOS`,
      title: `Atributos incompletos: ${missingCore.join(', ')}`,
      detail: 'Completar gavetas vazias para fechar 8/8 atributos canônicos.',
      estimatedGainPts: missingCore.length * 5,
    })
  }

  return diagnostics
}

function cleanSlotText(raw: string | undefined, fallback: string, maxLen = 260): string {
  if (!raw || raw.trim().length < 4) return fallback
  const stripped = raw
    .replace(/\[3D Pose:[^\]]+\]/gi, '')
    .replace(/\bAvoid\s*:[^\n.]+/gi, '')
    .replace(/\s*\|\s*/g, '; ')
    .replace(/\s+/g, ' ')
    .trim()
  if (stripped.length <= maxLen) return stripped
  const slice = stripped.slice(0, maxLen)
  const brk = Math.max(slice.lastIndexOf(';'), slice.lastIndexOf('.'), slice.lastIndexOf(','))
  return (brk > 90 ? slice.slice(0, brk) : slice).trim()
}

function appendIfMissing(base: string, testRe: RegExp, addition: string, fixes: string[], fixLabel: string): string {
  if (testRe.test(base)) return base
  fixes.push(fixLabel)
  return base ? `${base}; ${addition}` : addition
}

export function refineImmaturePrompt(
  item: PromptItem,
  moldId: MatureMoldId,
  aspectRatio?: string
): PromptRefinementResult {
  const mold = MATURE_MOLDS.find((m) => m.id === moldId) || MATURE_MOLDS[0]
  const ar = aspectRatio || item.attributes.estrutura.aspectRatio || '3:4'
  const attrs = item.attributes
  const fixes: string[] = [`Molde consolidado ${mold.label} (${mold.skeletonReuseCount}× no acervo)`]

  let sujeito = cleanSlotText(
    attrs.sujeito.text,
    'Subject with authentic facial structure, calm poised expression and natural posture'
  )
  let cenario = cleanSlotText(
    attrs.cenario.text,
    'Quiet lived-in architectural interior environment with grounded physical depth'
  )
  let luz = cleanSlotText(
    attrs.luz.text,
    'Directional natural light with smooth tonal transition across skin and textiles'
  )
  let camera = cleanSlotText(
    attrs.camera.text,
    'Medium three-quarter framing with crisp eye-plane focus and natural perspective'
  )
  const material = cleanSlotText(
    attrs.textura_material.text,
    'Textured matte woven garments and unretouched natural skin pores with subtle fabric folds'
  )
  const estilo = cleanSlotText(
    attrs.estilo.text,
    'Tactile editorial documentary color science, subtle 35mm archival grain, zero synthetic smoothing'
  )

  sujeito = appendIfMissing(
    sujeito,
    SUJ_MECH_RE,
    'grounded posture weight with poised direct gaze, subtle FACS micro-expression and visible natural skin pores',
    fixes,
    '+ Biomecânica / FACS no Sujeito'
  )
  camera = appendIfMissing(
    camera,
    CAM_OPTICS_RE,
    'captured on Hasselblad X2D with 50mm f/2.8 prime lens, honest optical geometry',
    fixes,
    '+ Óptica 50mm f/2.8 explícita'
  )
  luz = appendIfMissing(
    luz,
    LUZ_PHYS_RE,
    'daylight balanced at 5200K with natural window directional falloff',
    fixes,
    '+ Física de luz / 5200K'
  )

  if (!attrs.estrutura.hasExplicitNegative) {
    fixes.push('+ Cláusula negativa anti-plástico')
  }

  const negativePrompt =
    'plastic airbrushed skin, waxy CGI texture, generic stock lighting, extra limbs, distorted fingers'

  let refinedPrompt = ''
  if (mold.id === 'studio_editorial_v5') {
    refinedPrompt = [
      `[IDENTITY LOCK]\n${sujeito}`,
      `[BODY MECHANICS :: BIOMECHANICS]\nNatural shoulder torsion, balanced center of gravity and unforced anatomical weight distribution.`,
      `[CLOTHING & MATERIALS]\n${material}`,
      `[ENVIRONMENT & PROPS]\n${cenario}`,
      `[LIGHTING PHYSICS]\n${luz}`,
      `[CAMERA & SENSOR TEXTURE]\n${camera}`,
      `STEP 4 — STUDIO EDITORIAL:\n${estilo}`,
      `Avoid: ${negativePrompt}. --ar ${ar}`,
    ].join('\n\n')
  } else if (mold.id === 'nano_banana_g6') {
    refinedPrompt = JSON.stringify(
      {
        visual_context: {
          primary_lineage: estilo,
          refined_from_rarity_tier: item.rarity.tier,
          aspect_ratio: ar,
        },
        subject: {
          description: sujeito,
        },
        clothing: {
          materials_and_surface: material,
        },
        background: {
          environment: cenario,
        },
        lighting: luz,
        camera: {
          lens_and_framing: camera,
        },
        color_grade: estilo,
        negative_prompt: negativePrompt,
      },
      null,
      2
    )
  } else if (mold.id === 'fdr_v3') {
    refinedPrompt = JSON.stringify(
      {
        metadata: {
          framework: 'FDR v3',
          source_project: item.project,
          aspect_ratio: ar,
        },
        rendering_directive: estilo,
        subject: {
          identity_and_pose: sujeito,
        },
        wardrobe: {
          garment_and_texture: material,
        },
        environment: {
          setting: cenario,
        },
        lighting_physics: luz,
        camera_technical: {
          optics_and_framing: camera,
        },
        negative_prompt: negativePrompt,
      },
      null,
      2
    )
  } else {
    refinedPrompt = [
      `[SHOT_TYPE] & [DEVICE]:\n${camera}`,
      `[VISUAL DESCRIPTION]:\n${sujeito}`,
      `[WARDROBE & MATERIALS]:\n${material}`,
      `[LIGHTING]:\n${luz}`,
      `[LOCATION]:\n${cenario}`,
      `[CAPTURE QUALITY]:\n${estilo}`,
      `Avoid: ${negativePrompt}. --ar ${ar}`,
    ].join('\n\n')
  }

  const afterDecomp = decomposePrompt(refinedPrompt, {
    project: item.project,
    eagleTags: item.eagleTags,
    sourceLib: item.sourceLib,
  })

  const afterMaturity = computePromptMaturity({
    attributes: afterDecomp.attributes,
    skeletonReuseCount: mold.skeletonReuseCount,
    star: item.star,
    eagleTagsCount: Math.max(item.eagleTags.length, 4),
    faceConfidence: item.poseTelemetry?.faceConfidence ?? null,
  })

  const afterQuadrant = classifyQuadrant(item.rarity.percentile, afterMaturity.score)
  const deltaMaturity = Number((afterMaturity.score - item.maturity.score).toFixed(1))

  return {
    mold,
    refinedPrompt,
    beforeMaturity: item.maturity,
    afterMaturity,
    deltaMaturity,
    beforeQuadrant: item.quadrant,
    afterQuadrant,
    beforeAttributes: item.attributes,
    afterAttributes: afterDecomp.attributes,
    injectedFixes: fixes,
  }
}
