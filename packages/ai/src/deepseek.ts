import type { IssueStory, PrStory } from '@journal/domain'
import type { StoryGraph } from '@journal/visualizations/graph'
import {
  DraftSchema,
  FAILURE_TTL_MS,
  MAP_INSTRUCTIONS,
  SYSTEM,
  buildAgentNotesBlock,
  buildEvidenceDigest,
  buildIssueEvidenceDigest,
  buildJourneyEvidenceDigest,
  draftBudgetMs,
  postProcessDraft,
  readCachedDraft,
  writeCachedDraft,
  type StoryLike,
} from './anthropic'
import { feedbackEvents, type AgentNote, type LearningAssistant } from './index'

// Alternative hosted drafting via DeepSeek's chat-completions API — the
// "bring your own model" half of ADR-0003's adapter contract. Everything
// that carries the product's honesty guarantees is SHARED with the Anthropic
// adapter: the same system prompt and security boundary, the same evidence
// digests, and the same postProcessDraft gate (evidence resolved only against
// real story events, so fabricated links remain structurally impossible).
// Only the transport differs: DeepSeek has no server-enforced structured
// output, so the draft arrives as JSON-mode text and is zod-validated here;
// anything malformed falls back to the deterministic adapter.

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
// The `deepseek-chat` alias was deprecated 2026-07 — pin the real model id.
const DEFAULT_MODEL = 'deepseek-v4-flash'

// JSON mode guarantees a JSON object, not our shape — the prompt must spell
// the shape out, and DraftSchema/postProcessDraft enforce it afterwards.
const JSON_SHAPE_INSTRUCTIONS = `

Respond with a single json object in exactly this shape (no prose, no markdown fences):
{"nodes":[{"id":"short-kebab-case","kind":"symptom","label":"...","uncertain":false,"evidence_event_ids":["event-id"]}],"edges":[{"source":"node-id","target":"node-id"}]}`

function stripFences(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return fenced ? fenced[1] : trimmed
}

export class DeepSeekAssistant implements LearningAssistant {
  private model: string
  private baseUrl: string

  constructor(private fallback: LearningAssistant) {
    this.model = process.env.JOURNAL_DEEPSEEK_MODEL || DEFAULT_MODEL
    this.baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')
  }

  private async draftCore(
    kind: StoryGraph['kind'],
    story: StoryLike,
    digest: string,
    notes: AgentNote[],
    fallback: () => Promise<StoryGraph>,
  ): Promise<StoryGraph> {
    const notesBlock = buildAgentNotesBlock(notes)
    // The provider+model ride in the cache key so switching providers
    // redrafts instead of serving the other model's cached map.
    const cacheKey = `${digest}${notesBlock}\n[provider:deepseek/${this.model}]`
    const cached = readCachedDraft(story, kind, cacheKey)
    if (cached) return cached
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: SYSTEM + JSON_SHAPE_INSTRUCTIONS },
            {
              role: 'user',
              content: `${MAP_INSTRUCTIONS[kind]}\n\n<evidence>\n${digest}\n</evidence>${notesBlock}`,
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 8192,
          stream: false,
        }),
        signal: AbortSignal.timeout(draftBudgetMs() || 120_000),
      })
      if (!response.ok) {
        throw new Error(`DeepSeek HTTP ${response.status}`)
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
      }
      const choice = payload.choices?.[0]
      if (!choice?.message?.content) {
        throw new Error('DeepSeek returned no content')
      }
      if (choice.finish_reason === 'length') {
        throw new Error('DeepSeek draft truncated (finish_reason: length)')
      }
      const draft = DraftSchema.parse(JSON.parse(stripFences(choice.message.content)))
      const graph = postProcessDraft(kind, draft, story, notes)
      if (graph.nodes.length === 0) {
        throw new Error('model returned an empty draft')
      }
      writeCachedDraft(story, kind, cacheKey, graph)
      return graph
    } catch (err) {
      console.error(
        `[ai] deepseek ${kind} draft failed for ${story.ref.owner}/${story.ref.repo}#${story.ref.number}:`,
        err instanceof Error ? err.message : err,
      )
      const fallbackGraph = await fallback()
      writeCachedDraft(story, kind, cacheKey, fallbackGraph, FAILURE_TTL_MS)
      return fallbackGraph
    }
  }

  draftProblemSolutionMap(story: PrStory, notes: AgentNote[] = []): Promise<StoryGraph> {
    return this.draftCore('problem_solution', story, buildEvidenceDigest(story), notes, () =>
      this.fallback.draftProblemSolutionMap(story, notes),
    )
  }

  draftReviewEvolutionMap(story: PrStory, notes: AgentNote[] = []): Promise<StoryGraph> {
    if (feedbackEvents(story).length === 0) {
      return this.fallback.draftReviewEvolutionMap(story, notes)
    }
    return this.draftCore('review_evolution', story, buildEvidenceDigest(story), notes, () =>
      this.fallback.draftReviewEvolutionMap(story, notes),
    )
  }

  draftIssueExplorationMap(story: IssueStory, notes: AgentNote[] = []): Promise<StoryGraph> {
    return this.draftCore('issue_exploration', story, buildIssueEvidenceDigest(story), notes, () =>
      this.fallback.draftIssueExplorationMap(story, notes),
    )
  }

  draftJourneyMap(issue: IssueStory, prs: PrStory[], notes: AgentNote[] = []): Promise<StoryGraph> {
    const combined = { ref: issue.ref, events: [...issue.events, ...prs.flatMap((p) => p.events)] }
    return this.draftCore('journey', combined, buildJourneyEvidenceDigest(issue, prs), notes, () =>
      this.fallback.draftJourneyMap(issue, prs, notes),
    )
  }
}
