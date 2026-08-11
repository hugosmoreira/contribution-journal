import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

// GitHub OAuth core for SPEC_V0.1 §3.9: read-only public scope, tokens
// server-side and encrypted, sessions referenced by an opaque cookie. This
// package is pure logic — no Next.js, no database — so every rule here is
// unit-testable; the web app supplies cookies, env, and storage.

export const SESSION_COOKIE = 'journal_session'
export const OAUTH_STATE_COOKIE = 'journal_oauth'
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60

export type GitHubUser = {
  githubId: string
  login: string
  name: string | null
  avatarUrl: string | null
}

export function oauthConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET)
}

/**
 * The authorize URL deliberately carries NO scope parameter: an empty scope
 * grants read-only access to public information, which is the entire §3.9
 * requirement ("read-only public scope. No write permissions.").
 */
export function buildAuthorizeUrl(opts: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', opts.clientId)
  url.searchParams.set('redirect_uri', opts.redirectUri)
  url.searchParams.set('state', opts.state)
  return url.toString()
}

export function newRandomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** SHA-256 hex of the session cookie value — only the hash touches the database. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function tokensEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/**
 * Post-sign-in redirect targets are attacker-influencable (?next=…), so only
 * same-origin absolute paths survive; everything else falls back to home.
 */
export function safeNextPath(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0 || input.length > 600) return '/'
  if (!input.startsWith('/') || input.startsWith('//')) return '/'
  // Backslashes and control characters have no place in a path we mint
  // ourselves; some parsers treat "/\evil.com" as protocol-relative.
  if (/[\\\r\n\t]/.test(input)) return '/'
  return input
}

// ---------------------------------------------------------------------------
// Access-token encryption (AES-256-GCM). The GitHub token is unused by any
// v0.1 feature, so it is stored only when JOURNAL_SECRET is configured —
// and then never in plaintext. Without a secret we store nothing at all.
// ---------------------------------------------------------------------------

const MIN_SECRET_LENGTH = 32

function encryptionKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest()
}

export function encryptToken(plaintext: string, secret: string | undefined): string | null {
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${tag.toString('base64url')}`
}

export function decryptToken(payload: string, secret: string | undefined): string | null {
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null
  try {
    const [version, ivB64, ctB64, tagB64] = payload.split('.')
    if (version !== 'v1' || !ivB64 || !ctB64 || !tagB64) return null
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(ivB64, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// GitHub network glue. fetch is injectable so the handshake is testable
// without GitHub; failures throw a single generic error — the callback route
// never reflects GitHub error detail to the browser.
// ---------------------------------------------------------------------------

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

const USER_AGENT = 'contribution-journal'

export async function exchangeCodeForToken(
  opts: { clientId: string; clientSecret: string; code: string; redirectUri: string },
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const res = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': USER_AGENT,
    },
    body: JSON.stringify({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
    }),
  })
  if (!res.ok) throw new Error(`oauth token exchange failed: HTTP ${res.status}`)
  const body = (await res.json()) as { access_token?: string; error?: string }
  if (body.error || !body.access_token) {
    throw new Error(`oauth token exchange failed: ${body.error ?? 'no token in response'}`)
  }
  return body.access_token
}

export async function fetchGitHubUser(accessToken: string, fetchImpl: FetchLike = fetch): Promise<GitHubUser> {
  const res = await fetchImpl('https://api.github.com/user', {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${accessToken}`,
      'user-agent': USER_AGENT,
    },
  })
  if (!res.ok) throw new Error(`github /user failed: HTTP ${res.status}`)
  const body = (await res.json()) as {
    id?: number
    login?: string
    name?: string | null
    avatar_url?: string | null
  }
  // GitHub logins are ASCII alphanumerics and hyphens; anything else in this
  // field means the response is not what we think it is.
  if (typeof body.id !== 'number' || typeof body.login !== 'string' || !/^[A-Za-z0-9-]+$/.test(body.login)) {
    throw new Error('github /user returned an unexpected payload')
  }
  return {
    githubId: String(body.id),
    login: body.login,
    name: typeof body.name === 'string' ? body.name.slice(0, 200) : null,
    avatarUrl:
      typeof body.avatar_url === 'string' && /^https:\/\/[a-z0-9.-]*githubusercontent\.com\//i.test(body.avatar_url)
        ? body.avatar_url
        : null,
  }
}
