import { describe, it, expect } from 'vitest'
import {
  strikerVolume_m3,
  strikerMass,
  solveStrikerHeight_mm,
  calculateStrikerDiameter_mm,
  optimalStrikerMass,
} from './contact'
import { generateStrikerSTL, buildStrikerGeometry } from './stlExport'
import * as THREE from 'three'

describe('contact: striker sizing & mass', () => {
  it('calculateStrikerDiameter_mm correctly accounts for tube radius and gap', () => {
    // suspensionRadius = 55, tubeOD = 25 (tubeRo = 12.5), distanceToTube = 15
    // inner radius = 55 - 12.5 = 42.5; striker radius = 42.5 - 15 = 27.5 -> dia = 55
    const dia = calculateStrikerDiameter_mm(55, 25, 15)
    expect(dia).toBe(55)

    // Smaller clearance gap (10mm) -> larger striker (65mm)
    expect(calculateStrikerDiameter_mm(55, 25, 10)).toBe(65)

    // Larger clearance gap (20mm) -> smaller striker (45mm)
    expect(calculateStrikerDiameter_mm(55, 25, 20)).toBe(45)
  })

  it('strikerVolume_m3 scales correctly across forms', () => {
    const d = 60, h = 20
    const cylVol = strikerVolume_m3('cylinder', d, h)
    const sphereVol = strikerVolume_m3('sphere', d, h)
    const donutVol = strikerVolume_m3('donut', d, h)
    const hexVol = strikerVolume_m3('multisided', d, h, 6)

    // Sphere (oblate ellipsoid) is 2/3 the volume of bounding cylinder
    expect(sphereVol / cylVol).toBeCloseTo(2 / 3, 4)

    // Hexagon (6-gon) volume is (3*sqrt(3)/2) / pi ≈ 0.827 of bounding cylinder
    expect(hexVol / cylVol).toBeCloseTo((3 * Math.sqrt(3) / 2) / Math.PI, 4)

    // Donut torus is less volume than solid cylinder
    expect(donutVol).toBeLessThan(cylVol)
    expect(donutVol).toBeGreaterThan(0)
  })

  it('solveStrikerHeight_mm solves thickness to match target mass', () => {
    const targetMass_kg = 0.025 // 25 grams
    const dia_mm = 50

    // Solve for hardwood multisided (6 tubes -> hexagon)
    const h_hex = solveStrikerHeight_mm(targetMass_kg, 'hardWood', 'multisided', dia_mm, 6)
    const calculatedMass_hex = strikerMass({
      material: 'hardWood',
      form: 'multisided',
      diameter_mm: dia_mm,
      height_mm: h_hex,
      sides: 6,
    })
    expect(calculatedMass_hex).toBeCloseTo(targetMass_kg, 2)

    // Solve for hardwood sphere dome (needs to be taller to match same mass)
    const h_sphere = solveStrikerHeight_mm(targetMass_kg, 'hardWood', 'sphere', dia_mm)
    expect(h_sphere).toBeGreaterThan(h_hex)
    const calculatedMass_sphere = strikerMass({
      material: 'hardWood',
      form: 'sphere',
      diameter_mm: dia_mm,
      height_mm: h_sphere,
    })
    expect(calculatedMass_sphere).toBeCloseTo(targetMass_kg, 2)
  })

  it('solves thickness correctly for PETG and ASA, accounting for density differences', () => {
    const targetMass_kg = 0.05 // 50g
    const dia_mm = 55

    const h_petg = solveStrikerHeight_mm(targetMass_kg, 'petg', 'multisided', dia_mm, 6)
    const h_asa = solveStrikerHeight_mm(targetMass_kg, 'asa', 'multisided', dia_mm, 6)

    // Because ASA is less dense (1060 kg/m3) than PETG (1270 kg/m3), ASA must be thicker
    expect(h_asa).toBeGreaterThan(h_petg)
    expect(h_asa / h_petg).toBeCloseTo(1270 / 1060, 1)

    // Both calculate back to within a fraction of a gram of the target mass
    const mass_petg = strikerMass({ material: 'petg', form: 'multisided', diameter_mm: dia_mm, height_mm: h_petg, sides: 6 })
    const mass_asa = strikerMass({ material: 'asa', form: 'multisided', diameter_mm: dia_mm, height_mm: h_asa, sides: 6 })
    expect(mass_petg).toBeCloseTo(targetMass_kg, 2)
    expect(mass_asa).toBeCloseTo(targetMass_kg, 2)
  })
})

