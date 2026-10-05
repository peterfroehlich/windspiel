import { describe, it, expect } from 'vitest'
import {
  computeStringLinePoints,
  computeGrommetPositions,
  getVStyleHolePosition,
} from './mounting'
import { DEFAULT_CONFIG } from '../state/store'
import type { ChimeConfig, TubeConfig } from '../state/store'

function createMockTubes(count: number): TubeConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    note: `N${i}`,
    freq: 440 + i * 50,
    length_mm: 300 - i * 15,
  }))
}

describe('v-style mounting geometry', () => {
  it.each([3, 4, 5, 6, 8, 12])(
    'shares the top plate hole on the adjacent sides of tubes for tubeCount=%i',
    (tubeCount) => {
      const config: ChimeConfig = {
        ...DEFAULT_CONFIG,
        tubeCount,
        mountingStyle: 'v-style',
        suspensionRadius_mm: 60,
      }
      const tubes = createMockTubes(tubeCount)
      const ringR = config.suspensionRadius_mm / 1000

      const linePoints = computeStringLinePoints(config, tubes)
      // Each tube in v-style has 2 lines (Line 1: Prev shared hole -> M1, Line 2: Next shared hole -> M2)
      // Each line has 2 vertices (6 floats) -> 12 floats per tube
      expect(linePoints.length).toBe(tubeCount * 12)

      const topPlateHolesUsedByRightSide: [number, number, number][] = []
      const topPlateHolesUsedByLeftSide: [number, number, number][] = []

      for (let i = 0; i < tubeCount; i++) {
        const offset = i * 12
        // Line 1: [hPrevX, 0, hPrevZ] -> [m1x, -suspY, m1z]
        const hPrev = [linePoints[offset], linePoints[offset + 1], linePoints[offset + 2]] as const
        // Line 2: [hNextX, 0, hNextZ] -> [m2x, -suspY, m2z]
        const hNext = [linePoints[offset + 6], linePoints[offset + 7], linePoints[offset + 8]] as const

        topPlateHolesUsedByLeftSide.push([...hPrev])
        topPlateHolesUsedByRightSide.push([...hNext])

        // Y of top plate holes must be 0
        expect(hPrev[1]).toBe(0)
        expect(hNext[1]).toBe(0)

        // Radial distance of the hole from center must be exactly ringR
        const rPrev = Math.hypot(hPrev[0], hPrev[2])
        const rNext = Math.hypot(hNext[0], hNext[2])
        expect(rPrev).toBeCloseTo(ringR, 6)
        expect(rNext).toBeCloseTo(ringR, 6)
      }

      // Check the shared side:
      // For tube i, the line on its shared side facing tube (i+1)%N is its Line 2 (hNext).
      // For tube (i+1)%N, the line on its shared side facing tube i is its Line 1 (hPrev).
      // They MUST run into the EXACT SAME hole in the top plate!
      for (let i = 0; i < tubeCount; i++) {
        const nextIdx = (i + 1) % tubeCount
        const rightHoleOfCurrentTube = topPlateHolesUsedByRightSide[i]
        const leftHoleOfNextTube = topPlateHolesUsedByLeftSide[nextIdx]

        expect(rightHoleOfCurrentTube[0]).toBeCloseTo(leftHoleOfNextTube[0], 6)
        expect(rightHoleOfCurrentTube[1]).toBeCloseTo(leftHoleOfNextTube[1], 6)
        expect(rightHoleOfCurrentTube[2]).toBeCloseTo(leftHoleOfNextTube[2], 6)

        // It must also match getVStyleHolePosition
        const expectedHole = getVStyleHolePosition(i, tubeCount, ringR)
        expect(rightHoleOfCurrentTube[0]).toBeCloseTo(expectedHole[0], 6)
        expect(rightHoleOfCurrentTube[2]).toBeCloseTo(expectedHole[2], 6)
      }

      // Verify that there are exactly N distinct top plate holes used, not 2*N
      const uniqueHoles = new Set(
        topPlateHolesUsedByRightSide.map((p) => `${p[0].toFixed(5)},${p[2].toFixed(5)}`)
      )
      expect(uniqueHoles.size).toBe(tubeCount)
    }
  )

  it('generates matching grommets on the top plate for v-style', () => {
    const tubeCount = 6
    const ringR = 0.055
    const grommets = computeGrommetPositions(tubeCount, ringR, 'v-style')

    // N shared holes + 1 central striker hole
    expect(grommets.length).toBe(tubeCount + 1)

    // Center striker hole
    const centerGrommet = grommets[grommets.length - 1]
    expect(centerGrommet).toEqual([0, 0.0005, 0])

    // Verify all tube grommets match the shared hole angles
    for (let i = 0; i < tubeCount; i++) {
      const g = grommets[i]
      const expected = getVStyleHolePosition(i, tubeCount, ringR)
      expect(g[0]).toBeCloseTo(expected[0], 6)
      expect(g[1]).toBe(0.0005)
      expect(g[2]).toBeCloseTo(expected[2], 6)
    }
  })

  it('supports center mounting style without error', () => {
    const config: ChimeConfig = {
      ...DEFAULT_CONFIG,
      tubeCount: 5,
      mountingStyle: 'center',
    }
    const tubes = createMockTubes(5)
    const linePoints = computeStringLinePoints(config, tubes)
    // 1 line per tube = 6 floats per tube
    expect(linePoints.length).toBe(5 * 6)
  })

  it('supports bridge mounting style without error', () => {
    const config: ChimeConfig = {
      ...DEFAULT_CONFIG,
      tubeCount: 6,
      mountingStyle: 'bridge',
    }
    const tubes = createMockTubes(6)
    const linePoints = computeStringLinePoints(config, tubes)
    // 5 segments per tube = 30 floats per tube
    expect(linePoints.length).toBe(6 * 30)
  })
})
