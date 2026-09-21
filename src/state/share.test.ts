import { describe, it, expect } from 'vitest'
import {
  toBase64,
  fromBase64,
  encodeConfigToBase64,
  decodeConfigFromBase64,
  generateShareUrl,
  parseConfigFromUrl,
  bytesToBase64,
} from './share'
import { DEFAULT_CONFIG, ChimeConfig } from './store'
import { gzipSync, zlibSync, strToU8 } from 'fflate'

describe('share utility: base64 encoding/decoding', () => {
  it('round-trips standard ascii strings', () => {
    const original = 'Hello World 123!?'
    const encoded = toBase64(original)
    const decoded = fromBase64(encoded)
    expect(decoded).toBe(original)
  })

  it('round-trips unicode and emoji strings', () => {
    const original = 'Windspiel 🎐 Müller € 100% 🎶'
    const encoded = toBase64(original)
    const decoded = fromBase64(encoded)
    expect(decoded).toBe(original)
  })

  it('decodes url-safe base64 characters (- and _) and handles missing padding', () => {
    const str = '{"scaleId":"pentMajor"}'
    const standardB64 = toBase64(str)
    // Replace standard chars with URL-safe chars and strip padding
    const urlSafe = standardB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const decoded = fromBase64(urlSafe)
    expect(decoded).toBe(str)
  })

  it('handles spaces where pluses were replaced by url parsers', () => {
    // Generate a string that produces '+' in standard base64
    const original = '????>>>>____++++'
    const b64 = toBase64(original)
    if (b64.includes('+')) {
      const withSpaces = b64.replace(/\+/g, ' ')
      expect(fromBase64(withSpaces)).toBe(original)
    }
  })

  it('returns null on invalid base64 input without throwing', () => {
    expect(fromBase64('~~~not-base64~~~')).toBe(null)
  })
})

