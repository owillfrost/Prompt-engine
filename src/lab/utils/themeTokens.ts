import { useEffect, useState } from 'react'
import type { LabPaletteId } from '../../hooks/useCartographerProfile'
import type { RarityTier } from '../../types/promptEngine'

export interface SwatchItem {
  name: string
  token: string
  hex: string
  rgb: string
}

export interface LabPaletteOptionMeta {
  id: LabPaletteId
  name: string
  badge: string
  description: string
  swatches: readonly string[]
}

export const LAB_PALETTES: ReadonlyArray<LabPaletteOptionMeta> = [
  {
    id: 'obsidian',
    name: 'Apple Obsidian',
    badge: 'Padrão',
    description:
      'Preto OLED puro (#000000), vidro translúcido e acento Índigo Elétrico com contraste alto.',
    swatches: ['#000000', '#0c0c0e', '#684eff', '#ff4f8b', '#f5f5f7'],
  },
  {
    id: 'nocturnal_violet',
    name: 'Nocturnal Violet',
    badge: 'Paleta extra',
    description:
      'Paleta anterior em violeta noturno (#0b0711 / #211532) com acentos ameixa e quartzo rosa.',
    swatches: ['#0b0711', '#211532', '#452d5b', '#743e63', '#c2939e'],
  },
]

export interface LabPaletteBundle {
  tierHex: Record<RarityTier, string>
  clusterAccentPalette: readonly string[]
  mapCanvasColors: {
    voidFillSelected: string
    voidFillIdle: string
    voidStrokeSelected: string
    voidStrokeIdle: string
    dimmedPoint: string
    neighborLine: string
    neighborFill: string
    pointStroke: string
    selectedHalo: string
    selectedFill: string
    fallbackCluster: string
    fallbackClusterSoft: string
    pulseRgb: string
  }
  borderTokens: ReadonlyArray<{
    name: string
    token: string
    className: string
    hex: string
    usage: string
  }>
  semanticSwatches: SwatchItem[]
  grayScale: SwatchItem[]
  masonryColumns: Array<Array<{ h: number; label: string; tone: string; darkText?: boolean }>>
  playgroundThemes: {
    light: {
      surfaceBg: string
      cardBg: string
      inkColor: string
      mutedInk: string
      borderCol: string
      ctaBg: string
      ctaInk: string
      secondaryBg: string
      secondaryInk: string
      subColor: string
    }
    dark: {
      surfaceBg: string
      cardBg: string
      inkColor: string
      mutedInk: string
      borderCol: string
      ctaBg: string
      ctaInk: string
      secondaryBg: string
      secondaryInk: string
      subColor: string
    }
  }
  playgroundMeta: {
    lightLabel: string
    darkLabel: string
    contrastCopy: string
  }
  glassFolderPresetColors: Record<
    'aurora' | 'ember' | 'dusk' | 'glacier' | 'verdant',
    readonly string[]
  >
  glassFolderFallbackColors: readonly string[]
  glassFolderRimStopColor: string
}

