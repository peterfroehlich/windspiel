import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import type { ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useStore, tubeSpec, maxDrop_mm, optimalDrop_mm, equalLoudnessDrop_mm, tubeGeometry, tubeSuspension } from '../state/store'
import { MATERIALS, STRIKER_MATERIALS, STRIKER_FORMS } from '../physics/materials'
import { SCALES, MOODS, NOTE_NAMES } from '../physics/scales'
import { tubeDecay } from '../physics/tubes'
import { strikeQuality, optimalStrikePoint, suspensionLossFactor } from '../physics/modes'
import { estimateStrike } from '../physics/radiation'
import { partialExcitation, optimalStrikerMass, strikerMass } from '../physics/contact'
import { tubeFrequencies } from '../physics/tubes'
import { audio } from '../audio/engine'
import { HELP } from './help'
import { PhysicsModal } from './PhysicsModal'
import { DEFAULT_CONFIG } from '../state/store'
import { listPresets as presetsList, savePreset, loadPreset, deletePreset } from '../state/presets'
import { estimateCut, freqToNote } from '../physics/tuning'
import { AudioPitchTracker } from '../audio/pitchDetector'


/** Config keys accepted on import (subset check against foreign JSON). */
const DEFAULT_CONFIG_KEYS = Object.keys(DEFAULT_CONFIG) as (keyof typeof DEFAULT_CONFIG)[]

