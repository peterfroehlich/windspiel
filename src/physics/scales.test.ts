import { describe, it, expect } from 'vitest'
import { SCALES, scaleFrequencies, NOTE_NAMES } from './scales'
import { noteToFreq } from './tubes'

describe('scaleFrequencies', () => {
  it('pentaatonic major rooted on C gives C D E G A', () => {
    const s = SCALES.find((x) => x.id === 'pentMajor')!
    const notes = scaleFrequencies(s, 5).map((n) => n.note)
    expect(notes).toEqual(['C5', 'D5', 'E5', 'G5', 'A5'])
  })

  it('root override transposes preserving intervals (C major pent → G)', () => {
    const s = SCALES.find((x) => x.id === 'pentMajor')!
    const notes = scaleFrequencies(s, 5, 'G').map((n) => n.note)
    expect(notes).toEqual(['G5', 'A5', 'B5', 'D6', 'E6'])
  })

  it('wraps over octaves when count exceeds scale degrees', () => {
    const s = SCALES.find((x) => x.id === 'pentMajor')!
    const notes = scaleFrequencies(s, 7).map((n) => n.note)
    expect(notes[5]).toBe('C6')
    expect(notes[6]).toBe('D6')
  })

  it('frequencies match the equal-tempered note names (A4=440)', () => {
    const s = SCALES.find((x) => x.id === 'pentMinor')!
    const out = scaleFrequencies(s, 5, 'A')
    for (const { note, freq } of out) {
      expect(freq).toBeCloseTo(noteToFreq(note), 6)
    }
  })

  it('westminster preset is exactly A, D, E, F#', () => {
    const s = SCALES.find((x) => x.id === 'westminster')!
    const notes = scaleFrequencies(s, 4).map((n) => n.note)
    expect(notes).toEqual(['A4', 'D5', 'E5', 'F#5'])
  })

  it('oli preset has recitation drone on G4 with F root', () => {
    const s = SCALES.find((x) => x.id === 'oli')!
    expect(s).toBeDefined()
    const notes = scaleFrequencies(s, 6).map((n) => n.note)
    expect(notes).toEqual(['F4', 'G4', 'G4', 'A#4', 'C5', 'F5'])
  })

  it('every scale has valid semitones, known root and mood', () => {
    const moods = new Set(['bright', 'meditative', 'dark'])
    for (const s of SCALES) {
      expect(s.semitones.length).toBeGreaterThan(0)
      expect(s.semitones.every((st) => Number.isInteger(st) && st >= 0)).toBe(true)
      expect(NOTE_NAMES).toContain(s.root)
      expect(moods.has(s.mood)).toBe(true)
    }
  })
})

describe('noteToFreq', () => {
  it('A4 = 440 and A5 = 880', () => {
    expect(noteToFreq('A4')).toBeCloseTo(440, 6)
    expect(noteToFreq('A5')).toBeCloseTo(880, 6)
  })

  it('one semitone = 2^(1/12)', () => {
    expect(noteToFreq('A#4') / noteToFreq('A4')).toBeCloseTo(Math.pow(2, 1 / 12), 9)
  })

  it('falls back to 440 for garbage input', () => {
    expect(noteToFreq('hello')).toBe(440)
  })
})