export const LAB_PALETTE_BUNDLES: Record<LabPaletteId, LabPaletteBundle> = {
  obsidian: {
    tierHex: {
      S: '#ff4f8b',
      A: '#bf5af2',
      B: '#38a1ff',
      C: '#32d79b',
      D: '#8e8e93',
    },
    clusterAccentPalette: [
      '#684eff',
      '#ff4f8b',
      '#38a1ff',
      '#32d79b',
      '#bf5af2',
      '#64d2ff',
      '#ff6b6b',
      '#30d158',
      '#9b87ff',
      '#ff9f0a',
      '#5ac8fa',
      '#f472b6',
    ],
    mapCanvasColors: {
      voidFillSelected: 'rgba(255, 79, 139, 0.14)',
      voidFillIdle: 'rgba(0, 0, 0, 0.82)',
      voidStrokeSelected: 'rgba(255, 194, 216, 0.88)',
      voidStrokeIdle: 'rgba(255, 79, 139, 0.36)',
      dimmedPoint: 'rgba(72, 72, 78, 0.28)',
      neighborLine: 'rgba(155, 135, 255, 0.48)',
      neighborFill: '#9b87ff',
      pointStroke: '#000000',
      selectedHalo: 'rgba(245, 245, 247, 0.92)',
      selectedFill: '#f5f5f7',
      fallbackCluster: '#8e8e93',
      fallbackClusterSoft: '#9b87ff',
      pulseRgb: '104, 78, 255',
    },
    borderTokens: [
      { name: 'Border Subtle', token: '--color-border-subtle', className: 'border-border-subtle', hex: '#18181D', usage: 'Divisórias internas, células de matriz e wells' },
      { name: 'Hairline', token: '--color-hairline', className: 'border-hairline', hex: '#26262F', usage: 'Borda 1px padrão de cards, inputs, painéis e tooltips' },
      { name: 'Border Hover', token: '--color-border-hover', className: 'border-border-hover', hex: '#3E3E4C', usage: 'Hover, foco, botões secundários e estado ativo' },
      { name: 'Border Strong', token: '--color-border-strong', className: 'border-border-strong', hex: '#636374', usage: 'Contornos selecionados de alto contraste' },
    ],
    semanticSwatches: [
      { name: 'Canvas Black', token: '--color-canvas', hex: '#000000', rgb: '0, 0, 0' },
      { name: 'Surface Obsidian', token: '--color-surface', hex: '#0C0C0E', rgb: '12, 12, 14' },
      { name: 'Elevated Panel', token: '--color-elevated', hex: '#1C1C22', rgb: '28, 28, 34' },
      { name: 'Hairline Border', token: '--color-hairline', hex: '#26262F', rgb: '38, 38, 47' },
      { name: 'Ink Muted', token: '--color-ink-muted', hex: '#787882', rgb: '120, 120, 130' },
      { name: 'Ink Tertiary', token: '--color-ink-tertiary', hex: '#8E8E93', rgb: '142, 142, 147' },
      { name: 'Ink Secondary', token: '--color-ink-secondary', hex: '#C7C7CC', rgb: '199, 199, 204' },
      { name: 'Ink Primary', token: '--color-ink', hex: '#F5F5F7', rgb: '245, 245, 247' },
      { name: 'Brand Accent', token: '--color-brand', hex: '#684EFF', rgb: '104, 78, 255' },
      { name: 'Accent Highlight', token: '--color-brand-bright', hex: '#9B87FF', rgb: '155, 135, 255' },
      { name: 'Flagship Tier S', token: '--color-tier-s', hex: '#FF4F8B', rgb: '255, 79, 139' },
    ],
    grayScale: [
      { name: 'Light 50', token: '--color-ink', hex: '#F5F5F7', rgb: '245, 245, 247' },
      { name: 'Gray 100', token: '--color-ink-secondary', hex: '#C7C7CC', rgb: '199, 199, 204' },
      { name: 'Gray 300', token: '--color-ink-tertiary', hex: '#8E8E93', rgb: '142, 142, 147' },
      { name: 'Gray 400', token: '--color-ink-muted', hex: '#787882', rgb: '120, 120, 130' },
      { name: 'Gray 500', token: '--color-border-strong', hex: '#636374', rgb: '99, 99, 116' },
      { name: 'Gray 600', token: '--color-ink-dim', hex: '#48484E', rgb: '72, 72, 78' },
      { name: 'Gray 700', token: '--color-border-hover', hex: '#3E3E4C', rgb: '62, 62, 76' },
      { name: 'Hairline 800', token: '--color-hairline', hex: '#26262F', rgb: '38, 38, 47' },
      { name: 'Elevated 850', token: '--color-elevated', hex: '#1C1C22', rgb: '28, 28, 34' },
      { name: 'Surface 900', token: '--color-surface', hex: '#0C0C0E', rgb: '12, 12, 14' },
      { name: 'OLED Black 950', token: '--color-canvas', hex: '#000000', rgb: '0, 0, 0' },
    ],
    masonryColumns: [
      [
        { h: 150, label: 'Editorial 01', tone: '#F5F5F7' },
        { h: 210, label: 'Poster 02', tone: '#C7C7CC' },
      ],
      [
        { h: 190, label: 'Type 03', tone: '#684EFF', darkText: false },
        { h: 140, label: 'Object 04', tone: '#9B87FF' },
      ],
      [
        { h: 165, label: 'Brand 05', tone: '#FF4F8B', darkText: false },
        { h: 185, label: 'Archive 06', tone: '#1C1C22', darkText: false },
      ],
      [
        { h: 200, label: 'Motion 07', tone: '#38A1FF', darkText: false },
        { h: 145, label: 'Print 08', tone: '#32D79B' },
      ],
      [
        { h: 155, label: 'Studio 09', tone: '#BF5AF2', darkText: false },
        { h: 195, label: 'Grid 10', tone: '#F5F5F7' },
      ],
    ],
    playgroundThemes: {
      light: {
        surfaceBg: '#F5F5F7',
        cardBg: '#E5E5EA',
        inkColor: '#000000',
        mutedInk: '#1C1C22',
        borderCol: 'rgba(38, 38, 47, 0.16)',
        ctaBg: '#684EFF',
        ctaInk: '#F5F5F7',
        secondaryBg: '#D1D1D6',
        secondaryInk: '#1C1C22',
        subColor: '#636374',
      },
      dark: {
        surfaceBg: '#000000',
        cardBg: '#0C0C0E',
        inkColor: '#F5F5F7',
        mutedInk: '#C7C7CC',
        borderCol: 'rgba(62, 62, 76, 0.85)',
        ctaBg: '#684EFF',
        ctaInk: '#F5F5F7',
        secondaryBg: '#1C1C22',
        secondaryInk: '#F5F5F7',
        subColor: '#8E8E93',
      },
    },
    playgroundMeta: {
      lightLabel: 'Light (#F5F5F7)',
      darkLabel: 'Dark (#000000)',
      contrastCopy: '(#1C1C22 sobre #F5F5F7 no claro; #F5F5F7 sobre #000000 no escuro)',
    },
    glassFolderPresetColors: {
      aurora: ['#000000', '#0c0c14', '#684eff', '#38a1ff', '#9b87ff', '#f5f5f7'],
      ember: ['#000000', '#14090e', '#ff4f8b', '#bf5af2', '#ffc2d8', '#f5f5f7'],
      dusk: ['#000000', '#120b1c', '#684eff', '#bf5af2', '#ff4f8b', '#f5f5f7'],
      glacier: ['#000000', '#07121a', '#38a1ff', '#64d2ff', '#c7c7cc', '#f5f5f7'],
      verdant: ['#000000', '#071611', '#30d158', '#32d79b', '#64d2ff', '#f5f5f7'],
    },
    glassFolderFallbackColors: ['#000000', '#9b87ff'],
    glassFolderRimStopColor: '#f5f5f7',
  },

  nocturnal_violet: {
    tierHex: {
      S: '#c2939e',
      A: '#743e63',
      B: '#3c2a71',
      C: '#452d5b',
      D: '#565659',
    },
    clusterAccentPalette: [
      '#c2939e',
      '#743e63',
      '#5c43a3',
      '#9e5884',
      '#f5e1db',
      '#6c488e',
      '#a87482',
      '#4c368c',
      '#8a5074',
      '#d9b4bc',
      '#565659',
      '#7d629e',
    ],
    mapCanvasColors: {
      voidFillSelected: 'rgba(194, 147, 158, 0.12)',
      voidFillIdle: 'rgba(11, 7, 17, 0.78)',
      voidStrokeSelected: 'rgba(245, 225, 219, 0.82)',
      voidStrokeIdle: 'rgba(194, 147, 158, 0.32)',
      dimmedPoint: 'rgba(86, 86, 89, 0.22)',
      neighborLine: 'rgba(194, 147, 158, 0.36)',
      neighborFill: '#c2939e',
      pointStroke: '#0b0711',
      selectedHalo: 'rgba(245, 225, 219, 0.88)',
      selectedFill: '#f5e1db',
      fallbackCluster: '#565659',
      fallbackClusterSoft: '#c2939e',
      pulseRgb: '194, 147, 158',
    },
    borderTokens: [
      { name: 'Border Subtle', token: '--color-border-subtle', className: 'border-border-subtle', hex: '#211532', usage: 'Divisórias internas, células de matriz e wells' },
      { name: 'Hairline', token: '--color-hairline', className: 'border-hairline', hex: '#452D5B', usage: 'Borda 1px padrão de cards, inputs, painéis e tooltips' },
      { name: 'Border Hover', token: '--color-border-hover', className: 'border-border-hover', hex: '#743E63', usage: 'Hover, foco, botões secundários e estado ativo' },
      { name: 'Border Strong', token: '--color-border-strong', className: 'border-border-strong', hex: '#C2939E', usage: 'Contornos selecionados de alto contraste' },
    ],
    semanticSwatches: [
      { name: 'Canvas Dark', token: '--color-canvas', hex: '#0B0711', rgb: '11, 7, 17' },
      { name: 'Surface Card', token: '--color-surface', hex: '#130C1E', rgb: '19, 12, 30' },
      { name: 'Elevated Violet', token: '--color-elevated', hex: '#211532', rgb: '33, 21, 50' },
      { name: 'Hairline Plum', token: '--color-hairline', hex: '#452D5B', rgb: '69, 45, 91' },
      { name: 'Ink Dim', token: '--color-ink-dim', hex: '#565659', rgb: '86, 86, 89' },
      { name: 'Ink Muted', token: '--color-ink-muted', hex: '#8A7582', rgb: '138, 117, 130' },
      { name: 'Rose Quartz', token: '--color-tier-s', hex: '#C2939E', rgb: '194, 147, 158' },
      { name: 'Ink Secondary', token: '--color-ink-secondary', hex: '#DFC4BE', rgb: '223, 196, 190' },
      { name: 'Ink Primary', token: '--color-ink', hex: '#F5E1DB', rgb: '245, 225, 219' },
      { name: 'Brand Indigo', token: '--color-brand', hex: '#3C2A71', rgb: '60, 42, 113' },
      { name: 'Accent Magenta', token: '--color-brand-2', hex: '#743E63', rgb: '116, 62, 99' },
    ],
    grayScale: [
      { name: 'Blush 50', token: '--color-ink', hex: '#F5E1DB', rgb: '245, 225, 219' },
      { name: 'Blush 100', token: '--color-ink-secondary', hex: '#DFC4BE', rgb: '223, 196, 190' },
      { name: 'Rose 200', token: '--color-tier-s', hex: '#C2939E', rgb: '194, 147, 158' },
      { name: 'Mauve 300', token: '--color-ink-muted', hex: '#8A7582', rgb: '138, 117, 130' },
      { name: 'Berry 400', token: '--color-border-hover', hex: '#743E63', rgb: '116, 62, 99' },
      { name: 'Slate 500', token: '--color-ink-dim', hex: '#565659', rgb: '86, 86, 89' },
      { name: 'Plum 600', token: '--color-hairline', hex: '#452D5B', rgb: '69, 45, 91' },
      { name: 'Indigo 700', token: '--color-brand', hex: '#3C2A71', rgb: '60, 42, 113' },
      { name: 'Violet 800', token: '--color-elevated', hex: '#211532', rgb: '33, 21, 50' },
      { name: 'Surface 900', token: '--color-surface', hex: '#130C1E', rgb: '19, 12, 30' },
      { name: 'Canvas 950', token: '--color-canvas', hex: '#0B0711', rgb: '11, 7, 17' },
    ],
    masonryColumns: [
      [
        { h: 150, label: 'Editorial 01', tone: '#F5E1DB' },
        { h: 210, label: 'Poster 02', tone: '#C2939E' },
      ],
      [
        { h: 190, label: 'Type 03', tone: '#743E63', darkText: false },
        { h: 140, label: 'Object 04', tone: '#DFC4BE' },
      ],
      [
        { h: 165, label: 'Brand 05', tone: '#3C2A71', darkText: false },
        { h: 185, label: 'Archive 06', tone: '#452D5B', darkText: false },
      ],
      [
        { h: 200, label: 'Motion 07', tone: '#211532', darkText: false },
        { h: 145, label: 'Print 08', tone: '#565659', darkText: false },
      ],
      [
        { h: 155, label: 'Studio 09', tone: '#C2939E' },
        { h: 195, label: 'Grid 10', tone: '#F5E1DB' },
      ],
    ],
    playgroundThemes: {
      light: {
        surfaceBg: '#F5E1DB',
        cardBg: '#DFC4BE',
        inkColor: '#0B0711',
        mutedInk: '#211532',
        borderCol: 'rgba(69, 45, 91, 0.25)',
        ctaBg: '#211532',
        ctaInk: '#F5E1DB',
        secondaryBg: '#C2939E',
        secondaryInk: '#211532',
        subColor: '#452D5B',
      },
      dark: {
        surfaceBg: '#0B0711',
        cardBg: '#130C1E',
        inkColor: '#F5E1DB',
        mutedInk: '#C2939E',
        borderCol: 'rgba(69, 45, 91, 0.85)',
        ctaBg: '#C2939E',
        ctaInk: '#0B0711',
        secondaryBg: '#211532',
        secondaryInk: '#F5E1DB',
        subColor: '#8A7582',
      },
    },
    playgroundMeta: {
      lightLabel: 'Light (#F5E1DB)',
      darkLabel: 'Dark (#0B0711)',
      contrastCopy: '(#211532 sobre #F5E1DB no claro; #F5E1DB sobre #0B0711 no escuro)',
    },
    glassFolderPresetColors: {
      aurora: ['#0b0711', '#211532', '#3c2a71', '#452d5b', '#c2939e', '#f5e1db'],
      ember: ['#0b0711', '#211532', '#743e63', '#452d5b', '#c2939e', '#f5e1db'],
      dusk: ['#130c1e', '#452d5b', '#743e63', '#211532', '#c2939e', '#f5e1db'],
      glacier: ['#0b0711', '#211532', '#3c2a71', '#565659', '#c2939e', '#f5e1db'],
      verdant: ['#0b0711', '#211532', '#452d5b', '#3c2a71', '#743e63', '#c2939e'],
    },
    glassFolderFallbackColors: ['#0b0711', '#c2939e'],
    glassFolderRimStopColor: '#f5e1db',
  },
}

