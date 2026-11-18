// Adaptado de B:\AntiGravity\noiser-reconizer\src\core\vectorMath.ts

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

export function l2Normalize(vec: ArrayLike<number>, dim = vec.length): Float32Array {
  const out = new Float32Array(dim)
  let sumSq = 0
  for (let i = 0; i < dim; i++) {
    const v = vec[i] || 0
    out[i] = v
    sumSq += v * v
  }
  const inv = sumSq > 0 ? 1 / Math.sqrt(sumSq) : 0
  if (inv > 0) {
    for (let i = 0; i < dim; i++) {
      out[i] *= inv
    }
  }
  return out
}

export function dotProduct(
  a: ArrayLike<number>,
  offsetA: number,
  b: ArrayLike<number>,
  offsetB: number,
  dim: number
): number {
  let dot = 0
  for (let d = 0; d < dim; d++) {
    dot += a[offsetA + d] * b[offsetB + d]
  }
  return dot
}

export function cosineSimilarityTyped(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  zeroMatchesZero = false
): number {
  const dim = Math.min(a.length, b.length)
  if (dim === 0) return 0

  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < dim; i++) {
    const va = a[i]
    const vb = b[i]
    dot += va * vb
    normA += va * va
    normB += vb * vb
  }

  if (normA === 0 && normB === 0) return zeroMatchesZero ? 1 : 0
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length
  if (n === 0) return 0
  const idx = clamp(q, 0, 1) * (n - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  const t = idx - lo
  return lo === hi ? sorted[lo] : sorted[lo] * (1 - t) + sorted[hi] * t
}