describe('share utility: config serialization, compression & backwards compatibility', () => {
  it('compresses JSON to make the URL significantly shorter than uncompressed base64', () => {
    const uncompressedB64 = toBase64(JSON.stringify(DEFAULT_CONFIG))
    const compressedB64 = encodeConfigToBase64(DEFAULT_CONFIG)
    expect(compressedB64.length).toBeLessThan(uncompressedB64.length * 0.7) // at least 30% shorter
  })

  it('round-trips default config completely via compressed format', () => {
    const b64 = encodeConfigToBase64(DEFAULT_CONFIG)
    const parsed = decodeConfigFromBase64(b64)
    expect(parsed).not.toBeNull()
    expect(parsed?.tubeCount).toBe(DEFAULT_CONFIG.tubeCount)
    expect(parsed?.material).toBe(DEFAULT_CONFIG.material)
    expect(parsed?.tubeAlignment).toBe(DEFAULT_CONFIG.tubeAlignment)
    expect(parsed?.strikerForm).toBe(DEFAULT_CONFIG.strikerForm)
    expect(parsed?.sailArea_cm2).toBe(DEFAULT_CONFIG.sailArea_cm2)
  })

  it('still decodes UNCOMPRESSED sharing URLs for backwards compatibility', () => {
    const legacyConfig: Partial<ChimeConfig> = {
      tubeCount: 8,
      material: 'copper',
      strikerForm: 'multisided',
      tubeAlignment: 'centerStrike',
      sailArea_cm2: 120,
    }
    const legacyUncompressedB64 = toBase64(JSON.stringify(legacyConfig))
    const parsed = decodeConfigFromBase64(legacyUncompressedB64)
    expect(parsed).not.toBeNull()
    expect(parsed?.tubeCount).toBe(8)
    expect(parsed?.material).toBe('copper')
    expect(parsed?.strikerForm).toBe('multisided')
    expect(parsed?.tubeAlignment).toBe('centerStrike')
    expect(parsed?.sailArea_cm2).toBe(120)
  })

  it('decodes gzip and zlib compressed payloads', () => {
    const cfg = { tubeCount: 7, material: 'bronze' }
    const jsonStr = JSON.stringify(cfg)
    
    // Test gzip
    const gzBytes = gzipSync(strToU8(jsonStr))
    const gzB64 = bytesToBase64(gzBytes)
    expect(decodeConfigFromBase64(gzB64)?.tubeCount).toBe(7)

    // Test zlib
    const zlBytes = zlibSync(strToU8(jsonStr))
    const zlB64 = bytesToBase64(zlBytes)
    expect(decodeConfigFromBase64(zlB64)?.material).toBe('bronze')
  })

  it('sanitizes and filters unknown fields', () => {
    const malicious = JSON.stringify({
      tubeCount: 8,
      material: 'titanium',
      strikerForm: 'multisided',
      hackedField: 'exploit',
      __proto__: { admin: true },
    })
    const b64 = toBase64(malicious)
    const decoded = decodeConfigFromBase64(b64)
    expect(decoded).not.toBeNull()
    expect(decoded?.tubeCount).toBe(8)
    expect(decoded?.material).toBe('titanium')
    expect(decoded?.strikerForm).toBe('multisided')
    expect((decoded as Record<string, unknown>).hackedField).toBeUndefined()
  })

  it('clamps tubeCount to valid range [3..12]', () => {
    const low = toBase64(JSON.stringify({ tubeCount: 1 }))
    expect(decodeConfigFromBase64(low)?.tubeCount).toBe(3)

    const high = toBase64(JSON.stringify({ tubeCount: 99 }))
    expect(decodeConfigFromBase64(high)?.tubeCount).toBe(12)
  })

  it('validates manualNotes and tubeOverrides array structure', () => {
    const valid = toBase64(JSON.stringify({
      manualNotes: ['C4', 'E4', 'G4'],
      tubeOverrides: [{ material: 'brass', solid: true }],
    }))
    const decoded = decodeConfigFromBase64(valid)
    expect(decoded?.manualNotes).toEqual(['C4', 'E4', 'G4'])
    expect(decoded?.tubeOverrides).toEqual([{ material: 'brass', solid: true }])

    const invalidNotes = toBase64(JSON.stringify({ manualNotes: 'not an array' }))
    expect(decodeConfigFromBase64(invalidNotes)?.manualNotes).toBeUndefined()
  })

  it('returns null on invalid JSON or non-object payload', () => {
    expect(decodeConfigFromBase64(toBase64('12345'))).toBeNull()
    expect(decodeConfigFromBase64(toBase64('"just a string"'))).toBeNull()
    expect(decodeConfigFromBase64('invalid!base64!')).toBeNull()
  })
})

describe('share utility: URL generation and parsing', () => {
  it('generates a URL with ?config= parameter', () => {
    const config: Partial<ChimeConfig> = { tubeCount: 5, strikerForm: 'multisided' }
    const url = generateShareUrl(config, 'https://example.com/windspiel')
    expect(url).toContain('https://example.com/windspiel?config=')

    const parsed = parseConfigFromUrl(url)
    expect(parsed?.tubeCount).toBe(5)
    expect(parsed?.strikerForm).toBe('multisided')
  })

  it('updates existing config parameter if already present in base URL', () => {
    const initialUrl = 'https://example.com/windspiel?config=oldVal&other=1'
    const newUrl = generateShareUrl({ tubeCount: 7 }, initialUrl)
    const parsed = parseConfigFromUrl(newUrl)
    expect(parsed?.tubeCount).toBe(7)
    expect(newUrl).toContain('other=1')
  })

  it('parses config from query string directly', () => {
    const b64 = encodeConfigToBase64({ material: 'copper', tubeCount: 4 })
    const parsed = parseConfigFromUrl(`?config=${b64}`)
    expect(parsed?.material).toBe('copper')
    expect(parsed?.tubeCount).toBe(4)
  })

  it('supports ?c= alias', () => {
    const b64 = encodeConfigToBase64({ tubeCount: 9 })
    const parsed = parseConfigFromUrl(`?c=${b64}`)
    expect(parsed?.tubeCount).toBe(9)
  })

  it('returns null if query string has no config param', () => {
    expect(parseConfigFromUrl('https://example.com/')).toBeNull()
    expect(parseConfigFromUrl('?other=123')).toBeNull()
    expect(parseConfigFromUrl('')).toBeNull()
  })
})