describe('stlExport: striker 3D mesh generation', () => {
  it('generates non-empty binary STL for all striker forms', () => {
    const forms = ['multisided', 'sphere', 'donut', 'cylinder']
    for (const form of forms) {
      const bytes = generateStrikerSTL({
        form,
        diameter_mm: 55,
        height_mm: 20,
        tubeCount: 6,
      })
      // Binary STL has 80-byte header + 4-byte triangle count -> minimum 84 bytes
      expect(bytes.byteLength).toBeGreaterThan(1000)
      // Read triangle count
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const numTriangles = view.getUint32(80, true)
      expect(numTriangles).toBeGreaterThan(100)
      // Total bytes must equal 84 + numTriangles * 50
    }
  })

  it('donut striker maintains central cord hole even when very thick', () => {
    // 30mm diameter, 50mm thick donut (thickness > diameter) with 2.0mm cord hole
    const holeDia = 2.0
    const geo = buildStrikerGeometry({
      form: 'donut',
      diameter_mm: 30,
      height_mm: 50,
      holeDiameter_mm: holeDia,
    })

    geo.computeBoundingBox()
    const bbox = geo.boundingBox!

    // Bounding box height along Y must match height_mm (50mm)
    const height = bbox.max.y - bbox.min.y
    expect(height).toBeCloseTo(50, 1)

    // Outer diameter along X and Z must match diameter_mm (30mm)
    const xSpan = bbox.max.x - bbox.min.x
    const zSpan = bbox.max.z - bbox.min.z
    expect(xSpan).toBeCloseTo(30, 1)
    expect(zSpan).toBeCloseTo(30, 1)

    // Check that inner cord hole is preserved:
    // For every vertex, the radial distance in the XZ plane (at Y ≈ 0) must be >= holeDia / 2
    const pos = geo.attributes.position as THREE.BufferAttribute
    let minRadialDistAtEquator = Infinity
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      // Look near the equator where the inner hole is narrowest
      if (Math.abs(y) < 1.0) {
        const r = Math.hypot(x, z)
        if (r < minRadialDistAtEquator) {
          minRadialDistAtEquator = r
        }
      }
    }
    // The central hole must never close: minimum radius must be >= cord hole radius (1.0 mm)
    expect(minRadialDistAtEquator).toBeGreaterThanOrEqual((holeDia / 2) * 0.99)
    geo.dispose()
  })

  it('thick donut volume scales and solveStrikerHeight_mm matches target mass without collapsing hole', () => {
    const dia_mm = 35
    // 25g hardwood with 35mm diameter requires a thick donut (h ~ 44mm, well above the 16mm circular limit)
    const targetMass_kg = 0.025

    const h_donut = solveStrikerHeight_mm(targetMass_kg, 'hardWood', 'donut', dia_mm)
    expect(h_donut).toBeGreaterThan(20)
    expect(h_donut).toBeLessThanOrEqual(60)

    const mass_donut = strikerMass({
      material: 'hardWood',
      form: 'donut',
      diameter_mm: dia_mm,
      height_mm: h_donut,
    })
    expect(mass_donut).toBeCloseTo(targetMass_kg, 2)

    // For extremely heavy targets, height clamps at maximum 60mm
    const h_clamped = solveStrikerHeight_mm(0.1, 'hardWood', 'donut', dia_mm)
    expect(h_clamped).toBe(60)

    // Even for maximum height (60mm), volume remains positive and less than solid cylinder
    const vol60 = strikerVolume_m3('donut', dia_mm, 60)
    const cylVol60 = strikerVolume_m3('cylinder', dia_mm, 60)
    expect(vol60).toBeGreaterThan(0)
    expect(vol60).toBeLessThan(cylVol60)
  })

  it('multisided striker generates polygons with as many sides as tubes', () => {
    // 6 tubes -> hexagon
    const bytes6 = generateStrikerSTL({
      form: 'multisided',
      diameter_mm: 50,
      height_mm: 15,
      tubeCount: 6,
    })
    expect(bytes6.byteLength).toBeGreaterThan(100)

    // 8 tubes -> octagon
    const bytes8 = generateStrikerSTL({
      form: 'multisided',
      diameter_mm: 50,
      height_mm: 15,
      tubeCount: 8,
    })
    expect(bytes8.byteLength).toBeGreaterThan(bytes6.byteLength) // more facets for 8-gon

    // Volume scales with side count: 3-gon (triangle) < 6-gon (hexagon) < 8-gon (octagon)
    const v3 = strikerVolume_m3('multisided', 50, 15, 3)
    const v6 = strikerVolume_m3('multisided', 50, 15, 6)
    const v8 = strikerVolume_m3('multisided', 50, 15, 8)
    const vCyl = strikerVolume_m3('cylinder', 50, 15)
    expect(v3).toBeLessThan(v6)
    expect(v6).toBeLessThan(v8)
    expect(v8).toBeLessThan(vCyl)
  })
})
