import type { IssueStory, PrStory, TimelineEvent } from '@journal/domain'
import type { StoryGraph } from '@journal/visualizations/graph'

// This package is pure and client-safe (no Node APIs): exports run in the
// browser so they include the user's edited maps from local drafts, not just
// the server-side originals.

export { timelineToSvg, toSvg, xmlEscape } from './svg'

export type ExportMaps = {
  problemSolution: StoryGraph
  reviewEvolution?: StoryGraph
}

// Mermaid labels are untrusted (AI- or user-authored): quotes end the label,
// backticks switch parse modes, newlines break the node statement.
export function escapeMermaidLabel(label: string, max = 90): string {
  const flat = label.replace(/\s+/g, ' ').replace(/["`]/g, "'").trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

const MERMAID_CLASS: Record<string, string> = {
  symptom: 'symptom',
  hypothesis: 'hypothesis',
  root_cause: 'rootcause',
  fix: 'fix',
  validation: 'validation',
  outcome: 'outcome',
  feedback: 'feedback',
  interpretation: 'interpretation',
  change: 'change',
  lesson: 'lesson',
}

export function toMermaid(graph: StoryGraph): string {
  const lines = ['flowchart LR']
  for (const node of graph.nodes) {
    const marker = node.uncertain ? '? ' : ''
    lines.push(`    ${node.id}["${marker}${escapeMermaidLabel(node.label)}"]:::${MERMAID_CLASS[node.kind] ?? 'other'}`)
  }
  for (const edge of graph.edges) {
    lines.push(`    ${edge.source} --> ${edge.target}`)
  }
  lines.push('    classDef symptom stroke:#7c8cff')
  lines.push('    classDef hypothesis stroke:#fbbf24')
  lines.push('    classDef rootcause stroke:#f87171')
  lines.push('    classDef fix stroke:#60a5fa')
  lines.push('    classDef validation stroke:#4ade80')
  lines.push('    classDef outcome stroke:#b794f6')
  lines.push('    classDef feedback stroke:#fbbf24')
  lines.push('    classDef interpretation stroke:#94a3b8')
  lines.push('    classDef change stroke:#60a5fa')
  lines.push('    classDef lesson stroke:#b794f6')
  return lines.join('\n')
}

function mdEscape(text: string): string {
  return text.replace(/([\\`*_[\]<>])/g, '\\$1')
}

function nodeList(graph: StoryGraph): string {
  return graph.nodes
    .map((n) => {
      const flags = [
        n.uncertain ? 'uncertain' : null,
        n.confirmed
          ? 'confirmed'
          : n.provenance === 'ai'
            ? 'AI draft'
            : n.provenance === 'agent'
              ? 'reported by the coding agent — unverified'
              : n.provenance === 'skeleton'
                ? 'draft'
                : null,
        // An agent-sourced node is already labelled as a report; calling it
        // "inferred" as well would imply the tool guessed it.
        n.evidence.length === 0 && n.provenance !== 'agent' ? 'inferred — no evidence' : null,
      ]
        .filter(Boolean)
        .join(', ')
      const evidence = n.evidence.map((ev) => `[${mdEscape(ev.label) || 'evidence'}](${ev.url})`).join(', ')
      return `- **${mdEscape(n.label)}** _(${n.kind}${flags ? `; ${flags}` : ''})_${evidence ? ` — ${evidence}` : ''}`
    })
    .join('\n')
}

export function toMarkdown(story: PrStory, maps: ExportMaps, exportedAt: Date = new Date()): string {
  const parts: string[] = []
  const ref = `${story.ref.owner}/${story.ref.repo} #${story.ref.number}`

  parts.push(`# ${mdEscape(story.title)}`)
  parts.push('')
  parts.push(
    `**[${ref}](${story.url})** · ${story.state} · by ${mdEscape(story.author)} · ${story.commitCount} commit${story.commitCount === 1 ? '' : 's'}, ${story.changedFiles} file${story.changedFiles === 1 ? '' : 's'}, +${story.additions}/−${story.deletions}`,
  )
  parts.push('')
  parts.push(`> Exported from Contribution Journal on ${exportedAt.toISOString().slice(0, 10)}.`)
  parts.push('')

  parts.push('## Problem → solution map')
  parts.push('')
  parts.push('```mermaid')
  parts.push(toMermaid(maps.problemSolution))
  parts.push('```')
  parts.push('')
  parts.push(nodeList(maps.problemSolution))
  parts.push('')

  if (maps.reviewEvolution && maps.reviewEvolution.nodes.length > 0) {
    parts.push('## Review evolution')
    parts.push('')
    parts.push('```mermaid')
    parts.push(toMermaid(maps.reviewEvolution))
    parts.push('```')
    parts.push('')
    parts.push(nodeList(maps.reviewEvolution))
    parts.push('')
  }

  parts.push('## Timeline')
  parts.push('')
  for (const e of story.events) {
    const when = e.timestamp.slice(0, 16).replace('T', ' ')
    const line = `- ${when} — **${mdEscape(e.actor || '(unrecorded)')}** ${mdEscape(e.title)}${e.url ? ` ([evidence](${e.url}))` : ''}`
    parts.push(line)
  }
  parts.push('')

  return parts.join('\n')
}

export function toExportJSON(story: PrStory, maps: ExportMaps, exportedAt: Date = new Date()): string {
  return JSON.stringify(
    {
      format: 'contribution-journal/v1',
      exportedAt: exportedAt.toISOString(),
      story,
      maps,
    },
    null,
    2,
  )
}

// ---------- Issue stories ----------

function timelineSection(events: TimelineEvent[]): string[] {
  const parts = ['## Timeline', '']
  for (const e of events) {
    const when = e.timestamp.slice(0, 16).replace('T', ' ')
    const origin = e.origin ? ` _(${mdEscape(e.origin)})_` : ''
    parts.push(
      `- ${when} — **${mdEscape(e.actor || '(unrecorded)')}** ${mdEscape(e.title)}${origin}${e.url ? ` ([evidence](${e.url}))` : ''}`,
    )
  }
  parts.push('')
  return parts
}

function mapSection(heading: string, graph: StoryGraph): string[] {
  return [`## ${heading}`, '', '```mermaid', toMermaid(graph), '```', '', nodeList(graph), '']
}

function issueHeaderLine(story: IssueStory): string {
  const state = `${story.state}${story.stateReason ? ` (${story.stateReason})` : ''}`
  const ref = `${story.ref.owner}/${story.ref.repo} issue #${story.ref.number}`
  return `**[${ref}](${story.url})** · ${state} · by ${mdEscape(story.author)} · ${story.commentCount} comment${story.commentCount === 1 ? '' : 's'}`
}

export function issueToMarkdown(
  story: IssueStory,
  map: StoryGraph,
  exportedAt: Date = new Date(),
): string {
  const parts: string[] = [`# ${mdEscape(story.title)}`, '', issueHeaderLine(story), '']
  if (story.linkedPrs.length > 0) {
    parts.push(
      `Linked pull requests: ${story.linkedPrs.map((pr) => `[#${pr.number}](${pr.url}) (${pr.state})`).join(', ')}`,
      '',
    )
  }
  parts.push(`> Exported from Contribution Journal on ${exportedAt.toISOString().slice(0, 10)}.`, '')
  parts.push(...mapSection('Issue exploration map', map))
  parts.push(...timelineSection(story.events))
  return parts.join('\n')
}

export function issueToExportJSON(
  story: IssueStory,
  map: StoryGraph,
  exportedAt: Date = new Date(),
): string {
  return JSON.stringify(
    {
      format: 'contribution-journal/issue/v1',
      exportedAt: exportedAt.toISOString(),
      story,
      maps: { issueExploration: map },
    },
    null,
    2,
  )
}

// ---------- Journeys (issue + linked PRs as one story) ----------

export function journeyToMarkdown(
  issue: IssueStory,
  prs: PrStory[],
  map: StoryGraph,
  events: TimelineEvent[],
  exportedAt: Date = new Date(),
): string {
  const parts: string[] = [`# ${mdEscape(issue.title)} — the full journey`, '', issueHeaderLine(issue), '']
  for (const pr of prs) {
    parts.push(
      `With **[pull request #${pr.ref.number}](${pr.url})** · ${pr.state} · ${pr.commitCount} commit${pr.commitCount === 1 ? '' : 's'}, +${pr.additions}/−${pr.deletions}`,
    )
  }
  if (prs.length > 0) parts.push('')
  parts.push(`> Exported from Contribution Journal on ${exportedAt.toISOString().slice(0, 10)}.`, '')
  parts.push(...mapSection('Journey map', map))
  parts.push(...timelineSection(events))
  return parts.join('\n')
}

export function journeyToExportJSON(
  issue: IssueStory,
  prs: PrStory[],
  map: StoryGraph,
  events: TimelineEvent[],
  exportedAt: Date = new Date(),
): string {
  return JSON.stringify(
    {
      format: 'contribution-journal/journey/v1',
      exportedAt: exportedAt.toISOString(),
      issue,
      pullRequests: prs,
      mergedTimeline: events,
      maps: { journey: map },
    },
    null,
    2,
  )
}
