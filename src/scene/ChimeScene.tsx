import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { useStore, tubeSpec, tubeGeometry, tubeSuspension, tubeMountingPosition, effectiveStrikerDimensions, optimalSailDrop_mm } from '../state/store'
import { MATERIALS, STRIKER_MATERIALS } from '../physics/materials'
import { WindSim } from '../physics/wind'
import { audio } from '../audio/engine'
import { partialExcitation } from '../physics/contact'
import { tubeFrequencies } from '../physics/tubes'
import { computeStringLinePoints, computeGrommetPositions } from './mounting'

export const windSim = new WindSim()

function TubeMesh({ index }: { index: number }) {
  const { config, tubes } = useStore()
  const tube = tubes[index]
  const geo = tubeGeometry(config, index)
  const mat = MATERIALS[geo.material] ?? MATERIALS.aluminum
  const pivotRef = useRef<THREE.Group>(null)

  const ringR = config.suspensionRadius_mm / 1000
  const angle = (index / config.tubeCount) * Math.PI * 2
  const x = Math.cos(angle) * ringR
  const z = Math.sin(angle) * ringR
  const L = tube.length_mm / 1000
  const spec = tubeSpec(config, tube, index)
  const radius = geo.Do / 2
  const susp = tubeSuspension(config, tubes, index)
  const s = susp.mm / 1000            // pivot distance below tube top (m)
  const mount = tubeMountingPosition(config, tubes, index)
  const topY = mount.top_mm / 1000
  const suspY = mount.susp_mm / 1000
  // compound pendulum about the pivot: ω = √(g·d / (L²/12 + d²)),
  // d = distance pivot → center of mass (a real physical wobble rate ~1 Hz)
  const d = L / 2 - s
  const omega = Math.sqrt((9.81 * Math.max(d, 0.01)) / (L * L / 12 + d * d))
  // per-tube strike state: start time & velocity of last wobble excitation
  const strikeState = useRef({ t: -1e9, vel: 0, phase: Math.random() * Math.PI * 2 })

  // Suspension point band:
  // Anthracite band on lighter/metallic tubes; cream white band on dark tubes (carbon, cast iron).
  const isDark = useMemo(() => {
    const c = new THREE.Color(mat.color)
    const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
    return lum < 0.42 || geo.material === 'carbon' || geo.material === 'castIron'
  }, [mat.color, geo.material])
  const bandColor = isDark ? '#ede6d8' : '#23272e'

  useFrame(() => {
    const g = pivotRef.current
    if (!g) return
    const st = useStore.getState().strikeFlash[index]
    if (st && st.t > strikeState.current.t) {
      strikeState.current = { t: st.t, vel: st.vel, phase: strikeState.current.phase }
    }
    const now = performance.now() / 1000
    const dt = now - strikeState.current.t / 1000
    if (dt > 12) { g.rotation.set(0, 0, 0); return }
    // decaying pendulum wobble about the suspension point; slight elliptical
    // path (x/z phase offset) so the tube traces a slowly precessing arc
    const decay = Math.exp(-dt * 0.8)
    const amp = 0.22 * strikeState.current.vel * decay
    const ph = omega * dt + strikeState.current.phase
    g.rotation.z = Math.sin(ph) * amp
    g.rotation.x = Math.cos(ph * 0.87) * amp * 0.8
  })

  const style = config.mountingStyle ?? 'center'
  const quatTangential = useMemo(() => {
    const dir = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)).normalize()
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  }, [angle])

  return (
    <group ref={pivotRef} position={[x, -suspY, z]}>
      <mesh position={[0, s - L / 2, 0]} castShadow
        onPointerDown={(e) => {
          if (e.button !== 0) return // only left-click strikes; right-click is reserved for panning
          e.stopPropagation()
          audio.init(); audio.resume()
          const strikerY = (config.tubeDrop_mm + config.strikerDrop_mm) / 1000
          const xi = Math.max(0.02, Math.min(0.98, (strikerY - topY) / L))
          const neighbours = tubes.filter((_, j) => j !== index).map((t, j2) => tubeSpec(config, t, j2 < index ? j2 : j2 + 1))
          audio.strike(spec, 0.8, x * 4, xi, susp.fraction, neighbours)
          useStore.getState().flash(index, 0.8)
        }}>
        <cylinderGeometry args={[radius, radius, L, 24, 1, true]} />
      {mat.opacity !== undefined ? (
        <meshPhysicalMaterial
          color={mat.color} metalness={mat.metalness} roughness={mat.roughness}
          transparent opacity={mat.opacity} side={THREE.DoubleSide}
          transmission={0.7} thickness={geo.t === Infinity ? geo.Do : geo.t}
          ior={1.5} clearcoat={0.6}
        />
      ) : (
        <meshStandardMaterial color={mat.color} metalness={mat.metalness} roughness={mat.roughness} side={THREE.DoubleSide} />
      )}
      </mesh>

      {/* Internal suspension bar for 'center' mounting style */}
      {style === 'center' ? (
        <group quaternion={quatTangential}>
          {/* Internal cross-bar */}
          <mesh>
            <cylinderGeometry args={[0.0014, 0.0014, Math.max(0.005, (radius - 0.0006) * 2), 16]} />
            <meshStandardMaterial color="#c2cad6" roughness={0.25} metalness={0.85} />
          </mesh>
          {/* Central string attachment loop/knot */}
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.0026, 12, 12]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.4} metalness={0.1} />
          </mesh>
          {/* External pin tips marking the drill holes */}
          <mesh position={[0, radius, 0]}>
            <cylinderGeometry args={[0.0016, 0.0016, 0.001, 12]} />
            <meshStandardMaterial color="#88929e" roughness={0.3} metalness={0.8} />
          </mesh>
          <mesh position={[0, -radius, 0]}>
            <cylinderGeometry args={[0.0016, 0.0016, 0.001, 12]} />
            <meshStandardMaterial color="#88929e" roughness={0.3} metalness={0.8} />
          </mesh>
        </group>
      ) : (
        /* Node holes and through-cord for 'bridge' and 'v-style' */
        <group quaternion={quatTangential}>
          {/* Internal through-cord segment */}
          <mesh>
            <cylinderGeometry args={[0.0009, 0.0009, radius * 2, 8]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.5} />
          </mesh>
          {/* Eyelet grommets at the tube entry/exit */}
          <mesh position={[0, radius + 0.0002, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.0022, 0.0008, 8, 16]} />
            <meshStandardMaterial color="#2d3748" roughness={0.4} metalness={0.5} />
          </mesh>
          <mesh position={[0, -radius - 0.0002, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.0022, 0.0008, 8, 16]} />
            <meshStandardMaterial color="#2d3748" roughness={0.4} metalness={0.5} />
          </mesh>
        </group>
      )}

      {/* Suspension point marker band */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[radius * 1.015 + 0.0002, radius * 1.015 + 0.0002, 0.0035, 32, 1, true]} />
        <meshStandardMaterial color={bandColor} roughness={0.6} metalness={0.15} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function Striker({ dropY }: { dropY: number }) {
  const { config, tubes } = useStore()
  const mat = STRIKER_MATERIALS[config.strikerMaterial] ?? STRIKER_MATERIALS.hardWood
  const ref = useRef<THREE.Group>(null)
  const wind = windSim.state
  const strikerDims = effectiveStrikerDimensions(config, tubes)
  const halfH = strikerDims.height_mm / 2000
  const R = strikerDims.diameter_mm / 2000
  const h = strikerDims.height_mm / 1000

  // hanging string: top plate → striker top, tracking the swing
  const hangGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    return g
  }, [])
  const hangLine = useMemo(() => new THREE.Line(hangGeo, new THREE.LineBasicMaterial({ color: '#999' })), [hangGeo])

  useFrame(() => {
    if (ref.current) {
      ref.current.position.x = wind.x
      ref.current.position.z = wind.z
      ref.current.rotation.z = -wind.x * 2.0
      ref.current.rotation.x = wind.z * 2.0
    }
    // string endpoints: plate underside center → striker top (striker tilts,
    // so attach at the tilted top surface)
    const pos = hangGeo.attributes.position as THREE.BufferAttribute
    const yStriker = -dropY - config.strikerDrop_mm / 1000
    const tiltZ = -wind.x * 2.0, tiltX = wind.z * 2.0
    // top point of the tilted striker disc, in world coords
    const topLocal = new THREE.Vector3(0, halfH, 0)
      .applyEuler(new THREE.Euler(tiltX, 0, tiltZ))
      .add(new THREE.Vector3(wind.x, yStriker, wind.z))
    pos.setXYZ(0, 0, 0, 0)
    pos.setXYZ(1, topLocal.x, topLocal.y, topLocal.z)
    pos.needsUpdate = true
  })

  const y = -dropY - config.strikerDrop_mm / 1000
  // striker geometry follows the selected contact form
  const strikeMat = (
    <meshStandardMaterial color={mat.color} roughness={mat.roughness} metalness={config.strikerMaterial === 'metal' ? 0.9 : 0.05} />
  )
  const multisidedGeo = useMemo(() => {
    const N = Math.max(3, config.tubeCount)
    const shape = new THREE.Shape()
    for (let i = 0; i < N; i++) {
      const a = (i + 0.5) * ((Math.PI * 2) / N)
      const px = Math.cos(a) * R
      const py = Math.sin(a) * R
      if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py)
    }
    shape.closePath()
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false })
    g.center()
    g.rotateX(-Math.PI / 2)
    return g
  }, [config.tubeCount, R, h])

  let strikerMesh: React.ReactNode
  switch (config.strikerForm) {
    case 'multisided':
      strikerMesh = (
        <mesh castShadow geometry={multisidedGeo}>
          {strikeMat}
        </mesh>
      )
      break
    case 'sphere':   // oblate ellipsoid: diameter fixed, thickness = slider
      strikerMesh = (
        <mesh castShadow scale={[1, Math.max(0.2, h / (2 * R)), 1]}>
          <sphereGeometry args={[R, 32, 16]} />
          {strikeMat}
        </mesh>
      )
      break
    case 'donut': {  // torus ring: minor radius follows slider, preserving central cord hole
      const minHoleR = Math.max(0.001, Math.min(R * 0.25, 0.0015))
      const maxMinor = Math.max(0.001, (R - minHoleR) / 2)
      const r_minor = Math.min(h / 2, maxMinor)
      const R_major = R - r_minor
      const scaleZ = h / (2 * r_minor)
      strikerMesh = (
        <mesh castShadow rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, scaleZ]}>
          <torusGeometry args={[R_major, r_minor, 24, 48]} />
          {strikeMat}
        </mesh>
      )
      break
    }
    case 'cylinder': // clean cylinder (sharp-rim character is in the contact physics)
    default:
      strikerMesh = (
        <mesh castShadow>
          <cylinderGeometry args={[R, R, h, 32]} />
          {strikeMat}
        </mesh>
      )
      break
  }
  return (
    <>
      <primitive object={hangLine} />
      <group ref={ref} position={[0, y, 0]}>
        {strikerMesh}
      </group>
    </>
  )
}

