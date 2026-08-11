import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import type { PrStory } from '@journal/domain'
import { DeepSeekAssistant } from '../src/deepseek'
import { DeepSeekAssistant as ExportedDeepSeek, NullAssistant, getAssistant } from '../src/index'
import { AnthropicAssistant } from '../src/anthropic'

// Own cache dir: the anthropic adapter test wipes `.cache` in parallel, and
// two files rm-ing the same tree races on Windows (EPERM/ENOTEMPTY).
// vi.hoisted runs before the source modules load and freeze their cache path.
const CACHE_DIR = vi.hoisted(() => {
  const dir = `.cache-test-deepseek-${process.pid}`
  process.env.JOURNAL_CACHE_DIR = dir
  return dir
})

const STORY: PrStory = {
  ref: { owner: 'o', repo: 'r', number: 9, kind: 'pr' },
  orgId: null,
  title: 'Fix the retry race',
  state: 'merged',
  author: 'hugo',
  createdAt: '2026-07-01T10:00:00Z',
  mergedAt: '2026-07-02T10:00:00Z',
  closedAt: '2026-07-02T10:00:00Z',
  additions: 5,
  deletions: 1,
  changedFiles: 1,
  commitCount: 1,
  headSha: 'a'.repeat(40),
  baseBranch: 'main',
  headBranch: 'fix',
  url: 'https://github.com/o/r/pull/9',
  truncated: false,
  linkedIssueNumbers: [],
  events: [
    {
      id: 'pr-opened-9',
      kind: 'pr_opened',
      actor: 'hugo',
      timestamp: '2026-07-01T10:00:00Z',
      title: 'opened this pull request',
      detail: 'Retries were racing.',
      url: 'https://github.com/o/r/pull/9',
    },
    {
      id: 'merged-9',
      kind: 'merged',
      actor: 'reviewer',
      timestamp: '2026-07-02T10:00:00Z',
      title: 'merged this pull request',
      url: 'https://github.com/o/r/pull/9',
    },
  ],
}

const VALID_DRAFT = JSON.stringify({
  nodes: [
    {
      id: 'symptom',
      kind: 'symptom',
      label: 'Retries raced the scheduler',
      uncertain: false,
      evidence_event_ids: ['pr-opened-9'],
    },
    {
      id: 'fix',
      kind: 'fix',
      label: 'Guard the retry window',
      uncertain: false,
      // One real id and one fabricated id — the fake must drop out.
      evidence_event_ids: ['merged-9', 'https://evil.example/attack'],
    },
  ],
  edges: [{ source: 'symptom', target: 'fix' }],
})

function mockDeepSeek(content: string, status = 200, finishReason = 'stop') {
  const fetchMock = vi.fn(async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content }, finish_reason: finishReason }] }),
      { status, headers: { 'content-type': 'application/json' } },
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  rmSync(CACHE_DIR, { recursive: true, force: true })
  vi.stubEnv('DEEPSEEK_API_KEY', 'test-key')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  try {
    rmSync(CACHE_DIR, { recursive: true, force: true })
  } catch {
    // Windows can transiently EPERM on rmdir; the next beforeEach retries.
  }
})

describe('DeepSeekAssistant', () => {
  it('drafts a map from a valid JSON-mode response, resolving only real evidence', async () => {
    const fetchMock = mockDeepSeek(VALID_DRAFT)
    const graph = await new DeepSeekAssistant(new NullAssistant()).draftProblemSolutionMap(STORY)

    expect(graph.kind).toBe('problem_solution')
    expect(graph.nodes.every((n) => n.provenance === 'ai')).toBe(true)
    const fix = graph.nodes.find((n) => n.id === 'fix')
    // The fabricated evidence id resolved to nothing; only the real event links.
    expect(fix?.evidence).toEqual([
      { label: 'merged this pull request', url: 'https://github.com/o/r/pull/9' },
    ])

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(request.response_format).toEqual({ type: 'json_object' })
    expect(request.model).toBe('deepseek-v4-flash')
  })

  it('parses drafts wrapped in markdown fences', async () => {
    mockDeepSeek('```json\n' + VALID_DRAFT + '\n```')
    const graph = await new DeepSeekAssistant(new NullAssistant()).draftProblemSolutionMap(STORY)
    expect(graph.nodes.some((n) => n.provenance === 'ai')).toBe(true)
  })

  it('falls back to the deterministic adapter on malformed JSON', async () => {
    mockDeepSeek('this is not json at all')
    const graph = await new DeepSeekAssistant(new NullAssistant()).draftProblemSolutionMap(STORY)
    expect(graph.nodes.length).toBeGreaterThan(0)
    expect(graph.nodes.every((n) => n.provenance === 'skeleton')).toBe(true)
  })

  it('falls back on an HTTP error', async () => {
    mockDeepSeek('irrelevant', 500)
    const graph = await new DeepSeekAssistant(new NullAssistant()).draftProblemSolutionMap(STORY)
    expect(graph.nodes.every((n) => n.provenance === 'skeleton')).toBe(true)
  })

  it('falls back on a truncated draft', async () => {
    mockDeepSeek(VALID_DRAFT, 200, 'length')
    const graph = await new DeepSeekAssistant(new NullAssistant()).draftProblemSolutionMap(STORY)
    expect(graph.nodes.every((n) => n.provenance === 'skeleton')).toBe(true)
  })

  it('aborts a slow draft at the serverless budget and serves the skeleton', async () => {
    vi.stubEnv('JOURNAL_DRAFT_BUDGET_MS', '50')
    // A fetch that never resolves until the abort signal fires.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('This operation was aborted.', 'AbortError')),
            )
          }),
      ),
    )
    const started = Date.now()
    const graph = await new DeepSeekAssistant(new NullAssistant()).draftProblemSolutionMap(STORY)
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(graph.nodes.every((n) => n.provenance === 'skeleton')).toBe(true)
  })
})

describe('getAssistant provider selection', () => {
  // Selection must be judged on the vars each test sets — an ambient
  // JOURNAL_DISABLE_AI or provider override from the caller's shell (CI once
  // set it workflow-wide) turns every branch into the null adapter.
  beforeEach(() => {
    vi.stubEnv('JOURNAL_DISABLE_AI', '')
    vi.stubEnv('JOURNAL_AI_PROVIDER', '')
  })

  it('prefers anthropic when both keys are set and no provider is chosen', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
    expect(getAssistant()).toBeInstanceOf(AnthropicAssistant)
  })

  it('uses deepseek when JOURNAL_AI_PROVIDER selects it', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
    vi.stubEnv('JOURNAL_AI_PROVIDER', 'deepseek')
    expect(getAssistant()).toBeInstanceOf(ExportedDeepSeek)
  })

  it('uses deepseek when it holds the only key', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    expect(getAssistant()).toBeInstanceOf(ExportedDeepSeek)
  })

  it('stays deterministic under JOURNAL_DISABLE_AI', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
    vi.stubEnv('JOURNAL_DISABLE_AI', '1')
    expect(getAssistant()).toBeInstanceOf(NullAssistant)
  })

  it('falls to the null adapter when the chosen provider has no key', () => {
    vi.stubEnv('DEEPSEEK_API_KEY', '')
    vi.stubEnv('JOURNAL_AI_PROVIDER', 'deepseek')
    expect(getAssistant()).toBeInstanceOf(NullAssistant)
  })
})
