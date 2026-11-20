import React from 'react'
import { Bookmark } from 'lucide-react'
import { LabTooltip } from './LabTooltip'

interface FavoriteToggleButtonProps {
  active: boolean
  onToggle: () => void
  size?: 'sm' | 'md'
  className?: string
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right'
}

export const FavoriteToggleButton: React.FC<FavoriteToggleButtonProps> = ({
  active,
  onToggle,
  size = 'sm',
  className = '',
  tooltipPlacement = 'top',
}) => {
  const dimClass = size === 'md' ? 'h-9 w-9' : 'h-7 w-7'
  const iconClass = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'
  const label = active ? 'Remover dos favoritos' : 'Salvar nos favoritos'

  return (
    <LabTooltip label={label} placement={tooltipPlacement}>
      <button
        type="button"
        aria-pressed={active}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className={[
          'press-scale inline-flex shrink-0 items-center justify-center rounded-full border transition-colors cursor-pointer',
          dimClass,
          active
            ? 'border-tier-s/60 bg-tier-s/20 text-tier-s'
            : 'border-hairline bg-canvas/90 text-ink-secondary hover:border-border-strong hover:text-ink',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Bookmark className={[iconClass, active ? 'fill-current' : ''].filter(Boolean).join(' ')} />
      </button>
    </LabTooltip>
  )
}
