import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { useStore, tubeSpec, tubeGeometry, tubeSuspension } from '../state/store'
import { MATERIALS, STRIKER_MATERIALS } from '../physics/materials'
import { WindSim } from '../physics/wind'
import { audio } from '../audio/engine'
import { partialExcitation } from '../physics/contact'
import { tubeFrequencies } from '../physics/tubes'

export const windSim = new WindSim()

function TubeMesh({ index, dropY }: { index: number; dropY: number }) {
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

  return (
    <group ref={pivotRef} position={[x, -dropY - s, z]}>
      <mesh position={[0, s - L / 2, 0]} castShadow
        onPointerDown={(e) => {
          if (e.button !== 0) return // only left-click strikes; right-click is reserved for panning
          e.stopPropagation()
          audio.init(); audio.resume()
          const xi = Math.max(0.02, Math.min(0.98, (config.strikerDrop_mm / 1000) / (tube.length_mm / 1000)))
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
      {/* Suspension point marker band */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[radius * 1.015 + 0.0002, radius * 1.015 + 0.0002, 0.004, 32, 1, true]} />
        <meshStandardMaterial color={bandColor} roughness={0.6} metalness={0.15} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function Striker({ dropY }: { dropY: number }) {
  const { config } = useStore()
  const mat = STRIKER_MATERIALS[config.strikerMaterial]
  const ref = useRef<THREE.Group>(null)
  const wind = windSim.state

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
    const halfH = config.strikerHeight_mm / 2000
    const topLocal = new THREE.Vector3(0, halfH, 0)
      .applyEuler(new THREE.Euler(tiltX, 0, tiltZ))
      .add(new THREE.Vector3(wind.x, yStriker, wind.z))
    pos.setXYZ(0, 0, 0, 0)
    pos.setXYZ(1, topLocal.x, topLocal.y, topLocal.z)
    pos.needsUpdate = true
  })

  const y = -dropY - config.strikerDrop_mm / 1000
  // striker geometry follows the selected contact form
  const R = config.strikerDiameter_mm / 2000
  const h = config.strikerHeight_mm / 1000
  const strikeMat = (
    <meshStandardMaterial color={mat.color} roughness={mat.roughness} metalness={config.strikerMaterial === 'metal' ? 0.9 : 0.05} />
  )
  let strikerMesh: React.ReactNode
  switch (config.strikerForm) {
    case 'sphere':   // oblate ellipsoid: diameter fixed, thickness = slider
      strikerMesh = (
        <mesh castShadow scale={[1, Math.max(0.2, h / (2 * R)), 1]}>
          <sphereGeometry args={[R, 32, 16]} />
          {strikeMat}
        </mesh>
      )
      break
    case 'donut':    // torus ring: minor radius (thickness) follows the slider
      strikerMesh = (
        <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[Math.max(R * 0.35, R - h / 2), Math.max(0.004, h / 2), 16, 40]} />
          {strikeMat}
        </mesh>
      )
      break
    case 'cylinder': // clean cylinder (sharp-rim character is in the contact physics)
      strikerMesh = (
        <mesh castShadow>
          <cylinderGeometry args={[R, R, h, 32]} />
          {strikeMat}
        </mesh>
      )
      break
    default:         // disc (flat face)
      strikerMesh = (
        <mesh castShadow>
          <cylinderGeometry args={[R, R, h, 32]} />
          {strikeMat}
        </mesh>
      )
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
      const strikerY = -dropY - config.strikerDrop_mm / 1000
      const yTop = strikerY - config.strikerHeight_mm / 2000
      pos.setXYZ(0, wind.x, yTop, wind.z)
      pos.setXYZ(1, wind.sailX, ref.current!.position.y + 0.06, wind.sailZ)
      pos.needsUpdate = true
    }
  })

  // The wind catcher hangs on its own string from the striker and must clear
  // the LONGEST tube — never sit beside/inside the tube forest.
  const maxLen = Math.max(...tubes.map((t) => t.length_mm), 1) / 1000
  const y = -(maxLen + 0.05 + 0.06)   // longest tube end + 5cm clearance + half sail height
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
        return <mesh ref={ref} position={[0, y, 0]} castShadow geometry={new THREE.ShapeGeometry(s)}>{mat}</mesh>
      }
      case 'circle':
        return <mesh ref={ref} position={[0, y, 0]} castShadow>
          <circleGeometry args={[0.055, 32]} />{mat}
        </mesh>
      case 'teardrop': {
        const s = new THREE.Shape()
        s.moveTo(0, 0.09)
        s.bezierCurveTo(0.055, 0.03, 0.05, -0.04, 0, -0.07)
        s.bezierCurveTo(-0.05, -0.04, -0.055, 0.03, 0, 0.09)
        return <mesh ref={ref} position={[0, y, 0]} castShadow geometry={new THREE.ShapeGeometry(s, 24)}>{mat}</mesh>
      }
      case 'feather': // narrow vertical slat
        return <mesh ref={ref} position={[0, y, 0]} castShadow>
          <boxGeometry args={[0.028, 0.13, 0.003]} />{mat}
        </mesh>
      default: // rectangle
        return <mesh ref={ref} position={[0, y, 0]} castShadow>
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

