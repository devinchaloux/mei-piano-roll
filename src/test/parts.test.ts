// @vitest-environment jsdom
import { parseNative } from '../mei/parseNative'
import { soundForPart } from '../audio/instruments'
import { findSound } from '../audio/sounds'
import { layoutLanes } from '../roll/lanes'
import { partColors, NOTE_COLORS } from '../roll/noteColors'
import { THEMES } from '../roll/themes'
import { rollToSvg } from '../render/svg'

// ── Helpers ──
// A score of several staves, written for these tests: `staffGrp` is the
// opening staff definitions, and each staff plays one whole note per bar.

function score(staffGrp: string, staves: { n: string; note: string }[]): string {
  const staffXml = staves.map((s) => `<staff n="${s.n}"><layer n="1"><note pname="${s.note}" oct="4" dur="1"/></layer></staff>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <meiHead><fileDesc><titleStmt><title>Parts</title></titleStmt></fileDesc></meiHead>
  <music><body><mdiv><score>
    <scoreDef meter.count="4" meter.unit="4">${staffGrp}</scoreDef>
    <section><measure n="1">${staffXml}</measure></section>
  </score></mdiv></body></music>
</mei>`
}

const labels = (xml: string) => parseNative(xml).parts.map((p) => p.label)

// ── Reading parts ──

describe('parseNative: parts', () => {
  it('gives a one-staff file one part, and every note part 0', () => {
    const s = parseNative(score('<staffGrp><staffDef n="1" lines="5"/></staffGrp>', [{ n: '1', note: 'c' }]))
    expect(s.parts).toEqual([{ label: 'Staff 1', staves: ['1'] }])
    expect(s.notes.map((n) => n.part)).toEqual([0])
  })

  it('makes each named staff its own part, from a label attribute or element', () => {
    const xml = score(
      '<staffGrp><staffDef n="1" label="Flute"/><staffDef n="2"><label>Violin</label></staffDef></staffGrp>',
      [{ n: '1', note: 'c' }, { n: '2', note: 'e' }],
    )
    const s = parseNative(xml)
    expect(s.parts.map((p) => [p.label, p.instrument])).toEqual([['Flute', 'Flute'], ['Violin', 'Violin']])
    expect(s.notes.map((n) => [n.name, n.part])).toEqual([['C4', 0], ['E4', 1]])
  })

  it("reads a braced pair of staves as one instrument, named by the group's instrDef", () => {
    const xml = score(
      '<staffGrp symbol="brace"><instrDef label="Piano" midi.instrnum="0"/><staffDef n="1"/><staffDef n="2"/></staffGrp>',
      [{ n: '1', note: 'c' }, { n: '2', note: 'e' }],
    )
    const s = parseNative(xml)
    expect(s.parts).toEqual([{ label: 'Piano', staves: ['1', '2'], instrument: 'Piano', midiProgram: 0 }])
    expect(s.notes.map((n) => n.part)).toEqual([0, 0])
  })

  it('reads an unnamed brace as one part, and names it by its staves', () => {
    const xml = score('<staffGrp symbol="brace"><staffDef n="1"/><staffDef n="2"/></staffGrp>', [{ n: '1', note: 'c' }, { n: '2', note: 'e' }])
    expect(labels(xml)).toEqual(['Staves 1–2'])
  })

  it('reads a named group of unnamed staves as one part, but not a group numbered "1"', () => {
    const named = score(
      '<staffGrp><staffDef n="1" label="Flute"/><staffGrp symbol="bracket"><label>Violini</label><staffDef n="2"/><staffDef n="3"/></staffGrp></staffGrp>',
      [{ n: '1', note: 'c' }, { n: '2', note: 'e' }, { n: '3', note: 'g' }],
    )
    expect(labels(named)).toEqual(['Flute', 'Violini'])
    const numbered = score('<staffGrp symbol="bracket"><label>1</label><staffDef n="1"/><staffDef n="2"/></staffGrp>', [{ n: '1', note: 'c' }, { n: '2', note: 'e' }])
    expect(labels(numbered)).toEqual(['Staff 1', 'Staff 2'])
  })

  it('reads a lone name on a later staff as naming that staff; the others take the group name', () => {
    const xml = score(
      '<staffGrp symbol="bracket"><label>Violini</label><staffDef n="1"/><staffDef n="2"/><staffDef n="3"><label>Viole</label></staffDef></staffGrp>',
      [{ n: '1', note: 'c' }, { n: '2', note: 'e' }, { n: '3', note: 'g' }],
    )
    expect(labels(xml)).toEqual(['Violini', 'Violini', 'Viole'])
  })

  it('keeps a braced group apart when its staves name different instruments', () => {
    const xml = score(
      '<staffGrp symbol="brace"><staffDef n="1" label="Violin I"/><staffDef n="2" label="Violin II"/></staffGrp>',
      [{ n: '1', note: 'c' }, { n: '2', note: 'e' }],
    )
    expect(labels(xml)).toEqual(['Violin I', 'Violin II'])
  })

  it("takes a staff's General MIDI program from its instrDef", () => {
    const xml = score('<staffGrp><staffDef n="1"><instrDef midi.instrnum="71"/></staffDef></staffGrp>', [{ n: '1', note: 'c' }])
    expect(parseNative(xml).parts[0]).toEqual({ label: 'Staff 1', staves: ['1'], midiProgram: 71 })
  })

  it('drops parts with no notes and renumbers the rest', () => {
    const xml = score(
      '<staffGrp><staffDef n="1" label="Empty"/><staffDef n="2" label="Cello"/></staffGrp>',
      [{ n: '2', note: 'c' }],
    )
    const s = parseNative(xml)
    expect(s.parts.map((p) => p.label)).toEqual(['Cello'])
    expect(s.notes[0].part).toBe(0)
  })

  it('gives a staff the definitions never mention a part of its own', () => {
    const xml = score('<staffGrp><staffDef n="1"/></staffGrp>', [{ n: '1', note: 'c' }, { n: '2', note: 'e' }])
    expect(labels(xml)).toEqual(['Staff 1', 'Staff 2'])
  })
})

// ── Starting sounds ──

describe('soundForPart', () => {
  it('matches General MIDI programs to the nearest sound', () => {
    expect(soundForPart({ midiProgram: 0 })).toBe('piano')
    expect(soundForPart({ midiProgram: 56 })).toBe('trumpet')
    expect(soundForPart({ midiProgram: 71 })).toBe('clarinet')
    expect(soundForPart({ midiProgram: 80 })).toBe('square-lead')
    expect(soundForPart({ midiProgram: 47 })).toBeNull() // timpani: nothing near
  })

  it('matches instrument names in English, Italian and German, the specific word first', () => {
    expect(soundForPart({ instrument: 'Bass Trombone' })).toBe('brass')
    expect(soundForPart({ instrument: 'Electric Piano' })).toBe('electric-piano')
    expect(soundForPart({ instrument: 'Violoncello' })).toBe('cello')
    expect(soundForPart({ instrument: 'Violini' })).toBe('violin')
    expect(soundForPart({ instrument: 'Violine2' })).toBe('violin')
    expect(soundForPart({ instrument: 'Viole' })).toBe('violin')
    expect(soundForPart({ instrument: 'Violone' })).toBeNull()
    expect(soundForPart({ instrument: 'Flauti' })).toBe('flute')
    expect(soundForPart({ instrument: 'Klarinette in B' })).toBe('clarinet')
    expect(soundForPart({ instrument: 'Soprano' })).toBe('choir')
    expect(soundForPart({ instrument: 'Bass' })).toBeNull() // a voice or a double bass: can't tell
    expect(soundForPart({})).toBeNull()
  })

  it('prefers the program to the name, and names only sounds that exist', () => {
    expect(soundForPart({ instrument: 'Piano', midiProgram: 40 })).toBe('violin')
    for (let p = 0; p < 128; p++) {
      const id = soundForPart({ midiProgram: p })
      if (id) expect(findSound(id).id, `program ${p}`).toBe(id)
    }
  })
})

// ── Lanes ──

describe('layoutLanes', () => {
  const notes = [
    { midi: 84, start: 0, dur: 1, name: 'C6', part: 0 },
    { midi: 36, start: 0, dur: 1, name: 'C2', part: 1 },
  ]

  it('puts every part on one roll, spanning all their pitches', () => {
    expect(layoutLanes(notes, { separate: false, top: 20, height: 300 })).toEqual([{ parts: [0, 1], lo: 35, hi: 85, top: 20, height: 300 }])
  })

  it('gives each part its own lane, fitted to its own range', () => {
    const lanes = layoutLanes(notes, { separate: true, top: 0, height: 206, gap: 6 })
    expect(lanes.map((l) => [l.parts, l.lo, l.hi, l.top, l.height])).toEqual([[[0], 83, 85, 0, 100], [[1], 35, 37, 106, 100]])
  })
})

// ── Part colors ──

describe('partColors', () => {
  it('starts with the note color, never repeats it next, and suits the theme', () => {
    const dark = partColors(3, THEMES.studio, '#ff5ca0')
    expect(dark[0]).toBe('#ff5ca0')
    expect(new Set(dark).size).toBe(3)
    const sky = NOTE_COLORS.find((c) => c.name === 'Sky')!
    expect(partColors(2, THEMES.paper, '#000000')[1]).toBe(sky.onLight)
    expect(partColors(2, THEMES.studio, sky.color)[1]).not.toBe(sky.color)
  })
})

// ── Images of several parts ──

describe('rollToSvg with parts', () => {
  const s = parseNative(score(
    '<staffGrp><staffDef n="1" label="Flute"/><staffDef n="2" label="Cello"/></staffGrp>',
    [{ n: '1', note: 'c' }, { n: '2', note: 'e' }],
  ))

  it('colors each part', () => {
    const svg = rollToSvg(s, { partColors: ['#111111', '#222222'] })
    expect(svg).toContain('fill="#111111"')
    expect(svg).toContain('fill="#222222"')
  })

  it('labels each lane when the parts are separated, and fades the parts asked', () => {
    const svg = rollToSvg(s, { separateParts: true, fadedParts: [1] })
    expect(svg).toContain('>Flute</text>')
    expect(svg).toContain('>Cello</text>')
    expect((svg.match(/opacity="0.3"/g) ?? []).length).toBe(1)
    expect(rollToSvg(s)).not.toContain('>Flute</text>')
  })
})
