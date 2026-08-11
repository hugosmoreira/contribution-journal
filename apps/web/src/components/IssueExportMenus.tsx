'use client'

import { useCallback } from 'react'
import type { IssueStory, PrStory, TimelineEvent } from '@journal/domain'
import type { StoryGraph } from '@journal/visualizations/graph'
import {
  issueToExportJSON,
  issueToMarkdown,
  journeyToExportJSON,
  journeyToMarkdown,
  timelineToSvg,
  toSvg,
} from '@journal/export'
import { currentGraph } from './local-graphs'

// Client components on purpose: exports must include the user's local map
// edits (localStorage), not just the server-side draft.

function download(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function IssueExportMenu({ story, draft }: { story: IssueStory; draft: StoryGraph }) {
  const collect = useCallback(
    () =>
      currentGraph(`issuemap:${story.ref.owner}/${story.ref.repo}/${story.ref.number}`, draft),
    [story.ref.owner, story.ref.repo, story.ref.number, draft],
  )
  const base = `${story.ref.owner}-${story.ref.repo}-issue${story.ref.number}`

  return (
    <div className="export-menu">
      <button
        type="button"
        onClick={() => download(`${base}.md`, 'text/markdown', issueToMarkdown(story, collect()))}
      >
        ↓ Markdown
      </button>
      <button
        type="button"
        onClick={() => download(`${base}.json`, 'application/json', issueToExportJSON(story, collect()))}
      >
        ↓ JSON
      </button>
      <button
        type="button"
        title="Issue exploration map as an SVG image"
        onClick={() => download(`${base}-map.svg`, 'image/svg+xml', toSvg(collect()))}
      >
        ↓ Map SVG
      </button>
      <button
        type="button"
        title="Issue timeline as an SVG image"
        onClick={() => download(`${base}-timeline.svg`, 'image/svg+xml', timelineToSvg(story))}
      >
        ↓ Timeline SVG
      </button>
    </div>
  )
}

export function JourneyExportMenu({
  issue,
  prs,
  draft,
  events,
}: {
  issue: IssueStory
  prs: PrStory[]
  draft: StoryGraph
  events: TimelineEvent[]
}) {
  const collect = useCallback(
    () =>
      currentGraph(`journeymap:${issue.ref.owner}/${issue.ref.repo}/${issue.ref.number}`, draft),
    [issue.ref.owner, issue.ref.repo, issue.ref.number, draft],
  )
  const base = `${issue.ref.owner}-${issue.ref.repo}-journey${issue.ref.number}`

  return (
    <div className="export-menu">
      <button
        type="button"
        onClick={() =>
          download(`${base}.md`, 'text/markdown', journeyToMarkdown(issue, prs, collect(), events))
        }
      >
        ↓ Markdown
      </button>
      <button
        type="button"
        onClick={() =>
          download(`${base}.json`, 'application/json', journeyToExportJSON(issue, prs, collect(), events))
        }
      >
        ↓ JSON
      </button>
      <button
        type="button"
        title="Journey map as an SVG image"
        onClick={() => download(`${base}-map.svg`, 'image/svg+xml', toSvg(collect()))}
      >
        ↓ Map SVG
      </button>
      <button
        type="button"
        title="Merged issue + PR timeline as an SVG image"
        onClick={() =>
          download(
            `${base}-timeline.svg`,
            'image/svg+xml',
            timelineToSvg({
              title: issue.title,
              state: issue.state,
              author: issue.author,
              ref: issue.ref,
              events,
            }),
          )
        }
      >
        ↓ Timeline SVG
      </button>
    </div>
  )
}
