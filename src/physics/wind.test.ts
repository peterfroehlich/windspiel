import { describe, it, expect, vi } from 'vitest'
import { WindSim } from './wind'

const GEO = [6, 0.055, 0.0125, 0.0275, 0.115, 0.35, 30] as const
const step = (sim: WindSim, dt = 1 / 60) => sim.update(dt, { strength: 0.7, gustFreq: 0.15 })

describe('WindSim', () => {
  it('produces strikes when the wind blows (rate scales with strength)', () => {
    const rate = (strength: number) => {
      const sim = new WindSim()
      sim.setGeometry(...GEO)
      let n = 0
      sim.onStrike = () => n++
      for (let i = 0; i < 60 * 60; i++) sim.update(1 / 60, { strength, gustFreq: 0.15 })
      return n
    }
    const quiet = rate(0.2)
    const windy = rate(0.9)
    expect(windy).toBeGreaterThan(20)
    expect(windy).toBeGreaterThan(quiet * 2)
  })

  it('silence below ~20% wind (deep lulls keep amplitude under the ring)', () => {
    const sim = new WindSim()
    sim.setGeometry(...GEO)
    let n = 0
    sim.onStrike = () => n++
    for (let i = 0; i < 60 * 60; i++) sim.update(1 / 60, { strength: 0.15, gustFreq: 0.15 })
    expect(n).toBeLessThan(3)
  })

  it('strike velocities vary (no metronome): p90/p10 > 2', () => {
    const sim = new WindSim()
    sim.setGeometry(...GEO)
    const vels: number[] = []
    sim.onStrike = (_t: number, v: number) => vels.push(v)
    for (let i = 0; i < 60 * 120; i++) step(sim)
    vels.sort((a, b) => a - b)
    const p10 = vels[Math.floor(vels.length * 0.1)]
    const p90 = vels[Math.floor(vels.length * 0.9)]
    expect(p90 / p10).toBeGreaterThan(2)
  })

  it('settle() brings the striker to rest with zero strikes during settling', () => {
    const sim = new WindSim()
    sim.setGeometry(...GEO)
    for (let i = 0; i < 60 * 20; i++) step(sim)
    let settleStrikes = 0
    sim.onStrike = () => settleStrikes++
    for (let i = 0; i < 60 * 10; i++) sim.settle(1 / 60)
    expect(Math.hypot(sim.state.x, sim.state.z)).toBeLessThan(0.001)
    expect(Math.hypot(sim.state.vx, sim.state.vz)).toBeLessThan(0.001)
    expect(settleStrikes).toBe(0)
  })

  it('heavy sail travels less than a light sail', () => {
    const travel = (mass: number) => {
      const sim = new WindSim()
      sim.setGeometry(6, 0.055, 0.0125, 0.0275, 0.115, 0.35, mass)
      let max = 0
      for (let i = 0; i < 60 * 60; i++) {
        const st = step(sim)
        max = Math.max(max, Math.hypot(st.sailX, st.sailZ))
      }
      return max
    }
    expect(travel(200)).toBeLessThan(travel(5) * 0.6)
  })

  it('cooldown prevents machine-gunning the same tube (min 0.1s between)', () => {
    const sim = new WindSim()
    sim.setGeometry(...GEO)
    const lastPerTube = new Map<number, number>()
    const gaps: number[] = []
    let t = 0
    sim.onStrike = (tube: number) => {
      const last = lastPerTube.get(tube)
      if (last !== undefined) gaps.push(t - last)
      lastPerTube.set(tube, t)
    }
    for (let i = 0; i < 60 * 60; i++) { t = i / 60; step(sim) }
    expect(gaps.every((g) => g >= 0.1)).toBe(true)
  })

  it('manualImpulse pushes the striker toward the given tube', () => {
    const sim = new WindSim()
    sim.setGeometry(...GEO)
    const a0 = (0 / 6) * Math.PI * 2   // tube 0 at angle 0 → +x
    sim.manualImpulse(0)
    expect(sim.state.vx).toBeGreaterThan(0)
    void a0
  })

  it('onStrike callback receives tube index and velocity in [0,1]', () => {
    const sim = new WindSim()
    sim.setGeometry(...GEO)
    const cb = vi.fn()
    sim.onStrike = cb
    for (let i = 0; i < 60 * 120; i++) step(sim)
    expect(cb).toHaveBeenCalled()
    const [tube, vel] = cb.mock.calls[0]
    expect(tube).toBeGreaterThanOrEqual(0)
    expect(tube).toBeLessThan(6)
    expect(vel).toBeGreaterThan(0)
    expect(vel).toBeLessThanOrEqual(1)
  })
})
