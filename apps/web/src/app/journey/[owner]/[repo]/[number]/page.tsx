import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { GitHubImportError, parseGitHubUrl } from '@journal/github'
import { getAssistant } from '@journal/ai'
import { StoryGraphSchema, layoutGraph, type StoryGraph } from '@journal/visualizations'
import { databaseConfigured } from '@journal/db'
import type { IssueStory, PrStory, TimelineEvent } from '@journal/domain'
import { trackFirstEdit } from '../../../../actions'
import AuthMenu from '../../../../../components/AuthMenu'
import { MapPending } from '../../../../../components/StorySections'
import { JourneySection } from '../../../../../components/IssueStorySections'
import { JourneyExportMenu } from '../../../../../components/IssueExportMenus'
import PublishMenu from '../../../../../components/PublishMenu'
import { Timeline } from '../../../../../components/StoryView'
import { getSession, signInAvailable } from '../../../../../lib/auth'
import { loadJourney, sameRepoPrRefs, type JourneyData } from '../../../../../lib/journey'
import { DAILY_IMPORT_LIMIT, callerQuotaKey, importsToday, trackEvent } from '../../../../../lib/metrics'

export const dynamic = 'force-dynamic'

type Params = Promise<{ owner: string; repo: string; number: string }>

async function relayoutAction(graph: StoryGraph): Promise<StoryGraph> {
  'use server'
  return layoutGraph(StoryGraphSchema.parse(graph))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { owner, repo, number } = await params
  return { title: `${owner}/${repo} #${number} — the full journey — Contribution Journal` }
}

