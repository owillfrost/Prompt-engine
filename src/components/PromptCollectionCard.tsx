import React from 'react'
import { QUADRANT_META } from '../core/rarityEngine'
import type { PromptItem } from '../types/promptEngine'

interface PromptCollectionCardProps {
  item: PromptItem
  selected: boolean
  onSelect: (item: PromptItem) => void
}

const FORMAT_LABELS: Record<PromptItem['attributes']['estrutura']['macroFormat'], string> = {
  json: 'JSON',
  sections: 'SEÇÕES',
  single_paragraph: 'PARÁGRAFO',
}

export const PromptCollectionCard: React.FC<PromptCollectionCardProps> = ({
  item,
  selected,
  onSelect,
}) => {
  const isTopRarity = item.rarity.tier === 'S'
  const { estrutura } = item.attributes
  const quadMeta = QUADRANT_META[item.quadrant]

  const attrDots: Array<{ label: string; filled: boolean }> = [
    { label: 'SUJ', filled: item.attributes.sujeito.filled },
    { label: 'CEN', filled: item.attributes.cenario.filled },
    { label: 'LUZ', filled: item.attributes.luz.filled },
    { label: 'CAM', filled: item.attributes.camera.filled },
    { label: 'MAT', filled: item.attributes.textura_material.filled },
    { label: 'EST', filled: item.attributes.estilo.filled },
    { label: 'PRJ', filled: item.attributes.projeto_cliente.filled },
    { label: 'STR', filled: item.attributes.estrutura.filled },
  ]

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={[
        'group flex flex-col overflow-hidden rounded-2xl border bg-[#101013] text-left transition-all duration-150 cursor-pointer',
        selected
          ? 'border-white/30 bg-[#141418]'
          : isTopRarity
            ? 'border-[#e5a93c]/35 hover:border-[#e5a93c]/65'
            : 'border-white/[0.07] hover:border-white/[0.18]',
      ].join(' ')}
    >
      {/* Miniatura real — única fonte de cor na interface */}
      <div className="relative aspect-[4/3] w-full overflow-hidden border-b border-white/[0.06] bg-[#0a0a0d]">
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt={item.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[11px] text-zinc-600">
            Sem miniatura
          </div>
        )}

        {/* Badges sóbrios sobrepostos apenas com fundo escuro neutro */}
        <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-center justify-between gap-2">
          <span className="tabular-mono rounded-full border border-white/10 bg-black/75 px-2 py-0.5 text-[10px] text-zinc-300 backdrop-blur-sm">
            {FORMAT_LABELS[estrutura.macroFormat]} · {estrutura.kernelDialect}
          </span>
          <span
            className={[
              'tabular-mono rounded-full border px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm',
              isTopRarity
                ? 'border-[#e5a93c]/60 bg-black/85 text-[#e5a93c]'
                : 'border-white/10 bg-black/75 text-zinc-300',
            ].join(' ')}
          >
            TIER {item.rarity.tier}
          </span>
        </div>
      </div>

      {/* Corpo denso */}
      <div className="flex flex-1 flex-col justify-between gap-3 p-3.5">
        <div className="flex flex-col gap-2">
          {/* Título + Projeto */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[13px] font-medium text-zinc-100" title={item.title}>
                {item.title}
              </h3>
              <p className="truncate text-[11px] text-zinc-500" title={item.project}>
                {item.project}
              </p>
            </div>
            <span className="tabular-mono shrink-0 text-[10px] text-zinc-500">
              {estrutura.filledAttributesCount}/8
            </span>
          </div>

          {/* Trecho do prompt em monoespaçada */}
          <p className="line-clamp-3 rounded-xl border border-white/[0.05] bg-[#0b0b0e] p-2.5 font-mono text-[11px] leading-relaxed text-zinc-300">
            {item.excerpt}
          </p>
        </div>

        {/* Rodapé: cobertura dos 8 atributos + linha de raridade/tier */}
        <div className="flex flex-col gap-2 border-t border-white/[0.06] pt-2.5">
          {/* Micro-matriz de 8 atributos */}
          <div className="flex flex-wrap items-center gap-1">
            {attrDots.map((dot) => (
              <span
                key={dot.label}
                className={[
                  'tabular-mono rounded px-1.5 py-0.5 text-[9px] border',
                  dot.filled
                    ? 'border-white/[0.08] bg-white/[0.04] text-zinc-300'
                    : 'border-white/[0.03] bg-transparent text-zinc-600',
                ].join(' ')}
              >
                {dot.label}
              </span>
            ))}
          </div>

          {/* Linha obrigatória de raridade em monoespaçada + maturidade */}
          <div className="flex items-center justify-between gap-2">
            <span
              className={[
                'tabular-mono text-[11px]',
                isTopRarity ? 'text-[#e5a93c]' : 'text-zinc-300',
              ].join(' ')}
            >
              {item.rarity.label}
            </span>
            <span className="tabular-mono shrink-0 text-[10px] text-zinc-500" title={quadMeta.description}>
              MAT {Math.round(item.maturity.score)}
            </span>
          </div>

          <div className="flex items-center justify-between text-[10px]">
            <span className="tabular-mono uppercase tracking-wider text-zinc-500">
              {quadMeta.shortLabel}
            </span>
            <span className="tabular-mono text-zinc-600">
              {estrutura.tokenCount} tok
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}
