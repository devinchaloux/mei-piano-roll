// ── Synth presets ──
// Each preset is a recipe: oscillators (the raw tone), an optional filter with
// its own envelope (what makes a pluck "pluck"), and an amplitude envelope
// (attack, decay, sustain level, release). Written as data so a new sound is a
// new entry, not new code.

interface Osc {
  type: OscillatorType
  /** Detune in cents (100 = one semitone); spreading several makes a sound wide. */
  detune?: number
  /** Octave offset: -1 an octave down, 1 up. */
  octave?: number
  gain?: number
}

interface Recipe {
  oscs: Osc[]
  /** Seconds, except sustain, which is a level from 0 to 1. */
  amp: { attack: number; decay: number; sustain: number; release: number }
  filter?: { type: BiquadFilterType; cutoff: number; q?: number; envAmount?: number; envDecay?: number }
  /** Frequency modulation, for bell-like tones: a modulator at ratio × the note. */
  fm?: { ratio: number; index: number; decay: number }
  /** Overall level, so presets sound about equally loud. */
  level: number
}

const saws = (spread: number, count: number): Osc[] =>
  Array.from({ length: count }, (_, i) => ({ type: 'sawtooth' as const, detune: count === 1 ? 0 : -spread + (2 * spread * i) / (count - 1), gain: 1 / count }))

export const RECIPES: Record<string, Recipe> = {
  // The prototype's sound, unchanged.
  'square-lead': { oscs: [{ type: 'square' }], amp: { attack: 0.008, decay: 0.08, sustain: 0.67, release: 0.05 }, filter: { type: 'lowpass', cutoff: 3200, q: 0.6 }, level: 1.0 },
  'saw-lead': { oscs: saws(7, 2), amp: { attack: 0.005, decay: 0.1, sustain: 0.7, release: 0.08 }, filter: { type: 'lowpass', cutoff: 4000, q: 1 }, level: 0.8 },
  // The trance lead: seven saws spread apart in pitch.
  supersaw: { oscs: saws(28, 7), amp: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.25 }, filter: { type: 'lowpass', cutoff: 6000, q: 0.5 }, level: 1.1 },
  pluck: { oscs: saws(6, 2), amp: { attack: 0.002, decay: 0.25, sustain: 0.0, release: 0.08 }, filter: { type: 'lowpass', cutoff: 500, q: 4, envAmount: 4500, envDecay: 0.18 }, level: 1.0 },
  stab: { oscs: [...saws(18, 3), { type: 'square', octave: -1, gain: 0.3 }], amp: { attack: 0.002, decay: 0.18, sustain: 0.15, release: 0.1 }, filter: { type: 'lowpass', cutoff: 900, q: 6, envAmount: 5000, envDecay: 0.12 }, level: 0.9 },
  pad: { oscs: [...saws(14, 3), { type: 'triangle', octave: 1, gain: 0.2 }], amp: { attack: 0.45, decay: 0.6, sustain: 0.8, release: 0.9 }, filter: { type: 'lowpass', cutoff: 1400, q: 0.7 }, level: 0.8 },
  // The 303 sound: one saw through a resonant filter that snaps shut.
  'acid-bass': { oscs: [{ type: 'sawtooth', octave: -1 }], amp: { attack: 0.003, decay: 0.2, sustain: 0.6, release: 0.05 }, filter: { type: 'lowpass', cutoff: 300, q: 14, envAmount: 2600, envDecay: 0.15 }, level: 0.9 },
  'sub-bass': { oscs: [{ type: 'sine', octave: -1 }, { type: 'triangle', octave: -1, gain: 0.25 }], amp: { attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.08 }, level: 1.2 },
  chip: { oscs: [{ type: 'square' }], amp: { attack: 0.001, decay: 0.05, sustain: 0.55, release: 0.02 }, level: 0.6 },
  organ: { oscs: [{ type: 'sine' }, { type: 'sine', octave: 1, gain: 0.5 }, { type: 'sine', octave: 2, gain: 0.25 }, { type: 'sine', octave: -1, gain: 0.4 }], amp: { attack: 0.01, decay: 0.05, sustain: 0.9, release: 0.06 }, level: 0.8 },
  bell: { oscs: [{ type: 'sine' }], amp: { attack: 0.002, decay: 1.4, sustain: 0.0, release: 0.4 }, fm: { ratio: 3.5, index: 2.5, decay: 0.9 }, level: 0.9 },
  sine: { oscs: [{ type: 'sine' }], amp: { attack: 0.01, decay: 0.1, sustain: 0.85, release: 0.08 }, level: 1.0 },
}

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

