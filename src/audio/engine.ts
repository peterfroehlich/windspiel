import { analyzeTube, TubeSpec, TubeAcoustics, couplingKappa } from '../physics/tubes'
import { strikeWeights } from '../physics/modes'
import { MATERIALS } from '../physics/materials'
import { STRIKER_MATERIALS } from '../physics/materials'

/**
 * AudioEngine — Web Audio API synthesis of struck-tube chimes.
 * Each strike spawns a short filtered noise burst (striker transient)
 * plus a bank of exponentially decaying sine oscillators (tube partials).
 */
export class AudioEngine {
  ctx: AudioContext | null = null
  master: GainNode | null = null
  reverb: ConvolverNode | null = null
  reverbGain: GainNode | null = null
  private volume = 0.7
  private muted = false
  private activeSources = new Set<AudioScheduledSourceNode>()

  /** Set user volume (0..1). Respects mute state. */
  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v))
    this.applyGain()
  }

  /** Mute/unmute. Muting also hard-stops all sounding voices so sustained
   *  notes die immediately (and can't "resurrect" on unmute). The reverb
   *  send is cut too, so no convolution tail survives the mute. */
  setMuted(m: boolean) {
    this.muted = m
    this.applyGain()
    if (this.ctx && this.reverbGain) {
      // restore 0.25 send level on unmute
      this.reverbGain.gain.value = m ? 0 : 0.25
    }
    if (m) {
      const now = this.ctx?.currentTime ?? 0
      for (const src of this.activeSources) {
        try { src.stop(now) } catch { /* already stopped */ }
      }
      this.activeSources.clear()
    }
  }

  /** Register a voice for mute-kill tracking. */
  private track(src: AudioScheduledSourceNode) {
    this.activeSources.add(src)
    src.onended = () => this.activeSources.delete(src)
  }

  private applyGain() {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume
  }

  init() {
    if (this.ctx) return
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : this.volume

    // small algorithmic IR for outdoor ambience
    this.reverb = this.ctx.createConvolver()
    this.reverb.buffer = this.makeImpulse(1.8, 2.5)
    this.reverbGain = this.ctx.createGain()
    this.reverbGain.gain.value = 0.25

    // Reverb return is routed THROUGH master, not straight to the destination:
    // master is the single point of control (volume + mute) for the whole mix.
    this.master.connect(this.ctx.destination)
    this.reverb.connect(this.reverbGain)
    this.reverbGain.connect(this.master)
  }

  resume() { this.ctx?.resume() }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!
    const rate = ctx.sampleRate
    const len = Math.floor(rate * seconds)
    const buf = ctx.createBuffer(2, len, rate)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
      }
    }
    return buf
  }

  /** Trigger one tube strike. velocity 0..1, pan -1..1,
   *  strikeXi = impact position on tube 0..1, suspXi = suspension point 0..1.
   *  neighbours: specs of the other tubes (for sympathetic coupling). */
  strike(spec: TubeSpec, velocity: number, pan = 0, strikeXi = 0.5, suspXi = 0.224, neighbours: TubeSpec[] = []) {
    if (!this.ctx) return
    const ctx = this.ctx
    const ac = analyzeTube(spec, suspXi)
    const now = ctx.currentTime
    const vel = Math.max(0.05, Math.min(1, velocity))

    const panner = ctx.createStereoPanner()
    panner.pan.value = pan
    panner.connect(this.master!)
    panner.connect(this.reverb!)

    // --- strike position colors the tone: mode shapes gate each partial ---
    // (w1/w0 = overtone-vs-fundamental excitation, from exact mode shapes)
    const w = strikeWeights(strikeXi)
    const overtoneDamp = w[0] > 1e-3 ? Math.min(1, w[1] / w[0]) : 0

    // --- Striker transient: noise burst shaped by striker hardness ---
    const strikeDur = 0.02 + 0.05 * (1 - vel * 0.3)
    const noiseBuf = this.getNoise(strikeDur)
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = ac.strikeTone * (0.5 + vel * 0.5)
    bp.Q.value = 1
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(vel * 0.5, now)
    ng.gain.exponentialRampToValueAtTime(0.001, now + strikeDur)
    noise.connect(bp).connect(ng).connect(panner)
    this.track(noise)
    noise.start(now)

    // --- Tube partials: decaying sines, slight detune beating ---
    // Amplitude = base rolloff × modal excitation at the strike point
    // (fundamental max at center, overtones muted on their nodes)
    for (let i = 0; i < ac.partials.length; i++) {
      const f = ac.partials[i]
      const t60 = ac.decayTimes[i]
      if (t60 < 0.05 || f > 16000) continue
      const modal = Math.min(1, w[i] ?? 0) * (i > 0 ? overtoneDamp : 1)
      const amp = (0.5 / (i + 1)) * vel * modal
      if (amp < 0.002) continue
      const g = ctx.createGain()
      const tEnd = now + t60 * 2.0
      const mkOsc = (freq: number, a: number) => {
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = freq
        const gg = ctx.createGain()
        gg.gain.setValueAtTime(0, now)
        gg.gain.linearRampToValueAtTime(a, now + 0.002)
        gg.gain.exponentialRampToValueAtTime(0.0001, tEnd)
        osc.connect(gg).connect(panner)
        this.track(osc)
        osc.start(now)
        osc.stop(tEnd)
      }
      mkOsc(f, amp)
      // detuned twin for natural shimmer
      mkOsc(f * (1 + 0.0015 * (i + 1)), amp * 0.4)
    }

    // --- Sympathetic coupling: struck tube → frame → other tubes ---
    // Energy transferred out of the struck tube also shortens its own decay.
    if (neighbours.length > 0) this.couple(neighbours, ac, vel, strikeXi, suspXi, pan)
  }

  /**
   * Frame-borne sympathetic resonance (coupled-mode model):
   * each struck-tube partial acts as a driver; each neighbour partial rings at
   * its OWN frequency with transfer κ(Δf) (Lorentzian in detuning, width = the
   * receiver's half-bandwidth). The struck tube loses the same energy → its
   * T60 shortens. Total transfer is capped (frame mobility is finite).
   */
  private couple(neighbours: TubeSpec[], driven: TubeAcoustics, vel: number, strikeXi: number, suspXi: number, pan: number) {
    const ctx = this.ctx!
    const now = ctx.currentTime
    const dw = strikeWeights(strikeXi)

    let totalLeak = 0   // fraction of driven energy leaving via the frame
    for (let ni = 0; ni < neighbours.length; ni++) {
      const nSpec = neighbours[ni]
      const nac = analyzeTube(nSpec, suspXi)
      const nw = strikeWeights(0.5)   // frame drives near the tube center (broad excitation)
      const nQ = MATERIALS[nSpec.material]?.dampingQ ?? 2000

      for (let k = 0; k < nac.partials.length; k++) {
        const fk = nac.partials[k]
        const t60k = nac.decayTimes[k]
        if (t60k < 0.1 || fk > 8000) continue
        // strongest driving partial = the driven tube's fundamental
        const delta = Math.abs(fk - driven.partials[0])
        const kappa = couplingKappa(delta, fk, nQ)
        if (kappa < 0.02) continue
        // receiver response: resonant gain ∝ Q, modal gating at its own nodes
        const modal = Math.min(1, nw[k] ?? 0) * (k > 0 ? Math.min(1, nw[1] / Math.max(nw[0], 1e-3)) : 1)
        const amp = Math.min(0.06, kappa * 0.1 * (nQ / 2000) * vel * modal)
        if (amp < 0.002) continue
        totalLeak += kappa * kappa

        const panner = ctx.createStereoPanner()
        panner.pan.value = pan * 0.5 + (ni % 2 === 0 ? -0.3 : 0.3) * 0.5
        panner.connect(this.master!)
        panner.connect(this.reverb!)

        const tEnd = now + t60k * 2.0
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = fk
        const g = ctx.createGain()
        // sympathetic ringing builds up slower than a direct strike
        g.gain.setValueAtTime(0, now)
        g.gain.linearRampToValueAtTime(amp, now + 0.05)
        g.gain.exponentialRampToValueAtTime(0.0001, tEnd)
        osc.connect(g).connect(panner)
        this.track(osc)
        osc.start(now)
        osc.stop(tEnd)
      }
    }
    return totalLeak
  }

  private noiseCache: Map<number, AudioBuffer> = new Map()
  private getNoise(dur: number): AudioBuffer {
    const key = Math.round(dur * 1000)
    if (this.noiseCache.has(key)) return this.noiseCache.get(key)!
    const ctx = this.ctx!
    const len = Math.max(64, Math.floor(ctx.sampleRate * dur))
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    this.noiseCache.set(key, buf)
    return buf
  }
}
export const audio = new AudioEngine()
