// Reaproveitado de B:\AntiGravity\noiser-reconizer\src\hooks\useCopyFeedback.ts

import { useCallback, useEffect, useRef, useState } from 'react'

export function useCopyFeedback(resetMs = 1500) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  const copyText = useCallback(
    async (text: string, key = 'default') => {
      if (!text) return
      try {
        await navigator.clipboard.writeText(text)
        setCopiedKey(key)
        if (timerRef.current !== null) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => {
          setCopiedKey(null)
          timerRef.current = null
        }, resetMs)
      } catch {
        // Ignore clipboard errors in non-secure environments
      }
    },
    [resetMs]
  )

  return { copiedKey, copyText }
}
