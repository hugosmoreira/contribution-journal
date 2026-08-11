import type { IssueStory, PrStory, TimelineEvent } from '@journal/domain'
import { StoryGraphSchema, type StoryGraph, type GraphNode } from '@journal/visualizations/graph'
import { AnthropicAssistant } from './anthropic'
import { DeepSeekAssistant } from './deepseek'

// The adapter boundary from the parent spec §14.4. Hosted AI drafting is on
// by default in the product (ADR-0003), but the null adapter below must
// always exist and stay exercised in CI so "works without AI" remains true.
/**
 * Context reported by the coding agent that did the work (SPEC v0.3 agent
 * capture). This is the material GitHub structurally cannot hold: the
 * approach that was abandoned, the test that failed first, why one design
 * won. It is NOT evidence — nothing public backs it — so nodes derived from
 * it carry provenance 'agent' and never receive an evidence link.
 */
export type AgentNote = { id: string; text: string }

/** Caps: the notes ride in a model prompt and in the draft cache key. */
export const MAX_AGENT_NOTES = 20
export const MAX_AGENT_NOTE_CHARS = 1500

export function normalizeAgentNotes(input: unknown): AgentNote[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? [input] : []
  return raw
    .filter((n): n is string => typeof n === 'string')
    .map((n) => n.replace(/\s+/g, ' ').trim())
    .filter((n) => n.length > 0)
    .slice(0, MAX_AGENT_NOTES)
    .map((text, i) => ({ id: `agent-note-${i + 1}`, text: text.slice(0, MAX_AGENT_NOTE_CHARS) }))
}

export interface LearningAssistant {
  draftProblemSolutionMap(story: PrStory, notes?: AgentNote[]): Promise<StoryGraph>
  draftReviewEvolutionMap(story: PrStory, notes?: AgentNote[]): Promise<StoryGraph>
  draftIssueExplorationMap(story: IssueStory, notes?: AgentNote[]): Promise<StoryGraph>
  draftJourneyMap(issue: IssueStory, prs: PrStory[], notes?: AgentNote[]): Promise<StoryGraph>
}

// GitHub App accounts carry the "[bot]" suffix. Project-specific bots on
// plain accounts (sizebot, bors) are deliberately NOT filtered here: missing
// the review map entirely is far worse than drafting one node about a bot,
// and the drafting prompt is already told to skip bot noise.
function isBot(actor: string): boolean {
  return /\[bot\]$/i.test(actor)
}

/**
 * Maintainer feedback, wherever it lives. Formal reviews are only part of it:
 * on many projects (rust-lang, CPython) substantive review happens in plain
 * PR comments, and gating the review-evolution map on review events alone
 * silently dropped the map on exactly those repositories.
 */
export function feedbackEvents(story: PrStory): TimelineEvent[] {
  const author = story.author.toLowerCase()
  return story.events.filter((e) => {
    if (e.kind === 'review_changes') return true
    if (e.kind === 'review_commented' || e.kind === 'review_comment') return Boolean(e.detail)
    // A comment from someone other than the author is feedback; the author's
    // own comments are narration, not review.
    if (e.kind === 'comment') {
      return Boolean(e.detail) && e.actor.toLowerCase() !== author && !isBot(e.actor)
    }
    return false
  })
}

function evidenceFor(events: TimelineEvent[], max = 3): { label: string; url: string }[] {
  return events
    .filter((e) => e.url)
    .slice(0, max)
    .map((e) => ({ label: e.title.slice(0, 60), url: e.url as string }))
}

function skeletonNode(
  id: string,
  kind: GraphNode['kind'],
  label: string,
  opts: { uncertain?: boolean; evidence?: { label: string; url: string }[] } = {},
): GraphNode {
  return {
    id,
    kind,
    label,
    provenance: 'skeleton',
    confirmed: false,
    uncertain: opts.uncertain ?? false,
    evidence: opts.evidence ?? [],
    position: undefined,
  }
}

/**
 * Deterministic skeleton drafts assembled from evidence alone — no model
 * calls. Labels that are guesses carry provenance 'skeleton' and stay
 * visually unconfirmed until the user edits or confirms them.
 */
