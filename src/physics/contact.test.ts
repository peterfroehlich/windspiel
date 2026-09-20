import { describe, it, expect } from 'vitest'
import {
  strikerVolume_m3,
  strikerMass,
  solveStrikerHeight_mm,
  calculateStrikerDiameter_mm,
  optimalStrikerMass,
} from './contact'
import { generateStrikerSTL } from './stlExport'

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
    const discVol = strikerVolume_m3('disc', d, h)
    const sphereVol = strikerVolume_m3('sphere', d, h)
    const donutVol = strikerVolume_m3('donut', d, h)

    // Sphere (oblate ellipsoid) is 2/3 the volume of bounding cylinder
    expect(sphereVol / discVol).toBeCloseTo(2 / 3, 4)

    // Donut torus is less volume than solid cylinder
    expect(donutVol).toBeLessThan(discVol)
    expect(donutVol).toBeGreaterThan(0)
  })

  it('solveStrikerHeight_mm solves thickness to match target mass', () => {
    const targetMass_kg = 0.025 // 25 grams
    const dia_mm = 50

    // Solve for hardwood disc
    const h_disc = solveStrikerHeight_mm(targetMass_kg, 'hardWood', 'disc', dia_mm)
    const calculatedMass_disc = strikerMass({
      material: 'hardWood',
      form: 'disc',
      diameter_mm: dia_mm,
      height_mm: h_disc,
    })
    expect(calculatedMass_disc).toBeCloseTo(targetMass_kg, 2)

    // Solve for hardwood sphere dome (needs to be ~1.5x taller to match same mass)
    const h_sphere = solveStrikerHeight_mm(targetMass_kg, 'hardWood', 'sphere', dia_mm)
    expect(h_sphere).toBeGreaterThan(h_disc)
    const calculatedMass_sphere = strikerMass({
      material: 'hardWood',
      form: 'sphere',
      diameter_mm: dia_mm,
      height_mm: h_sphere,
    })
    expect(calculatedMass_sphere).toBeCloseTo(targetMass_kg, 2)
  })
})

describe('stlExport: striker 3D mesh generation', () => {
  it('generates non-empty binary STL for all striker forms', () => {
    const forms = ['disc', 'sphere', 'donut', 'cylinder']
    for (const form of forms) {
      const bytes = generateStrikerSTL({
        form,
        diameter_mm: 55,
        height_mm: 20,
        holeDiameter_mm: 3.5,
      })
      // Binary STL has 80-byte header + 4-byte triangle count -> minimum 84 bytes
      expect(bytes.byteLength).toBeGreaterThan(1000)
      // Read triangle count
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const numTriangles = view.getUint32(80, true)
      expect(numTriangles).toBeGreaterThan(100)
      // Total bytes must equal 84 + numTriangles * 50
      expect(bytes.byteLength).toBe(84 + numTriangles * 50)
    }
  })
})
