import { create } from 'zustand'
import { MATERIALS } from '../physics/materials'
import { SCALES, scaleFrequencies } from '../physics/scales'
import { lengthForFrequency, noteToFreq, TubeSpec, tubeFrequencies, tubeDecay } from '../physics/tubes'
import { strikeWeights } from '../physics/modes'
import { optimalStrikerMass, solveStrikerHeight_mm, calculateStrikerDiameter_mm } from '../physics/contact'

export interface TubeConfig {
  note: string
  freq: number
  length_mm: number     // physical length derived from tuning
}

/** Per-tube override (advanced mode): undefined fields fall back to global. */
export interface TubeOverride {
  material?: string
  outerDiameter_mm?: number
  wallThickness_mm?: number
  solid?: boolean
  suspension_mm?: number        // absolute suspension distance from tube top in mm
  suspensionPoint?: number      // legacy fraction fallback
}

export interface ChimeConfig {
  tubeCount: number             // 3..12
  material: string
  outerDiameter_mm: number
  wallThickness_mm: number
  advanced: boolean             // per-tube material/diameter/wall editing
  tubeOverrides: TubeOverride[] // index-aligned with tubes; empty = defaults
  solid: boolean                // solid rod instead of hollow tube
  coupling: boolean             // sympathetic vibration between tubes via the frame (always on)
  sameAbsoluteSuspension: boolean // all tubes share the same absolute suspension distance from top
  materialSpeedFactors: Record<string, number> // calibrated wave speed factor per material (1.0 = textbook)
  tuningMode: 'scale' | 'manual'
  scaleId: string
  rootNote: string              // overrides scale's default root ('' = use default)
  manualNotes: string[]
  suspensionRadius_mm: number
  suspensionPoint: number       // 0..0.5 of length from top
  strikerMaterial: string
  strikerDiameter_mm: number
  strikerHeight_mm: number
  strikerForm: string            // multisided | sphere | donut | cylinder (Hertzian contact)
  strikerMode?: 'auto' | 'manual' // automatic sizing vs manual dimensions
  strikerDistanceToTube_mm?: number // clearance gap in auto mode (default: 15 mm)
  strikerDrop_mm: number        // top of striker below tube tops
  windStrength: number          // 0..1
  gustFrequency: number         // gusts per second
  sailMass_g: number            // wind-catcher mass (areal density of the board)
  sailArea_cm2?: number         // wind-catcher surface area in cm² (default: 80 cm²)
  volume: number
  // Optics: top plate + sail shape/color
  plateShape: string            // disc | ring | octagon | square
  plateRadius_mm: number
  plateColor: string
  tubeDrop_mm: number           // how far below the plate the tubes start
  tubeAlignment?: TubeAlignment // alignment: top offset | suspension point | center strike
  sailType: string              // rectangle | diamond | circle | teardrop | feather
  sailColor: string
}

export type TubeAlignment = 'top' | 'suspension' | 'centerStrike'

export const DEFAULT_CONFIG: ChimeConfig = {
  tubeCount: 6,
  material: 'aluminum',
  outerDiameter_mm: 25,
  wallThickness_mm: 1.2,
  advanced: false,
  tubeOverrides: [],
  solid: false,
  coupling: true,
  sameAbsoluteSuspension: false,
  materialSpeedFactors: {},
  tuningMode: 'scale',
  scaleId: 'pentMajor',
  rootNote: 'C',
  manualNotes: ['C5', 'D5', 'E5', 'G5', 'A5', 'C6'],
  suspensionRadius_mm: 55,
  suspensionPoint: 0.224,
  strikerMaterial: 'hardWood',
  strikerDiameter_mm: 55,
  strikerHeight_mm: 25,
  strikerForm: 'sphere',
  strikerMode: 'auto',
  strikerDistanceToTube_mm: 15,
  strikerDrop_mm: 0,   // replaced below: optimal center-strike of default tuning
  windStrength: 0.35,
  sailMass_g: 30,
  sailArea_cm2: 80,
  plateShape: 'disc',
  plateRadius_mm: 90,
  plateColor: '#3a2f24',
  tubeDrop_mm: 30,
  tubeAlignment: 'centerStrike',
  sailType: 'rectangle',
  sailColor: '#8b3a3a',
  gustFrequency: 0.15,
  volume: 0.7,
}

/** Optimal strike drop: 50% of the LONGEST tube (fundamental antinode,
 *  2nd-partial node → loudest, purest tone). */
export function optimalDrop_mm(tubes: TubeConfig[]): number {
  if (!tubes.length) return 100
  const longest = Math.max(...tubes.map(t => t.length_mm))
  return Math.round(longest * 0.5)
}

