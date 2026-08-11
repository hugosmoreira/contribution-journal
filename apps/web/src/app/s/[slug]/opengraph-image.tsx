import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { getPublished, publishedTitle, type PublishedStory } from '../../../lib/published'

// Per-story Open Graph image (SPEC_V0.1 §3.7 — a requirement, not polish):
// this is what the link looks like pasted into a conversation, including a
// schematic preview of the problem→solution map.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const STATE_COLORS: Record<string, string> = {
  merged: '#b794f6',
  open: '#4ade80',
  closed: '#f87171',
}

const KIND_COLORS: Record<string, string> = {
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

// Truncate on code points so a surrogate pair is never split.
function clip(text: string, max: number): string {
  const points = [...text]
  return points.length > max ? `${points.slice(0, max - 1).join('')}…` : text
}

function primaryMap(published: PublishedStory) {
  if (published.kind === 'issue') return published.maps.issueExploration
  if (published.kind === 'journey') return published.maps.journey
  return published.maps.problemSolution
}

function statsLine(published: PublishedStory): string {
  if (published.kind === 'pr') {
    const { story } = published
    return `${story.commitCount} commits · ${story.changedFiles} files · +${story.additions} −${story.deletions}`
  }
  if (published.kind === 'issue') {
    const { story } = published
    return `${story.commentCount} comments · ${story.linkedPrs.length} linked PR${story.linkedPrs.length === 1 ? '' : 's'}`
  }
  const { bundle } = published
  return `1 issue · ${bundle.prs.length} pull request${bundle.prs.length === 1 ? '' : 's'} · ${bundle.events.length} events`
}

export default async function OpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const published = await getPublished(slug)
  // Dead slugs must not produce a branded 200 image.
  if (!published) notFound()

  const { title, refLine, state } = publishedTitle(published)
  const stats = statsLine(published)
  const previewNodes = primaryMap(published).nodes.slice(0, 6)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px 72px',
          backgroundColor: '#0b0e14',
          backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% -20%, rgba(124,140,255,0.25), transparent)',
          color: '#e7eaf2',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: '#7c8cff', fontSize: 24, letterSpacing: 4, textTransform: 'uppercase' }}>
            Contribution Journal
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 30 }}>
            <span style={{ color: '#8b94a8', fontSize: 30 }}>{refLine}</span>
            <span
              style={{
                border: `2px solid ${STATE_COLORS[state] ?? '#8b94a8'}`,
                borderRadius: 999,
                color: STATE_COLORS[state] ?? '#8b94a8',
                fontSize: 22,
                padding: '3px 20px',
                textTransform: 'uppercase',
              }}
            >
              {state}
            </span>
          </div>
          <div style={{ display: 'flex', fontSize: 52, fontWeight: 700, lineHeight: 1.15, marginTop: 20, maxWidth: 1020 }}>
            {clip(title, 80)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {previewNodes.map((node, i) => (
            <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  border: `2px ${node.confirmed ? 'solid' : 'dashed'} ${KIND_COLORS[node.kind] ?? '#8b94a8'}`,
                  borderRadius: 12,
                  padding: '10px 16px',
                  maxWidth: 220,
                  backgroundColor: '#11151f',
                }}
              >
                <span style={{ color: KIND_COLORS[node.kind] ?? '#8b94a8', fontSize: 15, textTransform: 'uppercase' }}>
                  {node.kind.replace('_', ' ')}
                </span>
                <span style={{ color: '#e7eaf2', fontSize: 18 }}>{clip(node.label, 34)}</span>
              </div>
              {i < previewNodes.length - 1 ? <span style={{ color: '#46506a', fontSize: 26 }}>→</span> : null}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#8b94a8', fontSize: 26 }}>{stats}</span>
          <span style={{ color: '#5b6478', fontSize: 22 }}>
            GitHub records what you did. This is where you learn from it.
          </span>
        </div>
      </div>
    ),
    {
      ...size,
      headers: {
        'Cache-Control': 'public, max-age=3600',
        ...(published.visibility === 'unlisted' ? { 'X-Robots-Tag': 'noindex' } : {}),
      },
    },
  )
}
