import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'

export interface StrikerSTLOptions {
  form: string
  diameter_mm: number
  height_mm: number
  material?: string
  holeDiameter_mm?: number // default 2.0mm for chime suspension cord
  tubeCount?: number
}

/**
 * Construct a watertight 3D solid geometry for the striker with a central cord hole.
 */
export function buildStrikerGeometry(options: StrikerSTLOptions): THREE.BufferGeometry {
  const { form, diameter_mm, height_mm, holeDiameter_mm = 2.0 } = options
  const outerR = Math.max(5, diameter_mm / 2)
  const h = Math.max(4, height_mm)
  const holeR = Math.max(1, Math.min(outerR * 0.4, holeDiameter_mm / 2))

  switch (form) {
    case 'multisided': {
      // Regular polygon with as many sides as tubes (e.g. 6 tubes = hexagon)
      const N = Math.max(3, options.tubeCount ?? 6)
      const shape = new THREE.Shape()
      for (let i = 0; i < N; i++) {
        const a = (i + 0.5) * ((Math.PI * 2) / N)
        const px = Math.cos(a) * outerR
        const py = Math.sin(a) * outerR
        if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py)
      }
      shape.closePath()
      const hole = new THREE.Path()
      hole.absarc(0, 0, holeR, 0, Math.PI * 2, true)
      shape.holes.push(hole)
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: h,
        bevelEnabled: true,
        bevelThickness: Math.min(0.8, h * 0.15),
        bevelSize: Math.min(0.8, (outerR - holeR) * 0.06),
        bevelSegments: 2,
      })
      geo.center()
      geo.computeVertexNormals()
      return geo
    }

    case 'sphere': {
      // Oblate spheroid dome with vertical central hole
      const pts: THREE.Vector2[] = []
      const tMin = Math.asin(Math.min(0.9, holeR / outerR))
      const steps = 36
      for (let i = 0; i <= steps; i++) {
        const t = tMin + (Math.PI - 2 * tMin) * (i / steps)
        pts.push(new THREE.Vector2(outerR * Math.sin(t), (h / 2) * Math.cos(t)))
      }
      // Inner hole cylinder wall
      pts.push(new THREE.Vector2(holeR, -(h / 2) * Math.cos(tMin)))
      pts.push(new THREE.Vector2(holeR, (h / 2) * Math.cos(tMin)))
      const geo = new THREE.LatheGeometry(pts, 64)
      geo.computeVertexNormals()
      return geo
    }

    case 'donut': {
      // Torus ring with central cord hole: inner aperture is preserved >= minHoleR
      const minHoleR = Math.max(holeR, 1.0)
      const maxMinor = Math.max(1.0, (outerR - minHoleR) / 2)
      const r_minor = Math.min(h / 2, maxMinor)
      const R_major = outerR - r_minor
      const scaleZ = h / (2 * r_minor)
      const geo = new THREE.TorusGeometry(R_major, r_minor, 32, 64)
      if (Math.abs(scaleZ - 1.0) > 0.001) {
        geo.scale(1, 1, scaleZ)
      }
      geo.rotateX(Math.PI / 2)
      geo.computeVertexNormals()
      return geo
    }

    case 'cylinder':
    default: {
      // Extruded cylinder with central hole and subtle rounded edge bevel
      const shape = new THREE.Shape()
      shape.absarc(0, 0, outerR, 0, Math.PI * 2, false)
      const hole = new THREE.Path()
      hole.absarc(0, 0, holeR, 0, Math.PI * 2, true)
      shape.holes.push(hole)
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: h,
        bevelEnabled: true,
        bevelThickness: Math.min(0.8, h * 0.15),
        bevelSize: Math.min(0.8, (outerR - holeR) * 0.1),
        bevelSegments: 3,
        curveSegments: 64,
      })
      geo.center()
      geo.computeVertexNormals()
      return geo
    }
  }
}

/**
 * Generate binary STL file bytes for the given striker specifications.
 */
export function generateStrikerSTL(options: StrikerSTLOptions): Uint8Array {
  const geo = buildStrikerGeometry(options)
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial())
  const exporter = new STLExporter()
  const result = exporter.parse(mesh, { binary: true })
  geo.dispose()

  if (result instanceof ArrayBuffer) {
    return new Uint8Array(result)
  }
  if (result instanceof DataView) {
    return new Uint8Array(result.buffer, result.byteOffset, result.byteLength)
  }
  return new TextEncoder().encode(result as string)
}

/**
 * Trigger download of the striker design as a 3D-printable STL file.
 */
export function downloadStrikerSTL(options: StrikerSTLOptions): void {
  const bytes = generateStrikerSTL(options)
  const matName = (options.material ?? 'striker').toLowerCase()
  const formName = options.form.toLowerCase()
  const dia = options.diameter_mm.toFixed(0)
  const height = options.height_mm.toFixed(0)
  const filename = `windspiel-striker-${matName}-${formName}-${dia}x${height}mm.stl`

  const blob = new Blob([bytes as unknown as BlobPart], { type: 'model/stl' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
