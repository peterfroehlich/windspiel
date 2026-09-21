/** Hover help texts for every setting (? markers) and the Physics modal. */

export const HELP: Record<string, string> = {
  tubeCount:
    'Number of hanging tubes (3–12). More tubes = richer soundscape but the striker ' +
    '(fixed diameter) hits a smaller fraction of them. Tube spacing is set by the ' +
    'suspension radius; with 12 tubes the striker may only reach the outer ones.',

  material:
    'Tube material. Sound speed √(E/ρ) sets the frequency for a given length — ' +
    'aluminum (5055 m/s) and bamboo (5077 m/s) need similar lengths; carbon fibre ' +
    '(9186 m/s) needs much longer tubes for the same pitch. Damping Q controls ' +
    'sustain: aluminum/stainless ring for many seconds, bamboo dies in under a second. ' +
    'Density also determines how loud a strike is (heavier = slower response to the same impulse).',

  outerDiameter:
    'Outer tube diameter. f₀ ∝ √(I/A) ∝ R (at fixed wall ratio), so bigger ' +
    'diameters ring higher at the same length — the app re-solves every tube ' +
    'length when you change it, keeping the tuning. Diameter also drives loudness ' +
    '(radiating surface ∝ R·L) and sustain; wider tubes need slightly longer ' +
    'lengths for the same note (length ∝ √R).',

  wallThickness:
    'Wall thickness. To first order pitch is independent of it (thin-wall theory), ' +
    'but thicker walls: ring longer (more elastic energy stored per unit of surface ' +
    'loss), weigh more (quieter response to the same striker impulse), and shift the ' +
    'overtone ratios slightly sharper. Range 0.3–5 mm covers commercial chime tubing.',

  solid:
    'Solid rod instead of a hollow tube. Physics: I/A halves (√(I/A) = R/2 vs R/√2), ' +
    'so the same-length rod rings ~29% lower — or the same pitch needs a ~16% shorter rod. ' +
    'Rods are heavier (quieter, needs harder strike) and sustain a bit longer. ' +
    'The wall slider is irrelevant in this mode.',

  suspensionRadius:
    'Radius of the suspension circle — how far apart the tubes hang on the top plate. ' +
    'Wider = more separation, airier look, but the striker (fixed size) may no longer ' +
    'reach the tubes. Narrower = denser cluster, more reliable strikes. This also defines ' +
    'the arena the wind simulator plays in: the striker bounces inside this ring.',

  suspensionPoint:
    'Where on each tube the string attaches (fraction of tube length from the top). ' +
    'This is acoustically the most misunderstood setting: hang the tube at the mode-1 ' +
    'NODE (22.4%) and the fundamental loses no energy to the strings — maximum sustain. ' +
    'Hang anywhere else and each vibration cycle pumps energy into the support: at the ' +
    'center (50%) the fundamental decays ~2× faster while the 2nd partial (node at center) ' +
    'actually survives longer. Watch the T60 row in the strike analysis update live.',

  sameAbsoluteSuspension:
    'Hang all tubes at the exact same absolute distance in mm from their top ends (derived from ' +
    'the longest tube\'s nodal distance). Tube tops hang in a uniform horizontal line, while ' +
    'the effective nodal fraction adjusts per tube.',

  strikerMaterial:
    'Striker material. Sets both transient and sustain character: rubber (hardness 0.15) ' +
    'produces a soft, dull "tup" with long Hertzian contact (~2 ms) that filters out the ' +
    'high partials; hardwood a warm knock; PETG and ASA durable outdoor 3D prints (PETG balanced; ' +
    'ASA warm with maximum UV/heat stability); metal a bright click with the highest impulse transfer.',

  strikerForm:
    'Contact geometry at the impact point — it shapes the tone through the Hertzian ' +
    'contact duration τ ∝ (m²/(R_eff·E*²·v))^(1/5), a natural low-pass with bandwidth ' +
    '≈ 0.35/τ. Rounded contacts (long τ) mute the inharmonic upper partials → smooth, ' +
    'pure tone. Sharp rims (short contact radius) excite the 2.756× and 5.404× partials ' +
    '→ harsh metallic clank. Note the curvature combines with the tube\'s own radius: ' +
    'even a flat face (such as the Multisided polygon) contacts a round tube at R = tube radius.',

  strikerDistance:
    'Distance between the striker edge and the inner tube wall when at rest. ' +
    'In Automatic mode, setting this clearance determines the striker diameter, and the ' +
    'thickness is automatically calculated to achieve the ideal acoustic impedance mass (m_striker ≈ m_eff). ' +
    'Smaller distance (e.g. 8–10 mm) = sounds in gentle breezes. Larger distance (e.g. 20–25 mm) = sounds only in stronger gusts.',

  strikerDiameter:
    'Striker disc diameter. Bigger = more mass (louder, deeper transient) but needs more ' +
    'swing room: in the sim the disc must fit inside the tube ring, and a disc wider than ' +
    'the gaps can never pass between tubes — it rattles inside the ring, striking more often ' +
    'but gentler. A small striker reaches further in, hitting fewer tubes but harder.',

  strikerHeight:
    'Striker thickness (axial height). Determines the vertical contact window: a thick ' +
    'striker tolerates more swing-height variation and produces a broader, noisier impact ' +
    'transient; a thin one gives a crisp click. Also adds mass = louder.',

  strikerDrop:
    'Vertical distance from the tube tops down to the striker. This sets WHERE on the tube ' +
    'the impact lands (ξ = drop / tube length) — the single biggest tone control after the ' +
    'tuning itself. The green marker shows the optimum: 50% of the longest tube, where the ' +
    'fundamental is at its antinode and the harsh 2.756×f₀ partial sits on a node (−112 dB). ' +
    'High up the tube (small drop) = thin, overtone-heavy sound. The slider caps at 90% of ' +
    'the shortest tube so every tube stays reachable.',

  windStrength:
    'Mean wind speed (0–100% ≈ 0–3.5 m/s at the sail). Drives the pendulum energy: below ' +
    '~25% the striker rarely reaches the tubes (silence); above 80% it rattles almost ' +
    'continuously. The sim models gusts (modulated wind speed), wandering direction, and ' +
    'turbulence — so strikes cluster on gust peaks and vanish in lulls, like a real chime.',

  gustFrequency:
    'How often gust waves arrive (in Hz, ~0.02 = one long swell per minute, 1 = nervy ' +
    'flutter). Gusts modulate wind speed with deep lulls between peaks — the rhythm of ' +
    'the chime follows this envelope: bursts of strikes on the peak, silence in the lull.',

  volume:
    'Master output volume of the audio engine. The underlying per-strike loudness already ' +
    'models impact velocity, striker hardness and modal response — this is just the overall fader.',

  tuningMode:
    'Scale preset: pick a mood + scale + root and every tube is automatically tuned by ' +
    'solving the beam equation for the exact length. Manual: type note names per tube ' +
    '(e.g. D#5) and the app computes matching tube lengths.',

  mood:
    'Character grouping of the scale presets — Bright (major intervals, sweet when struck ' +
    'together), Meditative (Japanese and suspended colors), Dark (minor-ish, bittersweet ' +
    'clusters). Chimes play simultaneous intervals, so the interval SET is what matters, ' +
    'not a melody.',

  scale:
    'The interval set laid out across the tubes (cycles over octaves if more tubes than ' +
    'scale degrees). Pentatonics avoid dissonant intervals entirely — any random wind ' +
    'combination sounds consonant, which is why real chimes use them. Japanese scales ' +
    'give that meditative koto feel; chords (maj7, dom9) sound lush but only when few tubes sound.',

  rootNote:
    'Transposes the whole scale to another key. The transposition is relative to the ' +
    'scale\'s native root, so the character is preserved — pentatonic minor rooted on F ' +
    'is exactly pentatonic minor, just lower. Choose roots that put the longest tube ' +
    'in a comfortable length range for your material.',

  coupling:
    'Sympathetic vibration between tubes, carried through the suspension frame. ' +
    'A struck tube pumps its decay energy through the strings into the top plate; ' +
    'the plate drives every other tube. Neighbours whose partials lie within their ' +
    'own resonance bandwidth (detuning < f/2Q) ring quietly at their OWN pitch with ' +
    'their OWN long decay — the "ghost tones" of real chimes. The struck tube loses ' +
    'that energy, so its ring shortens slightly. Uses a Lorentzian coupled-mode ' +
    'model: κ = 0.5 / (1 + (Δf/γ)²). Air-borne coupling (~60 dB weaker) is not modeled.',

  sailMass:
    'Mass of the wind catcher (for its fixed size, this is the board\'s areal ' +
    'density — a 10 g acrylic sheet vs a 200 g hardwood block). Wind force on the ' +
    'board stays the same, so acceleration = F/m: a light sail darts around in every ' +
    'puff and makes the chime flighty and erratic; a heavy sail barely responds to ' +
    'puffs but its greater weight tensions the string, so it tugs the striker harder ' +
    'in real gusts — steadier, stronger strikes. Around 30 g behaves like a typical ' +
    'commercial chime.',

  advanced:
    'Per-tube editing: give individual tubes their own material, diameter or wall ' +
    'thickness instead of sharing the global settings. Lengths are re-solved per tube ' +
    'so every tube keeps its note — e.g. make one bamboo tube among aluminum neighbors ' +
    '(it comes out shorter, duller and quieter), or thicken a single tube for extra ' +
    'sustain. Tubes with overrides are highlighted; ⟲ resets one tube to the globals.',

  topPlate:
    'The suspension plate the whole chime hangs from — canopy, crown, or top disc in ' +
    'trade terms. Choose its shape and size; the suspension circle (Tubes section) must ' +
    'fit inside it. Purely visual — it does not affect the acoustics.',

  tubeOffset:
    'How far below the top plate the tubes START (the plate hangs on its own string, ' +
    'then a gap, then the tubes). 0 = tubes touch the plate; larger values give an ' +
    'airy floating look. The striker/sail geometry follows automatically.',

  tubeAlignment:
    'Controls how the tubes are vertically aligned relative to the mounting plate: ' +
    '"All starting at the same offset" aligns all tube tops at the configured offset; ' +
    '"All aligned by suspension point" aligns all drill/suspension holes horizontally for uniform cord length; ' +
    '"All aligned by center strike" centers each tube at its midpoint so the striker hits every tube at its fundamental antinode.',

  sailShape:
    'Shape of the wind catcher at the bottom. The physics only cares about its area ' +
    'and mass (set in the Wind section), so the shape is an aesthetic choice — but it ' +
    'changes how much of the swinging is visible: a big flat rectangle catches the eye, ' +
    'a feather slat looks subtle. Color is fully customizable.',

  sailArea:
    'Surface area of the wind catcher in cm². Larger sails capture more wind energy and swing ' +
    'more readily in gentle breezes, while smaller sails need stiffer gusts to move the striker.',

  exportSpec:
    'Downloads the current design as JSON: every note, frequency, computed tube length ' +
    'and decay time — a build sheet for actually making this chime in a workshop.',
}