export class NullAssistant implements LearningAssistant {
  async draftProblemSolutionMap(story: PrStory, notes: AgentNote[] = []): Promise<StoryGraph> {
    const byKind = (kind: TimelineEvent['kind']) => story.events.filter((e) => e.kind === kind)
    const opened = byKind('pr_opened')
    const commits = byKind('commit')
    const changesRequested = byKind('review_changes')
    const approvals = byKind('review_approved')

    const nodes: GraphNode[] = [
      skeletonNode('symptom', 'symptom', story.title, { evidence: evidenceFor(opened, 1) }),
      skeletonNode(
        'hypothesis',
        'hypothesis',
        changesRequested.length > 0
          ? 'First approach — revised after review feedback'
          : 'What approaches did you consider?',
        { uncertain: true, evidence: evidenceFor(changesRequested, 2) },
      ),
      skeletonNode('root_cause', 'root_cause', 'What was the underlying cause?', { uncertain: true }),
      skeletonNode(
        'fix',
        'fix',
        commits.length > 0
          ? `${commits.length === 1 ? 'The change' : `${commits.length} commits`}: ${commits[0].title}`
          : 'What changed?',
        { evidence: evidenceFor(commits, 3) },
      ),
      skeletonNode(
        'validation',
        'validation',
        approvals.length > 0
          ? `Approved by ${approvals.length} reviewer${approvals.length === 1 ? '' : 's'}`
          : 'How was it validated?',
        { uncertain: approvals.length === 0, evidence: evidenceFor(approvals, 3) },
      ),
      skeletonNode(
        'outcome',
        'outcome',
        story.state === 'merged' ? 'Merged' : story.state === 'closed' ? 'Closed without merging' : 'Still open',
        { evidence: evidenceFor(byKind('merged').concat(byKind('closed')), 1) },
      ),
    ]

    const edges = [
      { id: 'e-symptom-hypothesis', source: 'symptom', target: 'hypothesis' },
      { id: 'e-hypothesis-root', source: 'hypothesis', target: 'root_cause' },
      { id: 'e-root-fix', source: 'root_cause', target: 'fix' },
      { id: 'e-fix-validation', source: 'fix', target: 'validation' },
      { id: 'e-validation-outcome', source: 'validation', target: 'outcome' },
    ]

    // Without a model, agent notes still reach the map — verbatim, as their
    // own nodes hanging off the problem, so the account the agent gave is
    // never silently dropped just because AI drafting is off (ADR-0003).
    notes.forEach((note, i) => {
      nodes.push({
        id: `agent-${i + 1}`,
        kind: 'hypothesis',
        label: note.text.slice(0, 500),
        provenance: 'agent',
        confirmed: false,
        uncertain: false,
        evidence: [],
        position: undefined,
      })
      edges.push({ id: `e-symptom-agent-${i + 1}`, source: 'symptom', target: `agent-${i + 1}` })
    })

    return StoryGraphSchema.parse({ kind: 'problem_solution', nodes, edges })
  }

  async draftIssueExplorationMap(story: IssueStory, notes: AgentNote[] = []): Promise<StoryGraph> {
    const opened = story.events.filter((e) => e.kind === 'issue_opened')
    // Replies from people other than the reporter are the discussion; the
    // reporter's own follow-ups are narration.
    const author = story.author.toLowerCase()
    const discussion = story.events.filter(
      (e) =>
        e.kind === 'comment' && Boolean(e.detail) && e.actor.toLowerCase() !== author && !isBot(e.actor),
    )
    const xrefs = story.events.filter((e) => e.kind === 'cross_referenced')
    const closed = story.events.filter((e) => e.kind === 'closed')
    const linked = story.linkedPrs[0]

    const nodes: GraphNode[] = [
      skeletonNode('symptom', 'symptom', story.title, { evidence: evidenceFor(opened, 1) }),
      skeletonNode(
        'hypothesis',
        'hypothesis',
        discussion.length > 0
          ? `${discussion.length} ${discussion.length === 1 ? 'reply' : 'replies'} in discussion — what approaches were proposed?`
          : 'What approaches did the discussion propose?',
        { uncertain: true, evidence: evidenceFor(discussion, 3) },
      ),
      skeletonNode(
        'fix',
        'fix',
        linked ? `Linked pull request #${linked.number}: ${linked.title}` : 'What change addresses this issue?',
        { uncertain: !linked, evidence: evidenceFor(xrefs, 3) },
      ),
      skeletonNode(
        'outcome',
        'outcome',
        story.state === 'open'
          ? 'Still open'
          : story.stateReason === 'not_planned'
            ? 'Closed as not planned'
            : story.stateReason === 'completed'
              ? 'Closed as completed'
              : 'Closed',
        { evidence: evidenceFor(closed, 1) },
      ),
    ]

    const edges = [
      { id: 'e-symptom-hypothesis', source: 'symptom', target: 'hypothesis' },
      { id: 'e-hypothesis-fix', source: 'hypothesis', target: 'fix' },
      { id: 'e-fix-outcome', source: 'fix', target: 'outcome' },
    ]

    notes.forEach((note, i) => {
      nodes.push({
        id: `agent-${i + 1}`,
        kind: 'hypothesis',
        label: note.text.slice(0, 500),
        provenance: 'agent',
        confirmed: false,
        uncertain: false,
        evidence: [],
        position: undefined,
      })
      edges.push({ id: `e-symptom-agent-${i + 1}`, source: 'symptom', target: `agent-${i + 1}` })
    })

    return StoryGraphSchema.parse({ kind: 'issue_exploration', nodes, edges })
  }

