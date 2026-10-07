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

// ── Where the opening meter and key are written ──
// MEI allows several places; files exported by notation software mostly use
// <scoreDef>, which the reader once ignored (2026-10-07).

describe('parseNative: opening meter and key', () => {
  const layer = '<note pname="f" oct="4" dur="4"/><rest dur="4"/><rest dur="4"/>'
  const withScoreDef = (scoreDefAttrs: string, staffDef = '') =>
    mei(layer, staffDef).replace('<scoreDef>', `<scoreDef ${scoreDefAttrs}>`)

  it('reads the meter from <scoreDef>', () => {
    const s = parseNative(withScoreDef('meter.count="3" meter.unit="4"'))
    expect([s.meterCount, s.meterUnit, s.measureBeats]).toEqual([3, 4, 3])
    expect(s.warnings.map((w) => w.code)).not.toContain('no-meter')
  })

  it('reads the meter from a <meterSig> element', () => {
    const xml = mei(layer, '').replace('lines="5" />', 'lines="5"><meterSig count="6" unit="8"/></staffDef>')
    expect(parseNative(xml).measureBeats).toBe(3)
  })

  it('reads the meter from any staff, not only the first', () => {
    const xml = mei(layer, '').replace('</staffGrp>', '<staffDef n="2" lines="5" meter.count="3" meter.unit="4"/></staffGrp>')
    expect(parseNative(xml).measureBeats).toBe(3)
  })

  it("falls back to the work's meter in the header", () => {
    const xml = mei(layer, '').replace('</fileDesc>', '</fileDesc><workList><work><meter count="3" unit="2"/></work></workList>')
    expect(parseNative(xml).measureBeats).toBe(6)
  })

  it('reads cut time from a meter symbol', () => {
    expect(parseNative(withScoreDef('meter.sym="cut"')).measureBeats).toBe(4)
  })

  it('reads the key from <scoreDef>, MEI 3 key.sig and <keySig>', () => {
    expect(parseNative(withScoreDef('keysig="1s"')).notes[0].name).toBe('F#4')
    expect(parseNative(mei(layer, 'key.sig="1s"')).notes[0].name).toBe('F#4')
    const xml = mei(layer, '').replace('lines="5" />', 'lines="5"><keySig sig="1s"/></staffDef>')
    expect(parseNative(xml).notes[0].name).toBe('F#4')
  })

  it("gives each staff its own key, the staff's before the score's", () => {
    const xml = withScoreDef('keysig="1s" meter.count="4" meter.unit="4"')
      .replace('</staffGrp>', '<staffDef n="2" lines="5" keysig="1f"/></staffGrp>')
      .replace('</staff></measure>', '</staff><staff n="2"><layer n="1"><note pname="b" oct="3" dur="1"/></layer></staff></measure>')
    expect(parseNative(xml).notes.map((n) => n.name)).toEqual(['F#4', 'A#3'])
  })
})

// ── Timing fixes ──

describe('parseNative: chords and pickup bars', () => {
  it("takes a chord's duration from its notes when the chord has none", () => {
    const s = parseNative(mei('<chord><note pname="c" oct="4" dur="2"/><note pname="e" oct="4" dur="2"/></chord><note pname="g" oct="4" dur="2"/>'))
    expect(s.notes.map((n) => [n.name, n.start, n.dur])).toEqual([
      ['C4', 0, 2],
      ['E4', 0, 2],
      ['G4', 2, 2],
    ])
    expect(s.warnings.map((w) => w.code)).not.toContain('no-dur')
  })

  it('keeps a pickup marked metcon="false" at its real length, and reports the bars', () => {
    const xml = mei('<note pname="g" oct="4" dur="4"/>', undefined, '<measure n="1"><staff n="1"><layer n="1"><note pname="c" oct="5" dur="1"/></layer></staff></measure>')
      .replace('<measure n="1">', '<measure n="0" metcon="false">')
    const s = parseNative(xml)
    expect(s.notes[1].start).toBe(1)
    expect(s.bars).toEqual([
      { start: 0, label: '0' },
      { start: 1, label: '1' },
    ])
    expect(s.warnings.map((w) => w.code)).not.toContain('short-bar')
  })
})

// ── Reading only the music, and resolving shorthand ──

describe('parseNative: what counts as the music', () => {
  it('ignores an incipit quoted in the header', () => {
    const incipit = '<workList><work><incip><score><section><measure n="1"><staff n="1"><layer><note pname="a" oct="5" dur="1"/></layer></staff></measure></section></score></incip></work></workList>'
    const s = parseNative(mei('<note pname="c" oct="4" dur="1"/>').replace('</fileDesc>', '</fileDesc>' + incipit))
    expect(s.notes.map((n) => n.name)).toEqual(['C4'])
    expect(s.bars).toHaveLength(1)
  })

  it('plays a copyof reference as a copy of what it points to', () => {
    const s = parseNative(mei('<chord xml:id="c1" dur="4"><note pname="c" oct="4"/><note pname="e" oct="4"/></chord><chord copyof="#c1"/><rest dur="2"/>'))
    expect(s.notes.map((n) => [n.name, n.start])).toEqual([
      ['C4', 0],
      ['E4', 0],
      ['C4', 1],
      ['E4', 1],
    ])
  })
})

// ── Warnings: the reader says what it leaves out ──

describe('parseNative: warnings', () => {
  it('reports ties', () => {
    expect(codes(mei('<note pname="c" oct="4" dur="1" tie="i"/>', undefined, '<measure n="2"><staff n="1"><layer n="1"><note pname="c" oct="4" dur="1" tie="t"/></layer></staff></measure>'))).toContain('tie')
  })

  it('pads an unmarked short bar, and reports the shift it causes', () => {
    const s = parseNative(mei('<note pname="g" oct="4" dur="4"/>', undefined, '<measure n="2"><staff n="1"><layer n="1"><note pname="c" oct="5" dur="1"/></layer></staff></measure>'))
    expect(s.notes[1].start).toBe(4) // padded: the known gap, now reported
    expect(s.warnings.map((w) => w.code)).toContain('short-bar')
  })

  it('reports grace notes it leaves off', () => {
    const s = parseNative(mei('<note pname="d" oct="5" dur="8" grace="acc"/><note pname="c" oct="5" dur="1"/>'))
    expect(s.notes).toHaveLength(1)
    expect(s.warnings.map((w) => w.code)).toContain('grace')
  })

  it('reports a file with no opening meter', () => {
    expect(codes(mei('<note pname="c" oct="4" dur="1"/>', ''))).toContain('no-meter')
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