/**
 * Drop where all tubes sound MOSTLY EQUALLY LOUD.
 *
 * With one striker height, tube i is struck at ξᵢ = drop/Lᵢ — short tubes get
 * hit near their bottom (weak fundamental, |φ₁| small near 0.78 node... actually
 * ξ→1 is an END antinode, but m_eff(ξ) grows steeply toward the ends), long
 * tubes near their center (strong fundamental). Sweep the drop and pick the
 * position minimizing the spread of fundamental excitation |φ₁(ξᵢ)| across tubes.
 */
export function equalLoudnessDrop_mm(tubes: TubeConfig[], suspensionPoint: number): number {
  if (tubes.length < 2) return 100
  const Ls = tubes.map(t => t.length_mm / 1000)
  const Lmin = Math.min(...Ls), Lmax = Math.max(...Ls)
  let bestDrop = Lmax * 0.5
  let bestSpread = Infinity
  for (let frac = 0.15; frac <= 0.95; frac += 0.005) {
    const drop = frac * Lmax
    const exc = Ls.map(L => {
      const xi = Math.max(0.02, Math.min(0.98, drop / L))
      return strikeWeights(xi)[0]   // fundamental excitation 0..1
    })
    const mean = exc.reduce((a, b) => a + b, 0) / exc.length
    const spread = Math.sqrt(exc.reduce((a, b) => a + (b - mean) ** 2, 0) / exc.length)
    if (spread < bestSpread) { bestSpread = spread; bestDrop = drop }
  }
  return Math.round(bestDrop * 1000)
}

DEFAULT_CONFIG.strikerDrop_mm = optimalDrop_mm(computeTubes(DEFAULT_CONFIG))

/** Resolve a tube's effective geometry: per-tube override > global config. */
export function tubeGeometry(config: ChimeConfig, index: number): { material: string; Do: number; t: number; solid: boolean } {
  const o = config.tubeOverrides[index] ?? {}
  const solid = o.solid ?? config.solid
  const Do = (o.outerDiameter_mm ?? config.outerDiameter_mm) / 1000
  const t = solid ? Infinity : Math.max(0.3, o.wallThickness_mm ?? config.wallThickness_mm) / 1000
  return { material: o.material ?? config.material, Do, t, solid }
}

export function tubeSpec(config: ChimeConfig, tube: TubeConfig, index = 0): TubeSpec {
  const g = tubeGeometry(config, index)
  const speedFactor = config.materialSpeedFactors?.[g.material] ?? 1.0
  return {
    length: tube.length_mm / 1000,
    outerDiameter: g.Do,
    wallThickness: g.t,
    material: g.material,
    speedFactor,
  }
}

/** Resolve striker diameter and height: manual mode uses configured dimensions; auto mode sizes diameter from tube distance and thickness from optimal mass. */
export function effectiveStrikerDimensions(
  config: ChimeConfig,
  tubes: TubeConfig[]
): { diameter_mm: number; height_mm: number } {
  if (config.strikerMode === 'manual') {
    return {
      diameter_mm: config.strikerDiameter_mm,
      height_mm: config.strikerHeight_mm,
    }
  }

  const longestTube = tubes.length
    ? tubes.reduce((max, t) => (t.length_mm > max.length_mm ? t : max), tubes[0])
    : undefined
  const longestIdx = longestTube ? tubes.indexOf(longestTube) : 0
  const refGeom = tubeGeometry(config, longestIdx)
  const dist = config.strikerDistanceToTube_mm ?? 15
  const diameter_mm = calculateStrikerDiameter_mm(
    config.suspensionRadius_mm,
    refGeom.Do * 1000,
    dist
  )

  const refSpec = longestTube
    ? tubeSpec(config, longestTube, longestIdx)
    : {
        length: 0.4,
        outerDiameter: config.outerDiameter_mm / 1000,
        wallThickness: config.wallThickness_mm / 1000,
        material: config.material,
      }
  const targetMass_kg = optimalStrikerMass(refSpec)
  const height_mm = solveStrikerHeight_mm(
    targetMass_kg,
    config.strikerMaterial,
    config.strikerForm,
    diameter_mm,
    config.tubeCount
  )

  return { diameter_mm, height_mm }
}

