import { describe, it, expect, beforeEach } from 'vitest'
import { strikeWeights } from '../physics/modes'
import { useStore, tubeSpec, maxDrop_mm, optimalDrop_mm, equalLoudnessDrop_mm, tubeSuspension } from './store'

const st = () => useStore.getState()

beforeEach(() => st().reset())

describe('store: tuning & tubes', () => {
  it('default tubes are ascending frequencies from the default scale', () => {
    const freqs = st().tubes.map((t) => t.freq)
    expect(freqs).toEqual([...freqs].sort((a, b) => a - b))
  })

  it('retuning recomputes lengths (same notes, different material)', () => {
    const before = st().tubes.map((t) => t.length_mm)
    st().setConfig({ material: 'carbon' })
    const after = st().tubes.map((t) => t.length_mm)
    expect(after.every((l, i) => l > before[i])).toBe(true)   // carbon → longer
    expect(st().tubes[0].note).toBe(before[0] && st().tubes[0].note)  // notes unchanged
  })

  it('changing tube count keeps overrides/notes index-aligned', () => {
    st().setConfig({ tubeCount: 10 })
    expect(st().tubes.length).toBe(10)
    st().setConfig({ tubeCount: 4 })
    expect(st().tubes.length).toBe(4)
  })

  it('manual notes mode solves lengths from typed notes', () => {
    st().setConfig({ tuningMode: 'manual', manualNotes: ['A4', 'A4', 'A4', 'A4'] })
    st().setConfig({ tubeCount: 4 })
    const t = st().tubes
    expect(t.every((x) => Math.abs(x.freq - 440) < 0.5)).toBe(true)
    expect(t[0].length_mm).toBeCloseTo(t[2].length_mm, 0)
  })
})

describe('store: per-tube overrides (advanced mode)', () => {
  it('override re-solves length while preserving the note', () => {
    const note = st().tubes[1].note
    const lenBefore = st().tubes[1].length_mm
    st().setTubeOverride(1, { material: 'bamboo' })
    const t = st().tubes[1]
    expect(t.note).toBe(note)
    expect(t.freq).toBeCloseTo(st().tubes[1].freq, 6)
    expect(t.length_mm).not.toBeCloseTo(lenBefore, 0)
  })

  it('non-overridden tubes are untouched', () => {
    const others = st().tubes.map((t) => t.length_mm)
    st().setTubeOverride(2, { material: 'brass' })
    expect(st().tubes.filter((_, i) => i !== 2).map((t) => t.length_mm)).toEqual(
      others.filter((_, i) => i !== 2)
    )
  })

  it('setting back to global clears the override entry', () => {
    st().setTubeOverride(0, { material: 'bronze' })
    expect(st().config.tubeOverrides[0].material).toBe('bronze')
    st().setTubeOverride(0, { material: 'aluminum' })
    expect(st().config.tubeOverrides[0].material).toBeUndefined()
  })

  it('per-tube solid override affects the spec (wall = Infinity)', () => {
    st().setTubeOverride(0, { solid: true })
    const spec = tubeSpec(st().config, st().tubes[0], 0)
    expect(spec.wallThickness).toBe(Infinity)
    const neighbor = tubeSpec(st().config, st().tubes[1], 1)
    expect(neighbor.wallThickness).toBeLessThan(1)
  })
})

describe('store: striker drop', () => {
  it('default drop = optimal (50% of longest tube)', () => {
    expect(st().config.strikerDrop_mm).toBe(optimalDrop_mm(st().tubes))
  })

  it('retuning moves a parked-at-optimum striker to the new optimum', () => {
    st().setConfig({ material: 'carbon' })
    expect(st().config.strikerDrop_mm).toBe(optimalDrop_mm(st().tubes))
  })

  it('a manually moved striker stays put across retunes (but stays reachable)', () => {
    st().setConfig({ strikerDrop_mm: 100 })
    st().setConfig({ scaleId: 'maj7' })
    expect(st().config.strikerDrop_mm).toBe(100)
    expect(st().config.strikerDrop_mm).toBeLessThanOrEqual(maxDrop_mm(st().tubes))
  })

  it('drop is clamped when tubes become too short to reach', () => {
    st().setConfig({ strikerDrop_mm: 300 })
    st().setConfig({ scaleId: 'minTriad', rootNote: 'C', tubeCount: 6 })
    expect(st().config.strikerDrop_mm).toBeLessThanOrEqual(maxDrop_mm(st().tubes))
  })
})

describe('store: reset', () => {
  it('restores every config field to default', () => {
    st().setConfig({
      tubeCount: 12, material: 'glass', windStrength: 1, scaleId: 'sakura',
      advanced: true, sailMass_g: 100, strikerMaterial: 'metal',
    })
    st().reset()
    const c = st().config
    expect(c.tubeCount).toBe(6)
    expect(c.material).toBe('aluminum')
    expect(c.windStrength).toBe(0.35)
    expect(c.scaleId).toBe('pentMajor')
    expect(c.advanced).toBe(false)
    expect(c.sailMass_g).toBe(30)
    expect(c.strikerMaterial).toBe('hardWood')
    expect(c.strikerDrop_mm).toBe(optimalDrop_mm(st().tubes))
  })

  it('DEFAULT_CONFIG is not mutated by repeated reset/mutate cycles', () => {
    const drop = st().config.strikerDrop_mm
    for (let i = 0; i < 3; i++) {
      st().setConfig({ tubeCount: 12, material: 'glass' })
      st().reset()
    }
    expect(st().config.strikerDrop_mm).toBe(drop)
  })
})

