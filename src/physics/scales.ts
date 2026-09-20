export type Mood = 'bright' | 'meditative' | 'dark'

export interface ScalePreset {
  id: string
  label: string
  semitones: number[]
  root: string              // default root (used when config doesn't override)
  octave: number
  mood: Mood
}

export const MOODS: { id: Mood; label: string }[] = [
  { id: 'bright',     label: 'Bright' },
  { id: 'meditative', label: 'Meditative' },
  { id: 'dark',       label: 'Dark' },
]

export const SCALES: ScalePreset[] = [
  // Bright — consonant interval sets, sweet when struck together
  { id: 'pentMajor',   label: 'Pentatonic Major',   semitones: [0, 2, 4, 7, 9],                  root: 'C', octave: 5, mood: 'bright' },
  { id: 'maj7',        label: 'Major 7th chord',    semitones: [0, 4, 7, 11],                    root: 'C', octave: 5, mood: 'bright' },
  { id: 'dom9',        label: 'Dominant 9th',       semitones: [0, 4, 7, 10, 14],                root: 'G', octave: 4, mood: 'bright' },
  { id: 'hawaiian',    label: 'Hawaiian',           semitones: [0, 2, 3, 4, 7, 9],               root: 'C', octave: 5, mood: 'bright' },
  { id: 'mongolian',   label: 'Mongolian',          semitones: [0, 2, 7, 9, 12],                 root: 'C', octave: 5, mood: 'bright' },
  { id: 'westminster', label: 'Westminster',        semitones: [0, 5, 7, 9],                     root: 'A', octave: 4, mood: 'bright' },
  // Meditative — traditional Japanese & suspended colors
  { id: 'akebono',     label: 'Akebono (Japan)',    semitones: [0, 2, 3, 7, 8],                  root: 'D', octave: 5, mood: 'meditative' },
  { id: 'insen',       label: 'In Sen (Japan)',     semitones: [0, 1, 5, 7, 10],                 root: 'E', octave: 5, mood: 'meditative' },
  { id: 'oli',         label: 'Oli (Hawaiian chant)', semitones: [0, 2, 2, 5, 7],                root: 'F', octave: 4, mood: 'meditative' },
  { id: 'wholeTone',   label: 'Whole tone',         semitones: [0, 2, 4, 6, 8, 10],              root: 'D', octave: 5, mood: 'meditative' },
  { id: 'chinese',     label: 'Chinese',            semitones: [0, 3, 5, 8, 10],                 root: 'A', octave: 4, mood: 'meditative' },
  { id: 'balinese',    label: 'Balinese (gamelan)', semitones: [0, 1, 3, 7, 8],                  root: 'G', octave: 4, mood: 'meditative' },
  // Dark — minor intervals, bittersweet clusters
  { id: 'pentMinor',   label: 'Pentatonic Minor',   semitones: [0, 3, 5, 7, 10],                 root: 'A', octave: 4, mood: 'dark' },
  { id: 'sakura',      label: 'Sakura (Japan)',     semitones: [0, 1, 5, 7, 8],                  root: 'A', octave: 4, mood: 'dark' },
  { id: 'minTriad',    label: 'Minor triad',        semitones: [0, 3, 7],                        root: 'A', octave: 4, mood: 'dark' },
]

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Scale degrees, transposed to the given root (default: preset root). */
export function scaleFrequencies(
  scale: ScalePreset,
  count: number,
  rootOverride?: string,
): { freq: number; note: string }[] {
  const rootName = rootOverride ?? scale.root
  const rootSemi = NAMES.indexOf(rootName)
  // keep the preset's root-position flavor when transposing: a preset rooted
  // on 'A' (pentMinor) keeps its tonal character in any key — we transpose
  // relative to the preset root so intervals from the root are preserved.
  const presetRootSemi = NAMES.indexOf(scale.root)
  const transpose = rootSemi - presetRootSemi
  const out: { freq: number; note: string }[] = []
  for (let i = 0; i < count; i++) {
    const st = scale.semitones[i % scale.semitones.length] + 12 * Math.floor(i / scale.semitones.length)
    const midi = 12 * (scale.octave + 1) + presetRootSemi + transpose + st
    const freq = 440 * Math.pow(2, (midi - 69) / 12)
    const name = NAMES[((presetRootSemi + transpose + st) % 12 + 12) % 12] +
      (scale.octave + Math.floor((presetRootSemi + transpose + st) / 12))
    out.push({ freq, note: name })
  }
  return out
}
