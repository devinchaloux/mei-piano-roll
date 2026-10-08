// ── The transport: play, pause, seek, tempo and loop ──
// Feeds notes to the sound engine a fraction of a second ahead, on a short timer,
// instead of scheduling the whole piece at once. That is what makes pause, stop,
// seek, a tempo change or a new sound take effect immediately: nothing is queued
// further ahead than `lookahead`, so stopping the voices that are sounding stops
// everything. (Scheduling the whole piece up front left the sample library with
// a queue of future notes that its stop() doesn't clear.)
//
// Pure apart from the timer, with the clock and the sound passed in, so it is
// unit-tested with a fake clock (src/test/transport.test.ts).

export interface TransportNote {
  midi: number
  /** Quarter-note beats. */
  start: number
  dur: number
}

/** What the transport needs from the sound engine. */
export interface TransportOutput {
  /** The audio clock, in seconds. */
  now(): number
  play(midi: number, when: number, duration: number): void
  /** Silences every sounding note at once. */
  stopAll(): void
}

export interface TransportOptions {
  /** How far ahead notes are handed to the engine, in seconds. */
  lookahead?: number
  /** How often the timer runs, in milliseconds. */
  intervalMs?: number
  /** Gap between pressing play and the first note, so it isn't clipped. */
  startDelay?: number
}

export class Transport {
  loop = false
  /** Called when playback reaches the end without looping. */
  onEnd: (() => void) | null = null

  private notes: TransportNote[] = []
  private total = 0
  private bpm = 120
  private readonly lookahead: number
  private readonly intervalMs: number
  private readonly startDelay: number
  // While playing: the audio time at which beat 0 sounds.
  private anchor = 0
  // While stopped or paused: where playback will resume.
  private held = 0
  // Index of the next note to hand to the engine, and the beat playback
  // (re)started from: notes ending before it are skipped.
  private next = 0
  private from = 0
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private out: TransportOutput, options: TransportOptions = {}) {
    this.lookahead = options.lookahead ?? 0.12
    this.intervalMs = options.intervalMs ?? 25
    this.startDelay = options.startDelay ?? 0.05
  }

  get playing(): boolean {
    return this.timer !== null
  }

  get tempo(): number {
    return this.bpm
  }

  setScore(notes: TransportNote[], totalBeats: number): void {
    this.pause()
    this.notes = [...notes].sort((a, b) => a.start - b.start)
    this.total = totalBeats
    this.held = 0
  }

  /** The playhead, in beats. */
  position(): number {
    if (!this.playing) return this.held
    return Math.max(0, (this.out.now() - this.anchor) / this.spb())
  }

  play(): void {
    if (this.playing) return
    if (this.held >= this.total - 1e-6) this.held = 0
    this.startAt(this.held)
  }

  pause(): void {
    if (!this.playing) return
    this.held = Math.min(this.position(), this.total)
    this.halt()
  }

  /** Pause and return to the start. */
  stop(): void {
    this.halt()
    this.held = 0
  }

  seek(beat: number): void {
    const b = Math.min(Math.max(beat, 0), this.total)
    if (this.playing) {
      this.halt()
      this.startAt(b)
    } else {
      this.held = b
    }
  }

  /** Changes tempo, keeping the playhead where it is. */
  setTempo(bpm: number): void {
    if (!(bpm > 0)) return
    if (this.playing) {
      const b = this.position()
      this.halt()
      this.bpm = bpm
      this.startAt(b)
    } else {
      this.bpm = bpm
    }
  }

  /** Stops the timer for good (the player is going away). */
  dispose(): void {
    this.halt()
  }

  // ── Internals ──

  private spb(): number {
    return 60 / this.bpm
  }

  private startAt(beat: number): void {
    this.from = beat
    this.anchor = this.out.now() + this.startDelay - beat * this.spb()
    // Notes are sorted by start; begin at the first one not over before `beat`.
    this.next = 0
    while (this.next < this.notes.length && this.notes[this.next].start + this.notes[this.next].dur <= beat + 1e-6 && this.notes[this.next].start < beat) this.next++
    this.timer = setInterval(() => this.tick(), this.intervalMs)
    this.tick()
  }

  private halt(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    this.out.stopAll()
  }

  /** Exposed for tests; the timer calls it. */
  tick(): void {
    if (!this.playing) return
    const spb = this.spb()
    const horizon = this.out.now() + this.lookahead
    while (this.next < this.notes.length) {
      const n = this.notes[this.next]
      const when = this.anchor + n.start * spb
      if (when > horizon) break
      // A note already over by the restart point is skipped; one still sounding
      // there plays its remainder (the engine trims notes that start in the past).
      if (n.start + n.dur > this.from + 1e-6) this.out.play(n.midi, when, n.dur * spb)
      this.next++
    }
    if (this.position() >= this.total) {
      if (this.loop && this.total > 0) {
        this.halt()
        this.startAt(0)
      } else {
        this.halt()
        this.held = this.total
        this.onEnd?.()
      }
    }
  }
}
