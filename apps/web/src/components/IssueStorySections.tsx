import Link from 'next/link'
import type { IssueStory } from '@journal/domain'
import { parseGitHubUrl } from '@journal/github'
import type { StoryGraph } from '@journal/visualizations'
import MapEditor from './MapEditor'
import PublishMenu from './PublishMenu'
import { IssueExportMenu } from './IssueExportMenus'

// Issue-story header and map section. Mirrors StoryView/StorySections; the
// map section is a server component that AWAITS the draft promise inside a
// Suspense boundary, so evidence renders before any model work finishes.

const dateFmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' })

function safeFormat(fmt: Intl.DateTimeFormat, value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : fmt.format(date)
}

function daysBetween(a: string, b: string): number | null {
  const start = new Date(a).getTime()
  const end = new Date(b).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return Math.max(1, Math.round((end - start) / 86_400_000))
}

// State badge text uses GitHub's own vocabulary so the page never claims
// more than the record does; color is reinforced by the words themselves.
function stateBadge(story: IssueStory): { text: string; cls: string } {
  if (story.state === 'open') return { text: 'open', cls: 'state-open' }
  if (story.stateReason === 'completed') return { text: 'closed as completed', cls: 'state-merged' }
  if (story.stateReason === 'not_planned') return { text: 'closed as not planned', cls: 'state-closed' }
  return { text: 'closed', cls: 'state-closed' }
}

/** Internal story link when the PR lives in a public github.com repo we can
 * re-parse; plain GitHub link otherwise. Cross-repo references carry their
 * full name so "#313 · merged" can never read as this repo's #313. */
function linkedPrView(
  url: string,
  home: IssueStory['ref'],
  number: number,
): { href: string; internal: boolean; prefix: string } {
  const parsed = parseGitHubUrl(url)
  if (parsed.ok && parsed.ref.kind === 'pr') {
    const { owner, repo } = parsed.ref
    const foreign = owner !== home.owner || repo !== home.repo
    return {
      href: `/story/${owner}/${repo}/${parsed.ref.number}`,
      internal: true,
      prefix: foreign ? `${owner}/${repo}` : '',
    }
  }
  return { href: url, internal: false, prefix: '' }
}

/** True when at least one linked PR lives in the issue's own repo — the
 * precondition for a journey view. */
export function hasSameRepoPr(story: IssueStory): boolean {
  return story.linkedPrs.some((pr) => {
    const parsed = parseGitHubUrl(pr.url)
    return (
      parsed.ok &&
      parsed.ref.kind === 'pr' &&
      parsed.ref.owner === story.ref.owner &&
      parsed.ref.repo === story.ref.repo
    )
  })
}

export function IssueHeader({ story }: { story: IssueStory }) {
  const opened = safeFormat(dateFmt, story.createdAt)
  let span = `Opened ${opened} — still open`
  if (story.closedAt) {
    const days = daysBetween(story.createdAt, story.closedAt)
    const duration = days === null ? '' : ` (${days} ${days === 1 ? 'day' : 'days'})`
    span = `Opened ${opened} → Closed ${safeFormat(dateFmt, story.closedAt)}${duration}`
  }
  const participants = new Set(
    story.events.map((e) => e.actor).filter((actor) => actor && actor !== '[unknown]'),
  ).size
  const badge = stateBadge(story)

  return (
    <header className="story-header">
      <div className="repo-line">
        <a href={story.url} target="_blank" rel="noreferrer" className="repo-link">
          {story.ref.owner}/{story.ref.repo} issue #{story.ref.number}
        </a>
        <span className={`state-badge ${badge.cls}`}>{badge.text}</span>
      </div>
      <h1>{story.title}</h1>
      <p className="byline">
        {story.authorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={story.authorAvatarUrl} alt="" className="avatar" width={22} height={22} />
        ) : null}
        <strong>{story.author}</strong>
        <span className="sep">·</span>
        {span}
      </p>
      <ul className="stats">
        <li>
          <strong>{story.commentCount}</strong> {story.commentCount === 1 ? 'comment' : 'comments'}
        </li>
        <li>
          <strong>{participants}</strong> {participants === 1 ? 'person' : 'people'} involved
        </li>
        {story.labels.length > 0 ? (
          <li>
            labels: <strong>{story.labels.slice(0, 4).join(', ')}</strong>
            {story.labels.length > 4 ? ` +${story.labels.length - 4}` : ''}
          </li>
        ) : null}
      </ul>
      {story.linkedPrs.length > 0 ? (
        <div className="linked-prs">
          <span className="linked-prs-label">Linked pull requests:</span>
          {story.linkedPrs.map((pr) => {
            const { href, internal, prefix } = linkedPrView(pr.url, story.ref, pr.number)
            const text = `${prefix}#${pr.number} · ${pr.state}`
            return internal ? (
              <Link key={pr.number} href={href} className="linked-pr" title={pr.title}>
                {text}
              </Link>
            ) : (
              <a key={pr.number} href={href} target="_blank" rel="noreferrer" className="linked-pr" title={pr.title}>
                {text}
              </a>
            )
          })}
          {hasSameRepoPr(story) ? (
            <Link
              href={`/journey/${story.ref.owner}/${story.ref.repo}/${story.ref.number}`}
              className="linked-pr linked-pr--journey"
            >
              View the full journey →
            </Link>
          ) : null}
        </div>
      ) : null}
    </header>
  )
}