function Sail({ dropY }: { dropY: number }) {
  const { config, tubes } = useStore()
  const ref = useRef<THREE.Mesh>(null)
  const stringRef = useRef<THREE.Line>(null)
  const sailArea = config.sailArea_cm2 ?? 80
  const scale = Math.sqrt(sailArea / 80)
  const halfH = 0.06 * scale
  const wind = windSim.state

  useFrame(() => {
    if (ref.current) {
      ref.current.position.x = wind.sailX
      ref.current.position.z = wind.sailZ
      ref.current.rotation.y = Math.atan2(wind.windX, wind.windZ)
      ref.current.rotation.x = Math.min(0.9, Math.hypot(wind.windX, wind.windZ) * 0.3)
    }
    // string from striker bottom to sail top, tracking both
    if (stringRef.current) {
      const pos = stringRef.current.geometry.attributes.position as THREE.BufferAttribute
      const strikerDims = effectiveStrikerDimensions(config, tubes)
      const strikerY = -dropY - config.strikerDrop_mm / 1000
      const yTop = strikerY - strikerDims.height_mm / 2000
      pos.setXYZ(0, wind.x, yTop, wind.z)
      pos.setXYZ(1, wind.sailX, ref.current!.position.y + halfH, wind.sailZ)
      pos.needsUpdate = true
    }
  })

  // The wind catcher hangs on its own string (or rigid rod) from the striker
  const strikerDims = effectiveStrikerDimensions(config, tubes)
  const strikerY = -dropY - config.strikerDrop_mm / 1000
  const yStrikerBottom = strikerY - strikerDims.height_mm / 2000
  const sailDrop_m = (config.sailDrop_mm ?? optimalSailDrop_mm(config, tubes)) / 1000
  const y = yStrikerBottom - sailDrop_m - halfH
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    return g
  }, [])
  const stringLine = useMemo(() => new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#999' })), [geo])

  // sail geometry follows the selected shape (similar visual area across shapes)
  const sailMesh = (() => {
    const mat = <meshStandardMaterial color={config.sailColor} roughness={0.6} side={THREE.DoubleSide} />
    switch (config.sailType) {
      case 'diamond': {
        const s = new THREE.Shape()
        s.moveTo(0, 0.08); s.lineTo(0.05, 0); s.lineTo(0, -0.08); s.lineTo(-0.05, 0); s.closePath()
        return <mesh ref={ref} position={[0, y, 0]} scale={[scale, scale, 1]} castShadow geometry={new THREE.ShapeGeometry(s)}>{mat}</mesh>
      }
      case 'circle':
        return <mesh ref={ref} position={[0, y, 0]} scale={[scale, scale, 1]} castShadow>
          <circleGeometry args={[0.055, 32]} />{mat}
        </mesh>
      case 'teardrop': {
        const s = new THREE.Shape()
        s.moveTo(0, 0.09)
        s.bezierCurveTo(0.055, 0.03, 0.05, -0.04, 0, -0.07)
        s.bezierCurveTo(-0.05, -0.04, -0.055, 0.03, 0, 0.09)
        return <mesh ref={ref} position={[0, y, 0]} scale={[scale, scale, 1]} castShadow geometry={new THREE.ShapeGeometry(s, 24)}>{mat}</mesh>
      }
      case 'feather': // narrow vertical slat
        return <mesh ref={ref} position={[0, y, 0]} scale={[scale, scale, 1]} castShadow>
          <boxGeometry args={[0.028, 0.13, 0.003]} />{mat}
        </mesh>
      default: // rectangle
        return <mesh ref={ref} position={[0, y, 0]} scale={[scale, scale, 1]} castShadow>
          <boxGeometry args={[0.08, 0.12, 0.004]} />{mat}
        </mesh>
    }
  })()

  return (
    <>
      {sailMesh}
      <primitive ref={stringRef} object={stringLine} />
    </>
  )
}

