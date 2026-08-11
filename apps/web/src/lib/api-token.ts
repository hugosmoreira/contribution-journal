import { createHash, timingSafeEqual } from 'node:crypto'

// Shared secret between this app and the MCP server a coding agent connects
// to. Deliberately separate from user sign-in: it authenticates a machine,
// grants only capture, and can be rotated without touching accounts.

const MIN_TOKEN_LENGTH = 24

export function apiTokenConfigured(): boolean {
  const token = process.env.JOURNAL_API_TOKEN
  return typeof token === 'string' && token.length >= MIN_TOKEN_LENGTH
}

/**
 * Constant-time bearer check. Hashing both sides first keeps the comparison
 * fixed-width, so a length mismatch cannot throw or leak through timing.
 */
export function authorizeRequest(request: Request): boolean {
  if (!apiTokenConfigured()) return false
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match) return false
  const presented = createHash('sha256').update(match[1]).digest()
  const expected = createHash('sha256').update(process.env.JOURNAL_API_TOKEN as string).digest()
  return timingSafeEqual(presented, expected)
}

/** Quota/metric identity for an agent — one key per token, never an IP. */
export function agentQuotaKey(): string {
  const salt = process.env.METRICS_SALT ?? 'journal-dev-salt'
  return createHash('sha256')
    .update(`${salt}:agent:${process.env.JOURNAL_API_TOKEN ?? ''}`)
    .digest('hex')
    .slice(0, 32)
}
