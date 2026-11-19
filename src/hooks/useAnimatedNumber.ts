import { useEffect, useRef, useState } from 'react'

interface UseAnimatedNumberOptions {
  durationMs?: number
  decimals?: number
  enabled?: boolean
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Anima um número com curva ease-out forte (1 - (1 - t)^3) via requestAnimationFrame.
 * Respeita `prefers-reduced-motion: reduce` retornando o valor final imediatamente.
 */
export function useAnimatedNumber(
  target: number,
  options: UseAnimatedNumberOptions = {}
): number {
  const { durationMs = 360, decimals = 0, enabled = true } = options
  const [value, setValue] = useState<number>(() =>
    !enabled || prefersReducedMotion() ? target : 0
  )
  const prevTargetRef = useRef<number>(!enabled || prefersReducedMotion() ? target : 0)

  useEffect(() => {
    if (!enabled || prefersReducedMotion()) {
      setValue(target)
      prevTargetRef.current = target
      return
    }

    const from = 0
    const start = performance.now()
    let rafId = 0
    const factor = Math.pow(10, decimals)

    const tick = (now: number) => {
      const elapsed = now - start
      const t = Math.min(1, elapsed / Math.max(1, durationMs))
      // Strong ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      const current = from + (target - from) * eased
      const rounded = Math.round(current * factor) / factor
      setValue(rounded)

      if (t < 1) {
        rafId = window.requestAnimationFrame(tick)
      } else {
        setValue(target)
        prevTargetRef.current = target
      }
    }

    rafId = window.requestAnimationFrame(tick)
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId)
    }
  }, [target, durationMs, decimals, enabled])

  return value
}
