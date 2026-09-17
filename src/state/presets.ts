import { DEFAULT_CONFIG, ChimeConfig } from './store'

/**
 * Named configuration snapshots in localStorage.
 * Stored shape: { name, savedAt, config } — same config object the
 * import/export flow uses, so snapshots are forward-compatible with files.
 */

const KEY = 'windspiel.presets.v1'

export interface Preset {
  name: string
  savedAt: string
  config: ChimeConfig
}

function read(): Record<string, Preset> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function write(all: Record<string, Preset>) {
  localStorage.setItem(KEY, JSON.stringify(all))
}

export function listPresets(): Preset[] {
  return Object.values(read()).sort((a, b) => a.name.localeCompare(b.name))
}

export function savePreset(name: string, config: ChimeConfig): Preset {
  const all = read()
  const preset: Preset = { name, savedAt: new Date().toISOString(), config }
  all[name] = preset
  write(all)
  return preset
}

export function loadPreset(name: string): ChimeConfig | null {
  const p = read()[name]
  if (!p) return null
  // same defensive key filtering as file import
  const cfg = { ...(Object.keys(DEFAULT_CONFIG) as (keyof ChimeConfig)[])
    .reduce((o, k) => (o[k] = (p.config as ChimeConfig)[k], o), {} as Record<string, unknown>) }
  if (!Array.isArray(cfg.manualNotes)) cfg.manualNotes = [...DEFAULT_CONFIG.manualNotes]
  return cfg as unknown as ChimeConfig
}

export function deletePreset(name: string) {
  const all = read()
  delete all[name]
  write(all)
}
