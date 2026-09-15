/**
 * Impulse → sound pressure estimation.
 *
 * Chain (engineering approximation, ±6 dB):
 *  1. Striker impulse        J = (1+e)·m_s·v          [kg·m/s]
 *  2. Modal velocity         v₁ = J·φ₁(ξ) / m_eff(ξ)  [m/s]
 *     m_eff(ξ) = M·∫φ₁²dξ / φ₁(ξ)²   (generalized effective mass)
 *  3. Surface velocity       u = v₁·φ₁(ξ), rms = u/√2
 *  4. Radiated sound power   P = σ_rad·ρ₀·c·S·u²_rms
 *     (σ_rad ≈ 0.03: slender-cylinder radiation efficiency below coincidence)
 *  5. SPL at distance r      Lp = Lw − 20·log10(r) − 8,  Lw = 10·log10(P/1e-12)
 */
import { MATERIALS, STRIKER_MATERIALS } from './materials'
import { TubeSpec, tubeFrequencies, tubeDecay } from './tubes'
import { modeShape } from './modes'

const RHO_0 = 1.2      // air density kg/m³
const C_0 = 343        // speed of sound m/s
const SIGMA_RAD = 0.03 // radiation efficiency of slender tubes (estimate)

export interface StrikerSpec {
  material: string
  diameter_mm: number
  height_mm: number
}

export interface RadiationEstimate {
  impulse: number          // kg·m/s
  modalVelocity: number    // m/s
  amplitude_mm: number     // initial center displacement
  splAt1m: number          // dB SPL (per strike, free field)
  decayT60: number         // s
}

/** Striker mass from geometry + material density. */
export function strikerMass(s: StrikerSpec): number {
  const m = STRIKER_MATERIALS[s.material] ?? STRIKER_MATERIALS.hardWood
  const r = s.diameter_mm / 2000, h = s.height_mm / 1000
  return m.density * Math.PI * r * r * h
}

/** Restitution (coefficient of) from striker hardness. */
export function strikerRestitution(material: string): number {
  const m = STRIKER_MATERIALS[material] ?? STRIKER_MATERIALS.hardWood
  return 0.1 + 0.45 * m.hardness
}

/** Beam mass and mode-1 effective mass at strike position ξ. */
function beamMass(spec: TubeSpec): number {
  const m = MATERIALS[spec.material] ?? MATERIALS.aluminum
  const Ro = spec.outerDiameter / 2
  const Ri = Number.isFinite(spec.wallThickness) ? Math.max(0.0001, Ro - spec.wallThickness) : 0
  return m.density * Math.PI * (Ro * Ro - Ri * Ri) * spec.length
}

function effectiveMass(spec: TubeSpec, xi: number): number {
  // ∫φ₁²dξ for the max-normalized free-free mode-1 ≈ 0.5 (computed numerically below)
  let integ = 0
  const N = 200
  for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N
    integ += modeShape(0, x) ** 2 / N
  }
  const phi = Math.max(1e-3, Math.abs(modeShape(0, xi)))
  return beamMass(spec) * integ / (phi * phi)
}

/** Full per-strike estimate. impactVel in m/s (typ. 0.02–0.5 from wind sim). */
export function estimateStrike(spec: TubeSpec, striker: StrikerSpec, impactVel: number, xi: number): RadiationEstimate {
  const mS = strikerMass(striker)
  const e = strikerRestitution(striker.material)
  const J = (1 + e) * mS * impactVel
  // point velocity from impulse: v = J / m_eff(ξ)
  // (m_eff = m_n/φ² already encodes the mode shape — do NOT multiply by φ again)
  const mEff = effectiveMass(spec, xi)
  const vPoint = J / Math.max(1e-6, mEff)
  const uRms = Math.abs(vPoint) / Math.SQRT2
  const S = Math.PI * spec.outerDiameter * spec.length   // radiating surface
  const P = SIGMA_RAD * RHO_0 * C_0 * S * uRms * uRms
  const Lw = 10 * Math.log10(Math.max(1e-18, P) / 1e-12)
  const splAt1m = Lw - 8
  const { f0 } = tubeFrequencies(spec)
  const A = vPoint / (2 * Math.PI * f0)           // initial displacement at ξ
  return {
    impulse: J,
    modalVelocity: vPoint,
    amplitude_mm: A * 1000,
    splAt1m: splAt1m,
    decayT60: tubeDecay(spec),
  }
}
