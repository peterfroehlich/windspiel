import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildTubeMountGeometry, calculateTubeMountDimensions, generateTubeMountSTL, type TubeMountSTLOptions } from './stlExport'

const options: TubeMountSTLOptions = {
  mountType: 'one-part', tubeOuterDiameter_mm: 15, tubeHoleDiameter_mm: 4,
}

function contains(geometry: THREE.BufferGeometry, point: [number, number, number]) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  const ray = new THREE.Raycaster(new THREE.Vector3(...point), new THREE.Vector3(0.231, 0.512, 0.827).normalize())
  const distances = ray.intersectObject(mesh).map(hit => hit.distance)
  const unique = distances.filter((value, i) => i === 0 || Math.abs(value - distances[i - 1]) > 1e-5)
  mesh.material.dispose()
  return unique.length % 2 === 1
}

function expectClosedMesh(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position')
  const edges = new Map<string, number>()
  const directions = new Map<string, number>()
  const key = (i: number) => [positions.getX(i), positions.getY(i), positions.getZ(i)].map(n => String(Math.round(n * 1e6))).join(',')
  for (let i = 0; i < positions.count; i += 3) {
    const vertices = [key(i), key(i + 1), key(i + 2)]
    for (let j = 0; j < 3; j++) {
      const edge = [vertices[j], vertices[(j + 1) % 3]].sort().join('|')
      edges.set(edge, (edges.get(edge) ?? 0) + 1)
      const direction = vertices[j] < vertices[(j + 1) % 3] ? 1 : -1
      directions.set(edge, (directions.get(edge) ?? 0) + direction)
    }
  }
  expect([...edges.entries()].filter(([, count]) => count !== 2)).toEqual([])
  expect([...directions.values()].filter(sum => sum !== 0)).toHaveLength(0)
}

describe('One-Part rod from supplied SCAD', () => {
  it('matches the reference dimensions and 0.1 mm shaft clearance', () => {
    const d = calculateTubeMountDimensions(options)
    expect(d.rodDiameter).toBe(3.9)
    expect(d.flangeDiameter).toBe(5)
    expect(d.flangeThickness).toBe(1)
    expect(d.cordHoleDia).toBe(1)
    expect(d.cordHolePosFromFlange).toBe(15.3)
    expect(d.totalAssembledLength).toBe(17)
  })

  it('preserves the transverse hole, relief grooves and longitudinal key slot', () => {
    const rod = buildTubeMountGeometry({ ...options, part: 'rod' })
    expect(contains(rod, [0, 0, 0.5])).toBe(true)
    expect(contains(rod, [0, 0, 4])).toBe(true)
    expect(contains(rod, [0, 0, 16.3])).toBe(false)
    expect(contains(rod, [0, 0.9, 16.3])).toBe(true)
    expect(contains(rod, [0, 0.8, 8])).toBe(false)
    expect(contains(rod, [1.5, 0, 8])).toBe(false)
    expect(contains(rod, [1.5, 0, 13])).toBe(false)
    expect(contains(rod, [-1.5, 0, 13])).toBe(true)
    rod.dispose()
  })

  it('cuts a keyed opening into the separate 1 mm cap', () => {
    const cap = buildTubeMountGeometry({ ...options, part: 'end-cap' })
    expect(contains(cap, [0, 0, 0.5])).toBe(false)
    expect(contains(cap, [2.2, 0, 0.5])).toBe(true)
    expect(contains(cap, [1.5, 0, 0.5])).toBe(true)
    expect(contains(cap, [-1.5, 0, 0.5])).toBe(false)
    cap.dispose()
  })

  it.each(['rod', 'end-cap', 'both'] as const)('exports a closed %s mesh and valid binary STL', part => {
    const geometry = buildTubeMountGeometry({ ...options, part })
    geometry.computeBoundingBox()
    const bounds = geometry.boundingBox!
    expect(bounds.min.z).toBeCloseTo(0, 3)
    expect(bounds.max.z).toBeCloseTo(part === 'end-cap' ? 1 : 17, 3)
    expect(bounds.min.x).toBeCloseTo(-2.5, 3)
    expect(bounds.max.x).toBeCloseTo(part === 'both' ? 10.5 : 2.5, 3)
    expectClosedMesh(geometry)
    const bytes = generateTubeMountSTL({ ...options, part })
    const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true)
    expect(count).toBeGreaterThan(100)
    expect(bytes.length).toBe(84 + count * 50)
    geometry.dispose()
  })

  it.each([
    [10, 2.5, 0.8], [30, 5, 1.8], [60, 10, 2.5],
  ])('keeps closed meshes for tube Ø %s, hole Ø %s, cord Ø %s', (tube, hole, cord) => {
    for (const part of ['rod', 'end-cap'] as const) {
      const geometry = buildTubeMountGeometry({ ...options, tubeOuterDiameter_mm: tube, tubeHoleDiameter_mm: hole, cordHoleDiameter_mm: cord, part })
      expectClosedMesh(geometry)
      geometry.dispose()
    }
  })

  it('scales pipe length and hole diameter for the selected tube', () => {
    const geometry = buildTubeMountGeometry({ ...options, tubeOuterDiameter_mm: 30, tubeHoleDiameter_mm: 5, part: 'rod' })
    geometry.computeBoundingBox()
    expect(geometry.boundingBox!.max.z).toBeCloseTo(32, 3)
    expect(geometry.boundingBox!.max.x).toBeCloseTo(3, 3)
    geometry.dispose()
  })
})