function Help({ id, custom }: { id: keyof typeof HELP | string; custom?: string }) {
  const text = custom ?? HELP[id]
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null)
  const badgeRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement | null>(null)

  const show = () => {
    const r = badgeRef.current?.getBoundingClientRect()
    if (!r) return
    setPos({ x: r.left + r.width / 2, y: r.top, below: false })
    setOpen(true)
  }
  const hide = () => setOpen(false)

  // Clamp the portaled tooltip inside the viewport: flip below the badge when
  // there is no room above, and keep it within horizontal margins.
  useLayoutEffect(() => {
    if (!open || !pos || !tipRef.current) return
    const rect = tipRef.current.getBoundingClientRect()
    let { x, y, below } = pos
    if (!below && rect.top < 8) {
      const badge = badgeRef.current?.getBoundingClientRect()
      if (badge) {
        below = true
        y = badge.bottom
      }
    }
    const half = rect.width / 2
    const cx = Math.max(8 + half, Math.min(window.innerWidth - 8 - half, x))
    if (cx !== x || below !== pos.below) {
      setPos({ x: cx, y, below })
    }
  }, [open, pos])

  if (!text) return null
  return (
    <>
      <span
        ref={badgeRef}
        className="help"
        tabIndex={0}
        aria-label={`Help: ${id}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        ?
      </span>
      {open && pos && createPortal(
        <span
          ref={tipRef}
          className={'help-tip' + (pos.below ? ' below' : '')}
          role="tooltip"
          style={{ left: pos.x, top: pos.y }}
        >
          {text}
        </span>,
        document.body
      )}
    </>
  )
}

function Slider(props: {
  label: string; min: number; max: number; step: number; value: number
  onChange: (v: number) => void; fmt?: (v: number) => string
  /** optional optimal-value marker (0..1 relative position on the track) */
  marker?: number
  markerLabel?: string
  /** optional second marker (rendered amber) */
  marker2?: number
  marker2Label?: string
  helpId?: string
}) {
  const rel = (v: number) => Math.max(0, Math.min(1, (v - props.min) / (props.max - props.min)))
  const marker = props.marker !== undefined ? rel(props.marker) : undefined
  const marker2 = props.marker2 !== undefined ? rel(props.marker2) : undefined
  const hasMarker = marker !== undefined || marker2 !== undefined

  // Marker pixel position: range inputs travel only across (width − thumbWidth),
  // so pct must map into that reduced span, then offset by the thumb radius —
  // otherwise the tick never aligns with the thumb center (it "lags" at the edges).
  const wrapRef = useRef<HTMLSpanElement>(null)
  const [, forceTick] = useState(0)
  useEffect(() => {
    // re-measure on layout changes (sidebar resize, font load)
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => forceTick((n) => n + 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const markerPx = (pct: number): string => {
    const track = wrapRef.current?.querySelector('input')
    const w = track?.clientWidth ?? 200
    const thumb = 18 // must match --thumb-size in CSS
    const usable = Math.max(1, w - thumb)
    return `${(pct * usable + thumb / 2).toFixed(1)}px`
  }

  /** Snap the raw value to a nearby marker (within ~5% of the range) and
   *  quantize to the slider step. */
  const snap = (raw: number): number => {
    const range = props.max - props.min
    const tol = 0.05 * range
    for (const m of [props.marker, props.marker2]) {
      if (m !== undefined && Math.abs(raw - m) <= tol) {
        // quantize the marker to the slider's own step grid
        return Math.round((m - props.min) / props.step) * props.step + props.min
      }
    }
    return raw
  }

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    props.onChange(snap(parseFloat(e.target.value)))
  }

  return (
    <div className="row slider">
      <span className="label">{props.label}</span>
      {props.helpId && <Help id={props.helpId} />}
      {hasMarker ? (
        <span className="track-wrap" ref={wrapRef}>
          <input
            type="range"
            min={props.min}
            max={props.max}
            step={props.step}
            value={props.value}
            onChange={onInput}
          />
          {marker !== undefined && (
            <span className="track-marker" style={{ left: markerPx(marker) }}
              title={props.markerLabel} />
          )}
          {marker2 !== undefined && (
            <span className="track-marker amber" style={{ left: markerPx(marker2) }}
              title={props.marker2Label} />
          )}
        </span>
      ) : (
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => props.onChange(parseFloat(e.target.value))}
        />
      )}
      <span className="val">{props.fmt ? props.fmt(props.value) : props.value}</span>
    </div>
  )
}

function Select(props: {
  label: string; value: string; options: { id: string; label: string }[]
  onChange: (v: string) => void
  helpId?: string
}) {
  return (
    <div className="row">
      <span className="label">{props.label}</span>
      {props.helpId && <Help id={props.helpId} />}
      <select value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        {props.options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function specOf(i: number) {
  const { config, tubes } = useStore.getState()
  return tubeSpec(config, tubes[i], i)
}

type SectionId = 'tubes' | 'tuning' | 'striker' | 'wind' | 'optics' | 'manufacturing'

/** Collapsible sidebar section. Multiple sections can be open at once and the
 *  sidebar scrolls. Folded sections unmount (cheap) — all values are derived
 *  from the store on reopen, so cross-section updates stay consistent. */
function Section({ id, title, open, toggle, children }: {
  id: SectionId; title: string
  open: Record<SectionId, boolean>
  toggle: (id: SectionId) => void
  children: React.ReactNode
}) {
  const isOpen = open[id]
  return (
    <div className={'section' + (isOpen ? ' open' : '')}>
      <button className="section-head" onClick={() => toggle(id)}
        aria-expanded={isOpen} aria-controls={`section-${id}`}>
        <span className="chevron">{isOpen ? '▾' : '▸'}</span>
        <span className="section-title">{title}</span>
      </button>
      {isOpen && (
        <div className="section-body" id={`section-${id}`}>
          {children}
        </div>
      )}
    </div>
  )
}

function AcousticsInfo({ tubeIndex }: { tubeIndex?: number | null }) {
  const { config, tubes } = useStore()
  const opt = optimalStrikePoint()
  // hovered tube (from the tube list), else the longest tube as reference
  const idx = tubeIndex != null && tubes[tubeIndex] ? tubeIndex
    : tubes.reduce((best, t, i) => (t.length_mm > tubes[best].length_mm ? i : best), 0)
  const tube = tubes[idx]
  if (!tube) return null
  const spec = tubeSpec(config, tube, idx)
  const striker = { material: config.strikerMaterial, form: config.strikerForm, diameter_mm: config.strikerDiameter_mm, height_mm: config.strikerHeight_mm }
  const xi = Math.max(0.02, Math.min(0.98, (config.strikerDrop_mm / 1000) / (tube.length_mm / 1000)))
  const q = strikeQuality(xi)
  const est = estimateStrike(spec, striker, 0.3, xi)
  const best = estimateStrike(spec, striker, 0.3, opt.xi)
  const mass = strikerMass(striker)
  // suspension effect on sustain: free T60 vs hung-at-current-point T60
  const susp = tubeSuspension(config, tubes, idx)
  const suspFactor = suspensionLossFactor(susp.fraction, 0)
  const hungT60 = est.decayT60 * suspFactor
  const atNode = susp.fraction >= 0.19 && susp.fraction <= 0.26
  const label = tubeIndex != null
    ? `Tube ${idx + 1} — ${tube.note} (${tube.length_mm.toFixed(0)} mm)`
    : 'Strike analysis (longest tube)'
  return (
    <div className="acoustics">
      <div className="ac-title">{label}</div>
      <div className="ac-row"><span>Striker mass</span><span>{(mass * 1000).toFixed(0)} g</span></div>
      <div className="ac-row"><span>Impact @ current drop</span><span>ξ = {(xi * 100).toFixed(0)} % of length</span></div>
      <div className="ac-row">
        <span>Fundamental excitation</span>
        <span className={q.nearNode ? 'bad' : q.fundamentalDb > -6 ? 'good' : ''}>
          {q.fundamentalDb.toFixed(1)} dB {q.nearNode ? '(near node — mute!)' : ''}
        </span>
      </div>
      <div className="ac-row">
        <span>2nd partial excitation</span>
        <span>{q.overtoneDb.toFixed(1)} dB</span>
      </div>
      <div className="ac-row"><span>SPL estimate @1 m</span><span>{est.splAt1m.toFixed(0)} dB</span></div>
      <div className="ac-row">
        <span>Decay T60 (hung @ {(susp.fraction * 100).toFixed(1)}%)</span>
        <span className={atNode ? 'good' : ''}>{hungT60.toFixed(1)} s</span>
      </div>
      <div className="ac-hint">
        Optimal strike: center ({(opt.xi * 100).toFixed(0)} %) → {best.splAt1m.toFixed(0)} dB, 2nd partial
        −{opt.overtoneSuppressionDb.toFixed(0)} dB. Suspension node is 22.4 %
        (full {est.decayT60.toFixed(1)} s sustain; off-node costs up to ×4).
      </div>
    </div>
  )
}

export function Controls() {
  const { reset, windOn, setWindOn } = useStore()
  const [physicsOpen, setPhysicsOpen] = useState(false)

  const importInputRef = useRef<HTMLInputElement>(null)

  function importSpec(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        if (!data?.config) throw new Error('missing config')
        // accept only known config keys (defensive against foreign JSON)
        const cfg = { ...DEFAULT_CONFIG_KEYS.reduce((o, k) => (o[k] = data.config[k], o), {} as Record<string, unknown>) }
        // manualNotes array length sanity
        if (!Array.isArray(cfg.manualNotes)) cfg.manualNotes = [...DEFAULT_CONFIG.manualNotes]
        useStore.getState().setConfig(cfg as never)
      } catch (err) {
        alert('Could not import: not a valid windspiel spec file.')
      }
    }
    reader.readAsText(file)
  }

  function exportSpec() {
    const { config, tubes } = useStore.getState()
    const data = {
      exported: new Date().toISOString(),
      config,
      tubes: tubes.map((t, i) => ({
        index: i,
        note: t.note,
        freq_hz: +t.freq.toFixed(2),
        length_mm: +t.length_mm.toFixed(1),
        t60_s: +tubeDecay(specOf(i)).toFixed(2),
      })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'windspiel-spec.json'
    a.click()
  }

  // default: Tubes + Tuning open; everything else folded; multi-open, scrollable
  const [open, setOpen] = useState<Record<SectionId, boolean>>({
    tubes: true, striker: false, wind: false, tuning: true, optics: false, manufacturing: false,
  })
  const toggle = (id: SectionId) => setOpen((o) => ({ ...o, [id]: !o[id] }))

  // localStorage presets (save/load current design by name)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [, setPresetVersion] = useState(0)   // re-render list after save/delete
  const listPresets = () => presetsList()    // fresh read every render

  function doSave() {
    const { config } = useStore.getState()
    savePreset(saveName.trim(), JSON.parse(JSON.stringify(config)))
    setSaveName('')
    setPresetVersion((n) => n + 1)
    setSaveOpen(false)
  }

  function doLoad(name: string) {
    const cfg = loadPreset(name)
    if (cfg) useStore.getState().setConfig(cfg as never)
    setSaveOpen(false)
  }

  return (
    <div className="sidebar">
      <div className="panel-header">
        <button className="reset-btn" onClick={() => reset()} title="Reset all settings to default">
          ⟲ Reset
        </button>
        <button className="icon-btn" onClick={() => importInputRef.current?.click()} title="Import spec (JSON)">📥</button>
        <input ref={importInputRef} type="file" accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importSpec(f); e.target.value = '' }} />
        <button className="icon-btn" onClick={exportSpec} title="Export spec (JSON)">📤</button>
        <button className="icon-btn" onClick={() => setSaveOpen((v) => !v)} title="Save / load configurations (browser storage)">💾</button>
        {saveOpen && (
          <div className="save-pop">
            <input className="save-name" placeholder="Name this chime…" value={saveName}
              autoFocus onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && saveName.trim()) doSave() }} />
            <button className="btn" onClick={doSave} disabled={!saveName.trim()}>Save</button>
            {listPresets().length > 0 && (
              <>
                <div className="save-title">Saved chimes</div>
                <div className="save-list">
                  {listPresets().map((p) => (
                    <div key={p.name} className="save-item" onClick={() => doLoad(p.name)} title="Click to load">
                      <span className="save-item-name">{p.name}</span>
                      <span className="save-item-date">{new Date(p.savedAt).toLocaleDateString()}</span>
                      <button className="adv-reset" title="Delete"
                        onClick={(e) => { e.stopPropagation(); deletePreset(p.name); setPresetVersion((n) => n + 1) }}>✕</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <button className="mute-btn" onClick={() => setWindOn(!windOn)}
          title={windOn ? 'Stop the wind' : 'Start the wind'}>
          {windOn ? '🌬️' : '🚫'}
        </button>
        <button className="physics-btn" onClick={() => setPhysicsOpen(true)} title="All the physics">⚛</button>
      </div>
      {physicsOpen && <PhysicsModal onClose={() => setPhysicsOpen(false)} />}

      <div className="sections">
        <Section id="tubes" title="Tubes" open={open} toggle={toggle}>
          <TubesSection />
        </Section>
        <Section id="tuning" title="Tuning" open={open} toggle={toggle}>
          <TuningSection />
        </Section>
        <Section id="striker" title="Striker" open={open} toggle={toggle}>
          <StrikerSection />
        </Section>
        <Section id="wind" title="Wind" open={open} toggle={toggle}>
          <WindSection />
        </Section>
        <Section id="optics" title="Optics" open={open} toggle={toggle}>
          <OpticsSection />
        </Section>
        <Section id="manufacturing" title="Manufacturing" open={open} toggle={toggle}>
          <ManufacturingSection />
        </Section>
      </div>
    </div>
  )
}



/* ───────────────────────── Sections ───────────────────────── */

function TubesSection() {
  const { config, tubes, setConfig, setTubeOverride } = useStore()
  return (
    <>
      <Slider label="Tubes" min={3} max={12} step={1} helpId="tubeCount"
        value={config.tubeCount} onChange={(v) => setConfig({ tubeCount: v })} />
      <Select label="Material" value={config.material} helpId="material"
        options={Object.values(MATERIALS)}
        onChange={(v) => setConfig({ material: v })} />
      <Slider label="Outer Ø" min={10} max={50} step={0.5} fmt={(v) => v + ' mm'} helpId="outerDiameter"
        value={config.outerDiameter_mm} onChange={(v) => setConfig({ outerDiameter_mm: v })} />
      <div className="row slider">
        <span className="label">Wall</span>
        <Help id="wallThickness" />
        <input type="range" min={0.3} max={5} step={0.05} value={config.wallThickness_mm}
          disabled={config.solid}
          onChange={(e) => setConfig({ wallThickness_mm: parseFloat(e.target.value) })} />
        <span className="val">{config.solid ? 'solid' : config.wallThickness_mm.toFixed(2) + ' mm'}</span>
      </div>
      <label className="row check">
        <input type="checkbox" checked={config.solid}
          onChange={(e) => setConfig({ solid: e.target.checked })} />
        <span className="label" style={{ width: 'auto' }}>Solid rod</span>
        <Help id="solid" />
      </label>
      <Slider label="Susp. radius" min={30} max={120} step={1} fmt={(v) => v + ' mm'} helpId="suspensionRadius"
        value={config.suspensionRadius_mm} onChange={(v) => setConfig({ suspensionRadius_mm: v })} />
      <Slider label="Susp. point" min={0.1} max={0.5} step={0.001} fmt={(v) => (v * 100).toFixed(1) + '%'} helpId="suspensionPoint"
        value={config.suspensionPoint} onChange={(v) => setConfig({ suspensionPoint: v })}
        marker={0.224} markerLabel="◎ mode-1 node — maximum sustain" />
      <label className="row check">
        <input type="checkbox" checked={config.sameAbsoluteSuspension}
          onChange={(e) => setConfig({ sameAbsoluteSuspension: e.target.checked })} />
        <span className="label" style={{ width: 'auto' }}>Same absolute suspension point</span>
        <Help id="sameAbsoluteSuspension" />
      </label>
      <label className="row check adv-toggle">
        <input type="checkbox" checked={config.advanced}
          onChange={(e) => setConfig({ advanced: e.target.checked })} />
        <span className="label" style={{ width: 'auto' }}>⚙ Advanced per-tube</span>
        <Help id="advanced" />
      </label>
      {config.advanced && (
        <div className="adv-list">
          {tubes.map((t, i) => {
            const o = config.tubeOverrides[i] ?? {}
            const g = tubeGeometry(config, i)
            const susp = tubeSuspension(config, tubes, i)
            const overridden = o.material || o.outerDiameter_mm || o.wallThickness_mm || o.solid !== undefined || o.suspension_mm !== undefined || o.suspensionPoint !== undefined
            return (
              <div key={i} className={'adv-tube' + (overridden ? ' ovr' : '')}>
                <div className="adv-head">
                  <button className="mini" onClick={() => previewTube(i)}>♪</button>
                  <span className="adv-note">{t.note}</span>
                  <span className="adv-len">{t.length_mm.toFixed(0)} mm</span>
                  {overridden && (
                    <button className="adv-reset" title="Reset this tube to global settings"
                      onClick={() => setTubeOverride(i, {
                        material: config.material,
                        outerDiameter_mm: config.outerDiameter_mm,
                        wallThickness_mm: config.wallThickness_mm,
                        solid: config.solid,
                        suspension_mm: undefined,
                        suspensionPoint: undefined,
                      })}>
                      ⟲
                    </button>
                  )}
                </div>
                <div className="adv-row">
                  <span className="adv-label">Mat</span>
                  <select value={g.material}
                    onChange={(e) => setTubeOverride(i, { material: e.target.value })}>
                    {Object.values(MATERIALS).map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="adv-row">
                  <span className="adv-label">Ø</span>
                  <input type="range" min={10} max={50} step={0.5}
                    value={g.Do * 1000}
                    onChange={(e) => setTubeOverride(i, { outerDiameter_mm: parseFloat(e.target.value) })} />
                  <span className="adv-val">{(g.Do * 1000).toFixed(1)}</span>
                </div>
                <div className="adv-row">
                  <span className="adv-label">Wall</span>
                  <input type="range" min={0.3} max={5} step={0.05}
                    value={Math.min(5, g.t === Infinity ? config.wallThickness_mm : g.t * 1000)}
                    disabled={g.solid}
                    onChange={(e) => setTubeOverride(i, { wallThickness_mm: parseFloat(e.target.value) })} />
                  <span className="adv-val">{g.solid ? 'solid' : (g.t * 1000).toFixed(2)}</span>
                </div>
                <div className="adv-row">
                  <span className="adv-label">Solid</span>
                  <input type="checkbox" checked={g.solid}
                    onChange={(e) => setTubeOverride(i, { solid: e.target.checked })} />
                  <span className="adv-val" style={{ width: 'auto' }}>rod</span>
                </div>
                <div className="adv-row">
                  <span className="adv-label">Susp</span>
                  <input type="range"
                    min={5}
                    max={Math.max(50, Math.round(t.length_mm * 0.5))}
                    step={0.5}
                    value={Math.round((o.suspension_mm ?? susp.mm) * 2) / 2}
                    onChange={(e) => setTubeOverride(i, { suspension_mm: parseFloat(e.target.value) })} />
                  <span className="adv-val">{susp.mm.toFixed(1)} mm</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function TuningSection() {
  const { config, tubes, setConfig, setManualNote } = useStore()
  const activeScale = SCALES.find((s) => s.id === config.scaleId) ?? SCALES[0]
  const scaleMood = activeScale.mood
  const rootNote = config.rootNote || activeScale.root
  const [inspectTube, setInspectTube] = useState<number | null>(null)
  return (
    <>
      <Select label="Mode" value={config.tuningMode} helpId="tuningMode"
        options={[{ id: 'scale', label: 'Scale preset' }, { id: 'manual', label: 'Manual notes' }]}
        onChange={(v) => {
          if (v === 'manual' && config.tuningMode !== 'manual') {
            setConfig({
              tuningMode: 'manual',
              manualNotes: tubes.map((t) => t.note),
            })
          } else {
            setConfig({ tuningMode: v as 'scale' | 'manual' })
          }
        }} />
      {config.tuningMode === 'scale' && (
        <>
          <div className="row">
            <span className="label">Mood</span>
            <Help id="mood" />
            <div className="mood-row">
              {MOODS.map((m) => (
                <button key={m.id}
                  className={scaleMood === m.id ? 'mood active' : 'mood'}
                  onClick={() => {
                    const first = SCALES.find((s) => s.mood === m.id)
                    if (first) setConfig({ scaleId: first.id })
                  }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <Select label="Scale" value={config.scaleId} helpId="scale"
            options={SCALES.filter((s) => s.mood === scaleMood)}
            onChange={(v) => setConfig({ scaleId: v })} />
          <Select label="Root" value={rootNote} helpId="rootNote"
            options={NOTE_NAMES.map((n) => ({ id: n, label: n }))}
            onChange={(v) => setConfig({ rootNote: v })} />
        </>
      )}
      <button className="btn" onClick={() => tubes.forEach((_, i) => setTimeout(() => previewTube(i), i * 450))}>
        ▶ Play scale
      </button>
      <div className="tube-list">
        {tubes.map((t, i) => (
          <div key={i} className="tube-row" tabIndex={0}
            onMouseEnter={() => setInspectTube(i)}
            onMouseLeave={() => setInspectTube(null)}
            onFocus={() => setInspectTube(i)}
            onBlur={() => setInspectTube(null)}
            onClick={() => previewTube(i)}
            title="Click to strike — hover to see this tube's strike analysis">
            <button className="mini" onClick={(e) => { e.stopPropagation(); previewTube(i) }}>♪</button>
            {config.tuningMode === 'manual' ? (
              <input
                className="note-input"
                value={config.manualNotes[i] ?? t.note}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setManualNote(i, e.target.value)}
                title="Enter note name (e.g. C5, F#4, Bb4)"
              />
            ) : (
              <span className="note">{t.note}</span>
            )}
            <span className="freq">{t.freq.toFixed(1)} Hz</span>
            <span className="len">{t.length_mm.toFixed(0)} mm</span>
          </div>
        ))}
      </div>
      <AcousticsInfo tubeIndex={inspectTube} />
    </>
  )
}

function StrikerSection() {
  const { config, tubes, setConfig } = useStore()
  const refSpec = tubeSpec(config, tubes[0], 0)
  const optimal = optimalStrikerMass(refSpec) * 1000
  const current = strikerMass({ material: config.strikerMaterial, form: config.strikerForm, diameter_mm: config.strikerDiameter_mm, height_mm: config.strikerHeight_mm }) * 1000
  return (
    <>
      <Select label="Material" value={config.strikerMaterial} helpId="strikerMaterial"
        options={Object.values(STRIKER_MATERIALS)}
        onChange={(v) => setConfig({ strikerMaterial: v })} />
      <Select label="Form" value={config.strikerForm} helpId="strikerForm"
        options={Object.values(STRIKER_FORMS)}
        onChange={(v) => setConfig({ strikerForm: v })} />
      <Slider label="Striker Ø" min={25} max={100} step={1} fmt={(v) => v + ' mm'} helpId="strikerDiameter"
        value={config.strikerDiameter_mm} onChange={(v) => setConfig({ strikerDiameter_mm: v })} />
      <div className="row">
        <span className="label">Mass</span>
        <Help
          id="strikerMass"
          custom={[
            `Your striker: ${current.toFixed(0)} g — the ◎ optimum is the mode-1 EFFECTIVE MASS of the longest tube:`,
            `m_eff = M · ∫φ₁²dξ / φ₁(0.5)² ≈ ${(optimal / 1000).toFixed(3)} kg`,
            'Why: energy transfer between striker and tube is maximal at the impedance',
            'match m_striker ≈ m_eff. A much lighter striker bounces off without',
            'transferring its kinetic energy (weak impulse J = μ(1+e)v); a much heavier',
            'one cannot be swung by the wind sail (acceleration F/m too small → it leans',
            'against the tubes instead of striking). μ = m_s·m_eff/(m_s+m_eff) reaches 50%',
            'of m_eff at equality — the best compromise between impulse and wind-pumpability.',
            'Note: geometry/material change the striker mass; the ◎ target follows the tubes.',
          ].join(' ')}
        />
        <span className="mass-hint">
          {current.toFixed(0)} g <span className="opt-tag">◎ optimal ≈ {optimal.toFixed(0)} g</span>
        </span>
      </div>
      <Slider label="Thickness" min={8} max={60} step={1} fmt={(v) => v + ' mm'} helpId="strikerHeight"
        value={config.strikerHeight_mm} onChange={(v) => setConfig({ strikerHeight_mm: v })} />
      <Slider label="Drop" min={20} max={maxDrop_mm(tubes)} step={1} fmt={(v) => v + ' mm'} helpId="strikerDrop"
        value={Math.min(config.strikerDrop_mm, maxDrop_mm(tubes))}
        onChange={(v) => setConfig({ strikerDrop_mm: v })}
        marker={optimalDrop_mm(tubes)}
        markerLabel="◎ optimal center-strike (50% of longest tube)"
        marker2={equalLoudnessDrop_mm(tubes, config.suspensionPoint)}
        marker2Label="◎ drop where all tubes sound most equally loud" />
      <div className="marker-legend">
        <span className="legend-item"><i className="dot green" /> best tone (center-strike)</span>
        <span className="legend-item"><i className="dot amber" /> equal loudness</span>
      </div>
    </>
  )
}

function WindSection() {
  const { config, setConfig } = useStore()
  return (
    <>
      <Slider label="Wind" min={0} max={1} step={0.01} fmt={(v) => (v * 100).toFixed(0) + '%'} helpId="windStrength"
        value={config.windStrength} onChange={(v) => setConfig({ windStrength: v })} />
      <Slider label="Gusts" min={0.02} max={1} step={0.01} fmt={(v) => v.toFixed(2) + ' Hz'} helpId="gustFrequency"
        value={config.gustFrequency} onChange={(v) => setConfig({ gustFrequency: v })} />
      <Slider label="Sail mass" min={5} max={200} step={1} fmt={(v) => v + ' g'} helpId="sailMass"
        value={config.sailMass_g} onChange={(v) => setConfig({ sailMass_g: v })} />
      <Slider label="Volume" min={0} max={1} step={0.01} fmt={(v) => (v * 100).toFixed(0) + '%'} helpId="volume"
        value={config.volume} onChange={(v) => { setConfig({ volume: v }); audio.setVolume(v) }} />
    </>
  )
}

/** Strike a tube from the UI (used by tube list & advanced cards). */
function previewTube(i: number) {
  const { config, tubes } = useStore.getState()
  audio.init(); audio.resume()
  const a = (i / config.tubeCount) * Math.PI * 2
  const xi = Math.max(0.02, Math.min(0.98, (config.strikerDrop_mm / 1000) / (tubes[i].length_mm / 1000)))
  const neighbours = tubes.filter((_, j) => j !== i).map((_, j2) => specOf(j2 < i ? j2 : j2 + 1))
  const spec = specOf(i)
  const f0 = tubeFrequencies(spec).f0
  const striker = {
    material: config.strikerMaterial, form: config.strikerForm,
    diameter_mm: config.strikerDiameter_mm, height_mm: config.strikerHeight_mm,
  }
  const partials = [1, 2.756, 5.404, 8.933].map((r) =>
    partialExcitation(r * f0, striker, spec, 0.1275, xi))
  const susp = tubeSuspension(config, tubes, i)
  audio.strike(spec, 0.85, Math.cos(a) * 0.7, xi, susp.fraction, neighbours, { partials })
  useStore.getState().flash(i, 0.8)
}

/* ───────────────────────── Optics ───────────────────────── */

export const PLATE_TYPES = [
  { id: 'disc',    label: 'Disc' },
  { id: 'ring',    label: 'Ring (open center)' },
  { id: 'octagon', label: 'Octagon' },
  { id: 'square',  label: 'Square' },
] as const

export const SAIL_TYPES = [
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'diamond',   label: 'Diamond' },
  { id: 'circle',    label: 'Circle (disc)' },
  { id: 'teardrop',  label: 'Teardrop' },
  { id: 'feather',   label: 'Feather (slat)' },
] as const

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (c: string) => void }) {
  return (
    <div className="row">
      <span className="label">{label}</span>
      <input type="color" className="color-input" value={value}
        onChange={(e) => onChange(e.target.value)} />
      <span className="val" style={{ textTransform: 'uppercase' }}>{value}</span>
    </div>
  )
}

function OpticsSection() {
  const { config, setConfig } = useStore()
  return (
    <>
      <Select label="Top plate" value={config.plateShape} helpId="topPlate"
        options={PLATE_TYPES as unknown as { id: string; label: string }[]}
        onChange={(v) => setConfig({ plateShape: v })} />
      <Slider label="Plate Ø" min={60} max={200} step={2} fmt={(v) => v + ' mm'} helpId="topPlate"
        value={config.plateRadius_mm * 2} onChange={(v) => setConfig({ plateRadius_mm: v / 2 })} />
      <ColorRow label="Plate color" value={config.plateColor}
        onChange={(c) => setConfig({ plateColor: c })} />
      <Slider label="Tube offset" min={0} max={100} step={1} fmt={(v) => v + ' mm'} helpId="tubeOffset"
        value={config.tubeDrop_mm} onChange={(v) => setConfig({ tubeDrop_mm: v })} />
      <Select label="Sail shape" value={config.sailType} helpId="sailShape"
        options={SAIL_TYPES as unknown as { id: string; label: string }[]}
        onChange={(v) => setConfig({ sailType: v })} />
      <ColorRow label="Sail color" value={config.sailColor}
        onChange={(c) => setConfig({ sailColor: c })} />
    </>
  )
}

/* ───────────────────────── Manufacturing ───────────────────────── */

function ManufacturingSection() {
  const { config, tubes, setWindOn } = useStore()
  const [copied, setCopied] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [canScrollLeft, setCanScrollLeft] = useState(false)

  // Tuning & Analysis tool state
  const [selectedTubeIndex, setSelectedTubeIndex] = useState(0)
  const [isListening, setIsListening] = useState(false)
  const [liveFreq, setLiveFreq] = useState<number | null>(null)
  const [liveRms, setLiveRms] = useState(0)
  const [capturedFreq, setCapturedFreq] = useState<number | null>(null)
  const [manualFreqInput, setManualFreqInput] = useState<string>('')
  const [customLengthInput, setCustomLengthInput] = useState<string>('')
  const [micError, setMicError] = useState<string | null>(null)

  const trackerRef = useRef<AudioPitchTracker | null>(null)

  const checkScroll = () => {
    const el = wrapRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(maxScroll > 4 && el.scrollLeft < maxScroll - 4)
  }

  useEffect(() => {
    checkScroll()
    const id = requestAnimationFrame(checkScroll)
    window.addEventListener('resize', checkScroll)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', checkScroll)
    }
  }, [tubes, config])

  const scrollRight = () => {
    wrapRef.current?.scrollBy({ left: 100, behavior: 'smooth' })
  }
  const scrollLeft = () => {
    wrapRef.current?.scrollBy({ left: -100, behavior: 'smooth' })
  }

  const copyCutList = () => {
    const headers = ['Tube', 'Note', 'Material', 'Outer Ø (mm)', 'Wall (mm)', 'Length (mm)', 'Suspension Pos (mm from top)']
    const rows = tubes.map((t, i) => {
      const g = tubeGeometry(config, i)
      const susp = tubeSuspension(config, tubes, i)
      const mat = MATERIALS[g.material]?.label ?? g.material
      const dia = (g.Do * 1000).toFixed(1)
      const wall = g.solid ? 'solid' : (g.t * 1000).toFixed(2)
      return [i + 1, t.note, mat, dia, wall, t.length_mm.toFixed(1), susp.mm.toFixed(1)].join('\t')
    })
    navigator.clipboard?.writeText([headers.join('\t'), ...rows].join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Active tube selection
  const activeIdx = Math.min(selectedTubeIndex, Math.max(0, tubes.length - 1))
  const activeTube = tubes[activeIdx]
  const targetFreq = activeTube?.freq ?? 440
  const designedLength_mm = activeTube ? activeTube.length_mm : 300

  // Physical length used for calculation (custom length if user entered one, else designed length)
  const currentLength_mm = parseFloat(customLengthInput) > 0
    ? parseFloat(customLengthInput)
    : designedLength_mm

  // Update pitch tracker target when tube changes
  useEffect(() => {
    if (trackerRef.current) {
      trackerRef.current.setTargetFreq(targetFreq)
    }
  }, [targetFreq])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (trackerRef.current) {
        trackerRef.current.stop()
        trackerRef.current = null
      }
    }
  }, [])

  const startMic = async () => {
    // Disable wind and stop any note currently playing
    setWindOn(false)
    audio.stopAll()

    setMicError(null)
    setCapturedFreq(null)
    setLiveFreq(null)

    const tracker = new AudioPitchTracker({
      onLiveUpdate: ({ freq, rms }) => {
        setLiveRms(rms)
        if (freq) {
          setLiveFreq(freq)
        }
      },
      onStrikeDetected: (freq) => {
        setCapturedFreq(freq)
        setManualFreqInput(freq.toFixed(1))
      },
      onError: (err) => {
        setMicError(err.message || 'Microphone access denied')
        setIsListening(false)
      },
    })
    tracker.setTargetFreq(targetFreq)
    trackerRef.current = tracker

    try {
      await tracker.start()
      setIsListening(true)
    } catch (e: any) {
      setMicError(e?.message || 'Could not start microphone')
      setIsListening(false)
    }
  }

  const stopMic = () => {
    if (trackerRef.current) {
      trackerRef.current.stop()
      trackerRef.current = null
    }
    setIsListening(false)
    setLiveRms(0)
  }

  const toggleMic = () => {
    if (isListening) {
      stopMic()
    } else {
      setWindOn(false)
      audio.stopAll()
      startMic()
    }
  }

  // Active frequency to analyze: manual typed input || strike captured || live
  const parsedManual = parseFloat(manualFreqInput)
  const measuredFreq = parsedManual > 0
    ? parsedManual
    : (capturedFreq ?? liveFreq ?? 0)

  const cutEstimate = estimateCut(measuredFreq, targetFreq, currentLength_mm)
  const noteInfo = freqToNote(measuredFreq)

  // Calculate new suspension hole position
  const newLength_mm = cutEstimate.targetLength_mm
  const newSusp_mm = config.sameAbsoluteSuspension
    ? tubeSuspension(config, tubes, 0).mm
    : newLength_mm * tubeSuspension(config, tubes, activeIdx).fraction

  // Cents needle position: clamp between -50 and +50 cents, map to 0% .. 100%
  const centsDeviation = measuredFreq > 0
    ? 1200 * Math.log2(measuredFreq / targetFreq)
    : 0
  const clampedCents = Math.max(-50, Math.min(50, centsDeviation))
  const needlePercent = 50 + (clampedCents / 50) * 50

  const needleColor = Math.abs(centsDeviation) <= 5
    ? '#7ddb91' // in tune
    : centsDeviation < 0
      ? '#6c8cff' // flat (needs cut)
      : '#ff8a65' // sharp (too short)

  return (
    <div className="mfg-section">
      <div className="mfg-container">
        {canScrollLeft && (
          <button className="mfg-scroll-hint left" onClick={scrollLeft} title="Scroll left">
            ‹
          </button>
        )}
        {canScrollRight && (
          <button className="mfg-scroll-hint right" onClick={scrollRight} title="Scroll right for suspension position">
            <span>more ›</span>
          </button>
        )}
        <div className="mfg-table-wrap" ref={wrapRef} onScroll={checkScroll}>
          <table className="mfg-table">
            <thead>
              <tr>
                <th title="Tube index & note">Tube</th>
                <th title="Tube material">Material</th>
                <th title="Outer diameter in mm">Ø</th>
                <th title="Wall thickness in mm">Wall</th>
                <th title="Cut length in mm">Length</th>
                <th title="Suspension hole distance from top end in mm">Susp.</th>
              </tr>
            </thead>
            <tbody>
              {tubes.map((t, i) => {
                const g = tubeGeometry(config, i)
                const susp = tubeSuspension(config, tubes, i)
                const matLabel = MATERIALS[g.material]?.label ?? g.material
                const dia_mm = (g.Do * 1000).toFixed(1)
                const wall_mm = g.solid ? 'solid' : (g.t * 1000).toFixed(2) + ' mm'
                const isSelected = activeIdx === i
                return (
                  <tr
                    key={i}
                    className={isSelected ? 'mfg-row-active' : ''}
                    onClick={() => {
                      setSelectedTubeIndex(i)
                      setCapturedFreq(null)
                      setManualFreqInput('')
                      setCustomLengthInput('')
                    }}
                    title={`Click to select Tube #${i + 1} (${t.note}) for tuning analysis`}
                  >
                    <td>
                      <span className="mfg-idx">#{i + 1}</span>{' '}
                      <span className="mfg-note">{t.note}</span>
                    </td>
                    <td className="mfg-mat" title={matLabel}>{matLabel}</td>
                    <td className="mfg-num">{dia_mm} mm</td>
                    <td className="mfg-num">{wall_mm}</td>
                    <td className="mfg-num mfg-len">{t.length_mm.toFixed(1)} mm</td>
                    <td className="mfg-num mfg-susp">{susp.mm.toFixed(1)} mm</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mfg-footer">
        <div className="mfg-hint">
          {config.sameAbsoluteSuspension
            ? `Holes drilled at uniform ${tubeSuspension(config, tubes, 0).mm.toFixed(1)} mm from top`
            : `Holes drilled @ ${(config.suspensionPoint * 100).toFixed(1)}% of length from top`}
        </div>
        <button className="mini-action-btn" onClick={copyCutList} title="Copy cut list to clipboard (tab-separated)">
          {copied ? '✓ Copied' : '📋 Copy cut list'}
        </button>
      </div>

      {/* ────────────────── Frequency Analysis & Cut Tool ────────────────── */}
      <div className="mfg-analyzer">
        <div className="mfg-analyzer-header">
          <div className="mfg-analyzer-title">
            <span>🔬 Tuning & Cut Tool</span>
          </div>
          <span className="mfg-analyzer-badge">
            Tube #{activeIdx + 1} • {activeTube?.note}
          </span>
        </div>

        {/* Tube picker row */}
        <div className="mfg-select-row">
          <label htmlFor="mfg-tube-pick">Select tube:</label>
          <select
            id="mfg-tube-pick"
            className="mfg-tube-select"
            value={activeIdx}
            onChange={(e) => {
              const idx = parseInt(e.target.value, 10)
              setSelectedTubeIndex(idx)
              setCapturedFreq(null)
              setManualFreqInput('')
              setCustomLengthInput('')
            }}
          >
            {tubes.map((t, i) => (
              <option key={i} value={i}>
                #{i + 1} {t.note} ({t.freq.toFixed(1)} Hz) · {t.length_mm.toFixed(1)} mm
              </option>
            ))}
          </select>
        </div>

        {/* Microphone and reference tone controls */}
        <div className="mfg-mic-controls">
          <button
            type="button"
            className="mfg-play-btn"
            onClick={() => previewTube(activeIdx)}
            title={`Play reference tone for Tube #${activeIdx + 1} (${activeTube?.note}, ${targetFreq.toFixed(1)} Hz)`}
          >
            ▶️
          </button>
          <button
            type="button"
            className={`mfg-mic-btn ${isListening ? 'active' : ''}`}
            onClick={toggleMic}
            title={isListening ? 'Stop microphone' : 'Enable microphone to analyze tube strike frequency'}
          >
            {isListening ? (
              <>
                <span style={{ fontSize: 10 }}>🔴</span> Listening... (Click to stop)
              </>
            ) : (
              <>
                <span>🎙️</span> Enable Microphone
              </>
            )}
          </button>
        </div>

        {/* Live VU meter */}
        {isListening && (
          <div className="mfg-vu-meter" title={`Input level: ${(liveRms * 100).toFixed(0)}%`}>
            <div
              className="mfg-vu-bar"
              style={{ width: `${Math.min(100, liveRms * 350)}%` }}
            />
          </div>
        )}

        {micError && (
          <div className="mfg-hint" style={{ color: '#ff8a65', background: 'rgba(255, 138, 101, 0.1)', padding: '4px 6px', borderRadius: 4 }}>
            ⚠️ {micError}
          </div>
        )}

        {/* Tuner Box */}
        <div className="mfg-tuner-box">
          <div className="mfg-tuner-readout">
            <div className="mfg-freq-live">
              {measuredFreq > 0 ? (
                <>
                  {measuredFreq.toFixed(1)} <span className="mfg-freq-unit">Hz</span>
                </>
              ) : (
                <span style={{ fontSize: 13, color: '#7b88a1', fontWeight: 400 }}>
                  {isListening ? 'Strike tube to detect frequency...' : 'Microphone inactive'}
                </span>
              )}
            </div>
            <div className="mfg-target-hint">
              Target: <strong>{targetFreq.toFixed(1)} Hz</strong> ({activeTube?.note})
            </div>
          </div>

          {/* Deviation Gauge */}
          <div className="mfg-cents-gauge" title={measuredFreq > 0 ? `${centsDeviation > 0 ? '+' : ''}${centsDeviation.toFixed(1)} cents` : 'Tuning needle'}>
            <div className="mfg-gauge-center" />
            <div className="mfg-gauge-sweet-spot" />
            {measuredFreq > 0 && (
              <div
                className="mfg-gauge-needle"
                style={{
                  left: `${needlePercent}%`,
                  backgroundColor: needleColor,
                  boxShadow: `0 0 6px ${needleColor}`,
                }}
              />
            )}
          </div>
          <div className="mfg-gauge-labels">
            <span>−50¢ (Flat)</span>
            <span>0¢</span>
            <span>+50¢ (Sharp)</span>
          </div>
        </div>

        {/* Strike capture banner */}
        {capturedFreq && (
          <div className="mfg-strike-banner">
            <span>🎯 Strike locked: <strong>{capturedFreq.toFixed(1)} Hz</strong> ({noteInfo.note})</span>
            <button
              onClick={() => {
                setCapturedFreq(null)
                setManualFreqInput('')
              }}
              title="Clear locked strike frequency and re-measure"
            >
              Re-measure ↺
            </button>
          </div>
        )}

        {/* Length inputs */}
        <div className="mfg-length-input-row">
          <span title="Physical length of your rough-cut tube before trimming">Current tube length:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="number"
              step="0.5"
              placeholder={designedLength_mm.toFixed(1)}
              value={customLengthInput}
              onChange={(e) => setCustomLengthInput(e.target.value)}
              title="Enter rough measured length in mm (default: designed length)"
            />
            <span style={{ color: '#7b88a1', fontSize: 10 }}>mm</span>
            {customLengthInput && (
              <button
                className="mini-action-btn"
                style={{ padding: '1px 5px', fontSize: 9 }}
                onClick={() => setCustomLengthInput('')}
                title="Reset to designed length"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="mfg-length-input-row">
          <span title="Measured frequency in Hz (updated by mic or manual entry)">Measured frequency:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="number"
              step="0.1"
              placeholder={measuredFreq > 0 ? measuredFreq.toFixed(1) : 'e.g. 510.5'}
              value={manualFreqInput}
              onChange={(e) => {
                setManualFreqInput(e.target.value)
                setCapturedFreq(null)
              }}
              title="Enter measured frequency in Hz manually or use microphone"
            />
            <span style={{ color: '#7b88a1', fontSize: 10 }}>Hz</span>
            {manualFreqInput && (
              <button
                className="mini-action-btn"
                style={{ padding: '1px 5px', fontSize: 9 }}
                onClick={() => {
                  setManualFreqInput('')
                  setCapturedFreq(null)
                }}
                title="Clear manual frequency"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Cut Recommendation Card */}
        {measuredFreq > 0 ? (
          <div className={`mfg-cut-card ${cutEstimate.status}`}>
            <div className="mfg-cut-primary">
              <div className="mfg-cut-amount">
                {cutEstimate.status === 'in_tune' && (
                  <><span>✓</span> In Tune (±{Math.abs(cutEstimate.cents).toFixed(1)}¢)</>
                )}
                {cutEstimate.status === 'flat' && (
                  <><span>✂️</span> Cut off: <strong>{cutEstimate.cutAmount_mm.toFixed(1)} mm</strong></>
                )}
                {cutEstimate.status === 'sharp' && (
                  <><span>⚠️</span> Too short by {Math.abs(cutEstimate.cutAmount_mm).toFixed(1)} mm</>
                )}
              </div>
              <span
                className="mfg-analyzer-badge"
                style={{
                  color: needleColor,
                  borderColor: needleColor,
                  background: `${needleColor}20`,
                }}
              >
                {cutEstimate.status === 'in_tune' ? 'Exact' : cutEstimate.status === 'flat' ? 'Flat' : 'Sharp'}
              </span>
            </div>

            <div className="mfg-cut-details">
              <div>Cut length: <strong>{newLength_mm.toFixed(1)} mm</strong></div>
              <div>Susp. hole: <strong>{newSusp_mm.toFixed(1)} mm</strong></div>
              <div>Target: <strong>{targetFreq.toFixed(1)} Hz</strong> ({activeTube?.note})</div>
              <div>Offset: <strong>{centsDeviation > 0 ? '+' : ''}{centsDeviation.toFixed(1)}¢</strong></div>
            </div>

            {cutEstimate.status === 'sharp' && (
              <div className="mfg-hint" style={{ color: '#ff9e80', marginTop: 4 }}>
                Tube is vibrating higher than target. Shortening further will raise the pitch.
                To lower pitch: sand or grind the center antinode wall thinner, or reassign to a higher note.
              </div>
            )}
          </div>
        ) : (
          <div className="mfg-hint" style={{ textAlign: 'center', padding: '6px 0', color: '#6a7488' }}>
            Strike the tube near your microphone to detect pitch & calculate exact cut.
          </div>
        )}
      </div>
    </div>
  )
}