describe('derived helpers', () => {
  it('optimalDrop = 50% of longest tube', () => {
    expect(optimalDrop_mm(st().tubes)).toBe(Math.round(Math.max(...st().tubes.map((t) => t.length_mm)) * 0.5))
  })

  it('maxDrop = 90% of shortest tube (every tube stays reachable)', () => {
    expect(maxDrop_mm(st().tubes)).toBe(Math.round(Math.min(...st().tubes.map((t) => t.length_mm)) * 0.9))
  })

  it('equal-loudness drop has smaller fundamental spread than the optimal drop', () => {
    const spread = (drop: number) => {
      const exc = st().tubes.map((t) => strikeWeights(Math.min(0.98, drop / 1000 / (t.length_mm / 1000)))[0])
      const mean = exc.reduce((a, b) => a + b, 0) / exc.length
      return Math.sqrt(exc.reduce((a, b) => a + (b - mean) ** 2, 0) / exc.length)
    }
    expect(spread(equalLoudnessDrop_mm(st().tubes, st().config.suspensionPoint) / 1000))
      .toBeLessThan(spread(optimalDrop_mm(st().tubes) / 1000))
  })
})

describe('tubeSuspension & sameAbsoluteSuspension', () => {
  it('default uses relative fraction (22.4%) for each tube', () => {
    const { config, tubes } = st()
    expect(config.sameAbsoluteSuspension).toBe(false)
    for (let i = 0; i < tubes.length; i++) {
      const susp = tubeSuspension(config, tubes, i)
      expect(susp.fraction).toBeCloseTo(0.224, 4)
      expect(susp.mm).toBeCloseTo(tubes[i].length_mm * 0.224, 2)
    }
  })

  it('sameAbsoluteSuspension gives all tubes the same absolute suspension distance in mm', () => {
    st().setConfig({ sameAbsoluteSuspension: true })
    const { config, tubes } = st()
    const targetMm = tubes[0].length_mm * config.suspensionPoint
    for (let i = 0; i < tubes.length; i++) {
      const susp = tubeSuspension(config, tubes, i)
      expect(susp.mm).toBeCloseTo(targetMm, 2)
      expect(susp.fraction).toBeCloseTo(targetMm / tubes[i].length_mm, 4)
    }
  })

  it('per-tube override in absolute mm takes precedence over relative and same-absolute suspension', () => {
    st().setTubeOverride(2, { suspension_mm: 88.5 })
    const { config, tubes } = st()
    const susp2 = tubeSuspension(config, tubes, 2)
    expect(susp2.mm).toBe(88.5)
    expect(susp2.fraction).toBeCloseTo(88.5 / tubes[2].length_mm, 4)

    // When sameAbsoluteSuspension is toggled on, tube 2 still keeps its manual mm override
    st().setConfig({ sameAbsoluteSuspension: true })
    const susp2Abs = tubeSuspension(st().config, st().tubes, 2)
    expect(susp2Abs.mm).toBe(88.5)

    // Resetting override reverts to standard calculation
    st().setTubeOverride(2, { suspension_mm: undefined })
    const susp2Reset = tubeSuspension(st().config, st().tubes, 2)
    const targetMm = st().tubes[0].length_mm * st().config.suspensionPoint
    expect(susp2Reset.mm).toBeCloseTo(targetMm, 2)
  })

  it('legacy per-tube fraction override is also supported', () => {
    st().setTubeOverride(2, { suspensionPoint: 0.32 })
    const { config, tubes } = st()
    const susp2 = tubeSuspension(config, tubes, 2)
    expect(susp2.fraction).toBeCloseTo(0.32, 4)
    expect(susp2.mm).toBeCloseTo(tubes[2].length_mm * 0.32, 2)
  })
})

describe('store: materialSpeedFactors calibration', () => {
  it('calibrating material wave speed scales all tube cut lengths by sqrt(speedFactor)', () => {
    const uncalibratedLengths = st().tubes.map((t) => t.length_mm)
    const speedFactor = 0.9025 // sqrt(0.9025) = 0.95 (5% shorter)

    st().setConfig({
      materialSpeedFactors: {
        aluminum: speedFactor,
      },
    })

    const calibratedLengths = st().tubes.map((t) => t.length_mm)
    for (let i = 0; i < uncalibratedLengths.length; i++) {
      expect(calibratedLengths[i] / uncalibratedLengths[i]).toBeCloseTo(0.95, 4)
    }

    // tubeSpec includes the speedFactor
    const spec = tubeSpec(st().config, st().tubes[0], 0)
    expect(spec.speedFactor).toBeCloseTo(speedFactor, 4)
  })

  it('only affects tubes made of the calibrated material', () => {
    st().setTubeOverride(1, { material: 'brass' })
    const brassBefore = st().tubes[1].length_mm
    const aluBefore = st().tubes[0].length_mm

    st().setConfig({
      materialSpeedFactors: {
        aluminum: 0.9,
      },
    })

    expect(st().tubes[0].length_mm).toBeLessThan(aluBefore)
    expect(st().tubes[1].length_mm).toBeCloseTo(brassBefore, 4)
  })
})

