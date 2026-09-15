/**
 * Exact mode shapes of the free-free Euler–Bernoulli beam.
 *
 * φ_n(ξ) = cosh(βξ) + cos(βξ) − σ_n [ sinh(βξ) + sin(βξ) ],  ξ = x/L
 * σ_n   = (cosh β − cos β) / (sinh β − sin β)
 * with β₁L = 4.7300, β₂L = 7.8532, β₃L = 10.9956, β₄L = 14.1372
 *
 * Key physical facts encoded here:
 *  - Mode 1 has nodes at ξ ≈ 0.224 / 0.776  ← the classic suspension points
 *  - Mode 1 antinodes at the ends and at the CENTER
 *  - Mode 2 has a node at the center (ξ = 0.5)
 *  → Striking at the center excites the fundamental maximally while almost
 *    completely skipping the 2.756×f₀ overtone → purest, sweetest tone.
 *  → Striking at 22.4% (the suspension node of mode 1) barely excites the
 *    fundamental at all — that's why you hang there, not hit there.
 */

const BETA_L = [4.7300, 7.8532, 10.9956, 14.1372]

function sigma(n: number): number {
  const b = BETA_L[n]
  return (Math.cosh(b) - Math.cos(b)) / (Math.sinh(b) - Math.sin(b))
}

/** Mode shape of free-free beam, ξ ∈ [0,1], normalized to max |φ| = 1. */
export function modeShape(n: number, xi: number): number {
  const b = BETA_L[n] / 1   // β·ξ where β = β_nL (since ξ = x/L)
  const s = sigma(n)
  const raw = Math.cosh(b * xi) + Math.cos(b * xi) - s * (Math.sinh(b * xi) + Math.sin(b * xi))
  return raw / maxAbs(n)
}

function maxAbs(n: number): number {
  let m = 0
  for (let i = 0; i <= 200; i++) {
    const xi = i / 200
    const b = BETA_L[n]
    const s = sigma(n)
    const v = Math.abs(Math.cosh(b * xi) + Math.cos(b * xi) - s * (Math.sinh(b * xi) + Math.sin(b * xi)))
    if (v > m) m = v
  }
  return m
}

/** Node positions (ξ) of mode n (internal nodes only), computed numerically. */
export function modeNodes(n: number): number[] {
  const nodes: number[] = []
  let prev = modeShapeRaw(n, 0)
  for (let i = 1; i <= 2000; i++) {
    const xi = i / 2000
    const v = modeShapeRaw(n, xi)
    if (prev * v < 0) {
      nodes.push((i - 0.5) / 2000)
    }
    prev = v
  }
  return nodes
}

function modeShapeRaw(n: number, xi: number): number {
  const b = BETA_L[n]
  const s = sigma(n)
  return Math.cosh(b * xi) + Math.cos(b * xi) - s * (Math.sinh(b * xi) + Math.sin(b * xi))
}

/**
 * Per-partial excitation amplitude when the tube is struck at ξ.
 * Weight[n] = |φ_n(ξ)| — striking on a mode's node mutes that mode.
 */
export function strikeWeights(xi: number): number[] {
  return [0, 1, 2, 3].map((n) => Math.abs(modeShape(n, xi)))
}

/**
 * Optimal strike point: the center (ξ = 0.5).
 * - maximal mode-1 (fundamental) excitation
 * - mode 2 (2.756 f₀) has a node there → skips the harshest overtone
 * Returns ξ plus the resulting overtone suppression in dB.
 */
export function optimalStrikePoint(): { xi: number; overtoneSuppressionDb: number } {
  const w = strikeWeights(0.5)
  // relative excitation of partial 2 vs partial 1 at center
  const ratio = w[1] / Math.max(1e-9, w[0])
  return { xi: 0.5, overtoneSuppressionDb: -20 * Math.log10(Math.max(1e-9, ratio)) }
}

/** Quality of a strike position: how close to the fundamental antinode. */
export function strikeQuality(xi: number): { fundamentalDb: number; overtoneDb: number; nearNode: boolean } {
  const w = strikeWeights(xi)
  const fundamentalDb = 20 * Math.log10(Math.max(1e-4, w[0]))
  const overtoneDb = 20 * Math.log10(Math.max(1e-4, w[1]))
  // near a mode-1 node (0.224 / 0.776) the fundamental barely sounds
  const nearNode = Math.abs(xi - 0.224) < 0.05 || Math.abs(xi - 0.776) < 0.05
  return { fundamentalDb, overtoneDb, nearNode }
}

/**
 * Suspension-loss factor per partial.
 *
 * A tube hanging on strings at ξ_s loses energy to the support at a rate
 * proportional to the square of the mode displacement there (energy coupled
 * into the strings/support, ζ_add ∝ φ_n(ξ_s)²). At the mode's node (φ = 0)
 * the support sees no motion → no extra loss → full sustain. At an antinode
 * the support "grabs" the mode → strongly shortened ring.
 *
 * Model: T60' = T60 / (1 + k_susp · φ_n(ξ_s)²), with k_susp calibrated so
 * hanging at an antinode shortens T60 by ~×4 (typical for a badly hung chime),
 * while at the node the factor → 1 (free decay).
 */
export function suspensionLossFactor(xiSusp: number, mode: number): number {
  const phi = Math.abs(modeShape(mode, xiSusp))
  const K_SUSP = 3.0
  return 1 / (1 + K_SUSP * phi * phi)
}
