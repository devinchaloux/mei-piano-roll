// @vitest-environment jsdom
import { getSoundfontNames } from 'smplr'
import { SOUNDS, DEFAULT_SOUND, findSound } from '../audio/sounds'
import { RECIPES } from '../audio/synth'
import { THEMES, resolveTheme } from '../roll/themes'
import { rollToSvg } from '../render/svg'
import { parseNative } from '../mei/parseNative'

// ── Sounds ──

describe('sound catalogue', () => {
  it('has unique ids and the default exists', () => {
    const ids = SOUNDS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(findSound(DEFAULT_SOUND).id).toBe(DEFAULT_SOUND)
  })

  it('has a recipe for every synth', () => {
    for (const s of SOUNDS.filter((x) => x.kind === 'synth')) expect(RECIPES[s.id], s.id).toBeDefined()
  })

  it('names only instruments the sample library has', () => {
    // A typo here would only show as silence in the browser, so check it here.
    const known = new Set(getSoundfontNames())
    for (const s of SOUNDS) if (s.kind === 'sampled') expect(known.has(s.instrument), s.instrument).toBe(true)
  })

  it('includes the instruments asked for: piano and trumpet', () => {
    expect(findSound('piano').kind).toBe('sampled')
    expect(findSound('trumpet').kind).toBe('sampled')
  })

  it('falls back to the default for an unknown id', () => {
    expect(findSound('no-such-sound').id).toBe(DEFAULT_SOUND)
  })
})

// ── Themes ──

describe('themes', () => {
  it('resolves names, objects and nothing', () => {
    expect(resolveTheme(undefined)).toBe(THEMES.studio)
    expect(resolveTheme('paper')).toBe(THEMES.paper)
    const custom = { ...THEMES.ink, note: '#123456' }
    expect(resolveTheme(custom)).toBe(custom)
  })
})

// ── Image export ──

const FOUR_BARS = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <meiHead><fileDesc><titleStmt><title>Four bars &amp; more</title></titleStmt></fileDesc></meiHead>
  <music><body><mdiv><score>
    <scoreDef meter.count="4" meter.unit="4"><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef>
    <section>
      <measure n="1"><staff n="1"><layer n="1"><note pname="c" oct="4" dur="1"/></layer></staff></measure>
      <measure n="2"><staff n="1"><layer n="1"><note pname="e" oct="4" dur="1"/></layer></staff></measure>
      <measure n="3"><staff n="1"><layer n="1"><note pname="g" oct="4" dur="1"/></layer></staff></measure>
      <measure n="4"><staff n="1"><layer n="1"><note pname="c" oct="5" dur="1"/></layer></staff></measure>
    </section>
  </score></mdiv></body></music>
</mei>`

describe('rollToSvg', () => {
  const score = parseNative(FOUR_BARS)
  const noteRects = (svg: string) => (svg.match(/<rect [^>]*rx=/g) ?? []).length

  it('draws every note by default, with the title escaped', () => {
    const svg = rollToSvg(score)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(noteRects(svg)).toBe(4)
    expect(svg).toContain('<title>Four bars &amp; more</title>')
  })

  it('draws only the chosen bars', () => {
    expect(noteRects(rollToSvg(score, { fromBar: 2, toBar: 3 }))).toBe(2)
  })

  it('uses the theme and the note colour given', () => {
    const svg = rollToSvg(score, { theme: 'paper', noteColor: '#00ff00' })
    expect(svg).toContain(THEMES.paper.background)
    expect(svg).toContain('fill="#00ff00"')
  })

  it('leaves out the keyboard and the background on request', () => {
    const svg = rollToSvg(score, { keyboard: false, background: false })
    expect(svg).not.toContain(`fill="${THEMES.studio.keyWhite}"`)
    expect(svg).not.toContain(`<rect width="1200" height="400" fill=`)
  })
})
