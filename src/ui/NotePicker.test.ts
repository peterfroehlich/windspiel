import { describe, it, expect } from 'vitest'
import { parseNoteString, shiftNote, CHROMATIC_NOTES } from './NotePicker'

describe('NotePicker: parseNoteString', () => {
  it('parses natural notes correctly', () => {
    expect(parseNoteString('C4')).toEqual({
      pitch: 'C',
      octave: 4,
      display: 'C4',
      enharmonic: undefined,
    })
    expect(parseNoteString('A4')).toEqual({
      pitch: 'A',
      octave: 4,
      display: 'A4',
      enharmonic: undefined,
    })
    expect(parseNoteString('B3')).toEqual({
      pitch: 'B',
      octave: 3,
      display: 'B3',
      enharmonic: undefined,
    })
  })

  it('parses sharp notes with enharmonic flat equivalents', () => {
    expect(parseNoteString('F#4')).toEqual({
      pitch: 'F#',
      octave: 4,
      display: 'F#4',
      enharmonic: 'G♭4',
    })
    expect(parseNoteString('C#5')).toEqual({
      pitch: 'C#',
      octave: 5,
      display: 'C#5',
      enharmonic: 'D♭5',
    })
    expect(parseNoteString('A#3')).toEqual({
      pitch: 'A#',
      octave: 3,
      display: 'A#3',
      enharmonic: 'B♭3',
    })
  })

  it('normalizes flat notes to sharp equivalents with enharmonic hints', () => {
    expect(parseNoteString('Bb4')).toEqual({
      pitch: 'A#',
      octave: 4,
      display: 'A#4',
      enharmonic: 'B♭4',
    })
    expect(parseNoteString('Eb5')).toEqual({
      pitch: 'D#',
      octave: 5,
      display: 'D#5',
      enharmonic: 'E♭5',
    })
    expect(parseNoteString('Db4')).toEqual({
      pitch: 'C#',
      octave: 4,
      display: 'C#4',
      enharmonic: 'D♭4',
    })
  })

  it('handles lowercase and whitespace', () => {
    expect(parseNoteString('  f#4 ')).toEqual({
      pitch: 'F#',
      octave: 4,
      display: 'F#4',
      enharmonic: 'G♭4',
    })
    expect(parseNoteString('c5')).toEqual({
      pitch: 'C',
      octave: 5,
      display: 'C5',
      enharmonic: undefined,
    })
  })

  it('handles invalid inputs gracefully by falling back to A4', () => {
    expect(parseNoteString('')).toEqual({
      pitch: 'A',
      octave: 4,
      display: 'A4',
      enharmonic: undefined,
    })
    expect(parseNoteString('invalid')).toEqual({
      pitch: 'A',
      octave: 4,
      display: 'A4',
      enharmonic: undefined,
    })
  })
})

describe('NotePicker: shiftNote', () => {
  it('shifts by +1 semitone', () => {
    expect(shiftNote('C4', 1)).toBe('C#4')
    expect(shiftNote('C#4', 1)).toBe('D4')
    expect(shiftNote('E4', 1)).toBe('F4')
    expect(shiftNote('B4', 1)).toBe('C5')
  })

  it('shifts by -1 semitone', () => {
    expect(shiftNote('C4', -1)).toBe('B3')
    expect(shiftNote('F4', -1)).toBe('E4')
    expect(shiftNote('F#4', -1)).toBe('F4')
    expect(shiftNote('C#4', -1)).toBe('C4')
  })

  it('shifts across multiple octaves', () => {
    expect(shiftNote('C4', 12)).toBe('C5')
    expect(shiftNote('C4', -12)).toBe('C3')
  })

  it('clamps octave to valid boundaries [1, 8]', () => {
    expect(shiftNote('C1', -12)).toBe('C1')
    expect(shiftNote('B8', 12)).toBe('B8')
  })
})

describe('NotePicker: CHROMATIC_NOTES', () => {
  it('contains exactly 12 semitones in standard order', () => {
    expect(CHROMATIC_NOTES).toEqual([
      'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
    ])
  })
})
