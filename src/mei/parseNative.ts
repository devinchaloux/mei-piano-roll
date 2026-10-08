import type { MeiBar, MeiNote, MeiPart, MeiScore, MeiWarning } from './types'

/* ===========================================================================
 * The native reader: a small MEI reader with no dependencies.
 *
 * Meant for short, cleanly encoded files. It reads the opening meter, each
 * staff's opening key and the first tempo once, groups the staves into parts
 * (instruments), walks every layer of every measure, and turns notes and chords
 * into MeiNote records. What it cannot do
 * (ties, repeats, unmarked short bars, mid-piece changes, transposing
 * instruments) it reports as warnings rather than hiding. Files that need those go to the second reader,
 * not built yet (docs/decisions.md).
 *
 * Browser only: it uses the browser's DOMParser. Tests run it under jsdom.
 * ======================================================================== */

// ── Constants ──

const MEI_NS = 'http://www.music-encoding.org/ns/mei'
const STEP: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
const SHARP_ORDER = ['f', 'c', 'g', 'd', 'a', 'e', 'b']
const FLAT_ORDER = ['b', 'e', 'a', 'd', 'g', 'c', 'f']
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Layer children that carry no sounding time, so skipping them loses nothing
// a piano roll shows. Anything else unrecognized is reported.
const SILENT_IN_LAYER = new Set(['clef', 'clefGrp', 'barLine', 'custos', 'sb', 'pb', 'cb', 'colLayout', 'annot', 'dot', 'accid', 'artic'])

// ── Warnings ──

/** Collects one warning per kind, counting repeats. */
class Warnings {
  private byCode = new Map<string, MeiWarning>()

  add(code: string, message: string, times = 1): void {
    const w = this.byCode.get(code)
    if (w) w.count += times
    else this.byCode.set(code, { code, message, count: times })
  }

  list(): MeiWarning[] {
    return [...this.byCode.values()]
  }
}

// ── DOM helpers ──

function childrenNamed(parent: Element, name: string): Element[] {
  const out: Element[] = []
  for (const c of Array.from(parent.children)) if (c.localName === name) out.push(c)
  return out
}

// Files are meant to use the MEI namespace, but some older or hand-made ones
// don't; fall back to plain tag names so those still read.
function firstDeep(root: Document | Element, name: string): Element | null {
  const ns = root.getElementsByTagNameNS(MEI_NS, name)
  if (ns.length) return ns[0]
  const plain = root.getElementsByTagName(name)
  return plain.length ? plain[0] : null
}

function allDeep(root: Document | Element, name: string): Element[] {
  let list = root.getElementsByTagNameNS(MEI_NS, name)
  if (!list.length) list = root.getElementsByTagName(name)
  return Array.from(list)
}

// ── Pitch ──

function accidValue(code: string | null): number | null {
  switch (code) {
    case 's': return 1
    case 'ss': case 'x': return 2
    case 'f': return -1
    case 'ff': return -2
    case 'n': return 0
    default: return null
  }
}

function keysigAlter(keysig: string | null, pname: string): number {
  if (!keysig || keysig === '0') return 0
  const m = /^(\d+)\s*([sf])$/.exec(keysig.trim())
  if (!m) return 0
  const count = parseInt(m[1], 10)
  const sharp = m[2] === 's'
  const order = sharp ? SHARP_ORDER : FLAT_ORDER
  for (let i = 0; i < count && i < 7; i++) {
    if (order[i] === pname) return sharp ? 1 : -1
  }
  return 0
}

