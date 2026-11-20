import React from 'react'

interface CartographerRankMarkProps {
  roman: string
  title?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Emblema geométrico cartográfico (losango + aro hairline com numeral romano).
 * Sem ícones de jogo (troféu, estrela, medalha).
 */
export const CartographerRankMark: React.FC<CartographerRankMarkProps> = ({
  roman,
  title,
  size = 'md',
}) => {
  if (size === 'lg') {
    return (
      <span
        className="relative inline-flex h-16 w-16 shrink-0 items-center justify-center"
        title={title ? `Patente: ${title}` : `Cartógrafo ${roman}`}
        aria-label={title ? `Cartógrafo ${roman}: ${title}` : `Cartógrafo ${roman}`}
      >
        <span
          className="absolute inset-0 rounded-full border border-tier-s/35 bg-tier-s/[0.03]"
          aria-hidden="true"
        />
        <span
          className="absolute inset-2 rotate-45 rounded-[8px] border border-tier-s/60 bg-tier-s/10"
          aria-hidden="true"
        />
        <span className="tabular-mono relative z-10 text-[20px] font-medium tracking-tight text-tier-s">
          {roman}
        </span>
      </span>
    )
  }

  if (size === 'sm') {
    return (
      <span
        className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center"
        title={title ? `Patente: ${title}` : `Cartógrafo ${roman}`}
        aria-hidden="true"
      >
        <span className="absolute inset-0 rotate-45 rounded-[2px] border border-tier-s/60 bg-tier-s/10" />
        <span className="tabular-mono relative z-10 text-[9px] font-semibold leading-none tracking-tight text-tier-s">
          {roman}
        </span>
      </span>
    )
  }

  return (
    <span
      className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center"
      title={title ? `Patente: ${title}` : `Cartógrafo ${roman}`}
      aria-label={title ? `Cartógrafo ${roman}: ${title}` : `Cartógrafo ${roman}`}
    >
      <span
        className="absolute inset-0.5 rotate-45 rounded-[3px] border border-tier-s/60 bg-tier-s/10"
        aria-hidden="true"
      />
      <span className="tabular-mono relative z-10 text-[9px] font-semibold tracking-tight text-tier-s">
        {roman}
      </span>
    </span>
  )
}
