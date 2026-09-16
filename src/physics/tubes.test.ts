import { describe, it, expect } from 'vitest'
import {
  tubeFrequencies, lengthForFrequency, tubeDecay, analyzeTube, couplingKappa,
} from './tubes'
import { MATERIALS } from './materials'

const ALU = { length: 0.538, outerDiameter: 0.025, wallThickness: 0.0012, material: 'aluminum' }

describe('tubeFrequencies', () => {
  it('round-trips: length computed for C5 resonates at C5', () => {
    const f0 = 523.25
    const L = lengthForFrequency(f0, 'aluminum', 0.025, 0.0012)
    const { f0: solved } = tubeFrequencies({ length: L, outerDiameter: 0.025, wallThickness: 0.0012, material: 'aluminum' })
    expect(Math.abs(solved - f0) / f0).toBeLessThan(1e-9)
  })

  it('frequency scales with 1/L² (doubling length → quarter frequency)', () => {
    const a = tubeFrequencies({ ...ALU, length: 0.5 }).f0
    const b = tubeFrequencies({ ...ALU, length: 1.0 }).f0
    expect(b / a).toBeCloseTo(0.25, 5)
  })

  it('scales linearly with radius at fixed wall ratio (f ∝ √(I/A) ∝ Ro)', () => {
    // exact I/A = (Ro²+Ri²)/4 → at fixed Ri/Ro, f doubles when OD doubles
    const a = tubeFrequencies({ ...ALU, outerDiameter: 0.015, wallThickness: 0.00072 }).f0  // t/OD = 4.8%
    const b = tubeFrequencies({ ...ALU, outerDiameter: 0.030, wallThickness: 0.00144 }).f0
    expect(b / a).toBeCloseTo(2, 2)
  })

  it('at fixed wall THICKNESS, bigger OD ≈ linearly higher f (Ri/Ro → 1)', () => {
    const a = tubeFrequencies({ ...ALU, outerDiameter: 0.015 }).f0
    const b = tubeFrequencies({ ...ALU, outerDiameter: 0.030 }).f0
    expect(b / a).toBeGreaterThan(1.9)
    expect(b / a).toBeLessThan(2.1)
  })

  it('overtones follow free-free beam ratios 1 : 2.756 : 5.404 : 8.933', () => {
    const { f0, partials } = tubeFrequencies(ALU)
    expect(partials[0]).toBeCloseTo(f0, 9)
    expect(partials[1] / f0).toBeCloseTo(2.756, 2)
    expect(partials[2] / f0).toBeCloseTo(5.404, 2)
    expect(partials[3] / f0).toBeCloseTo(8.933, 2)
  })

  it('matches known builder tables: C5 aluminum 25mm tube ≈ 540mm', () => {
    const L = lengthForFrequency(523.25, 'aluminum', 0.025, 0.001)
    expect(L).toBeGreaterThan(0.52)
    expect(L).toBeLessThan(0.56)
  })

  it('denser materials → different lengths (carbon much longer than aluminum)', () => {
    const alu = lengthForFrequency(523.25, 'aluminum', 0.025, 0.0012)
    const carbon = lengthForFrequency(523.25, 'carbon', 0.025, 0.0012)
    expect(carbon).toBeGreaterThan(alu * 1.3)
  })

  it('solid rod rings lower than the same-OD tube (√((Ro²/4)/(Ro²/2)) with exact-I/A correction)', () => {
    const hollow = tubeFrequencies({ ...ALU, length: 0.5 }).f0
    const solid = tubeFrequencies({ ...ALU, length: 0.5, wallThickness: Infinity }).f0
    // exact: hollow I/A = (Ro²+Ri²)/4 (Ri/Ro = 0.904) → ratio = √((1/4)/((1+(0.904)²)/4))
    const Ro = 0.0125, Ri = Ro - 0.0012
    const expected = Math.sqrt((Ro * Ro) / (Ro * Ro + Ri * Ri))
    expect(solid / hollow).toBeCloseTo(expected, 3)
    expect(solid / hollow).toBeLessThan(0.8)
    expect(solid / hollow).toBeGreaterThan(0.7)
  })
})