function noteToMidi(noteEl: Element, keysig: string | null): number | null {
  const pname = (noteEl.getAttribute('pname') || '').toLowerCase()
  const oct = parseInt(noteEl.getAttribute('oct') || '', 10)
  if (!(pname in STEP) || isNaN(oct)) return null

  // A written accidental wins; failing that, the sounding (gestural) one; failing
  // that, the key signature. Accidentals carried through the bar are not applied.
  let alter: number | null =
    accidValue(noteEl.getAttribute('accid')) ?? accidValue(noteEl.getAttribute('accid.ges'))
  if (alter === null) {
    for (const c of childrenNamed(noteEl, 'accid')) {
      const v = accidValue(c.getAttribute('accid')) ?? accidValue(c.getAttribute('accid.ges'))
      if (v !== null) { alter = v; break }
    }
  }
  if (alter === null) alter = keysigAlter(keysig, pname)
  return (oct + 1) * 12 + STEP[pname] + alter
}

export function midiName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1)
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12)
}

// ── Duration ──

// MEI's @dur is the note value's denominator (4 = quarter, 8 = eighth); the roll
// counts in quarter-note beats, so a quarter is 1 and a half is 2.
function durToBeats(node: Element, scale: number, warn: Warnings): number {
  const durAttr = node.getAttribute('dur')
  if (!durAttr) {
    warn.add('no-dur', 'Notes without a written length take no time.')
    return 0
  }
  let base: number
  if (durAttr === 'long') base = 16
  else if (durAttr === 'breve') base = 8
  else base = 4 / parseInt(durAttr, 10)
  if (!isFinite(base) || base <= 0) {
    warn.add('bad-dur', `Unreadable note lengths (like "${durAttr}") take no time.`)
    return 0
  }
  const dots = parseInt(node.getAttribute('dots') || '0', 10)
  let mult = 1, add = 0.5
  for (let i = 0; i < dots; i++) { mult += add; add /= 2 }
  return base * mult * scale
}

// ── Walking a layer ──

interface LayerEnv {
  resolve: (el: Element) => Element
  keysig: string | null
  part: number
  measureBeats: number
  notes: MeiNote[]
  warn: Warnings
}

function pushNote(n: Element, start: number, beats: number, env: LayerEnv): void {
  const midi = noteToMidi(n, env.keysig)
  if (midi === null) {
    env.warn.add('no-pitch', 'Notes without a pitch are left out.')
    return
  }
  if (n.getAttribute('tie') === 'm' || n.getAttribute('tie') === 't') {
    env.warn.add('tie', 'Tied notes play as separate notes.')
  }
  env.notes.push({ midi, start, dur: beats, name: midiName(midi), part: env.part })
}

function walkLayer(node: Element, ctx: { t: number }, env: LayerEnv, scale: number): void {
  for (const raw of Array.from(node.children)) {
    const child = env.resolve(raw)
    const tag = child.localName
    if (tag === 'beam' || tag === 'graceGrp' || tag === 'bTrem' || tag === 'fTrem') {
      walkLayer(child, ctx, env, scale)
    } else if (tag === 'tuplet') {
      // A triplet (num 3, numbase 2) squeezes three notes into the time of two.
      const num = parseInt(child.getAttribute('num') || '3', 10)
      const numbase = parseInt(child.getAttribute('numbase') || '2', 10)
      walkLayer(child, ctx, env, scale * (numbase / num))
    } else if (tag === 'chord') {
      // Some files write the duration on each note of a chord instead of on the
      // chord itself; then take it from the first note that has one.
      const durSource = child.getAttribute('dur') ? child : childrenNamed(child, 'note').find((n) => n.getAttribute('dur')) ?? child
      const beats = durToBeats(durSource, scale, env.warn)
      for (const n of childrenNamed(child, 'note')) pushNote(n, ctx.t, beats, env)
      ctx.t += beats
    } else if (tag === 'note') {
      if (child.getAttribute('grace')) {
        env.warn.add('grace', 'Grace notes are left out.')
        continue
      }
      const beats = durToBeats(child, scale, env.warn)
      pushNote(child, ctx.t, beats, env)
      ctx.t += beats
    } else if (tag === 'rest' || tag === 'space') {
      ctx.t += durToBeats(child, scale, env.warn)
    } else if (tag === 'mRest' || tag === 'mSpace') {
      ctx.t += env.measureBeats
    } else if (tag === 'multiRest') {
      ctx.t += env.measureBeats * parseInt(child.getAttribute('num') || '1', 10)
    } else if (tag === 'keySig' || tag === 'meterSig') {
      env.warn.add('mid-change', 'Only the opening key, meter and tempo are used.')
    } else if (!SILENT_IN_LAYER.has(tag)) {
      env.warn.add(`skipped:${tag}`, `<${tag}> is not shown.`)
    }
  }
}

