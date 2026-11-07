// ── The roll's zoom ──

// The roll's zoom range, in px per quarter-note beat. The floor is low so a
// short excerpt can fit a phone's width; the buttons reach it too.
export const ROLL_ZOOM = { min: 12, max: 160 }
// A file that would need less than this to fit opens here and scrolls. It
// keeps a long file readable at first sight, as the floor did before phones.
export const ROLL_OPEN_MIN = 28

/**
 * The zoom a roll opens at when the page gives none: the whole file fits
 * `trackWidth` (the roll's width less its keyboard) when it can at
 * ROLL_ZOOM.min or more; a longer file opens at ROLL_OPEN_MIN and scrolls.
 */
export function fitZoom(trackWidth: number, totalBeats: number): number {
  if (!(totalBeats > 0) || !(trackWidth > 0)) return ROLL_OPEN_MIN
  const fit = Math.floor(trackWidth / totalBeats)
  if (fit < ROLL_ZOOM.min) return ROLL_OPEN_MIN
  return Math.min(fit, ROLL_ZOOM.max)
}
