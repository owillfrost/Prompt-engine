import React, { useEffect, useRef, useState } from 'react'

// Janela global de skip-delay para tooltips consecutivos (padrão emil-design-eng)
let lastTooltipActiveAt = 0
const SKIP_WINDOW_MS = 450
const INITIAL_DELAY_MS = 320

interface LabTooltipProps {
  label: string
  placement?: 'top' | 'bottom' | 'right' | 'left'
  children: React.ReactElement
  className?: string
}

export const LabTooltip: React.FC<LabTooltipProps> = ({
  label,
  placement = 'bottom',
  children,
  className = '',
}) => {
  const [open, setOpen] = useState(false)
  const [instant, setInstant] = useState(false)
  const [starting, setStarting] = useState(false)
  const timerRef = useRef<number | null>(null)

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => clearTimer, [])

  const show = () => {
    clearTimer()
    const withinSkipWindow = Date.now() - lastTooltipActiveAt < SKIP_WINDOW_MS
    if (withinSkipWindow) {
      setInstant(true)
      setStarting(false)
      setOpen(true)
      lastTooltipActiveAt = Date.now()
      return
    }
    setInstant(false)
    timerRef.current = window.setTimeout(() => {
      setStarting(true)
      setOpen(true)
      lastTooltipActiveAt = Date.now()
      requestAnimationFrame(() => setStarting(false))
    }, INITIAL_DELAY_MS)
  }

  const hide = () => {
    clearTimer()
    if (open) {
      lastTooltipActiveAt = Date.now()
    }
    setOpen(false)
  }

  const posClass =
    placement === 'top'
      ? 'bottom-full left-1/2 -translate-x-1/2 mb-1.5'
      : placement === 'right'
        ? 'left-full top-1/2 -translate-y-1/2 ml-2'
        : placement === 'left'
          ? 'right-full top-1/2 -translate-y-1/2 mr-2'
          : 'top-full left-1/2 -translate-x-1/2 mt-1.5'

  const origin =
    placement === 'top'
      ? 'bottom center'
      : placement === 'right'
        ? 'left center'
        : placement === 'left'
          ? 'right center'
          : 'top center'

  return (
    <span
      className={['relative inline-flex', className].filter(Boolean).join(' ')}
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open ? (
        <span
          role="tooltip"
          data-instant={instant ? 'true' : 'false'}
          data-starting-style={starting ? 'true' : undefined}
          style={{ ['--transform-origin' as string]: origin }}
          className={[
            'lab-tooltip pointer-events-none absolute z-50 whitespace-nowrap rounded-lg border border-hairline bg-elevated/95 px-2 py-1 font-mono text-[10px] text-ink-secondary shadow-lg backdrop-blur-md',
            posClass,
          ].join(' ')}
        >
          {label}
        </span>
      ) : null}
    </span>
  )
}
