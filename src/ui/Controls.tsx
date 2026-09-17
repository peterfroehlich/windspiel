import { useState, useRef, useLayoutEffect } from 'react'
import type { ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useStore, tubeSpec, maxDrop_mm, optimalDrop_mm, equalLoudnessDrop_mm, tubeGeometry } from '../state/store'
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

  /** Snap the raw value to a nearby marker (within ~3% of the range) and
   *  quantize to the slider step. */
  const snap = (raw: number): number => {
    const range = props.max - props.min
    const tol = 0.03 * range
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
        <span className="track-wrap">
          <input
            type="range"
            min={props.min}
            max={props.max}
            step={props.step}
            value={props.value}
            onChange={onInput}
          />
          {marker !== undefined && (
            <span className="track-marker" style={{ left: `calc(${(marker * 100).toFixed(2)}% - 1px)` }}
              title={props.markerLabel} />
          )}
          {marker2 !== undefined && (
            <span className="track-marker amber" style={{ left: `calc(${(marker2 * 100).toFixed(2)}% - 1px)` }}
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

type SectionId = 'tubes' | 'tuning' | 'striker' | 'wind' | 'optics'

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
  const suspFactor = suspensionLossFactor(config.suspensionPoint, 0)
  const hungT60 = est.decayT60 * suspFactor
  const atNode = config.suspensionPoint >= 0.19 && config.suspensionPoint <= 0.26
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
        <span>Decay T60 (hung @ {(config.suspensionPoint * 100).toFixed(1)}%)</span>
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
  const [muted, setMuted] = useState(false)

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
    tubes: true, striker: false, wind: false, tuning: true, optics: false,
  })
  const toggle = (id: SectionId) => setOpen((o) => ({ ...o, [id]: !o[id] }))

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
        <button className="mute-btn" onClick={() => setWindOn(!windOn)}
          title={windOn ? 'Stop the wind' : 'Start the wind'}>
          {windOn ? '🌬️' : '🚫'}
        </button>
        <button className="mute-btn" onClick={() => { const m = !muted; setMuted(m); audio.setMuted(m) }}
          title={muted ? 'Unmute' : 'Mute'}>
          {muted ? '🔇' : '🔈'}
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
        <input type="checkbox" checked={config.coupling}
          onChange={(e) => setConfig({ coupling: e.target.checked })} />
        <span className="label" style={{ width: 'auto' }}>Tube coupling</span>
        <Help id="coupling" />
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
            const overridden = o.material || o.outerDiameter_mm || o.wallThickness_mm || o.solid !== undefined
            return (
              <div key={i} className={'adv-tube' + (overridden ? ' ovr' : '')}>
                <div className="adv-head">
                  <button className="mini" onClick={() => previewTube(i)}>♪</button>
                  <span className="adv-note">{t.note}</span>
                  <span className="adv-len">{t.length_mm.toFixed(0)} mm</span>
                  {overridden && (
                    <button className="adv-reset" title="Reset this tube to global settings"
                      onClick={() => setTubeOverride(i, { material: config.material, outerDiameter_mm: config.outerDiameter_mm, wallThickness_mm: config.wallThickness_mm, solid: config.solid })}>
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
        onChange={(v) => setConfig({ tuningMode: v as 'scale' | 'manual' })} />
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
            <span className="note">{t.note}</span>
            <span className="freq">{t.freq.toFixed(1)} Hz</span>
            <span className="len">{t.length_mm.toFixed(0)} mm</span>
            {config.tuningMode === 'manual' && (
              <input className="note-input" value={config.manualNotes[i] ?? 'A4'}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setManualNote(i, e.target.value)} />
            )}
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
  const neighbours = config.coupling
    ? tubes.filter((_, j) => j !== i).map((t, j2) => tubeSpec(config, t, j2 < i ? j2 : j2 + 1))
    : []
  const spec = specOf(i)
  const f0 = tubeFrequencies(spec).f0
  const striker = {
    material: config.strikerMaterial, form: config.strikerForm,
    diameter_mm: config.strikerDiameter_mm, height_mm: config.strikerHeight_mm,
  }
  const partials = [1, 2.756, 5.404, 8.933].map((r) =>
    partialExcitation(r * f0, striker, spec, 0.1275, xi))
  audio.strike(spec, 0.85, Math.cos(a) * 0.7, xi, config.suspensionPoint, neighbours, { partials })
  useStore.getState().flash(i, 0.8)
}

/* ───────────────────────── Optics ───────────────────────── */

export const HANGER_TYPES = [
  { id: 'disc',   label: 'Disc cap' },
  { id: 'ring',   label: 'Ring collar' },
  { id: 'bead',   label: 'Bead cap' },
  { id: 'hook',   label: 'Hook pin' },
  { id: 'star',   label: 'Star plate' },
  { id: 'none',   label: 'None (plain string)' },
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
      <Select label="Hanger" value={config.hangerType} helpId="hanger"
        options={HANGER_TYPES as unknown as { id: string; label: string }[]}
        onChange={(v) => setConfig({ hangerType: v })} />
      <ColorRow label="Color" value={config.hangerColor}
        onChange={(c) => setConfig({ hangerColor: c })} />
      <Select label="Sail shape" value={config.sailType} helpId="sailShape"
        options={SAIL_TYPES as unknown as { id: string; label: string }[]}
        onChange={(v) => setConfig({ sailType: v })} />
      <ColorRow label="Sail color" value={config.sailColor}
        onChange={(c) => setConfig({ sailColor: c })} />
    </>
  )
}
