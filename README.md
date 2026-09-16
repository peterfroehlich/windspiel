# Windspiel — Wind Chime Design & Simulation

Interactive 3D wind chime designer with real-time acoustics and wind physics.
Built with React + Three.js (react-three-fiber) + Web Audio API + Zustand.

```bash
npm install
npm run dev      # → http://localhost:5173
```

## Architecture

```
src/
├── physics/            ← pure, testable domain logic (no rendering/audio deps)
│   ├── materials.ts    Material datasets: density ρ, Young's modulus E, damping Q
│   ├── tubes.ts        Euler–Bernoulli free-free beam solver:
│   │                   f_n = (β_n²/2π)·√(I/A)·√(E/ρ)/L²,  β₁²≈22.373
│   │                   overtones 1.0 / 2.756 / 5.404 / 8.933 × f₀
│   │                   T60 ≈ 2.2·Q/f₀   |   inverse solve: L(f₀) for auto-tuning
│   ├── scales.ts       Musical presets: pentatonic maj/min, Akebono, Sakura,
│   │                   In Sen, chords (maj7, min triad, dom9), whole tone
│   └── wind.ts         Wind field (base + sum-of-sines gusts + jitter),
│                       striker & sail as coupled damped pendulums,
│                       disc-vs-ring collision detection with cooldown + velocity
├── audio/
│   └── engine.ts       Web Audio synthesis: per-strike noise-burst transient
│                       (bandpass corner follows striker hardness/velocity),
│                       sine-partial banks with exponential T60 decay,
│                       detuned twins for beating, stereo pan, convolution reverb
├── state/
│   └── store.ts        Zustand store: config → derived tube lengths/frequencies
│                       (forward: physics → build; inverse: note → length)
├── scene/
│   └── ChimeScene.tsx  3D rendering, wind sim tick, strike→audio/flash wiring,
│                       click-a-tube-to-strike
└── ui/
    └── Controls.tsx    Tabbed control panel + JSON spec export
```

**Data flow:** `Controls → store.setConfig → computeTubes (physics) → tubes[] →
3D scene (geometry) + audio (specs)`. The wind simulator is a singleton; its
`onStrike` callback triggers `audio.strike(spec, velocity, pan)` and a visual flash.

## Model notes / simplifications (MVP)

- **Thin-wall tube:** I ≈ πR³t, A ≈ 2πRt → f₀ ≈ √(I/A)-independent of thickness to
  first order; thickness mainly affects sustain and mass.
- **Suspension point** default 22.4 % (node of the free-free fundamental) — movable,
  but the acoustics model does not yet penalize off-node suspension.
- **Overtones** are the ideal free-free-beam ratios; wall thickness / end effects
  shift them slightly in real tubes.
- **Collisions** use a single striker disc vs. tube inner faces; no tube-body
  vibration coupling between neighbours (knock-on effects are audible in real chimes).
- **Wind** is a phenomenological 2-DoF pendulum model, not CFD — tuned for
  plausible, musical behavior rather than aerodynamic fidelity.

## Roadmap (post-MVP)

- Per-tube length override + drag handles in 3D
- Suspension-point-dependent damping (energy loss at node vs. antinode)
- Strike-position-dependent overtone mix (hitting at node kills that partial)
- Web Audio worklet for modal-synthesis physical model
- Coupled-tube vibration, sail-tube secondary contacts
- PWA + shareable URL state, STL/cut-list export for builders
