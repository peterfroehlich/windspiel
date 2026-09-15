import { useState, useRef } from 'react'
import type { ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useStore, tubeSpec, maxDrop_mm, optimalDrop_mm, tubeGeometry } from '../state/store'
import { MATERIALS, STRIKER_MATERIALS } from '../physics/materials'
import { SCALES, MOODS, NOTE_NAMES } from '../physics/scales'
import { tubeDecay } from '../physics/tubes'
import { strikeQuality, optimalStrikePoint, suspensionLossFactor } from '../physics/modes'
import { estimateStrike, strikerMass } from '../physics/radiation'
import { audio } from '../audio/engine'
import { HELP } from './help'
import { PhysicsModal } from './PhysicsModal'

function Help({ id }: { id: keyof typeof HELP | string }) {
  const text = HELP[id]
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const ref = useRef<HTMLSpanElement>(null)
  if (!text) return null
  const show = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setPos({ x: r.left + r.width / 2, y: r.top })
    setOpen(true)
  }
  return (
    <>
      <span
        ref={ref}
        className="help"
        tabIndex={0}
        aria-label={`Help: ${id}`}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
      >
        ?
      </span>
      {open && createPortal(
        <span
          className="help-tip"
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
  helpId?: string
}) {
  const marker = props.marker !== undefined
    ? Math.max(0, Math.min(1, (props.marker - props.min) / (props.max - props.min)))
    : undefined
  return (
    <div className="row slider">
      <span className="label">{props.label}</span>
      {props.helpId && <Help id={props.helpId} />}
      {marker !== undefined && (
        <span className="track-wrap">
          <input
            type="range"
            min={props.min}
            max={props.max}
            step={props.step}
            value={props.value}
            onChange={(e: ChangeEvent<HTMLInputElement>) => props.onChange(parseFloat(e.target.value))}
          />
          <span className="track-marker" style={{ left: `calc(${(marker * 100).toFixed(2)}% - 1px)` }}
            title={props.markerLabel} />
        </span>
      )}
      {!marker && (
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

function AcousticsInfo({ tubeIndex }: { tubeIndex?: number | null }) {
  const { config, tubes } = useStore()
  const opt = optimalStrikePoint()
  // hovered tube (from the tube list), else the longest tube as reference
  const idx = tubeIndex != null && tubes[tubeIndex] ? tubeIndex
    : tubes.reduce((best, t, i) => (t.length_mm > tubes[best].length_mm ? i : best), 0)
  const tube = tubes[idx]
  if (!tube) return null
  const spec = tubeSpec(config, tube, idx)
  const striker = { material: config.strikerMaterial, diameter_mm: config.strikerDiameter_mm, height_mm: config.strikerHeight_mm }
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
  const { config, tubes, setConfig, setManualNote, setTubeOverride, reset, windOn, setWindOn } = useStore()
  const [tab, setTab] = useState<'tubes' | 'striker' | 'wind' | 'tuning'>('tubes')
  const [physicsOpen, setPhysicsOpen] = useState(false)
  const [muted, setMuted] = useState(false)
  const [inspectTube, setInspectTube] = useState<number | null>(null)
  // mood + root derived from current config (mood via the active scale)
  const activeScale = SCALES.find((s) => s.id === config.scaleId) ?? SCALES[0]
  const scaleMood = activeScale.mood
  const rootNote = config.rootNote || activeScale.root

  function preview(i: number) {
    audio.init(); audio.resume()
    const a = (i / config.tubeCount) * Math.PI * 2
    const xi = Math.max(0.02, Math.min(0.98, (config.strikerDrop_mm / 1000) / (tubes[i].length_mm / 1000)))
    const neighbours = config.coupling
      ? tubes.filter((_, j) => j !== i).map((t, j2) => tubeSpec(config, t, j2 < i ? j2 : j2 + 1))
      : []
    audio.strike(specOf(i), 0.85, Math.cos(a) * 0.7, xi, config.suspensionPoint, neighbours)
    useStore.getState().flash(i, 0.8)   // 3D wobble feedback, same as clicking the tube
  }

  function playScale() {
    audio.init(); audio.resume()
    tubes.forEach((_, i) => {
      setTimeout(() => preview(i), i * 450)
    })
  }

  function exportSpec() {
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

  return (
    <div className="panel">
      <div className="panel-header">
        <button className="reset-btn" onClick={() => reset()} title="Reset all settings to default">
          ⟲ Reset
        </button>
        <button className="mute-btn" onClick={() => setWindOn(!windOn)}
          title={windOn ? 'Stop the wind' : 'Start the wind'}
          aria-label={windOn ? 'Stop the wind' : 'Start the wind'}>
          {windOn ? '🌬️' : '🚫'}
        </button>
        <button className="mute-btn" onClick={() => { const m = !muted; setMuted(m); audio.setMuted(m) }}
          title={muted ? 'Unmute' : 'Mute'}
          aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted ? '🔇' : '🔈'}
        </button>
        <button className="physics-btn" onClick={() => setPhysicsOpen(true)}
          title="How the simulation works — all the physics">
          ⚛ Physics!
        </button>
      </div>
      {physicsOpen && <PhysicsModal onClose={() => setPhysicsOpen(false)} />}
      <div className="tabs">
        {(['tubes', 'striker', 'wind', 'tuning'] as const).map((t) => (
          <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'tubes' && (
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
            <input type="range" min={0.3} max={5} step={0.1} value={config.wallThickness_mm}
              disabled={config.solid}
              onChange={(e) => setConfig({ wallThickness_mm: parseFloat(e.target.value) })} />
            <span className="val">{config.solid ? 'solid' : config.wallThickness_mm.toFixed(1) + ' mm'}</span>
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
                const overridden = o.material || o.outerDiameter_mm || o.wallThickness_mm
                return (
                  <div key={i} className={'adv-tube' + (overridden ? ' ovr' : '')}>
                    <div className="adv-head">
                      <button className="mini" onClick={() => preview(i)}>♪</button>
                      <span className="adv-note">{t.note}</span>
                      <span className="adv-len">{t.length_mm.toFixed(0)} mm</span>
                      {overridden && (
                        <button className="adv-reset" title="Reset this tube to global settings"
                          onClick={() => setTubeOverride(i, { material: config.material, outerDiameter_mm: config.outerDiameter_mm, wallThickness_mm: config.wallThickness_mm })}>
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
                      <input type="range" min={0.3} max={5} step={0.1}
                        value={Math.min(5, g.t === Infinity ? config.wallThickness_mm : g.t * 1000)}
                        disabled={g.solid}
                        onChange={(e) => setTubeOverride(i, { wallThickness_mm: parseFloat(e.target.value) })} />
                      <span className="adv-val">{g.solid ? 'solid' : (g.t * 1000).toFixed(1)}</span>
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
      )}

      {tab === 'striker' && (
        <>
          <Select label="Material" value={config.strikerMaterial} helpId="strikerMaterial"
            options={Object.values(STRIKER_MATERIALS)}
            onChange={(v) => setConfig({ strikerMaterial: v })} />
          <Slider label="Striker Ø" min={25} max={100} step={1} fmt={(v) => v + ' mm'} helpId="strikerDiameter"
            value={config.strikerDiameter_mm} onChange={(v) => setConfig({ strikerDiameter_mm: v })} />
          <Slider label="Thickness" min={8} max={60} step={1} fmt={(v) => v + ' mm'} helpId="strikerHeight"
            value={config.strikerHeight_mm} onChange={(v) => setConfig({ strikerHeight_mm: v })} />
          <Slider label="Drop" min={20} max={maxDrop_mm(tubes)} step={1} fmt={(v) => v + ' mm'} helpId="strikerDrop"
            value={Math.min(config.strikerDrop_mm, maxDrop_mm(tubes))}
            onChange={(v) => setConfig({ strikerDrop_mm: v })}
            marker={optimalDrop_mm(tubes)}
            markerLabel="◎ optimal center-strike (50% of longest tube)" />
        </>
      )}

      {tab === 'wind' && (
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
      )}

      {tab === 'tuning' && (
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
                    <button
                      key={m.id}
                      className={scaleMood === m.id ? 'mood active' : 'mood'}
                      onClick={() => {
                        // switch mood → jump to first scale of that mood
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
          <button className="btn" onClick={playScale}>▶ Play scale</button>
          <div className="tube-list">
            {tubes.map((t, i) => (
              <div key={i} className="tube-row" tabIndex={0}
                onMouseEnter={() => setInspectTube(i)}
                onMouseLeave={() => setInspectTube(null)}
                onFocus={() => setInspectTube(i)}
                onBlur={() => setInspectTube(null)}
                onClick={() => preview(i)}
                title="Click to strike — hover to see this tube's strike analysis">
                <button className="mini" onClick={(e) => { e.stopPropagation(); preview(i) }}>♪</button>
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
        </>
      )}

      {tab === 'tuning' && <AcousticsInfo tubeIndex={inspectTube} />}

      <div className="footer">
        <button className="btn" onClick={exportSpec}>⬇ Export spec</button>
      </div>
    </div>
  )
}
