import type { TimelineEvent } from '@journal/domain'
import { isGitHubWebUrl } from '@journal/domain'
import {
  NODE_WIDTH,
  chainLayout,
  type GraphNode,
  type StoryGraph,
} from '@journal/visualizations/graph'

// SVG export (SPEC_V0.1 §3.8): self-contained files — system font stack, no
// external references — matching the app's dark theme so a shared file looks
// like the page it came from. All text is untrusted (AI- or user-authored)
// and is XML-escaped; link hrefs are dropped unless they pass the same
// github.com gate the schema enforces (DoD 14).

const THEME = {
  bg: '#0b0e14',
  panel: '#11151f',
  border: '#232b3d',
  text: '#e7eaf2',
  muted: '#8b94a8',
  // Matches globals.css: AA-contrast-safe for the 10.5px evidence captions.
  faint: '#808a9c',
  edge: '#46506a',
  accent: '#7c8cff',
}

const FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

// One hue per node kind, identical to the editor's border colors.
const KIND_COLOR: Record<GraphNode['kind'], string> = {
  symptom: '#7c8cff',
  hypothesis: '#fbbf24',
  root_cause: '#f87171',
  fix: '#60a5fa',
  validation: '#4ade80',
  outcome: '#b794f6',
  feedback: '#fbbf24',
  interpretation: '#94a3b8',
  change: '#60a5fa',
  lesson: '#b794f6',
}

const KIND_LABEL: Record<GraphNode['kind'], string> = {
  symptom: 'symptom',
  hypothesis: 'hypothesis',
  root_cause: 'root cause',
  fix: 'fix',
  validation: 'validation',
  outcome: 'outcome',
  feedback: 'feedback',
  interpretation: 'interpretation',
  change: 'change',
  lesson: 'lesson',
}

export function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

/** Greedy word wrap; words longer than the line are hard-split. */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []
  let current = ''
  for (let word of words) {
    while (word.length > maxChars) {
      if (current) {
        lines.push(current)
        current = ''
      }
      lines.push(word.slice(0, maxChars - 1) + '-')
      word = word.slice(maxChars - 1)
    }
    if (!current) current = word
    else if (current.length + 1 + word.length <= maxChars) current += ` ${word}`
    else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, maxChars - 1)}…`
    return kept
  }
  return lines
}

type LaidOutNode = {
  node: GraphNode
  x: number
  y: number
  width: number
  height: number
  labelLines: string[]
}

const LABEL_CHARS = 30
const LABEL_MAX_LINES = 8
const LINE_HEIGHT = 17

function measureNode(node: GraphNode): { labelLines: string[]; width: number; height: number } {
  const labelLines = wrapText(node.label || '(empty)', LABEL_CHARS, LABEL_MAX_LINES)
  const height = 34 + labelLines.length * LINE_HEIGHT + (node.evidence.length > 0 ? 20 : 0) + 12
  return { labelLines, width: NODE_WIDTH, height }
}

/** First evidence link that passes the github.com gate, if any. */
function safeEvidenceUrl(node: GraphNode): string | null {
  for (const ev of node.evidence) {
    if (isGitHubWebUrl(ev.url)) return ev.url
  }
  return null
}

/**
 * Renders a story graph as a standalone SVG. Uses the editor's saved
 * positions (manual layout survives export); nodes without positions fall
 * back to the deterministic chain layout.
 */
export function toSvg(graph: StoryGraph): string {
  const positioned = graph.nodes.every((n) => n.position) ? graph : chainLayout(graph)
  const laidOut = new Map<string, LaidOutNode>()
  for (const node of positioned.nodes) {
    const { labelLines, width, height } = measureNode(node)
    laidOut.set(node.id, {
      node,
      x: node.position?.x ?? 0,
      y: node.position?.y ?? 0,
      width,
      height,
      labelLines,
    })
  }

  const boxes = [...laidOut.values()]
  const PAD = 28
  const minX = Math.min(0, ...boxes.map((b) => b.x)) - PAD
  const minY = Math.min(0, ...boxes.map((b) => b.y)) - PAD
  const maxX = Math.max(NODE_WIDTH, ...boxes.map((b) => b.x + b.width)) + PAD
  const maxY = Math.max(100, ...boxes.map((b) => b.y + b.height)) + PAD
  const width = Math.ceil(maxX - minX)
  const height = Math.ceil(maxY - minY)

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}" font-family="${xmlEscape(FONT)}">`,
  )
  parts.push(`<title>${xmlEscape(graph.kind === 'problem_solution' ? 'Problem → solution map' : 'Review evolution map')}</title>`)
  parts.push('<defs>')
  parts.push(
    `<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" fill="${THEME.edge}"/></marker>`,
  )
  parts.push('</defs>')
  parts.push(`<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${THEME.bg}"/>`)

  // Edges under nodes.
  for (const edge of positioned.edges) {
    const source = laidOut.get(edge.source)
    const target = laidOut.get(edge.target)
    if (!source || !target) continue
    const x1 = source.x + source.width
    const y1 = source.y + source.height / 2
    const x2 = target.x
    const y2 = target.y + target.height / 2
    const bend = Math.max(36, (x2 - x1) / 2)
    parts.push(
      `<path d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}" fill="none" stroke="${THEME.edge}" stroke-width="1.6" marker-end="url(#arrow)"/>`,
    )
    if (edge.label) {
      const mx = (x1 + x2) / 2
      const my = (y1 + y2) / 2 - 6
      parts.push(
        `<text x="${mx}" y="${my}" fill="${THEME.muted}" font-size="10.5" text-anchor="middle" paint-order="stroke" stroke="${THEME.bg}" stroke-width="4">${xmlEscape(edge.label)}</text>`,
      )
    }
  }

  for (const box of boxes) {
    const { node } = box
    const color = KIND_COLOR[node.kind]
    const unconfirmed = !node.confirmed && node.provenance !== 'user'
    parts.push('<g>')
    parts.push(
      `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="10" fill="${THEME.panel}" stroke="${color}" stroke-width="1.5"${unconfirmed ? ' stroke-dasharray="6 4"' : ''}/>`,
    )
    const draftTag = node.provenance === 'agent' ? ' · AGENT' : unconfirmed ? ' · DRAFT' : ''
    const kindText = `${KIND_LABEL[node.kind].toUpperCase()}${node.uncertain ? ' · ?' : ''}${draftTag}`
    parts.push(
      `<text x="${box.x + 12}" y="${box.y + 20}" fill="${color}" font-size="10" font-weight="700" letter-spacing="1">${xmlEscape(kindText)}</text>`,
    )
    box.labelLines.forEach((line, i) => {
      parts.push(
        `<text x="${box.x + 12}" y="${box.y + 38 + i * LINE_HEIGHT}" fill="${THEME.text}" font-size="12.5">${xmlEscape(line)}</text>`,
      )
    })
    if (node.evidence.length > 0) {
      const y = box.y + 38 + box.labelLines.length * LINE_HEIGHT + 8
      const evidenceText = `${node.evidence.length} evidence link${node.evidence.length === 1 ? '' : 's'} ↗`
      const href = safeEvidenceUrl(node)
      const text = `<text x="${box.x + 12}" y="${y}" fill="${THEME.faint}" font-size="10.5">${xmlEscape(evidenceText)}</text>`
      parts.push(href ? `<a href="${xmlEscape(href)}">${text}</a>` : text)
    }
    parts.push('</g>')
  }

  parts.push('</svg>')
  return parts.join('\n')
}

