import { z } from 'zod'

const isoTimestamp = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'invalid timestamp' })

export function isGitHubWebUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'https:' && (u.hostname === 'github.com' || u.hostname.endsWith('.github.com'))
  } catch {
    return false
  }
}

export function isGitHubAssetUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return (
      u.protocol === 'https:' &&
      (u.hostname === 'github.com' || u.hostname.endsWith('.githubusercontent.com'))
    )
  } catch {
    return false
  }
}

// Imported URLs are untrusted data; they end up in href/src attributes where
// React's text escaping does not protect us, so the schema is the gate.
const githubWebUrl = z.string().refine(isGitHubWebUrl, { message: 'not a github.com https URL' })
const githubAssetUrl = z.string().refine(isGitHubAssetUrl, { message: 'not a GitHub asset URL' })

export const GitHubItemRefSchema = z.object({
  owner: z.string().regex(/^[A-Za-z0-9_.-]+$/),
  repo: z.string().regex(/^[A-Za-z0-9_.-]+$/),
  number: z.number().int().positive(),
  kind: z.enum(['pr', 'issue']),
})
export type GitHubItemRef = z.infer<typeof GitHubItemRefSchema>

export const TimelineEventSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'pr_opened',
    'commit',
    'review_approved',
    'review_changes',
    'review_commented',
    'comment',
    'review_comment',
    'merged',
    'closed',
    // Issue stories (v0.2)
    'issue_opened',
    'cross_referenced',
  ]),
  // Empty actor = "actor not recorded" (e.g. the closer of an unmerged PR,
  // which the pulls payload does not carry). Render layers must handle ''.
  actor: z.string(),
  timestamp: isoTimestamp,
  title: z.string(),
  detail: z.string().optional(),
  url: githubWebUrl.optional(),
  // Set only on merged (journey) timelines: names the artifact an event came
  // from ("issue #7", "PR #9") so interleaved histories stay attributable.
  origin: z.string().max(60).optional(),
})
export type TimelineEvent = z.infer<typeof TimelineEventSchema>

// A pull request referenced from an issue's timeline. 'merged' is derived
// from the nested pull_request.merged_at when GitHub includes it.
export const LinkedPrSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  url: githubWebUrl,
  state: z.enum(['open', 'closed', 'merged', 'unknown']),
})
export type LinkedPr = z.infer<typeof LinkedPrSchema>

export const IssueStorySchema = z.object({
  ref: GitHubItemRefSchema,
  orgId: z.string().nullable(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
  // GitHub's state_reason ('completed', 'not_planned', …). Free string on
  // purpose: GitHub adds values, and an unknown reason must not reject the
  // whole story at parse time.
  stateReason: z.string().nullable(),
  author: z.string(),
  authorAvatarUrl: githubAssetUrl.optional(),
  createdAt: isoTimestamp,
  closedAt: isoTimestamp.nullable(),
  commentCount: z.number(),
  labels: z.array(z.string().max(100)).max(20),
  linkedPrs: z.array(LinkedPrSchema).max(10),
  url: githubWebUrl,
  truncated: z.boolean(),
  events: z.array(TimelineEventSchema),
})
export type IssueStory = z.infer<typeof IssueStorySchema>

export const PrStorySchema = z.object({
  ref: GitHubItemRefSchema,
  // Multi-tenancy boundary present from day one, single-tenant in 0.1 (SPEC_V0.1 §5.3).
  orgId: z.string().nullable(),
  title: z.string(),
  state: z.enum(['open', 'merged', 'closed']),
  author: z.string(),
  authorAvatarUrl: githubAssetUrl.optional(),
  createdAt: isoTimestamp,
  mergedAt: isoTimestamp.nullable(),
  closedAt: isoTimestamp.nullable(),
  additions: z.number(),
  deletions: z.number(),
  changedFiles: z.number(),
  commitCount: z.number(),
  headSha: z.string().regex(/^[0-9a-fA-F]*$/),
  baseBranch: z.string(),
  headBranch: z.string(),
  url: githubWebUrl,
  // True when any evidence list hit the import page cap — the UI must say so
  // rather than present a truncated timeline as complete (ADR-0001).
  truncated: z.boolean(),
  events: z.array(TimelineEventSchema),
  // Same-repo issue numbers this PR declares it closes ("fixes #N"). Default
  // keeps stories cached before this field existed parseable.
  linkedIssueNumbers: z.array(z.number().int().positive()).max(20).default([]),
})
export type PrStory = z.infer<typeof PrStorySchema>
