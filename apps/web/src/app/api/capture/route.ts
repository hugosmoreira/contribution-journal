import { NextResponse } from 'next/server'
import { z } from 'zod'
import { GitHubImportError, importPr, parseGitHubUrl } from '@journal/github'
import { getAssistant, normalizeAgentNotes, writeAgentNotes } from '@journal/ai'
import { layoutGraph } from '@journal/visualizations'
import type { PrStory } from '@journal/domain'
import { agentQuotaKey, apiTokenConfigured, authorizeRequest } from '../../../lib/api-token'
import { trackEvent } from '../../../lib/metrics'

export const dynamic = 'force-dynamic'
// Drafting two maps on a large PR can run past the default budget.
export const maxDuration = 300

/**
 * Agent capture (roadmap v0.3): a coding agent that just finished a pull
 * request calls this, and the story exists by the time its author opens the
 * app — no URL pasting, which is the one thing the founder refused to do.
 *
 * It deliberately does NOT publish. Publishing is an explicit human action
 * (SPEC_V0.1 §3.7); an agent should never make someone's work public on
 * their behalf. Capture prepares the story; a person decides if it ships.
 */
const BodySchema = z.object({
  url: z.string().max(500).optional(),
  owner: z.string().max(120).optional(),
  repo: z.string().max(120).optional(),
  number: z.union([z.number().int().positive(), z.string().max(20)]).optional(),
  // What the agent knows and GitHub cannot show. Stored nowhere: it is used
  // for this drafting pass and lives on only inside the resulting map.
  notes: z.union([z.string(), z.array(z.string())]).optional(),
})

function refFromBody(body: z.infer<typeof BodySchema>) {
  const url =
    body.url ??
    (body.owner && body.repo && body.number !== undefined
      ? `https://github.com/${body.owner}/${body.repo}/pull/${body.number}`
      : '')
  return parseGitHubUrl(url)
}

function summarize(story: PrStory, psNodes: number, reviewNodes: number, agentNodes: number): string {
  const parts = [
    `${story.ref.owner}/${story.ref.repo}#${story.ref.number} "${story.title}" (${story.state})`,
    `${story.events.length} timeline events`,
    `problem→solution map: ${psNodes} nodes`,
    reviewNodes > 0 ? `review evolution map: ${reviewNodes} nodes` : 'no review evolution map (no maintainer feedback found)',
  ]
  if (agentNodes > 0) {
    parts.push(`${agentNodes} node(s) come from your notes and are labelled AGENT — nothing public backs them`)
  }
  return parts.join('; ')
}

export async function POST(request: Request) {
  if (!apiTokenConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Agent capture is not enabled on this server. Set JOURNAL_API_TOKEN in apps/web/.env.local (24+ characters) and restart.',
      },
      { status: 503 },
    )
  }
  if (!authorizeRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  }

  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await request.json())
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Expected a JSON body with either "url", or "owner", "repo" and "number".' },
      { status: 400 },
    )
  }

  const parsed = refFromBody(body)
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.reason, code: parsed.code }, { status: 400 })
  }
  if (parsed.ref.kind !== 'pr') {
    return NextResponse.json(
      { ok: false, error: 'Only pull requests are supported for now.', code: 'issue_unsupported' },
      { status: 400 },
    )
  }

  let story: PrStory
  try {
    story = await importPr(parsed.ref)
  } catch (err) {
    const message =
      err instanceof GitHubImportError ? err.message : 'Something went wrong while importing from GitHub.'
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }

  // Drafting here is the point: it warms the same disk cache the story page
  // reads, so when the author opens the link the maps are already there.
  // The notes must be persisted first — the page redraws from them later,
  // and a draft keyed on different context would both lose the agent's
  // account and pay for a second model call.
  const notes = normalizeAgentNotes(body.notes)
  writeAgentNotes(parsed.ref, notes)
  const assistant = getAssistant()
  const [ps, review] = await Promise.all([
    assistant.draftProblemSolutionMap(story, notes).then(layoutGraph),
    assistant.draftReviewEvolutionMap(story, notes).then(layoutGraph),
  ])

  void trackEvent('import', `${story.ref.owner}/${story.ref.repo}#${story.ref.number}`, agentQuotaKey())

  const origin = process.env.JOURNAL_BASE_URL ?? new URL(request.url).origin
  const agentNodes = ps.nodes.filter((n) => n.provenance === 'agent').length
  return NextResponse.json({
    ok: true,
    storyUrl: new URL(
      `/story/${story.ref.owner}/${story.ref.repo}/${story.ref.number}`,
      origin,
    ).toString(),
    title: story.title,
    state: story.state,
    author: story.author,
    events: story.events.length,
    maps: {
      problemSolution: ps.nodes.length,
      reviewEvolution: review.nodes.length,
      fromAgentNotes: agentNodes,
    },
    published: false,
    summary: summarize(story, ps.nodes.length, review.nodes.length, agentNodes),
  })
}
