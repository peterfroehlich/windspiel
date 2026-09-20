/**
 * Tuning mathematics & cut estimation for chime manufacturing.
 *
 * For a free-free Euler-Bernoulli beam / tube, fundamental frequency f satisfies:
 *   f = (beta1^2 / 2π) * sqrt(E*I / (ρ*A)) / L^2
 *
 * For any individual physical tube with fixed cross-section and material:
 *   f ∝ 1 / L^2  <=>  f * L^2 = constant
 *
 * If a tube currently has physical length L_current and vibrates at measured
 * frequency f_measured, its target length to reach f_target is:
 *   L_target = L_current * sqrt(f_measured / f_target)
 *
 * The cut amount to remove is:
 *   ΔL = L_current - L_target = L_current * (1 - sqrt(f_measured / f_target))
 */

import { MATERIALS } from './materials'
import { tubeFrequencies, TubeSpec } from './tubes'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export interface NoteInfo {
  note: string
  cents: number
  standardFreq: number
}

/** Convert a frequency in Hz to nearest note name, cents deviation, and standard frequency (A4 = 440 Hz). */
export function freqToNote(f: number): NoteInfo {
  if (f <= 0 || !Number.isFinite(f)) {
    return { note: '—', cents: 0, standardFreq: 0 }
  }
  const midi = 12 * Math.log2(f / 440) + 69
  const roundedMidi = Math.round(midi)
  const cents = Math.round((midi - roundedMidi) * 100) || 0
  const standardFreq = 440 * Math.pow(2, (roundedMidi - 69) / 12)
  const noteName = NOTE_NAMES[((roundedMidi % 12) + 12) % 12]
  const octave = Math.floor(roundedMidi / 12) - 1
  return {
    note: `${noteName}${octave}`,
    cents,
    standardFreq,
  }
}

export interface CutEstimate {
  targetFreq: number         // Hz
  measuredFreq: number       // Hz
  currentLength_mm: number   // mm
  targetLength_mm: number    // mm
  cutAmount_mm: number       // mm (positive = cut off, negative = tube too short)
  cents: number              // pitch difference in cents
  inTune: boolean            // within tolerance
  status: 'flat' | 'sharp' | 'in_tune'
}

/**
 * Estimate how many mm need to be cut off a tube to reach targetFreq.
 *
 * @param measuredFreq Detected resonant frequency in Hz
 * @param targetFreq Target pitch frequency in Hz
 * @param currentLength_mm Current physical length of the tube in mm
 * @param toleranceCents Cents threshold to consider in tune (default 5 cents)
 */
export function estimateCut(
  measuredFreq: number,
  targetFreq: number,
  currentLength_mm: number,
  toleranceCents = 5
): CutEstimate {
  if (measuredFreq <= 0 || targetFreq <= 0 || currentLength_mm <= 0) {
    return {
      targetFreq,
      measuredFreq,
      currentLength_mm,
      targetLength_mm: currentLength_mm,
      cutAmount_mm: 0,
      cents: 0,
      inTune: false,
      status: 'in_tune',
    }
  }

  const cents = 1200 * Math.log2(measuredFreq / targetFreq)
  const targetLength_mm = currentLength_mm * Math.sqrt(measuredFreq / targetFreq)
  const cutAmount_mm = currentLength_mm - targetLength_mm
  const inTune = Math.abs(cents) <= toleranceCents

  let status: 'flat' | 'sharp' | 'in_tune' = 'in_tune'
  if (!inTune) {
    status = measuredFreq < targetFreq ? 'flat' : 'sharp'
  }

  return {
    targetFreq: Math.round(targetFreq * 10) / 10 || 0,
    measuredFreq: Math.round(measuredFreq * 10) / 10 || 0,
    currentLength_mm: Math.round(currentLength_mm * 10) / 10 || 0,
    targetLength_mm: Math.round(targetLength_mm * 10) / 10 || 0,
    cutAmount_mm: Math.round(cutAmount_mm * 10) / 10 || 0,
    cents: Math.round(cents * 10) / 10 || 0,
    inTune,
    status,
  }
}

export interface MaterialCalibration {
  material: string
  currentLength_mm: number
  measuredFreq: number
  nominalFreq: number
  speedFactor: number       // c_actual / c_nominal (wave speed ratio)
  lengthFactor: number      // L_actual / L_nominal = sqrt(speedFactor)
  deltaPercent: number      // (lengthFactor - 1) * 100
  calibratedWaveSpeed: number // m/s
  nominalWaveSpeed: number   // m/s
}

/**
 * Compute the material calibration factor from a measured test tube.
 *
 * For a tube of length L, theoretical f0 ∝ c / L²
 * → c_actual / c_nominal = f_measured / f_nominal
 * → L_actual / L_nominal = sqrt(c_actual / c_nominal)
 */
export function calculateMaterialCalibration(
  material: string,
  outerDiameter_mm: number,
  wallThickness_mm: number,
  solid: boolean,
  currentLength_mm: number,
  measuredFreq: number
): MaterialCalibration | null {
  if (currentLength_mm <= 0 || measuredFreq <= 0) return null

  const mat = MATERIALS[material] ?? MATERIALS.aluminum
  const nominalC = Math.sqrt(mat.youngsModulus / mat.density)
  const Do = outerDiameter_mm / 1000
  const t = solid ? Infinity : wallThickness_mm / 1000

  // Nominal model frequency without calibration factor
  const specNominal: TubeSpec = {
    length: currentLength_mm / 1000,
    outerDiameter: Do,
    wallThickness: t,
    material,
    speedFactor: 1.0,
  }
  const nominalFreq = tubeFrequencies(specNominal).f0

  if (nominalFreq <= 0) return null

  const rawSpeedFactor = measuredFreq / nominalFreq
  // Clamp to realistic physical range (±30% wave speed)
  const speedFactor = Math.max(0.6, Math.min(1.4, rawSpeedFactor))
  const lengthFactor = Math.sqrt(speedFactor)
  const deltaPercent = (lengthFactor - 1) * 100
  const calibratedWaveSpeed = Math.round(nominalC * speedFactor)

  return {
    material,
    currentLength_mm: Math.round(currentLength_mm * 10) / 10 || 0,
    measuredFreq: Math.round(measuredFreq * 10) / 10 || 0,
    nominalFreq: Math.round(nominalFreq * 10) / 10 || 0,
    speedFactor: Math.round(speedFactor * 10000) / 10000 || 1,
    lengthFactor: Math.round(lengthFactor * 10000) / 10000 || 1,
    deltaPercent: Math.round(deltaPercent * 10) / 10 || 0,
    calibratedWaveSpeed,
    nominalWaveSpeed: Math.round(nominalC),
  }
}
