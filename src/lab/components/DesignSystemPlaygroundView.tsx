import React, { useMemo, useState } from 'react'
import { Check, Copy, Grid, Layers, Moon, Palette, Sliders, Sun, Type } from 'lucide-react'
import { buildSaveeCssTokensSpecimen } from '../utils/motion'
import { getLabPaletteBundle, useLabPaletteId } from '../utils/themeTokens'

type PlaygroundTab = 'tokens' | 'typography' | 'components' | 'masonry'

export const DesignSystemPlaygroundView: React.FC = () => {
  const paletteId = useLabPaletteId()
  const bundle = useMemo(() => getLabPaletteBundle(paletteId), [paletteId])

  const [activeTab, setActiveTab] = useState<PlaygroundTab>('tokens')
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light')
  const [cornerRadius, setCornerRadius] = useState<number>(12)
  const [gridGap, setGridGap] = useState<number>(16)
  const [columns, setColumns] = useState<number>(5)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const handleCopy = (key: string, value: string) => {
    navigator.clipboard.writeText(value)
    setCopiedKey(key)
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev))
    }, 1400)
  }

  const exportedCss = useMemo(
    () => buildSaveeCssTokensSpecimen(cornerRadius, gridGap, paletteId),
    [cornerRadius, gridGap, paletteId]
  )

  const isLight = previewTheme === 'light'
  const palette = isLight ? bundle.playgroundThemes.light : bundle.playgroundThemes.dark

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-16">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-ink-tertiary">
            <Layers className="h-3.5 w-3.5 text-brand-2" />
            <span>Reverse Engineered · savee.com</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            Design System Playground
          </h1>
          <p className="mt-1 text-sm text-ink-tertiary">
            Tokens, escala tipográfica, botões pill e grid masonry extraídos da interface do Savee.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            className="inline-flex items-center gap-2 rounded-full border border-hairline bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-ink-secondary transition-colors hover:border-border-hover hover:bg-white/[0.08] cursor-pointer"
          >
            {isLight ? (
              <Sun className="h-3.5 w-3.5 text-warning" />
            ) : (
              <Moon className="h-3.5 w-3.5 text-brand-2" />
            )}
            <span>Preview: {isLight ? bundle.playgroundMeta.lightLabel : bundle.playgroundMeta.darkLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => handleCopy('css-export', exportedCss)}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-brand/90 cursor-pointer"
          >
            {copiedKey === 'css-export' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedKey === 'css-export' ? 'CSS Copiado!' : 'Copiar CSS Tokens'}</span>
          </button>
        </div>
      </div>

      {/* Tabs + Live Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-hairline bg-surface p-1">
          {[
            { id: 'tokens', label: 'Cores & Tokens', icon: Palette },
            { id: 'typography', label: 'Tipografia', icon: Type },
            { id: 'components', label: 'Botões & Navbar', icon: Sliders },
            { id: 'masonry', label: 'Masonry Grid', icon: Grid },
          ].map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as PlaygroundTab)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer',
                  active
                    ? 'bg-ink text-canvas'
                    : 'text-ink-tertiary hover:text-ink-secondary',
                ].join(' ')}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Live Sliders */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-hairline bg-surface px-4 py-2 text-xs text-ink-secondary">
          <label className="flex items-center gap-2">
            <span className="text-ink-tertiary">Radius:</span>
            <input
              type="range"
              min={0}
              max={24}
              value={cornerRadius}
              onChange={(e) => setCornerRadius(Number(e.target.value))}
              className="w-20 accent-brand"
            />
            <span className="tabular-mono w-9 text-right text-ink-secondary">{cornerRadius}px</span>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-ink-tertiary">Gap:</span>
            <input
              type="range"
              min={8}
              max={28}
              step={4}
              value={gridGap}
              onChange={(e) => setGridGap(Number(e.target.value))}
              className="w-20 accent-brand"
            />
            <span className="tabular-mono w-9 text-right text-ink-secondary">{gridGap}px</span>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-ink-tertiary">Cols:</span>
            <select
              value={columns}
              onChange={(e) => setColumns(Number(e.target.value))}
              className="rounded-md border border-hairline bg-elevated px-2 py-0.5 text-xs text-ink-secondary"
            >
              {[2, 3, 4, 5].map((c) => (
                <option key={c} value={c}>
                  {c} cols
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Preview Stage */}
      <div
        className="rounded-2xl border p-6 transition-colors [transition-duration:var(--dur-base)]"
        style={{ backgroundColor: palette.surfaceBg, color: palette.inkColor, borderColor: palette.borderCol }}
      >
        {activeTab === 'tokens' && (
          <div className="flex flex-col gap-8">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: palette.mutedInk }}>
                Semantic &amp; Brand Tokens
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {bundle.semanticSwatches.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => handleCopy(s.name, s.hex)}
                    className="group flex flex-col overflow-hidden rounded-xl border text-left transition-colors hover:opacity-90 cursor-pointer"
                    style={{ backgroundColor: palette.cardBg, borderColor: palette.borderCol }}
                  >
                    <div className="h-14 w-full" style={{ backgroundColor: s.hex }} />
                    <div className="flex items-center justify-between p-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium" style={{ color: palette.inkColor }}>
                          {s.name}
                        </div>
                        <div className="truncate font-mono text-[10px]" style={{ color: palette.mutedInk }}>
                          {copiedKey === s.name ? 'Copiado!' : `${s.hex} (${s.token})`}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: palette.mutedInk }}>
                Base Gray Scale (50 a 950)
              </h2>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6 md:grid-cols-11">
                {bundle.grayScale.map((g) => (
                  <button
                    key={g.name}
                    type="button"
                    onClick={() => handleCopy(g.name, g.hex)}
                    className="flex flex-col overflow-hidden rounded-lg border text-left transition-colors hover:opacity-90 cursor-pointer"
                    style={{ backgroundColor: palette.cardBg, borderColor: palette.borderCol }}
                  >
                    <div className="h-10 w-full" style={{ backgroundColor: g.hex }} />
                    <div className="p-1.5">
                      <div className="text-[10px] font-medium" style={{ color: palette.inkColor }}>
                        {g.name.replace('Gray ', '')}
                      </div>
                      <div className="font-mono text-[9px]" style={{ color: palette.mutedInk }}>
                        {copiedKey === g.name ? 'OK!' : g.hex}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'typography' && (
          <div className="flex flex-col gap-6">
            <div className="border-b pb-5" style={{ borderColor: palette.borderCol }}>
              <span className="font-mono text-[11px]" style={{ color: palette.mutedInk }}>
                h1: clamp(2.85rem, 6.65vw, 8.1rem), weight 500, tracking -0.035em, lh 1
              </span>
              <div className="mt-2 text-4xl font-medium leading-none tracking-[-0.035em] sm:text-6xl">
                The best place to save and share inspiration
              </div>
            </div>

            <div className="border-b pb-5" style={{ borderColor: palette.borderCol }}>
              <span className="font-mono text-[11px]" style={{ color: palette.mutedInk }}>
                h2: clamp(2.25rem, 4.5vw, 4.5rem), weight 500, tracking -0.025em, lh 1.05
              </span>
              <div className="mt-2 text-3xl font-medium leading-[1.05] tracking-tight sm:text-4xl">
                References curated by designers,{' '}
                <span style={{ color: palette.subColor }}>sorted into boards.</span>
              </div>
            </div>

            <div className="border-b pb-5" style={{ borderColor: palette.borderCol }}>
              <span className="font-mono text-[11px]" style={{ color: palette.mutedInk }}>
                h3: 21px (1.3125rem), weight 500, tracking -0.63px, lh 27/21
              </span>
              <div className="mt-2 text-[21px] font-medium leading-[1.286] tracking-[-0.63px]">
                Savee Design System Specimen
              </div>
            </div>

            <div>
              <span className="font-mono text-[11px]" style={{ color: palette.mutedInk }}>
                body: 16px (1rem), weight 400, tracking -0.16px, lh 1.375
              </span>
              <p className="mt-2 max-w-2xl text-base leading-[1.375] tracking-[-0.16px]" style={{ color: palette.mutedInk }}>
                Savee usa uma hierarquia editorial limpa com peso médio (500) para títulos e
                contraste calibrado {bundle.playgroundMeta.contrastCopy}.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'components' && (
          <div className="flex flex-col gap-8">
            {/* Navbar Specimen */}
            <div>
              <span className="font-mono text-[11px]" style={{ color: palette.mutedInk }}>
                Navbar: height 64px, transparent, gap 24px
              </span>
              <div
                className="mt-2 flex h-16 items-center justify-between rounded-xl border px-5"
                style={{ borderColor: palette.borderCol, backgroundColor: palette.cardBg }}
              >
                <div className="flex items-center gap-8">
                  <span className="text-base font-semibold tracking-tight">SAVEE</span>
                  <div className="hidden items-center gap-6 text-base font-medium sm:flex" style={{ color: palette.mutedInk }}>
                    <span>Features</span>
                    <span>Teams</span>
                    <span>Pricing</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full px-5 py-3 text-sm font-normal transition-opacity hover:opacity-80 cursor-pointer"
                    style={{ color: palette.mutedInk }}
                  >
                    Log in
                  </button>
                  <button
                    type="button"
                    className="rounded-full px-5 py-3 text-sm font-medium transition-opacity hover:opacity-85 cursor-pointer"
                    style={{
                      backgroundColor: palette.ctaBg,
                      color: palette.ctaInk,
                    }}
                  >
                    Join for free
                  </button>
                </div>
              </div>
            </div>

            {/* Hero Pill Buttons */}
            <div>
              <span className="font-mono text-[11px]" style={{ color: palette.mutedInk }}>
                Hero CTAs: rounded-full, height 56px, padding 20px 40px
              </span>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="h-14 rounded-full px-10 text-base font-medium tracking-[-0.01em] transition-opacity hover:opacity-85 cursor-pointer"
                  style={{
                    backgroundColor: palette.ctaBg,
                    color: palette.ctaInk,
                  }}
                >
                  Join for free
                </button>
                <button
                  type="button"
                  className="h-14 rounded-full px-10 text-base font-normal tracking-[-0.01em] transition-opacity hover:opacity-90 cursor-pointer"
                  style={{
                    backgroundColor: palette.secondaryBg,
                    color: palette.secondaryInk,
                  }}
                >
                  See plans
                </button>
                <button
                  type="button"
                  className="h-14 rounded-full bg-brand px-10 text-base font-medium tracking-[-0.01em] text-ink transition-colors hover:bg-brand/90 cursor-pointer"
                >
                  Brand Accent
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'masonry' && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px]" style={{ color: palette.mutedInk }}>
                Masonry Grid: {columns} cols, gap {gridGap}px, radius {cornerRadius}px, stagger col 2 &amp; 4
              </span>
            </div>

            <div
              className="grid items-start"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: `${gridGap}px`,
              }}
            >
              {bundle.masonryColumns.slice(0, columns).map((col, colIdx) => (
                <div
                  key={colIdx}
                  className="flex flex-col"
                  style={{
                    gap: `${gridGap}px`,
                    marginTop: colIdx === 1 || colIdx === 3 ? '36px' : '0px',
                  }}
                >
                  {col.map((card) => (
                    <div
                      key={card.label}
                      className="flex items-end p-3 transition-colors"
                      style={{
                        height: `${card.h}px`,
                        borderRadius: `${cornerRadius}px`,
                        backgroundColor: card.tone,
                        color: card.darkText === false ? palette.ctaInk : palette.inkColor,
                      }}
                    >
                      <span className="font-mono text-[11px] font-medium opacity-80">
                        {card.label}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
