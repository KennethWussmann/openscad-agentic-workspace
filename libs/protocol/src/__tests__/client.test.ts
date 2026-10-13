import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiClient, fileRoute } from '../client.ts'

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

afterEach(() => vi.unstubAllGlobals())

describe('createApiClient', () => {
  it('prefixes the origin and api root and sends json bodies', async () => {
    const fetch = respond(200, { ok: true })
    vi.stubGlobal('fetch', fetch)
    await createApiClient('http://localhost:5180').tweak('my box', { width: 3 })
    expect(fetch).toHaveBeenCalledWith('http://localhost:5180/api/projects/my%20box/tweak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params: { width: 3 } }),
      signal: undefined,
    })
  })

  it('throws the server error message', async () => {
    vi.stubGlobal('fetch', respond(404, { error: 'unknown project' }))
    await expect(createApiClient().navigate('nope')).rejects.toThrow('unknown project')
  })

  it('falls back to the status when the server sends no message', async () => {
    vi.stubGlobal('fetch', respond(500, {}))
    await expect(createApiClient().projects()).rejects.toThrow('/projects failed with 500')
  })
})

describe('fileRoute', () => {
  it('encodes every path segment and the stamp', () => {
    expect(fileRoute('box', 'preview/a b.3mf', '2026-01-01T00:00:00Z')).toBe(
      '/api/projects/box/file/preview/a%20b.3mf?v=2026-01-01T00%3A00%3A00Z',
    )
  })
})
