import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'

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
 * Helper to download binary STL data with a guaranteed filename and extension.
 * Uses a File instance with application/octet-stream and MouseEvent dispatch so Chrome/Chromium
 * does not discard the filename in favor of the internal blob UUID.
 */
export function triggerFileDownload(bytes: Uint8Array, filename: string): void {
  // Use File if available so browsers retain the filename and .stl extension
  const parts: BlobPart[] = [bytes as unknown as BlobPart]
  const file = typeof File !== 'undefined'
    ? new File(parts, filename, { type: 'application/octet-stream' })
    : new Blob(parts, { type: 'application/octet-stream' })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.setAttribute('download', filename)
  link.style.display = 'none'
  document.body.appendChild(link)
  link.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
    })
  )
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
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

  triggerFileDownload(bytes, filename)
}

/* ───────────────────────── Internal Tube Mount ───────────────────────── */

export interface TubeMountSTLOptions {
  tubeOuterDiameter_mm: number
  tubeWallThickness_mm?: number
  tubeHoleDiameter_mm?: number
  barDiameter_mm?: number
  cordHoleDiameter_mm?: number
  crossbarHeight_mm?: number
  threadClearance_mm?: number
  part?: 'both' | 'male' | 'female' | 'trod' | 'crossbar' | 'splint'
  mountType?: 'threaded' | 'tmount'
  tubeIndex?: number
}

export interface TubeMountDimensions {
  tubeOD: number
  wall: number
  tubeID: number
  tubeHoleDia: number
  cordHoleDia: number
  clearance: number
  rodDiameter: number
  flangeDiameter: number
  flangeThickness: number
  span: number
  cordHolePosFromFlange: number
  shaftLengthA: number
  shaftLengthB: number
  shoulderPastCenter: number
  threadMajorDia: number
  threadMinorDia: number
  pitch: number
  threadLength: number
  totalAssembledLength: number

  // T-Mount specific dimensions
  crossbarLength: number
  crossbarWidth: number
  crossbarHeight: number
  slotWidth: number
  slotHeight: number
  splintLength: number
  splintWidth: number
  splintThickness: number
  tRodTotalLength: number
  tThreadMajorDia: number
  tThreadMinorDia: number
  tThreadPitch: number
  tThreadLength: number
}

/**
 * Calculate all mechanical dimensions for the 2-part internal tube mount
 * based on tube outer diameter, wall thickness, and bar/hole dimensions.
 */
export function calculateTubeMountDimensions(options: TubeMountSTLOptions): TubeMountDimensions {
  const tubeOD = Math.max(10, options.tubeOuterDiameter_mm)
  const wall = Math.max(0.4, options.tubeWallThickness_mm ?? 1.2)
  const tubeID = Math.max(6, tubeOD - 2 * wall)

  const isTMount = options.mountType === 'tmount'
  const tubeHoleDia = Math.max(
    2.5,
    Math.min(
      tubeOD * 0.4,
      options.tubeHoleDiameter_mm ?? (options.barDiameter_mm ? (isTMount ? options.barDiameter_mm : options.barDiameter_mm + 0.2) : 4.0)
    )
  )

  // Default bar diameter is 4.0 mm
  const rodDiameter = Math.max(
    2.0,
    options.barDiameter_mm ?? (isTMount ? (options.tubeHoleDiameter_mm ?? 4.0) : Math.max(2.2, tubeHoleDia - 0.2))
  )

  // Hanging cord hole diameter: default 1.5 mm
  const cordHoleDia = Math.max(
    0.8,
    Math.min(rodDiameter * 0.75, options.cordHoleDiameter_mm ?? 1.5)
  )
  const clearance = Math.max(0.15, options.threadClearance_mm ?? 0.2)

  // Raised edges (flanges) are wider than the drilled hole so the rod cannot slide out
  const flangeDiameter = tubeHoleDia + 1.6
  const flangeThickness = 1.5

  // Span between flanges = tube outer diameter + 0.4 mm acoustic clearance
  const span = tubeOD + 0.4
  // Exact middle of the span where the hanging cord hole sits
  const cordHolePosFromFlange = span / 2

  // Part A holds the central hole and extends slightly past center to start the male thread
  const shoulderPastCenter = Math.max(1.8, cordHoleDia / 2 + 0.8)
  const shaftLengthA = span / 2 + shoulderPastCenter
  const shaftLengthB = span - shaftLengthA

  // Thread sizing scaled to fit inside rod
  const threadMajorDia = Math.max(2.0, rodDiameter - 1.2)
  const threadMinorDia = Math.max(1.4, threadMajorDia - 0.9)
  const pitch = 1.25
  const threadLength = Math.min(8.0, Math.max(3.5, shaftLengthB - 1.5))

  // T-Mount specific calculations:
  // Length: 14 mm or scaled with rod diameter
  const crossbarLength = Math.max(14, Math.round(rodDiameter * 3.5))
  // Crossbar width matches the bar diameter (exact same width)
  const crossbarWidth = rodDiameter
  // Crossbar height: configurable, default 2.0 mm
  const crossbarHeight = Math.max(1.0, options.crossbarHeight_mm ?? 2.0)

  // T-thread sizing adapted to crossbar width & height
  const tThreadMajorDia = Math.max(2.2, Math.min(rodDiameter - 1.3, 2.7))
  const tThreadMinorDia = Math.max(1.6, tThreadMajorDia - 0.7)
  const tThreadPitch = Math.min(0.8, Math.max(0.6, crossbarHeight * 0.35))
  const baseWall = Math.max(0.4, Math.min(0.8, crossbarHeight * 0.2))
  const socketDepth = crossbarHeight - baseWall
  const tThreadLength = Math.max(1.2, socketDepth - 0.2)
  const tRodTotalLength = crossbarHeight + span + tThreadLength

  return {
    tubeOD,
    wall,
    tubeID,
    tubeHoleDia,
    cordHoleDia,
    clearance,
    rodDiameter,
    flangeDiameter,
    flangeThickness,
    span,
    cordHolePosFromFlange,
    shaftLengthA,
    shaftLengthB,
    shoulderPastCenter,
    threadMajorDia,
    threadMinorDia,
    pitch,
    threadLength,
    totalAssembledLength: span + 2 * flangeThickness,
    crossbarLength,
    crossbarWidth,
    crossbarHeight,
    slotWidth: rodDiameter,
    slotHeight: rodDiameter,
    splintLength: crossbarLength,
    splintWidth: crossbarWidth,
    splintThickness: crossbarHeight,
    tRodTotalLength,
    tThreadMajorDia,
    tThreadMinorDia,
    tThreadPitch,
    tThreadLength,
  }
}

