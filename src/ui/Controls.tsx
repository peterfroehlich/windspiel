import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import type { ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useStore, tubeSpec, maxDrop_mm, optimalDrop_mm, equalLoudnessDrop_mm, minSailDrop_mm, optimalSailDrop_mm, tubeGeometry, tubeSuspension, tubeMountingPosition, effectiveStrikerDimensions } from '../state/store'
import type { TubeAlignment } from '../state/store'
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
import { ManufacturingTipsModal } from './ManufacturingTipsModal'
import { DesignTipsModal } from './DesignTipsModal'
import { DEFAULT_CONFIG } from '../state/store'
import { listPresets as presetsList, savePreset, loadPreset, deletePreset } from '../state/presets'
import { generateShareUrl, copyToClipboard } from '../state/share'
import { estimateCut, freqToNote, calculateMaterialCalibration } from '../physics/tuning'
import { AudioPitchTracker } from '../audio/pitchDetector'
import { downloadStrikerSTL } from '../physics/stlExport'


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
  children?: React.ReactNode
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
      {props.children}
    </div>
  )
}

function specOf(i: number) {
  const { config, tubes } = useStore.getState()
  return tubeSpec(config, tubes[i], i)
}

type MainTab = 'simulation' | 'design' | 'manufacturing'

type SectionId =
  | 'wind'
  | 'optics'
  | 'tuning'
  | 'tubes'
  | 'mounting'
  | 'striker'
  | 'mfgOverview'
  | 'mfgTuning'
  | 'mfgCalibration'
  | 'mfgStriker'

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
  const striker = { material: config.strikerMaterial, form: config.strikerForm, diameter_mm: config.strikerDiameter_mm, height_mm: config.strikerHeight_mm, sides: config.tubeCount }
  const mount = tubeMountingPosition(config, tubes, idx)
  const strikerY_mm = config.tubeDrop_mm + config.strikerDrop_mm
  const xi = Math.max(0.02, Math.min(0.98, (strikerY_mm - mount.top_mm) / tube.length_mm))
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
  const [designTipsOpen, setDesignTipsOpen] = useState(false)

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

  const [mainTab, setMainTab] = useState<MainTab>('design')

  // default: Design has Tubes, Tuning, Striker, and Mounting open;
  // Simulation has Wind and Optics open;
  // Manufacturing has Overview, Tuning Tool, and Calibration Tool open.
  const [open, setOpen] = useState<Record<SectionId, boolean>>({
    wind: true,
    optics: true,
    tuning: true,
    tubes: true,
    striker: true,
    mounting: true,
    mfgOverview: true,
    mfgTuning: true,
    mfgCalibration: true,
    mfgStriker: true,
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

  // Share configuration link (base64 URL parameter)
  const [shareCopied, setShareCopied] = useState(false)
  const [shareToast, setShareToast] = useState(false)
  const [sharePop, setSharePop] = useState(false)
  const [shareUrl, setShareUrl] = useState('')

  async function handleShare(e?: React.MouseEvent) {
    const url = generateShareUrl(useStore.getState().config)
    setShareUrl(url)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', url)
    }
    if (e?.altKey || e?.shiftKey) {
      setSharePop(true)
      return
    }
    const ok = await copyToClipboard(url)
    if (ok) {
      setShareCopied(true)
      setShareToast(true)
      setTimeout(() => setShareCopied(false), 2500)
      setTimeout(() => setShareToast(false), 3500)
    } else {
      setSharePop(true)
    }
  }

  return (
    <div className="sidebar">
      <div className="panel-header">
        <button className="reset-btn" onClick={() => {
          reset()
          if (typeof window !== 'undefined' && window.location.search) {
            const url = new URL(window.location.href)
            url.searchParams.delete('config')
            url.searchParams.delete('c')
            window.history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash)
          }
        }} title="Reset all settings to default">
          ⟲ Reset
        </button>
        <button className="icon-btn" onClick={() => importInputRef.current?.click()} title="Import spec (JSON)">📥</button>
        <input ref={importInputRef} type="file" accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importSpec(f); e.target.value = '' }} />
        <button className="icon-btn" onClick={exportSpec} title="Export spec (JSON)">📤</button>
        <button className="icon-btn" onClick={() => setSaveOpen((v) => !v)} title="Save / load configurations (browser storage)">💾</button>
        <button
          className={`icon-btn ${shareCopied ? 'copied' : ''}`}
          onClick={handleShare}
          title={shareCopied ? 'Link copied to clipboard!' : 'Share configuration link (copies URL with base64 config)'}
          aria-label="Share configuration link"
        >
          {shareCopied ? '✓' : '🔗'}
        </button>
        {sharePop && (
          <div className="save-pop share-pop">
            <div className="save-title">Share configuration</div>
            <p style={{ fontSize: '11px', color: '#8892a6', margin: '4px 0 8px' }}>
              Copy this link to share the current wind chime configuration:
            </p>
            <input
              className="save-name"
              value={shareUrl}
              readOnly
              onClick={(e) => (e.target as HTMLInputElement).select()}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button className="adv-reset" style={{ padding: '4px 8px' }} onClick={() => setSharePop(false)}>Close</button>
              <button className="btn" onClick={async () => {
                await copyToClipboard(shareUrl)
                setShareCopied(true)
                setTimeout(() => setShareCopied(false), 2500)
              }}>
                {shareCopied ? '✓ Copied' : 'Copy link'}
              </button>
            </div>
          </div>
        )}
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
      </div>
      {shareToast && (
        <div className="share-toast" role="status">
          <span className="share-toast-text">🔗 Link copied to clipboard!</span>
          <button className="share-toast-close" onClick={() => setShareToast(false)} aria-label="Close">✕</button>
        </div>
      )}
      {physicsOpen && <PhysicsModal onClose={() => setPhysicsOpen(false)} />}
      {designTipsOpen && <DesignTipsModal onClose={() => setDesignTipsOpen(false)} />}

      <div className="main-tabs" role="tablist" aria-label="Configuration tabs">
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === 'simulation'}
          className={`main-tab ${mainTab === 'simulation' ? 'active' : ''}`}
          onClick={() => setMainTab('simulation')}
        >
          Simulation
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === 'design'}
          className={`main-tab ${mainTab === 'design' ? 'active' : ''}`}
          onClick={() => setMainTab('design')}
        >
          Design
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === 'manufacturing'}
          className={`main-tab ${mainTab === 'manufacturing' ? 'active' : ''}`}
          onClick={() => setMainTab('manufacturing')}
        >
          Manufacturing
        </button>
      </div>

      <div className="sections">
        {mainTab === 'simulation' && (
          <>
            <div className="tab-tips-bar">
              <button
                type="button"
                className="tab-tips-btn sim-tips-btn"
                onClick={() => setPhysicsOpen(true)}
                title="Acoustic physics, Euler-Bernoulli formulas, partials, and radiation models"
              >
                ⚛ Physics! & Formulas
              </button>
            </div>
            <Section id="wind" title="Wind" open={open} toggle={toggle}>
              <WindSection />
            </Section>
            <Section id="optics" title="Optics" open={open} toggle={toggle}>
              <OpticsSection />
            </Section>
          </>
        )}
        {mainTab === 'design' && (
          <>
            <div className="tab-tips-bar">
              <button
                type="button"
                className="tab-tips-btn design-tips-btn"
                onClick={() => setDesignTipsOpen(true)}
                title="Chime design tips: tube mounting & string clearance, material selection (aluminium, brass, copper), and sustain optimization"
              >
                💡 Design Tips & Acoustic Guide
              </button>
            </div>
            <Section id="tuning" title="Tuning" open={open} toggle={toggle}>
              <TuningSection />
            </Section>
            <Section id="tubes" title="Tubes" open={open} toggle={toggle}>
              <TubesSection />
            </Section>
            <Section id="striker" title="Striker and Sail" open={open} toggle={toggle}>
              <StrikerSection />
            </Section>
            <Section id="mounting" title="Mounting" open={open} toggle={toggle}>
              <MountingSection />
            </Section>
          </>
        )}
        {mainTab === 'manufacturing' && (
          <ManufacturingTab open={open} toggle={toggle} />
        )}
      </div>
    </div>
  )
}



