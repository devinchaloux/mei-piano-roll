import type { MeiNote } from '../mei/types'

// ── Lanes: one roll, or one roll per part ──
// The player and the SVG images both lay out the roll through this, so the
// screen and a saved picture always agree. Together, every part shares one
// pitch range. Separated, each part gets a lane of its own, fitted to its own
// range: a piccolo and a double bass on one roll leave a few pixels per
// semitone, but in lanes of their own each stays readable.

export interface Lane {
  /** The parts drawn in this lane. */
  parts: number[]
  /** Lowest and highest pitch rows, as MIDI numbers. */
  lo: number
  hi: number
  /** Position and size, in pixels. */
  top: number
  height: number
}

export interface LaneOptions {
  /** One lane per part (true), or every part on one roll. */
  separate: boolean
  /** Area to fill, in pixels. */
  top: number
  height: number
  /** Space between lanes, in pixels. Default 6. */
  gap?: number
  /** Empty pitch rows above and below each lane's notes. Default 1. */
  pitchPadding?: number
}

/** The shortest a lane gets on screen; the player grows taller rather than squeeze lanes below it. */
export const MIN_LANE_HEIGHT = 56

/**
 * The shortest a pitch row gets in a separated lane, in pixels. A string
 * quartet's cello spans three octaves and more; in a 56-pixel lane each
 * semitone would be under two pixels and its notes slivers.
 */
export const MIN_ROW_HEIGHT = 4

function range(notes: MeiNote[], pad: number): { lo: number; hi: number } {
  if (!notes.length) return { lo: 60, hi: 72 }
  let lo = Infinity, hi = -Infinity
  for (const n of notes) {
    if (n.midi < lo) lo = n.midi
    if (n.midi > hi) hi = n.midi
  }
  return { lo: lo - pad, hi: hi + pad }
}

/** Lays out the lanes for these notes. Separated, only parts with notes among them get a lane. */
export function layoutLanes(notes: MeiNote[], o: LaneOptions): Lane[] {
  const pad = o.pitchPadding ?? 1
  const parts = [...new Set(notes.map((n) => n.part))].sort((a, b) => a - b)
  if (!o.separate || parts.length < 2) {
    return [{ parts, ...range(notes, pad), top: o.top, height: o.height }]
  }
  const gap = o.gap ?? 6
  const h = (o.height - gap * (parts.length - 1)) / parts.length
  return parts.map((p, i) => ({
    parts: [p],
    ...range(notes.filter((n) => n.part === p), pad),
    top: o.top + i * (h + gap),
    height: h,
  }))
}

/** The most pitch rows any one part needs in a lane of its own. */
export function widestLaneRows(notes: MeiNote[], pitchPadding = 1): number {
  let rows = 0
  for (const p of new Set(notes.map((n) => n.part))) {
    const r = range(notes.filter((n) => n.part === p), pitchPadding)
    rows = Math.max(rows, r.hi - r.lo + 1)
  }
  return rows
}

/** How many lanes a separated view of these notes needs. */
export function laneCount(notes: MeiNote[]): number {
  return new Set(notes.map((n) => n.part)).size
}
