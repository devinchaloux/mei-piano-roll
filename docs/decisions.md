# Decisions

**Status (2026-10-07):** the project is set up and the native reader works.
**Next action:** build the second reader (Verovio), which needs its dependency
approved first, then compare the two readers on the sample files.

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

### 2026-10-07: the tools, matching the maintainer's other projects

**Choice.** React (a peer dependency, version 18 or later), Vite, TypeScript 5.9,
Vitest, ESLint with the TypeScript and React Hooks rules, and jsdom for tests
that need a browser's XML parser. CI on GitHub Actions runs lint, tests and the
build.

**Rejected.** TypeScript 7: newer, but the lint tooling is proven on 5.

**Why.** The same tools as the maintainer's other public project, so one set of
habits covers both. React is a peer dependency because the page embedding the
roll already has it; two copies of React on one page break hooks.

### 2026-10-07: the reader reports what it leaves out

**Choice.** Every reader returns `warnings` alongside the notes: one entry per
kind of gap (ties drawn as separate notes, pickup bars padded, a meter written
where the reader doesn't look, skipped elements…) with a count. The player lists
them under the roll. An unreadable duration now takes no time instead of
breaking the whole timeline.

**Rejected.** Failing silently, as the prototype did: a user can't tell a
limitation from a bug.

**Why.** It is the "say what the roll leaves out" design bet, made concrete, and
it lets the stress test count each gap across the sample files.

### 2026-10-07: the stress test gives each file its own simulated browser

**Choice.** The stress test reads files in plain Node, creating a fresh jsdom
window per file and closing it afterwards.

**Rejected.** One shared jsdom window: it keeps every document it has parsed
and ran out of memory (8 GB) partway through the samples.

**Why.** Memory stays flat (about 55 MB) whatever the number of files.

## Open questions

| Question | Options |
|---|---|
| How is the roll drawn, and how does it make sound? | Settled by the existing prototype for now (canvas; the browser's own audio); revisit only if the move shows a reason |
| Which MEI elements does the roll handle first? | Notes, rests, ties and several staves first; list the rest as known gaps |