export function getLabPaletteBundle(paletteId: LabPaletteId): LabPaletteBundle {
  return LAB_PALETTE_BUNDLES[paletteId] ?? LAB_PALETTE_BUNDLES.obsidian
}

export function readActiveLabPaletteId(): LabPaletteId {
  if (typeof document === 'undefined') return 'obsidian'
  return document.documentElement.dataset.palette === 'nocturnal_violet'
    ? 'nocturnal_violet'
    : 'obsidian'
}

export function useLabPaletteId(): LabPaletteId {
  const [paletteId, setPaletteId] = useState<LabPaletteId>(() => readActiveLabPaletteId())

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const sync = () => setPaletteId(readActiveLabPaletteId())
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['data-palette'] })
    return () => observer.disconnect()
  }, [])

  return paletteId
}

export const SWATCH_COLORS = [
  'var(--color-brand)',
  'var(--color-tier-s)',
  'var(--color-tier-b)',
  'var(--color-tier-c)',
  'var(--color-tier-a)',
] as const

export const DEFAULT_SPOTLIGHT_COLOR = 'color-mix(in srgb, var(--color-brand) 12%, transparent)'

export const SPOTLIGHT_BY_TIER: Record<RarityTier, string> = {
  S: 'color-mix(in srgb, var(--color-tier-s) 18%, transparent)',
  A: 'color-mix(in srgb, var(--color-tier-a) 16%, transparent)',
  B: 'color-mix(in srgb, var(--color-tier-b) 16%, transparent)',
  C: 'color-mix(in srgb, var(--color-tier-c) 14%, transparent)',
  D: 'color-mix(in srgb, var(--color-tier-d) 12%, transparent)',
}

