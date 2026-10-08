# mei-piano-roll

🎹 A piano roll player for MEI (Music Encoding Initiative) files. It reads an
MEI file in the browser, draws its notes as a piano roll, plays them with a
choice of synths or sampled instruments, makes still images of any bars, and
lists anything in the file it could not show faithfully.

## Status

**2026-10-08:** the first reader works. It handles short, cleanly encoded files.
On the MEI project's 617 sample files it reads everything without crashing; most
still report a gap (ties, grace notes, repeats, mid-piece changes). A file with
several instruments shows each in its own color, on one roll or one lane per
part, with mute, solo and a sound for each. The second reader, for everything
else, is not built yet. Nothing is published to npm yet.

## Try it

Requires Node 22 or later.

```bash
npm install
npm run dev
```

Open the address it prints. The demo shows a built-in two-part example; open any `.mei`
file, or drop one on the page. The file stays in your browser. Three tabs show
the **full player**, the **compact player** as it sits in an essay, and the
**image maker**, which saves any bars as SVG or PNG.

The same demo is hosted on Vercel (`vercel.json`): `main` deploys it, and each
pull request gets its own preview link. To build it yourself:

```bash
npm run build:demo   # static site in dist-demo/
```

## Use it in a React page

```tsx
import { MeiPianoRoll } from 'mei-piano-roll'

<MeiPianoRoll src="/music/example.mei" />
// or, with the file's text already loaded:
<MeiPianoRoll meiText={xml} height={320} onLoad={(score) => console.log(score.warnings)} />
// in a page of text: one play button over the roll, a one-line caption
<MeiPianoRoll src="/music/example.mei" variant="compact" />
```

| Prop | What it does |
|---|---|
| `src` / `meiText` | The MEI file, by address or as text |
| `variant` | `"full"` (default): the roll with its controls underneath. `"compact"`: one play button over the roll and a caption line; it opens into the full player |
| `header` | Show the title line above the full player; default `true` |
| `sound` | Starting sound for every part, by id (see `SOUNDS`); default each part's nearest sound to the instrument the file names, else the square lead |
| `theme` | `"studio"` (default), `"paper"`, `"neon"`, `"ink"`, or your own colors |
| `accent` | Note color (the first part's, with several); without it, the page's `--accent` CSS variable, then the theme's |
| `partColors` | One color per part, in score order; default the note color, then quick-pick colors |
| `separateParts` | Start with each part on its own roll; default `false` |
| `height`, `pxPerBeat`, `bpm` | Size, starting zoom, tempo override |
| `onLoad` | Called with the parsed score, warnings included |

Also exported: `NOTE_COLORS`, eight quick-pick note colors that adjust for
light and dark themes; `parseNative(xml)` for the note data without the player; and
`rollToSvg(score, options)` for still images, which needs no browser, so a
site's build can draw pictures straight from its files (`partColors`,
`separateParts` and `fadedParts` match the player's view of several parts).

Sampled instruments are FluidR3 GM by Frank Wen (CC BY 3.0), played by
[smplr](https://github.com/danigb/smplr); the player credits them whenever one
is in use.

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
| `src/roll/` | The player component (one canvas), its color themes, and the lane layout it shares with the images. |
| `src/audio/` | Sounds: the synth recipes, the sampled-instrument list, a part's starting sound, the engine that plays them. |
| `src/render/` | Still images: SVG from a score, and PNG in the browser. |
| `src/test/` | Unit tests, with short MEI snippets written for them. |
| `demo/` | The demo page (`npm run dev`); not part of the library. |
| `stress/` | The stress test (`npm run stress`). |
| `scripts/fetch-samples.mjs` | Downloads the sample files for the stress test. |

## Docs

- [`CLAUDE.md`](CLAUDE.md): rules for working on this repo with Claude Code
- [`docs/decisions.md`](docs/decisions.md): design decisions and open questions
- [`docs/fixtures.md`](docs/fixtures.md): where the test files come from
