/**
 * Real-time audio pitch detection and strike frequency analysis for chime tubes.
 *
 * Combines YIN autocorrelation and interpolated FFT peak picking to provide
 * accurate fundamental frequency detection even with inharmonic chime overtones.
 */

export interface PitchDetectionResult {
  freq: number
  confidence: number
  rms: number
}

/** Calculate Root Mean Square energy of an audio buffer. */
export function getRMS(buffer: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i]
  }
  return Math.sqrt(sum / buffer.length)
}

/**
 * YIN pitch detection algorithm.
 *
 * @param buffer Float32 time-domain samples (-1.0 to 1.0)
 * @param sampleRate Audio sample rate (e.g. 44100 or 48000)
 * @param minFreq Lowest frequency to scan (default: 80 Hz)
 * @param maxFreq Highest frequency to scan (default: 3200 Hz)
 * @param threshold Dip threshold for absolute thresholding (default: 0.15)
 */
export function detectPitchYIN(
  buffer: Float32Array,
  sampleRate: number,
  minFreq = 80,
  maxFreq = 3200,
  threshold = 0.15
): { freq: number; confidence: number } | null {
  const bufferSize = buffer.length
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq))
  const tauMax = Math.min(Math.floor(bufferSize / 2), Math.ceil(sampleRate / minFreq))

  if (tauMax <= tauMin) return null

  // Step 1 & 2: Difference function d[tau]
  const diff = new Float32Array(tauMax + 1)
  const windowSize = Math.min(1024, bufferSize - tauMax)

  for (let tau = 0; tau <= tauMax; tau++) {
    let sum = 0
    for (let j = 0; j < windowSize; j++) {
      const delta = buffer[j] - buffer[j + tau]
      sum += delta * delta
    }
    diff[tau] = sum
  }

  // Step 3: Cumulative mean normalized difference d'[tau]
  const cmnd = new Float32Array(tauMax + 1)
  cmnd[0] = 1
  let runningSum = 0

  for (let tau = 1; tau <= tauMax; tau++) {
    runningSum += diff[tau]
    cmnd[tau] = runningSum > 0 ? diff[tau] / (runningSum / tau) : 1
  }

  // Step 4: Absolute threshold
  let bestTau = -1
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cmnd[tau] < threshold) {
      // Find local minimum
      while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) {
        tau++
      }
      bestTau = tau
      break
    }
  }

  // Fallback: global minimum in search range if no value breached the threshold
  if (bestTau === -1) {
    let minVal = Infinity
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cmnd[tau] < minVal) {
        minVal = cmnd[tau]
        bestTau = tau
      }
    }
    // If the global minimum is too high, signal has poor periodicity
    if (minVal > 0.45) return null
  }

  // Step 5: Parabolic interpolation on cmnd curve
  let refinedTau = bestTau
  if (bestTau > 0 && bestTau < tauMax) {
    const s0 = cmnd[bestTau - 1]
    const s1 = cmnd[bestTau]
    const s2 = cmnd[bestTau + 1]
    const denom = 2 * (s0 - 2 * s1 + s2)
    if (Math.abs(denom) > 1e-6) {
      const delta = (s0 - s2) / denom
      refinedTau = bestTau + delta
    }
  }

  if (refinedTau <= 0) return null

  const freq = sampleRate / refinedTau
  const confidence = Math.max(0, Math.min(1, 1 - cmnd[bestTau]))

  return { freq, confidence }
}

/**
 * FFT Peak detection with parabolic interpolation.
 * Useful for verifying chime frequencies and focusing on expected target mode.
 */
export function detectPitchFFT(
  freqData: Float32Array,
  sampleRate: number,
  fftSize: number,
  minFreq = 80,
  maxFreq = 3200,
  targetFreq?: number
): { freq: number; magnitude: number } | null {
  const binResolution = sampleRate / fftSize
  const minBin = Math.max(1, Math.floor(minFreq / binResolution))
  const maxBin = Math.min(freqData.length - 2, Math.ceil(maxFreq / binResolution))

  let bestBin = -1
  let maxDb = -Infinity

  // If a target frequency is known, prioritize peaks within [0.6*f_target, 1.4*f_target]
  // to avoid mistaking the 2.76x chime overtone for the fundamental
  const targetMinBin = targetFreq ? Math.max(minBin, Math.floor((targetFreq * 0.6) / binResolution)) : minBin
  const targetMaxBin = targetFreq ? Math.min(maxBin, Math.ceil((targetFreq * 1.4) / binResolution)) : maxBin

  for (let k = targetMinBin; k <= targetMaxBin; k++) {
    if (freqData[k] > freqData[k - 1] && freqData[k] > freqData[k + 1]) {
      if (freqData[k] > maxDb) {
        maxDb = freqData[k]
        bestBin = k
      }
    }
  }

  // If no peak in target window, scan entire range
  if (bestBin === -1 || maxDb < -70) {
    for (let k = minBin; k <= maxBin; k++) {
      if (freqData[k] > freqData[k - 1] && freqData[k] > freqData[k + 1]) {
        if (freqData[k] > maxDb) {
          maxDb = freqData[k]
          bestBin = k
        }
      }
    }
  }

  if (bestBin <= 0 || maxDb < -75) return null

  // Parabolic interpolation on dB values
  const a = freqData[bestBin - 1]
  const b = freqData[bestBin]
  const c = freqData[bestBin + 1]
  const denom = 2 * (a - 2 * b + c)
  const delta = Math.abs(denom) > 1e-6 ? (a - c) / denom : 0
  const freq = (bestBin + delta) * binResolution

  return { freq, magnitude: maxDb }
}

