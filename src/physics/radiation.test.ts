import { describe, it, expect } from 'vitest'
import { estimateStrike, strikerMass, strikerRestitution } from './radiation'

const ALU = { length: 0.538, outerDiameter: 0.025, wallThickness: 0.0012, material: 'aluminum' }
const HARDWOOD = { material: 'hardWood', diameter_mm: 55, height_mm: 25 }

describe('striker properties', () => {
  it('mass follows ρ·πr²h (55mm/25mm hardwood ≈ 45 g)', () => {
    const m = strikerMass(HARDWOOD)
    expect(m).toBeGreaterThan(0.040)
    expect(m).toBeLessThan(0.050)
  })

  it('metal striker of same size is much heavier', () => {
    expect(strikerMass({ ...HARDWOOD, material: 'metal' })).toBeGreaterThan(
      strikerMass(HARDWOOD) * 5
    )
  })

  it('restitution increases with hardness (rubber < wood < metal)', () => {
    const r = strikerRestitution('rubber')
    const w = strikerRestitution('hardWood')
    const m = strikerRestitution('metal')
    expect(r).toBeLessThan(w)
    expect(w).toBeLessThan(m)
  })
})

describe('estimateStrike', () => {
  it('SPL grows ~6 dB per doubling of impact velocity', () => {
    const a = estimateStrike(ALU, HARDWOOD, 0.1, 0.5).splAt1m
    const b = estimateStrike(ALU, HARDWOOD, 0.2, 0.5).splAt1m
    expect(b - a).toBeCloseTo(6, 0)
  })

  it('harder striker = louder at the same impact speed', () => {
    const rubber = estimateStrike(ALU, { ...HARDWOOD, material: 'rubber' }, 0.3, 0.5).splAt1m
    const metal = estimateStrike(ALU, { ...HARDWOOD, material: 'metal' }, 0.3, 0.5).splAt1m
    expect(metal).toBeGreaterThan(rubber + 5)
  })

  it('center strike is dramatically louder than the suspension node', () => {
    const c = estimateStrike(ALU, HARDWOOD, 0.3, 0.5).splAt1m
    const n = estimateStrike(ALU, HARDWOOD, 0.3, 0.224).splAt1m
    expect(c - n).toBeGreaterThan(60)
  })

  it('realistic strikes land in the measured chime range (70–110 dB @1m)', () => {
    for (const v of [0.1, 0.3, 0.5]) {
      const { splAt1m } = estimateStrike(ALU, HARDWOOD, v, 0.5)
      expect(splAt1m).toBeGreaterThan(60)
      expect(splAt1m).toBeLessThan(115)
    }
  })

  it('amplitude is sub-mm for wind-speed impacts', () => {
    const { amplitude_mm } = estimateStrike(ALU, HARDWOOD, 0.3, 0.5)
    expect(amplitude_mm).toBeGreaterThan(0)
    expect(amplitude_mm).toBeLessThan(1)
  })

  it('impulse scales linearly with striker mass at fixed velocity', () => {
    const small = estimateStrike(ALU, { ...HARDWOOD, diameter_mm: 40 }, 0.3, 0.5).impulse
    const big = estimateStrike(ALU, { ...HARDWOOD, diameter_mm: 80 }, 0.3, 0.5).impulse
    // mass ∝ r² → 4× area → 4× impulse
    expect(big / small).toBeCloseTo(4, 1)
  })
})
