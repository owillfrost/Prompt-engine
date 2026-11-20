import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, Plus, X } from 'lucide-react'
import { formatTagPt } from '../../core/promptTagsPt'
import type { PromptItem } from '../../types/promptEngine'
import { PromptThumb } from './PromptThumb'

interface GapsIntroModalProps {
  open: boolean
  items: PromptItem[]
  onClose: () => void
}

function pickTwoRandom34(pool: PromptItem[]): [PromptItem | null, PromptItem | null] {
  if (pool.length === 0) return [null, null]
  const preferred = pool.filter(
    (it) => it.thumbnailUrl && it.attributes?.estrutura?.aspectRatio === '3:4'
  )
  const source = preferred.length >= 2 ? preferred : pool.filter((it) => Boolean(it.thumbnailUrl))
  const list = source.length >= 2 ? source : pool
  if (list.length === 1) return [list[0], null]

  const idxA = Math.floor(Math.random() * list.length)
  let idxB = Math.floor(Math.random() * (list.length - 1))
  if (idxB >= idxA) idxB += 1
  return [list[idxA] ?? null, list[idxB] ?? null]
}

function getCaptionForItem(item: PromptItem | null, fallbackLabel: string): string {
  if (!item) return fallbackLabel
  const topTag =
    item.rarity?.rarestTags?.[0]?.tag ||
    item.attributes?.cenario?.tags?.[0] ||
    item.attributes?.luz?.tags?.[0] ||
    item.attributes?.sujeito?.tags?.[0]
  if (topTag) return formatTagPt(topTag)
  return item.title
}

export const GapsIntroModal: React.FC<GapsIntroModalProps> = ({ open, items, onClose }) => {
  const titleId = useId()
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const [samples, setSamples] = useState<[PromptItem | null, PromptItem | null]>(() => {
    const localGallery = items.filter((it) => it.project === 'Testes de Fotos')
    return localGallery.length >= 2 ? pickTwoRandom34(localGallery) : [null, null]
  })

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const randomOffset = Math.floor(Math.random() * 220)
    const params = new URLSearchParams({
      project: 'Testes de Fotos',
      sourceLib: 'all',
      limit: '120',
      offset: String(randomOffset),
    })

    fetch(`/api/prompts?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as { items?: PromptItem[] }
      })
      .then((data) => {
        const fetched = Array.isArray(data.items) ? data.items : []
        if (fetched.length >= 2) {
          setSamples(pickTwoRandom34(fetched))
          return
        }
        return fetch('/api/prompts?project=Testes%20de%20Fotos&sourceLib=all&limit=120', {
          signal: controller.signal,
        })
          .then((r) => (r.ok ? (r.json() as Promise<{ items?: PromptItem[] }>) : null))
          .then((fallbackData) => {
            if (fallbackData?.items && fallbackData.items.length >= 2) {
              setSamples(pickTwoRandom34(fallbackData.items))
            } else {
              setSamples(pickTwoRandom34(items))
            }
          })
      })
      .catch((err) => {
        if ((err as { name?: string })?.name === 'AbortError') return
        setSamples((prev) => (prev[0] || prev[1] ? prev : pickTwoRandom34(items)))
      })

    return () => controller.abort()
  }, [open, items])

  const handleClose = useCallback(() => {
    if (closing) return
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => {
      setClosing(false)
      onClose()
    }, 170)
  }, [closing, onClose])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, handleClose])

  if (!open) return null

  const [sampleA, sampleB] = samples

  return (
    <div
      data-closing={closing ? 'true' : 'false'}
      onClick={handleClose}
      className="gaps-intro-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm sm:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-closing={closing ? 'true' : 'false'}
        onClick={(e) => e.stopPropagation()}
        className="gaps-intro-panel relative w-full max-w-[920px] overflow-hidden rounded-[24px] border border-hairline bg-canvas p-6 shadow-[0_36px_90px_-24px_rgba(0,0,0,0.92)] sm:p-9 lg:p-10"
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="Fechar introdução"
          className="press-scale absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-hairline bg-white/[0.04] text-ink-tertiary transition-[border-color,color,transform] duration-150 hover:border-border-hover hover:text-ink cursor-pointer sm:top-5 sm:right-5"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] lg:gap-10">
          {/* Esquerda: Título + Parágrafo (sem subhead) + Botão */}
          <div className="min-w-0 space-y-5">
            <h2
              id={titleId}
              className="mission-stagger-1 text-[24px] font-semibold leading-[1.12] tracking-[-0.025em] text-ink sm:text-[32px]"
            >
              Descubra e combine ideias inéditas
            </h2>

            <p className="mission-stagger-2 text-[13px] leading-relaxed text-ink-tertiary sm:text-[14px]">
              Encontre cruzamentos de cenário, luz e estilo que ainda não existem juntos no acervo. Escolha uma lacuna, misture duas referências visuais e monte um novo prompt original.
            </p>

            <div className="mission-stagger-3 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="btn-primary min-h-[46px] px-6 text-[13px]"
              >
                <span>Começar</span>
                <ArrowRight className="mission-cta-arrow h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Direita: 2 Thumbnails 3:4 aleatórios de "Testes de Fotos" + conector central */}
          <div className="mission-stagger-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-4">
            <div className="flex flex-col items-center gap-2.5">
              <div className="aspect-[3/4] w-full overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_22px_44px_-18px_rgba(0,0,0,0.85)]">
                <PromptThumb
                  src={sampleA?.thumbnailUrl}
                  alt={sampleA?.title || 'Referência A'}
                  fallbackLabel="3:4"
                  loading="eager"
                />
              </div>
              <span className="max-w-full truncate font-mono text-[11px] text-ink-tertiary">
                {getCaptionForItem(sampleA, 'Referência A')}
              </span>
            </div>

            <div
              aria-hidden="true"
              className="mb-6 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-tier-s/60 bg-tier-s/15 text-tier-s shadow-[0_0_20px_color-mix(in_srgb,var(--color-tier-s)_28%,transparent)]"
            >
              <Plus className="h-4 w-4" />
            </div>

            <div className="flex flex-col items-center gap-2.5">
              <div className="aspect-[3/4] w-full overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_22px_44px_-18px_rgba(0,0,0,0.85)]">
                <PromptThumb
                  src={sampleB?.thumbnailUrl}
                  alt={sampleB?.title || 'Referência B'}
                  fallbackLabel="3:4"
                  loading="eager"
                />
              </div>
              <span className="max-w-full truncate font-mono text-[11px] text-ink-tertiary">
                {getCaptionForItem(sampleB, 'Referência B')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
