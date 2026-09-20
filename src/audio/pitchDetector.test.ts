import { describe, it, expect } from 'vitest'
import { getRMS, detectPitchYIN, detectPitchFFT, detectPitch } from './pitchDetector'

function generateSineWave(freq: number, sampleRate: number, durationSeconds: number): Float32Array {
  const numSamples = Math.floor(sampleRate * durationSeconds)
  const buffer = new Float32Array(numSamples)
  const omega = 2 * Math.PI * freq
  for (let i = 0; i < numSamples; i++) {
    buffer[i] = 0.8 * Math.sin((omega * i) / sampleRate)
  }
  return buffer
}

describe('pitchDetector: getRMS', () => {
  it('returns 0 for silence', () => {
    const silence = new Float32Array(1024)
    expect(getRMS(silence)).toBe(0)
  })

  it('computes RMS for pure sine wave correctly', () => {
    const sine = generateSineWave(440, 48000, 0.05)
    // RMS of 0.8 * sin is 0.8 / sqrt(2) ≈ 0.5657
    expect(getRMS(sine)).toBeCloseTo(0.5657, 2)
  })
})

describe('pitchDetector: detectPitchYIN', () => {
  it('detects 440 Hz accurately', () => {
    const sampleRate = 48000
    const sine = generateSineWave(440, sampleRate, 0.1)
    const res = detectPitchYIN(sine, sampleRate)
    expect(res).not.toBeNull()
    expect(res!.freq).toBeCloseTo(440, 0)
    expect(res!.confidence).toBeGreaterThan(0.9)
  })

  it('detects 523.25 Hz (C5) accurately', () => {
    const sampleRate = 44100
    const sine = generateSineWave(523.25, sampleRate, 0.1)
    const res = detectPitchYIN(sine, sampleRate)
    expect(res).not.toBeNull()
    expect(res!.freq).toBeCloseTo(523.25, 0)
  })

  it('detects 220 Hz accurately', () => {
    const sampleRate = 48000
    const sine = generateSineWave(220, sampleRate, 0.1)
    const res = detectPitchYIN(sine, sampleRate)
    expect(res).not.toBeNull()
    expect(res!.freq).toBeCloseTo(220, 0)
  })
})

describe('pitchDetector: detectPitchFFT', () => {
  it('locates peak bin with parabolic refinement', () => {
    const sampleRate = 48000
    const fftSize = 4096
    const binRes = sampleRate / fftSize // ≈ 11.71875 Hz
    const freqData = new Float32Array(fftSize / 2).fill(-100)

    // Put a peak at 440 Hz
    const exactBin = 440 / binRes // 37.5466
    const k = Math.round(exactBin)
    freqData[k - 1] = -30
    freqData[k] = -15
    freqData[k + 1] = -28

    const res = detectPitchFFT(freqData, sampleRate, fftSize)
    expect(res).not.toBeNull()
    expect(Math.abs(res!.freq - 440)).toBeLessThan(8) // within FFT bin resolution
  })
})

describe('pitchDetector: hybrid detectPitch', () => {
  it('returns null on silence / noise floor', () => {
    const silence = new Float32Array(4096)
    const freqData = new Float32Array(2048).fill(-100)
    const res = detectPitch(silence, freqData, 48000, 4096)
    expect(res).toBeNull()
  })

  it('detects fundamental frequency from sine wave', () => {
    const sampleRate = 48000
    const fftSize = 4096
    const sine = generateSineWave(440, sampleRate, 0.1)
    const freqData = new Float32Array(fftSize / 2).fill(-90)
    const k = Math.round(440 / (sampleRate / fftSize))
    freqData[k - 1] = -30
    freqData[k] = -10
    freqData[k + 1] = -32

    const res = detectPitch(sine, freqData, sampleRate, fftSize, 440)
    expect(res).not.toBeNull()
    expect(res!.freq).toBeCloseTo(440, 0)
  })
})
