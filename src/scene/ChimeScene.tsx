import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { useStore, tubeSpec, tubeGeometry } from '../state/store'
import { MATERIALS, STRIKER_MATERIALS } from '../physics/materials'
import { WindSim } from '../physics/wind'
import { audio } from '../audio/engine'
import { partialExcitation } from '../physics/contact'
import { tubeFrequencies } from '../physics/tubes'

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
  const s = config.suspensionPoint * L            // pivot distance below tube top
  // compound pendulum about the pivot: ω = √(g·d / (L²/12 + d²)),
  // d = distance pivot → center of mass (a real physical wobble rate ~1 Hz)
  const d = L / 2 - s
  const omega = Math.sqrt((9.81 * Math.max(d, 0.01)) / (L * L / 12 + d * d))
  // per-tube strike state: start time & velocity of last wobble excitation
  const strikeState = useRef({ t: -1e9, vel: 0, phase: Math.random() * Math.PI * 2 })

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
    <group ref={pivotRef} position={[x, -s, z]}>
      <mesh position={[0, s - L / 2, 0]} castShadow
        onPointerDown={(e) => {
          e.stopPropagation()
          audio.init(); audio.resume()
          audio.strike(spec, 0.8, x * 4)
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
    </group>
  )
}

function Striker() {
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
    const yStriker = -(config.strikerDrop_mm / 1000)
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

  const y = -(config.strikerDrop_mm / 1000)
  // striker geometry follows the selected contact form
  const R = config.strikerDiameter_mm / 2000
  const h = config.strikerHeight_mm / 1000
  const strikeMat = (
    <meshStandardMaterial color={mat.color} roughness={mat.roughness} metalness={config.strikerMaterial === 'metal' ? 0.9 : 0.05} />
  )
  let strikerMesh: React.ReactNode
  switch (config.strikerForm) {
    case 'sphere':   // ball
      strikerMesh = (
        <mesh castShadow>
          <sphereGeometry args={[R, 32, 16]} />
          {strikeMat}
        </mesh>
      )
      break
    case 'donut':    // torus ring
      strikerMesh = (
        <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[R * 0.72, Math.max(0.006, R * 0.28), 16, 40]} />
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

function Sail() {
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
      const strikerY = -(config.strikerDrop_mm / 1000)
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
  return (
    <>
      <mesh ref={ref} position={[0, y, 0]} castShadow>
        <boxGeometry args={[0.08, 0.12, 0.004]} />
        <meshStandardMaterial color="#8b3a3a" roughness={0.6} />
      </mesh>
      <primitive ref={stringRef} object={stringLine} />
    </>
  )
}

function Strings({ tubeCount, ringR, lengths }: { tubeCount: number; ringR: number; lengths: number[] }) {
  const lines = useMemo(() => {
    const pts: [number, number, number, number][] = []
    for (let i = 0; i < tubeCount; i++) {
      const a = (i / tubeCount) * Math.PI * 2
      const x = Math.cos(a) * ringR, z = Math.sin(a) * ringR
      const hang = (lengths[i] ?? 0.3) * 0.224  // suspension point at 22.4%
      pts.push([x, 0, z, -hang])
    }
    return pts
  }, [tubeCount, ringR, lengths.join(',')])

  return (
    <group>
      {lines.map((p, i) => {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(p[0], 0, p[2]),
          new THREE.Vector3(p[0], p[3], p[2]),
        ])
        return (
          <primitive key={i} object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#666' }))} />
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
      const neighbours = config.coupling
        ? tubes.filter((_, j) => j !== tube).map((t, j2) => tubeSpec(config, t, j2 < tube ? j2 : j2 + 1))
        : []
      // Hertzian contact: partial excitation through the contact-time low-pass
      const striker = {
        material: config.strikerMaterial, form: config.strikerForm,
        diameter_mm: config.strikerDiameter_mm, height_mm: config.strikerHeight_mm,
      }
      const vImp = Math.max(0.02, vel * 0.15)   // normalized vel → m/s (sim regime)
      const f0 = tubeFrequencies(spec).f0
      const partials = [1, 2.756, 5.404, 8.933].map((r) =>
        partialExcitation(r * f0, striker, spec, vImp, xi))
      audio.strike(spec, vel, pan, xi, config.suspensionPoint, neighbours, { partials })
      useStore.getState().flash(tube, vel)
    }
  }, [])

  return null
}

export function ChimeScene() {
  const { config, tubes } = useStore()
  return (
    <>
      {/* no scene background: page CSS provides it, keeping the WebGL canvas
          transparent so the "back" wind-line layer can pass behind the chime */}
      <fog attach="fog" args={['#0b0e14', 4, 12]} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[3, 6, 4]} intensity={2} castShadow />
      <Environment preset="city" />
      <group position={[0, 1.6, 0]}>
        <mesh position={[0, 0.01, 0]}>
          <cylinderGeometry args={[0.09, 0.09, 0.02, 32]} />
          <meshStandardMaterial color="#3a2f24" roughness={0.7} />
        </mesh>
        {Array.from({ length: config.tubeCount }, (_, i) => <TubeMesh key={i} index={i} />)}
        <Striker />
        <Sail />
        <Strings tubeCount={config.tubeCount} ringR={config.suspensionRadius_mm / 1000}
          lengths={tubes.map((t) => t.length_mm / 1000)} />
        <Simulator />
      </group>
      <ContactShadows position={[0, -0.4, 0]} opacity={0.4} scale={4} blur={2.5} far={2} />
      <OrbitControls target={[0, 1.2, 0]} enablePan={false} minDistance={0.8} maxDistance={6} />
    </>
  )
}
