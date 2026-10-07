import { useState } from 'react'
import { MeiPianoRoll } from '../src'
import { EXAMPLE_MEI } from './example'

// ── Demo page ──
// Open any MEI file (button or drag and drop) and see it on the roll. The file
// stays in the browser: nothing is uploaded.

export default function Demo() {
  const [text, setText] = useState(EXAMPLE_MEI)
  const [fileName, setFileName] = useState('built-in example')
  const [dragging, setDragging] = useState(false)

  const open = async (file: File | undefined) => {
    if (!file) return
    setText(await file.text())
    setFileName(file.name)
  }

  return (
    <main
      style={{ maxWidth: 1000, margin: '32px auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif', color: '#e7ecf5' }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); open(e.dataTransfer.files[0]) }}
    >
      <h1 style={{ fontSize: 22 }}>MEI Piano Roll</h1>
      <p style={{ color: '#8b95ad' }}>
        Open an MEI file, or drop one anywhere on the page. Showing: <strong>{fileName}</strong>
      </p>
      <p>
        <input type="file" accept=".mei,.xml" onChange={(e) => open(e.target.files?.[0])} />
      </p>
      <div style={{ outline: dragging ? '2px dashed #4f8cff' : 'none', outlineOffset: 4 }}>
        {/* key: a new file starts a fresh player (playback stopped, view at the start). */}
        <MeiPianoRoll key={fileName} meiText={text} height={320} />
      </div>
    </main>
  )
}