/**
 * Schedules one note on `destination` and returns a function that stops it
 * early. Notes are scheduled ahead of time on the audio clock, which is what
 * keeps playback steady even if the page is busy drawing.
 */
export function playSynthNote(
  ctx: AudioContext,
  destination: AudioNode,
  recipeId: string,
  midi: number,
  when: number,
  duration: number,
): () => void {
  const r = RECIPES[recipeId] ?? RECIPES['square-lead']
  const now = ctx.currentTime
  let t0 = when, d = duration
  // A note already under way when playback starts mid-piece: play its remainder.
  if (t0 < now) { d -= now - t0; t0 = now }
  if (d <= 0.001) return () => {}

  const freq = midiToFreq(midi)
  const { attack, decay, sustain, release } = r.amp
  const end = t0 + d

  // Amplitude envelope. The release starts when the written note ends.
  const amp = ctx.createGain()
  const peak = r.level * 0.9
  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.linearRampToValueAtTime(peak, t0 + Math.min(attack, d))
  amp.gain.linearRampToValueAtTime(Math.max(peak * sustain, 0.0001), t0 + Math.min(attack + decay, d))
  amp.gain.setValueAtTime(Math.max(peak * sustain, 0.0001), Math.max(t0 + 0.005, end))
  // A note with no sustain (pluck, bell) has already faded; this only ends it cleanly.
  amp.gain.linearRampToValueAtTime(0.0001, end + release)

  let input: AudioNode = amp
  if (r.filter) {
    const f = ctx.createBiquadFilter()
    f.type = r.filter.type
    f.Q.value = r.filter.q ?? 0.7
    f.frequency.setValueAtTime(r.filter.cutoff + (r.filter.envAmount ?? 0), t0)
    if (r.filter.envAmount) f.frequency.exponentialRampToValueAtTime(Math.max(r.filter.cutoff, 40), t0 + (r.filter.envDecay ?? 0.2))
    f.connect(amp)
    input = f
  }
  amp.connect(destination)

  const stopAt = end + release + 0.02
  const sources: OscillatorNode[] = []
  for (const o of r.oscs) {
    const osc = ctx.createOscillator()
    osc.type = o.type
    osc.frequency.value = freq * Math.pow(2, o.octave ?? 0)
    osc.detune.value = o.detune ?? 0
    const g = ctx.createGain()
    g.gain.value = o.gain ?? 1
    osc.connect(g).connect(input)
    if (r.fm) {
      // The modulator wobbles the carrier's pitch; its depth fades, which is
      // what makes an FM bell bright at the strike and pure as it rings.
      const mod = ctx.createOscillator()
      mod.frequency.value = freq * r.fm.ratio
      const depth = ctx.createGain()
      depth.gain.setValueAtTime(freq * r.fm.index, t0)
      depth.gain.exponentialRampToValueAtTime(Math.max(freq * 0.01, 0.01), t0 + r.fm.decay)
      mod.connect(depth).connect(osc.frequency)
      mod.start(t0)
      mod.stop(stopAt)
      sources.push(mod)
    }
    osc.start(t0)
    osc.stop(stopAt)
    sources.push(osc)
  }

  return () => {
    for (const s of sources) {
      try { s.stop() } catch { /* already stopped */ }
    }
  }
}
