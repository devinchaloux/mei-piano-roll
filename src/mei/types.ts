// ── The note data every reader hands the renderer ──
// One shape for every reader, so the roll's drawing and playback are written
// once (docs/decisions.md, "two readers behind one renderer").

export interface MeiNote {
  /** MIDI note number: middle C is 60. */
  midi: number
  /** Onset, in quarter-note beats from the start of the piece. */
  start: number
  /** Duration, in quarter-note beats. */
  dur: number
  /** Pitch name with octave, e.g. "C#4". */
  name: string
}

/**
 * Something in the file the reader did not render faithfully. The roll never
 * fails silently: anything dropped, simplified or guessed is reported here,
 * once per kind, with how often it happened.
 */
export interface MeiWarning {
  /** Stable identifier, e.g. "tie" or "skipped:fermata". */
  code: string
  /** Plain-English explanation of what the roll shows instead. */
  message: string
  count: number
}

export interface MeiScore {
  title: string
  composer: string
  bpm: number
  meterCount: number
  meterUnit: number
  /** Length of one bar, in quarter-note beats. */
  measureBeats: number
  totalBeats: number
  notes: MeiNote[]
  warnings: MeiWarning[]
}
