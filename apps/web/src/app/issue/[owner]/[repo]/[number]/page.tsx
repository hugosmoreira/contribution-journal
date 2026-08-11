import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { GitHubImportError, importIssue, parseGitHubUrl } from '@journal/github'
import { getAssistant } from '@journal/ai'
import { StoryGraphSchema, layoutGraph, type StoryGraph } from '@journal/visualizations'
import { databaseConfigured } from '@journal/db'
import type { IssueStory } from '@journal/domain'
import { trackFirstEdit } from '../../../../actions'
import AuthMenu from '../../../../../components/AuthMenu'
import { MapPending } from '../../../../../components/StorySections'
import {
  IssueActions,
  IssueExplorationSection,
  IssueHeader,
} from '../../../../../components/IssueStorySections'
import { Timeline } from '../../../../../components/StoryView'
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
  return parseGitHubUrl(`https://github.com/${owner}/${repo}/issues/${number}`)
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { owner, repo, number } = await params
  return { title: `${owner}/${repo} issue #${number} — Contribution Journal` }
}

export default async function IssueStoryPage({ params }: { params: Params }) {
  const { owner, repo, number } = await params
  const parsed = parseParams(owner, repo, number)
  if (!parsed.ok) {
    return (
      <main className="story-page">
        <ErrorCard message={parsed.reason} />
      </main>
    )
  }

  // Same daily import quota as PR stories: keyed per-IP for anonymous
  // callers and per-account for signed-in ones, checked before any import.
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
          signInHref={canSignIn ? `/api/auth/signin?next=${encodeURIComponent(`/issue/${owner}/${repo}/${number}`)}` : undefined}
        />
      </main>
    )
  }

  let story: IssueStory
  try {
    story = await importIssue(parsed.ref)
  } catch (err) {
    // GitHub numbers issues and PRs together; /issues/N can name a PR. Offer
    // the PR story instead of a dead end.
    if (err instanceof GitHubImportError && err.code === 'is_pr') {
      return (
        <main className="story-page">
          <ErrorCard
            message={err.message}
            actionHref={`/story/${parsed.ref.owner}/${parsed.ref.repo}/${parsed.ref.number}`}
            actionText="Open the pull request story →"
          />
        </main>
      )
    }
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

  void trackEvent('import', `${story.ref.owner}/${story.ref.repo}#issue-${story.ref.number}`, quotaKey)

  // The draft starts now and streams in; the evidence — header and timeline —
  // never waits on a model. Agent notes are PR-capture material and are not
  // read here: an issue and a PR can share a number, and the notes cache does
  // not key by kind.
  const assistant = getAssistant()
  const mapPromise = assistant.draftIssueExplorationMap(story).then(layoutGraph)

  return (
    <main className="story-page">
      <nav className="top-nav">
        <Link href="/">← New story</Link>
        <div className="top-nav-actions">
          <Suspense fallback={<span className="actions-pending">preparing export…</span>}>
            <IssueActions story={story} mapPromise={mapPromise} publishable={databaseConfigured()} />
          </Suspense>
          <AuthMenu />
        </div>
      </nav>
      <IssueHeader story={story} />
      <Suspense
        fallback={<MapPending heading="Issue exploration map" note="drafting from the evidence" />}
      >
        <IssueExplorationSection
          story={story}
          mapPromise={mapPromise}
          relayoutAction={relayoutAction}
          onFirstEdit={trackFirstEdit.bind(null, story.ref)}
        />
      </Suspense>
      <section>
        <div className="section-head">
          <h2>Issue timeline</h2>
          <span className="provenance">built from GitHub evidence — no AI</span>
        </div>
        {story.truncated ? (
          <p className="notice">
            This is a very active issue — the timeline shows the first ~500 events of each type.
            Nothing shown is invented; some later events are omitted.
          </p>
        ) : null}
        <Timeline events={story.events} />
      </section>
      <footer className="coming">
        Linked pull requests above open their own stories — or view the{' '}
        <strong>full journey</strong> to see this issue and its PRs as one. Next: the v0.2{' '}
        <strong>journal view</strong>, your stories collected without pasting a URL.
      </footer>
    </main>
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
      <h1>Couldn&apos;t build this story</h1>
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
