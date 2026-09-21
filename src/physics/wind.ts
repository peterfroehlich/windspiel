/**
 * Wind + pendulum + collision simulation.
 * Units: SI. y is DOWN from the suspension plate.
 *
 * Model — grounded in how real chimes work:
 *  1. Wind field = slow gust envelope (slider) × wandering direction + OU
 *     turbulence. Deep lulls between gusts.
 *  2. The striker pendulum is pumped by turbulence AT ITS RESONANT
 *     FREQUENCY (ω_n = √(g/L) ≈ 1.5 Hz for a ~12 cm drop). Quasi-static wind
 *     only leans the striker against a tube (silent); resonant energy builds
 *     amplitude and carries it through center at maximum velocity — that is
 *     what produces audible impacts on gust peaks and silence in lulls.
 *  3. The sail (large drag area, hanging below) follows the raw wind and
 *     visually leads; a coupling term lets it yank the striker.
 *  4. Collisions: striker disc vs tube discs. Overlap → positional separation
 *     + normal-velocity reflection (restitution e). Impact velocity maps to
 *     strike loudness/brightness. Cooldown per tube prevents machine-gun
 *     re-triggers while resting.
 */
export interface WindParams {
  strength: number   // 0..1  -> up to ~3.5 m/s mean wind
  gustFreq: number   // gusts per second
}

export interface WindState {
  x: number; z: number          // striker offset from center [m]
  vx: number; vz: number        // striker velocity [m/s]
  sailX: number; sailZ: number  // sail offset [m]
  windX: number; windZ: number  // wind vector [m/s]
  gust: number                  // current gust envelope 0..1
}

export class WindSim {
  state: WindState = { x: 0, z: 0, vx: 0, vz: 0, sailX: 0, sailZ: 0, windX: 0, windZ: 0, gust: 0 }
  onStrike: ((tube: number, velocity: number) => void) | null = null

  // geometry (SI)
  private count = 6
  private ringR = 0.055       // suspension circle radius (tube centers)
  private tubeRo = 0.0125     // tube outer radius
  private strikerR = 0.0275   // striker disc radius
  private pendulumLen = 0.12  // top plate -> striker distance
  private sailLen = 0.35      // striker -> sail distance

  setGeometry(count: number, ringR: number, tubeRo: number, strikerR: number, pendulumLen: number, sailLen: number, sailMass_g = 30, sailArea_cm2 = 80) {
    this.count = count
    this.ringR = ringR
    this.tubeRo = tubeRo
    this.strikerR = strikerR
    this.pendulumLen = pendulumLen
    this.sailLen = sailLen
    this.sailMass_g = sailMass_g
    this.sailArea_cm2 = sailArea_cm2
    // normalized mass for tension scaling: 5 g → 0, 200 g → 1
    this.sailMassNorm = Math.max(0, Math.min(1, (sailMass_g - 5) / 195))
  }

  private t = 0
  private sailVX = 0
  private sailVZ = 0
  private turbX = 0
  private turbZ = 0
  private phase = 0            // pump phase (near-resonant, slow detune wander)
  private driftSeed = Math.random() * 100
  private kickTimer = 0
  private sailMass_g = 30      // wind-catcher mass (areal density of board)
  private sailArea_cm2 = 80    // wind-catcher surface area in cm²
  private sailMassNorm = 0.5   // 0..1 normalized for tension scaling
  private cooldown: number[] = []

