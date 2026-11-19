import React from 'react'

interface CartographerRankMarkProps {
  roman: string
  title?: string
}

/**
 * Emblema geométrico cartográfico (losango + aro hairline com numeral romano).
 * Sem ícones de jogo (troféu, estrela, medalha).
 */
export const CartographerRankMark: React.FC<CartographerRankMarkProps> = ({ roman, title }) => {
  return (
    <span
      className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center"
      title={title ? `Patente: ${title}` : `Cartógrafo ${roman}`}
      aria-label={title ? `Cartógrafo ${roman}: ${title}` : `Cartógrafo ${roman}`}
    >
      <span
        className="absolute inset-0.5 rotate-45 rounded-[3px] border border-[#e8b84b]/65 bg-[#e8b84b]/10"
        aria-hidden="true"
      />
      <span className="tabular-mono relative z-10 text-[9px] font-semibold tracking-tight text-[#e8b84b]">
        {roman}
      </span>
    </span>
  )
}