  async draftJourneyMap(issue: IssueStory, prs: PrStory[], notes: AgentNote[] = []): Promise<StoryGraph> {
    const author = issue.author.toLowerCase()
    const opened = issue.events.filter((e) => e.kind === 'issue_opened')
    const discussion = issue.events.filter(
      (e) =>
        e.kind === 'comment' && Boolean(e.detail) && e.actor.toLowerCase() !== author && !isBot(e.actor),
    )
    const closed = issue.events.filter((e) => e.kind === 'closed')

    const nodes: GraphNode[] = [
      skeletonNode('symptom', 'symptom', issue.title, { evidence: evidenceFor(opened, 1) }),
      skeletonNode(
        'discussion',
        'hypothesis',
        discussion.length > 0
          ? `${discussion.length} ${discussion.length === 1 ? 'reply' : 'replies'} in discussion — what approaches were weighed?`
          : 'What approaches did the discussion propose?',
        { uncertain: true, evidence: evidenceFor(discussion, 3) },
      ),
    ]
    const edges = [{ id: 'e-symptom-discussion', source: 'symptom', target: 'discussion' }]

    let prev = 'discussion'
    prs.slice(0, 2).forEach((pr, i) => {
      const id = `fix-${i}`
      const prOpened = pr.events.filter((e) => e.kind === 'pr_opened')
      const changesRequested = pr.events.filter((e) => e.kind === 'review_changes')
      nodes.push(
        skeletonNode(id, 'fix', `PR #${pr.ref.number}: ${pr.title}`, {
          evidence: evidenceFor(prOpened, 1),
        }),
      )
      edges.push({ id: `e-${prev}-${id}`, source: prev, target: id })
      prev = id
      if (changesRequested.length > 0) {
        const fb = `feedback-${i}`
        nodes.push(
          skeletonNode(fb, 'feedback', 'Review requested changes — what did it change?', {
            uncertain: true,
            evidence: evidenceFor(changesRequested, 2),
          }),
        )
        edges.push({ id: `e-${id}-${fb}`, source: id, target: fb })
        prev = fb
      }
      const landed = pr.events.filter((e) => e.kind === 'merged' || e.kind === 'review_approved')
      if (landed.length > 0) {
        const va = `validation-${i}`
        nodes.push(
          skeletonNode(va, 'validation', `Landed: ${landed[landed.length - 1].title}`, {
            evidence: evidenceFor(landed, 2),
          }),
        )
        edges.push({ id: `e-${prev}-${va}`, source: prev, target: va })
        prev = va
      }
    })

    nodes.push(
      skeletonNode(
        'outcome',
        'outcome',
        issue.state === 'open'
          ? 'Issue still open'
          : issue.stateReason === 'not_planned'
            ? 'Issue closed as not planned'
            : 'Issue closed as completed',
        { evidence: evidenceFor(closed, 1) },
      ),
      skeletonNode('lesson', 'lesson', 'What will you carry forward from this journey?', {
        uncertain: true,
      }),
    )
    edges.push(
      { id: `e-${prev}-outcome`, source: prev, target: 'outcome' },
      { id: 'e-outcome-lesson', source: 'outcome', target: 'lesson' },
    )

    notes.forEach((note, i) => {
      nodes.push({
        id: `agent-${i + 1}`,
        kind: 'hypothesis',
        label: note.text.slice(0, 500),
        provenance: 'agent',
        confirmed: false,
        uncertain: false,
        evidence: [],
        position: undefined,
      })
      edges.push({ id: `e-symptom-agent-${i + 1}`, source: 'symptom', target: `agent-${i + 1}` })
    })

    return StoryGraphSchema.parse({ kind: 'journey', nodes, edges })
  }

