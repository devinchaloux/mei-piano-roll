import { useMemo, useState, type CSSProperties } from 'react'
import { MeiPianoRoll, THEMES, rollToSvg, svgToPng, downloadBlob, type MeiScore, type ThemeName } from '../src'
import { EXAMPLE_MEI } from './example'

// ── Demo page ──
// Open any MEI file (button or drag and drop) and see it on the roll; choose a
// theme and note colour; make still images of any bars. The file stays in the
// browser: nothing is uploaded.

const label: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, color: '#8b95ad', fontSize: 14 }
const field: CSSProperties = { background: '#15171f', color: '#e8eaf1', border: '1px solid #2a2e3a', borderRadius: 6, padding: '4px 6px', font: 'inherit' }

export default function Demo() {
  const [text, setText] = useState(EXAMPLE_MEI)
  const [fileName, setFileName] = useState('built-in example')
  const [dragging, setDragging] = useState(false)
  const [theme, setTheme] = useState<ThemeName>('studio')
  const [useOwnColour, setUseOwnColour] = useState(false)
  const [colour, setColour] = useState('#ff5ca0')
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
      <h1 style={{ fontSize: 22 }}>MEI Piano Roll</h1>
      <p style={{ color: '#8b95ad' }}>
        Open an MEI file, or drop one anywhere on the page. Showing: <strong>{fileName}</strong>
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', margin: '12px 0' }}>
        <input type="file" accept=".mei,.xml" onChange={(e) => open(e.target.files?.[0])} />
        <label style={label}>
          Theme
          <select style={field} value={theme} onChange={(e) => setTheme(e.target.value as ThemeName)}>
            {Object.keys(THEMES).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label style={label}>
          <input type="checkbox" checked={useOwnColour} onChange={(e) => setUseOwnColour(e.target.checked)} />
          Own note colour
          <input type="color" value={colour} disabled={!useOwnColour} onChange={(e) => setColour(e.target.value)} />
        </label>
      </div>
      <div style={{ outline: dragging ? '2px dashed #4f8cff' : 'none', outlineOffset: 4 }}>
        {/* key: a new file starts a fresh player (playback stopped, view at the start). */}
        <MeiPianoRoll key={fileName} meiText={text} height={320} theme={theme} accent={useOwnColour ? colour : undefined} onLoad={setScore} />
      </div>
      {score && <ImageMaker score={score} theme={theme} noteColor={useOwnColour ? colour : undefined} />}
    </main>
  )
}

// ── Image maker ──
// Still pictures of real excerpts, for cards, slides and article images.

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

  return (
    <section style={{ marginTop: 32, padding: 16, border: '1px solid #2a2e3a', borderRadius: 12, background: '#15171f' }}>
      <h2 style={{ fontSize: 17, margin: '0 0 12px' }}>Image maker</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 12 }}>
        <label style={label}>Bars <input style={{ ...field, width: 56 }} type="number" min={1} max={barCount} value={from} onChange={(e) => setFromBar(num(e.target.value, 1))} />
          to <input style={{ ...field, width: 56 }} type="number" min={1} max={barCount} value={to} onChange={(e) => setToBar(num(e.target.value, barCount))} /> of {barCount}</label>
        <label style={label}>Size <input style={{ ...field, width: 72 }} type="number" min={100} value={width} onChange={(e) => setWidth(num(e.target.value, 1200))} />
          × <input style={{ ...field, width: 72 }} type="number" min={50} value={height} onChange={(e) => setHeight(num(e.target.value, 400))} /> px</label>
        <label style={label}><input type="checkbox" checked={keyboard} onChange={(e) => setKeyboard(e.target.checked)} /> Keyboard</label>
        <label style={label}><input type="checkbox" checked={barNumbers} onChange={(e) => setBarNumbers(e.target.checked)} /> Bar numbers</label>
        <label style={label}><input type="checkbox" checked={noteLabels} onChange={(e) => setNoteLabels(e.target.checked)} /> Note names</label>
        <label style={label}><input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} /> Background</label>
      </div>
      {/* The preview is the exact SVG that downloads. */}
      <div style={{ overflow: 'auto', border: '1px dashed #2a2e3a', borderRadius: 8, background: 'repeating-conic-gradient(#1c1f2a 0% 25%, #15171f 0% 50%) 50% / 16px 16px' }}>
        <img alt="Preview of the image" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} style={{ display: 'block', maxWidth: '100%' }} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button onClick={() => downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`)}>Save SVG</button>
        <button onClick={async () => downloadBlob(await svgToPng(svg, width, height, 2), `${name}.png`)}>Save PNG (2×)</button>
      </div>
    </section>
  )
}