export const FOIL_TINT_BY_TIER = {
  S: 'color-mix(in srgb, var(--color-tier-s-bright) 24%, transparent)',
  A: 'color-mix(in srgb, var(--color-tier-a) 22%, transparent)',
} as const

export const TIER_COLOR_META: Record<
  RarityTier,
  {
    hex: string
    badgeClass: string
    textClass: string
    borderClass: string
    bgSubtleClass: string
    barColor: string
  }
> = {
  S: {
    hex: '#ff4f8b',
    badgeClass: 'border-tier-s/60 bg-tier-s/12 text-tier-s',
    textClass: 'text-tier-s',
    borderClass: 'border-tier-s/35 hover:border-tier-s/80',
    bgSubtleClass: 'bg-tier-s/10',
    barColor: 'var(--color-tier-s)',
  },
  A: {
    hex: '#bf5af2',
    badgeClass: 'border-tier-a/60 bg-tier-a/12 text-tier-a',
    textClass: 'text-tier-a',
    borderClass: 'border-tier-a/35 hover:border-tier-a/80',
    bgSubtleClass: 'bg-tier-a/10',
    barColor: 'var(--color-tier-a)',
  },
  B: {
    hex: '#38a1ff',
    badgeClass: 'border-tier-b/60 bg-tier-b/12 text-tier-b',
    textClass: 'text-tier-b',
    borderClass: 'border-tier-b/35 hover:border-tier-b/80',
    bgSubtleClass: 'bg-tier-b/10',
    barColor: 'var(--color-tier-b)',
  },
  C: {
    hex: '#32d79b',
    badgeClass: 'border-tier-c/60 bg-tier-c/12 text-tier-c',
    textClass: 'text-tier-c',
    borderClass: 'border-tier-c/35 hover:border-tier-c/80',
    bgSubtleClass: 'bg-tier-c/10',
    barColor: 'var(--color-tier-c)',
  },
  D: {
    hex: '#8e8e93',
    badgeClass: 'border-tier-d/60 bg-tier-d/15 text-ink-tertiary',
    textClass: 'text-ink-muted',
    borderClass: 'border-hairline hover:border-border-hover',
    bgSubtleClass: 'bg-tier-d/10',
    barColor: 'var(--color-tier-d)',
  },
}

