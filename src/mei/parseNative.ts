import type { MeiNote, MeiScore, MeiWarning } from './types'

/* ===========================================================================
 * The native reader: a small MEI reader with no dependencies.
 *
 * Meant for short, cleanly encoded files. It reads the first staff definition's
 * key, meter and tempo once, walks every layer of every measure, and turns
 * notes and chords into MeiNote records. What it cannot do (ties, repeats,
 * pickup bars, mid-piece changes, transposing instruments) it reports as
 * warnings rather than hiding. Files that need those go to the second reader,
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
// a piano roll shows. Anything else unrecognised is reported.
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
    warn.add('no-dur', 'Some notes or rests have no written duration (for example, only @dur.ppq); they take no time on the roll.')
    return 0
  }
  let base: number
  if (durAttr === 'long') base = 16
  else if (durAttr === 'breve') base = 8
  else base = 4 / parseInt(durAttr, 10)
  if (!isFinite(base) || base <= 0) {
    warn.add('bad-dur', `Some durations could not be read (for example "${durAttr}"); they take no time on the roll.`)
    return 0
  }
  const dots = parseInt(node.getAttribute('dots') || '0', 10)
  let mult = 1, add = 0.5
  for (let i = 0; i < dots; i++) { mult += add; add /= 2 }
  return base * mult * scale
}

// ── Walking a layer ──

interface LayerEnv {
  keysig: string | null
  measureBeats: number
  notes: MeiNote[]
  warn: Warnings
}

function pushNote(n: Element, start: number, beats: number, env: LayerEnv): void {
  const midi = noteToMidi(n, env.keysig)
  if (midi === null) {
    env.warn.add('no-pitch', 'Some notes have no readable pitch (no @pname or @oct) and are left off the roll.')
    return
  }
  if (n.getAttribute('tie') === 'm' || n.getAttribute('tie') === 't') {
    env.warn.add('tie', 'Tied notes are drawn and played as separate, re-struck notes.')
  }
  env.notes.push({ midi, start, dur: beats, name: midiName(midi) })
}

function walkLayer(node: Element, ctx: { t: number }, env: LayerEnv, scale: number): void {
  for (const child of Array.from(node.children)) {
    const tag = child.localName
    if (tag === 'beam' || tag === 'graceGrp' || tag === 'bTrem' || tag === 'fTrem') {
      walkLayer(child, ctx, env, scale)
    } else if (tag === 'tuplet') {
      // A triplet (num 3, numbase 2) squeezes three notes into the time of two.
      const num = parseInt(child.getAttribute('num') || '3', 10)
      const numbase = parseInt(child.getAttribute('numbase') || '2', 10)
      walkLayer(child, ctx, env, scale * (numbase / num))
    } else if (tag === 'chord') {
      const beats = durToBeats(child, scale, env.warn)
      for (const n of childrenNamed(child, 'note')) pushNote(n, ctx.t, beats, env)
      ctx.t += beats
    } else if (tag === 'note') {
      if (child.getAttribute('grace')) {
        env.warn.add('grace', 'Grace notes take no time and are left off the roll.')
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
      env.warn.add('mid-change', 'Changes of key, meter or tempo after the start are ignored; the first one holds throughout.')
    } else if (!SILENT_IN_LAYER.has(tag)) {
      env.warn.add(`skipped:${tag}`, `<${tag}> elements inside a layer are skipped.`)
    }
  }
}

// ── Whole-file checks ──
// Things the reader knowingly gets wrong, detected up front so they are reported
// even when they don't change a single note.

function checkFile(doc: Document, staffDef: Element | null, warn: Warnings): void {
  // MEI 4 and later can write meter and key as <meterSig>/<keySig> elements, or
  // put them on <scoreDef>; this reader only reads the first <staffDef>'s attributes.
  const staffHasMeter = !!staffDef?.getAttribute('meter.count')
  const meterElsewhere = allDeep(doc, 'scoreDef').some((s) => s.getAttribute('meter.count')) || allDeep(doc, 'meterSig').length > 0
  if (!staffHasMeter && meterElsewhere) {
    warn.add('meter-elsewhere', 'The meter is written somewhere this reader does not look (on <scoreDef> or as <meterSig>); bars assume 4/4.')
  }
  const staffHasKey = !!(staffDef?.getAttribute('keysig') || staffDef?.getAttribute('key.sig'))
  const keyElsewhere =
    allDeep(doc, 'scoreDef').some((s) => s.getAttribute('keysig') || s.getAttribute('key.sig')) || allDeep(doc, 'keySig').length > 0
  if (!staffHasKey && keyElsewhere) {
    warn.add('key-elsewhere', 'The key signature is written somewhere this reader does not look (on <scoreDef> or as <keySig>); notes without their own accidental play unaltered.')
  }
  // MEI 3 spells the attribute key.sig; this reader only knows keysig.
  if (staffDef?.getAttribute('key.sig') && !staffDef.getAttribute('keysig')) {
    warn.add('key-sig-mei3', 'The key signature uses the MEI 3 spelling (key.sig), which this reader does not read; notes without their own accidental play unaltered.')
  }

  const defs = [...allDeep(doc, 'scoreDef'), ...allDeep(doc, 'staffDef')]
  const meters = new Set(defs.map((d) => d.getAttribute('meter.count') && `${d.getAttribute('meter.count')}/${d.getAttribute('meter.unit')}`).filter(Boolean))
  const tempos = new Set(allDeep(doc, 'tempo').map((t) => t.getAttribute('midi.bpm')).filter(Boolean))
  if (meters.size > 1 || tempos.size > 1) {
    warn.add('mid-change', 'Changes of key, meter or tempo after the start are ignored; the first one holds throughout.')
  }

  const transposing = allDeep(doc, 'staffDef').filter((s) => s.getAttribute('trans.semi') && s.getAttribute('trans.semi') !== '0')
  if (transposing.length) {
    warn.add('transposing', 'Transposing instruments play at written pitch, not sounding pitch.', transposing.length)
  }

  const ties = allDeep(doc, 'tie').length
  if (ties) warn.add('tie', 'Tied notes are drawn and played as separate, re-struck notes.', ties)

  const repeats = allDeep(doc, 'measure').filter((m) => /rpt/.test((m.getAttribute('left') || '') + (m.getAttribute('right') || ''))).length
  if (repeats || allDeep(doc, 'expansion').length) {
    warn.add('repeat', 'Repeats are not expanded: repeated sections play once.')
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

  const staffDef = firstDeep(doc, 'staffDef')
  const keysig = staffDef ? staffDef.getAttribute('keysig') : null
  const meterCount = parseInt((staffDef && staffDef.getAttribute('meter.count')) || '4', 10)
  const meterUnit = parseInt((staffDef && staffDef.getAttribute('meter.unit')) || '4', 10)
  const measureBeats = meterCount * (4 / meterUnit)

  let bpm = 120
  const tEl =
    allDeep(doc, 'tempo').find((t) => t.getAttribute('midi.bpm')) ||
    (staffDef && staffDef.getAttribute('midi.bpm') ? staffDef : null)
  if (tEl) bpm = parseFloat(tEl.getAttribute('midi.bpm') || '') || bpm

  checkFile(doc, staffDef, warn)

  const notes: MeiNote[] = []
  let measureStart = 0
  let maxEnd = 0
  const measures = allDeep(doc, 'measure')
  if (!measures.length) warn.add('no-measures', 'The file has no <measure> elements, so there is nothing to draw.')

  for (const measure of measures) {
    let measureMax = measureStart
    for (const layer of allDeep(measure, 'layer')) {
      const ctx = { t: measureStart }
      walkLayer(layer, ctx, { keysig, measureBeats, notes, warn }, 1)
      if (ctx.t > measureMax) measureMax = ctx.t
    }
    // A bar shorter than the meter (a pickup, or an incomplete final bar) is
    // padded to full length, which shifts every note after it.
    if (measureMax - measureStart < measureBeats - 1e-6 && measureMax > measureStart) {
      warn.add('short-bar', 'Bars shorter than the meter (such as a pickup) are padded to a full bar, which shifts the notes after them.')
    }
    measureStart += Math.max(measureBeats, measureMax - measureStart)
    if (measureMax > maxEnd) maxEnd = measureMax
  }

  return {
    title,
    composer,
    bpm,
    meterCount,
    meterUnit,
    measureBeats,
    totalBeats: Math.max(maxEnd, measureStart),
    notes,
    warnings: warn.list(),
  }
}
