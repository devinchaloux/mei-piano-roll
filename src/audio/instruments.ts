import type { MeiPart } from '../mei/types'

// ── From the file's instrument to a starting sound ──
// A part starts with the picker's nearest sound to the instrument the file
// names: first by its General MIDI program, when an <instrDef> gives one, then
// by words in its name. A part that names nothing, or something the picker has
// no near match for (timpani, say), returns null and takes the default.

// General MIDI programs, counted from 0 as MEI's midi.instrnum counts them, in
// runs that share a sound: [first program, last program, sound id].
const BY_PROGRAM: [number, number, string][] = [
  [0, 3, 'piano'], // grand, bright, electric grand, honky-tonk
  [4, 5, 'electric-piano'],
  [6, 6, 'piano'], // harpsichord
  [7, 7, 'electric-piano'], // clavinet
  [8, 13, 'vibraphone'], // celesta, glockenspiel, music box, vibraphone, marimba, xylophone
  [14, 14, 'bell'], // tubular bells
  [15, 15, 'guitar'], // dulcimer
  [16, 23, 'organ'], // organs, accordion, harmonica
  [24, 31, 'guitar'],
  [32, 32, 'cello'], // acoustic bass
  [33, 38, 'synth-bass'], // electric basses, slap bass, synth bass 1
  [39, 39, 'acid-bass'], // synth bass 2
  [40, 41, 'violin'], // violin, viola
  [42, 43, 'cello'], // cello, contrabass
  [44, 45, 'strings'], // tremolo, pizzicato
  [46, 46, 'guitar'], // harp
  [48, 51, 'strings'], // string and synth string ensembles
  [52, 54, 'choir'],
  [55, 55, 'stab'], // orchestra hit
  [56, 56, 'trumpet'],
  [57, 58, 'brass'], // trombone, tuba
  [59, 59, 'trumpet'], // muted trumpet
  [60, 61, 'brass'], // French horn, brass section
  [62, 63, 'synth-brass'],
  [64, 67, 'alto-sax'],
  [68, 71, 'clarinet'], // oboe, English horn, bassoon, clarinet
  [72, 79, 'flute'], // piccolo, flute, recorder and other pipes
  [80, 80, 'square-lead'],
  [81, 87, 'saw-lead'],
  [88, 95, 'pad'],
  [96, 103, 'pad'], // synth effects
  [104, 107, 'guitar'], // sitar, banjo, shamisen, koto
  [108, 108, 'vibraphone'], // kalimba
  [110, 110, 'violin'], // fiddle
  [111, 111, 'clarinet'], // shanai
  [112, 112, 'bell'], // tinkle bell
]

// Words in an instrument's name, in English, Italian and German, the languages
// of most score labels. More specific words come first ("bass trombone" is a
// trombone, "electric piano" not a piano). "Bass" alone is left out: in a choir
// it is a voice, in an orchestra a double bass. A word may be followed by a
// number ("Violine2"), so word ends are checked as "no letter next".
const BY_NAME: [RegExp, string][] = [
  [/electric piano|e-piano|rhodes|wurlitzer/, 'electric-piano'],
  [/piano|klavier|cembalo|harpsichord|clavier/, 'piano'],
  [/contrabass|double bass|kontrabass|contrabbass/, 'cello'],
  [/violoncell|cello/, 'cello'],
  [/viol(a|e|in|ino|ini|ine|en)?(?![a-z])|fiddle|geige/, 'violin'],
  [/strings|streicher|archi(?![a-z])/, 'strings'],
  [/piccolo|flute|flauto|flauti|fl(ö|oe)te|recorder|blockfl/, 'flute'],
  [/clarinet|klarinette|oboe|oboi|hautbois|bassoon|fagott|english horn|cor anglais/, 'clarinet'],
  [/sax/, 'alto-sax'],
  [/trumpet|tromba|trombe|trompete|cornet/, 'trumpet'],
  [/trombone|tromboni|posaune|tuba|euphonium|horn|corno|corni|brass/, 'brass'],
  [/guitar|chitarra|gitarre|lute|liuto|laute|harp|arpa|harfe|mandolin/, 'guitar'],
  [/organ|organo|orgel|accordion/, 'organ'],
  [/vibraphone|marimba|xylophon|glockenspiel|celesta/, 'vibraphone'],
  [/voice|vocal|choir|chor|coro|soprano|sopran|alto(?![a-z])|alt(?![a-z])|altus|tenor|baritone|canto|cantus/, 'choir'],
]

/** The sound a part starts with, by the instrument the file names; null when it names none the picker matches. */
export function soundForPart(part: Pick<MeiPart, 'instrument' | 'midiProgram'>): string | null {
  if (part.midiProgram !== undefined) {
    const run = BY_PROGRAM.find(([lo, hi]) => part.midiProgram! >= lo && part.midiProgram! <= hi)
    if (run) return run[2]
  }
  const name = (part.instrument ?? '').toLowerCase()
  if (!name) return null
  return BY_NAME.find(([words]) => words.test(name))?.[1] ?? null
}