export const CLUSTER_ACCENT_PALETTE = LAB_PALETTE_BUNDLES.obsidian.clusterAccentPalette
export const MAP_CANVAS_COLORS = LAB_PALETTE_BUNDLES.obsidian.mapCanvasColors
export const LAB_BORDER_TOKENS = LAB_PALETTE_BUNDLES.obsidian.borderTokens

export const LAB_TYPOGRAPHY_SCALE = [
  { name: '2xs', token: '--text-2xs', sizePx: 9, rem: '0.5625rem', usage: 'Micro-badges e carimbos' },
  { name: 'Eyebrow', token: '--text-eyebrow', sizePx: 10, rem: '0.625rem', usage: 'Eyebrows, DNA tags e metadados mono' },
  { name: 'Caption', token: '--text-caption', sizePx: 11, rem: '0.6875rem', usage: 'Captions, pills compactas e código denso' },
  { name: 'xs', token: '--text-xs', sizePx: 12, rem: '0.75rem', usage: 'Controles, inputs e tabelas' },
  { name: 'Dense', token: '--text-dense', sizePx: 13, rem: '0.8125rem', usage: 'Corpo denso de cards e listas' },
  { name: 'sm', token: '--text-sm', sizePx: 14, rem: '0.875rem', usage: 'Corpo padrão' },
  { name: 'base', token: '--text-base', sizePx: 16, rem: '1rem', usage: 'Títulos de card e seção' },
  { name: 'xl', token: '--text-xl', sizePx: 20, rem: '1.25rem', usage: 'Títulos de painel e drawer' },
  { name: '2xl', token: '--text-2xl', sizePx: 24, rem: '1.5rem', usage: 'Títulos de vista e banners' },
  { name: '3xl', token: '--text-3xl', sizePx: 28, rem: '1.75rem', usage: 'Métricas de destaque' },
  { name: '4xl', token: '--text-4xl', sizePx: 32, rem: '2rem', usage: 'Contadores hero' },
] as const

