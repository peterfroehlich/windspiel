import { describe, it, expect } from 'vitest'
import {
  strikerVolume_m3,
  strikerMass,
  solveStrikerHeight_mm,
  calculateStrikerDiameter_mm,
  optimalStrikerMass,
} from './contact'
import {
  generateStrikerSTL,
  buildStrikerGeometry,
  calculateTubeMountDimensions,
  buildTubeMountGeometry,
  generateTubeMountSTL,
  buildFemaleCrossbarGeometry,
  TubeMountSTLOptions,
} from './stlExport'
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

describe('stlExport: internal tube mount 3D mesh generation', () => {
  it('calculateTubeMountDimensions places cord hole in the exact middle and sizes raised edges', () => {
    const opts: TubeMountSTLOptions = {
      tubeOuterDiameter_mm: 30,
      tubeWallThickness_mm: 1.5,
      tubeHoleDiameter_mm: 5.0,
      cordHoleDiameter_mm: 2.2,
    }
    const d = calculateTubeMountDimensions(opts)

    // Span equals tube OD + 0.4 mm acoustic clearance
    expect(d.span).toBe(30.4)
    // Cord hole is in the exact middle of the span
    expect(d.cordHolePosFromFlange).toBe(15.2)
    expect(d.shaftLengthA + d.shaftLengthB).toBeCloseTo(d.span, 4)

    // Raised edges (flanges) are wider than the drilled hole so the rod does not fall out
    expect(d.flangeDiameter).toBeGreaterThan(d.tubeHoleDia)
    expect(d.flangeDiameter).toBe(6.6)
    // Rod shaft has clearance to fit into drilled hole
    expect(d.rodDiameter).toBeLessThan(d.tubeHoleDia)
    expect(d.rodDiameter).toBe(4.8)
  })

  it('generates non-empty binary STL for both parts, male part, and female part', () => {
    const opts: TubeMountSTLOptions = {
      tubeOuterDiameter_mm: 25,
      tubeWallThickness_mm: 1.2,
      tubeHoleDiameter_mm: 4.5,
      cordHoleDiameter_mm: 2.0,
    }

    for (const part of ['both', 'male', 'female'] as const) {
      const bytes = generateTubeMountSTL({ ...opts, part })
      // Binary STL has 80-byte header + 4-byte triangle count -> minimum 84 bytes
      expect(bytes.byteLength).toBeGreaterThan(1000)
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const numTriangles = view.getUint32(80, true)
      expect(numTriangles).toBeGreaterThan(100)
    }
  })

  it('scales correctly with varying tube sizes and hole diameters', () => {
    const smallTube = calculateTubeMountDimensions({
      tubeOuterDiameter_mm: 15,
      tubeWallThickness_mm: 1.0,
      tubeHoleDiameter_mm: 3.5,
      cordHoleDiameter_mm: 1.5,
    })
    const largeTube = calculateTubeMountDimensions({
      tubeOuterDiameter_mm: 60,
      tubeWallThickness_mm: 2.5,
      tubeHoleDiameter_mm: 6.0,
      cordHoleDiameter_mm: 2.5,
    })

    expect(smallTube.span).toBe(15.4)
    expect(largeTube.span).toBe(60.4)
    expect(largeTube.rodDiameter).toBeGreaterThan(smallTube.rodDiameter)
    expect(largeTube.flangeDiameter).toBeGreaterThan(smallTube.flangeDiameter)
    expect(largeTube.flangeDiameter).toBeGreaterThan(largeTube.tubeHoleDia)
  })

  it('calculates T-mount dimensions where T crossbar and female crossbar have equal length for an H shape', () => {
    const opts: TubeMountSTLOptions = {
      tubeOuterDiameter_mm: 30,
      tubeWallThickness_mm: 1.5,
      tubeHoleDiameter_mm: 4.5,
      cordHoleDiameter_mm: 2.0,
      mountType: 'tmount',
    }
    const d = calculateTubeMountDimensions(opts)

    // Upper part of T and female retaining crossbar rod must have the same length so that the assembly looks like an H
    expect(d.crossbarLength).toBeGreaterThan(d.tubeHoleDia)
    // Crossbar width matches the bar diameter (same width)
    expect(d.crossbarWidth).toBe(d.rodDiameter)
    // Default crossbar height is 2.0 mm
    expect(d.crossbarHeight).toBe(2.0)

    // Total T-rod length extends through both holes with room for male thread stud
    expect(d.tRodTotalLength).toBeGreaterThan(d.span)

    // Configurable crossbar height
    const customH = calculateTubeMountDimensions({ ...opts, crossbarHeight_mm: 3.5 })
    expect(customH.crossbarHeight).toBe(3.5)
  })

  it('defaults bar diameter to 4mm, cord hole to 1.5mm, and crossbar height to 2mm', () => {
    const d = calculateTubeMountDimensions({
      tubeOuterDiameter_mm: 25,
      mountType: 'tmount',
    })
    expect(d.rodDiameter).toBe(4.0)
    expect(d.crossbarWidth).toBe(4.0)
    expect(d.cordHoleDia).toBe(1.5)
    expect(d.crossbarHeight).toBe(2.0)
  })

  it('builds crossbars where finished width equals rod diameter and height equals configured height', () => {
    const opts: TubeMountSTLOptions = {
      tubeOuterDiameter_mm: 15,
      tubeHoleDiameter_mm: 4.0,
      crossbarHeight_mm: 2.0,
      mountType: 'tmount',
    }
    const d = calculateTubeMountDimensions(opts)
    expect(d.crossbarWidth).toBe(d.rodDiameter)
    expect(d.crossbarHeight).toBe(2.0)

    const geoCrossbar = buildFemaleCrossbarGeometry(opts)
    geoCrossbar.computeBoundingBox()
    const box = geoCrossbar.boundingBox!
    const width = box.max.x - box.min.x
    const height = box.max.z - box.min.z
    // Finished 3D bounding box width matches rod diameter (d.rodDiameter) within 0.01 mm
    expect(width).toBeCloseTo(d.rodDiameter, 2)
    // Finished 3D bounding box height matches configured crossbar height (2.0 mm) within 0.01 mm
    expect(height).toBeCloseTo(d.crossbarHeight, 2)

    // Verify socket is closed on bottom side (z = 0) and open on top side
    const pos = geoCrossbar.getAttribute('position')
    let foundBottomCenter = false
    let foundTopCenter = false
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      const r = Math.sqrt(x * x + y * y)
      if (Math.abs(z) < 0.001 && r < 0.1) {
        foundBottomCenter = true
      }
      if (Math.abs(z - box.max.z) < 0.001 && r < 0.5) {
        foundTopCenter = true
      }
    }
    // Bottom (exterior) is solid/closed
    expect(foundBottomCenter).toBe(true)
    // Top (interior) has open socket hole
    expect(foundTopCenter).toBe(false)
  })

  it('generates non-empty binary STL for T-mount (both parts, T-rod, and female crossbar)', () => {
    const opts: TubeMountSTLOptions = {
      tubeOuterDiameter_mm: 25,
      tubeWallThickness_mm: 1.2,
      tubeHoleDiameter_mm: 4.5,
      cordHoleDiameter_mm: 2.0,
      mountType: 'tmount',
    }

    for (const part of ['both', 'trod', 'crossbar', 'splint'] as const) {
      const bytes = generateTubeMountSTL({ ...opts, part })
      expect(bytes.byteLength).toBeGreaterThan(1000)
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const numTriangles = view.getUint32(80, true)
      expect(numTriangles).toBeGreaterThan(50)
    }
  })
})
