import type { ChimeConfig, TubeConfig, MountingStyle } from '../state/store'
import { tubeMountingPosition, tubeGeometry } from '../state/store'

/**
 * Returns the position [x, y, z] of the shared top plate hole between tube i and tube (i + 1) % tubeCount.
 */
export function getVStyleHolePosition(
  holeIndex: number,
  tubeCount: number,
  ringR: number
): [number, number, number] {
  const a = ((holeIndex + 0.5) / tubeCount) * Math.PI * 2
  return [Math.cos(a) * ringR, 0, Math.sin(a) * ringR]
}

/**
 * Computes all grommet positions on the top plate.
 * For v-style, holes are shared between adjacent tubes (midpoint angles).
 * For center and bridge styles, holes are directly above each tube.
 * In all styles, a central hole is included for the striker cord.
 */
export function computeGrommetPositions(
  tubeCount: number,
  ringR: number,
  style: MountingStyle
): [number, number, number][] {
  const pts: [number, number, number][] = []
  if (style === 'v-style') {
    // One shared hole between each adjacent pair of tubes at the midpoint angle
    for (let i = 0; i < tubeCount; i++) {
      const a = ((i + 0.5) / tubeCount) * Math.PI * 2
      pts.push([Math.cos(a) * ringR, 0.0005, Math.sin(a) * ringR])
    }
  } else {
    for (let i = 0; i < tubeCount; i++) {
      const a = (i / tubeCount) * Math.PI * 2
      pts.push([Math.cos(a) * ringR, 0.0005, Math.sin(a) * ringR])
    }
  }
  // Striker central cord hole
  pts.push([0, 0.0005, 0])
  return pts
}

/**
 * Computes line segments (pairs of [x, y, z] vertices) for the chime suspension cords.
 */
export function computeStringLinePoints(
  config: ChimeConfig,
  tubes: TubeConfig[]
): Float32Array {
  const tubeCount = config.tubeCount
  const ringR = config.suspensionRadius_mm / 1000
  const style = config.mountingStyle ?? 'center'
  const pts: number[] = []

  for (let i = 0; i < tubeCount; i++) {
    const a = (i / tubeCount) * Math.PI * 2
    const x = Math.cos(a) * ringR, z = Math.sin(a) * ringR
    const tx = -Math.sin(a), tz = Math.cos(a)
    const mount = tubeMountingPosition(config, tubes, i)
    const topY = mount.top_mm / 1000
    const suspY = mount.susp_mm / 1000
    const geo = tubeGeometry(config, i)
    const radius = geo.Do / 2

    if (style === 'center') {
      // center: a single line running inside the tube, attached to an internal suspension bar
      pts.push(
        x, 0, z,
        x, -suspY, z
      )
    } else if (style === 'v-style') {
      // V-style: two lines from every tube run up to shared holes on the top plate.
      // Between tube i and its neighbors, the lines on the shared side meet in the SAME hole
      // at the midpoint angle between the two tubes, forming a continuous triangulated V suspension.
      const hPrevX = Math.cos(a - Math.PI / tubeCount) * ringR
      const hPrevZ = Math.sin(a - Math.PI / tubeCount) * ringR
      const hNextX = Math.cos(a + Math.PI / tubeCount) * ringR
      const hNextZ = Math.sin(a + Math.PI / tubeCount) * ringR

      // Tube mounting points at node holes
      const m1x = x - tx * radius, m1z = z - tz * radius
      const m2x = x + tx * radius, m2z = z + tz * radius

      // Line to previous shared hole: H_prev -> M1
      pts.push(hPrevX, 0, hPrevZ, m1x, -suspY, m1z)
      // Line to next shared hole: H_next -> M2
      pts.push(hNextX, 0, hNextZ, m2x, -suspY, m2z)
    } else {
      // bridge: A single line from the top plate, splitting at a spreader bar
      // and running together again to the mounting point of the tube
      const ySpread = -(topY >= 0.025 ? Math.max(0.012, topY - 0.016) : topY * 0.55)
      const yApex = Math.min(-0.004, ySpread + 0.007)
      const w = radius + 0.007

      // Spreader ends
      const e1x = x - tx * w, e1z = z - tz * w
      const e2x = x + tx * w, e2z = z + tz * w

      // Tube mounting points
      const m1x = x - tx * radius, m1z = z - tz * radius
      const m2x = x + tx * radius, m2z = z + tz * radius

      // 1. Single line from top plate to apex
      pts.push(x, 0, z, x, yApex, z)
      // 2. Splitting at spreader bar: apex to spreader ends
      pts.push(x, yApex, z, e1x, ySpread, e1z)
      pts.push(x, yApex, z, e2x, ySpread, e2z)
      // 3. Lines from spreader bar ends running together again to tube mounting points
      pts.push(e1x, ySpread, e1z, m1x, -suspY, m1z)
      pts.push(e2x, ySpread, e2z, m2x, -suspY, m2z)
    }
  }

  return new Float32Array(pts)
}
