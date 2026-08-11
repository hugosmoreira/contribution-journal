import { describe, expect, it } from 'vitest'
import { extractClosingIssues } from '../src/fetch'

describe('extractClosingIssues', () => {
  it('finds GitHub closing keywords in any casing and punctuation', () => {
    const body = 'This PR Fixes #7, also closes: #12 and Resolved #9.\n\nFix #7 again (dupe).'
    expect(extractClosingIssues(body, 99)).toEqual([7, 12, 9])
  })

  it('ignores plain references, self-references, and non-numbers', () => {
    expect(extractClosingIssues('See #14 for context. Fixes #19.', 19)).toEqual([])
    expect(extractClosingIssues('Related to #3', 99)).toEqual([])
    expect(extractClosingIssues(undefined, 99)).toEqual([])
  })

  it('caps the list at 20', () => {
    const body = Array.from({ length: 30 }, (_, i) => `fixes #${i + 1}`).join(' ')
    expect(extractClosingIssues(body, 999)).toHaveLength(20)
  })
})
