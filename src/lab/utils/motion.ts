/**
 * SSoT de Motion e Curvas do Prompt Engine LAB (Savee + emil-design-eng).
 */
import type { LabPaletteId } from '../../hooks/useCartographerProfile'

export const EASE_OUT_CSS = 'cubic-bezier(0.23, 1, 0.32, 1)'
export const EASE_OUT_EXPO_CSS = 'cubic-bezier(0.16, 1, 0.3, 1)'
export const EASE_IN_OUT_CSS = 'cubic-bezier(0.77, 0, 0.175, 1)'
export const EASE_DRAWER_CSS = 'cubic-bezier(0.32, 0.72, 0, 1)'

export const DUR_MS = {
  press: 120,
  fast: 150,
  base: 200,
  slow: 280,
} as const

export function buildSaveeCssTokensSpecimen(
  cornerRadius: number,
  gridGap: number,
  paletteId: LabPaletteId = 'obsidian'
): string {
  const paletteTokens =
    paletteId === 'nocturnal_violet'
      ? `  --color-canvas: #0B0711;
  --color-surface: #130C1E;
  --color-elevated: #211532;
  --color-hairline: #452D5B;
  --color-ink: #F5E1DB;
  --color-ink-secondary: #DFC4BE;
  --color-ink-muted: #8A7582;
  --color-brand: #3C2A71;
  --color-brand-bright: #C2939E;
  --color-tier-s: #C2939E;
  --color-danger: #9E4768;`
      : `  --color-canvas: #000000;
  --color-surface: #0C0C0E;
  --color-elevated: #1C1C22;
  --color-hairline: #26262F;
  --color-ink: #F5F5F7;
  --color-ink-secondary: #C7C7CC;
  --color-ink-muted: #787882;
  --color-brand: #684EFF;
  --color-brand-bright: #9B87FF;
  --color-tier-s: #FF4F8B;
  --color-danger: #FF453A;`

  return `:root {
${paletteTokens}
  --grid-corner-radius: ${cornerRadius}px;
  --grid-gap: ${gridGap}px;
  --nav-height: 64px;
  --ease-out-expo: ${EASE_OUT_EXPO_CSS};
}`
}
