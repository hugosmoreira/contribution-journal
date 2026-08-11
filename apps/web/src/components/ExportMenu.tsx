'use client'

import { useCallback } from 'react'
import type { PrStory } from '@journal/domain'
import type { StoryGraph } from '@journal/visualizations/graph'
import { timelineToSvg, toExportJSON, toMarkdown, toSvg, type ExportMaps } from '@journal/export'
import { currentGraph } from './local-graphs'

function download(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ExportMenu({
  story,
  psDraft,
  reviewDraft,
}: {
  story: PrStory
  psDraft: StoryGraph
  reviewDraft: StoryGraph | null
}) {
  const collect = useCallback((): ExportMaps => {
    const key = `${story.ref.owner}/${story.ref.repo}/${story.ref.number}`
    return {
      problemSolution: currentGraph(`psmap:${key}`, psDraft),
      reviewEvolution: reviewDraft ? currentGraph(`remap:${key}`, reviewDraft) : undefined,
    }
  }, [story.ref.owner, story.ref.repo, story.ref.number, psDraft, reviewDraft])

  const base = `${story.ref.owner}-${story.ref.repo}-pr${story.ref.number}`

  return (
    <div className="export-menu">
      <button
        type="button"
        onClick={() => download(`${base}.md`, 'text/markdown', toMarkdown(story, collect()))}
      >
        ↓ Markdown
      </button>
      <button
        type="button"
        onClick={() => download(`${base}.json`, 'application/json', toExportJSON(story, collect()))}
      >
        ↓ JSON
      </button>
      <button
        type="button"
        title="Problem → solution map as an SVG image"
        onClick={() => download(`${base}-map.svg`, 'image/svg+xml', toSvg(collect().problemSolution))}
      >
        ↓ Map SVG
      </button>
      {reviewDraft ? (
        <button
          type="button"
          title="Review evolution map as an SVG image"
          onClick={() => {
            const review = collect().reviewEvolution
            if (review) download(`${base}-review.svg`, 'image/svg+xml', toSvg(review))
          }}
        >
          ↓ Review SVG
        </button>
      ) : null}
      <button
        type="button"
        title="Contribution timeline as an SVG image"
        onClick={() => download(`${base}-timeline.svg`, 'image/svg+xml', timelineToSvg(story))}
      >
        ↓ Timeline SVG
      </button>
    </div>
  )
}