export default async function JourneyPage({ params }: { params: Params }) {
  const { owner, repo, number } = await params
  const parsed = parseGitHubUrl(`https://github.com/${owner}/${repo}/issues/${number}`)
  if (!parsed.ok) {
    return (
      <main className="story-page">
        <ErrorCard message={parsed.reason} />
      </main>
    )
  }

  const session = await getSession()
  const quotaKey = await callerQuotaKey(session?.userId ?? null)
  if ((await importsToday(quotaKey)) >= DAILY_IMPORT_LIMIT) {
    const canSignIn = !session && signInAvailable()
    return (
      <main className="story-page">
        <ErrorCard
          message={
            session
              ? `You've reached the limit of ${DAILY_IMPORT_LIMIT} stories per day for your account. It resets at midnight UTC.`
              : `You've reached the anonymous limit of ${DAILY_IMPORT_LIMIT} stories per day for this network. It resets at midnight UTC${canSignIn ? ' — or sign in with GitHub to keep going with your own allowance' : ''}.`
          }
          signInHref={canSignIn ? `/api/auth/signin?next=${encodeURIComponent(`/journey/${owner}/${repo}/${number}`)}` : undefined}
        />
      </main>
    )
  }

  let journey: JourneyData
  try {
    journey = await loadJourney(parsed.ref)
  } catch (err) {
    if (err instanceof GitHubImportError && err.code === 'is_pr') {
      return (
        <main className="story-page">
          <ErrorCard
            message="A journey starts from the issue, and this number is a pull request. Open the pull request story — its linked issues lead back to the journey."
            actionHref={`/story/${parsed.ref.owner}/${parsed.ref.repo}/${parsed.ref.number}`}
            actionText="Open the pull request story →"
          />
        </main>
      )
    }
    return (
      <main className="story-page">
        <ErrorCard
          message={
            err instanceof GitHubImportError
              ? err.message
              : 'Something went wrong while importing. Try again in a moment.'
          }
        />
      </main>
    )
  }

  const { issue, prs, events } = journey
  if (prs.length === 0) {
    const hadCandidates = sameRepoPrRefs(issue).length > 0
    return (
      <main className="story-page">
        <ErrorCard
          message={
            hadCandidates
              ? 'The linked pull requests could not be imported right now — try again in a moment, or read the issue story on its own.'
              : 'This issue has no linked pull requests in its repository yet — a journey needs both halves. The issue story is ready, and this page will work the moment a PR references the issue.'
          }
          actionHref={`/issue/${issue.ref.owner}/${issue.ref.repo}/${issue.ref.number}`}
          actionText="Open the issue story →"
        />
      </main>
    )
  }

  void trackEvent('import', `${issue.ref.owner}/${issue.ref.repo}#journey-${issue.ref.number}`, quotaKey)

  const assistant = getAssistant()
  const mapPromise = assistant.draftJourneyMap(issue, prs).then(layoutGraph)

  return (
    <main className="story-page">
      <nav className="top-nav">
        <Link href={`/issue/${issue.ref.owner}/${issue.ref.repo}/${issue.ref.number}`}>
          ← Issue story
        </Link>
        <div className="top-nav-actions">
          <Suspense fallback={<span className="actions-pending">preparing export…</span>}>
            <JourneyActions
              issue={issue}
              prs={prs}
              events={events}
              mapPromise={mapPromise}
              publishable={databaseConfigured()}
            />
          </Suspense>
          <AuthMenu />
        </div>
      </nav>

      <header className="story-header">
        <div className="repo-line">
          <a href={issue.url} target="_blank" rel="noreferrer" className="repo-link">
            {issue.ref.owner}/{issue.ref.repo} issue #{issue.ref.number}
          </a>
          <span className="state-badge state-merged">full journey</span>
        </div>
        <h1>{issue.title}</h1>
        <p className="byline">
          <strong>{issue.author}</strong>
          <span className="sep">·</span>
          the issue and {prs.length === 1 ? 'its pull request' : `${prs.length} pull requests`}, told
          as one story
        </p>
        <div className="linked-prs">
          <Link href={`/issue/${issue.ref.owner}/${issue.ref.repo}/${issue.ref.number}`} className="linked-pr">
            issue story
          </Link>
          {prs.map((pr) => (
            <Link
              key={pr.ref.number}
              href={`/story/${pr.ref.owner}/${pr.ref.repo}/${pr.ref.number}`}
              className="linked-pr"
              title={pr.title}
            >
              PR #{pr.ref.number} · {pr.state}
            </Link>
          ))}
        </div>
      </header>

      <Suspense fallback={<MapPending heading="Journey map" note="drafting from the issue and its pull requests" />}>
        <JourneySection
          story={issue}
          mapPromise={mapPromise}
          relayoutAction={relayoutAction}
          onFirstEdit={trackFirstEdit.bind(null, issue.ref)}
        />
      </Suspense>

      <section>
        <div className="section-head">
          <h2>The whole timeline</h2>
          <span className="provenance">issue + pull requests, interleaved — built from GitHub evidence, no AI</span>
        </div>
        {issue.truncated || prs.some((p) => p.truncated) ? (
          <p className="notice">
            Part of this journey is very large — some later events of each type are omitted.
            Nothing shown is invented.
          </p>
        ) : null}
        <Timeline events={events} />
      </section>

      <footer className="coming">
        Next: the v0.2 <strong>journal view</strong>, so your stories appear here without
        pasting a URL.
      </footer>
    </main>
  )
}

async function JourneyActions({
  issue,
  prs,
  events,
  mapPromise,
  publishable,
}: {
  issue: IssueStory
  prs: PrStory[]
  events: TimelineEvent[]
  mapPromise: Promise<StoryGraph>
  publishable: boolean
}) {
  const draft = await mapPromise
  return (
    <>
      {publishable ? (
        <PublishMenu
          refValue={issue.ref}
          kind="journey"
          slots={[{ key: 'journey', prefix: 'journeymap', draft }]}
        />
      ) : null}
      <JourneyExportMenu issue={issue} prs={prs} draft={draft} events={events} />
    </>
  )
}

function ErrorCard({
  message,
  signInHref,
  actionHref,
  actionText,
}: {
  message: string
  signInHref?: string
  actionHref?: string
  actionText?: string
}) {
  return (
    <div className="error-card" role="alert">
      <h1>Couldn&apos;t build this journey</h1>
      <p>{message}</p>
      {signInHref ? (
        <a href={signInHref} className="signin-btn">
          Sign in with GitHub
        </a>
      ) : null}
      {actionHref && actionText ? (
        <Link href={actionHref} className="signin-btn">
          {actionText}
        </Link>
      ) : null}
      <Link href="/" className="back-btn">
        ← Try another link
      </Link>
    </div>
  )
}
