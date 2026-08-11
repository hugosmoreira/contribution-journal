import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ReadOnlyMap from '../../../components/ReadOnlyMap'
import { StoryHeader, Timeline } from '../../../components/StoryView'
import { IssueHeader } from '../../../components/IssueStorySections'
import { getPublished, publishedEvents, publishedTitle, type PublishedStory } from '../../../lib/published'
import { callerIpHash, trackEvent } from '../../../lib/metrics'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

const DESCRIPTIONS: Record<PublishedStory['kind'], string> = {
  pr: 'A contribution story: how this pull request went from problem to outcome. Every step linked to its evidence on GitHub.',
  issue: 'An issue story: the problem, the discussion, and where it landed. Every step linked to its evidence on GitHub.',
  journey: 'A full journey: the issue and its pull requests told as one story. Every step linked to its evidence on GitHub.',
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const published = await getPublished(slug)
  if (!published) return { title: 'Story not found — Contribution Journal' }
  const { title, refLine } = publishedTitle(published)
  return {
    title: `${title} — ${refLine}`,
    description: DESCRIPTIONS[published.kind],
    robots: published.visibility === 'unlisted' ? { index: false } : undefined,
  }
}

function MapSection({ heading, note, graph }: { heading: string; note: string; graph: Parameters<typeof ReadOnlyMap>[0]['graph'] }) {
  return (
    <section>
      <div className="section-head">
        <h2>{heading}</h2>
        <span className="provenance">{note}</span>
      </div>
      <ReadOnlyMap graph={graph} />
    </section>
  )
}

export default async function PublicStoryPage({ params }: { params: Params }) {
  const { slug } = await params
  const published = await getPublished(slug)
  if (!published) notFound()

  const { refLine } = publishedTitle(published)
  void trackEvent('public_view', refLine.replace(' — full journey', ''), await callerIpHash())
  const events = publishedEvents(published)

  return (
    <main className="story-page">
      {published.kind === 'pr' ? (
        <StoryHeader story={published.story} />
      ) : published.kind === 'issue' ? (
        <IssueHeader story={published.story} />
      ) : (
        <header className="story-header">
          <div className="repo-line">
            <a href={published.bundle.issue.url} target="_blank" rel="noreferrer" className="repo-link">
              {refLine}
            </a>
            <span className="state-badge state-merged">full journey</span>
          </div>
          <h1>{published.bundle.issue.title}</h1>
          <p className="byline">
            <strong>{published.bundle.issue.author}</strong>
            <span className="sep">·</span>
            the issue and{' '}
            {published.bundle.prs.length === 1
              ? 'its pull request'
              : `${published.bundle.prs.length} pull requests`}
            , told as one story
          </p>
        </header>
      )}

      {published.kind === 'pr' ? (
        <>
          <MapSection
            heading="Problem → solution map"
            note="every node links to its evidence on GitHub"
            graph={published.maps.problemSolution}
          />
          {published.maps.reviewEvolution && published.maps.reviewEvolution.nodes.length > 0 ? (
            <MapSection
              heading="Review evolution"
              note="feedback → reading → change → lesson"
              graph={published.maps.reviewEvolution}
            />
          ) : null}
        </>
      ) : published.kind === 'issue' ? (
        <MapSection
          heading="Issue exploration map"
          note="every node links to its evidence on GitHub"
          graph={published.maps.issueExploration}
        />
      ) : (
        <MapSection
          heading="Journey map"
          note="issue + pull requests — every node links to its evidence on GitHub"
          graph={published.maps.journey}
        />
      )}

      <section>
        <div className="section-head">
          <h2>{published.kind === 'journey' ? 'The whole timeline' : published.kind === 'issue' ? 'Issue timeline' : 'Contribution timeline'}</h2>
          <span className="provenance">built from GitHub evidence</span>
        </div>
        <Timeline events={events} />
      </section>

      <footer className="public-footer">
        <p>
          Published with <strong>Contribution Journal</strong> — GitHub records what you did; this
          is where you learn from it.
        </p>
        <Link href="/">Create your own story →</Link>
      </footer>
    </main>
  )
}
