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
