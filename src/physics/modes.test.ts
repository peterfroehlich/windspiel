import { describe, it, expect } from 'vitest'
import { modeShape, modeNodes, strikeWeights, optimalStrikePoint, strikeQuality, suspensionLossFactor } from './modes'

describe('mode shapes (free-free beam)', () => {
  it('mode-1 nodes at 22.4% and 77.6% (the classic suspension points)', () => {
    const nodes = modeNodes(0)
    expect(nodes.length).toBe(2)
    expect(nodes[0]).toBeCloseTo(0.224, 2)
    expect(nodes[1]).toBeCloseTo(0.776, 2)
  })

  it('mode-2 has a node at the center', () => {
    const nodes = modeNodes(1)
    expect(nodes.some((n) => Math.abs(n - 0.5) < 0.005)).toBe(true)
  })

  it('mode 1 is symmetric about the center (ends in phase), mode 2 antisymmetric', () => {
    for (const xi of [0.1, 0.3, 0.4]) {
      expect(modeShape(0, xi)).toBeCloseTo(modeShape(0, 1 - xi), 4)
      expect(modeShape(1, xi)).toBeCloseTo(-modeShape(1, 1 - xi), 4)
    }
  })

  it('is normalized to max |φ| = 1', () => {
    let max = 0
    for (let i = 0; i <= 100; i++) max = Math.max(max, Math.abs(modeShape(0, i / 100)))
    expect(max).toBeCloseTo(1, 3)
  })
})

describe('strike weights', () => {
  it('center strike maximizes the fundamental among practical points', () => {
    const wCenter = strikeWeights(0.5)[0]
    for (const xi of [0.1, 0.2, 0.3, 0.35, 0.6, 0.8, 0.9]) {
      expect(wCenter).toBeGreaterThanOrEqual(strikeWeights(xi)[0] - 1e-6)
    }
  })

  it('center strike nearly mutes the 2nd partial (its node)', () => {
    expect(strikeWeights(0.5)[1]).toBeLessThan(0.02)
  })

  it('striking at the suspension node barely excites the fundamental', () => {
    expect(strikeWeights(0.224)[0]).toBeLessThan(0.02)
  })

  it('optimal strike point is the center with huge 2nd-partial suppression', () => {
    const opt = optimalStrikePoint()
    expect(opt.xi).toBeCloseTo(0.5, 6)
    expect(opt.overtoneSuppressionDb).toBeGreaterThan(60)
  })

  it('strikeQuality flags the suspension-node band as near-node', () => {
    expect(strikeQuality(0.224).nearNode).toBe(true)
    expect(strikeQuality(0.5).nearNode).toBe(false)
  })
})

describe('suspension loss factor', () => {
  it('equals 1 exactly at the mode-1 node (full free decay)', () => {
    const f = suspensionLossFactor(0.224, 0)
    expect(f).toBeGreaterThan(0.999)
  })

  it('shortens decay at an antinode (center): factor ≤ 0.5', () => {
    expect(suspensionLossFactor(0.5, 0)).toBeLessThan(0.5)
  })

  it('is stronger for mode 1 at center than mode 2 at center (mode-2 node)', () => {
    expect(suspensionLossFactor(0.5, 0)).toBeLessThan(suspensionLossFactor(0.5, 1))
  })

  it('is monotonically decreasing with |φ| — never amplifies', () => {
    for (let i = 0; i <= 20; i++) {
      expect(suspensionLossFactor(i / 20, 0)).toBeLessThanOrEqual(1)
    }
  })
})
