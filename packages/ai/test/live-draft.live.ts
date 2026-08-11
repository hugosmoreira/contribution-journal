/**
 * Live smoke test for the hosted drafting path — the one thing unit tests
 * cannot prove: that the configured ANTHROPIC_API_KEY and model actually
 * return a usable draft.
 *
 * Opt-in only. It spends API tokens, so it is NOT part of `npm test`
 * (the filename ends in .live.ts, which the default vitest include pattern
 * ignores). Run it deliberately:
 *
 *   npm run test:live -w packages/ai
 *
 * The key is read from apps/web/.env.local, the same file the app uses, so
 * this verifies the real configuration rather than a separate one.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { PrStorySchema } from '@journal/domain'
import { AnthropicAssistant, NullAssistant } from '../src/index'

function loadEnvLocal(): void {
  if (process.env.ANTHROPIC_API_KEY) return
  const envPath = join(process.cwd(), '..', '..', 'apps', 'web', '.env.local')
  try {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
      if (!match) continue
      const [, key, rawValue] = match
      const value = rawValue.trim().replace(/^["']|["']$/g, '')
      if (value && !process.env[key]) process.env[key] = value
    }
  } catch {
    // No .env.local — the test below reports the missing key clearly.
  }
}

const story = PrStorySchema.parse({
  ref: { owner: 'o', repo: 'r', number: 1, kind: 'pr' },
  orgId: null,
  title: 'Fix retry race in scheduler',
  state: 'merged',
  author: 'hugo',
  createdAt: '2026-07-01T10:00:00Z',
  mergedAt: '2026-07-02T10:00:00Z',
  closedAt: '2026-07-02T10:00:00Z',
  additions: 10,
  deletions: 2,
  changedFiles: 3,
  commitCount: 2,
  headSha: 'ab12cd34',
  baseBranch: 'main',
  headBranch: 'fix/retry',
  url: 'https://github.com/o/r/pull/1',
  truncated: false,
  events: [
    {
      id: 'pr-opened-1',
      kind: 'pr_opened',
      actor: 'hugo',
      timestamp: '2026-07-01T10:00:00Z',
      title: 'opened this pull request',
      detail: 'Retries were racing the scheduler tick, so a cancelled job could run twice.',
      url: 'https://github.com/o/r/pull/1',
    },
    {
      id: 'commit-a',
      kind: 'commit',
      actor: 'hugo',
      timestamp: '2026-07-01T11:00:00Z',
      title: 'guard the retry window against concurrent ticks',
      url: 'https://github.com/o/r/commit/a',
    },
    {
      id: 'review-1',
      kind: 'review_changes',
      actor: 'reviewer',
      timestamp: '2026-07-01T15:00:00Z',
      title: 'requested changes',
      detail: 'The guard needs a regression test before this can land.',
      url: 'https://github.com/o/r/pull/1#review-1',
    },
    {
      id: 'commit-b',
      kind: 'commit',
      actor: 'hugo',
      timestamp: '2026-07-01T18:00:00Z',
      title: 'add regression test for the retry window',
      url: 'https://github.com/o/r/commit/b',
    },
    {
      id: 'review-2',
      kind: 'review_approved',
      actor: 'reviewer',
      timestamp: '2026-07-02T09:00:00Z',
      title: 'approved these changes',
      url: 'https://github.com/o/r/pull/1#review-2',
    },
    {
      id: 'merged-1',
      kind: 'merged',
      actor: 'reviewer',
      timestamp: '2026-07-02T10:00:00Z',
      title: 'merged this pull request',
      url: 'https://github.com/o/r/pull/1',
    },
  ],
})

beforeAll(loadEnvLocal)

describe('hosted drafting (live API)', () => {
  it('has a key configured', () => {
    expect(
      process.env.ANTHROPIC_API_KEY,
      'ANTHROPIC_API_KEY is not set in apps/web/.env.local — hosted drafting is off and every map is an evidence-only skeleton.',
    ).toBeTruthy()
  })

  it(
    'returns a real model draft, not the fallback skeleton',
    async () => {
      const assistant = new AnthropicAssistant(new NullAssistant())
      const graph = await assistant.draftProblemSolutionMap(story)

      // The single most important assertion: provenance 'ai' means the model
      // answered. 'skeleton' means the adapter silently fell back — bad key,
      // wrong model id, refusal, or a schema mismatch.
      const provenances = new Set(graph.nodes.map((n) => n.provenance))
      expect(
        provenances.has('ai'),
        `Adapter fell back to the deterministic skeleton (provenances: ${[...provenances].join(', ')}). ` +
          'Check the [ai] draft failed line in the dev-server output for the reason.',
      ).toBe(true)

      expect(graph.nodes.length).toBeGreaterThan(2)

      // Every evidence link must resolve to a real event URL from the story —
      // the model cites ids and the server resolves them, so a fabricated
      // link is structurally impossible. This proves that path end to end.
      const realUrls = new Set(story.events.map((e) => e.url))
      for (const node of graph.nodes) {
        for (const ev of node.evidence) {
          expect(realUrls.has(ev.url), `unexpected evidence url: ${ev.url}`).toBe(true)
        }
      }

      // Visible output so a human running this can judge draft quality.
      console.log('\n  Live draft — problem → solution map:')
      for (const node of graph.nodes) {
        const marks = [node.provenance, node.uncertain ? 'uncertain' : null, `${node.evidence.length} evidence`]
          .filter(Boolean)
          .join(', ')
        console.log(`    [${node.kind}] ${node.label}  (${marks})`)
      }
    },
    { timeout: 180_000 },
  )

  it(
    'drafts the review evolution map from the same evidence',
    async () => {
      const assistant = new AnthropicAssistant(new NullAssistant())
      const graph = await assistant.draftReviewEvolutionMap(story)
      expect(graph.nodes.length).toBeGreaterThan(0)

      console.log('\n  Live draft — review evolution map:')
      for (const node of graph.nodes) {
        console.log(`    [${node.kind}] ${node.label}  (${node.provenance})`)
      }
    },
    { timeout: 180_000 },
  )
})
