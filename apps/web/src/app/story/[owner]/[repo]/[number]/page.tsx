import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { GitHubImportError, importPr, parseGitHubUrl } from '@journal/github'
import { getAssistant, readAgentNotes } from '@journal/ai'
import { StoryGraphSchema, layoutGraph, type StoryGraph } from '@journal/visualizations'
import { databaseConfigured } from '@journal/db'
import type { PrStory } from '@journal/domain'
import { trackFirstEdit } from '../../../../actions'
import AuthMenu from '../../../../../components/AuthMenu'
import {
  MapPending,
  ProblemSolutionSection,
  ReviewEvolutionSection,
  StoryActions,
} from '../../../../../components/StorySections'
import { StoryHeader, Timeline } from '../../../../../components/StoryView'
import { getSession, signInAvailable } from '../../../../../lib/auth'
import { DAILY_IMPORT_LIMIT, callerQuotaKey, importsToday, trackEvent } from '../../../../../lib/metrics'

export const dynamic = 'force-dynamic'

type Params = Promise<{ owner: string; repo: string; number: string }>

// ELK auto-layout runs server-side; the editor calls back into it. Input is
// client-supplied, so it is schema-validated before layout.
async function relayoutAction(graph: StoryGraph): Promise<StoryGraph> {
  'use server'
  return layoutGraph(StoryGraphSchema.parse(graph))
}

function parseParams(owner: string, repo: string, number: string) {
  return parseGitHubUrl(`https://github.com/${owner}/${repo}/pull/${number}`)
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { owner, repo, number } = await params
  return { title: `${owner}/${repo} #${number} — Contribution Journal` }
}

export default async function StoryPage({ params }: { params: Params }) {
  const { owner, repo, number } = await params
  const parsed = parseParams(owner, repo, number)
  if (!parsed.ok) {
    return (
      <main className="story-page">
        <ErrorCard message={parsed.reason} />
      </main>
    )
  }

  // Daily import quota (SPEC DoD 11): keyed per-IP for anonymous callers and
  // per-account for signed-in ones, checked before any import work. Exceeding
  // the anonymous quota prompts GitHub sign-in (SPEC §3.1).
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
          signInHref={canSignIn ? `/api/auth/signin?next=${encodeURIComponent(`/story/${owner}/${repo}/${number}`)}` : undefined}
        />
      </main>
    )
  }

  let story: PrStory
  try {
    story = await importPr(parsed.ref)
  } catch (err) {
    const message =
      err instanceof GitHubImportError
        ? err.message
        : 'Something went wrong while importing. Try again in a moment.'
    return (
      <main className="story-page">
        <ErrorCard message={message} />
      </main>
    )
  }

  void trackEvent('import', `${story.ref.owner}/${story.ref.repo}#${story.ref.number}`, quotaKey)

  // Both drafts start now and stream in independently. Nothing below awaits
  // them: the evidence — header and timeline — must never wait on a model.
  // On a large PR the maps can take tens of seconds; the story itself is on
  // screen in the time the GitHub import takes.
  // Context an agent reported when it captured this PR. Passing it here is
  // what makes the page reuse the capture's already-paid-for draft instead
  // of redrawing a note-free map.
  const agentNotes = readAgentNotes(story.ref)
  const assistant = getAssistant()
  const psPromise = assistant.draftProblemSolutionMap(story, agentNotes).then(layoutGraph)
  const reviewPromise = assistant.draftReviewEvolutionMap(story, agentNotes).then(layoutGraph)

  return (
    <main className="story-page">
      <nav className="top-nav">
        <Link href="/">← New story</Link>
        <div className="top-nav-actions">
          <Suspense fallback={<span className="actions-pending">preparing export…</span>}>
            <StoryActions
              story={story}
              psPromise={psPromise}
              reviewPromise={reviewPromise}
              publishable={databaseConfigured()}
            />
          </Suspense>
          <AuthMenu />
        </div>
      </nav>
      <StoryHeader story={story} />
      <Suspense
        fallback={
          <MapPending heading="Problem → solution map" note="drafting from the evidence" />
        }
      >
        <ProblemSolutionSection
          story={story}
          psPromise={psPromise}
          relayoutAction={relayoutAction}
          onFirstEdit={trackFirstEdit.bind(null, story.ref)}
        />
      </Suspense>
      <Suspense fallback={null}>
        <ReviewEvolutionSection
          story={story}
          reviewPromise={reviewPromise}
          relayoutAction={relayoutAction}
        />
      </Suspense>
      <section>
        <div className="section-head">
          <h2>Contribution timeline</h2>
          <span className="provenance">built from GitHub evidence — no AI</span>
        </div>
        {story.truncated ? (
          <p className="notice">
            This is a very large pull request — the timeline shows the first ~500 events of each
            type. Nothing shown is invented; some later events are omitted.
          </p>
        ) : null}
        <Timeline events={story.events} />
      </section>
      <footer className="coming">
        Next for this page: <strong>issue stories</strong>, and the v0.2{' '}
        <strong>journal + GitHub watcher</strong> so stories appear without pasting a URL.
      </footer>
    </main>
  )
}

function ErrorCard({ message, signInHref }: { message: string; signInHref?: string }) {
  return (
    <div className="error-card" role="alert">
      <h1>Couldn&apos;t build this story</h1>
      <p>{message}</p>
      {signInHref ? (
        <a href={signInHref} className="signin-btn">
          Sign in with GitHub
        </a>
      ) : null}
      <Link href="/" className="back-btn">
        ← Try another pull request
      </Link>
    </div>
  )
}
