// @vitest-environment jsdom
import { parseNative } from '../mei/parseNative'

// ── Helpers ──
// Each test writes a few bars of MEI by hand, aimed at one behaviour. They are
// written for these tests, so no sample file (and no licence question) is needed.

function mei(layer: string, staffDef = 'meter.count="4" meter.unit="4"', extraMeasures = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <meiHead><fileDesc><titleStmt><title>Test</title></titleStmt></fileDesc></meiHead>
  <music><body><mdiv><score>
    <scoreDef><staffGrp><staffDef n="1" lines="5" ${staffDef}/></staffGrp></scoreDef>
    <section>
      <measure n="1"><staff n="1"><layer n="1">${layer}</layer></staff></measure>
      ${extraMeasures}
    </section>
  </score></mdiv></body></music>
</mei>`
}

const codes = (xml: string) => parseNative(xml).warnings.map((w) => w.code)

// ── Pitch and time ──

describe('parseNative: pitch and time', () => {
  it('reads quarter notes in order, in quarter-note beats', () => {
    const s = parseNative(mei('<note pname="c" oct="4" dur="4"/><note pname="d" oct="4" dur="4"/><note pname="e" oct="4" dur="2"/>'))
    expect(s.notes.map((n) => [n.name, n.start, n.dur])).toEqual([
      ['C4', 0, 1],
      ['D4', 1, 1],
      ['E4', 2, 2],
    ])
    expect(s.notes[0].midi).toBe(60)
    expect(s.warnings).toEqual([])
  })

  it('lengthens dotted notes', () => {
    const s = parseNative(mei('<note pname="c" oct="4" dur="2" dots="1"/><note pname="c" oct="4" dur="4"/>'))
    expect(s.notes[0].dur).toBe(3)
    expect(s.notes[1].start).toBe(3)
  })

  it('gives every note of a chord the same onset', () => {
    const s = parseNative(mei('<chord dur="1"><note pname="c" oct="4"/><note pname="e" oct="4"/><note pname="g" oct="4"/></chord>'))
    expect(s.notes.map((n) => n.start)).toEqual([0, 0, 0])
    expect(s.notes.map((n) => n.midi)).toEqual([60, 64, 67])
  })

  it('squeezes a triplet into the time of two', () => {
    const s = parseNative(mei('<tuplet num="3" numbase="2"><note pname="c" oct="4" dur="8"/><note pname="d" oct="4" dur="8"/><note pname="e" oct="4" dur="8"/></tuplet><rest dur="4"/><rest dur="2"/>'))
    expect(s.notes[2].start).toBeCloseTo(2 / 3)
    expect(s.notes[2].dur).toBeCloseTo(1 / 3)
  })

  it('applies the key signature unless the note has its own accidental', () => {
    const s = parseNative(mei('<note pname="f" oct="4" dur="4"/><note pname="f" oct="4" dur="4" accid="n"/><rest dur="2"/>', 'meter.count="4" meter.unit="4" keysig="1s"'))
    expect(s.notes.map((n) => n.name)).toEqual(['F#4', 'F4'])
  })

  it('times each layer from the start of the bar', () => {
    const xml = mei('<note pname="c" oct="5" dur="1"/>').replace(
      '</layer></staff>',
      '</layer><layer n="2"><note pname="c" oct="3" dur="2"/><note pname="g" oct="3" dur="2"/></layer></staff>',
    )
    const s = parseNative(xml)
    expect(s.notes.map((n) => [n.name, n.start])).toEqual([
      ['C5', 0],
      ['C3', 0],
      ['G3', 2],
    ])
  })
})

// ── Warnings: the reader says what it leaves out ──

describe('parseNative: warnings', () => {
  it('reports ties', () => {
    expect(codes(mei('<note pname="c" oct="4" dur="1" tie="i"/>', undefined, '<measure n="2"><staff n="1"><layer n="1"><note pname="c" oct="4" dur="1" tie="t"/></layer></staff></measure>'))).toContain('tie')
  })

  it('reports a pickup bar and the shift it causes', () => {
    const s = parseNative(mei('<note pname="g" oct="4" dur="4"/>', undefined, '<measure n="2"><staff n="1"><layer n="1"><note pname="c" oct="5" dur="1"/></layer></staff></measure>'))
    expect(s.notes[1].start).toBe(4) // padded: the known gap, now reported
    expect(s.warnings.map((w) => w.code)).toContain('short-bar')
  })

  it('reports grace notes it leaves off', () => {
    const s = parseNative(mei('<note pname="d" oct="5" dur="8" grace="acc"/><note pname="c" oct="5" dur="1"/>'))
    expect(s.notes).toHaveLength(1)
    expect(s.warnings.map((w) => w.code)).toContain('grace')
  })

  it('reports a meter written as <meterSig>, which it does not read', () => {
    const xml = mei('<note pname="c" oct="4" dur="1"/>', '').replace('lines="5" />', 'lines="5"><meterSig count="3" unit="4"/></staffDef>')
    expect(codes(xml)).toContain('meter-elsewhere')
  })

  it('reports transposing instruments', () => {
    expect(codes(mei('<note pname="c" oct="4" dur="1"/>', 'meter.count="4" meter.unit="4" trans.semi="-2" trans.diat="-1"'))).toContain('transposing')
  })

  it('reports an unreadable duration instead of breaking the timeline', () => {
    const s = parseNative(mei('<note pname="c" oct="4" dur="x"/><note pname="d" oct="4" dur="4"/>'))
    expect(s.notes[1].start).toBe(0)
    expect(Number.isFinite(s.totalBeats)).toBe(true)
    expect(s.warnings.map((w) => w.code)).toContain('bad-dur')
  })

  it('names elements it skips', () => {
    expect(codes(mei('<note pname="c" oct="4" dur="1"/><foo/>'))).toContain('skipped:foo')
  })

  it('throws on a file that is not XML', () => {
    expect(() => parseNative('<mei><unclosed></mei>')).toThrow(/XML parse error/)
  })
})
