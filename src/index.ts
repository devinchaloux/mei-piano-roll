// ── Public API ──
// The roll component, the reader it uses, and the note data they share.

export { default as MeiPianoRoll } from './roll/MeiPianoRoll'
export type { MeiPianoRollProps } from './roll/MeiPianoRoll'
export { parseNative } from './mei/parseNative'
export type { MeiBar, MeiNote, MeiScore, MeiWarning } from './mei/types'
