import type {
  AttributeTagStat,
  DecomposedAttributes,
  MaturityBreakdown,
  RarityBreakdown,
  RarityQuadrant,
  RarityTier,
} from '../types/promptEngine'
import { clamp } from './vectorMath'

export const TIER_THRESHOLDS: ReadonlyArray<{
  tier: RarityTier
  minPercentile: number
  label: string
  description: string
}> = [
  { tier: 'S', minPercentile: 95, label: 'Tier S', description: 'Top 5% — raro na coleção' },
  { tier: 'A', minPercentile: 80, label: 'Tier A', description: '80–94% — alta originalidade' },
  { tier: 'B', minPercentile: 50, label: 'Tier B', description: '50–79% — repertório intermediário' },
  { tier: 'C', minPercentile: 20, label: 'Tier C', description: '20–49% — padrão recorrente' },
  { tier: 'D', minPercentile: 0, label: 'Tier D', description: '0–19% — alta repetição' },
]

export const QUADRANT_META: Record<
  RarityQuadrant,
  { label: string; shortLabel: string; description: string }
> = {
  raro_maduro: {
    label: 'Raro + Maduro',
    shortLabel: 'RARO + MADURO',
    description: 'Mais valioso: pouco explorado e estruturalmente refinado.',
  },
  raro_imaturo: {
    label: 'Raro + Imaturo',
    shortLabel: 'RARO + IMATURO',
    description: 'Território virgem: ideia rara ainda pouco lapidada ou sem reuso.',
  },
  comum_maduro: {
    label: 'Comum + Maduro',
    shortLabel: 'COMUM + MADURO',
    description: 'Assinatura consolidada: molde muito refinado e frequente.',
  },
  comum_imaturo: {
    label: 'Comum + Imaturo',
    shortLabel: 'COMUM + IMATURO',
    description: 'Base de rotina: variações rápidas e comuns.',
  },
}

export function computeRarityTier(percentile: number): RarityTier {
  const p = clamp(Math.round(percentile), 1, 99)
  if (p >= 95) return 'S'
  if (p >= 80) return 'A'
  if (p >= 50) return 'B'
  if (p >= 20) return 'C'
  return 'D'
}

export function formatRarityLabel(percentile: number): string {
  const p = clamp(Math.round(percentile), 1, 99)
  return `mais raro que ${p}% da coleção`
}

export function classifyQuadrant(percentile: number, maturityScore: number): RarityQuadrant {
  const isRare = percentile >= 70
  const isMature = maturityScore >= 60
  if (isRare && isMature) return 'raro_maduro'
  if (isRare && !isMature) return 'raro_imaturo'
  if (!isRare && isMature) return 'comum_maduro'
  return 'comum_imaturo'
}

export function computeIdfWeight(corpusCount: number, corpusSize: number): number {
  const n = Math.max(1, corpusSize)
  const f = Math.max(0, corpusCount)
  return Number(Math.log2((n + 1) / (f + 1)).toFixed(3))
}

export function computePercentileFromDistribution(
  rawScore: number,
  referenceSortedScores: readonly number[]
): { percentile: number; rank: number } {
  const n = referenceSortedScores.length
  if (n === 0) return { percentile: 50, rank: 1 }

  let lo = 0
  let hi = n
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (referenceSortedScores[mid] <= rawScore) lo = mid + 1
    else hi = mid
  }
  const rank = lo
  const percentile = clamp(Math.round((rank / n) * 100), 1, 99)
  return { percentile, rank }
}

