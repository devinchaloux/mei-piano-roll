import { Transport, type TransportNote, type TransportOutput } from '../audio/transport'

// ── A fake audio clock and engine ──
// Time only moves when a test moves it, and every note the transport hands over
// is recorded, so "nothing plays after pause" can be checked exactly.

function rig(notes: TransportNote[], total: number) {
  let time = 0
  const played: { midi: number; when: number }[] = []
  let stops = 0
  const out: TransportOutput = {
    now: () => time,
    play: (midi, when) => { played.push({ midi, when }) },
    stopAll: () => { stops++ },
  }
  const t = new Transport(out, { lookahead: 0.1, intervalMs: 25, startDelay: 0 })
  t.setScore(notes, total)
  const advance = (seconds: number) => {
    // Step in timer-sized slices, as the real interval would.
    for (let s = 0; s < seconds; s += 0.025) {
      time += 0.025
      vi.advanceTimersByTime(25)
    }
  }
  return { t, played, advance, stops: () => stops }
}

// Eight quarter notes at 120 bpm: one every half second.
const scale: TransportNote[] = Array.from({ length: 8 }, (_, i) => ({ midi: 60 + i, start: i, dur: 1 }))

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('Transport', () => {
  it('hands notes over just ahead of time, not all at once', () => {
    const { t, played, advance } = rig(scale, 8)
    t.play()
    expect(played.map((p) => p.midi)).toEqual([60])
    advance(1)
    expect(played.length).toBeLessThan(5)
  })

  it('plays nothing more after pause, and silences what is sounding', () => {
    const { t, played, advance, stops } = rig(scale, 8)
    t.play()
    advance(1)
    const before = played.length
    t.pause()
    expect(stops()).toBeGreaterThan(0)
    advance(3)
    expect(played.length).toBe(before)
    expect(t.playing).toBe(false)
  })

  it('resumes where it paused', () => {
    const { t, advance } = rig(scale, 8)
    t.play()
    advance(1.5)
    t.pause()
    const at = t.position()
    expect(at).toBeGreaterThan(2.5)
    advance(2)
    expect(t.position()).toBe(at)
  })

  it('ignores a second play while playing, so nothing doubles', () => {
    const { t, played, advance } = rig(scale, 8)
    t.play()
    t.play()
    advance(4.2)
    const midis = played.map((p) => p.midi)
    expect(new Set(midis).size).toBe(midis.length)
  })

  it('keeps the playhead in place when the tempo changes', () => {
    const { t, advance } = rig(scale, 8)
    t.play()
    advance(1)
    const before = t.position()
    t.setTempo(60)
    expect(t.position()).toBeCloseTo(before, 1)
    expect(t.tempo).toBe(60)
  })

  it('seeks while playing without replaying earlier notes', () => {
    const { t, played } = rig(scale, 8)
    t.play()
    played.length = 0
    t.seek(5)
    expect(played.map((p) => p.midi)).toEqual([65])
  })

  it('stops at the end and reports it; stop returns to the start', () => {
    const { t, advance } = rig(scale, 8)
    let ended = false
    t.onEnd = () => { ended = true }
    t.play()
    advance(4.5)
    expect(ended).toBe(true)
    expect(t.playing).toBe(false)
    t.stop()
    expect(t.position()).toBe(0)
  })

  it('starts again from the top when looping', () => {
    const { t, played, advance } = rig(scale, 8)
    t.loop = true
    t.play()
    advance(4.6)
    expect(t.playing).toBe(true)
    expect(played.filter((p) => p.midi === 60).length).toBe(2)
  })
})