function Strings({ dropY }: { dropY: number }) {
  const { config, tubes } = useStore()
  const tubeCount = config.tubeCount
  const ringR = config.suspensionRadius_mm / 1000
  const lines = useMemo(() => {
    const pts: [number, number, number, number][] = []
    for (let i = 0; i < tubeCount; i++) {
      const a = (i / tubeCount) * Math.PI * 2
      const x = Math.cos(a) * ringR, z = Math.sin(a) * ringR
      const susp = tubeSuspension(config, tubes, i)
      const hang = susp.mm / 1000
      pts.push([x, 0, z, -hang])
    }
    return pts
  }, [tubeCount, ringR, config, tubes])

  return (
    <group position={[0, -dropY, 0]}>
      {lines.map((p, i) => {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(p[0], 0, p[2]),
          new THREE.Vector3(p[0], p[3], p[2]),
        ])
        return (
          <group key={i}>
            <primitive object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#666' }))} />
          </group>
        )
      })}
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

    // sail length = distance striker → sail board (must clear longest tube)
    const maxLen = Math.max(...tubes.map((t) => t.length_mm), 1) / 1000
    const sailLen = (maxLen + 0.11) - config.strikerDrop_mm / 1000
    windSim.setGeometry(
      config.tubeCount,
      config.suspensionRadius_mm / 1000,
      config.outerDiameter_mm / 2000,
      config.strikerDiameter_mm / 2000,
      (config.strikerDrop_mm + 60) / 1000,
      Math.max(0.1, sailLen),
      config.sailMass_g
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
      // strike position along tube: striker hangs strikerDrop below tube tops
      const xi = Math.max(0.02, Math.min(0.98, (config.strikerDrop_mm / 1000) / (tubes[tube].length_mm / 1000)))
      audio.init()          // safety: strikes can fire before first gesture
      // Sympathetic tube coupling is always active
      const neighbours = tubes
        .filter((_, j) => j !== tube)
        .map((t, j2) => tubeSpec(config, t, j2 < tube ? j2 : j2 + 1))
      // Hertzian contact: partial excitation through the contact-time low-pass
      const striker = {
        material: config.strikerMaterial, form: config.strikerForm,
        diameter_mm: config.strikerDiameter_mm, height_mm: config.strikerHeight_mm,
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

function TopPlate() {
  const { config } = useStore()
  const R = config.plateRadius_mm / 1000
  const mat = <meshStandardMaterial color={config.plateColor} roughness={0.7} metalness={0.1} />
  switch (config.plateShape) {
    case 'ring':      // ring with open center, lying flat (torus is XY-native)
      return <mesh position={[0, R * 0.16, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[R * 0.85, R * 0.16, 16, 48]} />{mat}
      </mesh>
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
        {Array.from({ length: config.tubeCount }, (_, i) => <TubeMesh key={i} index={i} dropY={dropY} />)}
        <Striker dropY={dropY} />
        <Sail dropY={dropY} />
        <Strings dropY={dropY} />
        <Simulator />
      </group>
      <ContactShadows position={[0, -0.4, 0]} opacity={0.4} scale={4} blur={2.5} far={2} />
      <OrbitControls target={[0, 1.2, 0]} enablePan={true} screenSpacePanning={true} minDistance={0.8} maxDistance={6} />
    </>
  )
}
      <ContactShadows position={[0, -0.4, 0]} opacity={0.4} scale={4} blur={2.5} far={2} />
      <OrbitControls target={[0, 1.2, 0]} enablePan={true} screenSpacePanning={true} minDistance={0.8} maxDistance={6} />
    </>
  )
}
