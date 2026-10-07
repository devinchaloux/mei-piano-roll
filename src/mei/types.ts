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

/** Where a bar begins, for drawing bar lines and numbers. */
export interface MeiBar {
  /** Onset, in quarter-note beats. */
  start: number
  /** The bar's number as the file gives it (a pickup is often "0"). */
  label: string
}

export interface MeiScore {
  title: string
  composer: string
  bpm: number
  meterCount: number
  meterUnit: number
  /** Length of a full bar in the opening meter, in quarter-note beats. */
  measureBeats: number
  /** Every bar, in order. Pickups and other short bars keep their real length. */
  bars: MeiBar[]
  totalBeats: number
  notes: MeiNote[]
  warnings: MeiWarning[]
}
