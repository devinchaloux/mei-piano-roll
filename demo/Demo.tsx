import { useMemo, useState, type CSSProperties } from 'react'
import { MeiPianoRoll, THEMES, NOTE_COLORS, noteColorFor, parseNative, rollToSvg, svgToPng, downloadBlob, type MeiScore, type ThemeName } from '../src'
import { EXAMPLE_MEI } from './example'

// ── Demo page ──
// A studio page: a side panel for the file and the look, and tabs for the full
// player, the compact player as it sits in an essay, and the image maker. The
// file never leaves the browser. Text follows the house rule: say what a control
// does in as few words as that takes, and put anything more in a tooltip.

type Tab = 'player' | 'embed' | 'image'
const TABS: { id: Tab; label: string; tip?: string }[] = [
  { id: 'player', label: 'Player' },
  { id: 'embed', label: 'Essay embed', tip: 'The compact player, as it sits in a page of text' },
  { id: 'image', label: 'Image' },
]

export default function Demo() {
  const [text, setText] = useState(EXAMPLE_MEI)
  const [fileName, setFileName] = useState('Example')
  const [dragging, setDragging] = useState(false)
  const [theme, setTheme] = useState<ThemeName>('studio')
  // null means "the theme's own color".
  const [color, setColor] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('player')
  // Read here as well as in the player, so the page header and the image maker
  // have the score whichever tab is open.
  const score = useMemo<MeiScore | null>(() => {
    try { return parseNative(text) } catch { return null }
  }, [text])
  const noteColor = color ?? THEMES[theme].note

  const open = async (file: File | undefined) => {
    if (!file) return
    setText(await file.text())
    setFileName(file.name)
  }

  return (
    <div
      className={'studio' + (dragging ? ' studio-drop' : '')}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); open(e.dataTransfer.files[0]) }}
    >
      <style>{CSS}</style>
      <aside className="studio-side">
        <h1>MEI piano roll</h1>
        <label className="studio-open" title="Or drop a file anywhere on the page">
          Open MEI file
          <input type="file" accept=".mei,.xml" hidden onChange={(e) => open(e.target.files?.[0])} />
        </label>
        <div className="studio-file">{fileName}</div>

        <section>
          <h2>Look</h2>
          <select className="studio-field" value={theme} onChange={(e) => setTheme(e.target.value as ThemeName)} aria-label="Theme" title="Theme">
            {Object.keys(THEMES).map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
          </select>
          <ColorPicker theme={theme} value={color} onChange={setColor} />
        </section>
      </aside>

      <main className="studio-main">
        <nav className="studio-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} title={t.tip} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
          <span className="studio-spacer" />
          {score && (
            <span className="studio-meta">
              {score.title || fileName} · {score.bars.length} bars{score.parts.length > 1 ? ` · ${score.parts.length} parts` : ''} · {score.meterCount}/{score.meterUnit}
            </span>
          )}
        </nav>

        {/* Only the open tab is mounted: each player has its own sound, and two
            must never play at once. key: a new file starts a fresh player. */}
        {tab === 'player' && (
          <MeiPianoRoll key={fileName} meiText={text} height={420} theme={theme} accent={noteColor} header={false} />
        )}
        {tab === 'embed' && (
          <div className="studio-essay">
            <MeiPianoRoll key={fileName} meiText={text} height={300} theme={theme} accent={noteColor} variant="compact" />
          </div>
        )}
        {tab === 'image' && score && <ImageMaker score={score} theme={theme} noteColor={color ?? undefined} />}
        {tab === 'image' && !score && <p className="studio-muted">This file couldn't be read.</p>}
      </main>
    </div>
  )
}

// ── Note color: quick picks and a custom color ──

