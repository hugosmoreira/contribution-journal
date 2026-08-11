import { describe, expect, it, vi } from 'vitest'
import {
  buildAuthorizeUrl,
  decryptToken,
  encryptToken,
  exchangeCodeForToken,
  fetchGitHubUser,
  hashSessionToken,
  newRandomToken,
  oauthConfigured,
  safeNextPath,
  tokensEqual,
} from '../src/index'

const SECRET = 'a-development-secret-at-least-32-chars-long'

describe('oauthConfigured', () => {
  it('requires both client id and secret', () => {
    expect(oauthConfigured({})).toBe(false)
    expect(oauthConfigured({ GITHUB_OAUTH_CLIENT_ID: 'x' })).toBe(false)
    expect(oauthConfigured({ GITHUB_OAUTH_CLIENT_SECRET: 'y' })).toBe(false)
    expect(oauthConfigured({ GITHUB_OAUTH_CLIENT_ID: 'x', GITHUB_OAUTH_CLIENT_SECRET: 'y' })).toBe(true)
  })
})

describe('buildAuthorizeUrl', () => {
  it('targets github authorize with client id, redirect, and state', () => {
    const url = new URL(
      buildAuthorizeUrl({ clientId: 'cid', redirectUri: 'http://localhost:3000/api/auth/callback', state: 'st4te' }),
    )
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/auth/callback')
    expect(url.searchParams.get('state')).toBe('st4te')
  })

  it('never requests a scope — empty scope is the read-only public grant (SPEC §3.9)', () => {
    const url = new URL(buildAuthorizeUrl({ clientId: 'c', redirectUri: 'http://x/cb', state: 's' }))
    expect(url.searchParams.has('scope')).toBe(false)
  })
})

describe('safeNextPath', () => {
  it('accepts plain same-origin paths', () => {
    expect(safeNextPath('/story/o/r/1')).toBe('/story/o/r/1')
    expect(safeNextPath('/')).toBe('/')
    expect(safeNextPath('/s/abc?x=1')).toBe('/s/abc?x=1')
  })

  it('rejects absolute URLs, protocol-relative, backslashes, and junk', () => {
    expect(safeNextPath('https://evil.example')).toBe('/')
    expect(safeNextPath('//evil.example')).toBe('/')
    expect(safeNextPath('/\\evil.example')).toBe('/')
    expect(safeNextPath('/a\r\nSet-Cookie: x=y')).toBe('/')
    expect(safeNextPath('javascript:alert(1)')).toBe('/')
    expect(safeNextPath('')).toBe('/')
    expect(safeNextPath(null)).toBe('/')
    expect(safeNextPath(42)).toBe('/')
    expect(safeNextPath(`/${'a'.repeat(700)}`)).toBe('/')
  })
})

describe('session tokens', () => {
  it('generates url-safe tokens and stable hashes', () => {
    const token = newRandomToken()
    expect(token.length).toBeGreaterThanOrEqual(40)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(hashSessionToken(token)).toBe(hashSessionToken(token))
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashSessionToken(token)).not.toContain(token)
  })

  it('tokensEqual compares without throwing on length mismatch', () => {
    expect(tokensEqual('abc', 'abc')).toBe(true)
    expect(tokensEqual('abc', 'abcd')).toBe(false)
    expect(tokensEqual('abc', 'xyz')).toBe(false)
  })
})

describe('access-token encryption', () => {
  it('round-trips under the configured secret', () => {
    const enc = encryptToken('gho_secret_value', SECRET)
    expect(enc).toBeTruthy()
    expect(enc).not.toContain('gho_secret_value')
    expect(decryptToken(enc as string, SECRET)).toBe('gho_secret_value')
  })

  it('refuses to encrypt without a strong secret — token is then not stored at all', () => {
    expect(encryptToken('gho_x', undefined)).toBeNull()
    expect(encryptToken('gho_x', 'short')).toBeNull()
  })

  it('fails closed on wrong secret or tampered payload', () => {
    const enc = encryptToken('gho_x', SECRET) as string
    expect(decryptToken(enc, `${SECRET}-different-but-also-long-enough`)).toBeNull()
    const tampered = enc.slice(0, -4) + (enc.endsWith('AAAA') ? 'BBBB' : 'AAAA')
    expect(decryptToken(tampered, SECRET)).toBeNull()
    expect(decryptToken('not-a-payload', SECRET)).toBeNull()
  })

  it('uses a fresh IV per encryption', () => {
    const a = encryptToken('same', SECRET)
    const b = encryptToken('same', SECRET)
    expect(a).not.toBe(b)
  })
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('exchangeCodeForToken', () => {
  const opts = { clientId: 'cid', clientSecret: 'csec', code: 'c0de', redirectUri: 'http://x/cb' }

  it('posts credentials to github and returns the access token', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://github.com/login/oauth/access_token')
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({ client_id: 'cid', client_secret: 'csec', code: 'c0de' })
      expect((init?.headers as Record<string, string>).accept).toBe('application/json')
      return jsonResponse(200, { access_token: 'gho_token', token_type: 'bearer', scope: '' })
    })
    await expect(exchangeCodeForToken(opts, fetchMock)).resolves.toBe('gho_token')
  })

  it('throws on error payloads and non-200s without leaking the response', async () => {
    await expect(
      exchangeCodeForToken(opts, async () => jsonResponse(200, { error: 'bad_verification_code' })),
    ).rejects.toThrow(/exchange failed/)
    await expect(exchangeCodeForToken(opts, async () => jsonResponse(502, {}))).rejects.toThrow(/HTTP 502/)
    await expect(exchangeCodeForToken(opts, async () => jsonResponse(200, {}))).rejects.toThrow(/no token/)
  })
})

describe('fetchGitHubUser', () => {
  it('maps the public user payload', async () => {
    const user = await fetchGitHubUser('gho_t', async (url, init) => {
      expect(url).toBe('https://api.github.com/user')
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer gho_t')
      return jsonResponse(200, {
        id: 12345,
        login: 'hugo',
        name: 'Hugo',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
      })
    })
    expect(user).toEqual({
      githubId: '12345',
      login: 'hugo',
      name: 'Hugo',
      avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
    })
  })

  it('rejects malformed logins and non-github avatar hosts', async () => {
    await expect(
      fetchGitHubUser('t', async () => jsonResponse(200, { id: 1, login: 'evil login!' })),
    ).rejects.toThrow(/unexpected payload/)
    const user = await fetchGitHubUser('t', async () =>
      jsonResponse(200, { id: 1, login: 'ok', avatar_url: 'https://evil.example/x.png' }),
    )
    expect(user.avatarUrl).toBeNull()
  })

  it('throws on non-200', async () => {
    await expect(fetchGitHubUser('t', async () => jsonResponse(401, {}))).rejects.toThrow(/HTTP 401/)
  })
})