function normalizeGeo(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', geo.attributes.position)
  if (geo.attributes.normal) {
    g.setAttribute('normal', geo.attributes.normal)
  } else {
    g.computeVertexNormals()
  }
  if (geo.index) {
    g.setIndex(geo.index)
  } else {
    const count = geo.attributes.position.count
    const idx: number[] = []
    for (let i = 0; i < count; i++) idx.push(i)
    g.setIndex(idx)
  }
  return g
}

/**
 * Generate a true continuous helical male screw thread with pitch and trapezoidal flanks.
 */
function buildParametricMaleThread(
  rMajor: number,
  rMinor: number,
  pitch: number,
  length: number,
  radialSteps = 36,
  heightSteps = 80
): THREE.BufferGeometry {
  const pos: number[] = []
  const indices: number[] = []

  function getRadius(z: number, theta: number): number {
    if (z <= 0 || z >= length) return rMinor
    let taper = 1.0
    const taperLen = pitch * 0.75
    if (z < taperLen) {
      taper = Math.sin((z / taperLen) * (Math.PI / 2))
    } else if (z > length - taperLen) {
      taper = Math.sin(((length - z) / taperLen) * (Math.PI / 2))
    }
    const effMajor = rMinor + (rMajor - rMinor) * taper

    // Continuous right-handed helical phase
    const u = (z / pitch) - (theta / (Math.PI * 2))
    const delta = u - Math.round(u)
    const absD = Math.abs(delta)

    if (absD <= 0.15) {
      return effMajor
    } else if (absD < 0.45) {
      return rMinor + (effMajor - rMinor) * ((0.45 - absD) / 0.30)
    } else {
      return rMinor
    }
  }

  for (let k = 0; k <= heightSteps; k++) {
    const z = (k / heightSteps) * length
    for (let j = 0; j < radialSteps; j++) {
      const theta = (j / radialSteps) * Math.PI * 2
      const r = getRadius(z, theta)
      pos.push(r * Math.cos(theta), r * Math.sin(theta), z)
    }
  }

  for (let k = 0; k < heightSteps; k++) {
    for (let j = 0; j < radialSteps; j++) {
      const nextJ = (j + 1) % radialSteps
      const i0 = k * radialSteps + j
      const i1 = k * radialSteps + nextJ
      const i2 = (k + 1) * radialSteps + nextJ
      const i3 = (k + 1) * radialSteps + j
      indices.push(i0, i1, i2)
      indices.push(i0, i2, i3)
    }
  }

  const centerBot = pos.length / 3
  pos.push(0, 0, 0)
  for (let j = 0; j < radialSteps; j++) {
    const nextJ = (j + 1) % radialSteps
    indices.push(centerBot, nextJ, j)
  }

  const centerTop = pos.length / 3
  pos.push(0, 0, length)
  const topRowStart = heightSteps * radialSteps
  for (let j = 0; j < radialSteps; j++) {
    const nextJ = (j + 1) % radialSteps
    indices.push(centerTop, topRowStart + j, topRowStart + nextJ)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/**
 * Generate a matching continuous internal helical female thread socket.
 */
function buildParametricFemaleThreadSocket(
  rRod: number,
  rMajor: number,
  rMinor: number,
  clearance: number,
  pitch: number,
  totalLen: number,
  socketDepth: number,
  radialSteps = 36,
  heightSteps = 80
): THREE.BufferGeometry {
  const pos: number[] = []
  const indices: number[] = []

  const rFemMaj = rMajor + clearance
  const rFemMin = rMinor + clearance
  const solidLen = Math.max(0.5, totalLen - socketDepth)
  const effDepth = totalLen - solidLen

  function getInnerRadius(zRel: number, theta: number): number {
    if (zRel <= 0 || zRel >= effDepth) return rFemMaj
    let taper = 1.0
    const taperLen = pitch * 0.5
    if (zRel < taperLen) {
      taper = Math.sin((zRel / taperLen) * (Math.PI / 2))
    } else if (zRel > effDepth - taperLen) {
      taper = Math.sin(((effDepth - zRel) / taperLen) * (Math.PI / 2))
    }
    const effMin = rFemMaj - (rFemMaj - rFemMin) * taper

    const u = (zRel / pitch) - (theta / (Math.PI * 2))
    const delta = u - Math.round(u)
    const absD = Math.abs(delta)

    if (absD <= 0.15) {
      return effMin
    } else if (absD < 0.45) {
      return rFemMaj - (rFemMaj - effMin) * ((0.45 - absD) / 0.30)
    } else {
      return rFemMaj
    }
  }

  const outerSteps = heightSteps
  for (let k = 0; k <= outerSteps; k++) {
    const z = (k / outerSteps) * totalLen
    for (let j = 0; j < radialSteps; j++) {
      const theta = (j / radialSteps) * Math.PI * 2
      pos.push(rRod * Math.cos(theta), rRod * Math.sin(theta), z)
    }
  }

  for (let k = 0; k < outerSteps; k++) {
    for (let j = 0; j < radialSteps; j++) {
      const nextJ = (j + 1) % radialSteps
      const i0 = k * radialSteps + j
      const i1 = k * radialSteps + nextJ
      const i2 = (k + 1) * radialSteps + nextJ
      const i3 = (k + 1) * radialSteps + j
      indices.push(i0, i1, i2)
      indices.push(i0, i2, i3)
    }
  }

  const innerStartIdx = pos.length / 3
  const innerSteps = Math.max(20, Math.round(heightSteps * (effDepth / totalLen)))
  for (let k = 0; k <= innerSteps; k++) {
    const zRel = (k / innerSteps) * effDepth
    const z = solidLen + zRel
    for (let j = 0; j < radialSteps; j++) {
      const theta = (j / radialSteps) * Math.PI * 2
      const r = getInnerRadius(zRel, theta)
      pos.push(r * Math.cos(theta), r * Math.sin(theta), z)
    }
  }

  for (let k = 0; k < innerSteps; k++) {
    for (let j = 0; j < radialSteps; j++) {
      const nextJ = (j + 1) % radialSteps
      const i0 = innerStartIdx + k * radialSteps + j
      const i1 = innerStartIdx + k * radialSteps + nextJ
      const i2 = innerStartIdx + (k + 1) * radialSteps + nextJ
      const i3 = innerStartIdx + (k + 1) * radialSteps + j
      indices.push(i0, i2, i1)
      indices.push(i0, i3, i2)
    }
  }

  const outerTopStart = outerSteps * radialSteps
  const innerTopStart = innerStartIdx + innerSteps * radialSteps
  for (let j = 0; j < radialSteps; j++) {
    const nextJ = (j + 1) % radialSteps
    const o0 = outerTopStart + j
    const o1 = outerTopStart + nextJ
    const n0 = innerTopStart + j
    const n1 = innerTopStart + nextJ
    indices.push(o0, o1, n1)
    indices.push(o0, n1, n0)
  }

  const socketBotCenter = pos.length / 3
  pos.push(0, 0, solidLen)
  const innerBotStart = innerStartIdx
  for (let j = 0; j < radialSteps; j++) {
    const nextJ = (j + 1) % radialSteps
    indices.push(socketBotCenter, innerBotStart + nextJ, innerBotStart + j)
  }

  const outerBotCenter = pos.length / 3
  pos.push(0, 0, 0)
  for (let j = 0; j < radialSteps; j++) {
    const nextJ = (j + 1) % radialSteps
    indices.push(outerBotCenter, nextJ, j)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/**
 * Builds one solid pillar (+Y or -Y) bordering a circular cylindrical through-hole along X.
 * Mathematical surface:
 *   Inner hole wall: y^2 + (z - zHole)^2 = rHole^2 (circular cylindrical tunnel along X)
 *   Outer shaft wall: x^2 + y^2 = rRod^2
 *   Seamless intersection at x = +/- sqrt(rRod^2 - yInner^2).
 */
function buildRoundHolePillar(
  rRod: number,
  rHole: number,
  zHole: number,
  isPositiveY: boolean,
  numZ = 32,
  numX = 24
): THREE.BufferGeometry {
  const ySign = isPositiveY ? 1 : -1
  const vertices: number[] = []
  const indices: number[] = []

  const ringVertices: THREE.Vector3[][] = []
  for (let j = 0; j <= numZ; j++) {
    const theta = -Math.PI / 2 + (Math.PI * j) / numZ
    const z = zHole + rHole * Math.sin(theta)
    const yInner = Math.max(0, rHole * Math.cos(theta))
    const xMax = Math.sqrt(Math.max(0, rRod * rRod - yInner * yInner))
    const phiMax = Math.asin(Math.min(1, xMax / rRod))

    const ring: THREE.Vector3[] = []
    // 1. Inner circular tunnel wall: x from -xMax to +xMax at y = yInner
    for (let i = 0; i < numX; i++) {
      const t = i / numX
      const x = -xMax + 2 * xMax * t
      const y = ySign * yInner
      ring.push(new THREE.Vector3(x, y, z))
    }
    // 2. Outer cylinder wall: arc from +phiMax to -phiMax along outer radius
    for (let i = 0; i < numX; i++) {
      const t = i / numX
      const phi = phiMax - 2 * phiMax * t
      const x = rRod * Math.sin(phi)
      const y = ySign * (rRod * Math.cos(phi))
      ring.push(new THREE.Vector3(x, y, z))
    }
    ringVertices.push(ring)
  }

  const ringSize = 2 * numX
  const baseIndex: number[] = []
  for (let j = 0; j <= numZ; j++) {
    baseIndex.push(vertices.length / 3)
    for (let k = 0; k < ringSize; k++) {
      const p = ringVertices[j][k]
      vertices.push(p.x, p.y, p.z)
    }
  }

  // Side quads between level j and j + 1
  for (let j = 0; j < numZ; j++) {
    const rowA = baseIndex[j]
    const rowB = baseIndex[j + 1]
    for (let k = 0; k < ringSize; k++) {
      const nextK = (k + 1) % ringSize
      const a0 = rowA + k
      const a1 = rowA + nextK
      const b0 = rowB + k
      const b1 = rowB + nextK

      if (isPositiveY) {
        indices.push(a0, b0, a1)
        indices.push(a1, b0, b1)
      } else {
        indices.push(a0, a1, b0)
        indices.push(a1, b1, b0)
      }
    }
  }

  // Bottom cap at j = 0 (z = zHole - rHole)
  const botRow = baseIndex[0]
  for (let k = 1; k < ringSize - 1; k++) {
    if (isPositiveY) {
      indices.push(botRow, botRow + k + 1, botRow + k)
    } else {
      indices.push(botRow, botRow + k, botRow + k + 1)
    }
  }

  // Top cap at j = numZ (z = zHole + rHole)
  const topRow = baseIndex[numZ]
  for (let k = 1; k < ringSize - 1; k++) {
    if (isPositiveY) {
      indices.push(topRow, topRow + k, topRow + k + 1)
    } else {
      indices.push(topRow, topRow + k + 1, topRow + k)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/**
 * Generate 3D geometry for Part A (Male rod with raised edge, central cord hole, and male thread stud).
 */
export function buildTubeMountPartAGeometry(options: TubeMountSTLOptions): THREE.BufferGeometry {
  const d = calculateTubeMountDimensions(options)
  const parts: THREE.BufferGeometry[] = []

  // 1. Base Flange (stands on Z=0, extends to Z=flangeThickness)
  const flangeGeo = new THREE.CylinderGeometry(
    d.flangeDiameter / 2,
    d.flangeDiameter / 2,
    d.flangeThickness,
    32
  )
  flangeGeo.rotateX(Math.PI / 2)
  flangeGeo.translate(0, 0, d.flangeThickness / 2)
  parts.push(flangeGeo)

  // 2. Shaft with clean transverse through-hole
  const zHole = d.flangeThickness + d.cordHolePosFromFlange
  const rHole = d.cordHoleDia / 2
  const rRod = d.rodDiameter / 2
  const safeRHole = Math.min(rHole, rRod * 0.7)

  // Shaft lower section (from flange to hole bottom)
  const lenLower = (zHole - safeRHole) - d.flangeThickness
  if (lenLower > 0) {
    const shaftLower = new THREE.CylinderGeometry(rRod, rRod, lenLower, 32)
    shaftLower.rotateX(Math.PI / 2)
    shaftLower.translate(0, 0, lenLower / 2 + d.flangeThickness)
    parts.push(shaftLower)
  }

  // Middle section: two clean solid pillars bordering the round transverse through-hole
  const pillar1 = buildRoundHolePillar(rRod, safeRHole, zHole, true, 32, 24)
  parts.push(pillar1)

  const pillar2 = buildRoundHolePillar(rRod, safeRHole, zHole, false, 32, 24)
  parts.push(pillar2)

  // Shaft upper section (from hole top to thread shoulder)
  const zShaftTop = d.flangeThickness + d.shaftLengthA
  const lenUpper = zShaftTop - (zHole + safeRHole)
  if (lenUpper > 0) {
    const shaftUpper = new THREE.CylinderGeometry(rRod, rRod, lenUpper, 32)
    shaftUpper.rotateX(Math.PI / 2)
    shaftUpper.translate(0, 0, lenUpper / 2 + (zHole + safeRHole))
    parts.push(shaftUpper)
  }

  // 3. True continuous helical male screw thread stud
  const threadStud = buildParametricMaleThread(
    d.threadMajorDia / 2,
    d.threadMinorDia / 2,
    d.pitch,
    d.threadLength,
    36,
    80
  )
  threadStud.translate(0, 0, zShaftTop)
  parts.push(threadStud)

  const normalized = parts.map(normalizeGeo)
  const merged = BufferGeometryUtils.mergeGeometries(normalized, false)
  if (!merged) {
    throw new Error('Failed to merge Part A geometries')
  }
  merged.computeVertexNormals()
  return merged
}

/**
 * Generate 3D geometry for Part B (Female rod with raised edge and internal threaded socket).
 */
export function buildTubeMountPartBGeometry(options: TubeMountSTLOptions): THREE.BufferGeometry {
  const d = calculateTubeMountDimensions(options)
  const parts: THREE.BufferGeometry[] = []

  // 1. Base Flange
  const flangeGeo = new THREE.CylinderGeometry(
    d.flangeDiameter / 2,
    d.flangeDiameter / 2,
    d.flangeThickness,
    32
  )
  flangeGeo.rotateX(Math.PI / 2)
  flangeGeo.translate(0, 0, d.flangeThickness / 2)
  parts.push(flangeGeo)

  // 2. Shaft with true continuous internal helical thread socket
  const rRod = d.rodDiameter / 2
  const totalShaft = d.shaftLengthB
  const socketDepth = d.threadLength + 0.8

  const femaleShaft = buildParametricFemaleThreadSocket(
    rRod,
    d.threadMajorDia / 2,
    d.threadMinorDia / 2,
    d.clearance,
    d.pitch,
    totalShaft,
    socketDepth,
    36,
    80
  )
  femaleShaft.translate(0, 0, d.flangeThickness)
  parts.push(femaleShaft)

  const normalized = parts.map(normalizeGeo)
  const merged = BufferGeometryUtils.mergeGeometries(normalized, false)
  if (!merged) {
    throw new Error('Failed to merge Part B geometries')
  }
  merged.computeVertexNormals()
  return merged
}

/**
 * Generate 3D geometry with both parts positioned side-by-side on the print bed.
 */
export function buildTubeMountCombinedGeometry(options: TubeMountSTLOptions): THREE.BufferGeometry {
  const d = calculateTubeMountDimensions(options)
  const geoA = buildTubeMountPartAGeometry(options)
  const geoB = buildTubeMountPartBGeometry(options)

  const spacing = Math.max(12, d.flangeDiameter + 6)
  geoA.translate(-spacing / 2, 0, 0)
  geoB.translate(spacing / 2, 0, 0)

  const combined = BufferGeometryUtils.mergeGeometries([normalizeGeo(geoA), normalizeGeo(geoB)], false)
  if (!combined) {
    throw new Error('Failed to merge combined tube mount geometries')
  }
  combined.computeVertexNormals()
  return combined
}

/**
 * Builds the solid crossbar body of length L, width W, height H.
 * With rounded ends and beveled perimeter edges.
 * If holeR > 0, an open cylindrical through-hole of radius holeR is formed at (0, 0) along Z.
 * The core dimensions are offset so that after beveling, the outer bounding box
 * matches exactly width W, length L, height H.
 */
function buildCrossbarBody(length: number, width: number, height: number, holeR = 0): THREE.BufferGeometry {
  const bevel = Math.min(0.2, height * 0.1, width * 0.05)
  const coreW = width - 2 * bevel
  const coreL = length - 2 * bevel
  const coreH = height - 2 * bevel
  const halfW = coreW / 2
  const halfL = coreL / 2
  const rad = Math.min(halfW, halfL) * 0.4

  const shape = new THREE.Shape()
  shape.moveTo(-halfW + rad, -halfL)
  shape.lineTo(halfW - rad, -halfL)
  shape.quadraticCurveTo(halfW, -halfL, halfW, -halfL + rad)
  shape.lineTo(halfW, halfL - rad)
  shape.quadraticCurveTo(halfW, halfL, halfW - rad, halfL)
  shape.lineTo(-halfW + rad, halfL)
  shape.quadraticCurveTo(-halfW, halfL, -halfW, halfL - rad)
  shape.lineTo(-halfW, -halfL + rad)
  shape.quadraticCurveTo(-halfW, -halfL, -halfW + rad, -halfL)

  if (holeR > 0) {
    const hole = new THREE.Path()
    hole.absarc(0, 0, holeR, 0, Math.PI * 2, true)
    shape.holes.push(hole)
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: coreH,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
  })
  geo.translate(0, 0, bevel)
  return geo
}

/**
 * Calculate ray intersection point from (0, 0) with a rounded rectangle of width 2*halfW,
 * length 2*halfL, and corner radius rad along angle theta in [0, 2*PI].
 */
function getRoundedRectRayPoint(
  theta: number,
  halfW: number,
  halfL: number,
  rad: number
): [number, number] {
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const sX = cos >= 0 ? 1 : -1
  const sY = sin >= 0 ? 1 : -1
  const aCos = Math.abs(cos)
  const aSin = Math.abs(sin)

  const cx = halfW - rad
  const cy = halfL - rad

  // Check right vertical edge
  if (aCos > 1e-6) {
    const t = halfW / aCos
    const y = t * aSin
    if (y <= cy) {
      return [sX * halfW, sY * y]
    }
  }

  // Check top horizontal edge
  if (aSin > 1e-6) {
    const t = halfL / aSin
    const x = t * aCos
    if (x <= cx) {
      return [sX * x, sY * halfL]
    }
  }

  // Corner circle arc
  const B = cx * aCos + cy * aSin
  const C = cx * cx + cy * cy - rad * rad
  const disc = B * B - C
  const t = B + Math.sqrt(Math.max(0, disc))
  return [sX * t * aCos, sY * t * aSin]
}

/**
 * Generate 3D geometry for the T-Rod (T-shaped pin with upper crossbar, center cord hole, and male thread stud at the long end).
 */
export function buildTRodGeometry(options: TubeMountSTLOptions): THREE.BufferGeometry {
  const d = calculateTubeMountDimensions(options)
  const rRod = d.rodDiameter / 2
  const parts: THREE.BufferGeometry[] = []
  const totalBarH = d.crossbarHeight

  // 1. Crossbar (Upper part of T) - Solid continuous rounded bar
  const crossbarGeo = buildCrossbarBody(d.crossbarLength, d.crossbarWidth, d.crossbarHeight, 0)
  parts.push(crossbarGeo)

  // 2. Stem starting from bottom of crossbar
  const zStemBase = totalBarH
  const zHole = zStemBase + d.span / 2
  const rHole = Math.min(d.cordHoleDia / 2, rRod * 0.7)

  // Shaft lower section (from crossbar to cord hole)
  const lenLower = (zHole - rHole) - zStemBase
  if (lenLower > 0) {
    const shaftLower = new THREE.CylinderGeometry(rRod, rRod, lenLower, 32)
    shaftLower.rotateX(Math.PI / 2)
    shaftLower.translate(0, 0, zStemBase + lenLower / 2)
    parts.push(shaftLower)
  }

  // Cord hole pillars (exact round circular cylinder)
  const pillar1 = buildRoundHolePillar(rRod, rHole, zHole, true, 32, 24)
  const pillar2 = buildRoundHolePillar(rRod, rHole, zHole, false, 32, 24)
  parts.push(pillar1, pillar2)

  // Shaft upper section (from cord hole to exit shoulder)
  const zShoulder = zStemBase + d.span
  const lenUpper = zShoulder - (zHole + rHole)
  if (lenUpper > 0) {
    const shaftUpper = new THREE.CylinderGeometry(rRod, rRod, lenUpper, 32)
    shaftUpper.rotateX(Math.PI / 2)
    shaftUpper.translate(0, 0, (zHole + rHole) + lenUpper / 2)
    parts.push(shaftUpper)
  }

  // 3. Male thread stud extending past the shoulder
  const threadMajorDia = d.tThreadMajorDia
  const threadMinorDia = d.tThreadMinorDia
  const pitch = d.tThreadPitch
  const threadLength = d.tThreadLength

  const maleThread = buildParametricMaleThread(
    threadMajorDia / 2,
    threadMinorDia / 2,
    pitch,
    threadLength,
    36,
    80
  )
  maleThread.translate(0, 0, zShoulder)
  parts.push(maleThread)

  const normalized = parts.map(normalizeGeo)
  const merged = BufferGeometryUtils.mergeGeometries(normalized, false)
  if (!merged) {
    throw new Error('Failed to merge T-Rod geometries')
  }
  merged.computeVertexNormals()
  return merged
}

/**
 * Generate 3D geometry for the Female Crossbar Rod.
 * It has the exact same outer dimensions as the short, upper part of the T, with a matching female thread socket in the middle.
 * The socket is closed on the outer side (blind hole at z = floorZ), leaving a solid clean exterior surface at z = 0.
 * Constructed as a single 100% watertight 2-manifold mesh with zero non-manifold edges or inverted normals.
 */
export function buildFemaleCrossbarGeometry(options: TubeMountSTLOptions): THREE.BufferGeometry {
  const d = calculateTubeMountDimensions(options)
  const length = d.crossbarLength
  const width = d.crossbarWidth
  const height = d.crossbarHeight
  const majorDia = d.tThreadMajorDia
  const minorDia = d.tThreadMinorDia
  const pitch = d.tThreadPitch
  const clearance = 0.25
  const baseWall = Math.max(0.4, Math.min(0.8, height * 0.2))
  const floorZ = baseWall
  const radialSteps = 48
  const heightSteps = 60

  const pos: number[] = []
  const indices: number[] = []

  const halfW = width / 2
  const halfL = length / 2
  const cornerRad = Math.min(halfW, halfL) * 0.4
  const bevel = Math.min(0.2, height * 0.1, width * 0.05)

  // Ensure socket hole fits cleanly inside top face bevel with shoulder margin
  const maxTopMajorR = (halfW - bevel) - 0.15
  const rFemMaj = Math.min(maxTopMajorR, (majorDia / 2) + clearance)
  const rFemMin = Math.min(rFemMaj - 0.35, (minorDia / 2) + clearance)
  const threadHeight = height - floorZ

  function getInnerRadius(zRel: number, theta: number): number {
    if (zRel <= 0 || zRel >= threadHeight) return rFemMaj
    let taper = 1.0
    const taperLen = pitch * 0.5
    if (zRel < taperLen) {
      taper = Math.sin((zRel / taperLen) * (Math.PI / 2))
    } else if (zRel > threadHeight - taperLen) {
      taper = Math.sin(((threadHeight - zRel) / taperLen) * (Math.PI / 2))
    }
    const effMin = rFemMaj - (rFemMaj - rFemMin) * taper

    const u = (zRel / pitch) - (theta / (Math.PI * 2))
    const delta = u - Math.round(u)
    const absD = Math.abs(delta)

    if (absD <= 0.15) {
      return effMin
    } else if (absD < 0.45) {
      return rFemMaj - (rFemMaj - effMin) * ((0.45 - absD) / 0.30)
    } else {
      return rFemMaj
    }
  }

  // 1. Outer Wall: vertical slices from z = 0 to z = height
  const numZSteps = 24
  for (let k = 0; k <= numZSteps; k++) {
    const t = k / numZSteps
    const z = t * height

    let inset = 0
    if (z < bevel) {
      inset = bevel * (1 - Math.sin((z / bevel) * (Math.PI / 2)))
    } else if (z > height - bevel) {
      inset = bevel * (1 - Math.sin(((height - z) / bevel) * (Math.PI / 2)))
    }

    const curHW = Math.max(0.5, halfW - inset)
    const curHL = Math.max(0.5, halfL - inset)
    const curRad = Math.max(0.2, cornerRad - inset)

    for (let j = 0; j < radialSteps; j++) {
      const theta = (j / radialSteps) * Math.PI * 2
      const [x, y] = getRoundedRectRayPoint(theta, curHW, curHL, curRad)
      pos.push(x, y, z)
    }
  }

  // Outer wall side quads (normals pointing OUTWARD)
  for (let k = 0; k < numZSteps; k++) {
    for (let j = 0; j < radialSteps; j++) {
      const nextJ = (j + 1) % radialSteps
      const i0 = k * radialSteps + j
      const i1 = k * radialSteps + nextJ
      const i2 = (k + 1) * radialSteps + nextJ
      const i3 = (k + 1) * radialSteps + j
      indices.push(i0, i1, i2)
      indices.push(i0, i2, i3)
    }
  }

  // 2. Bottom Cap at z = 0 (solid exterior floor of crossbar, normal pointing -Z)
  const botCenterIdx = pos.length / 3
  pos.push(0, 0, 0)
  for (let j = 0; j < radialSteps; j++) {
    const nextJ = (j + 1) % radialSteps
    indices.push(botCenterIdx, nextJ, j)
  }

  // 3. Inner Helical Thread Wall: from z = floorZ to z = height
  const innerStartIdx = pos.length / 3
  const innerZSteps = heightSteps
  for (let k = 0; k <= innerZSteps; k++) {
    const zRel = (k / innerZSteps) * threadHeight
    const z = floorZ + zRel
    for (let j = 0; j < radialSteps; j++) {
      const theta = (j / radialSteps) * Math.PI * 2
      const r = getInnerRadius(zRel, theta)
      pos.push(r * Math.cos(theta), r * Math.sin(theta), z)
    }
  }

  // Inner thread wall quads (normals pointing INWARD towards hole center axis)
  for (let k = 0; k < innerZSteps; k++) {
    for (let j = 0; j < radialSteps; j++) {
      const nextJ = (j + 1) % radialSteps
      const i0 = innerStartIdx + k * radialSteps + j
      const i1 = innerStartIdx + k * radialSteps + nextJ
      const i2 = innerStartIdx + (k + 1) * radialSteps + nextJ
      const i3 = innerStartIdx + (k + 1) * radialSteps + j
      indices.push(i0, i2, i1)
      indices.push(i0, i3, i2)
    }
  }

  // 4. Socket Bottom Disc at z = floorZ (normal pointing +Z into socket)
  const socketFloorCenterIdx = pos.length / 3
  pos.push(0, 0, floorZ)
  for (let j = 0; j < radialSteps; j++) {
    const nextJ = (j + 1) % radialSteps
    const n0 = innerStartIdx + j
    const n1 = innerStartIdx + nextJ
    indices.push(socketFloorCenterIdx, n0, n1)
  }

  // 5. Top Surface Ring at z = height:
  // Connects outer wall top ring to inner thread top ring with normal pointing +Z
  const outerTopRingStart = numZSteps * radialSteps
  const innerTopRingStart = innerStartIdx + innerZSteps * radialSteps
  for (let j = 0; j < radialSteps; j++) {
    const nextJ = (j + 1) % radialSteps
    const o0 = outerTopRingStart + j
    const o1 = outerTopRingStart + nextJ
    const n0 = innerTopRingStart + j
    const n1 = innerTopRingStart + nextJ
    indices.push(o0, o1, n0)
    indices.push(o1, n1, n0)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

// Alias for backwards compatibility
export const buildSplintGeometry = buildFemaleCrossbarGeometry

/**
 * Generate 3D geometry with both T-Rod and Female Crossbar positioned side-by-side on the print bed.
 */
export function buildTMountCombinedGeometry(options: TubeMountSTLOptions): THREE.BufferGeometry {
  const d = calculateTubeMountDimensions(options)
  const geoTRod = buildTRodGeometry(options)
  const geoCrossbar = buildFemaleCrossbarGeometry(options)

  const spacing = Math.max(16, d.crossbarWidth * 2 + 10)
  geoTRod.translate(-spacing / 2, 0, 0)
  geoCrossbar.translate(spacing / 2, 0, 0)

  const combined = BufferGeometryUtils.mergeGeometries([normalizeGeo(geoTRod), normalizeGeo(geoCrossbar)], false)
  if (!combined) {
    throw new Error('Failed to merge combined T-Mount geometries')
  }
  combined.computeVertexNormals()
  return combined
}

/**
 * Resolve the requested tube mount geometry: both parts, Part A (male), Part B (female), T-Rod, or Female Crossbar.
 */
export function buildTubeMountGeometry(options: TubeMountSTLOptions): THREE.BufferGeometry {
  if (options.mountType === 'tmount') {
    if (options.part === 'trod') {
      return buildTRodGeometry(options)
    }
    if (options.part === 'crossbar' || options.part === 'splint') {
      return buildFemaleCrossbarGeometry(options)
    }
    return buildTMountCombinedGeometry(options)
  }

  // Default: threaded mount
  if (options.part === 'male') {
    return buildTubeMountPartAGeometry(options)
  }
  if (options.part === 'female') {
    return buildTubeMountPartBGeometry(options)
  }
  return buildTubeMountCombinedGeometry(options)
}

/**
 * Generate binary STL file bytes for the internal tube mount.
 */
export function generateTubeMountSTL(options: TubeMountSTLOptions): Uint8Array {
  const geo = buildTubeMountGeometry(options)
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
 * Trigger download of the internal tube mount as a 3D-printable binary STL file.
 */
export function downloadTubeMountSTL(options: TubeMountSTLOptions): void {
  const bytes = generateTubeMountSTL(options)
  const d = calculateTubeMountDimensions(options)
  const isTMount = options.mountType === 'tmount'
  const partName = options.part ?? 'both'
  const tubeStr = options.tubeIndex !== undefined ? `tube${options.tubeIndex + 1}-` : ''
  const odStr = d.tubeOD.toFixed(0)
  const holeStr = d.tubeHoleDia.toFixed(1)
  const prefix = isTMount ? 'windspiel-t-mount' : 'windspiel-internal-mount'
  const hStr = isTMount ? `-H${d.crossbarHeight.toFixed(1)}mm` : ''
  const filename = `${prefix}-${tubeStr}OD${odStr}mm-hole${holeStr}mm${hStr}-${partName}.stl`

  triggerFileDownload(bytes, filename)
}