function SpreaderBars() {
  const { config, tubes } = useStore()
  const tubeCount = config.tubeCount
  const ringR = config.suspensionRadius_mm / 1000

  const spreaders = useMemo(() => {
    return Array.from({ length: tubeCount }, (_, i) => {
      const a = (i / tubeCount) * Math.PI * 2
      const x = Math.cos(a) * ringR, z = Math.sin(a) * ringR
      const tx = -Math.sin(a), tz = Math.cos(a)
      const mount = tubeMountingPosition(config, tubes, i)
      const topY = mount.top_mm / 1000
      const geo = tubeGeometry(config, i)
      const radius = geo.Do / 2
      const ySpread = -(topY >= 0.025 ? Math.max(0.012, topY - 0.016) : topY * 0.55)
      const w = radius + 0.007
      const length = w * 2

      const dir = new THREE.Vector3(tx, 0, tz).normalize()
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)

      return {
        key: i,
        pos: [x, ySpread, z] as [number, number, number],
        quat,
        length,
        radius: 0.0016,
      }
    })
  }, [tubeCount, ringR, config, tubes])

  return (
    <group>
      {spreaders.map((s) => (
        <group key={s.key} position={s.pos} quaternion={s.quat}>
          {/* Main horizontal spreader bar */}
          <mesh castShadow>
            <cylinderGeometry args={[s.radius, s.radius, s.length, 16]} />
            <meshStandardMaterial color="#3a2f26" roughness={0.4} metalness={0.15} />
          </mesh>
          {/* Polished brass end collars */}
          <mesh position={[0, s.length / 2, 0]}>
            <sphereGeometry args={[s.radius * 1.5, 12, 12]} />
            <meshStandardMaterial color="#c09a5c" roughness={0.3} metalness={0.8} />
          </mesh>
          <mesh position={[0, -s.length / 2, 0]}>
            <sphereGeometry args={[s.radius * 1.5, 12, 12]} />
            <meshStandardMaterial color="#c09a5c" roughness={0.3} metalness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Strings() {
  const { config, tubes } = useStore()
  const style = config.mountingStyle ?? 'center'

  const linePoints = useMemo(() => {
    return computeStringLinePoints(config, tubes)
  }, [config, tubes])

  const lineGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(linePoints, 3))
    return geo
  }, [linePoints])

  return (
    <group position={[0, 0, 0]}>
      <lineSegments geometry={lineGeo}>
        <lineBasicMaterial color="#a0acbc" />
      </lineSegments>
      {style === 'bridge' && <SpreaderBars />}
    </group>
  )
}

function Simulator() {
  const { config, tubes } = useStore()
  const last = useRef(0)

  useFrame((_, delta) => {
    const now = performance.now()
    if (now - last.current < 30) return  // 30ms physics tick
    const dt = Math.min(0.05, (now - last.current) / 1000)
    last.current = now

    // sail length = distance striker → sail board
    const strikerY = (config.tubeDrop_mm + config.strikerDrop_mm) / 1000
    const sailDrop_m = (config.sailDrop_mm ?? optimalSailDrop_mm(config, tubes)) / 1000
    const strikerDims = effectiveStrikerDimensions(config, tubes)
    windSim.setGeometry(
      config.tubeCount,
      config.suspensionRadius_mm / 1000,
      config.outerDiameter_mm / 2000,
      strikerDims.diameter_mm / 2000,
      strikerY,
      Math.max(0.08, sailDrop_m),
      config.sailMass_g,
      config.sailArea_cm2 ?? 80
    )
    if (useStore.getState().windOn && useStore.getState().audioArmed) {
      windSim.update(dt, { strength: config.windStrength, gustFreq: config.gustFrequency })
    } else {
      // wind stopped: let the pendulums settle to rest instead of freezing
      windSim.settle(dt)
    }
  })

  // Wire strikes: windSim.onStrike → audio + flash
  useEffect(() => {
    windSim.onStrike = (tube, vel) => {
      const { config, tubes } = useStore.getState()
      if (!tubes[tube]) return
      const spec = tubeSpec(config, tubes[tube], tube)
      const a = (tube / config.tubeCount) * Math.PI * 2
      const pan = Math.cos(a) * 0.7
      const mount = tubeMountingPosition(config, tubes, tube)
      const strikerY = (config.tubeDrop_mm + config.strikerDrop_mm) / 1000
      const topY = mount.top_mm / 1000
      const L = tubes[tube].length_mm / 1000
      const xi = Math.max(0.02, Math.min(0.98, (strikerY - topY) / L))
      audio.init()          // safety: strikes can fire before first gesture
      // Sympathetic tube coupling is always active
      const neighbours = tubes
        .filter((_, j) => j !== tube)
        .map((t, j2) => tubeSpec(config, t, j2 < tube ? j2 : j2 + 1))
      // Hertzian contact: partial excitation through the contact-time low-pass
      const currentStrikerDims = effectiveStrikerDimensions(config, tubes)
      const striker = {
        material: config.strikerMaterial, form: config.strikerForm,
        diameter_mm: currentStrikerDims.diameter_mm, height_mm: currentStrikerDims.height_mm,
        sides: config.tubeCount,
      }
      const vImp = Math.max(0.02, vel * 0.15)   // normalized vel → m/s (sim regime)
      const f0 = tubeFrequencies(spec).f0
      const partials = [1, 2.756, 5.404, 8.933].map((r) =>
        partialExcitation(r * f0, striker, spec, vImp, xi))
      const susp = tubeSuspension(config, tubes, tube)
      audio.strike(spec, vel, pan, xi, susp.fraction, neighbours, { partials })
      useStore.getState().flash(tube, vel)
    }
  }, [])

  return null
}

function TopPlateGrommets() {
  const { config } = useStore()
  const tubeCount = config.tubeCount
  const ringR = config.suspensionRadius_mm / 1000
  const style = config.mountingStyle ?? 'center'

  const grommetPositions = useMemo(() => {
    return computeGrommetPositions(tubeCount, ringR, style)
  }, [tubeCount, ringR, style])

  return (
    <group>
      {grommetPositions.map((p, i) => (
        <mesh key={i} position={p} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.001, 0.0028, 16]} />
          <meshStandardMaterial color="#181c24" roughness={0.4} metalness={0.6} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

function TopPlate() {
  const { config } = useStore()
  const R = config.plateRadius_mm / 1000
  const mat = <meshStandardMaterial color={config.plateColor} roughness={0.4} metalness={0.1} />
  const plateMesh = (() => {
    switch (config.plateShape) {
      case 'ring': {
        const shape = new THREE.Shape()
        shape.absarc(0, 0, R, 0, Math.PI * 2, false)
        const hole = new THREE.Path()
        hole.absarc(0, 0, R * 0.35, 0, Math.PI * 2, true)
        shape.holes.push(hole)
        return <mesh position={[0, 0.005, 0]} castShadow rotation={[-Math.PI / 2, 0, 0]}>
          <extrudeGeometry args={[shape, { depth: 0.02, bevelEnabled: false }]} />{mat}
        </mesh>
      }
      case 'octagon': {
        const s = new THREE.Shape()
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + Math.PI / 8
          const px = Math.cos(a) * R, py = Math.sin(a) * R
          if (k === 0) s.moveTo(px, py); else s.lineTo(px, py)
        }
        s.closePath()
        return <mesh position={[0, 0.005, 0]} castShadow rotation={[-Math.PI / 2, 0, 0]}>
          <extrudeGeometry args={[s, { depth: 0.02, bevelEnabled: false }]} />{mat}
        </mesh>
      }
      case 'square':
        return <mesh position={[0, 0.005, 0]} castShadow rotation={[-Math.PI / 2, 0, 0]}>
          <boxGeometry args={[R * 1.8, R * 1.8, 0.02]} />{mat}
        </mesh>
      default:          // disc
        return <mesh position={[0, 0.01, 0]} castShadow>
          <cylinderGeometry args={[R, R, 0.02, 48]} />{mat}
        </mesh>
    }
  })()

  return (
    <group>
      {plateMesh}
      <TopPlateGrommets />
    </group>
  )
}

export function ChimeScene() {
  const { config } = useStore()
  const dropY = config.tubeDrop_mm / 1000   // plate → tube-start gap
  return (
    <>
      {/* no scene background: page CSS provides it, keeping the WebGL canvas
          transparent so the "back" wind-line layer can pass behind the chime */}
      <fog attach="fog" args={['#0b0e14', 4, 12]} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[3, 6, 4]} intensity={2} castShadow />
      <Environment preset="city" />
      <group position={[0, 1.6, 0]}>
        <TopPlate />
        {Array.from({ length: config.tubeCount }, (_, i) => <TubeMesh key={i} index={i} />)}
        <Striker dropY={dropY} />
        <Sail dropY={dropY} />
        <Strings />
        <Simulator />
      </group>
      <ContactShadows position={[0, -0.4, 0]} opacity={0.4} scale={4} blur={2.5} far={2} />
      <OrbitControls target={[0, 1.2, 0]} enablePan={true} screenSpacePanning={true} minDistance={0.8} maxDistance={6} />
    </>
  )
}
