import { deflateSync, decompressSync, strToU8, strFromU8 } from 'fflate'
import { DEFAULT_CONFIG, ChimeConfig } from './store'

interface NodeBufferLike {
  from(data: Uint8Array | string, encoding?: string): {
    toString(encoding: string): string
    buffer: ArrayBuffer
    byteOffset: number
    byteLength: number
  }
}

const NodeBuffer = typeof globalThis !== 'undefined'
  ? (globalThis as unknown as { Buffer?: NodeBufferLike }).Buffer
  : undefined

/**
 * Converts a Uint8Array into a Base64 string.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  if (NodeBuffer) {
    return NodeBuffer.from(bytes).toString('base64')
  }
  let bin = ''
  const len = bytes.length
  for (let i = 0; i < len; i++) {
    bin += String.fromCharCode(bytes[i])
  }
  return btoa(bin)
}

/**
 * Converts a Base64 string into a Uint8Array.
 * Normalizes URL-safe characters (- and _) and restores spaces to +.
 */
export function base64ToBytes(b64: string): Uint8Array | null {
  if (!b64 || typeof b64 !== 'string') return null
  const trimmed = b64.trim()
  if (!/^[A-Za-z0-9+/_\-=\s]+$/.test(trimmed)) return null
  try {
    let normalized = trimmed.replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/')
    while (normalized.length % 4 !== 0) {
      normalized += '='
    }
    if (NodeBuffer) {
      const buf = NodeBuffer.from(normalized, 'base64')
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    }
    const bin = atob(normalized)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i)
    }
    return bytes
  } catch {
    return null
  }
}

/**
 * UTF-8 safe Base64 encoding.
 */
export function toBase64(str: string): string {
  return bytesToBase64(strToU8(str))
}

/**
 * UTF-8 safe Base64 decoding.
 */
export function fromBase64(b64: string): string | null {
  const bytes = base64ToBytes(b64)
  if (!bytes) return null
  try {
    return strFromU8(bytes)
  } catch {
    return null
  }
}

/**
 * Serializes a ChimeConfig (or partial) to a compressed, base64 encoded string.
 * Uses deflate compression to minimize URL length.
 */
export function encodeConfigToBase64(config: Partial<ChimeConfig>): string {
  const json = JSON.stringify(config)
  const u8 = strToU8(json)
  const compressed = deflateSync(u8, { level: 9 })
  return bytesToBase64(compressed)
}

const NUMERIC_KEYS: (keyof ChimeConfig)[] = [
  'tubeCount', 'outerDiameter_mm', 'wallThickness_mm', 'suspensionRadius_mm',
  'suspensionPoint', 'strikerDiameter_mm', 'strikerHeight_mm', 'strikerDistanceToTube_mm',
  'strikerDrop_mm', 'windStrength', 'gustFrequency', 'sailMass_g', 'sailArea_cm2', 'volume',
  'plateRadius_mm', 'tubeDrop_mm',
]

const BOOLEAN_KEYS: (keyof ChimeConfig)[] = [
  'advanced', 'solid', 'coupling', 'sameAbsoluteSuspension',
]

const STRING_KEYS: (keyof ChimeConfig)[] = [
  'material', 'tuningMode', 'scaleId', 'rootNote', 'strikerMaterial',
  'strikerForm', 'strikerMode', 'plateShape', 'plateColor', 'tubeAlignment',
  'sailType', 'sailColor',
]

/**
 * Decodes and validates a base64 string into a safe Partial<ChimeConfig>.
 * Supports both compressed (deflate/gzip/zlib) and uncompressed JSON payloads.
 * Rejects unknown or invalid fields. Returns null if decoding/parsing fails.
 */