  update(dt: number, p: WindParams): WindState {
    const st = this.state
    dt = Math.min(dt, 0.05)
    this.t += dt

    // --- 1. gust envelope: slow, deep lulls ---
    // Squared envelope: lulls go to ~0 (amplitude decays below the tube ring
    // → silence), peaks reach 1 (striker rebuilds swing THROUGH the ring on
    // every gust → hard impacts). Linear envelopes never lull deeply enough
    // because the sine-sum floor is only ~-0.6.
    const g =
      0.55 * Math.sin(this.t * 2 * Math.PI * p.gustFreq) +
      0.30 * Math.sin(this.t * 2 * Math.PI * p.gustFreq * 2.71 + 1.3) +
      0.15 * (Math.random() * 2 - 1)
    const gustEnv = Math.pow(Math.max(0, 0.5 + 0.5 * g), 1.6)
    st.gust = gustEnv
    const windMag = p.strength * 3.5 * gustEnv

    // --- 2. wind vector: wandering direction + OU turbulence (for sail) ---
    const dirAngle = this.t * 0.35 + 0.8 * Math.sin(this.t * 0.053)
    const theta = 2.5
    const sig = windMag * 1.2
    this.turbX += (-theta * this.turbX) * dt + sig * Math.sqrt(dt) * gauss()
    this.turbZ += (-theta * this.turbZ) * dt + sig * Math.sqrt(dt) * gauss()
    st.windX = windMag * Math.cos(dirAngle) + this.turbX
    st.windZ = windMag * Math.sin(dirAngle) + this.turbZ

    // --- 3. striker: pendulum pumped at resonance ---
    // Design math (x'' = F − drag·x' − ω²·x, forced AT ω):
    //   resonant amplitude A ≈ pumpA / (drag·ω). pumpA = 0.09·windMag gives:
    //     strength 0.2 (gust peak) → A ≈ 13mm … strength 1 → A ≈ 68mm.
    //   The striker (Ø55) can't pass between the tubes (gap ≈ 42mm), so it
    //   rattles INSIDE the ring once A exceeds contact (≈15mm): swing beyond
    //   a tube face → impact at high radial velocity → bounce → maybe hit
    //   another tube. In lulls (gust ≈ 0.1) A ≈ 7mm < contact → silence.
    //   The chime breathes with the gusts, like the real thing.
    //   Detune is kept small (±3%) because Q ≈ 18: even 5% detune halves
    //   the resonant amplitude — larger wander killed the buildup entirely.
    const g0 = 9.81
    const om2 = g0 / Math.max(0.05, this.pendulumLen)   // ω² of pendulum
    const om = Math.sqrt(om2)
    const drag = 1.0                                     // amplitude halves ~1.4s in lulls

    // small bounded detuning wander (~30s period, ±3%) → rhythm never locks
    const detune = 0.03 * om * Math.sin(this.t * 0.21 + this.driftSeed)
    this.phase += (om + detune) * dt

    // linear swing along a slowly rotating axis (follows wind direction)
    const swingAngle = dirAngle
    const pumpA = 0.3 * windMag
    const pump = pumpA * Math.cos(this.phase)
    const fx = pump * Math.cos(swingAngle)
    const fz = pump * Math.sin(swingAngle)

    // occasional turbulence kicks (gust buffeting) — wind-scaled
    this.kickTimer -= dt
    if (this.kickTimer <= 0) {
      this.kickTimer = 0.4 + Math.random() * 0.8
      const kick = windMag * 0.015
      st.vx += kick * gauss()
      st.vz += kick * gauss()
    }

    // weak direct wind push (static offset ≈ few mm, always inside ring)
    const relX = st.windX - st.vx
    const relZ = st.windZ - st.vz
    st.vx += (fx + relX * 0.05 - drag * st.vx - om2 * st.x) * dt
    st.vz += (fz + relZ * 0.05 - drag * st.vz - om2 * st.z) * dt

    // sail coupling: a heavier sail hangs with more string tension, so it tugs
    // the striker harder (weight ∝ m). A string can only pull — tug scales
    // with tension but stays weak relative to direct forces.
    const tension = 0.4 + 1.6 * this.sailMassNorm   // 0.4 … 2.0
    st.vx += ((st.sailX - st.x) * tension) * dt
    st.vz += ((st.sailZ - st.z) * tension) * dt
    st.x += st.vx * dt
    st.z += st.vz * dt

    // --- 4. sail: wind force F ∝ area; acceleration = F / mass ---
    // Light sail (10 g, acrylic sheet): a≈F/m high → dances in every puff,
    // lulls snap it back. Heavy sail (200 g, thick hardwood): sluggish, only
    // real gusts move it — and via tension it drags the striker more steadily.
    const massFactor = 30 / Math.max(5, this.sailMass_g)   // relative to 30 g ref
    const areaFactor = (this.sailArea_cm2 ?? 80) / 80
    const sailDrive = 0.9 * 2.2 * massFactor * areaFactor
    const sOm2 = g0 / Math.max(0.05, this.sailLen)
    const sailFx = (st.windX - this.sailVX) * sailDrive
    const sailFz = (st.windZ - this.sailVZ) * sailDrive
    this.sailVX += (sailFx - 1.6 * this.sailVX - sOm2 * st.sailX) * dt
    this.sailVZ += (sailFz - 1.6 * this.sailVZ - sOm2 * st.sailZ) * dt
    st.sailX += this.sailVX * dt
    st.sailZ += this.sailVZ * dt
    // physically plausible: sail hangs on a short string below the striker
    const sailMax = 0.15
    st.sailX = Math.max(-sailMax, Math.min(sailMax, st.sailX))
    st.sailZ = Math.max(-sailMax, Math.min(sailMax, st.sailZ))

    this.checkCollisions()
    return st
  }

