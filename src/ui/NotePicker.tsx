import { useRef, useEffect } from 'react'

export interface ParsedNote {
  pitch: string       // Canonical sharp note: 'C', 'C#', 'D', etc.
  octave: number      // e.g. 4
  display: string     // e.g. 'C#4'
  enharmonic?: string // e.g. 'D♭4'
}

export const CHROMATIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

const FLAT_MAP: Record<string, string> = {
  DB: 'C#',
  EB: 'D#',
  GB: 'F#',
  AB: 'G#',
  BB: 'A#',
}

const ENHARMONIC_FLATS: Record<string, string> = {
  'C#': 'D♭',
  'D#': 'E♭',
  'F#': 'G♭',
  'G#': 'A♭',
  'A#': 'B♭',
}

export function parseNoteString(raw: string): ParsedNote {
  const m = (raw || 'A4').trim().match(/^([A-Ga-g])([#b]?)(-?\d+)?$/)
  if (!m) return { pitch: 'A', octave: 4, display: 'A4' }
  const letter = m[1].toUpperCase()
  const acc = m[2] || ''
  const combined = letter + acc
  let pitch = FLAT_MAP[combined.toUpperCase()] ?? (acc === 'b' ? letter : combined)
  if (!CHROMATIC_NOTES.includes(pitch as (typeof CHROMATIC_NOTES)[number])) {
    pitch = 'A'
  }
  const octave = m[3] !== undefined ? parseInt(m[3], 10) : 4
  const display = `${pitch}${octave}`
  const enharmonic = ENHARMONIC_FLATS[pitch] ? `${ENHARMONIC_FLATS[pitch]}${octave}` : undefined
  return { pitch, octave, display, enharmonic }
}

export function shiftNote(note: string, semitones: number): string {
  const { pitch, octave } = parseNoteString(note)
  const pitchIdx = CHROMATIC_NOTES.indexOf(pitch as (typeof CHROMATIC_NOTES)[number])
  const totalSemi = octave * 12 + pitchIdx + semitones
  const newOctave = Math.max(1, Math.min(8, Math.floor(totalSemi / 12)))
  const newPitchIdx = ((totalSemi % 12) + 12) % 12
  return `${CHROMATIC_NOTES[newPitchIdx]}${newOctave}`
}

const WHITE_KEYS: { pitch: (typeof CHROMATIC_NOTES)[number]; colStart: number }[] = [
  { pitch: 'C', colStart: 1 },
  { pitch: 'D', colStart: 3 },
  { pitch: 'E', colStart: 5 },
  { pitch: 'F', colStart: 7 },
  { pitch: 'G', colStart: 9 },
  { pitch: 'A', colStart: 11 },
  { pitch: 'B', colStart: 13 },
]

const BLACK_KEYS: { pitch: (typeof CHROMATIC_NOTES)[number]; alt: string; colStart: number }[] = [
  { pitch: 'C#', alt: 'D♭', colStart: 2 },
  { pitch: 'D#', alt: 'E♭', colStart: 4 },
  { pitch: 'F#', alt: 'G♭', colStart: 8 },
  { pitch: 'G#', alt: 'A♭', colStart: 10 },
  { pitch: 'A#', alt: 'B♭', colStart: 12 },
]

export interface NotePickerProps {
  tubeIndex: number
  totalTubes: number
  currentNote: string
  tubeFreq: number
  tubeLength_mm: number
  onSelectNote: (note: string) => void
  onSelectTube: (index: number) => void
  onClose: () => void
  onPlay: () => void
}

export function NotePicker({
  tubeIndex,
  totalTubes,
  currentNote,
  tubeFreq,
  onSelectNote,
  onSelectTube,
  onClose,
  onPlay,
}: NotePickerProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const parsed = parseNoteString(currentNote)

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowRight' && !e.target) {
        onSelectNote(shiftNote(currentNote, 1))
      } else if (e.key === 'ArrowLeft' && !e.target) {
        onSelectNote(shiftNote(currentNote, -1))
      }
    }

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (cardRef.current?.contains(target) || target?.closest('.note-picker-btn')) {
        return
      }
      onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [currentNote, onClose, onSelectNote])

  const handleSelectPitch = (pitch: string) => {
    onSelectNote(`${pitch}${parsed.octave}`)
  }

  const handleSelectOctave = (octave: number) => {
    onSelectNote(`${parsed.pitch}${octave}`)
  }

  const handleShift = (semitones: number) => {
    onSelectNote(shiftNote(currentNote, semitones))
  }

  return (
    <div
      ref={cardRef}
      className="note-picker-card"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={`Note picker for tube ${tubeIndex + 1}`}
    >
      {/* Header */}
      <div className="note-picker-header">
        <div className="note-picker-title">
          <span className="note-picker-tube-badge">Tube #{tubeIndex + 1}</span>
          <span className="note-picker-cur-note">{parsed.display}</span>
          {parsed.enharmonic && (
            <span className="note-picker-enharmonic">({parsed.enharmonic})</span>
          )}
          <span className="note-picker-freq">{tubeFreq.toFixed(1)} Hz</span>
        </div>
        <div className="note-picker-header-actions">
          <button
            type="button"
            className="mini"
            onClick={onPlay}
            title="Play this tube's tone"
          >
            ♪
          </button>
          <button
            type="button"
            className="note-picker-close"
            onClick={onClose}
            title="Close note picker"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Octave selector */}
      <div className="note-picker-octave-row">
        <span className="note-picker-octave-label">Octave</span>
        <div className="note-picker-octaves">
          {[2, 3, 4, 5, 6, 7].map((oct) => (
            <button
              key={oct}
              type="button"
              className={`note-picker-octave-btn ${parsed.octave === oct ? 'active' : ''}`}
              onClick={() => handleSelectOctave(oct)}
              aria-label={`Octave ${oct}`}
              aria-pressed={parsed.octave === oct}
            >
              {oct}
            </button>
          ))}
        </div>
      </div>

      {/* Piano Keyboard (14 columns) */}
      <div className="note-picker-keyboard" role="group" aria-label="Chromatic keyboard">
        {/* Black keys */}
        {BLACK_KEYS.map((k) => {
          const isSelected = parsed.pitch === k.pitch
          return (
            <button
              key={k.pitch}
              type="button"
              className={`np-key black ${isSelected ? 'active' : ''}`}
              style={{ gridColumn: `${k.colStart} / span 2` }}
              onClick={() => handleSelectPitch(k.pitch)}
              title={`${k.pitch}${parsed.octave} / ${k.alt}${parsed.octave}`}
              aria-label={`${k.pitch}${parsed.octave}`}
              aria-pressed={isSelected}
            >
              <span className="np-key-label">{k.pitch}</span>
              <span className="np-key-alt">{k.alt}</span>
            </button>
          )
        })}

        {/* White keys */}
        {WHITE_KEYS.map((k) => {
          const isSelected = parsed.pitch === k.pitch
          return (
            <button
              key={k.pitch}
              type="button"
              className={`np-key white ${isSelected ? 'active' : ''}`}
              style={{ gridColumn: `${k.colStart} / span 2` }}
              onClick={() => handleSelectPitch(k.pitch)}
              title={`${k.pitch}${parsed.octave}`}
              aria-label={`${k.pitch}${parsed.octave}`}
              aria-pressed={isSelected}
            >
              <span className="np-key-label">{k.pitch}</span>
            </button>
          )
        })}
      </div>

      {/* Footer: Semitone Steppers & Tube Nav */}
      <div className="note-picker-footer">
        <div className="note-picker-steppers">
          <button
            type="button"
            className="note-picker-btn-sub"
            onClick={() => handleShift(-1)}
            title="Step down 1 semitone"
          >
            ◀ −1 semi
          </button>
          <button
            type="button"
            className="note-picker-btn-sub"
            onClick={() => handleShift(1)}
            title="Step up 1 semitone"
          >
            +1 semi ▶
          </button>
        </div>

        <div className="note-picker-nav">
          <button
            type="button"
            className="note-picker-btn-sub"
            disabled={tubeIndex <= 0}
            onClick={() => onSelectTube(tubeIndex - 1)}
            title="Tune previous tube"
          >
            {tubeIndex > 0 ? `◀ #${tubeIndex}` : '◀ Prev'}
          </button>
          <button
            type="button"
            className="note-picker-btn-sub"
            disabled={tubeIndex >= totalTubes - 1}
            onClick={() => onSelectTube(tubeIndex + 1)}
            title="Tune next tube"
          >
            {tubeIndex < totalTubes - 1 ? `#${tubeIndex + 2} ▶` : 'Next ▶'}
          </button>
        </div>
      </div>
    </div>
  )
}
