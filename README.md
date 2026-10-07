# mei-piano-roll

🎹 A piano roll player for MEI (Music Encoding Initiative) files. It reads an
MEI file in the browser, draws its notes as a piano roll, plays them, and lists
anything in the file it could not show faithfully.

## Status

**2026-10-07:** the first reader works. It handles short, cleanly encoded files.
On the MEI project's sample files it reads everything without crashing, but
reports gaps in most of them (meter or key written where it doesn't look, ties,
pickup bars). The second reader, for everything else, is not built yet. Nothing
is published to npm yet.

## Try it

Requires Node 22 or later.

```bash
npm install
npm run dev
```

Open the address it prints. The demo shows a built-in example; open any `.mei`
file, or drop one on the page. The file stays in your browser.

## Use it in a React page

```tsx
import { MeiPianoRoll } from 'mei-piano-roll'

<MeiPianoRoll src="/music/example.mei" />
// or, with the file's text already loaded:
<MeiPianoRoll meiText={xml} height={320} onLoad={(score) => console.log(score.warnings)} />
```

`parseNative(xml)` is exported too, for the note data without the player.

## Checks

```bash
npm run lint && npm run test:run && npm run build
```

CI runs the same on every push. `npm run build` type-checks, then builds the
library into `dist/`.

## Stress test

```bash
npm run stress
```

Downloads the MEI project's sample files (about 113 MB, once) into `fixtures/`,
which git ignores, reads every one, and writes `fixtures/stress-report.md`. It
takes about two minutes. Its job is to show what breaks, not to pass; see
[`docs/fixtures.md`](docs/fixtures.md).

## Layout

| Path | What it is |
|---|---|
| `src/mei/` | The reader: MEI text in, note data and warnings out. No UI. |
| `src/roll/` | The player component: draws on a canvas, plays with Web Audio. |
| `src/test/` | Unit tests, with short MEI snippets written for them. |
| `demo/` | The demo page (`npm run dev`); not part of the library. |
| `stress/` | The stress test (`npm run stress`). |
| `scripts/fetch-samples.mjs` | Downloads the sample files for the stress test. |

## Docs

- [`CLAUDE.md`](CLAUDE.md): rules for working on this repo with Claude Code
- [`docs/decisions.md`](docs/decisions.md): design decisions and open questions
- [`docs/fixtures.md`](docs/fixtures.md): where the test files come from
