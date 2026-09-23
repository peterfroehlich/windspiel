import { createPortal } from 'react-dom'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pm-section">
      <h3>{title}</h3>
      {children}
    </div>
  )
}

function Callout({ title, children, type = 'gold' }: { title: string; children: React.ReactNode; type?: 'gold' | 'info' | 'warn' }) {
  const border = type === 'gold' ? '#f59e0b' : type === 'warn' ? '#ef4444' : '#6366f1'
  const bg = type === 'gold' ? 'rgba(245, 158, 11, 0.08)' : type === 'warn' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(99, 102, 241, 0.08)'
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
      <div style={{ fontWeight: 700, color: type === 'gold' ? '#fbbf24' : type === 'warn' ? '#f87171' : '#818cf8', marginBottom: '4px' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export function DesignTipsModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: '740px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>💡 Chime Design & Acoustic Guide</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          <Section title="1. Tube Mounting & String Clearance (Crucial for Sustain)">
            <Callout title="⚠️ Zero String-to-Tube Contact Rule" type="warn">
              <b>The suspension string must NEVER touch or rub against the tube body or top rim!</b>
              <p style={{ margin: '4px 0 0' }}>
                Acoustic vibrations in a chime tube flex the entire surface. If the suspension cord wraps tightly over the top rim
                or rubs along the tube exterior, the cord acts as a friction damper — instantly killing the sustain and introducing
                harsh buzzing.
              </p>
            </Callout>

            <p>
              To isolate the tube acoustically, you must choose one of two proven mounting techniques:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', margin: '12px 0' }}>
              <div style={{ background: '#141a26', border: '1px solid #2a3242', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontWeight: 700, color: '#6c8cff', marginBottom: '6px', fontSize: '13px' }}>
                  Option A: Tube Spreader (Abstandshalter)
                </div>
                <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.5, color: '#aeb8cc' }}>
                  Place a small horizontal bar, disk, or spreader ring directly above each tube.
                  The spreader must be <b>wider than the tube outer diameter</b>. The two cord legs exit the 22.4% node holes
                  and angle outward in a V-shape to the spreader, clearing the tube rim by several millimeters without touching.
                </p>
              </div>

              <div style={{ background: '#141a26', border: '1px solid #2a3242', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontWeight: 700, color: '#a78bfa', marginBottom: '6px', fontSize: '13px' }}>
                  Option B: Internal Running String (Innenführung)
                </div>
                <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.5, color: '#aeb8cc' }}>
                  Run a single central cord down the <b>inside of the tube</b> from the canopy. At the 22.4% suspension node,
                  the cord anchors to a cross-pin, horizontal stop knot, or threads through the node holes from inside to outside.
                  Since the string is internal, zero cord ever touches the exterior vibrating body.
                </p>
              </div>
            </div>

            <p>
              <b>Why 22.4% is the exact node:</b> The fundamental bending wave of a free cylinder has true stationary nodes at exactly
              <b> 0.224 × Length</b> from each end. Suspending at this point ensures the attachment point experiences zero transverse motion,
              yielding up to <b>4× longer sustain</b> compared to off-node mounting.
            </p>
          </Section>

          <Section title="2. Material & Alloy Selection: Aluminium, Brass & Copper">
            <p>
              <b>Aluminium — EN AW-6060-T66 (AlMgSi0.5):</b> The gold standard alloy for wind chimes. Precipitation hardening (Mg₂Si precipitates)
              pins crystal dislocations, giving an outstanding quality factor (Q ≈ 3000–3500) and long singing sustain (6–10 s).
            </p>
            <p>
              <b>Eloxieren (Anodizing):</b> Highly recommended for aluminium. It creates a 15–25 µm diamond-hard ceramic Al₂O₃ layer (400–500 HV).
              It preserves 100% of acoustic sustain while preventing weather pitting, chalking, and striker indentations.
            </p>
            <Callout title="⚠️ Avoid Powder Coating & Thick Paint" type="info">
              Unlike anodizing, powder coating and paint add a 60–120 µm viscoelastic plastic layer that dampens acoustic vibrations.
              Sustain drops from ~8 seconds to under 2 seconds, turning your chime into a muffled clonk.
            </Callout>

            <h4 style={{ color: '#d4af5a', margin: '14px 0 6px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              🎺 Brass Selection: CuZn37 (Ms63) vs. CuZn39Pb3 (Ms58)
            </h4>
            <table className="pm-table" style={{ margin: '8px 0 10px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2a3242', color: '#d4af5a', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Alloy</th>
                  <th style={{ padding: '6px 8px' }}>State / Temper</th>
                  <th style={{ padding: '6px 8px' }}>Sustain (Q-Factor)</th>
                  <th style={{ padding: '6px 8px' }}>Recommendation & Sound</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>CuZn37 (Ms63)</b></td>
                  <td><i>ziehhart / presshart</i> (lead-free α-brass)</td>
                  <td><b>Q ≈ 2000–2500</b> (~5–7 s sustain)</td>
                  <td><b>🏆 Highly Recommended.</b> Pure, singing bell-like ring. Matches the app's "Brass" preset.</td>
                </tr>
                <tr>
                  <td><b>CuZn39Pb3 (Ms58)</b></td>
                  <td><i>gezogen</i> (contains ~3% lead for CNC turning)</td>
                  <td><b>Q ≈ 800–1200</b> (~2–3 s sustain)</td>
                  <td><b>⚠️ Shorter sustain.</b> Microscopic lead droplets act as acoustic dampers, yielding a drier, darker, shorter ring.</td>
                </tr>
              </tbody>
            </table>
            <p style={{ fontSize: '11px', color: '#8892a6', margin: '4px 0 0' }}>
              💡 <b>Brass rule of thumb:</b> Always choose <b>CuZn37 (Ms63) ziehhart</b> for musical chimes. Because sound travels slower in brass (c ≈ 3480 m/s vs 5055 m/s in Al), brass tubes are ~17% shorter but over 3× heavier for the exact same pitch.
            </p>

            <h4 style={{ color: '#b87333', margin: '18px 0 6px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              🪈 Copper Plumbing Pipes: EN 1057 (Cu-DHP) / ASTM B88
            </h4>
            <p>
              Standard copper water and heating pipes are among the most accessible and musical materials for DIY chimes. They produce a <b>warm, deep, mellow bell tone</b> that softens piercing high overtones in favor of a soothing fundamental resonance (Q ≈ 1800, ~3–6 s sustain).
            </p>
            <p>
              Because the bar wave speed in copper is lower (c ≈ 3615 m/s vs. 5055 m/s in aluminium), copper pipes ring noticeably lower in pitch for the same length — meaning tubes are <b>~20–25% shorter</b> for the exact same musical note.
            </p>
            <table className="pm-table" style={{ margin: '8px 0 10px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2a3242', color: '#b87333', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Norm & Temper</th>
                  <th style={{ padding: '6px 8px' }}>Format / State</th>
                  <th style={{ padding: '6px 8px' }}>Sustain (Q-Factor)</th>
                  <th style={{ padding: '6px 8px' }}>Acoustic Performance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>EN 1057 R290</b><br/><span style={{ fontSize: '11px', color: '#8892a6' }}>Hard-drawn (US Type L / M)</span></td>
                  <td>Straight lengths (Stangenware, 1–2.5 m)</td>
                  <td><b>Q ≈ 1800</b> (~3–6 s)</td>
                  <td><b>🏆 Highly Recommended.</b> Work-hardened during drawing. Rings with a clear, resonant, organ-like sustain.</td>
                </tr>
                <tr>
                  <td><b>EN 1057 R250</b><br/><span style={{ fontSize: '11px', color: '#8892a6' }}>Half-hard</span></td>
                  <td>Straight lengths</td>
                  <td><b>Q ≈ 1200–1400</b> (~2–4 s)</td>
                  <td><b>Good.</b> Decent chime ring, slightly faster overtone decay than R290.</td>
                </tr>
                <tr>
                  <td><b>EN 1057 R220</b><br/><span style={{ fontSize: '11px', color: '#8892a6' }}>Soft / Annealed</span></td>
                  <td>Coiled rolls (Ringe / Coils)</td>
                  <td><b>Q &lt; 300</b> (&lt; 0.5 s)</td>
                  <td><b>❌ Unusable.</b> Heat-annealed soft copper has extreme dislocation damping — strikes result in a dull, dead wooden thud.</td>
                </tr>
              </tbody>
            </table>
            <Callout title="🔍 Hardware Store Shopping & Building Tips" type="gold">
              <b>Identifying Hard Pipe:</b> Hardware store listings often show specs like <i>&quot;Zulässiger Betriebsdruck 36 bar, Betriebstemperatur 100 °C&quot;</i>. While pressure ratings are irrelevant for chimes, they confirm seamless industrial Cu-DHP tubing. Make sure the delivery form is <b>&quot;Stange&quot; (straight rigid length)</b>, which guarantees hard R290 temper.<br/>
              <b>Recommended Diameters:</b> <b>22 × 1.0 mm</b> (or 3/4&quot; Type L) is the sweet spot for chime volume and rich resonance. <b>28 × 1.0 mm</b> (or 1&quot;) produces deep gong-like bass notes. <b>15 × 1.0 mm</b> (1/2&quot;) is delicate and quiet.<br/>
              <b>Striker Choice:</b> Copper is softer than hardened alloys (Mohs ~3). Always use a <b>dense hardwood striker</b> (oak, beech, maple) or high-density plastic (acrylic, POM, PETG). Never use metal, which will dent the pipe and produce harsh click artifacts.<br/>
              <b>Cutting & Deburring:</b> Standard rotary pipe cutters work easily on copper, but they create a pronounced inner rim. Always deburr or countersink the inner lip to preserve pure acoustic resonance.<br/>
              <b>Patina:</b> Outdoors, copper slowly oxidizes to an earthy brown and eventually develops a turquoise verdigris patina (copper carbonate). This microscopic layer does <b>not</b> harm acoustic sustain.
            </Callout>
          </Section>

        </div>
      </div>
    </div>,
    document.body
  )
}
