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
  private voices: Array<() => void> = []
  // Cached per instrument, so switching back and forth downloads nothing twice.
  private instruments = new Map<string, Promise<SampledInstrument>>()
  private current: SampledInstrument | null = null

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
    if (this.sound.kind === 'synth') {
      this.current = null
      return
    }
    const wanted = this.sound
    const inst = await this.loadInstrument(wanted.instrument)
    // Another sound may have been picked while this one downloaded.
    if (this.sound === wanted) this.current = inst
  }

  private loadInstrument(name: string): Promise<SampledInstrument> {
    let p = this.instruments.get(name)
    if (!p) {
      p = (async () => {
        // Imported here, not at the top, so pages that only use the synths never
        // download the sample library's code either.
        const { Soundfont } = await import('smplr')
        const inst = Soundfont(this.ctx, { instrument: name, kit: 'FluidR3_GM', destination: this.sampleOut }) as unknown as SampledInstrument
        await inst.load
        return inst
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
      if (d > 0.001) this.current.start({ note: midi, time: t0, duration: d })
      return
    }
    this.voices.push(playSynthNote(this.ctx, this.synthOut, this.sound.id, midi, when, duration))
  }

  stopAll(): void {
    for (const stop of this.voices) stop()
    this.voices = []
    this.current?.stop()
  }

  close(): void {
    this.stopAll()
    this.ctx.close().catch(() => {})
  }
}
