import { useMemo, useState, type CSSProperties } from 'react'
import { MeiPianoRoll, THEMES, NOTE_COLORS, noteColorFor, rollToSvg, svgToPng, downloadBlob, type MeiScore, type ThemeName } from '../src'
import { EXAMPLE_MEI } from './example'

// ── Demo page ──
// Open any MEI file (button or drop) and see it on the roll; pick a theme and a
// note color; save images of any bars. The file never leaves the browser.
// Text follows the house rule: say what a control does in as few words as that
// takes, and put anything more in a tooltip.

const muted = '#8b95ad'
const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }
const label: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, color: muted, fontSize: 14 }
const field: CSSProperties = { background: '#15171f', color: '#e8eaf1', border: '1px solid #2a2e3a', borderRadius: 6, padding: '4px 6px', font: 'inherit' }
const button: CSSProperties = { ...field, padding: '5px 12px', cursor: 'pointer' }

export default function Demo() {
  const [text, setText] = useState(EXAMPLE_MEI)
  const [fileName, setFileName] = useState('Example')
  const [dragging, setDragging] = useState(false)
  const [theme, setTheme] = useState<ThemeName>('studio')
  // null means "the theme's own color".
  const [color, setColor] = useState<string | null>(null)
  const [score, setScore] = useState<MeiScore | null>(null)

  const open = async (file: File | undefined) => {
    if (!file) return
    setText(await file.text())
    setFileName(file.name)
  }

  return (
    <main
      style={{ maxWidth: 1100, margin: '32px auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif', color: '#e7ecf5' }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); open(e.dataTransfer.files[0]) }}
    >
      <h1 style={{ fontSize: 22, margin: '0 0 16px' }}>MEI Piano Roll</h1>

      <div style={{ ...row, marginBottom: 14 }}>
        <label style={{ ...button, color: '#e8eaf1' }} title="Or drop a file anywhere on the page">
          Open MEI file
          <input type="file" accept=".mei,.xml" style={{ display: 'none' }} onChange={(e) => open(e.target.files?.[0])} />
        </label>
        <span style={{ color: muted, fontSize: 14 }}>{fileName}</span>
        <label style={label}>
          Theme
          <select style={field} value={theme} onChange={(e) => setTheme(e.target.value as ThemeName)}>
            {Object.keys(THEMES).map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
          </select>
        </label>
        <ColorPicker theme={theme} value={color} onChange={setColor} />
      </div>

      <div style={{ outline: dragging ? '2px dashed #4f8cff' : 'none', outlineOffset: 4 }}>
        {/* key: a new file starts a fresh player (stopped, at the start). */}
        <MeiPianoRoll key={fileName} meiText={text} height={320} theme={theme} accent={color ?? undefined} onLoad={setScore} />
      </div>

      {score && <ImageMaker score={score} theme={theme} noteColor={color ?? undefined} />}
    </main>
  )
}

// ── Note color: quick picks and a custom color ──

function ColorPicker({ theme, value, onChange }: { theme: ThemeName; value: string | null; onChange: (c: string | null) => void }) {
  const t = THEMES[theme]
  const swatch = (bg: string, selected: boolean): CSSProperties => ({
    width: 22, height: 22, borderRadius: '50%', background: bg, cursor: 'pointer', padding: 0,
    border: selected ? '2px solid #ffffff' : '2px solid transparent', outline: '1px solid #2a2e3a',
  })
  return (
    <div style={{ ...label, gap: 8 }} role="group" aria-label="Note color">
      Notes
      {NOTE_COLORS.map((c) => {
        const hex = noteColorFor(c, t)
        // Picking the theme's own color clears the override, so the notes
        // follow the theme again when it changes.
        return <button key={c.name} style={swatch(hex, (value ?? t.note) === hex)} title={c.name} aria-label={c.name} onClick={() => onChange(hex === t.note ? null : hex)} />
      })}
      <input
        type="color"
        title="Custom color"
        aria-label="Custom color"
        value={value ?? t.note}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 28, height: 24, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
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

  const from = Math.min(Math.max(1, fromBar), barCount)
  const to = Math.min(Math.max(from, toBar), barCount)
  const svg = useMemo(
    () => rollToSvg(score, { fromBar: from, toBar: to, width, height, keyboard, barNumbers, noteLabels, background, theme, noteColor }),
    [score, from, to, width, height, keyboard, barNumbers, noteLabels, background, theme, noteColor],
  )
  const name = `${(score.title || 'piano-roll').replace(/[^\w-]+/g, '-').toLowerCase()}-bars-${from}-${to}`
  const num = (v: string, fallback: number) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : fallback)
  const check = (text: string, on: boolean, set: (v: boolean) => void, tip?: string) => (
    <label style={label} title={tip}><input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} /> {text}</label>
  )

  return (
    <section style={{ marginTop: 28, padding: 16, border: '1px solid #2a2e3a', borderRadius: 12, background: '#15171f' }}>
      <h2 style={{ fontSize: 17, margin: '0 0 12px' }}>Image</h2>
      <div style={{ ...row, marginBottom: 12 }}>
        <label style={label} title={`Counted from 1, of ${barCount}`}>
          Bars
          <input style={{ ...field, width: 56 }} type="number" min={1} max={barCount} value={from} onChange={(e) => setFromBar(num(e.target.value, 1))} />
          to
          <input style={{ ...field, width: 56 }} type="number" min={1} max={barCount} value={to} onChange={(e) => setToBar(num(e.target.value, barCount))} />
        </label>
        <label style={label} title="In pixels. PNGs save at twice this size.">
          Size
          <input style={{ ...field, width: 72 }} type="number" min={100} value={width} onChange={(e) => setWidth(num(e.target.value, 1200))} />
          ×
          <input style={{ ...field, width: 72 }} type="number" min={50} value={height} onChange={(e) => setHeight(num(e.target.value, 400))} />
        </label>
        {check('Keyboard', keyboard, setKeyboard)}
        {check('Bar numbers', barNumbers, setBarNumbers)}
        {check('Note names', noteLabels, setNoteLabels)}
        {check('Background', background, setBackground, 'Off for a transparent background')}
      </div>
      <div style={{ overflow: 'auto', border: '1px dashed #2a2e3a', borderRadius: 8, background: 'repeating-conic-gradient(#1c1f2a 0% 25%, #15171f 0% 50%) 50% / 16px 16px' }}>
        <img alt="Image preview" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} style={{ display: 'block', maxWidth: '100%' }} />
      </div>
      <div style={{ ...row, marginTop: 12 }}>
        <button style={button} title="Sharp at any size" onClick={() => downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`)}>Save SVG</button>
        <button style={button} onClick={async () => downloadBlob(await svgToPng(svg, width, height, 2), `${name}.png`)}>Save PNG</button>
      </div>
    </section>
  )
}
