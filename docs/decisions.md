# Decisions

**Status (2026-10-07):** nothing decided yet. **Next action:** settle the open
questions below, in order, then build the first slice (load one MEI file, draw
its notes).

Each decision gets: date, the choice, the alternatives rejected, and why, so
it isn't re-litigated later. Entries are binding until a later entry reverses
them; don't edit an old entry, add a dated note beneath it.

---

## Open questions

| # | Question | Options | Recommendation |
|---|---|---|---|
| 1 | Platform | Browser app; desktop app; library only | Browser app: nothing to install, easy to share |
| 2 | Language and build | TypeScript + Vite; plain JS | TypeScript + Vite |
| 3 | Rendering | Canvas; SVG | Canvas: scales to many notes; SVG is easier to style and inspect |
| 4 | MEI reading | Own parser over the DOM; an existing MEI library | Decide after reading real files; a dependency is a decision |
| 5 | Playback | Visual only; audio via Web Audio; MIDI out | Visual first, audio as a second slice |
| 6 | Test files | Which MEI files, from where, under what licence | Needs the maintainer; see `docs/fixtures.md` |
| 7 | Scope of MEI | Which elements the roll handles (ties, grace notes, `<choice>`, multiple staves, transposing instruments) | Start with notes, rests, ties and multiple staves; list the rest as known gaps |

## Decided

_None yet._
