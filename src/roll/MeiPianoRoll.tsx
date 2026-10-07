import { useEffect, useRef, useState } from "react";
import { parseNative, midiName, isBlackKey } from "../mei/parseNative";
import type { MeiNote, MeiScore, MeiWarning } from "../mei/types";

/* ===========================================================================
 * MeiPianoRoll — an embeddable MEI piano-roll player.
 *
 * Reads MEI with the native reader (src/mei/parseNative.ts), draws a DAW-style
 * piano roll on a single fixed canvas (camera/offset based, so scrolling +
 * playback-follow are smooth — no giant scroll-canvas, no scrollLeft jumps),
 * and plays it back with a Web Audio square-lead synth (matching GM program 81).
 *
 * Usage:
 *   <MeiPianoRoll meiText={xmlString} />
 *   <MeiPianoRoll src="/music/example.mei" />
 * ======================================================================== */

export interface MeiPianoRollProps {
  /** URL to fetch an MEI file from (client-side). */
  src?: string;
  /** Raw MEI XML string (e.g. a Vite `?raw` import). Takes precedence over src. */
  meiText?: string;
  /** Player height in px. Pitch range is fit vertically into this. Default 280. */
  height?: number;
  /** Initial horizontal zoom in px-per-quarter-beat. Default 64. */
  pxPerBeat?: number;
  /** Override the tempo from the file. */
  bpm?: number;
  /** Accent colour for notes. Default "#4f8cff". */
  accent?: string;
  className?: string;
  /** Called with the parsed score (notes and warnings) each time a file loads. */
  onLoad?: (score: MeiScore) => void;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function pitchRange(notes: MeiNote[]): { lo: number; hi: number } {
  if (!notes.length) return { lo: 60, hi: 72 };
  let lo = Infinity, hi = -Infinity;
  for (const n of notes) {
    if (n.midi < lo) lo = n.midi;
    if (n.midi > hi) hi = n.midi;
  }
  return { lo: lo - 1, hi: hi + 1 };
}
function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// Layout constants
const KEY_W = 46;
const RULER_H = 22;
const COL = {
  bg: "#0c0e14",
  rowWhite: "#161b27",
  rowBlack: "#11151f",
  gridBeat: "#222a3b",
  gridMeasure: "#3a455f",
  gutter: "#1b2030",
  text: "#8b95ad",
  playhead: "#ffce4a",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function MeiPianoRoll(props: MeiPianoRollProps) {
  const { src, meiText, height = 280, accent = "#4f8cff" } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scoreRef = useRef<MeiScore | null>(null);
  const bpmRef = useRef<number>(props.bpm ?? 120);
  const pxRef = useRef<number>(props.pxPerBeat ?? 64);
  const loopRef = useRef<boolean>(false);
  const accentRef = useRef<string>(accent);

  const audioRef = useRef<{ ctx: AudioContext; master: GainNode; filter: BiquadFilterNode } | null>(null);
  const sourcesRef = useRef<OscillatorNode[]>([]);
  const drawRef = useRef<() => void>(() => {});
  const loopFnRef = useRef<() => void>(() => {});

  // Transport, kept in a ref so the rAF loop never reads stale React state.
  const tx = useRef({ playing: false, beat: 0, startTime: 0, offsetX: 0, targetOffsetX: 0, raf: 0 });

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [meta, setMeta] = useState<{ title: string; composer: string; line: string } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState<number>(props.bpm ?? 120);
  const [zoom, setZoom] = useState<number>(props.pxPerBeat ?? 64);
  const [loop, setLoop] = useState(false);
  const [warnings, setWarnings] = useState<MeiWarning[]>([]);
  // A ref, so a new onLoad function from the parent doesn't re-read the file.
  const onLoadRef = useRef(props.onLoad);
  useEffect(() => { onLoadRef.current = props.onLoad; }, [props.onLoad]);

  // Keep refs in sync with UI state.
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { pxRef.current = zoom; drawRef.current(); }, [zoom]);
  useEffect(() => { loopRef.current = loop; }, [loop]);
  // Redraw on accent change too — the site wrapper (AnthemRoll) re-passes the
  // accent when the visitor switches it, and notes are painted with it.
  useEffect(() => { accentRef.current = accent; drawRef.current(); }, [accent]);

  const secPerBeat = () => 60 / bpmRef.current;

  // ---- Audio -------------------------------------------------------------
  function ensureAudio() {
    if (audioRef.current) return audioRef.current;
    const AC: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 3200;
    filter.Q.value = 0.6;
    const master = ctx.createGain();
    master.gain.value = 0.22;
    filter.connect(master);
    master.connect(ctx.destination);
    audioRef.current = { ctx, master, filter };
    return audioRef.current;
  }
  function stopAllVoices() {
    for (const s of sourcesRef.current) { try { s.stop(); } catch { /* already stopped */ } }
    sourcesRef.current = [];
  }
  function scheduleNote(freq: number, when: number, dur: number) {
    const a = audioRef.current!;
    const now = a.ctx.currentTime;
    let t0 = when, d = dur;
    if (t0 < now) { d -= now - t0; t0 = now; }
    if (d <= 0.001) return;
    const osc = a.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    const g = a.ctx.createGain();
    const peak = 0.9, sustain = 0.6, rel = 0.05;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.008);
    g.gain.linearRampToValueAtTime(sustain, t0 + Math.min(0.09, d));
    g.gain.setValueAtTime(sustain, Math.max(t0 + 0.01, t0 + d - rel));
    g.gain.linearRampToValueAtTime(0.0001, t0 + d);
    osc.connect(g);
    g.connect(a.filter);
    osc.start(t0);
    osc.stop(t0 + d + 0.02);
    sourcesRef.current.push(osc);
  }
  function scheduleFrom(beatOffset: number) {
    const a = ensureAudio();
    const spb = secPerBeat();
    tx.current.startTime = a.ctx.currentTime + 0.06 - beatOffset * spb;
    const score = scoreRef.current!;
    for (const n of score.notes) {
      if (n.start + n.dur <= beatOffset + 1e-6) continue;
      scheduleNote(midiToFreq(n.midi), tx.current.startTime + n.start * spb, n.dur * spb);
    }
  }

