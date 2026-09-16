/**
 * Hertzian contact mechanics for striker–tube impact.
 *
 * Contact duration (the classic Hertz result):
 *   τ = 2.87 · (m² / (R_eff · E*² · v))^(1/5)
 * with the effective (reduced) modulus E* = 1/(0.91/E₁ + 0.91/E₂).
 *
 * Physical role: the contact pulse of length τ is a low-pass filter with
 * bandwidth fc ≈ 0.35/τ. Partials above fc are weakly excited:
 *   - soft/rounded contacts (long τ) → warm, pure tone (fundamental dominates)
 *   - hard/sharp contacts (short τ) → broad excitation → bright metallic clank
 *
 * NOTE on curvature direction: τ ∝ R_eff^(-1/5) — a LARGER radius gives a
 * LONGER contact and softer spectrum (the intuitive "sharp edge = short τ"
 * really comes from high E* and small contact radius, which is what the
 * form presets encode).
 *
 * Impulse uses the REDUCED-MASS formula (tube gives way during impact):
 *   J = μ·(1+e)·v,  μ = m_s·m_eff/(m_s+m_eff)
 * (fixed-target J = m_s(1+e)v is the m_eff ≫ m_s limit and overestimates
 * J by up to ~1.5× for typical hardwood-on-aluminum chimes.)
 *
 * Optimum striker weight: with unlimited wind the impulse grows with m_s
 * (μ → m_eff), but a real sail can only accelerate a finite mass; the
 * balance point of energy transfer sits near m_s ≈ m_eff — the classic
 * impedance-matching result. optimumStrikerMass() returns that reference.
 */
import { MATERIALS, STRIKER_MATERIALS, STRIKER_FORMS } from './materials'
import type { TubeSpec } from './tubes'
import { tubeFrequencies } from './tubes'
import { modeShape } from './modes'

/** Effective modulus of two bodies in contact. */
function effectiveModulus(E1: number, E2: number): number {
  return 1 / (0.91 / E1 + 0.91 / E2)
}

/** Beam mass [kg] (exact circular section). */
function beamMass(spec: TubeSpec): number {
  const m = MATERIALS[spec.material] ?? MATERIALS.aluminum
  const Ro = spec.outerDiameter / 2
  const Ri = Number.isFinite(spec.wallThickness) ? Math.max(0.0001, Ro - spec.wallThickness) : 0
  return m.density * Math.PI * (Ro * Ro - Ri * Ri) * spec.length
}

/** Mode-1 effective mass at strike position ξ [kg]. */
function effectiveMass(spec: TubeSpec, xi: number): number {
  let integ = 0
  for (let i = 0; i < 200; i++) integ += modeShape(0, (i + 0.5) / 200) ** 2 / 200
  const phi = Math.max(1e-3, Math.abs(modeShape(0, xi)))
  return beamMass(spec) * integ / (phi * phi)
}

export interface StrikerSpec {
  material: string
  form: string
  diameter_mm: number
  height_mm: number
}

/** Contact duration τ [s] for a strike. Combines striker + tube curvature:
 *  1/R_eff = 1/R_s + 1/R_tube (a flat disc on a round tube is NOT flat). */
export function contactDuration(striker: StrikerSpec, spec: TubeSpec, v: number, xi = 0.5): number {
  const sm = STRIKER_MATERIALS[striker.material] ?? STRIKER_MATERIALS.hardWood
  const form = STRIKER_FORMS[striker.form] ?? STRIKER_FORMS.disc
  const tm = MATERIALS[spec.material] ?? MATERIALS.aluminum
  const m = strikerMass(striker)
  const Rs = form.R_s(striker.diameter_mm / 1000)
  const Rt = spec.outerDiameter / 2
  const R = 1 / (1 / Rs + 1 / Rt)   // R_s = Infinity (flat) → R = R_tube
  const Estar = effectiveModulus(sm.youngsModulus, tm.youngsModulus)
  return 2.87 * Math.pow((m * m) / (R * Estar * Estar * Math.max(0.01, v)), 0.2)
}

/** Contact bandwidth [Hz] — partials above this are weakly excited. */
export function contactBandwidth(striker: StrikerSpec, spec: TubeSpec, v: number, xi = 0.5): number {
  return 0.35 / Math.max(1e-5, contactDuration(striker, spec, v, xi))
}

/** Excitation factor 0..1 for a partial of frequency f through the contact filter. */
export function partialExcitation(f: number, striker: StrikerSpec, spec: TubeSpec, v: number, xi = 0.5): number {
  const fc = contactBandwidth(striker, spec, v, xi)
  // single-pole low-pass magnitude: 1/sqrt(1+(f/fc)²)
  return 1 / Math.sqrt(1 + (f / fc) ** 2)
}

export function strikerMass(s: StrikerSpec): number {
  const m = STRIKER_MATERIALS[s.material] ?? STRIKER_MATERIALS.hardWood
  const r = s.diameter_mm / 2000, h = s.height_mm / 1000
  return m.density * Math.PI * r * r * h
}

export function strikerRestitution(material: string): number {
  const m = STRIKER_MATERIALS[material] ?? STRIKER_MATERIALS.hardWood
  return 0.1 + 0.45 * m.hardness
}

/** Reduced-mass impulse J [kg·m/s] (tube moves during impact). */
export function reducedImpulse(striker: StrikerSpec, spec: TubeSpec, v: number, xi = 0.5): number {
  const ms = strikerMass(striker)
  const me = effectiveMass(spec, xi)
  const mu = (ms * me) / (ms + me)
  return mu * (1 + strikerRestitution(striker.material)) * v
}

/**
 * Recommended striker mass [kg] for a chime: the impedance-match point
 * m_s ≈ m_eff(0.5) of the LONGEST tube (the reference voice), rounded to a
 * sensible shop value. Lighter = bounces off weakly; heavier = the sail
 * can't pump it into a proper swing.
 */
export function optimalStrikerMass(spec: TubeSpec): number {
  return effectiveMass(spec, 0.5)
}