export function decodeConfigFromBase64(encoded: string): Partial<ChimeConfig> | null {
  if (!encoded || typeof encoded !== 'string') return null
  try {
    const bytes = base64ToBytes(encoded)
    if (!bytes || bytes.length === 0) return null

    let json: string | null = null

    // Check if payload is uncompressed JSON: first non-whitespace character is '{' (ASCII 123)
    let startsWithBrace = false
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]
      if (b === 32 || b === 9 || b === 10 || b === 13) continue
      if (b === 123) startsWithBrace = true
      break
    }

    if (startsWithBrace) {
      try {
        json = strFromU8(bytes)
      } catch {
        json = null
      }
    }

    // If not uncompressed JSON or uncompressed decode failed, decompress with fflate
    if (!json) {
      try {
        const decompressed = decompressSync(bytes)
        json = strFromU8(decompressed)
      } catch {
        try {
          json = strFromU8(bytes)
        } catch {
          json = null
        }
      }
    }

    if (!json) return null
    const parsed = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

    const result: Partial<ChimeConfig> = {}

    for (const key of NUMERIC_KEYS) {
      if (key in parsed && typeof parsed[key] === 'number' && !isNaN(parsed[key])) {
        result[key] = parsed[key] as never
      }
    }

    if (result.tubeCount !== undefined) {
      result.tubeCount = Math.max(3, Math.min(12, Math.round(result.tubeCount)))
    }

    for (const key of BOOLEAN_KEYS) {
      if (key in parsed && typeof parsed[key] === 'boolean') {
        result[key] = parsed[key] as never
      }
    }

    for (const key of STRING_KEYS) {
      if (key in parsed && typeof parsed[key] === 'string') {
        result[key] = parsed[key] as never
      }
    }

    if (result.tubeAlignment && !['top', 'suspension', 'centerStrike'].includes(result.tubeAlignment)) {
      delete result.tubeAlignment
    }

    if (Array.isArray(parsed.manualNotes) && parsed.manualNotes.every((n: unknown) => typeof n === 'string')) {
      result.manualNotes = [...parsed.manualNotes]
    }

    if (Array.isArray(parsed.tubeOverrides)) {
      result.tubeOverrides = parsed.tubeOverrides.map((o: unknown) => {
        if (!o || typeof o !== 'object') return {}
        const safe: Record<string, unknown> = {}
        const rec = o as Record<string, unknown>
        if (typeof rec.material === 'string') safe.material = rec.material
        if (typeof rec.outerDiameter_mm === 'number') safe.outerDiameter_mm = rec.outerDiameter_mm
        if (typeof rec.wallThickness_mm === 'number') safe.wallThickness_mm = rec.wallThickness_mm
        if (typeof rec.solid === 'boolean') safe.solid = rec.solid
        if (typeof rec.suspension_mm === 'number') safe.suspension_mm = rec.suspension_mm
        if (typeof rec.suspensionPoint === 'number') safe.suspensionPoint = rec.suspensionPoint
        return safe
      })
    }

    if (parsed.materialSpeedFactors && typeof parsed.materialSpeedFactors === 'object' && !Array.isArray(parsed.materialSpeedFactors)) {
      const factors: Record<string, number> = {}
      for (const [k, v] of Object.entries(parsed.materialSpeedFactors)) {
        if (typeof v === 'number' && !isNaN(v)) {
          factors[k] = v
        }
      }
      result.materialSpeedFactors = factors
    }

    return Object.keys(result).length > 0 ? result : null
  } catch {
    return null
  }
}

/**
 * Generates a full URL containing the base64 encoded configuration parameter.
 */
export function generateShareUrl(config: Partial<ChimeConfig>, baseUrl?: string): string {
  const b64 = encodeConfigToBase64(config)
  const base = baseUrl || (typeof window !== 'undefined' ? window.location.href : 'http://localhost/')
  const url = new URL(base)
  url.searchParams.set('config', b64)
  return url.toString()
}

/**
 * Parses and extracts a Partial<ChimeConfig> from a URL string, query string, or current window.location.
 */
export function parseConfigFromUrl(urlOrSearch?: string): Partial<ChimeConfig> | null {
  let search = ''
  if (urlOrSearch !== undefined) {
    if (urlOrSearch.includes('?')) {
      search = urlOrSearch.slice(urlOrSearch.indexOf('?'))
    } else if (urlOrSearch.startsWith('#')) {
      search = urlOrSearch.slice(1)
    } else {
      search = urlOrSearch.startsWith('config=') || urlOrSearch.startsWith('c=') ? `?${urlOrSearch}` : urlOrSearch
    }
  } else if (typeof window !== 'undefined') {
    search = window.location.search
  }

  if (!search) return null
  try {
    const params = new URLSearchParams(search)
    const param = params.get('config') || params.get('c')
    if (!param) return null
    return decodeConfigFromBase64(param)
  } catch {
    return null
  }
}

/**
 * Copies text to clipboard with fallback for non-secure contexts or permission restrictions.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fallback to execCommand below
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      textarea.style.top = '-9999px'
      textarea.setAttribute('readonly', '')
      document.body.appendChild(textarea)
      textarea.select()
      const success = document.execCommand('copy')
      document.body.removeChild(textarea)
      return success
    } catch {
      return false
    }
  }
  return false
}