/** Resolve a tube's effective suspension point (fraction and absolute mm from top). */
export function tubeSuspension(
  config: ChimeConfig,
  tubes: TubeConfig[],
  index: number
): { fraction: number; mm: number } {
  const o = config.tubeOverrides[index] ?? {}
  const tube = tubes[index]
  const L_mm = tube ? tube.length_mm : 300

  // 1. Per-tube override in absolute mm wins
  if (o.suspension_mm !== undefined) {
    const mm = o.suspension_mm
    const fraction = L_mm > 0 ? mm / L_mm : config.suspensionPoint
    return { fraction, mm }
  }

  // Legacy per-tube fraction override fallback
  if (o.suspensionPoint !== undefined) {
    const fraction = o.suspensionPoint
    return { fraction, mm: fraction * L_mm }
  }

  // 2. Same absolute suspension point for all tubes (anchored by reference longest tube)
  if (config.sameAbsoluteSuspension) {
    const longest = tubes.length ? Math.max(...tubes.map((t) => t.length_mm)) : L_mm
    const mm = config.suspensionPoint * longest
    const fraction = L_mm > 0 ? mm / L_mm : config.suspensionPoint
    return { fraction, mm }
  }

  // 3. Global relative fraction
  const fraction = config.suspensionPoint
  return { fraction, mm: fraction * L_mm }
}

export interface TubeMountingPosition {
  top_mm: number       // distance from mounting plate to tube top end
  susp_mm: number      // distance from mounting plate to suspension hole (cord length)
  center_mm: number    // distance from mounting plate to tube midpoint (strike center)
  bottom_mm: number    // distance from mounting plate to tube bottom end
}

/** Resolve a tube's mounting position relative to the mounting plate based on alignment mode. */
export function tubeMountingPosition(
  config: ChimeConfig,
  tubes: TubeConfig[],
  index: number
): TubeMountingPosition {
  const alignment = config.tubeAlignment ?? 'centerStrike'
  const drop = config.tubeDrop_mm
  const tube = tubes[index]
  const L = tube ? tube.length_mm : 300
  const s = tubeSuspension(config, tubes, index).mm

  if (alignment === 'suspension') {
    // All tubes aligned by suspension point:
    // Suspension holes share the same distance below the plate (uniform string length).
    // Longest tube (largest s) starts at drop below the plate.
    const maxS = tubes.length
      ? Math.max(...tubes.map((_, i) => tubeSuspension(config, tubes, i).mm))
      : s
    const commonSusp_mm = drop + maxS
    const top_mm = commonSusp_mm - s
    return {
      top_mm,
      susp_mm: commonSusp_mm,
      center_mm: top_mm + L / 2,
      bottom_mm: top_mm + L,
    }
  }

  if (alignment === 'top') {
    // All starting at the same offset
    const top_mm = drop
    return {
      top_mm,
      susp_mm: top_mm + s,
      center_mm: top_mm + L / 2,
      bottom_mm: top_mm + L,
    }
  }

  // Default: 'centerStrike' - all aligned by center strike:
  // Tube midpoints share the same elevation below the plate.
  // Longest tube (largest L / 2) starts at drop below the plate.
  const maxL = tubes.length ? Math.max(...tubes.map((t) => t.length_mm)) : L
  const commonCenter_mm = drop + maxL / 2
  const top_mm = commonCenter_mm - L / 2
  return {
    top_mm,
    susp_mm: top_mm + s,
    center_mm: commonCenter_mm,
    bottom_mm: top_mm + L,
  }
}


function computeTubes(c: ChimeConfig): TubeConfig[] {
  const out: TubeConfig[] = []
  if (c.tuningMode === 'manual') {
    for (let i = 0; i < c.tubeCount; i++) {
      const note = c.manualNotes[i] ?? 'A4'
      const freq = noteToFreq(note)
      const g = tubeGeometry(c, i)
      const speedFactor = c.materialSpeedFactors?.[g.material] ?? 1.0
      const L = lengthForFrequency(freq, g.material, g.Do, g.t, speedFactor) * 1000
      out.push({ note, freq, length_mm: L })
    }
  } else {
    const scale = SCALES.find(s => s.id === c.scaleId) ?? SCALES[0]
    const notes = scaleFrequencies(scale, c.tubeCount, c.rootNote || undefined)
    for (let i = 0; i < c.tubeCount; i++) {
      const g = tubeGeometry(c, i)
      const speedFactor = c.materialSpeedFactors?.[g.material] ?? 1.0
      const L = lengthForFrequency(notes[i].freq, g.material, g.Do, g.t, speedFactor) * 1000
      out.push({ note: notes[i].note, freq: notes[i].freq, length_mm: L })
    }
  }
  return out
}