  async draftReviewEvolutionMap(story: PrStory): Promise<StoryGraph> {
    // Windows are computed against the FULL feedback list so a chain never
    // swallows commits that actually responded to later (unshown) feedback.
    const allFeedback = feedbackEvents(story)
    const feedback = allFeedback.slice(0, 3)

    if (feedback.length === 0) {
      return StoryGraphSchema.parse({ kind: 'review_evolution', nodes: [], edges: [] })
    }

    const commits = story.events.filter((e) => e.kind === 'commit')
    const approvals = story.events.filter((e) => e.kind === 'review_approved' || e.kind === 'merged')
    const nodes: GraphNode[] = []
    const edges: { id: string; source: string; target: string }[] = []

    feedback.forEach((f, i) => {
      const next = allFeedback[i + 1]
      const commitsAfter = commits.filter(
        (c) => c.timestamp > f.timestamp && (!next || c.timestamp <= next.timestamp),
      )
      const evidenceAfter = approvals.filter((a) => a.timestamp > f.timestamp)
      const fb = skeletonNode(`feedback-${i}`, 'feedback', f.detail?.slice(0, 140) ?? 'Reviewer feedback', {
        evidence: evidenceFor([f], 1),
      })
      const interp = skeletonNode(
        `interpretation-${i}`,
        'interpretation',
        'How did you read this feedback?',
        { uncertain: true },
      )
      const change = skeletonNode(
        `change-${i}`,
        'change',
        commitsAfter.length > 0
          ? `${commitsAfter.length} commit${commitsAfter.length === 1 ? '' : 's'} in response: ${commitsAfter[0].title}`
          : 'What changed in response?',
        { uncertain: commitsAfter.length === 0, evidence: evidenceFor(commitsAfter, 3) },
      )
      // SPEC_V0.1 §3.3c: evidence AFTER the change that it landed.
      const validation = skeletonNode(
        `validation-${i}`,
        'validation',
        evidenceAfter.length > 0 ? `Landed: ${evidenceAfter[0].title}` : 'Did the reviewer accept it?',
        { uncertain: evidenceAfter.length === 0, evidence: evidenceFor(evidenceAfter, 2) },
      )
      const lesson = skeletonNode(`lesson-${i}`, 'lesson', 'What will you carry forward from this?', {
        uncertain: true,
      })
      nodes.push(fb, interp, change, validation, lesson)
      edges.push(
        { id: `e-fb-${i}`, source: fb.id, target: interp.id },
        { id: `e-in-${i}`, source: interp.id, target: change.id },
        { id: `e-ch-${i}`, source: change.id, target: validation.id },
        { id: `e-va-${i}`, source: validation.id, target: lesson.id },
      )
    })

    return StoryGraphSchema.parse({ kind: 'review_evolution', nodes, edges })
  }
}

/**
 * Hosted drafting activates only on an explicit API key in the app's
 * environment — never on ambient developer credentials — so running the app
 * can't silently spend API tokens. Without a key, every draft comes from the
 * null adapter.
 *
 * Provider selection: JOURNAL_AI_PROVIDER ('anthropic' | 'deepseek') picks
 * explicitly; unset, the provider with a configured key wins, Anthropic
 * first. Every hosted adapter falls back to the deterministic one.
 */
export function getAssistant(): LearningAssistant {
  // JOURNAL_DISABLE_AI pins the null adapter even when a key is present —
  // the e2e suite depends on deterministic skeleton drafts (ADR-0003 keeps
  // the no-AI path exercised), and it spares API spend in test runs.
  if (process.env.JOURNAL_DISABLE_AI) return new NullAssistant()

  const provider =
    process.env.JOURNAL_AI_PROVIDER?.toLowerCase() ||
    (process.env.ANTHROPIC_API_KEY ? 'anthropic' : process.env.DEEPSEEK_API_KEY ? 'deepseek' : 'none')

  if (provider === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
    return new DeepSeekAssistant(new NullAssistant())
  }
  if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    return new AnthropicAssistant(new NullAssistant())
  }
  return new NullAssistant()
}

export { AnthropicAssistant, draftBudgetMs } from './anthropic'
export { DeepSeekAssistant } from './deepseek'
export { readAgentNotes, writeAgentNotes } from './notes'