type SectionProps = {
  story: IssueStory
  mapPromise: Promise<StoryGraph>
  relayoutAction: (graph: StoryGraph) => Promise<StoryGraph>
  onFirstEdit: () => Promise<void>
}

/** Awaits the drafted map so publish/export include it; suspends inside the
 * page's boundary, never blocking the evidence. */
export async function IssueActions({
  story,
  mapPromise,
  publishable,
}: Pick<SectionProps, 'story' | 'mapPromise'> & { publishable: boolean }) {
  const draft = await mapPromise
  return (
    <>
      {publishable ? (
        <PublishMenu
          refValue={story.ref}
          kind="issue"
          slots={[{ key: 'issueExploration', prefix: 'issuemap', draft }]}
        />
      ) : null}
      <IssueExportMenu story={story} draft={draft} />
    </>
  )
}

export async function JourneySection({
  story,
  mapPromise,
  relayoutAction,
  onFirstEdit,
}: SectionProps) {
  const draft = await mapPromise
  const aiDrafted = draft.nodes.some((n) => n.provenance === 'ai')
  return (
    <section>
      <div className="section-head">
        <h2>Journey map</h2>
        <span className="provenance">
          {aiDrafted
            ? 'AI-drafted from the issue and its pull requests — dashed nodes are unconfirmed, every node is yours to edit'
            : 'assembled from evidence — no AI; dashed nodes are unconfirmed, every node is yours to edit'}
        </span>
      </div>
      <MapEditor
        draft={draft}
        storageKey={`journeymap:${story.ref.owner}/${story.ref.repo}/${story.ref.number}`}
        relayoutAction={relayoutAction}
        onFirstEdit={onFirstEdit}
      />
    </section>
  )
}

export async function IssueExplorationSection({
  story,
  mapPromise,
  relayoutAction,
  onFirstEdit,
}: SectionProps) {
  const draft = await mapPromise
  // Honest provenance labeling (SPEC_V0.1 §3.5): say whether a model drafted
  // this or it was assembled from evidence alone.
  const aiDrafted = draft.nodes.some((n) => n.provenance === 'ai')
  return (
    <section>
      <div className="section-head">
        <h2>Issue exploration map</h2>
        <span className="provenance">
          {aiDrafted
            ? 'AI-drafted from the evidence — dashed nodes are unconfirmed, every node is yours to edit'
            : 'assembled from evidence — no AI; dashed nodes are unconfirmed, every node is yours to edit'}
        </span>
      </div>
      <MapEditor
        draft={draft}
        storageKey={`issuemap:${story.ref.owner}/${story.ref.repo}/${story.ref.number}`}
        relayoutAction={relayoutAction}
        onFirstEdit={onFirstEdit}
      />
    </section>
  )
}
