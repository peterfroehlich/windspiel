# Windspiel — Wind Chime Design & Simulation

Interactive 3D wind chime designer with real-time acoustics and wind physics.
React + Three.js (react-three-fiber) + Web Audio API + Zustand.

**Live demo:** https://peterfroehlich.github.io/windspiel/

```bash
npm install
npm run dev      # → http://localhost:5173
```

## Features

- **Tube design:** 3–12 tubes, 7 materials (aluminum, brass, bronze, copper, stainless,
  bamboo, glass, carbon fibre — with real ρ/E/Q datasets), per-tube overrides in
  advanced mode (material/diameter/wall/solid per tube), hollow tube or solid rod
- **Physics-based tuning:** Euler–Bernoulli free-free beam solver — pick a scale
  (pentatonics, Japanese, Hawaiian, Chinese, Mongolian, Balinese, Westminster, chords,
  12 roots) and every tube length is solved exactly; or enter notes manually
- **Strike physics:** exact free-free mode shapes → strike position colors the tone
  (center strike = loudest fundamental, 2nd partial suppressed ~112 dB), suspension
  node damping (hang at 22.4 % for full sustain), impulse→SPL chain for loudness
  estimates, striker material/mass, tube-to-tube sympathetic coupling
- **Wind simulation:** gust envelope with deep lulls, wandering direction, OU
  turbulence, resonant pendulum pumping, circle-collision striker with restitution,
  configurable sail mass, stop/start button, flowing comic wind lines
- **3D scene:** hanging tubes wobbling about their suspension points, swinging
  striker + wind catcher below the longest tube, click any tube to strike it

See the in-app **⚛ Physics!** modal for the complete model documentation.
