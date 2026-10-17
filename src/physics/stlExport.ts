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
  cordHoleDiameter_mm?: number
  threadClearance_mm?: number
  part?: 'both' | 'male' | 'female'
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
}

/**
 * Calculate all mechanical dimensions for the 2-part internal tube mount
 * based on tube outer diameter, wall thickness, and drilled hole diameter.
 */
export function calculateTubeMountDimensions(options: TubeMountSTLOptions): TubeMountDimensions {
  const tubeOD = Math.max(10, options.tubeOuterDiameter_mm)
  const wall = Math.max(0.4, options.tubeWallThickness_mm ?? 1.2)
  const tubeID = Math.max(6, tubeOD - 2 * wall)

  // Drilled hole in tube wall: default 4.5 mm
  const tubeHoleDia = Math.max(2.5, Math.min(tubeOD * 0.4, options.tubeHoleDiameter_mm ?? 4.5))
  // Hanging cord hole diameter: default 2.0 mm
  const cordHoleDia = Math.max(1.0, Math.min(tubeHoleDia * 0.75, options.cordHoleDiameter_mm ?? 2.0))
  const clearance = Math.max(0.15, options.threadClearance_mm ?? 0.25)

  // Shaft fits drilled hole with 0.2 mm clearance
  const rodDiameter = Math.max(2.2, tubeHoleDia - 0.2)
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

  // Middle section: two clean solid pillars on +Y and -Y sides of hole (NO interior center fans!)
  const thetaMax = Math.asin(safeRHole / rRod)
  const holeSectionHeight = safeRHole * 2
  const xEdge = Math.sqrt(rRod * rRod - safeRHole * safeRHole)

  // +Y pillar
  const shape1 = new THREE.Shape()
  shape1.moveTo(-xEdge, safeRHole)
  shape1.absarc(0, 0, rRod, Math.PI - thetaMax, thetaMax, true)
  shape1.lineTo(-xEdge, safeRHole)
  shape1.closePath()
  const pillar1 = new THREE.ExtrudeGeometry(shape1, { depth: holeSectionHeight, bevelEnabled: false, curveSegments: 24 })
  pillar1.translate(0, 0, zHole - safeRHole)
  parts.push(pillar1)

  // -Y pillar
  const shape2 = new THREE.Shape()
  shape2.moveTo(xEdge, -safeRHole)
  shape2.absarc(0, 0, rRod, -thetaMax, Math.PI + thetaMax, true)
  shape2.lineTo(xEdge, -safeRHole)
  shape2.closePath()
  const pillar2 = new THREE.ExtrudeGeometry(shape2, { depth: holeSectionHeight, bevelEnabled: false, curveSegments: 24 })
  pillar2.translate(0, 0, zHole - safeRHole)
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
 * Resolve the requested tube mount geometry: both parts, Part A (male), or Part B (female).
 */
export function buildTubeMountGeometry(options: TubeMountSTLOptions): THREE.BufferGeometry {
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
  const partName = options.part ?? 'both'
  const tubeStr = options.tubeIndex !== undefined ? `tube${options.tubeIndex + 1}-` : ''
  const odStr = d.tubeOD.toFixed(0)
  const holeStr = d.tubeHoleDia.toFixed(1)
  const filename = `windspiel-internal-mount-${tubeStr}OD${odStr}mm-hole${holeStr}mm-${partName}.stl`

  triggerFileDownload(bytes, filename)
}
