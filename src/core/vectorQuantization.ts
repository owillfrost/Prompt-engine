// Reaproveitado de C:\Users\conta\Documents\antigravity\calm-brahmagupta\src\core\vectorQuantization.ts

export function quantizeNormalizedFloat32ToInt8(
  floatArr: Float32Array | number[] | ArrayLike<number>,
  dim = 512
): Int8Array {
  let norm = 0
  for (let i = 0; i < floatArr.length; i++) {
    norm += floatArr[i] * floatArr[i]
  }
  norm = Math.sqrt(norm) || 1

  let maxAbs = 0
  for (let i = 0; i < floatArr.length; i++) {
    const v = Math.abs(floatArr[i] / norm)
    if (v > maxAbs) maxAbs = v
  }
  const scale = maxAbs > 0 ? 127 / maxAbs : 127

  const out = new Int8Array(dim)
  for (let i = 0; i < dim; i++) {
    const v = ((floatArr[i] || 0) / norm) * scale
    out[i] = Math.max(-127, Math.min(127, Math.round(v)))
  }
  return out
}

export function computeQuantizedCosine(
  vecs: Int8Array,
  dim: number,
  rowA: number,
  rowB: number,
  invNorms?: Float32Array | null
): number {
  if (dim <= 0) return 0
  const offsetA = rowA * dim
  const offsetB = rowB * dim

  if (!invNorms) {
    let dot = 0
    let normA = 0
    let normB = 0
    for (let d = 0; d < dim; d++) {
      const a = vecs[offsetA + d]
      const b = vecs[offsetB + d]
      dot += a * b
      normA += a * a
      normB += b * b
    }
    if (normA === 0 || normB === 0) return 0
    return dot / Math.sqrt(normA * normB)
  }

  let dot = 0
  for (let d = 0; d < dim; d++) {
    dot += vecs[offsetA + d] * vecs[offsetB + d]
  }
  return dot * (invNorms[rowA] ?? 0) * (invNorms[rowB] ?? 0)
}
