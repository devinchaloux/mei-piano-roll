import { findSound, type Sound } from './sounds'
import { playSynthNote } from './synth'

// ── The sound engine ──
// One per player. It owns the audio context, plays notes with whichever sound
// is selected, and downloads a sampled instrument only when it is chosen.

/** The part of a smplr instrument the engine uses. */
interface SampledInstrument {
  start(note: { note: number; time?: number; duration?: number; velocity?: number }): unknown
  stop(): void
  readonly load: Promise<unknown>
}

export type SoundStatus = 'ready' | 'loading' | 'error'

export class SoundEngine {
  readonly ctx: AudioContext
  private synthOut: GainNode
  private sampleOut: GainNode
  private sound: Sound
  // Sounding synth notes: a way to stop each, and when it ends on its own.
  private voices: Array<{ stop: () => void; end: number }> = []
  // Cached per instrument, so switching back and forth downloads nothing twice.
  // Each has its own output level, so the one being left can be silenced at once.
  private instruments = new Map<string, Promise<{ inst: SampledInstrument; out: GainNode }>>()
  private current: { inst: SampledInstrument; out: GainNode } | null = null

  constructor(soundId?: string) {
    const AC: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new AC()
    // The synths are raw oscillators, much louder than the recordings; these two
    // levels make switching between them roughly even.
    this.synthOut = this.ctx.createGain()
    this.synthOut.gain.value = 0.22
    this.synthOut.connect(this.ctx.destination)
    this.sampleOut = this.ctx.createGain()
    this.sampleOut.gain.value = 0.9
    this.sampleOut.connect(this.ctx.destination)
    this.sound = findSound(soundId)
  }

  get soundId(): string {
    return this.sound.id
  }

  /**
   * Switches sound. A synth is ready at once; a sampled instrument resolves when
   * its recordings have downloaded, and rejects if they can't be fetched.
   */
  async use(soundId: string): Promise<void> {
    this.sound = findSound(soundId)
    // The instrument being left fades out over a few milliseconds instead of
    // ringing on through its release while the new sound starts.
    if (this.current) {
      const now = this.ctx.currentTime
      this.current.out.gain.setTargetAtTime(0, now, 0.01)
      this.current = null
    }
    if (this.sound.kind === 'synth') return
    const wanted = this.sound
    const loaded = await this.loadInstrument(wanted.instrument)
    // Another sound may have been picked while this one downloaded.
    if (this.sound !== wanted) return
    loaded.out.gain.cancelScheduledValues(this.ctx.currentTime)
    loaded.out.gain.setValueAtTime(1, this.ctx.currentTime)
    this.current = loaded
  }

  private loadInstrument(name: string): Promise<{ inst: SampledInstrument; out: GainNode }> {
    let p = this.instruments.get(name)
    if (!p) {
      p = (async () => {
        // Imported here, not at the top, so pages that only use the synths never
        // download the sample library's code either.
        const { Soundfont } = await import('smplr')
        const out = this.ctx.createGain()
        out.connect(this.sampleOut)
        const inst = Soundfont(this.ctx, { instrument: name, kit: 'FluidR3_GM', destination: out }) as unknown as SampledInstrument
        await inst.load
        return { inst, out }
      })()
      // A failed download is forgotten, so choosing the sound again retries it.
      p.catch(() => this.instruments.delete(name))
      this.instruments.set(name, p)
    }
    return p
  }

  /** Schedules a note on the audio clock (seconds, as ctx.currentTime counts). */
  play(midi: number, when: number, duration: number): void {
    if (this.sound.kind === 'sampled') {
      if (!this.current) return
      const now = this.ctx.currentTime
      let t0 = when, d = duration
      if (t0 < now) { d -= now - t0; t0 = now }
      if (d > 0.001) this.current.inst.start({ note: midi, time: t0, duration: d })
      return
    }
    // Forget notes that have finished, so the list stays short in long pieces.
    const now = this.ctx.currentTime
    this.voices = this.voices.filter((v) => v.end > now)
    // The end allows for the longest release among the presets.
    this.voices.push({ stop: playSynthNote(this.ctx, this.synthOut, this.sound.id, midi, when, duration), end: when + duration + 2 })
  }

  stopAll(): void {
    for (const v of this.voices) v.stop()
    this.voices = []
    this.current?.inst.stop()
  }

  close(): void {
    this.stopAll()
    this.ctx.close().catch(() => {})
  }
}
