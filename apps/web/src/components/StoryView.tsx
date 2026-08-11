import Link from 'next/link'
import type { PrStory, TimelineEvent } from '@journal/domain'

const EVENT_META: Record<TimelineEvent['kind'], { label: string; dot: string }> = {
  pr_opened: { label: 'opened', dot: 'dot-opened' },
  commit: { label: 'commit', dot: 'dot-commit' },
  review_approved: { label: 'approved', dot: 'dot-approved' },
  review_changes: { label: 'changes requested', dot: 'dot-changes' },
  review_commented: { label: 'review', dot: 'dot-review' },
  comment: { label: 'comment', dot: 'dot-comment' },
  review_comment: { label: 'code comment', dot: 'dot-comment' },
  merged: { label: 'merged', dot: 'dot-merged' },
  closed: { label: 'closed', dot: 'dot-closed' },
  issue_opened: { label: 'opened', dot: 'dot-opened' },
  cross_referenced: { label: 'linked PR', dot: 'dot-commit' },
}

const dateFmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

// Intl formatters throw on Invalid Date; timestamps are schema-validated at
// import, but formatting stays defensive so one odd value never 500s the page.
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

export function StoryHeader({ story }: { story: PrStory }) {
  const opened = safeFormat(dateFmt, story.createdAt)
  const ended = story.mergedAt ?? story.closedAt
  let span = `Opened ${opened} — still open`
  if (ended) {
    const days = daysBetween(story.createdAt, ended)
    const duration = days === null ? '' : ` (${days} ${days === 1 ? 'day' : 'days'})`
    span = `Opened ${opened} → ${story.state === 'merged' ? 'Merged' : 'Closed'} ${safeFormat(dateFmt, ended)}${duration}`
  }
  const participants = new Set(
    story.events.map((e) => e.actor).filter((actor) => actor && actor !== '[unknown]'),
  ).size

  return (
    <header className="story-header">
      <div className="repo-line">
        <a href={story.url} target="_blank" rel="noreferrer" className="repo-link">
          {story.ref.owner}/{story.ref.repo} #{story.ref.number}
        </a>
        <span className={`state-badge state-${story.state}`}>{story.state}</span>
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
          <strong>{story.commitCount}</strong> {story.commitCount === 1 ? 'commit' : 'commits'}
        </li>
        <li>
          <strong>{story.changedFiles}</strong> {story.changedFiles === 1 ? 'file' : 'files'}
        </li>
        <li className="add">+{story.additions.toLocaleString()}</li>
        <li className="del">−{story.deletions.toLocaleString()}</li>
        <li>
          <strong>{participants}</strong> {participants === 1 ? 'person' : 'people'} involved
        </li>
      </ul>
      {story.linkedIssueNumbers.length > 0 ? (
        <div className="linked-prs">
          <span className="linked-prs-label">Closes:</span>
          {story.linkedIssueNumbers.slice(0, 6).map((n) => (
            <Link key={n} href={`/issue/${story.ref.owner}/${story.ref.repo}/${n}`} className="linked-pr">
              issue #{n}
            </Link>
          ))}
          <Link
            href={`/journey/${story.ref.owner}/${story.ref.repo}/${story.linkedIssueNumbers[0]}`}
            className="linked-pr linked-pr--journey"
          >
            View the full journey →
          </Link>
        </div>
      ) : null}
    </header>
  )
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="timeline">
      {events.map((event) => {
        const meta = EVENT_META[event.kind]
        return (
          <li key={event.id} className={event.kind === 'merged' || event.kind === 'closed' ? 'final' : ''}>
            <span className={`dot ${meta.dot}`} aria-hidden />
            <div className="event-body">
              <p className="event-title">
                {event.actor ? <strong>{event.actor} </strong> : null}
                {event.title}
                <span className={`chip chip-${meta.dot}`}>{meta.label}</span>
              </p>
              {event.detail ? <p className="event-detail">{event.detail}</p> : null}
              <p className="event-footer">
                <time dateTime={event.timestamp}>{safeFormat(timeFmt, event.timestamp)}</time>
                {event.origin ? (
                  <>
                    <span className="sep">·</span>
                    <span>{event.origin}</span>
                  </>
                ) : null}
                {event.url ? (
                  <>
                    <span className="sep">·</span>
                    <a href={event.url} target="_blank" rel="noreferrer">
                      evidence ↗
                    </a>
                  </>
                ) : null}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