export const SAVEE_SEMANTIC_SWATCHES = LAB_PALETTE_BUNDLES.obsidian.semanticSwatches
export const SAVEE_GRAY_SCALE = LAB_PALETTE_BUNDLES.obsidian.grayScale
export const MASONRY_COLUMNS = LAB_PALETTE_BUNDLES.obsidian.masonryColumns
export const DESIGN_PLAYGROUND_THEME_PALETTES = LAB_PALETTE_BUNDLES.obsidian.playgroundThemes
export const GLASS_FOLDER_PRESET_COLORS = LAB_PALETTE_BUNDLES.obsidian.glassFolderPresetColors
export const GLASS_FOLDER_FALLBACK_COLORS = LAB_PALETTE_BUNDLES.obsidian.glassFolderFallbackColors
export const GLASS_FOLDER_RIM_STOP_COLOR = LAB_PALETTE_BUNDLES.obsidian.glassFolderRimStopColor

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return `rgba(155, 135, 255, ${alpha})`
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function pulseRingStroke(
  alpha: number,
  pulseRgb: string = MAP_CANVAS_COLORS.pulseRgb
): string {
  return `rgba(${pulseRgb}, ${alpha.toFixed(3)})`
}

export function matrixCellBg(alpha: number): string {
  return `color-mix(in srgb, var(--color-brand) ${(alpha * 100).toFixed(1)}%, transparent)`
}
