import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { decomposePrompt } from '../../core/promptDecomposer'
import { TIER_THRESHOLDS } from '../../core/rarityEngine'
import { ATTRIBUTE_META, type CorpusOverviewStats } from '../../types/promptEngine'

interface SchemaProposalModalProps {
  open: boolean
  stats: CorpusOverviewStats | null
  onClose: () => void
}

const SAMPLE_PARSER_PRESETS: ReadonlyArray<{ label: string; text: string }> = [
  {
    label: 'JSON (Nano Banana)',
    text: `{\n  "subject": { "description": "Young woman with freckles and messy bun", "pose": "Seated sideways, counter-rotation over shoulder" },\n  "camera": { "model": "Hasselblad X2D", "lens": "85mm f/2.8", "framing": "tight 3/4 profile" },\n  "lighting": "Window daylight soft directional shadows",\n  "environment": "Brutalist concrete gallery with travertine bench",\n  "color_grade": { "lineage": "Editorial de moda controlado" }\n}`,
  },
  {
    label: 'Seções (FDR Direct)',
    text: `[SHOT_TYPE] & [DEVICE]:\nlow-angle 24mm captured on iPhone 15 Pro rear camera\n[VISUAL DESCRIPTION]:\nA woman wearing an oversized raw linen blazer leaning against concrete stairs.\n[LIGHTING]:\nharsh midday sunlight with crisp architectural shadows\n[LOCATION]:\nSão Paulo brutalist stairwell`,
  },
  {
    label: 'Parágrafo Único',
    text: `Candid 35mm film photograph of a cyclist in matte black technical nylon jacket resting beside a dark coastal cafe at dusk, cool sodium-vapor light mixing with overcast twilight, subtle archival grain.`,
  },
]

export const SchemaProposalModal: React.FC<SchemaProposalModalProps> = ({
  open,
  stats,
  onClose,
}) => {
  const [sandboxText, setSandboxText] = useState(SAMPLE_PARSER_PRESETS[0].text)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const liveResult = decomposePrompt(sandboxText)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs" onClick={onClose}>
      <div
        className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-hairline bg-surface"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Proposta de Modelo de Dados e Esquema de Atributos"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div>
            <span className="section-eyebrow">Arquitetura · Primeira Entrega</span>
            <h2 className="mt-0.5 text-[16px] font-medium text-ink">
              Modelo de Dados, Esquema de 8 Atributos, Raridade & Definição de Gap
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-hairline p-2 text-ink-tertiary hover:border-border-hover hover:text-ink cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {/* 8 Atributos */}
          <section className="space-y-2.5">
            <span className="section-eyebrow">1. Esquema Canônico dos 8 Atributos</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ATTRIBUTE_META.map((attr) => (
                <div
                  key={attr.key}
                  className="rounded-xl border border-border-subtle bg-elevated p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="tabular-mono rounded border border-hairline px-1.5 py-0.5 text-[10px] text-ink-tertiary">
                      {attr.shortLabel}
                    </span>
                    <span className="text-[12px] font-medium text-ink-secondary">{attr.label}</span>
                    <span className="tabular-mono text-[10px] text-ink-muted">({attr.key})</span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-ink-tertiary">
                    {attr.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Tiers & Eixos */}
          <section className="space-y-2.5">
            <span className="section-eyebrow">2. Eixos Raridade × Maturidade &amp; Tiers S a D</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {TIER_THRESHOLDS.map((t) => {
                const isS = t.tier === 'S'
                return (
                  <div
                    key={t.tier}
                    className={[
                      'rounded-xl border p-2.5',
                      isS
                        ? 'border-tier-s/35 bg-tier-s/[0.04]'
                        : 'border-border-subtle bg-elevated',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={[
                          'tabular-mono text-[12px] font-medium',
                          isS ? 'text-tier-s' : 'text-ink-secondary',
                        ].join(' ')}
                      >
                        {t.label}
                      </span>
                      <span className="tabular-mono text-[10px] text-ink-muted">
                        P≥{t.minPercentile}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] leading-snug text-ink-tertiary">{t.description}</p>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Gaps Empíricos Preview */}
          <section className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="section-eyebrow">
                3. Definição Formal de Gap (O = 0, Coerência = 1)
              </span>
              <span className="tabular-mono text-[10px] text-ink-muted">
                {stats?.primaryLibraryName ?? 'Google Flow + Prompts.library'} (N=
                {stats?.totalCorpusSize?.toLocaleString('pt-BR') ?? 'n/d'})
              </span>
            </div>
            <div className="rounded-xl border border-border-subtle bg-elevated p-3.5 text-[11px] leading-relaxed text-ink-secondary">
              <p>
                Um <strong className="text-ink">Gap</strong> é uma combinação plausível de dois ou mais atributos
                com <span className="font-mono text-ink">ocorrência = 0</span> na matriz empírica, onde ambos os
                ingredientes aparecem com frequência real (<span className="font-mono">freq ≥ 15</span> na biblioteca) e
                passam pela checagem de coerência física.
              </p>
              {stats && stats.sampleGapPreviews.length > 0 ? (
                <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {stats.sampleGapPreviews.slice(0, 4).map((g) => (
                    <div
                      key={`${g.axisA}:${g.tagA}-${g.axisB}:${g.tagB}`}
                      className="flex items-center justify-between rounded-lg border border-border-subtle bg-canvas px-2.5 py-1.5 font-mono text-[10px] text-ink-secondary"
                    >
                      <span className="truncate">
                        {g.tagA} ({g.freqA}) × {g.tagB} ({g.freqB})
                      </span>
                      <span className="shrink-0 text-ink-muted">O=0 · E={g.expectedCount}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          {/* Sandbox Parser Multi-Formato */}
          <section className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="section-eyebrow">4. Testador ao Vivo do Parser Multi-Formato</span>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_PARSER_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setSandboxText(preset.text)}
                    className="rounded-lg border border-hairline bg-elevated px-2 py-1 text-[10px] text-ink-secondary hover:border-border-hover cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <textarea
                value={sandboxText}
                onChange={(e) => setSandboxText(e.target.value)}
                rows={8}
                className="w-full rounded-xl border border-hairline bg-canvas p-3 font-mono text-[11px] leading-relaxed text-ink-secondary focus:border-border-hover focus:outline-none"
                placeholder="Cole um prompt em JSON, Seções ou Parágrafo Único..."
              />
              <div className="space-y-1.5 rounded-xl border border-hairline bg-canvas p-3">
                <div className="flex items-center justify-between border-b border-border-subtle pb-1.5 font-mono text-[10px] text-ink-tertiary">
                  <span>
                    {liveResult.attributes.estrutura.macroFormat.toUpperCase()} ·{' '}
                    {liveResult.attributes.estrutura.kernelDialect}
                  </span>
                  <span>{liveResult.attributes.estrutura.filledAttributesCount}/8 atributos</span>
                </div>
                <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                  {ATTRIBUTE_META.map((m) => {
                    const slot = liveResult.attributes[m.key]
                    return (
                      <div key={m.key} className="text-[10px]">
                        <span className="tabular-mono text-ink-muted">{m.shortLabel}: </span>
                        <span className="font-mono text-ink-secondary">
                          {slot.text ? slot.text.slice(0, 120) : 'n/d'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
