import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { PrStorySchema } from '@journal/domain'

const parseMock = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    messages = { parse: parseMock }
  },
}))

import { AnthropicAssistant } from '../src/anthropic'
import { NullAssistant, getAssistant } from '../src/index'

const CACHE_DIR = join(process.cwd(), '.cache')

const story = PrStorySchema.parse({
  ref: { owner: 'o', repo: 'r', number: 9, kind: 'pr' },
  orgId: null,
  title: 'Fix retry race',
  state: 'merged',
  author: 'hugo',
  createdAt: '2026-07-01T10:00:00Z',
  mergedAt: '2026-07-02T10:00:00Z',
  closedAt: '2026-07-02T10:00:00Z',
  additions: 10,
  deletions: 2,
  changedFiles: 3,
  commitCount: 2,
  headSha: 'feedface',
  baseBranch: 'main',
  headBranch: 'fix/retry',
  url: 'https://github.com/o/r/pull/9',
  truncated: false,
  events: [
    {
      id: 'commit-a',
      kind: 'commit',
      actor: 'hugo',
      timestamp: '2026-07-01T11:00:00Z',
      title: 'guard the retry window',
      url: 'https://github.com/o/r/commit/a',
    },
  ],
})

beforeEach(() => {
  parseMock.mockReset()
  rmSync(CACHE_DIR, { recursive: true, force: true })
})
afterEach(() => {
  rmSync(CACHE_DIR, { recursive: true, force: true })
  delete process.env.ANTHROPIC_API_KEY
})

describe('AnthropicAssistant', () => {
  it('post-processes a model draft and serves repeats from the disk cache', async () => {
    parseMock.mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: {
        nodes: [
          { id: 'sym', kind: 'symptom', label: 'Retries raced', uncertain: false, evidence_event_ids: ['commit-a'] },
          { id: 'fix', kind: 'fix', label: 'Guard the window', uncertain: false, evidence_event_ids: ['commit-a'] },
        ],
        edges: [{ source: 'sym', target: 'fix' }],
      },
    })
    const assistant = new AnthropicAssistant(new NullAssistant())

    const graph = await assistant.draftProblemSolutionMap(story)
    expect(graph.nodes).toHaveLength(2)
    expect(graph.nodes[0].provenance).toBe('ai')
    expect(graph.nodes[0].evidence[0].url).toBe('https://github.com/o/r/commit/a')

    const again = await assistant.draftProblemSolutionMap(story)
    expect(again.nodes).toHaveLength(2)
    expect(parseMock).toHaveBeenCalledTimes(1) // second call came from cache
  })

  it('falls back to the null adapter on refusal', async () => {
    parseMock.mockResolvedValue({ stop_reason: 'refusal', parsed_output: null })
    const assistant = new AnthropicAssistant(new NullAssistant())
    const graph = await assistant.draftProblemSolutionMap(story)
    expect(graph.nodes.length).toBeGreaterThan(0)
    expect(graph.nodes.every((n) => n.provenance === 'skeleton')).toBe(true)
  })

  it('falls back to the null adapter on any API error', async () => {
    parseMock.mockRejectedValue(new Error('overloaded'))
    const assistant = new AnthropicAssistant(new NullAssistant())
    const graph = await assistant.draftProblemSolutionMap(story)
    expect(graph.nodes.every((n) => n.provenance === 'skeleton')).toBe(true)
  })
})

describe('getAssistant', () => {
  it('uses the null adapter unless an explicit API key is configured', () => {
    // The verdict must come from the keys this test controls, not the
    // caller's shell (CI once leaked JOURNAL_DISABLE_AI=1 workflow-wide).
    delete process.env.JOURNAL_DISABLE_AI
    delete process.env.JOURNAL_AI_PROVIDER
    delete process.env.DEEPSEEK_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    expect(getAssistant()).toBeInstanceOf(NullAssistant)
    process.env.ANTHROPIC_API_KEY = 'sk-test-not-a-real-key'
    expect(getAssistant()).toBeInstanceOf(AnthropicAssistant)
  })
})
