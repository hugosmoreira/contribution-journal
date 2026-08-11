import { GitHubItemRefSchema, type GitHubItemRef } from '@journal/domain'

export type ParseErrorCode =
  | 'empty'
  | 'not_url'
  | 'wrong_host'
  | 'bad_name'
  | 'bad_number'
  | 'repo_only'
  | 'profile_only'
  | 'unrecognized'

export type ParseResult =
  | { ok: true; ref: GitHubItemRef }
  | { ok: false; code: ParseErrorCode; reason: string }

const NAME_RE = /^[A-Za-z0-9_.-]+$/

// Rejection messages are fixed strings on purpose: they get reflected into
// the UI, so they must never embed user-controlled input.
const REASONS: Record<ParseErrorCode, string> = {
  empty: 'Paste a GitHub pull request or issue URL to begin.',
  not_url: "That doesn't look like a URL. Expected something like github.com/owner/repo/pull/123.",
  wrong_host: 'Only public github.com links are supported.',
  bad_name: 'That URL contains characters GitHub owners and repositories never use — check it and try again.',
  bad_number: 'The pull request or issue number in that URL is not a plain number.',
  repo_only: 'That is a repository link. Paste a specific pull request or issue, e.g. github.com/owner/repo/pull/123.',
  profile_only: 'That is a profile link. Paste a specific pull request or issue, e.g. github.com/owner/repo/pull/123.',
  unrecognized: 'Unrecognized GitHub link shape. Expected github.com/owner/repo/pull/123 or /issues/123.',
}

function fail(code: ParseErrorCode): ParseResult {
  return { ok: false, code, reason: REASONS[code] }
}

/**
 * Accepts public github.com pull request URLs (issues recognized as a
 * secondary shape). Everything else is rejected with a clear, specific
 * message (SPEC_V0.1 §3.1).
 */
export function parseGitHubUrl(input: string): ParseResult {
  const trimmed = input.trim()
  if (!trimmed) return fail('empty')

  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return fail('not_url')
  }

  const host = url.hostname.toLowerCase()
  if (host !== 'github.com' && host !== 'www.github.com') return fail('wrong_host')

  const parts = url.pathname.split('/').filter(Boolean)

  if (parts.length >= 4 && (parts[2] === 'pull' || parts[2] === 'issues')) {
    // GitHub owner/repo are case-insensitive; lowercasing canonicalizes every
    // downstream cache key and route so casings can't multiply imports.
    const owner = parts[0].toLowerCase()
    const repo = parts[1].toLowerCase()
    const type = parts[2]
    const rawNumber = parts[3]
    if (!NAME_RE.test(owner) || !NAME_RE.test(repo)) return fail('bad_name')
    // Strict decimal only: Number() alone would accept '0x10', '1e2', '+123'
    // and silently import a different PR than the one in the pasted URL.
    if (!/^[0-9]+$/.test(rawNumber)) return fail('bad_number')
    const number = Number(rawNumber)
    if (!Number.isSafeInteger(number) || number <= 0) return fail('bad_number')
    const ref = GitHubItemRefSchema.parse({ owner, repo, number, kind: type === 'pull' ? 'pr' : 'issue' })
    return { ok: true, ref }
  }

  if (parts.length === 2) return fail('repo_only')
  if (parts.length === 1) return fail('profile_only')

  return fail('unrecognized')
}