describe('tubeDecay', () => {
  it('longer sustain for higher material Q (aluminum > bamboo)', () => {
    const alu = tubeDecay({ ...ALU, material: 'aluminum' })
    const bamboo = tubeDecay({ ...ALU, material: 'bamboo' })
    expect(alu / bamboo).toBeGreaterThan(5)
  })

  it('thicker walls sustain longer, solid rods most', () => {
    const thin = tubeDecay({ ...ALU, wallThickness: 0.0005 })
    const thick = tubeDecay({ ...ALU, wallThickness: 0.003 })
    const solid = tubeDecay({ ...ALU, wallThickness: Infinity })
    expect(thick).toBeGreaterThan(thin)
    expect(solid).toBeGreaterThan(thick)
  })

  it('is clamped to sane bounds', () => {
    const d = tubeDecay({ ...ALU, material: 'bamboo' })
    expect(d).toBeGreaterThanOrEqual(0.15)
    expect(d).toBeLessThanOrEqual(20)
  })
})

describe('analyzeTube', () => {
  it('suspension at mode-1 node (0.224) preserves full fundamental sustain', () => {
    const atNode = analyzeTube(ALU, 0.224)
    const offNode = analyzeTube(ALU, 0.5)
    expect(atNode.decayTimes[0]).toBeGreaterThan(offNode.decayTimes[0])
    // at the center the fundamental decays ~2x faster (mode-1 antinode)
    expect(atNode.decayTimes[0] / offNode.decayTimes[0]).toBeGreaterThan(1.7)
  })

  it('hanging at center extends the 2nd partial (its node is at center)', () => {
    const atNode = analyzeTube(ALU, 0.224)
    const atCenter = analyzeTube(ALU, 0.5)
    expect(atCenter.decayTimes[1]).toBeGreaterThan(atNode.decayTimes[1])
  })

  it('suspension exactly at node yields the free decay (loss factor = 1)', () => {
    const free = analyzeTube(ALU, 0.224).decayTimes[0]
    // |φ1(0.224)| ≈ 0 → T60' = T60
    expect(free).toBeCloseTo(tubeDecay(ALU) / (1 + 0 * 1.3), 0)
  })
})

describe('couplingKappa', () => {
  it('is maximal at unison and capped at 0.8', () => {
    expect(couplingKappa(0, 523, 3000)).toBeCloseTo(0.5, 3)
    expect(couplingKappa(0, 523, 3000)).toBeLessThanOrEqual(0.8)
  })

  it('decays with detuning (Lorentzian)', () => {
    const near = couplingKappa(2, 523, 3000)
    const far = couplingKappa(30, 523, 3000)
    expect(near).toBeGreaterThan(far * 10)
    expect(far).toBeLessThan(0.01)
  })

  it('monotonically decreases with |Δf|', () => {
    let prev = couplingKappa(0.01, 523, 3000)
    for (const df of [0.1, 1, 2, 5, 10, 20]) {
      const k = couplingKappa(df, 523, 3000)
      expect(k).toBeLessThanOrEqual(prev)
      prev = k
    }
  })
})

describe('materials sanity', () => {
  it('all materials have positive physical constants', () => {
    for (const m of Object.values(MATERIALS)) {
      expect(m.density).toBeGreaterThan(0)
      expect(m.youngsModulus).toBeGreaterThan(0)
      expect(m.dampingQ).toBeGreaterThan(0)
    }
  })

  it('bar speeds are physically plausible (3–12 km/s)', () => {
    for (const m of Object.values(MATERIALS)) {
      const c = Math.sqrt(m.youngsModulus / m.density)
      expect(c).toBeGreaterThan(3000)
      expect(c).toBeLessThan(12000)
    }
  })
})
