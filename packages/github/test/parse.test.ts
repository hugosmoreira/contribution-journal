import { describe, expect, it } from 'vitest'
import { parseGitHubUrl } from '../src/parse'
import { redactSecrets } from '../src/redact'

describe('parseGitHubUrl', () => {
  it('accepts a standard pull request URL', () => {
    const result = parseGitHubUrl('https://github.com/facebook/react/pull/123')
    expect(result).toEqual({
      ok: true,
      ref: { owner: 'facebook', repo: 'react', number: 123, kind: 'pr' },
    })
  })

  it('accepts URLs without a protocol', () => {
    const result = parseGitHubUrl('github.com/vercel/next.js/pull/42')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.ref.repo).toBe('next.js')
  })

  it('accepts sub-pages of a pull request (files, commits)', () => {
    const result = parseGitHubUrl('https://github.com/a/b/pull/7/files')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.ref.number).toBe(7)
  })

  it('recognizes issue URLs as the secondary shape', () => {
    const result = parseGitHubUrl('https://github.com/a/b/issues/9')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.ref.kind).toBe('issue')
  })

  it('rejects repository-only URLs with a specific code', () => {
    const result = parseGitHubUrl('https://github.com/facebook/react')
    expect(result).toMatchObject({ ok: false, code: 'repo_only' })
  })

  it('rejects non-GitHub hosts', () => {
    const result = parseGitHubUrl('https://gitlab.com/a/b/merge_requests/1')
    expect(result).toMatchObject({ ok: false, code: 'wrong_host' })
  })

  it('rejects non-decimal numbers that Number() would silently coerce', () => {
    // 0x10 → 16, 1e2 → 100, +123 → 123: each would import a different PR
    // than the URL names.
    for (const bad of ['0x10', '1e2', '+123', '123.0', '999999999999999999999']) {
      const result = parseGitHubUrl(`https://github.com/a/b/pull/${bad}`)
      expect(result, bad).toMatchObject({ ok: false, code: 'bad_number' })
    }
  })

  it('rejects invalid numbers and empty input', () => {
    expect(parseGitHubUrl('https://github.com/a/b/pull/abc')).toMatchObject({ ok: false, code: 'bad_number' })
    expect(parseGitHubUrl('https://github.com/a/b/pull/-1')).toMatchObject({ ok: false, code: 'bad_number' })
    expect(parseGitHubUrl('   ')).toMatchObject({ ok: false, code: 'empty' })
  })

  it('never embeds user input in rejection messages', () => {
    const result = parseGitHubUrl('https://evil.example/a/b/pull/1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).not.toContain('evil.example')
  })
})

describe('redactSecrets', () => {
  it('redacts GitHub token shapes', () => {
    const input = 'leaked ghp_0123456789abcdefghijABCDEFGHIJ123456 in a comment'
    expect(redactSecrets(input)).not.toContain('ghp_')
    expect(redactSecrets(input)).toContain('[redacted]')
  })

  it('redacts OpenAI-style keys', () => {
    const input = 'key sk-proj-Abc123Def456Ghi789Jkl012 was pasted'
    expect(redactSecrets(input)).toContain('[redacted]')
  })

  it('does not eat kebab-case prose starting with sk-', () => {
    const input = 'the sk-learn-compatible-estimators-refactor branch'
    expect(redactSecrets(input)).toBe(input)
  })

  it('leaves normal prose alone', () => {
    const input = 'This fixes the flaky retry logic in the scheduler.'
    expect(redactSecrets(input)).toBe(input)
  })
})