  // ---- Transport ---------------------------------------------------------
  function startLoopIfNeeded() {
    if (!tx.current.raf) tx.current.raf = requestAnimationFrame(loopFnRef.current);
  }
  function play() {
    const score = scoreRef.current;
    if (!score || tx.current.playing) return;
    ensureAudio().ctx.resume();
    if (tx.current.beat >= score.totalBeats - 1e-6) tx.current.beat = 0;
    scheduleFrom(tx.current.beat);
    tx.current.playing = true;
    setPlaying(true);
    startLoopIfNeeded();
  }
  function pause() {
    if (!tx.current.playing) return;
    tx.current.playing = false;
    setPlaying(false);
    stopAllVoices();
  }
  function stop() {
    tx.current.playing = false;
    setPlaying(false);
    stopAllVoices();
    tx.current.beat = 0;
    tx.current.targetOffsetX = 0;
    startLoopIfNeeded();
  }
  function seekToBeat(beat: number) {
    const score = scoreRef.current;
    if (!score) return;
    const b = clamp(beat, 0, score.totalBeats);
    tx.current.beat = b;
    if (tx.current.playing) { stopAllVoices(); scheduleFrom(b); }
    startLoopIfNeeded();
  }
  // Rewind the playhead (and the view) to the start, whether playing or not.
  function toStart() {
    if (!scoreRef.current) return;
    tx.current.beat = 0;
    tx.current.targetOffsetX = 0;
    if (tx.current.playing) { stopAllVoices(); scheduleFrom(0); }
    startLoopIfNeeded();
  }

