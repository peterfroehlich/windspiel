import { createPortal } from 'react-dom'
import { useStore } from '../state/store'
import { MATERIALS } from '../physics/materials'
import { OVERTONE_RATIOS } from '../physics/tubes'
import { modeNodes, optimalStrikePoint } from '../physics/modes'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pm-section">
      <h3>{title}</h3>
      {children}
    </div>
  )
}

function Eq({ children }: { children: React.ReactNode }) {
  return <div className="pm-eq">{children}</div>
}

export function PhysicsModal({ onClose }: { onClose: () => void }) {
  const { config, tubes } = useStore()
  const opt = optimalStrikePoint()
  const m1nodes = modeNodes(0).map(n => (n * 100).toFixed(1) + '%').join(' and ')
  // Portal to <body>: the settings panel has backdrop-filter, which makes it
  // the containing block for position:fixed — without the portal the modal
  // would be trapped (and clipped) inside the panel instead of covering the app.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>The physics behind Windspiel</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          <Section title="1. Tube pitch — Euler–Bernoulli beam theory">
            <p>
              Each tube is modeled as a free-free beam (both ends unconstrained — hanging on a
              string at a node is the closest physical realization). The bending-wave equation
              gives the vibration frequencies as:
            </p>
            <Eq>f<sub>n</sub> = (β<sub>n</sub>² / 2π) · √(I/A) · √(E/ρ) / L²</Eq>
            <p>
              where E is Young's modulus, ρ the density, L the length, I the area moment of
              inertia and A the cross-section area. For a circular tube of outer radius R and
              wall thickness t: I = π(R⁴−Rᵢ⁴)/4, A = π(R²−Rᵢ²), Rᵢ = R−t.
              The first four β² values are 22.373, 61.673, 121.013, 199.854.
            </p>
            <p>
              <b>Key consequences:</b> frequency scales with 1/L² — doubling length drops the
              pitch one octave plus a fifth (×¼). For the exact circular section
              I/A = (R²+Rᵢ²)/4, so at fixed wall ratio f₀ ∝ R: bigger diameters ring
              higher at the same length (and need longer tubes for the same note —
              the app re-solves lengths automatically).
            </p>
            <p>
              The inverse problem — "which length sounds like C5?" — is what the app solves for
              every tube when you pick a scale: L = √((β₁²/2π)·√(I/A)·√(E/ρ) / f₀).
            </p>
          </Section>

          <Section title="2. Inharmonic overtones">
            <p>
              Unlike a guitar string, a free-free beam's overtones are NOT integer multiples.
              The ratios are fixed by the β² sequence:
            </p>
            <Eq>f₀ : 2.756·f₀ : 5.404·f₀ : 8.933·f₀</Eq>
            <p>
              This inharmonicity is the "metallic chime" sound. The 2.756× partial is the
              troublemaker — harsh if prominent. Fortunately its mode shape has a node at the
              tube center, so striking the center suppresses it by ~112 dB (see §4).
            </p>
          </Section>

          <Section title="3. Sustain and damping">
            <p>
              For a lightly damped oscillator the decay time is T60 ≈ 2.2·Q/f₀, where Q is the
              material's quality factor. Aluminum (Q≈3000) rings ~30× longer than bamboo (Q≈120)
              at the same pitch. Wall thickness adds a small correction (thicker walls store more
              elastic energy per unit of surface loss), and solid rods a bit more.
            </p>
            <p>
              <b>Suspension losses:</b> energy also drains through the suspension strings at a rate
              proportional to the mode's displacement at the attachment point:
            </p>
            <Eq>T60' = T60 / (1 + 3·φ<sub>n</sub>(ξ<sub>susp</sub>)²)</Eq>
            <p>
              Hung exactly at a mode's node (mode 1: {m1nodes}) the term vanishes — full sustain.
              At an antinode (center) the fundamental decays up to 4× faster while the 2nd partial
              (node at center) survives longer. This trade-off is real physics, not decoration.
            </p>
          </Section>

          <Section title="4. Strike position & mode shapes">
            <p>
              The free-free mode shapes are
            </p>
            <Eq>φ<sub>n</sub>(ξ) = cosh(βξ) + cos(βξ) − σ<sub>n</sub>·[sinh(βξ) + sin(βξ)]</Eq>
            <p>
              and striking at position ξ excites mode n in proportion to |φ<sub>n</sub>(ξ)|.
              Striking ON a mode's node mutes that mode entirely. Hence:
            </p>
            <p>
              <b>Optimal strike = tube center (ξ = 0.5):</b> maximum fundamental (φ₁ = 0.61 of
              peak), 2nd partial suppressed by {opt.overtoneSuppressionDb.toFixed(0)} dB.
              That is why the striker's default drop is 50% of the longest tube, and why moving
              the Drop slider audibly brightens/thins the tone.
            </p>
          </Section>

          <Section title="5. From impulse to sound pressure">
            <p>
              Each strike is a Hertzian contact impulse. The chain the app evaluates:
            </p>
            <Eq>J = μ·(1+e) · v&emsp;→&emsp;v<sub>point</sub> = J / m<sub>eff</sub>(ξ)</Eq>
            <p>
              with the REDUCED MASS μ = m<sub>s</sub>·m<sub>eff</sub>/(m<sub>s</sub>+m<sub>eff</sub>) —
              the tube gives way during impact, so the fixed-target approximation J = m<sub>s</sub>(1+e)v
              would overestimate the impulse by ~1.5× for a hardwood striker on aluminum.
              Restitution e comes from striker hardness (rubber 0.17 … metal 0.55). Radiated power:
            </p>
            <Eq>P = σ<sub>rad</sub> · ρ<sub>air</sub> · c<sub>air</sub> · S · u²<sub>rms</sub>&emsp;→&emsp;L<sub>p</sub> = 10·log₁₀(P/1e-12) − 8 dB</Eq>
            <p>
              with radiation efficiency σ_rad ≈ 0.03 (slender cylinder, below coincidence) and
              S the tube surface. A typical strike lands at 83–97 dB SPL @1 m — matching
              measurements of real chimes. The audio engine maps velocity → gain through this chain.
            </p>
          </Section>

          <Section title="5b. Contact mechanics — striker form & material">
            <p>
              The contact itself lasts τ = 2.87·(m² / (R<sub>eff</sub>·E*²·v))^(1/5) seconds
              (Hertz), with E* = 1/(0.91/E₁ + 0.91/E₂) and the combined curvature
              1/R<sub>eff</sub> = 1/R<sub>striker</sub> + 1/R<sub>tube</sub>. This contact
              pulse is a natural low-pass at f<sub>c</sub> ≈ 0.35/τ: soft rubber (E = 50 MPa)
              gives τ ≈ 2 ms → f<sub>c</sub> ≈ 175 Hz → a warm "tup" with the upper partials
              filtered out; hardwood ≈ 0.2 ms → partials up to ~1.8 kHz fully excited;
              a sharp cylinder rim rolls the inharmonic 2.756×/5.404× partials down and
              brightens the attack — the metallic "clank".
            </p>
            <p>
              <b>Optimal striker weight</b> is an impedance-matching problem: too light bounces
              off without transferring energy (μ → m<sub>s</sub> ≪ m<sub>eff</sub>), too heavy
              can't be pumped by the sail (a = F/m → static lean, no impact velocity). The
              balance point is m<sub>s</sub> ≈ m<sub>eff</sub>(0.5) of the longest tube
              (≈ 90 g for the default aluminum chime). The Striker section shows this as
              "◎ optimal".
            </p>
          </Section>

          <Section title="6. Wind, pendulum and collisions">
            <p>
              The wind field is a gust envelope (sum of two sines at the gust slider frequency
              and 2.71×, squared for deep lulls) times a wandering direction, plus an
              Ornstein–Uhlenbeck turbulence process whose energy is centered near the pendulum's
              resonance ω = √(g/L<sub>susp</sub>) ≈ 1.5 Hz.
            </p>
            <p>
              The striker is a damped 2D pendulum pumped at resonance — quasi-static wind merely
              leans it against a tube (silent); resonant buildup carries it <i>through</i> the ring
              with real impact velocity. Each strike gets ±30% impulse jitter (contact point,
              rotation, micro-gusts). Collisions are circle–circle impulses with restitution 0.5:
              the striker bounces tube-to-tube, so a Ø55 mm disc in a Ø110 mm ring rattles
              inside the ring at ~0.02–0.15 m/s — the gentle regime of real chimes.
            </p>
            <p>
              The sail (wind catcher) is a second, drag-dominated pendulum below the striker.
              Its wind force is fixed by area, so acceleration = F/m: a light sail (10 g)
              darts in every puff; a heavy one (200 g) only responds to real gusts. Its mass
              also sets string tension, so a heavier sail tugs the striker harder —
              tension scales from 0.4 (5 g) to 2.0 (200 g). It must always hang below the
              longest tube — the app positions and sizes its string accordingly.
            </p>
          </Section>

          <Section title="6b. Tube-to-tube sympathetic coupling">
            <p>
              With <b>Tube coupling</b> enabled, a struck tube drives the frame through its
              suspension strings and the frame drives all other tubes — modeled with
              coupled-mode theory. Each neighbour partial responds with a Lorentzian in the
              detuning Δf from the driven fundamental, of width equal to its own half-bandwidth
              γ = f/(2Q):
            </p>
            <Eq>κ(Δf) = min(0.8, 0.5 / (1 + (Δf/γ)²))</Eq>
            <p>
              Consequences: scales with close intervals (whole tone, chromatic clusters) produce
              audible "ghost tones" — neighbours ringing at their own pitch with longer decay
              than the direct strike; consonant wide-interval scales barely couple. The energy
              leaked into the frame also shortens the struck tube's ring. Air-borne coupling is
              ~60 dB weaker and not modeled; mechanical knock-on (tubes actually swinging into
              each other) would require full tube pendulum dynamics.
            </p>
          </Section>

          <Section title="7. Current design summary">
            <table className="pm-table">
              <tbody>
                <tr><td>Tubes</td><td>{config.tubeCount} × {MATERIALS[config.material].label}{config.solid ? ' (solid rod)' : `, Ø${config.outerDiameter_mm} mm × ${config.wallThickness_mm} mm wall`}</td></tr>
                <tr><td>Bar speed √(E/ρ)</td><td>{Math.sqrt(MATERIALS[config.material].youngsModulus / MATERIALS[config.material].density).toFixed(0)} m/s, Q = {MATERIALS[config.material].dampingQ}</td></tr>
                <tr><td>Lengths</td><td>{tubes.map(t => (t.length_mm / 1000).toFixed(2)).join(' / ')} m</td></tr>
                <tr><td>Suspension</td><td>circle {config.suspensionRadius_mm} mm, strings at {(config.suspensionPoint * 100).toFixed(1)}% of length</td></tr>
                <tr><td>Striker</td><td>{config.strikerDiameter_mm} mm × {config.strikerHeight_mm} mm, drop {config.strikerDrop_mm} mm</td></tr>
                <tr><td>Wind</td><td>{(config.windStrength * 100).toFixed(0)}% strength, gusts {config.gustFrequency.toFixed(2)} Hz</td></tr>
              </tbody>
            </table>
          </Section>

          <Section title="8. Known simplifications">
            <ul className="pm-list">
              <li>Thin-wall Euler–Bernoulli: no shear/rotary inertia (Timoshenko) — fine below ~5 kHz</li>
              <li>Overtones use ideal free-free ratios; real end effects shift them a few ‰</li>
              <li>No tube-to-tube vibration coupling (real chimes "sympathize")</li>
              <li>σ_rad is a single estimate, not frequency-dependent</li>
              <li>Wind sim is phenomenological 2-DoF, not aerodynamic</li>
              <li>2nd-partial suppression of −112 dB assumes idealized point contact</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>,
    document.body
  )
}
