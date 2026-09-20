import { describe, it, expect } from 'vitest'
import { freqToNote, estimateCut, calculateMaterialCalibration } from './tuning'

describe('freqToNote', () => {
  it('identifies standard A4 as 440 Hz with 0 cents', () => {
    const res = freqToNote(440)
    expect(res.note).toBe('A4')
    expect(res.cents).toBe(0)
    expect(res.standardFreq).toBeCloseTo(440, 1)
  })

  it('identifies C5 (approx 523.25 Hz)', () => {
    const res = freqToNote(523.25)
    expect(res.note).toBe('C5')
    expect(res.cents).toBe(0)
  })

  it('calculates flat cents correctly', () => {
    // 430 Hz is approx 39.8 cents flat of A4
    const res = freqToNote(430)
    expect(res.note).toBe('A4')
    expect(res.cents).toBe(-40)
  })

  it('handles invalid frequencies gracefully', () => {
    expect(freqToNote(0).note).toBe('—')
    expect(freqToNote(-100).note).toBe('—')
  })
})

describe('estimateCut', () => {
  it('estimates positive cut when tube is longer and vibrating flat', () => {
    // Target C5 = 523.25 Hz, target length = 320 mm
    // Tube cut 10mm longer to 330 mm vibrates at f = 523.25 * (320/330)^2 = 492.0 Hz
    const est = estimateCut(492.0, 523.25, 330)
    expect(est.status).toBe('flat')
    expect(est.inTune).toBe(false)
    expect(est.targetLength_mm).toBeCloseTo(320.0, 0)
    expect(est.cutAmount_mm).toBeCloseTo(10.0, 0)
    expect(est.cents).toBeLessThan(0)
  })

  it('detects when tube is already in tune within tolerance', () => {
    // 523.0 Hz vs 523.25 Hz is < 1 cent difference
    const est = estimateCut(523.0, 523.25, 320)
    expect(est.status).toBe('in_tune')
    expect(est.inTune).toBe(true)
    expect(Math.abs(est.cutAmount_mm)).toBeLessThan(0.2)
  })

  it('warns when tube is sharp (already too short)', () => {
    // 540 Hz vs 523.25 Hz
    const est = estimateCut(540.0, 523.25, 320)
    expect(est.status).toBe('sharp')
    expect(est.inTune).toBe(false)
    expect(est.cutAmount_mm).toBeLessThan(0)
    expect(est.cents).toBeGreaterThan(0)
  })

  it('handles edge case inputs gracefully', () => {
    const est = estimateCut(0, 500, 300)
    expect(est.cutAmount_mm).toBe(0)
    expect(est.inTune).toBe(false)
  })
})

describe('calculateMaterialCalibration', () => {
  it('returns speedFactor 1.0 when measured frequency equals theoretical', () => {
    // For 25mm OD x 1.2mm wall aluminum at 500mm
    const calib = calculateMaterialCalibration('aluminum', 25, 1.2, false, 500, 606.6)
    expect(calib).not.toBeNull()
    if (calib) {
      expect(calib.nominalFreq).toBeCloseTo(606.6, 0)
      expect(calib.speedFactor).toBeCloseTo(1.0, 2)
      expect(calib.lengthFactor).toBeCloseTo(1.0, 2)
      expect(calib.deltaPercent).toBeCloseTo(0, 0)
    }
  })

  it('detects slower real wave speed and recommends shorter cut lengths', () => {
    // User stock produces 580 Hz instead of nominal ~609 Hz at 500mm
    const calib = calculateMaterialCalibration('aluminum', 25, 1.2, false, 500, 580)
    expect(calib).not.toBeNull()
    if (calib) {
      expect(calib.speedFactor).toBeLessThan(1.0)
      expect(calib.lengthFactor).toBeLessThan(1.0)
      expect(calib.deltaPercent).toBeLessThan(0) // negative delta means needs to be shorter
      expect(calib.calibratedWaveSpeed).toBeLessThan(calib.nominalWaveSpeed)
      // speedFactor ≈ 580 / 609 = 0.952, lengthFactor = sqrt(0.952) ≈ 0.976 (-2.4%)
      expect(calib.deltaPercent).toBeCloseTo(-2.4, 0)
    }
  })

  it('handles invalid or zero inputs safely', () => {
    expect(calculateMaterialCalibration('aluminum', 25, 1.2, false, 0, 500)).toBeNull()
    expect(calculateMaterialCalibration('aluminum', 25, 1.2, false, 500, 0)).toBeNull()
  })
})