  // ---- Setup: parse, canvas sizing, input, render loop -------------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        let text = meiText;
        if (!text && src) {
          const res = await fetch(src);
          if (!res.ok) throw new Error(`Could not fetch ${src} (${res.status})`);
          text = await res.text();
        }
        if (!text) throw new Error("No MEI provided (pass `meiText` or `src`).");
        const score = parseNative(text);
        if (cancelled) return;
        scoreRef.current = score;
        setWarnings(score.warnings);
        onLoadRef.current?.(score);
        if (props.bpm == null) { bpmRef.current = score.bpm; setBpm(Math.round(score.bpm)); }
        setMeta({
          title: score.title,
          composer: score.composer,
          line: `${score.notes.length} notes · ${score.meterCount}/${score.meterUnit} · ${Math.round(
            score.totalBeats / score.measureBeats,
          )} bars`,
        });
        setStatus("ready");
        drawRef.current();
      } catch (err) {
        if (cancelled) return;
        setErrMsg(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [src, meiText, props.bpm]);

  // Drawing + input + loop live in one mount effect using refs only.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // The transport object itself is never replaced (only its fields change), so
    // the cleanup below can safely use this same reference.
    const transport = tx.current;

    const draw = () => {
      const cv = canvasRef.current;
      const score = scoreRef.current;
      if (!cv) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const cssW = cv.clientWidth;
      const cssH = cv.clientHeight;
      if (cssW === 0 || cssH === 0) return;
      if (cv.width !== Math.round(cssW * dpr) || cv.height !== Math.round(cssH * dpr)) {
        cv.width = Math.round(cssW * dpr);
        cv.height = Math.round(cssH * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = COL.bg;
      ctx.fillRect(0, 0, cssW, cssH);
      if (!score) return;

      const { lo, hi } = pitchRange(score.notes);
      const rows = hi - lo + 1;
      const noteH = (cssH - RULER_H) / rows;
      const px = pxRef.current;
      const trackW = cssW - KEY_W;
      const contentW = score.totalBeats * px;
      const maxOffset = Math.max(0, contentW - trackW);

      const t = tx.current;
      t.targetOffsetX = clamp(t.targetOffsetX, 0, maxOffset);
      t.offsetX = clamp(t.offsetX, 0, maxOffset);
      const offset = t.offsetX;

      const yFor = (m: number) => RULER_H + (hi - m) * noteH;
      const xFor = (b: number) => KEY_W + b * px - offset;

      // --- clipped track content ---
      ctx.save();
      ctx.beginPath();
      ctx.rect(KEY_W, 0, trackW, cssH);
      ctx.clip();

      // The piece may be narrower than the canvas (zoomed out); only shade and
      // grid up to the actual end of the score so no phantom measures appear.
      const rowRight = clamp(xFor(score.totalBeats), KEY_W, cssW);
      for (let m = lo; m <= hi; m++) {
        ctx.fillStyle = isBlackKey(m) ? COL.rowBlack : COL.rowWhite;
        ctx.fillRect(KEY_W, yFor(m), rowRight - KEY_W, noteH);
      }

      const firstBeat = Math.max(0, Math.floor(offset / px));
      const lastBeat = Math.min(Math.ceil((offset + trackW) / px), Math.floor(score.totalBeats + 1e-6));
      for (let b = firstBeat; b <= lastBeat; b++) {
        const x = xFor(b);
        const isMeasure = Math.abs(b % score.measureBeats) < 1e-6;
        ctx.strokeStyle = isMeasure ? COL.gridMeasure : COL.gridBeat;
        ctx.lineWidth = isMeasure ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, RULER_H);
        ctx.lineTo(Math.round(x) + 0.5, cssH);
        ctx.stroke();
      }

      for (const n of score.notes) {
        const x = xFor(n.start);
        const w = Math.max(2, n.dur * px - 2);
        if (x + w < KEY_W || x > cssW) continue;
        const y = yFor(n.midi);
        const h = noteH - 2;
        const active = t.playing && t.beat >= n.start - 1e-6 && t.beat < n.start + n.dur - 1e-6;
        roundRect(ctx, x + 1, y + 1, w, h, 3);
        const grad = ctx.createLinearGradient(0, y, 0, y + h);
        if (active) { grad.addColorStop(0, "#ffd966"); grad.addColorStop(1, "#f5a623"); }
        else { grad.addColorStop(0, accentRef.current); grad.addColorStop(1, shade(accentRef.current, -0.18)); }
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = active ? "#fff2c4" : shade(accentRef.current, -0.35);
        ctx.lineWidth = 1;
        ctx.stroke();
        if (w > 24 && noteH > 12) {
          ctx.fillStyle = active ? "#3a2a00" : "#eaf1ff";
          ctx.font = "10px ui-monospace, Menlo, Consolas, monospace";
          ctx.textBaseline = "middle";
          ctx.fillText(n.name, x + 5, y + h / 2 + 1);
        }
      }

      // playhead
      const phx = xFor(t.beat);
      if (phx >= KEY_W && phx <= cssW) {
        ctx.strokeStyle = COL.playhead;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(phx, RULER_H);
        ctx.lineTo(phx, cssH);
        ctx.stroke();
      }
      ctx.restore();

      // --- ruler (over content) ---
      ctx.fillStyle = COL.bg;
      ctx.fillRect(0, 0, cssW, RULER_H);
      ctx.fillStyle = COL.text;
      ctx.font = "11px ui-monospace, Menlo, Consolas, monospace";
      ctx.textBaseline = "middle";
      const totalMeasures = Math.ceil(score.totalBeats / score.measureBeats);
      for (let i = 0; i < totalMeasures; i++) {
        const x = xFor(i * score.measureBeats);
        if (x >= KEY_W - 2 && x <= cssW) ctx.fillText(String(i + 1), x + 4, RULER_H / 2);
      }

      // --- keyboard gutter (over everything on the left) ---
      ctx.fillStyle = COL.gutter;
      ctx.fillRect(0, 0, KEY_W, cssH);
      for (let m = lo; m <= hi; m++) {
        const y = yFor(m);
        if (isBlackKey(m)) {
          ctx.fillStyle = "#0a0d14";
          ctx.fillRect(0, y, KEY_W - 8, noteH - 1);
        }
        if (m % 12 === 0 && noteH > 9) {
          ctx.fillStyle = COL.text;
          ctx.font = "10px ui-monospace, Menlo, Consolas, monospace";
          ctx.fillText(midiName(m), 5, y + noteH / 2);
        }
      }
      ctx.strokeStyle = "#2a3247";
      ctx.beginPath();
      ctx.moveTo(KEY_W + 0.5, 0);
      ctx.lineTo(KEY_W + 0.5, cssH);
      ctx.stroke();
    };
    drawRef.current = draw;

    const frame = () => {
      const t = tx.current;
      // smooth camera lerp
      const diff = t.targetOffsetX - t.offsetX;
      if (Math.abs(diff) > 0.4) t.offsetX += diff * 0.22;
      else t.offsetX = t.targetOffsetX;

      if (t.playing) {
        const score = scoreRef.current!;
        t.beat = (audioRef.current!.ctx.currentTime - t.startTime) / secPerBeat();
        if (t.beat >= score.totalBeats) {
          if (loopRef.current) {
            t.beat = 0;
            stopAllVoices();
            scheduleFrom(0);
          } else {
            t.playing = false;
            setPlaying(false);
            stopAllVoices();
            t.beat = score.totalBeats;
          }
        }
        // follow: keep playhead ~38% into the track once it gets there
        const px = pxRef.current;
        const cv = canvasRef.current!;
        const trackW = cv.clientWidth - KEY_W;
        const contentW = score.totalBeats * px;
        const maxOffset = Math.max(0, contentW - trackW);
        t.targetOffsetX = clamp(t.beat * px - trackW * 0.38, 0, maxOffset);
      }

      draw();

      const animating = t.playing || Math.abs(t.targetOffsetX - t.offsetX) > 0.4;
      t.raf = animating ? requestAnimationFrame(frame) : 0;
    };
    loopFnRef.current = frame;

    // --- input: wheel to scroll, drag to pan, click to seek ---
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const t = tx.current;
      t.targetOffsetX += e.deltaX !== 0 ? e.deltaX : e.deltaY;
      startLoopIfNeeded();
    };
    let dragging = false;
    let dragStartX = 0;
    let dragStartOffset = 0;
    let moved = 0;
    let lastClick = 0;
    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      moved = 0;
      dragStartX = e.clientX;
      dragStartOffset = tx.current.targetOffsetX;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* noop */ }
      canvas.style.cursor = "grabbing";
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - dragStartX;
      moved = Math.max(moved, Math.abs(dx));
      tx.current.offsetX = tx.current.targetOffsetX = dragStartOffset - dx;
      startLoopIfNeeded();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      canvas.style.cursor = "grab";
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      if (moved < 4 && scoreRef.current) {
        const now = performance.now();
        if (now - lastClick < 300) {
          // double-click anywhere clears the seek -> back to start
          toStart();
          lastClick = 0;
        } else {
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          if (x > KEY_W) {
            const beat = (tx.current.offsetX + (x - KEY_W)) / pxRef.current;
            seekToBeat(beat);
          }
          lastClick = now;
        }
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Home") { e.preventDefault(); toStart(); }
      else if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        if (tx.current.playing) pause();
        else play();
      }
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("keydown", onKeyDown);
    canvas.style.cursor = "grab";

    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);

    draw();

    return () => {
      ro.disconnect();
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("keydown", onKeyDown);
      if (transport.raf) cancelAnimationFrame(transport.raf);
      transport.raf = 0;
      stopAllVoices();
      audioRef.current?.ctx.close().catch(() => {});
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onBpmChange = (v: number) => {
    if (!(v > 0)) return;
    const wasPlaying = tx.current.playing;
    if (wasPlaying) pause();
    setBpm(v);
    bpmRef.current = v;
    if (wasPlaying) play();
  };

  return (
    <div className={"mpr-root " + (props.className || "")}>
      <style>{CSS}</style>
      <div className="mpr-header">
        <span className="mpr-title">{meta?.title ?? "—"}</span>
        {meta?.composer ? <span className="mpr-composer">· {meta.composer}</span> : null}
        <span className="mpr-spacer" />
        <span className="mpr-meta">{meta?.line ?? ""}</span>
      </div>

      <div className="mpr-toolbar">
        <button
          className="mpr-btn"
          onClick={toStart}
          disabled={status !== "ready"}
          title="Back to start (Home)"
          aria-label="Back to start"
        >
          ⏮
        </button>
        <button
          className="mpr-btn mpr-primary"
          onClick={() => (tx.current.playing ? pause() : play())}
          disabled={status !== "ready"}
        >
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <button className="mpr-btn" onClick={stop} disabled={status !== "ready"}>
          ■ Stop
        </button>
        <label className="mpr-check">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Loop
        </label>
        <span className="mpr-ctl">
          Tempo
          <input
            type="number"
            min={20}
            max={400}
            value={bpm}
            onChange={(e) => onBpmChange(parseFloat(e.target.value))}
          />
          bpm
        </span>
        <span className="mpr-ctl">
          Zoom
          <input
            type="range"
            min={28}
            max={160}
            step={2}
            value={zoom}
            onChange={(e) => setZoom(parseInt(e.target.value, 10))}
          />
        </span>
      </div>

      <canvas ref={canvasRef} className="mpr-canvas" style={{ height }} tabIndex={0} />

      <div className={"mpr-status" + (status === "error" ? " mpr-error" : "")}>
        {status === "loading" && "Loading…"}
        {status === "ready" &&
          "Drag to pan · scroll to scrub · click to seek · ⏮ / double-click / Home to reset · audio starts on first play"}
        {status === "error" && "Error: " + errMsg}
      </div>

      {/* The roll never hides what it leaves out (docs/decisions.md). */}
      {status === "ready" && warnings.length > 0 && (
        <details className="mpr-warnings">
          <summary>What this roll leaves out ({warnings.length})</summary>
          <ul>
            {warnings.map((w) => (
              <li key={w.code}>
                {w.message}
                {w.count > 1 ? ` (${w.count}×)` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// Lighten/darken a hex colour by `amt` (-1..1).
function shade(hex: string, amt: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const adj = (c: number) => clamp(Math.round(c + (amt < 0 ? c * amt : (255 - c) * amt)), 0, 255);
  const r = adj(parseInt(m[1], 16));
  const g = adj(parseInt(m[2], 16));
  const b = adj(parseInt(m[3], 16));
  return `rgb(${r},${g},${b})`;
}

/* Chrome styling spends the SITE's tokens (with the original POC values as
   fallbacks for any host page without tokens.css). The canvas interior keeps
   its own fixed dark palette deliberately: a piano roll is a DAW surface, and
   DAWs are dark in both site themes — it reads as an instrument, not a page.
   Notes are the one canvas element painted with the live site accent. */
const CSS = `
.mpr-root {
  --mpr-panel: var(--surface, #141823); --mpr-panel2: var(--surface-2, #1b2030); --mpr-border: var(--border, #232a3b);
  --mpr-text: var(--text-strong, #e7ecf5); --mpr-muted: var(--text-muted, #8b95ad); --mpr-accent: var(--accent, #4f8cff);
  font: 13px/1.4 var(--font-mono, ui-monospace, Menlo, Consolas, monospace);
  color: var(--mpr-text); background: var(--mpr-panel);
  border: 1px solid var(--mpr-border); border-radius: var(--radius, 12px); overflow: hidden;
  box-shadow: var(--shadow, 0 10px 40px rgba(0,0,0,.35));
}
.mpr-header { display: flex; align-items: baseline; gap: 10px; padding: 14px 16px 10px; border-bottom: 1px solid var(--mpr-border); }
.mpr-title { font-size: 15px; font-weight: 650; }
.mpr-composer { color: var(--mpr-muted); }
.mpr-spacer { flex: 1; }
.mpr-meta { color: var(--mpr-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.mpr-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 16px; background: var(--mpr-panel2); border-bottom: 1px solid var(--mpr-border); }
.mpr-btn { appearance: none; border: 1px solid var(--mpr-border); color: var(--mpr-text); background: var(--mpr-panel); border-radius: 8px; padding: 7px 13px; font: inherit; font-weight: 550; cursor: pointer; transition: background .12s, border-color .12s; }
.mpr-btn:hover:not(:disabled) { border-color: var(--mpr-muted); }
.mpr-btn:disabled { opacity: .5; cursor: default; }
.mpr-primary { background: var(--mpr-accent); border-color: transparent; color: var(--accent-ink, #fff); }
.mpr-primary:hover:not(:disabled) { filter: brightness(1.08); }
.mpr-check { display: flex; align-items: center; gap: 6px; color: var(--mpr-muted); cursor: pointer; user-select: none; }
.mpr-ctl { display: flex; align-items: center; gap: 6px; color: var(--mpr-muted); }
.mpr-ctl input[type="range"] { width: 110px; accent-color: var(--mpr-accent); }
.mpr-ctl input[type="number"] { width: 60px; background: var(--mpr-panel); color: var(--mpr-text); border: 1px solid var(--mpr-border); border-radius: 6px; padding: 5px 7px; font: inherit; }
.mpr-canvas { display: block; width: 100%; touch-action: none; background: #0c0e14; outline: none; }
.mpr-canvas:focus-visible { box-shadow: inset 0 0 0 2px var(--mpr-accent); }
.mpr-status { padding: 10px 16px; color: var(--mpr-muted); font-size: 12px; }
.mpr-error { color: #ff8a8a; }
.mpr-warnings { padding: 0 16px 12px; color: var(--mpr-muted); font-size: 12px; }
.mpr-warnings summary { cursor: pointer; }
.mpr-warnings ul { margin: 6px 0 0; padding-left: 18px; }
`;