export function computePromptRarity(params: {
  tagStats: AttributeTagStat[]
  pairRarityBonus?: number
  corpusSize: number
  referenceSortedScores?: readonly number[]
}): RarityBreakdown {
  const { tagStats, pairRarityBonus = 0, corpusSize, referenceSortedScores } = params
  const sortedByRarity = [...tagStats].sort((a, b) => b.idfWeight - a.idfWeight)
  const topTags = sortedByRarity.slice(0, 8)
  const meanIdf =
    topTags.length > 0
      ? Number((topTags.reduce((acc, t) => acc + t.idfWeight, 0) / topTags.length).toFixed(3))
      : 1.5

  const rawScore = Number((meanIdf + pairRarityBonus).toFixed(3))
  const { percentile, rank } = referenceSortedScores?.length
    ? computePercentileFromDistribution(rawScore, referenceSortedScores)
    : {
        // Heurística calibrada quando avaliado fora de lote completo
        percentile: clamp(Math.round(((rawScore - 1.2) / 5.5) * 98) + 1, 1, 99),
        rank: 1,
      }

  return {
    score: rawScore,
    percentile,
    label: formatRarityLabel(percentile),
    tier: computeRarityTier(percentile),
    meanIdf,
    pairRarityBonus: Number(pairRarityBonus.toFixed(3)),
    rarestTags: sortedByRarity.slice(0, 5),
    corpusRank: rank,
    corpusSize,
  }
}

export function computePromptMaturity(params: {
  attributes: DecomposedAttributes
  skeletonReuseCount: number
  star?: number
  eagleTagsCount?: number
  faceConfidence?: number | null
}): MaturityBreakdown {
  const { attributes, skeletonReuseCount, star = 0, eagleTagsCount = 0, faceConfidence = null } = params

  // 1. Reuso e estabilidade do esqueleto/linhagem (log10 escalado até ~1500 usos)
  const reuseNorm = clamp(Math.log10(Math.max(1, skeletonReuseCount) + 1) / Math.log10(1200), 0, 1)
  const skeletonReuseScore = Number((reuseNorm * 100).toFixed(1))

  // 2. Completude nos 8 atributos (desconsiderando projeto vazio de bônus único)
  const coreKeys = ['sujeito', 'cenario', 'luz', 'camera', 'textura_material', 'estilo'] as const
  const coreFilled = coreKeys.filter((k) => attributes[k].filled).length
  const totalFilled = attributes.estrutura.filledAttributesCount
  const completenessScore = Number(
    (clamp((coreFilled / coreKeys.length) * 0.75 + (totalFilled / 8) * 0.25, 0, 1) * 100).toFixed(1)
  )

  // 3. Precisão técnica (óptica/lente explícita, física de luz, FACS/biomecânica, negativo explícito)
  const camText = attributes.camera.text.toLowerCase()
  const luzText = attributes.luz.text.toLowerCase()
  const sujText = attributes.sujeito.text.toLowerCase()
  let techSignals = 0
  if (/\b(\d{2,3}mm|f\/\d|iphone|canon|sony|hasselblad|leica|fujifilm|35mm|85mm)\b/.test(camText)) techSignals += 1
  if (/\b(kelvin|\d{4}k|flash|softbox|strobe|window|chiaroscuro|backlight|daylight|sunlight|luz)\b/.test(luzText)) techSignals += 1
  if (/\b(facs|pores|poros|weight|pelvis|torso|shoulder|ombro|olhar|gaze|expression|pose)\b/.test(sujText)) techSignals += 1
  if (attributes.estrutura.hasExplicitNegative) techSignals += 1
  if (attributes.estrutura.tokenCount >= 90) techSignals += 0.5
  const technicalPrecisionScore = Number((clamp(techSignals / 4.5, 0, 1) * 100).toFixed(1))

  // 4. Curadoria acumulada (tags no Eagle, estrelas, confiança facial)
  let curationRaw = clamp(eagleTagsCount / 14, 0, 0.55) + clamp(star / 5, 0, 0.3)
  if (faceConfidence !== null && faceConfidence >= 80) curationRaw += 0.15
  else if (attributes.projeto_cliente.filled && attributes.projeto_cliente.text !== 'Sem Projeto') curationRaw += 0.12
  const curationScore = Number((clamp(curationRaw, 0, 1) * 100).toFixed(1))

  const score = Number(
    clamp(
      0.34 * skeletonReuseScore +
        0.36 * completenessScore +
        0.18 * technicalPrecisionScore +
        0.12 * curationScore,
      0,
      100
    ).toFixed(1)
  )

  return {
    score,
    skeletonReuseCount,
    skeletonReuseScore,
    completenessScore,
    technicalPrecisionScore,
    curationScore,
  }
}