  // --- collision: striker disc vs each tube disc, impulse + separation ---
  private checkCollisions() {
    const st = this.state
    if (this.count === 0) return
    const contactR = this.strikerR + this.tubeRo
    for (let i = 0; i < this.count; i++) {
      const a = (i / this.count) * Math.PI * 2
      const cx = Math.cos(a) * this.ringR
      const cz = Math.sin(a) * this.ringR
      const dx = st.x - cx
      const dz = st.z - cz
      const dist = Math.hypot(dx, dz)
      if (dist >= contactR || dist < 1e-6) continue

      const nx = dx / dist   // normal: tube -> striker
      const nz = dz / dist

      // positional separation (push striker out of the tube)
      st.x = cx + nx * contactR
      st.z = cz + nz * contactR

      // normal velocity (negative = moving into the tube)
      const vN = st.vx * nx + st.vz * nz
      if (vN >= -0.005) continue   // resting/scraping contact: silent

      // reflect with restitution → bounce away from tube
      const e = 0.5
      st.vx -= (1 + e) * vN * nx
      st.vz -= (1 + e) * vN * nz

      // fire strike. NOTE: with a Ø55 striker in a Ø110 ring the center is
      // geometrically confined to ~±15mm, so impact speeds are inherently
      // gentle (~0.02–0.15 m/s). Gates are calibrated for that regime.
      const impact = -vN
      if (impact < 0.015) continue
      // cooldown in SIM time (robust to variable frame rate & fast headless runs)
      if (this.cooldown[i] && this.t - this.cooldown[i] < 0.12) continue
      this.cooldown[i] = this.t
      // natural variance: contact point on striker face, striker rotation and
      // micro-gusts jitter the transmitted impulse (~±3 dB around the mean)
      const jitter = 0.7 + 0.6 * Math.random()
      const vel = Math.min(1, (impact / 0.15) * jitter)
      this.onStrike?.(i, vel)
    }
  }

  /**
   * Wind paused: zero wind force, strike detection off, strong damping so
   * the striker and sail swing to rest smoothly instead of freezing mid-air.
   */
  settle(dt: number) {
    const st = this.state
    dt = Math.min(dt, 0.05)
    this.t += dt
    const g0 = 9.81
    const om2 = g0 / Math.max(0.05, this.pendulumLen)
    st.windX = 0
    st.windZ = 0
    st.gust = 0
    const settleDrag = 4.0
    st.vx += (-settleDrag * st.vx - om2 * st.x) * dt
    st.vz += (-settleDrag * st.vz - om2 * st.z) * dt
    st.x += st.vx * dt
    st.z += st.vz * dt
    this.sailVX += (-settleDrag * this.sailVX - om2 * st.sailX) * dt
    this.sailVZ += (-settleDrag * this.sailVZ - om2 * st.sailZ) * dt
    st.sailX += this.sailVX * dt
    st.sailZ += this.sailVZ * dt
  }

  /** strike via UI click: impulse pushes striker toward given tube */
  manualImpulse(tube: number) {
    const st = this.state
    const a = (tube / Math.max(1, this.count)) * Math.PI * 2
    st.vx += Math.cos(a) * 0.9
    st.vz += Math.sin(a) * 0.9
  }
}

/** Box–Muller gaussian sample, N(0,1). */
function gauss(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