// ── Shorthand references ──
// copyof="#id" means "the same content as that element": a shorthand for
// literal repeats (one sample, Schubert's Erlkönig, writes its repeated
// triplets this way). Resolve it to the element it copies.

function makeResolver(doc: Document): (el: Element) => Element {
  // Built on first use, since most files have no copyof at all. A tree walk,
  // not Array.from(getElementsByTagName('*')): in jsdom, copying that live list
  // slows with every element and never finished on a 4 MB sample.
  let byId: Map<string, Element> | null = null
  const index = () => {
    const map = new Map<string, Element>()
    const walker = doc.createTreeWalker(doc, 1 /* NodeFilter.SHOW_ELEMENT */)
    while (walker.nextNode()) {
      const el = walker.currentNode as Element
      const id = el.getAttribute('xml:id')
      if (id) map.set(id, el)
    }
    return map
  }
  return (el) => {
    let current = el
    // A copy of a copy is allowed; the limit only stops a reference loop.
    for (let hops = 0; hops < 8; hops++) {
      const ref = current.getAttribute('copyof')
      if (!ref || current.children.length) return current
      byId ??= index()
      const target = byId.get(ref.replace(/^#/, ''))
      if (!target) return current
      current = target
    }
    return current
  }
}

// ── Opening meter and key ──
// MEI lets a file state these in several places: as attributes on a <staffDef>
// or on the <scoreDef> around it, or (MEI 4 and later) as <meterSig>/<keySig>
// elements inside them. MEI 3 spells the key attribute key.sig. Look in each,
// the staff before the score, so a staff's own value wins.

function firstAttr(els: (Element | null)[], ...names: string[]): string | null {
  for (const el of els) {
    if (!el) continue
    for (const n of names) {
      const v = el.getAttribute(n)
      if (v) return v
    }
  }
  return null
}

interface OpeningMeter {
  count: number
  unit: number
  found: boolean
}

// Order of preference: a staff's own meter (any staff, not only the first),
// then the score's, then a <meterSig> anywhere in the opening definitions, then
// the work's meter in the file's header (<meiHead>), which some files give only there.
function openingMeter(scoreDef: Element | null, doc: Document): OpeningMeter {
  const staffDefs = scoreDef ? allDeep(scoreDef, 'staffDef') : []
  const candidates: Element[] = [
    ...staffDefs.filter((d) => d.getAttribute('meter.count') || d.getAttribute('meter.sym')),
    ...(scoreDef && (scoreDef.getAttribute('meter.count') || scoreDef.getAttribute('meter.sym')) ? [scoreDef] : []),
  ]
  const fromAttrs = candidates.map((el) => meterFrom(el.getAttribute('meter.count'), el.getAttribute('meter.unit'), el.getAttribute('meter.sym')))
  const sig = scoreDef && firstDeep(scoreDef, 'meterSig')
  const head = firstDeep(doc, 'meiHead')
  const headMeter = head && firstDeep(head, 'meter')
  return (
    fromAttrs.find((m) => m.found) ??
    [sig, headMeter].map((el) => meterFrom(el?.getAttribute('count') ?? null, el?.getAttribute('unit') ?? null, el?.getAttribute('sym') ?? null)).find((m) => m.found) ??
    { count: 4, unit: 4, found: false }
  )
}

function meterFrom(countText: string | null, unitText: string | null, sym: string | null): OpeningMeter {
  if (countText && unitText) {
    // An additive meter such as "3+2" counts its parts together.
    const count = countText.split('+').reduce((sum, part) => sum + (parseInt(part, 10) || 0), 0)
    const unit = parseInt(unitText, 10)
    if (count > 0 && unit > 0) return { count, unit, found: true }
  }
  // A meter given only as a symbol: common time is 4/4, cut time 2/2.
  if (sym === 'common') return { count: 4, unit: 4, found: true }
  if (sym === 'cut') return { count: 2, unit: 2, found: true }
  return { count: 4, unit: 4, found: false }
}

function keyOf(def: Element | null): string | null {
  if (!def) return null
  return firstAttr([def], 'keysig', 'key.sig') ?? childrenNamed(def, 'keySig')[0]?.getAttribute('sig') ?? null
}

// Each staff's opening key, by staff number, falling back to the score's.
function openingKeys(scoreDef: Element | null, root: Document | Element): { byStaff: Map<string, string | null>; score: string | null } {
  const score = keyOf(scoreDef)
  const byStaff = new Map<string, string | null>()
  for (const def of allDeep(scoreDef ?? root, 'staffDef')) {
    const n = def.getAttribute('n') || ''
    if (!byStaff.has(n)) byStaff.set(n, keyOf(def) ?? score)
  }
  return { byStaff, score }
}

// ── Parts ──
// A part is one instrument. Most files give each instrument its own staff, but
// a piano or harp spans two staves under a brace, and a group of staves can
// carry one name ("Violini" over the first and second violins). So a group is
// read as one part when it is braced or names an instrument, and its staves
// don't name different instruments; otherwise each staff is its own part, and
// an unnamed staff takes the name of the group around it.

function textOf(el: Element | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

// MEI 3 names a staff or group in a label attribute; MEI 4 and later in a
// <label> element.
function labelOf(def: Element): string {
  return (def.getAttribute('label') ?? '').trim() || textOf(childrenNamed(def, 'label')[0])
}

function instrumentOf(def: Element): { instrument?: string; midiProgram?: number } {
  const d = childrenNamed(def, 'instrDef')[0]
  if (!d) return {}
  const name = (d.getAttribute('label') ?? '').trim() || (d.getAttribute('midi.instrname') ?? '').replace(/_/g, ' ').trim()
  const program = parseInt(d.getAttribute('midi.instrnum') ?? '', 10)
  return {
    ...(name ? { instrument: name } : {}),
    ...(program >= 0 && program <= 127 ? { midiProgram: program } : {}),
  }
}

function isOneInstrument(grp: Element): boolean {
  const staves = childrenNamed(grp, 'staffDef')
  if (!staves.length || childrenNamed(grp, 'staffGrp').length) return false
  if (staves.some((d) => childrenNamed(d, 'instrDef').length)) return false
  const names = new Set(staves.map((d) => labelOf(d).toLowerCase()).filter(Boolean))
  if (names.size > 1) return false
  // Notation software often names only a piano's first staff; a name on a
  // later staff alone names that staff (a viola inside a group of violins).
  if (names.size === 1 && !labelOf(staves[0])) return false
  const named = !!nameOfGroup(grp) || childrenNamed(grp, 'instrDef').length > 0
  return named || grp.getAttribute('symbol') === 'brace'
}

// A group's name, if it has one. A bare number ("1") numbers the group; it
// doesn't name an instrument.
function nameOfGroup(grp: Element): string {
  const label = labelOf(grp)
  return /\D/.test(label) ? label : ''
}

class PartTable {
  readonly parts: MeiPart[] = []
  private byStaff = new Map<string, number>()

  /** Reads the opening score definition's staves and groups, in score order. */
  constructor(scoreDef: Element | null) {
    if (scoreDef) this.visit(scoreDef)
  }

  /** The part a staff belongs to; a staff the definitions never mention gets a part of its own. */
  partOf(staffN: string): number {
    const known = this.byStaff.get(staffN)
    if (known !== undefined) return known
    return this.add([staffN], `Staff ${staffN}`, {})
  }

  private visit(parent: Element, groupLabel = ''): void {
    for (const child of Array.from(parent.children)) {
      if (child.localName === 'staffDef') this.addStaff(child, groupLabel)
      else if (child.localName === 'staffGrp') {
        if (isOneInstrument(child)) this.addGroup(child)
        else this.visit(child, nameOfGroup(child) || groupLabel)
      }
    }
  }

  private addStaff(def: Element, groupLabel: string): void {
    const n = def.getAttribute('n') ?? ''
    if (this.byStaff.has(n)) return
    const inst = instrumentOf(def)
    const label = labelOf(def) || inst.instrument || textOf(childrenNamed(def, 'labelAbbr')[0]) || groupLabel
    this.add([n], label || `Staff ${n}`, { instrument: inst.instrument ?? (label || undefined), midiProgram: inst.midiProgram })
  }

  private addGroup(grp: Element): void {
    const staves = childrenNamed(grp, 'staffDef').map((d) => d.getAttribute('n') ?? '').filter((n) => !this.byStaff.has(n))
    if (!staves.length) return
    const inst = instrumentOf(grp)
    const staffLabel = childrenNamed(grp, 'staffDef').map(labelOf).find(Boolean)
    const label = inst.instrument || staffLabel || nameOfGroup(grp)
    const fallback = staves.length > 1 ? `Staves ${staves[0]}–${staves[staves.length - 1]}` : `Staff ${staves[0]}`
    this.add(staves, label || fallback, { instrument: label || undefined, midiProgram: inst.midiProgram })
  }

  private add(staves: string[], label: string, inst: { instrument?: string; midiProgram?: number }): number {
    const part: MeiPart = { label, staves }
    if (inst.instrument) part.instrument = inst.instrument
    if (inst.midiProgram !== undefined) part.midiProgram = inst.midiProgram
    this.parts.push(part)
    for (const n of staves) this.byStaff.set(n, this.parts.length - 1)
    return this.parts.length - 1
  }
}

// Parts with no notes (an empty staff, a staff of rests) are dropped, so every
// part a player lists can be heard. Notes are renumbered to match.
function keepSoundingParts(parts: MeiPart[], notes: MeiNote[]): MeiPart[] {
  const used = new Set(notes.map((n) => n.part))
  const renumber = new Map<number, number>()
  const kept: MeiPart[] = []
  parts.forEach((p, i) => {
    if (!used.has(i)) return
    renumber.set(i, kept.length)
    kept.push(p)
  })
  for (const n of notes) n.part = renumber.get(n.part)!
  return kept
}

// ── Whole-file checks ──
// Things the reader knowingly gets wrong, detected up front so they are reported
// even when they don't change a single note.

function checkFile(doc: Document | Element, meter: OpeningMeter, warn: Warnings): void {
  if (!meter.found && allDeep(doc, 'measure').length) {
    warn.add('no-meter', 'No meter given, so bars assume 4/4.')
  }

  const defs = [...allDeep(doc, 'scoreDef'), ...allDeep(doc, 'staffDef')]
  const meters = new Set(defs.map((d) => d.getAttribute('meter.count') && `${d.getAttribute('meter.count')}/${d.getAttribute('meter.unit')}`).filter(Boolean))
  const tempos = new Set(allDeep(doc, 'tempo').map((t) => t.getAttribute('midi.bpm')).filter(Boolean))
  if (meters.size > 1 || tempos.size > 1) {
    warn.add('mid-change', 'Only the opening key, meter and tempo are used.')
  }

  const transposing = allDeep(doc, 'staffDef').filter((s) => s.getAttribute('trans.semi') && s.getAttribute('trans.semi') !== '0')
  if (transposing.length) {
    warn.add('transposing', 'Transposing parts play at written pitch.', transposing.length)
  }

  const ties = allDeep(doc, 'tie').length
  if (ties) warn.add('tie', 'Tied notes play as separate notes.', ties)

  const repeats = allDeep(doc, 'measure').filter((m) => /rpt/.test((m.getAttribute('left') || '') + (m.getAttribute('right') || ''))).length
  if (repeats || allDeep(doc, 'expansion').length) {
    warn.add('repeat', 'Repeats play once.')
  }
}

// ── Entry point ──

export function parseNative(xmlText: string): MeiScore {
  const doc = new DOMParser().parseFromString(xmlText.trim(), 'application/xml')
  const perr = doc.querySelector('parsererror')
  if (perr) throw new Error('XML parse error: ' + (perr.textContent || '').trim())

  const warn = new Warnings()

  const titleEl = firstDeep(doc, 'title')
  const title = titleEl ? (titleEl.textContent || 'Untitled').trim() : 'Untitled'
  let composer = ''
  for (const p of allDeep(doc, 'persName')) {
    if ((p.getAttribute('role') || '').toLowerCase() === 'composer') {
      composer = (p.textContent || '').trim()
      break
    }
  }

  // Only the music itself: a file's header can quote an incipit (its opening
  // bars) in full, and those bars must not be read as the start of the piece.
  const music: Document | Element = firstDeep(doc, 'music') ?? doc
  const resolve = makeResolver(doc)

  const scoreDef = firstDeep(music, 'scoreDef')
  const staffDef = firstDeep(music, 'staffDef')
  const meter = openingMeter(scoreDef, doc)
  const keys = openingKeys(scoreDef, music)
  const partTable = new PartTable(scoreDef)
  const meterCount = meter.count
  const meterUnit = meter.unit
  const measureBeats = meterCount * (4 / meterUnit)

  let bpm = 120
  const tEl =
    allDeep(music, 'tempo').find((t) => t.getAttribute('midi.bpm')) ||
    (staffDef && staffDef.getAttribute('midi.bpm') ? staffDef : null)
  if (tEl) bpm = parseFloat(tEl.getAttribute('midi.bpm') || '') || bpm

  checkFile(music, meter, warn)

  const notes: MeiNote[] = []
  const bars: MeiBar[] = []
  let measureStart = 0
  let maxEnd = 0
  const measures = allDeep(music, 'measure')
  if (!measures.length) warn.add('no-measures', 'No measures to show.')

  measures.forEach((measure, i) => {
    bars.push({ start: measureStart, label: measure.getAttribute('n') || String(i + 1) })
    let measureMax = measureStart
    for (const staff of allDeep(resolve(measure), 'staff').map(resolve)) {
      const keysig = keys.byStaff.get(staff.getAttribute('n') || '') ?? keys.score
      const part = partTable.partOf(staff.getAttribute('n') || '')
      for (const layer of allDeep(staff, 'layer').map(resolve)) {
        const ctx = { t: measureStart }
        walkLayer(layer, ctx, { resolve, keysig, part, measureBeats, notes, warn }, 1)
        if (ctx.t > measureMax) measureMax = ctx.t
      }
    }
    const content = measureMax - measureStart
    // metcon="false" is MEI's flag for a bar that is meant to be short (a
    // pickup, or the bar that completes it): it keeps its real length. An
    // unflagged short bar is more likely an encoding slip, so it is padded to a
    // full bar, as before, and reported.
    const meantShort = measure.getAttribute('metcon') === 'false'
    if (content > 0 && content < measureBeats - 1e-6) {
      if (meantShort) {
        measureStart += content
      } else {
        warn.add('short-bar', 'Short bars are padded to full length.')
        measureStart += measureBeats
      }
    } else {
      measureStart += Math.max(measureBeats, content)
    }
    if (measureMax > maxEnd) maxEnd = measureMax
  })

  return {
    title,
    composer,
    bpm,
    meterCount,
    meterUnit,
    measureBeats,
    bars,
    totalBeats: Math.max(maxEnd, measureStart),
    parts: keepSoundingParts(partTable.parts, notes),
    notes,
    warnings: warn.list(),
  }
}
