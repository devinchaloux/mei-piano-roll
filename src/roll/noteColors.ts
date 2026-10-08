import type { RollTheme } from './themes'

// ── Quick-pick note colors ──
// Each color comes in two strengths: a bright one for dark themes and a deeper
// one for light themes, so notes keep their contrast on either background. The
// first four are the accents of the site this roll was made for. Every built-in
// theme's own note color is one of these, so a picker can always show which
// is in use.

export interface NoteColor {
  name: string
  /** For dark backgrounds. */
  color: string
  /** For light backgrounds. */
  onLight: string
}

export const NOTE_COLORS: NoteColor[] = [
  { name: 'Magenta', color: '#ff5ca0', onLight: '#c00050' },
  { name: 'Sky', color: '#4aa8ff', onLight: '#005fb8' },
  { name: 'Rose', color: '#ff6b81', onLight: '#c3001d' },
  { name: 'Cyan', color: '#2dd4ee', onLight: '#0a6a79' },
  { name: 'Amber', color: '#ffb020', onLight: '#9a5b00' },
  { name: 'Lime', color: '#8bd450', onLight: '#3f7d1c' },
  { name: 'Violet', color: '#a78bfa', onLight: '#6d28d9' },
  { name: 'Neutral', color: '#e8eaf1', onLight: '#222222' },
]

/** True when a theme's background is light, judged by its perceived brightness. */
export function isLightTheme(theme: RollTheme): boolean {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(theme.background.trim())
  if (!m) return false
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16))
  return 0.299 * r + 0.587 * g + 0.114 * b > 150
}

/** The right strength of a quick-pick color for a theme. */
export function noteColorFor(c: NoteColor, theme: RollTheme): string {
  return isLightTheme(theme) ? c.onLight : c.color
}

// ── One color per part ──
// The first part takes the note color, so a one-part file looks as it always
// has. The others follow in an order that keeps neighbors far apart in hue,
// in the strength that suits the theme.

const PART_ORDER = ['Sky', 'Amber', 'Lime', 'Violet', 'Cyan', 'Rose', 'Magenta', 'Neutral']

/** Colors for `count` parts: `first` for the first part, quick-pick colors after it. */
export function partColors(count: number, theme: RollTheme, first: string): string[] {
  const rest = PART_ORDER
    .map((name) => noteColorFor(NOTE_COLORS.find((c) => c.name === name)!, theme))
    .filter((c) => c.toLowerCase() !== first.toLowerCase())
  return Array.from({ length: Math.max(0, count) }, (_, i) => (i === 0 ? first : rest[(i - 1) % rest.length]))
}