function ColorPicker({ theme, value, onChange }: { theme: ThemeName; value: string | null; onChange: (c: string | null) => void }) {
  const t = THEMES[theme]
  const swatch = (bg: string, selected: boolean): CSSProperties => ({
    background: bg,
    boxShadow: selected ? '0 0 0 2px var(--surface), 0 0 0 4px var(--text-strong)' : 'none',
  })
  return (
    <div className="studio-swatches" role="group" aria-label="Note color">
      {NOTE_COLORS.map((c) => {
        const hex = noteColorFor(c, t)
        // Picking the theme's own color clears the override, so the notes
        // follow the theme again when it changes.
        return <button key={c.name} className="studio-swatch" style={swatch(hex, (value ?? t.note) === hex)} title={c.name} aria-label={c.name} onClick={() => onChange(hex === t.note ? null : hex)} />
      })}
      <input
        type="color"
        className="studio-custom"
        title="Custom color"
        aria-label="Custom color"
        value={value ?? t.note}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

// ── Image maker ──
// Still pictures of real excerpts, for cards, slides and article images. The
// preview is the exact SVG that downloads.

function ImageMaker({ score, theme, noteColor }: { score: MeiScore; theme: ThemeName; noteColor?: string }) {
  const barCount = Math.max(score.bars.length, 1)
  const [fromBar, setFromBar] = useState(1)
  const [toBar, setToBar] = useState(Math.min(barCount, 4))
  const [width, setWidth] = useState(1200)
  const [height, setHeight] = useState(400)
  const [keyboard, setKeyboard] = useState(true)
  const [barNumbers, setBarNumbers] = useState(false)
  const [noteLabels, setNoteLabels] = useState(false)
  const [background, setBackground] = useState(true)
  const [separateParts, setSeparateParts] = useState(false)

  const from = Math.min(Math.max(1, fromBar), barCount)
  const to = Math.min(Math.max(from, toBar), barCount)
  const svg = useMemo(
    () => rollToSvg(score, { fromBar: from, toBar: to, width, height, keyboard, barNumbers, noteLabels, background, theme, noteColor, separateParts }),
    [score, from, to, width, height, keyboard, barNumbers, noteLabels, background, theme, noteColor, separateParts],
  )
  const name = `${(score.title || 'piano-roll').replace(/[^\w-]+/g, '-').toLowerCase()}-bars-${from}-${to}`
  const num = (v: string, fallback: number) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : fallback)
  const check = (text: string, on: boolean, set: (v: boolean) => void, tip?: string) => (
    <label className="studio-label" title={tip}><input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} /> {text}</label>
  )

  return (
    <section className="studio-image">
      <div className="studio-preview">
        <img alt="Image preview" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} />
      </div>
      <div className="studio-row">
        <label className="studio-label" title={`Counted from 1, of ${barCount}`}>
          Bars
          <input className="studio-field studio-num" type="number" min={1} max={barCount} value={from} onChange={(e) => setFromBar(num(e.target.value, 1))} />
          to
          <input className="studio-field studio-num" type="number" min={1} max={barCount} value={to} onChange={(e) => setToBar(num(e.target.value, barCount))} />
        </label>
        <label className="studio-label" title="In pixels. PNGs save at twice this size.">
          Size
          <input className="studio-field studio-num-wide" type="number" min={100} value={width} onChange={(e) => setWidth(num(e.target.value, 1200))} />
          ×
          <input className="studio-field studio-num-wide" type="number" min={50} value={height} onChange={(e) => setHeight(num(e.target.value, 400))} />
        </label>
        {check('Keyboard', keyboard, setKeyboard)}
        {check('Bar numbers', barNumbers, setBarNumbers)}
        {check('Note names', noteLabels, setNoteLabels)}
        {check('Background', background, setBackground, 'Off for a transparent background')}
        {score.parts.length > 1 && check('Separate parts', separateParts, setSeparateParts, 'Each part on its own roll')}
        <span className="studio-spacer" />
        <button className="studio-button" title="Sharp at any size" onClick={() => downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`)}>Save SVG</button>
        <button className="studio-button" onClick={async () => downloadBlob(await svgToPng(svg, width, height, 2), `${name}.png`)}>Save PNG</button>
      </div>
    </section>
  )
}

// ── Page styles ──
// The site's palette. The player reads the same custom properties, so its
// chrome matches the page; its play button takes the accent.

const CSS = `
.studio {
  --surface: #15171f; --surface-2: #1c1f2a; --border: #2a2e3a;
  --text-strong: #e8eaf1; --text: #d5d9e3; --text-muted: #9298a9;
  --accent: #ff5ca0; --accent-ink: #2e0418; --radius: 10px;
  --font-mono: 'DM Mono', ui-monospace, Menlo, Consolas, monospace;
  min-height: 100vh; display: grid; grid-template-columns: 260px minmax(0, 1fr);
  background: #0d0e12; color: var(--text); font: 14px/1.45 'Instrument Sans', system-ui, sans-serif;
}
.studio-drop { outline: 2px dashed var(--accent); outline-offset: -6px; }
.studio-side { display: flex; flex-direction: column; gap: 14px; padding: 24px 20px; background: var(--surface); border-right: 1px solid var(--border); }
.studio-side h1 { margin: 0 0 6px; font-size: 17px; font-weight: 700; color: var(--text-strong); letter-spacing: -0.01em; }
.studio-side section { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
.studio-side h2 { margin: 0; font: 400 11px var(--font-mono); letter-spacing: 0.1em; text-transform: uppercase; color: #808795; }
.studio-open { display: flex; align-items: center; justify-content: center; height: 40px; border-radius: 8px; border: 1px dashed #3a455f; color: var(--text-strong); font-weight: 500; cursor: pointer; }
.studio-open:hover { border-color: var(--accent); }
.studio-file { margin-top: -6px; font: 12px var(--font-mono); color: #808795; overflow-wrap: anywhere; }
.studio-field { height: 34px; box-sizing: border-box; padding: 0 8px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text-strong); font: inherit; }
.studio-swatches { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.studio-swatch { width: 22px; height: 22px; padding: 0; border: none; border-radius: 50%; cursor: pointer; }
.studio-custom { width: 26px; height: 24px; padding: 0; border: none; background: none; cursor: pointer; }

.studio-main { min-width: 0; display: flex; flex-direction: column; gap: 16px; padding: 20px 28px 32px; }
.studio-tabs { display: flex; align-items: flex-end; gap: 22px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.studio-tabs button { appearance: none; background: none; border: none; border-bottom: 2px solid transparent; padding: 0 2px 10px; color: var(--text-muted); font: inherit; font-size: 15px; cursor: pointer; }
.studio-tabs button[aria-selected="true"] { color: var(--text-strong); font-weight: 600; border-bottom-color: var(--accent); }
.studio-spacer { flex: 1; }
.studio-meta { padding-bottom: 10px; font: 13px var(--font-mono); color: #808795; }
.studio-muted { color: var(--text-muted); }
.studio-essay { max-width: 760px; }

.studio-image { display: flex; flex-direction: column; gap: 14px; }
.studio-preview { overflow: auto; border: 1px dashed var(--border); border-radius: 8px; background: repeating-conic-gradient(#1c1f2a 0% 25%, #15171f 0% 50%) 50% / 16px 16px; }
.studio-preview img { display: block; max-width: 100%; }
.studio-row { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
.studio-label { display: flex; align-items: center; gap: 6px; color: var(--text-muted); }
.studio-num { width: 58px; }
.studio-num-wide { width: 74px; }
.studio-button { height: 34px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text-strong); font: inherit; cursor: pointer; }
.studio-button:hover { border-color: var(--text-muted); }
.studio input[type="checkbox"] { accent-color: var(--accent); }

@media (max-width: 820px) {
  .studio { grid-template-columns: minmax(0, 1fr); }
  .studio-side { border-right: none; border-bottom: 1px solid var(--border); padding: 18px 16px; }
  .studio-main { padding: 16px; }
}
`