/**
 * Hybrid chime pitch detector:
 * Combines YIN time-domain precision with FFT overtone protection.
 */
export function detectPitch(
  timeBuffer: Float32Array,
  freqBuffer: Float32Array,
  sampleRate: number,
  fftSize: number,
  targetFreq?: number
): PitchDetectionResult | null {
  const rms = getRMS(timeBuffer)
  if (rms < 0.008) return null // noise floor gate

  const yin = detectPitchYIN(timeBuffer, sampleRate, 80, 3200)
  const fft = detectPitchFFT(freqBuffer, sampleRate, fftSize, 80, 3200, targetFreq)

  // If both methods found a frequency
  if (yin && fft) {
    // If YIN locked onto overtone (e.g. ~2.76x f0) while FFT detected fundamental
    if (targetFreq && yin.freq > targetFreq * 1.8 && fft.freq < targetFreq * 1.4) {
      return { freq: fft.freq, confidence: 0.85, rms }
    }
    // YIN has high confidence: use YIN's superior time-domain precision
    if (yin.confidence >= 0.65) {
      return { freq: yin.freq, confidence: yin.confidence, rms }
    }
    // Fall back to FFT peak
    return { freq: fft.freq, confidence: 0.7, rms }
  }

  if (yin && yin.confidence > 0.6) {
    return { freq: yin.freq, confidence: yin.confidence, rms }
  }

  if (fft) {
    return { freq: fft.freq, confidence: 0.65, rms }
  }

  return null
}

export interface PitchTrackerOptions {
  onLiveUpdate: (info: {
    freq: number | null
    rms: number
    inTune: boolean
    confidence: number
  }) => void
  onStrikeDetected: (freq: number) => void
  onError?: (err: Error) => void
}

/**
 * AudioPitchTracker handles microphone capture, Web Audio setup,
 * and strike-locking state machine.
 */
export class AudioPitchTracker {
  private audioCtx: AudioContext | null = null
  private stream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private animId: number | null = null
  private targetFreq: number = 440
  private options: PitchTrackerOptions
  private isRunning = false

  // Strike detection state
  private prevRms = 0
  private strikeCooldown = 0
  private strikeFrames: number[] = []
  private isCollectingStrike = false
  private strikeCollectTimer: number | null = null

  constructor(options: PitchTrackerOptions) {
    this.options = options
  }

  public setTargetFreq(f: number) {
    this.targetFreq = f
  }

  public async start(): Promise<void> {
    if (this.isRunning) return

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })

      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.audioCtx = new AudioContextClass()

      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume()
      }

      const source = this.audioCtx.createMediaStreamSource(this.stream)
      this.analyser = this.audioCtx.createAnalyser()
      this.analyser.fftSize = 4096
      this.analyser.smoothingTimeConstant = 0.2
      source.connect(this.analyser)

      this.isRunning = true
      this.loop()
    } catch (err) {
      this.stop()
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)))
      throw err
    }
  }

  public stop(): void {
    this.isRunning = false
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId)
      this.animId = null
    }
    if (this.strikeCollectTimer !== null) {
      clearTimeout(this.strikeCollectTimer)
      this.strikeCollectTimer = null
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
      this.stream = null
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close()
      } catch {
        // ignore
      }
      this.audioCtx = null
    }
    this.analyser = null
    this.prevRms = 0
    this.strikeFrames = []
    this.isCollectingStrike = false
  }

  public get running(): boolean {
    return this.isRunning
  }

  private loop = (): void => {
    if (!this.isRunning || !this.analyser || !this.audioCtx) return

    const timeData = new Float32Array(this.analyser.fftSize)
    const freqData = new Float32Array(this.analyser.frequencyBinCount)
    this.analyser.getFloatTimeDomainData(timeData)
    this.analyser.getFloatFrequencyData(freqData)

    const result = detectPitch(
      timeData,
      freqData,
      this.audioCtx.sampleRate,
      this.analyser.fftSize,
      this.targetFreq
    )

    const rms = result ? result.rms : getRMS(timeData)

    // Strike onset detection: sharp increase in RMS volume
    const now = performance.now()
    if (rms > 0.025 && rms - this.prevRms > 0.015 && now > this.strikeCooldown) {
      this.strikeCooldown = now + 400 // cooldown
      this.strikeFrames = []
      this.isCollectingStrike = true

      // Wait 80ms for strike transient clank to pass, then collect for 300ms
      setTimeout(() => {
        if (!this.isRunning) return
        this.strikeCollectTimer = window.setTimeout(() => {
          if (this.strikeFrames.length > 0) {
            // Pick median frequency of collected resonant ringing frames
            this.strikeFrames.sort((a, b) => a - b)
            const medianFreq = this.strikeFrames[Math.floor(this.strikeFrames.length / 2)]
            this.options.onStrikeDetected(medianFreq)
          }
          this.isCollectingStrike = false
        }, 300)
      }, 80)
    }

    if (this.isCollectingStrike && result && result.freq > 0) {
      this.strikeFrames.push(result.freq)
    }

    this.prevRms = rms

    this.options.onLiveUpdate({
      freq: result ? result.freq : null,
      rms,
      inTune: false,
      confidence: result ? result.confidence : 0,
    })

    this.animId = requestAnimationFrame(this.loop)
  }
}