/* ───────────────────────── Sections ───────────────────────── */

function TubesSection() {
  const { config, tubes, setConfig, setTubeOverride } = useStore()
  return (
    <>
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
  const effectiveOctave = activeScale.octave + (config.octaveOffset ?? 0)
  const [inspectTube, setInspectTube] = useState<number | null>(null)
  return (
    <>
      <Slider label="Tubes" min={3} max={12} step={1} helpId="tubeCount"
        value={config.tubeCount} onChange={(v) => setConfig({ tubeCount: v })} />
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
            options={NOTE_NAMES.map((n) => ({ id: n, label: `${n}${effectiveOctave}` }))}
            onChange={(v) => setConfig({ rootNote: v })}
          >
            <div className="octave-btn-group">
              <button
                type="button"
                className="octave-btn"
                onClick={() => setConfig({ octaveOffset: (config.octaveOffset ?? 0) - 1 })}
                disabled={effectiveOctave <= 2}
                title={`Shift octave down (currently ${rootNote}${effectiveOctave} → ${rootNote}${effectiveOctave - 1})`}
                aria-label="Shift octave down"
              >
                ▼
              </button>
              <button
                type="button"
                className="octave-btn"
                onClick={() => setConfig({ octaveOffset: (config.octaveOffset ?? 0) + 1 })}
                disabled={effectiveOctave >= 7}
                title={`Shift octave up (currently ${rootNote}${effectiveOctave} → ${rootNote}${effectiveOctave + 1})`}
                aria-label="Shift octave up"
              >
                ▲
              </button>
            </div>
          </Select>
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
  const isAuto = (config.strikerMode ?? 'auto') === 'auto'
  const strikerDims = effectiveStrikerDimensions(config, tubes)
  const longestTube = tubes.length
    ? tubes.reduce((max, t) => (t.length_mm > max.length_mm ? t : max), tubes[0])
    : undefined
  const longestIdx = longestTube ? tubes.indexOf(longestTube) : 0
  const refSpec = longestTube ? tubeSpec(config, longestTube, longestIdx) : tubeSpec(config, tubes[0], 0)
  const optimal = optimalStrikerMass(refSpec) * 1000
  const current = strikerMass({
    material: config.strikerMaterial,
    form: config.strikerForm,
    diameter_mm: strikerDims.diameter_mm,
    height_mm: strikerDims.height_mm,
  }) * 1000

  return (
    <>
      <div className="striker-mode-toggle">
        <button
          type="button"
          className={`striker-mode-btn ${isAuto ? 'active' : ''}`}
          onClick={() => setConfig({ strikerMode: 'auto' })}
        >
          Automatic
        </button>
        <button
          type="button"
          className={`striker-mode-btn ${!isAuto ? 'active' : ''}`}
          onClick={() => {
            setConfig({
              strikerMode: 'manual',
              strikerDiameter_mm: strikerDims.diameter_mm,
              strikerHeight_mm: strikerDims.height_mm,
            })
          }}
        >
          Manual
        </button>
      </div>

      <Select
        label="Material"
        value={config.strikerMaterial}
        helpId="strikerMaterial"
        options={Object.values(STRIKER_MATERIALS)}
        onChange={(v) => setConfig({ strikerMaterial: v })}
      />
      <Select
        label="Form"
        value={config.strikerForm}
        helpId="strikerForm"
        options={Object.values(STRIKER_FORMS)}
        onChange={(v) => setConfig({ strikerForm: v })}
      />

      {isAuto ? (
        <>
          <Slider
            label="Distance to tube"
            min={4}
            max={40}
            step={1}
            fmt={(v) => v + ' mm'}
            helpId="strikerDistance"
            value={config.strikerDistanceToTube_mm ?? 15}
            onChange={(v) => setConfig({ strikerDistanceToTube_mm: v })}
          />
          <div className="striker-auto-badge">
            <span>
              Auto-size: <strong>Ø {strikerDims.diameter_mm} mm</strong> × <strong>{strikerDims.height_mm} mm</strong>
            </span>
            <span className="striker-auto-tag">◎ fitted to weight</span>
          </div>
        </>
      ) : (
        <>
          <Slider
            label="Striker Ø"
            min={25}
            max={100}
            step={1}
            fmt={(v) => v + ' mm'}
            helpId="strikerDiameter"
            value={config.strikerDiameter_mm}
            onChange={(v) => setConfig({ strikerDiameter_mm: v })}
          />
          <Slider
            label="Thickness"
            min={8}
            max={60}
            step={1}
            fmt={(v) => v + ' mm'}
            helpId="strikerHeight"
            value={config.strikerHeight_mm}
            onChange={(v) => setConfig({ strikerHeight_mm: v })}
          />
        </>
      )}

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

      <Slider
        label="Drop"
        min={20}
        max={maxDrop_mm(tubes)}
        step={1}
        fmt={(v) => v + ' mm'}
        helpId="strikerDrop"
        value={Math.min(config.strikerDrop_mm, maxDrop_mm(tubes))}
        onChange={(v) => setConfig({ strikerDrop_mm: v })}
        marker={optimalDrop_mm(tubes)}
        markerLabel="◎ optimal center-strike (50% of longest tube)"
        marker2={equalLoudnessDrop_mm(tubes, config.suspensionPoint)}
        marker2Label="◎ drop where all tubes sound most equally loud"
      />
      <div className="marker-legend">
        <span className="legend-item"><i className="dot green" /> best tone (center-strike)</span>
        <span className="legend-item"><i className="dot amber" /> equal loudness</span>
      </div>

      <div style={{ margin: '14px 0 10px', borderTop: '1px solid #2a3242' }} />
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#6c8cff', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
        Wind Sail & Dropper
      </div>

      {(() => {
        const optSailDrop = optimalSailDrop_mm(config, tubes)
        const minSailDrop = minSailDrop_mm(config, tubes)
        const currentSailDrop = config.sailDrop_mm ?? optSailDrop
        const optSailMass = Math.max(10, Math.min(180, Math.round(current * 0.6)))
        const gustSailMass = Math.max(15, Math.min(195, Math.round(current * 0.85)))
        return (
          <>
            <Slider
              label="Sail drop"
              min={Math.max(50, Math.round(minSailDrop * 0.4))}
              max={Math.max(900, Math.round(optSailDrop * 1.6))}
              step={5}
              fmt={(v) => v + ' mm'}
              helpId="sailDrop"
              value={currentSailDrop}
              onChange={(v) => setConfig({ sailDrop_mm: v })}
              marker={optSailDrop}
              markerLabel="◎ optimal whip ratio (~1.8× upper cord, detuned)"
              marker2={minSailDrop}
              marker2Label="◎ minimum tube clearance (50 mm below longest tube)"
            />
            <div className="marker-legend">
              <span className="legend-item"><i className="dot green" /> optimal whip (~1.8×)</span>
              <span className="legend-item"><i className="dot amber" /> tube clearance (-50 mm)</span>
            </div>

            <Slider
              label="Sail weight"
              min={5}
              max={200}
              step={1}
              fmt={(v) => v + ' g'}
              helpId="sailWeight"
              value={config.sailMass_g}
              onChange={(v) => setConfig({ sailMass_g: v })}
              marker={optSailMass}
              markerLabel="◎ optimal whip balance (~60% of striker mass)"
              marker2={gustSailMass}
              marker2Label="◎ gust-resistant / heavy wind (~85% of striker mass)"
            />
            <div className="marker-legend">
              <span className="legend-item"><i className="dot green" /> optimal whip (~60% striker)</span>
              <span className="legend-item"><i className="dot amber" /> gust resistant (~85%)</span>
            </div>
          </>
        )
      })()}
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
  const mount = tubeMountingPosition(config, tubes, i)
  const strikerY_mm = config.tubeDrop_mm + config.strikerDrop_mm
  const xi = Math.max(0.02, Math.min(0.98, (strikerY_mm - mount.top_mm) / tubes[i].length_mm))
  const neighbours = tubes.filter((_, j) => j !== i).map((_, j2) => specOf(j2 < i ? j2 : j2 + 1))
  const spec = specOf(i)
  const f0 = tubeFrequencies(spec).f0
  const striker = {
    material: config.strikerMaterial, form: config.strikerForm,
    diameter_mm: config.strikerDiameter_mm, height_mm: config.strikerHeight_mm,
    sides: config.tubeCount,
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
      <Select label="Sail shape" value={config.sailType} helpId="sailShape"
        options={SAIL_TYPES as unknown as { id: string; label: string }[]}
        onChange={(v) => setConfig({ sailType: v })} />
      <Slider label="Sail area" min={20} max={250} step={5} fmt={(v) => v + ' cm²'} helpId="sailArea"
        value={config.sailArea_cm2 ?? 80} onChange={(v) => setConfig({ sailArea_cm2: v })} />
      <ColorRow label="Sail color" value={config.sailColor}
        onChange={(c) => setConfig({ sailColor: c })} />
    </>
  )
}

const TUBE_ALIGNMENT_OPTIONS: { id: TubeAlignment; label: string }[] = [
  { id: 'centerStrike', label: 'All aligned by center strike' },
  { id: 'top', label: 'All starting at the same offset' },
  { id: 'suspension', label: 'All aligned by suspension point' },
]

function MountingSection() {
  const { config, setConfig } = useStore()
  return (
    <>
      <Slider
        label="Tube offset"
        min={0}
        max={100}
        step={1}
        fmt={(v) => v + ' mm'}
        helpId="tubeOffset"
        value={config.tubeDrop_mm}
        onChange={(v) => setConfig({ tubeDrop_mm: v })}
      />
      <Select
        label="Alignment"
        value={config.tubeAlignment ?? 'centerStrike'}
        helpId="tubeAlignment"
        options={TUBE_ALIGNMENT_OPTIONS}
        onChange={(v) => setConfig({ tubeAlignment: v as TubeAlignment })}
      />
    </>
  )
}

/* ───────────────────────── Manufacturing ───────────────────────── */

function ManufacturingTab({
  open,
  toggle,
}: {
  open: Record<SectionId, boolean>
  toggle: (id: SectionId) => void
}) {
  const { config, tubes, setWindOn, setConfig } = useStore()
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
  const [stlExported, setStlExported] = useState(false)
  const [cordHoleMm, setCordHoleMm] = useState('2.0')
  const [tipsOpen, setTipsOpen] = useState(false)

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
    const headers = ['Tube', 'Note', 'Material', 'Outer Ø (mm)', 'Wall (mm)', 'Length (mm)', 'Suspension Pos (mm from top)', 'Dist. to Plate (mm)']
    const rows = tubes.map((t, i) => {
      const g = tubeGeometry(config, i)
      const susp = tubeSuspension(config, tubes, i)
      const mount = tubeMountingPosition(config, tubes, i)
      const mat = MATERIALS[g.material]?.label ?? g.material
      const dia = (g.Do * 1000).toFixed(1)
      const wall = g.solid ? 'solid' : (g.t * 1000).toFixed(2)
      return [i + 1, t.note, mat, dia, wall, t.length_mm.toFixed(1), susp.mm.toFixed(1), mount.top_mm.toFixed(1)].join('\t')
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

  const activeGeom = tubeGeometry(config, activeIdx)
  const currentSpeedFactor = config.materialSpeedFactors?.[activeGeom.material] ?? 1.0
  const isMaterialCalibrated = Math.abs(currentSpeedFactor - 1.0) > 0.0005
  const matLabel = MATERIALS[activeGeom.material]?.label ?? activeGeom.material

  const calib = measuredFreq > 0
    ? calculateMaterialCalibration(
        activeGeom.material,
        activeGeom.Do * 1000,
        activeGeom.t * 1000,
        activeGeom.solid,
        currentLength_mm,
        measuredFreq
      )
    : null

  const cutEstimate = estimateCut(measuredFreq, targetFreq, currentLength_mm)
  const noteInfo = freqToNote(measuredFreq)

  // Striker manufacturing properties
  const mfgStrikerDims = effectiveStrikerDimensions(config, tubes)
  const mfgStrikerMat = STRIKER_MATERIALS[config.strikerMaterial]?.label ?? config.strikerMaterial
  const POLYGON_NAMES: Record<number, string> = {
    3: 'Triangle',
    4: 'Square',
    5: 'Pentagon',
    6: 'Hexagon',
    7: 'Heptagon',
    8: 'Octagon',
    9: 'Nonagon',
    10: 'Decagon',
    11: 'Hendecagon',
    12: 'Dodecagon',
  }
  const formBase = STRIKER_FORMS[config.strikerForm]?.label ?? config.strikerForm
  const mfgStrikerForm = config.strikerForm === 'multisided'
    ? `${formBase} (${POLYGON_NAMES[config.tubeCount] ?? `${config.tubeCount}-gon`})`
    : formBase
  const mfgLongestTube = tubes.length
    ? tubes.reduce((max, t) => (t.length_mm > max.length_mm ? t : max), tubes[0])
    : undefined
  const mfgLongestIdx = mfgLongestTube ? tubes.indexOf(mfgLongestTube) : 0
  const mfgRefSpec = mfgLongestTube
    ? tubeSpec(config, mfgLongestTube, mfgLongestIdx)
    : tubeSpec(config, tubes[0], 0)
  const mfgOptimalMass = optimalStrikerMass(mfgRefSpec) * 1000
  const mfgCurrentMass =
    strikerMass({
      material: config.strikerMaterial,
      form: config.strikerForm,
      diameter_mm: mfgStrikerDims.diameter_mm,
      height_mm: mfgStrikerDims.height_mm,
      sides: config.tubeCount,
    }) * 1000

  const handleDownloadSTL = () => {
    const holeDia = parseFloat(cordHoleMm) > 0 ? parseFloat(cordHoleMm) : 2.0
    downloadStrikerSTL({
      form: config.strikerForm,
      diameter_mm: mfgStrikerDims.diameter_mm,
      height_mm: mfgStrikerDims.height_mm,
      material: config.strikerMaterial,
      holeDiameter_mm: holeDia,
      tubeCount: config.tubeCount,
    })
    setStlExported(true)
    setTimeout(() => setStlExported(false), 2500)
  }

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
    <>
      <div className="tab-tips-bar">
        <button
          type="button"
          className="tab-tips-btn mfg-tips-btn"
          onClick={() => setTipsOpen(true)}
          title="Manufacturing tips: extruded vs cold-drawn tubing, cutting & drilling, and workshop golden rule"
        >
          🛠️ Manufacturing & Workshop Tips
        </button>
      </div>
      {tipsOpen && <ManufacturingTipsModal onClose={() => setTipsOpen(false)} />}

      {/* ────────────────── Section 1: Overview ────────────────── */}
      <Section id="mfgOverview" title="Overview" open={open} toggle={toggle}>
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
                  <th title="Distance from mounting plate to tube top in mm">Dist. to Plate</th>
                </tr>
              </thead>
              <tbody>
                {tubes.map((t, i) => {
                  const g = tubeGeometry(config, i)
                  const susp = tubeSuspension(config, tubes, i)
                  const mount = tubeMountingPosition(config, tubes, i)
                  const matLabel = MATERIALS[g.material]?.label ?? g.material
                  const matFactor = config.materialSpeedFactors?.[g.material] ?? 1.0
                  const isCalib = Math.abs(matFactor - 1.0) > 0.0005
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
                      <td
                        className="mfg-mat"
                        title={
                          matLabel +
                          (isCalib
                            ? ` (Calibrated: ${(Math.sqrt(matFactor) * 100).toFixed(1)}% length)`
                            : '')
                        }
                      >
                        {matLabel}
                        {isCalib && (
                          <span
                            className="mfg-calib-table-pill"
                            title={`Calibrated: ${(Math.sqrt(matFactor) * 100).toFixed(1)}% length`}
                          >
                            {(Math.sqrt(matFactor) * 100).toFixed(0)}%
                          </span>
                        )}
                      </td>
                      <td className="mfg-num">{dia_mm} mm</td>
                      <td className="mfg-num">{wall_mm}</td>
                      <td className="mfg-num mfg-len">{t.length_mm.toFixed(1)} mm</td>
                      <td className="mfg-num mfg-susp">{susp.mm.toFixed(1)} mm</td>
                      <td
                        className="mfg-num mfg-mount"
                        title={`Distance to tube top: ${mount.top_mm.toFixed(1)} mm (${mount.susp_mm.toFixed(1)} mm to suspension hole)`}
                      >
                        {mount.top_mm.toFixed(1)} mm
                      </td>
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
            {isMaterialCalibrated && (
              <span style={{ marginLeft: 8, color: '#7ddb91' }}>
                • {matLabel} calibrated: {(Math.sqrt(currentSpeedFactor) * 100).toFixed(1)}% length
              </span>
            )}
          </div>
          <button className="mini-action-btn" onClick={copyCutList} title="Copy cut list to clipboard (tab-separated)">
            {copied ? '✓ Copied' : '📋 Copy cut list'}
          </button>
        </div>
      </Section>

      {/* ────────────────── Section 2: Tuning Tool ────────────────── */}
      <Section id="mfgTuning" title="Tuning Tool" open={open} toggle={toggle}>
        <div className="mfg-tuning-wrap">
          <div className="mfg-tuning-subhead">
            <span className="mfg-subhead-hint">Microphone pitch detection & cut calculation</span>
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
      </Section>

      {/* ────────────────── Section 3: Calibration Tool ────────────────── */}
      <Section id="mfgCalibration" title="Calibration Tool" open={open} toggle={toggle}>
        <div className={`mfg-calib-box ${isMaterialCalibrated ? 'is-calibrated' : ''}`} style={{ marginTop: 0 }}>
          <div className="mfg-calib-header">
            <span className="mfg-calib-title">🎯 Material Calibration ({matLabel})</span>
            {isMaterialCalibrated && (
              <span className="mfg-calib-badge" title="Material wave speed and length factor applied">
                {(Math.sqrt(currentSpeedFactor) * 100).toFixed(1)}% length
              </span>
            )}
          </div>

          {calib ? (
            <>
              <div className="mfg-calib-desc">
                {calib.deltaPercent < -0.1 ? (
                  <>
                    Measured sound velocity is <strong>{calib.calibratedWaveSpeed} m/s</strong> (theoretical: {calib.nominalWaveSpeed} m/s).
                    Your stock runs flat — cut lengths need to be <strong>{Math.abs(calib.deltaPercent).toFixed(1)}% shorter</strong> ({(calib.lengthFactor * 100).toFixed(1)}% of textbook).
                  </>
                ) : calib.deltaPercent > 0.1 ? (
                  <>
                    Measured sound velocity is <strong>{calib.calibratedWaveSpeed} m/s</strong> (theoretical: {calib.nominalWaveSpeed} m/s).
                    Your stock runs sharp — cut lengths need to be <strong>{calib.deltaPercent.toFixed(1)}% longer</strong> ({(calib.lengthFactor * 100).toFixed(1)}% of textbook).
                  </>
                ) : (
                  <>
                    Measured sound velocity is <strong>{calib.calibratedWaveSpeed} m/s</strong>, matching textbook {matLabel} within ±0.1%.
                  </>
                )}
              </div>

              <div className="mfg-calib-actions">
                <button
                  type="button"
                  className="mfg-calib-apply-btn"
                  onClick={() => {
                    if (!customLengthInput) {
                      setCustomLengthInput(currentLength_mm.toFixed(1))
                    }
                    setConfig({
                      materialSpeedFactors: {
                        ...config.materialSpeedFactors,
                        [activeGeom.material]: calib.speedFactor,
                      },
                    })
                  }}
                  title={`Calibrate all ${matLabel} tube calculations to ${(calib.lengthFactor * 100).toFixed(1)}% length`}
                >
                  🎯 Calibrate {matLabel} ({calib.deltaPercent > 0 ? '+' : ''}{calib.deltaPercent.toFixed(1)}% length)
                </button>

                {isMaterialCalibrated && (
                  <button
                    type="button"
                    className="mfg-calib-reset-btn"
                    onClick={() => {
                      const updated = { ...config.materialSpeedFactors }
                      delete updated[activeGeom.material]
                      setConfig({ materialSpeedFactors: updated })
                    }}
                    title="Reset back to 100% textbook theoretical values"
                  >
                    Reset
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="mfg-calib-desc" style={{ color: '#7b88a1' }}>
              Strike a tube of known length to measure your alloy's real sound velocity and auto-calibrate all cut lengths.
              {isMaterialCalibrated && (
                <div style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    className="mfg-calib-reset-btn"
                    onClick={() => {
                      const updated = { ...config.materialSpeedFactors }
                      delete updated[activeGeom.material]
                      setConfig({ materialSpeedFactors: updated })
                    }}
                    title="Reset back to 100% textbook theoretical values"
                  >
                    Reset {matLabel} to 100% (textbook)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* ────────────────── Section 4: Striker ────────────────── */}
      <Section id="mfgStriker" title="Striker" open={open} toggle={toggle}>
        <div className="mfg-striker-mount-card">
          <div className="mfg-striker-mount-header">
            <span className="mfg-mount-label">Distance from mounting plate:</span>
            <strong className="mfg-mount-value">
              {(config.tubeDrop_mm + config.strikerDrop_mm).toFixed(1)} mm
            </strong>
          </div>
          <div className="mfg-mount-hint">
            Hanging cord length to striker center • {(config.tubeDrop_mm + config.strikerDrop_mm - mfgStrikerDims.height_mm / 2).toFixed(1)} mm to top face
          </div>
        </div>

        <div className="mfg-striker-card">
          <div className="mfg-striker-header">
            <div className="mfg-striker-title">
              <span>🖨️ Striker 3D Print / Fabrication (STL)</span>
            </div>
            <span className="mfg-striker-badge">
              {mfgStrikerForm} • {mfgStrikerMat}
            </span>
          </div>

          <div className="mfg-striker-grid">
            <div className="mfg-striker-prop">
              <span className="mfg-prop-label">Diameter:</span>
              <strong>Ø {mfgStrikerDims.diameter_mm} mm</strong>
            </div>
            <div className="mfg-striker-prop">
              <span className="mfg-prop-label">Thickness:</span>
              <strong>{mfgStrikerDims.height_mm} mm</strong>
            </div>
            <div className="mfg-striker-prop">
              <span className="mfg-prop-label">Target Mass:</span>
              <strong>{mfgOptimalMass.toFixed(0)} g</strong>
              <span className="mfg-prop-sub">({mfgCurrentMass.toFixed(0)} g calc)</span>
            </div>
            <div className="mfg-striker-prop" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="mfg-prop-label">Cord hole:</span>
              <input
                type="number"
                step="0.5"
                min="1"
                max="10"
                value={cordHoleMm}
                onChange={(e) => setCordHoleMm(e.target.value)}
                className="mfg-hole-input"
                title="Central cord hole diameter in mm"
              />
              <span style={{ fontSize: 10, color: '#7b88a1' }}>mm</span>
            </div>
          </div>

          <div className="mfg-striker-actions">
            <button
              type="button"
              className="mfg-stl-btn"
              onClick={handleDownloadSTL}
              title={`Download 3D printable binary STL: Ø${mfgStrikerDims.diameter_mm}mm × ${mfgStrikerDims.height_mm}mm ${mfgStrikerForm}`}
            >
              {stlExported ? '✓ STL Downloaded!' : '💾 Download Striker STL'}
            </button>
            <div className="mfg-striker-hint">
              Watertight 3D model with central suspension cord hole. Ready to slice for 3D printing (PETG/PLA) or lathe/turning.
            </div>
          </div>
        </div>
      </Section>
    </>
  )
}

