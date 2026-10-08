import type { MeiScore } from '../mei/types'
import { midiName, isBlackKey } from '../mei/parseNative'
import { resolveTheme, shade, type RollTheme, type ThemeName } from '../roll/themes'

/* ===========================================================================
 * Still images of the roll, as SVG.
 *
 * A pure function: score in, SVG text out, no browser needed. So the same call
 * works on a page ("save image") and in a site's build step (draw every
 * excerpt's picture when the site builds, so pictures can't drift from the
 * files they come from). For PNG, see toPng.ts.
 * ======================================================================== */

export interface RollImageOptions {
  /** First bar to draw, counted from 1 in order (a pickup counts as bar 1). Default: the first. */
  fromBar?: number
  /** Last bar to draw, inclusive. Default: the last. */
  toBar?: number
  /** Size in pixels. Defaults: 1200 × 400. */
  width?: number
  height?: number
  /** The keyboard down the left side. Default true. */
  keyboard?: boolean
  /** Bar numbers along the top. Default false. */
  barNumbers?: boolean
  /** Beat and bar lines. Default true. */
  grid?: boolean
  /** Pitch names on notes wide enough to hold them. Default false. */
  noteLabels?: boolean
  theme?: ThemeName | RollTheme
  /** Note colour; overrides the theme's. */
  noteColor?: string
  /** False leaves the background transparent. Default true. */
  background?: boolean
  /** Empty pitch rows above and below the notes. Default 1. */
  pitchPadding?: number
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const r2 = (n: number) => Math.round(n * 100) / 100

export function rollToSvg(score: MeiScore, options: RollImageOptions = {}): string {
  const o = {
    width: 1200, height: 400, keyboard: true, barNumbers: false, grid: true, noteLabels: false,
    background: true, pitchPadding: 1, ...options,
  }
  const theme = resolveTheme(o.theme)
  const noteColor = o.noteColor ?? theme.note

  // ── Which stretch of music ──
  const bars = score.bars.length ? score.bars : [{ start: 0, label: '1' }]
  const first = Math.min(Math.max(1, o.fromBar ?? 1), bars.length)
  const last = Math.max(first, Math.min(o.toBar ?? bars.length, bars.length))
  const startBeat = bars[first - 1].start
  const endBeat = last < bars.length ? bars[last].start : score.totalBeats
  const span = Math.max(endBeat - startBeat, 1e-6)
  const notes = score.notes.filter((n) => n.start < endBeat - 1e-6 && n.start + n.dur > startBeat + 1e-6)

  // ── Geometry ──
  let lo = 60, hi = 72
  if (notes.length) {
    lo = Math.min(...notes.map((n) => n.midi)) - o.pitchPadding
    hi = Math.max(...notes.map((n) => n.midi)) + o.pitchPadding
  }
  const keyW = o.keyboard ? Math.max(24, Math.min(60, Math.round(o.width * 0.04))) : 0
  const rulerH = o.barNumbers ? 22 : 0
  const rows = hi - lo + 1
  const rowH = (o.height - rulerH) / rows
  const px = (o.width - keyW) / span
  const x = (beat: number) => keyW + (beat - startBeat) * px
  const y = (midi: number) => rulerH + (hi - midi) * rowH

  const out: string[] = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}" role="img">`)
  out.push(`<title>${esc(score.title || 'Piano roll')}</title>`)
  if (o.background) out.push(`<rect width="${o.width}" height="${o.height}" fill="${theme.background}"/>`)

  // Pitch rows: black-key rows a shade darker, as in a DAW.
  for (let m = lo; m <= hi; m++) {
    const fill = isBlackKey(m) ? theme.rowBlack : theme.rowWhite
    if (!o.background && fill === theme.background) continue
    out.push(`<rect x="${keyW}" y="${r2(y(m))}" width="${o.width - keyW}" height="${r2(rowH)}" fill="${fill}"/>`)
  }

  // ── Grid: a line per beat, counted from each bar's start; stronger at bar lines ──
  if (o.grid) {
    for (let i = first - 1; i < last; i++) {
      const barEnd = i + 1 < bars.length ? bars[i + 1].start : score.totalBeats
      for (let b = bars[i].start; b < barEnd - 1e-6; b += 1) {
        const isBar = b === bars[i].start
        const xx = Math.round(x(b)) + 0.5
        out.push(`<line x1="${xx}" y1="${rulerH}" x2="${xx}" y2="${o.height}" stroke="${isBar ? theme.gridBar : theme.gridBeat}" stroke-width="${isBar ? 1.5 : 1}"/>`)
      }
    }
  }

  // ── Notes, clipped to the chosen bars ──
  const stroke = shade(noteColor, -0.35)
  const fontSize = Math.max(8, Math.min(12, rowH * 0.6))
  for (const n of notes) {
    const s = Math.max(n.start, startBeat)
    const e = Math.min(n.start + n.dur, endBeat)
    const nx = x(s) + 1
    const nw = Math.max(2, (e - s) * px - 2)
    const ny = y(n.midi) + 1
    const nh = Math.max(1, rowH - 2)
    out.push(`<rect x="${r2(nx)}" y="${r2(ny)}" width="${r2(nw)}" height="${r2(nh)}" rx="${r2(Math.min(3, nh / 2))}" fill="${noteColor}" stroke="${stroke}" stroke-width="1"/>`)
    if (o.noteLabels && nw > 24 && rowH > 12) {
      out.push(`<text x="${r2(nx + 4)}" y="${r2(ny + nh / 2)}" dominant-baseline="central" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="${r2(fontSize)}" fill="${theme.noteText}">${n.name}</text>`)
    }
  }

  // ── Bar numbers ──
  if (o.barNumbers) {
    out.push(`<rect width="${o.width}" height="${rulerH}" fill="${o.background ? theme.background : 'none'}"/>`)
    for (let i = first - 1; i < last; i++) {
      out.push(`<text x="${r2(x(bars[i].start) + 4)}" y="${rulerH / 2}" dominant-baseline="central" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11" fill="${theme.text}">${esc(bars[i].label)}</text>`)
    }
  }

  // ── Keyboard ──
  if (o.keyboard) {
    out.push(`<rect x="0" y="${rulerH}" width="${keyW}" height="${o.height - rulerH}" fill="${theme.keyWhite}"/>`)
    for (let m = lo; m <= hi; m++) {
      if (isBlackKey(m)) out.push(`<rect x="0" y="${r2(y(m))}" width="${r2(keyW * 0.68)}" height="${r2(rowH - 1)}" fill="${theme.keyBlack}"/>`)
      if (m % 12 === 0 && rowH > 9) {
        out.push(`<text x="4" y="${r2(y(m) + rowH / 2)}" dominant-baseline="central" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="${r2(Math.min(10, rowH * 0.8))}" fill="${theme.text}">${midiName(m)}</text>`)
      }
    }
    out.push(`<line x1="${keyW + 0.5}" y1="0" x2="${keyW + 0.5}" y2="${o.height}" stroke="${theme.gridBar}"/>`)
  }

  out.push('</svg>')
  return out.join('\n')
}