// --- timeline ------------------------------------------------------------

const EVENT_COLOR: Record<TimelineEvent['kind'], string> = {
  pr_opened: '#7c8cff',
  commit: '#60a5fa',
  review_approved: '#4ade80',
  review_changes: '#fbbf24',
  review_commented: '#4ade80',
  comment: '#94a3b8',
  review_comment: '#94a3b8',
  merged: '#b794f6',
  closed: '#f87171',
  issue_opened: '#7c8cff',
  cross_referenced: '#60a5fa',
}

/** Locale-independent "2026-07-01 10:00" — deterministic across machines. */
function shortStamp(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ')
}

// Structural on purpose: PR stories, issue stories, and synthesized journey
// bundles all render the same rail.
export type TimelineStoryLike = {
  title: string
  state: string
  author: string
  ref: { owner: string; repo: string; number: number; kind?: string }
  events: TimelineEvent[]
}

export function timelineToSvg(story: TimelineStoryLike): string {
  const WIDTH = 760
  const ROW = 56
  const TOP = 84
  const RAIL_X = 30
  const events = story.events
  const height = TOP + Math.max(1, events.length) * ROW + 20

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" font-family="${xmlEscape(FONT)}">`,
  )
  parts.push(`<title>${xmlEscape(`Contribution timeline — ${story.title}`)}</title>`)
  parts.push(`<rect x="0" y="0" width="${WIDTH}" height="${height}" fill="${THEME.bg}"/>`)
  parts.push(
    `<text x="24" y="34" fill="${THEME.text}" font-size="16" font-weight="700">${xmlEscape(wrapText(story.title, 78, 1)[0] ?? '')}</text>`,
  )
  parts.push(
    `<text x="24" y="56" fill="${THEME.muted}" font-size="12">${xmlEscape(`${story.ref.owner}/${story.ref.repo} ${story.ref.kind === 'issue' ? 'issue ' : ''}#${story.ref.number} · ${story.state} · by ${story.author}`)}</text>`,
  )

  if (events.length > 1) {
    parts.push(
      `<line x1="${RAIL_X}" y1="${TOP + ROW / 2}" x2="${RAIL_X}" y2="${TOP + (events.length - 1) * ROW + ROW / 2}" stroke="${THEME.border}" stroke-width="2"/>`,
    )
  }

  events.forEach((event, i) => {
    const cy = TOP + i * ROW + ROW / 2
    parts.push(
      `<circle cx="${RAIL_X}" cy="${cy}" r="6" fill="${EVENT_COLOR[event.kind]}" stroke="${THEME.bg}" stroke-width="2.5"/>`,
    )
    const title = wrapText(`${event.actor || '(unrecorded)'} ${event.title}`, 78, 1)[0] ?? ''
    const strongLen = (event.actor || '(unrecorded)').length
    parts.push(
      `<text x="${RAIL_X + 22}" y="${cy - 2}" font-size="13" fill="${THEME.text}"><tspan font-weight="600">${xmlEscape(title.slice(0, strongLen))}</tspan>${xmlEscape(title.slice(strongLen))}</text>`,
    )
    const detail = event.detail ? ` — ${wrapText(event.detail, 60, 1)[0] ?? ''}` : ''
    parts.push(
      `<text x="${RAIL_X + 22}" y="${cy + 15}" font-size="11" fill="${THEME.faint}">${xmlEscape(`${shortStamp(event.timestamp)}${detail}`)}</text>`,
    )
  })

  parts.push('</svg>')
  return parts.join('\n')
}