interface State {
  config: ChimeConfig
  tubes: TubeConfig[]
  strikeFlash: Record<number, { t: number; vel: number }>   // tube index -> last strike (time + velocity)
  windOn: boolean                        // wind pause/play (transient, not a design default)
  audioArmed: boolean                    // AudioContext created (first user gesture)
  setWindOn: (on: boolean) => void
  setAudioArmed: (on: boolean) => void
  setConfig: (p: Partial<ChimeConfig>) => void
  setManualNote: (i: number, note: string) => void
  setTubeOverride: (i: number, o: TubeOverride) => void
  reset: () => void
  flash: (i: number, vel?: number) => void
}

/** Max sensible striker drop: a bit below the shortest tube's bottom end. */
export function maxDrop_mm(tubes: TubeConfig[]): number {
  if (!tubes.length) return 150
  const shortest = Math.min(...tubes.map(t => t.length_mm))
  // the striker must sit above the shortest tube's lower end, otherwise that
  // tube is unreachable — allow reaching its bottom 10% at most
  return Math.max(20, Math.round(shortest * 0.9))
}

export const useStore = create<State>((set) => ({
  config: DEFAULT_CONFIG,
  tubes: computeTubes(DEFAULT_CONFIG),
  strikeFlash: {},
  windOn: true,
  audioArmed: false,
  setWindOn: (on) => set({ windOn: on }),
  setAudioArmed: (on) => set({ audioArmed: on }),
  setConfig: (p) => set(s => {
    const config = { ...s.config, ...p }
    const tubes = computeTubes(config)
    // If the striker sits at the optimum it should TRACK the optimum when
    // retuning changes tube lengths (e.g. new material/scale/Ø). A manual
    // drop change (patch contains strikerDrop_mm) always wins. Either way
    // the drop is clamped to stay reachable.
    const changingDrop = 'strikerDrop_mm' in p
    const optBefore = optimalDrop_mm(s.tubes)
    const wasAtOpt = Math.abs(s.config.strikerDrop_mm - optBefore) <= 1
    if (!changingDrop && wasAtOpt) config.strikerDrop_mm = optimalDrop_mm(tubes)
    if (config.strikerDrop_mm > maxDrop_mm(tubes)) {
      config.strikerDrop_mm = maxDrop_mm(tubes)
    }
    return { config, tubes }
  }),
  setManualNote: (i, note) => set(s => {
    const manualNotes = [...s.config.manualNotes]
    while (manualNotes.length < s.config.tubeCount) manualNotes.push('A4')
    manualNotes[i] = note
    const config = { ...s.config, manualNotes }
    const tubes = computeTubes(config)
    const optBefore = optimalDrop_mm(s.tubes)
    const wasAtOpt = Math.abs(s.config.strikerDrop_mm - optBefore) <= 1
    if (wasAtOpt) config.strikerDrop_mm = optimalDrop_mm(tubes)
    if (config.strikerDrop_mm > maxDrop_mm(tubes)) {
      config.strikerDrop_mm = maxDrop_mm(tubes)
    }
    return { config, tubes }
  }),
  setTubeOverride: (i, o) => set(s => {
    // keep overrides index-aligned with tubeCount
    const tubeOverrides = [...s.config.tubeOverrides]
    while (tubeOverrides.length < s.config.tubeCount) tubeOverrides.push({})
    tubeOverrides[i] = { ...tubeOverrides[i], ...o }
    // drop an override field when it matches the global value again
    const c = { ...s.config, tubeOverrides }
    const g = tubeOverrides[i]
    if (g.material === s.config.material) delete g.material
    if (g.outerDiameter_mm === s.config.outerDiameter_mm) delete g.outerDiameter_mm
    if (g.wallThickness_mm === s.config.wallThickness_mm) delete g.wallThickness_mm
    if (g.solid === s.config.solid) delete g.solid
    if (o.suspension_mm === undefined && 'suspension_mm' in o) delete g.suspension_mm
    if (o.suspensionPoint === undefined && 'suspensionPoint' in o) delete g.suspensionPoint
    if (g.suspensionPoint === s.config.suspensionPoint) delete g.suspensionPoint
    const tubes = computeTubes(c)
    return { config: c, tubes }
  }),
  reset: () => set(() => {
    // deep clone so DEFAULT_CONFIG never accumulates mutations (auto-clamp etc.)
    const config: ChimeConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG))
    return { config, tubes: computeTubes(config) }
  }),
  flash: (i, vel) => set(s => ({ strikeFlash: { ...s.strikeFlash, [i]: { t: performance.now(), vel: vel ?? 0.5 } } })),
}))

export { tubeFrequencies, tubeDecay, MATERIALS }
