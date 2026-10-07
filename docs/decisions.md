# Decisions

**Status (2026-10-07):** three decisions made; two questions open. **Next action:**
set up the project (TypeScript, Vite, Vitest, ESLint, CI), then bring in the
first reader.

Each decision gets: date, the choice, the alternatives rejected, and why, so it
isn't re-litigated later. Entries are binding until a later entry reverses
them; don't edit an old entry, add a dated note beneath it.

---

## Decided

### 2026-10-07: two readers behind one renderer

**Choice.** A small reader of our own for clean, simply encoded files, and the
Verovio toolkit for everything else, loaded only when needed. Both hand the
renderer the same note data, so drawing and playback are written once.

**Rejected.**
- *Verovio only:* correct across the repertoire, but every embedding page
  downloads several megabytes.
- *Our own reader only:* no extra download, but it must solve ties, repeats,
  pickup bars, tempo and meter changes and transposing instruments itself, and
  an unhandled case would show as a confident but wrong roll.

**Why.** Verovio already solves the hard timing problems and reports them as
data. Loading it on demand keeps small embeds light. Comparing the two readers'
output on public-domain files turns "is the small reader right?" into a
measurement.

### 2026-10-07: packaged as a component, with a demo, for installation

**Choice.** A component built as a library, plus a one-page demo that opens any
MEI file, published for anyone to install (npm) once the repository is public.

**Rejected.** A standalone page only: nothing for other sites to embed.

**Why.** Other pages need to embed the roll, and a demo makes it easy to try.

### 2026-10-07: test files are fetched, never committed

**Choice.** The stress test reads the MEI project's sample encodings
(`music-encoding/sample-encodings`, ECL-2.0), MEI 3.0 to 5.1. A script
downloads them, pinned to one commit, into a folder git ignores, and runs
every file. Files whose headers carry a modern publisher's copyright are left
out. Unit tests use short MEI snippets written for the tests.

**Rejected.** Committing a sample (about 21 MB for the small files) or the
whole set (about 113 MB): it stays in the history for good, and the MEI
project's repository is already the maintained source.

**Why.** The point is to run the roll over every file as it is built and see
what breaks; the result table is what is worth keeping, not the files.

## Open questions

| Question | Options |
|---|---|
| How is the roll drawn, and how does it make sound? | Settled by the existing prototype for now (canvas; the browser's own audio); revisit only if the move shows a reason |
| Which MEI elements does the roll handle first? | Notes, rests, ties and several staves first; list the rest as known gaps |
