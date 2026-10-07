# Decisions

**Status (2026-10-07):** nothing decided yet. **Next action:** the maintainer
settles the open questions below; then build the first slice (load one MEI file,
draw its notes).

Each decision gets: date, the choice, the alternatives rejected, and why, so it
isn't re-litigated later. Entries are binding until a later entry reverses
them; don't edit an old entry, add a dated note beneath it.

---

## Open questions

| Question | Options |
|---|---|
| How are MEI files read? | A small reader of our own for clean files plus an existing engine for everything else; the engine only; our own reader only |
| How is the roll packaged? | A component built as a library plus a demo page; the same, published for installation; a standalone page only |
| How is the roll drawn, and how does it make sound? | Canvas or SVG; the browser's own audio or MIDI output |
| Which MEI files test it? | Public-domain files with a recorded source and licence (`docs/fixtures.md`) |
| Which MEI elements does the roll handle first? | Notes, rests, ties and several staves first; list the rest as known gaps |

## Decided

_None yet._
