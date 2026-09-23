import { createPortal } from 'react-dom'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pm-section">
      <h3>{title}</h3>
      {children}
    </div>
  )
}

function Callout({ title, children, type = 'gold' }: { title: string; children: React.ReactNode; type?: 'gold' | 'info' }) {
  const border = type === 'gold' ? '#f59e0b' : '#3b82f6'
  const bg = type === 'gold' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(59, 130, 246, 0.08)'
  return (
    <div style={{
      borderLeft: `3px solid ${border}`,
      background: bg,
      padding: '10px 14px',
      borderRadius: '0 8px 8px 0',
      margin: '12px 0',
      fontSize: '12px',
      lineHeight: '1.6',
    }}>
      <div style={{ fontWeight: 700, color: type === 'gold' ? '#fbbf24' : '#60a5fa', marginBottom: '4px' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export function ManufacturingTipsModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: '720px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🛠️ Workshop & Manufacturing Guide</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          <Callout title="🌟 The Golden Rule of Chime Building" type="gold">
            <b>Always cut your first test tube 10 mm longer than calculated!</b>
            <p style={{ margin: '4px 0 0' }}>
              You can easily shorten a tube by filing, sanding, or fine-cutting to raise its pitch, but
              you cannot make a short tube longer. Cut one tube slightly long, hang it by a thread at 22.4%,
              tap it, and use the <b>Tuning & Calibration Tool</b> below. The app measures your physical cut with
              the microphone, calculates your batch's real speed factor, and updates all remaining cut lengths to the exact cent.
            </p>
          </Callout>

          <Section title="1. Tube Types: Extruded vs. Cold-Drawn (Stranggepresst vs. Nahtlos gezogen)">
            <p>
              The manufacturing method of your tubing directly affects tone purity and whether your chimes ring with a steady
              pitch or an undulating "wah-wah" beating:
            </p>
            <table className="pm-table" style={{ margin: '8px 0 12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2a3242', color: '#6c8cff', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Feature</th>
                  <th style={{ padding: '6px 8px' }}>Extruded (Stranggepresst, EN 755)</th>
                  <th style={{ padding: '6px 8px' }}>Seamless Cold-Drawn (Nahtlos gezogen, EN 754)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>Wall Tolerance</b></td>
                  <td>±10% to ±15% (can vary around perimeter)</td>
                  <td>±0.05 mm (laser-concentric)</td>
                </tr>
                <tr>
                  <td><b>Acoustic Tone</b></td>
                  <td>Can have audible beating/warble if wall is asymmetrical</td>
                  <td>Laser-pure, steady fundamental tone with zero beating</td>
                </tr>
                <tr>
                  <td><b>Surface Finish</b></td>
                  <td>Visible extrusion lines (Pressriefen)</td>
                  <td>Silky-smooth, polished appearance</td>
                </tr>
                <tr>
                  <td><b>Price & Availability</b></td>
                  <td>Very cheap, stocked at every hardware store (Baumarkt)</td>
                  <td>Specialty metal suppliers (Gemmel, Alu-Verkauf)</td>
                </tr>
                <tr>
                  <td><b>Best For</b></td>
                  <td>DIY chimes, home gardens, budget builds</td>
                  <td>Professional concert-grade tuned chimes</td>
                </tr>
              </tbody>
            </table>
            <p>
              <b>Why wall thickness shifts pitch:</b> Frequency depends on the radius of gyration
              κ = ¼√(Dₒ² + Dᵢ²). Adding mass to the inside of the tube increases weight faster than bending stiffness.
              Therefore, <b>thicker walls sound flatter</b> (require shorter cut lengths), while <b>thinner walls sound sharper</b> (require longer cut lengths).
            </p>
          </Section>

          <Section title="2. Cutting & Drilling Best Practices">
            <ul className="pm-list">
              <li>
                <b>Miter Saw Blade:</b> Use a fine-toothed carbide blade (60–80 teeth, negative rake angle) designed for non-ferrous metals.
                Use a wax stick or cutting oil to keep aluminum from galling on the teeth.
              </li>
              <li>
                <b>Deburring:</b> Always deburr both inner and outer edges with a deburring blade or countersink. Rough burrs cause parasitic
                buzzing harmonics.
              </li>
              <li>
                <b>Suspension Holes:</b> Drill at exactly <b>22.4%</b> of the tube length from the top (the mode-1 node). Drilling off-node
                dampens the fundamental vibration by up to 4×.
              </li>
              <li>
                <b>Hole Chamfering:</b> Lightly chamfer the drilled suspension holes with a countersink bit so sharp edges don't fray the cord.
              </li>
            </ul>
          </Section>

          <Section title="3. Cord & Striker Setup">
            <ul className="pm-list">
              <li>
                <b>Cord Material:</b> Use braided polyester, Dacron, or Spectra/Kevlar cord. Never use nylon monofilament (stretches and fails in UV)
                or cotton string (rots quickly outdoors).
              </li>
              <li>
                <b>Center Strike Antinode:</b> Position the striker at the tube midpoint (50% drop). Striking at 50% excites the richest fundamental
                frequency while naturally silencing the harsh second partial.
              </li>
              <li>
                <b>Striker Material:</b> Hardwood (oak, beech, ash), UV-resistant plastics (POM/Delrin, ASA, PETG), or thick acrylic provide
                the optimal balance of punchy attack without harsh metallic clatter.
              </li>
            </ul>
          </Section>

          <Section title="4. Sail Dropper: Rigid Lever Rod vs. Flexible Cord">
            <Callout title="🚀 Workshop Recommendation: Use a Wind-Inert Rigid Rod!" type="gold">
              <b>Replace the lower cord between striker and sail with a 2.0–2.5 mm rigid rod.</b>
              <p style={{ margin: '4px 0 0' }}>
                While budget commercial chimes hang the sail on a floppy string, high-end architectural chimes use a thin,
                stiff rod. Because the rod profile is so narrow (Ø 2 mm), it has near-zero aerodynamic drag (it is &quot;wind-inert&quot;),
                allowing clean undisturbed wind to hit the sail while providing major mechanical advantages.
              </p>
            </Callout>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', margin: '12px 0' }}>
              <div style={{ background: '#141a26', border: '1px solid #2a3242', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontWeight: 700, color: '#f87171', marginBottom: '6px', fontSize: '13px' }}>
                  ⚠️ Flexible Cord Problems
                </div>
                <ul className="pm-list" style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', lineHeight: 1.5, color: '#aeb8cc' }}>
                  <li>
                    <b>The &quot;Death Wrap&quot;:</b> In storm gusts, the sail whips upward and wraps around the tubes, permanently disabling the chime until manually untangled.
                  </li>
                  <li>
                    <b>Kite Planing:</b> Strong winds push the sail horizontal like a kite. It planes edge-on, dropping drag to zero and silencing the chime during the best breezes.
                  </li>
                  <li>
                    <b>Slack Impulse Loss:</b> Cord slack and elasticity absorb sudden wind impulses instead of driving the striker.
                  </li>
                </ul>
              </div>

              <div style={{ background: '#141a26', border: '1px solid #2a3242', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontWeight: 700, color: '#34d399', marginBottom: '6px', fontSize: '13px' }}>
                  ✅ Rigid Lever Rod Advantages
                </div>
                <ul className="pm-list" style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', lineHeight: 1.5, color: '#aeb8cc' }}>
                  <li>
                    <b>100% Anti-Tangle:</b> Geometrically impossible for the sail to flip over or wrap around the tubes, even in 15 m/s storms.
                  </li>
                  <li>
                    <b>Instantaneous Torque (τ = F·L):</b> Gusts on the sail instantly transmit as powerful lateral shear to the striker with zero impulse damping.
                  </li>
                  <li>
                    <b>Keeps Sail Vertical:</b> Acts as a pendulum keel, keeping the full surface area perpendicular to the airflow in all wind speeds.
                  </li>
                </ul>
              </div>
            </div>

            <h4 style={{ color: '#6c8cff', margin: '14px 0 6px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Recommended Workshop Materials & Assembly
            </h4>
            <ul className="pm-list">
              <li>
                <b>Stainless Steel TIG Wire (1.4316 / 316L):</b> 2.0 or 2.4 mm diameter. Inexpensive, springy, laser-straight, and 100% weatherproof. Bicycle spokes (2.0 mm stainless) also work wonderfully for medium chimes.
              </li>
              <li>
                <b>Pultruded Carbon Fiber Rod (CFK):</b> 2.0 mm diameter. Extremely lightweight, rigid, and pitch-black aesthetics.
              </li>
              <li>
                <b>Mounting:</b> Keep flexible braided cord from the top plate to the striker (allowing 360° free swing). Drill a 2.0–2.5 mm blind hole in the striker underside, press-fit or epoxy the rod, and secure the sail at the bottom with a set-screw collar or silicone stop ring.
              </li>
            </ul>
          </Section>

        </div>
      </div>
    </div>,
    document.body
  )
}
