import { MATERIALS } from './materials'
import { suspensionLossFactor } from './modes'

/**
 * Euler–Bernoulli beam theory for a free-free thin tube.
 *
 * Free-free beam mode frequencies (Chladni):
 *   f_n = (beta_n² / 2π) * sqrt(E I / (ρ A L⁴))
 * with beta₁² ≈ 22.373, beta₂² ≈ 61.6728, beta₃² ≈ 121.0127
 *
 * For a thin-walled circular tube of outer radius Ro and wall thickness t:
 *   I ≈ π Ro³ t   (t << Ro),  A ≈ 2π Ro t
 *   I/A = Ro²/2  → f is independent of wall thickness to first order
 *   (small correction: f ∝ sqrt(I/A) with exact I, A).
 *
 * Overtones for ideal free-free beam: 2.756×f1, 5.404×f1, 8.933×f1
 */

export const BEAM_BETA2 = [22.373, 61.6728, 121.0127, 199.854]
export const OVERTONE_RATIOS = [1.0, 2.756, 5.404, 8.933]

export interface TubeSpec {
  length: number        // m
  outerDiameter: number // m
  wallThickness: number // m
  material: string
  speedFactor?: number  // material speed calibration factor (default: 1.0)
}

export interface TubeAcoustics {
  f0: number            // fundamental Hz
  partials: number[]    // [f0, 2.756f0, 5.404f0, ...]
  decayTimes: number[]  // T60 per partial, seconds
  strikeTone: number    // strike transient brightness (Hz, lowpass corner)
}

/** Moment of inertia for tube (exact circular ring) or solid rod (t = Infinity). */
function inertia(Do: number, t: number): number {
  const Ro = Do / 2
  const Ri = Number.isFinite(t) ? Math.max(0.0001, Ro - t) : 0
  return Math.PI / 4 * (Ro ** 4 - Ri ** 4)
}

function area(Do: number, t: number): number {
  const Ro = Do / 2
  const Ri = Number.isFinite(t) ? Math.max(0.0001, Ro - t) : 0
  return Math.PI * (Ro ** 2 - Ri ** 2)
}

export function tubeFrequencies(spec: TubeSpec): { f0: number; partials: number[] } {
  const m = MATERIALS[spec.material] ?? MATERIALS.aluminum
  const L = spec.length
  const I = inertia(spec.outerDiameter, spec.wallThickness)
  const A = area(spec.outerDiameter, spec.wallThickness)
  const c = Math.sqrt(m.youngsModulus / m.density) * (spec.speedFactor ?? 1.0) // bar wave speed (with calibration)
  const f1 = BEAM_BETA2[0] / (2 * Math.PI) * Math.sqrt(I / A) * c / (L * L)
  const partials = OVERTONE_RATIOS.map(r => f1 * r)
  return { f0: f1, partials }
}

export function tubeDecay(spec: TubeSpec): number {
  const m = MATERIALS[spec.material] ?? MATERIALS.aluminum
  // T60 ≈ 2.2 * Q / f0 (for lightly damped oscillator), scaled by wall thickness
  const { f0 } = tubeFrequencies(spec)
  // wall factor: thicker walls ring longer (more elastic energy per surface
  // loss); solid rods (t = Infinity) get the max factor
  const thick = Number.isFinite(spec.wallThickness)
    ? Math.min(1, spec.wallThickness / 0.002)
    : 1.3
  return Math.max(0.15, Math.min(20, (2.2 * m.dampingQ / f0) * (0.7 + 0.3 * thick)))
}

export function analyzeTube(spec: TubeSpec, suspensionPoint = 0.224): TubeAcoustics {
  const { f0, partials } = tubeFrequencies(spec)
  const baseT60 = tubeDecay(spec)
  // higher partials decay faster
  const decayTimes = OVERTONE_RATIOS.map((r, i) => {
    const fast = baseT60 / (1 + i * 1.3)
    // energy drain through the suspension: mode n displacement at the hang
    // point scales the loss (≈ no effect at a node, strong at an antinode)
    return fast * suspensionLossFactor(suspensionPoint, i)
  })
  const m = MATERIALS[spec.material] ?? MATERIALS.aluminum
  const strikeTone = m.dampingQ > 500 ? 8000 : 2500  // metal = bright strike, bamboo = dull
  return { f0, partials, decayTimes, strikeTone }
}

/**
 * Inverse problem: given target f0, solve for tube length L.
 * f1 ∝ sqrt(I/A)/L² * c → L = sqrt( (beta²/2π) * sqrt(I/A) * c / f0 )
 */
export function lengthForFrequency(f0: number, material: string, Do: number, t: number, speedFactor = 1.0): number {
  const m = MATERIALS[material] ?? MATERIALS.aluminum
  const I = inertia(Do, t), A = area(Do, t)
  const c = Math.sqrt(m.youngsModulus / m.density) * speedFactor
  return Math.sqrt((BEAM_BETA2[0] / (2 * Math.PI)) * Math.sqrt(I / A) * c / f0)
}

/**
 * Sympathetic-resonance strength between two partials (coupled-mode theory).
 *
 * A struck tube pumps force through its suspension strings into the frame;
 * the frame motion drives every other tube. Energy transfer between weakly
 * coupled modes peaks at small detuning with a Lorentzian:
 *
 *   κ(Δf) = K0 / (1 + (Δf / γ)²)
 *
 * γ = f/(2Q·2π) is the half-bandwidth of the receiver mode (resonance is only
 * "seen" within ~γ), and K0 is the frame-coupling coefficient (suspension
 * mobility, mass ratio, spacing). At exact unison this is capped: two nearly
 * identical tubes beat/steal energy strongly — modeled by the cap 0.8.
 */
export function couplingKappa(deltaF: number, receiverFreq: number, receiverQ: number): number {
  // Steady-state half-bandwidth of the receiver mode...
  const gammaSteady = receiverFreq / (2 * receiverQ * 2 * Math.PI)
  // ...but the driver is a DECAYING TRANSIENT (spectral width ~1/T60) and the
  // frame itself is lossy, so the effective response is broadened. Floor at
  // 2 Hz: near-unison still couples ~max, intervals beyond ~50 Hz are ignored.
  const gamma = Math.max(gammaSteady, 2)
  const lorentzian = 1 / (1 + (deltaF / gamma) ** 2)
  return Math.min(0.8, 0.5 * lorentzian)
}

/** Note names → Hz (equal temperament, A4 = 440). */
const NOTE_OFFSETS: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }
export function noteToFreq(n: string): number {
  const m = n.trim().match(/^([A-G])([#b]?)(-?\d)$/)
  if (!m) return 440
  const [, letter, acc, oct] = m
  let semi = NOTE_OFFSETS[letter]
  if (acc === '#') semi += 1
  if (acc === 'b') semi -= 1
  return 440 * Math.pow(2, (semi + (parseInt(oct) - 4) * 12) / 12)
}
