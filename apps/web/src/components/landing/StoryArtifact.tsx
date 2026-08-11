import {
  Chip,
  IconAsterisk,
  IconCheck,
  IconCommit,
  IconComment,
  IconLink,
  IconMerge,
  IconPr,
} from './icons'

// The hero strip and the product-demonstration card. Both are illustrative
// compositions built from the REAL product language (a pull-request-only
// story: the app does not read issues yet — that is v0.2). Content is a
// worked example, labeled as such where it renders.

const GLIMPSE_STEPS: Array<{ label: string; tone?: 'amber' | 'green' | 'blue' }> = [
  { label: 'PR opened' },
  { label: 'Problem described' },
  { label: 'Approaches weighed' },
  { label: 'Review feedback', tone: 'amber' },
  { label: 'Solution revised' },
  { label: 'Checks passed', tone: 'green' },
  { label: 'Merged', tone: 'green' },
  { label: 'Lesson recorded', tone: 'blue' },
]

export function GlimpseStrip() {
  return (
    <div className="lp-glimpse">
      <div className="lp-glimpse-head">
        <span className="lp-glimpse-title">From URL to lesson — one story, eight steps</span>
        <span className="lp-glimpse-count">
          <IconLink size={11} />
          12 evidence links
        </span>
      </div>
      <div
        className="lp-glimpse-scroll"
        role="group"
        aria-label="The eight steps of a pull-request story, in order"
        tabIndex={0}
      >
        <div className="lp-glimpse-track">
          {GLIMPSE_STEPS.map((step) => (
            <div
              key={step.label}
              className={step.tone === 'blue' ? 'lp-step lp-step--focus' : 'lp-step'}
            >
              <span
                className={step.tone ? `lp-dot lp-dot--${step.tone}` : 'lp-dot'}
                aria-hidden="true"
              />
              <div className="lp-step-label">{step.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const RAIL: Array<{ event: string; meta: string; tone?: 'amber' | 'green' | 'blue' }> = [
  { event: 'PR opened', meta: 'Mar 6 · 4 commits' },
  { event: 'Problem described', meta: 'from the PR description' },
  { event: 'Approaches weighed', meta: '2 considered · 1 rejected' },
  { event: 'Review feedback', meta: '1 blocking comment', tone: 'amber' },
  { event: 'Solution revised', meta: '2 commits in response' },
  { event: 'Checks passed', meta: '214 checks', tone: 'green' },
  { event: 'Merged', meta: 'Mar 9 · v2.41.0', tone: 'green' },
  { event: 'Lesson recorded', meta: 'confirmed by you', tone: 'blue' },
]

export function StoryArtifact() {
  return (
    <>
      <article className="lp-artifact" aria-label="Example of a finished learning story">
        <div className="lp-artifact-head">
          <div>
            <div className="lp-chip-row">
              <Chip icon={null}>acme/relay</Chip>
              <Chip kind="evidence" icon={<IconPr size={11} />}>
                PR #4907
              </Chip>
              <Chip kind="confirmed" icon={<IconMerge size={11} />}>
                Merged
              </Chip>
            </div>
            <h3 className="lp-artifact-title">
              Duplicate webhook deliveries under overlapping retries
            </h3>
          </div>
          <div className="lp-legend">
            <span className="lp-legend-row">
              <Chip kind="evidence">Evidence</Chip> links to the GitHub source
            </span>
            <span className="lp-legend-row">
              <Chip kind="confirmed">Confirmed</Chip> verified by a person
            </span>
            <span className="lp-legend-row">
              <Chip kind="draft">AI draft</Chip> awaiting your review
            </span>
          </div>
        </div>

        <div className="lp-artifact-body">
          <div className="lp-artifact-rail">
            <div className="lp-rail-title">Timeline</div>
            <div className="lp-rail">
              {RAIL.map((item) => (
                <div key={item.event} className="lp-rail-item">
                  <span
                    className={item.tone ? `lp-dot lp-dot--${item.tone}` : 'lp-dot'}
                    aria-hidden="true"
                  />
                  <div className="lp-rail-event">{item.event}</div>
                  <div className="lp-rail-meta">{item.meta}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lp-artifact-main">
            <section aria-label="Part one: the problem">
              <div className="lp-part-head">
                <span className="lp-part-num">01</span>
                <h4>The problem</h4>
              </div>
              <p className="lp-part-text">
                Customers behind flaky networks received the same webhook two or three times.
                Retries fired while the original delivery was still in flight — and nothing
                deduplicated them.
              </p>
              <div className="lp-chip-row">
                <Chip kind="evidence">PR #4907</Chip>
                <Chip kind="evidence" icon={<IconComment size={10} />}>
                  3 linked reports
                </Chip>
              </div>
            </section>

            <section aria-label="Part two: approaches considered">
              <div className="lp-part-head">
                <span className="lp-part-num">02</span>
                <h4>Approaches considered</h4>
              </div>
              <div className="lp-options">
                <div className="lp-option">
                  <div className="lp-option-head">
                    <span className="lp-option-name">In-memory delivery lock</span>
                    <Chip kind="rejected">Rejected</Chip>
                  </div>
                  <p>
                    A mutex in the worker dies with the worker. Two nodes, two locks — the
                    duplicate survives.
                  </p>
                </div>
                <div className="lp-option lp-option--chosen">
                  <div className="lp-option-head">
                    <span className="lp-option-name">Persisted idempotency key</span>
                    <Chip kind="confirmed">Chosen</Chip>
                  </div>
                  <p>A unique constraint the database enforces survives crashes and scale-out alike.</p>
                </div>
              </div>
            </section>

            <section aria-label="Part three: what the review changed">
              <div className="lp-part-head">
                <span className="lp-part-num">03</span>
                <h4>What the review changed</h4>
              </div>
              <blockquote className="lp-quote">
                <p>
                  “The unique index alone doesn’t close the window. If we crash between insert
                  and send, the retry still slips through — make the state write and the send
                  share one transaction.”
                </p>
                <div className="lp-quote-by">@priya — requested changes</div>
              </blockquote>
              <p className="lp-part-text">
                In response: delivery state moved into the send transaction; an outbox status
                column added.
              </p>
              <div className="lp-chip-row">
                <Chip kind="evidence" icon={<IconComment size={10} />}>
                  review thread
                </Chip>
                <Chip kind="evidence" icon={<IconCommit size={10} />}>
                  9f3c2e1
                </Chip>
              </div>
            </section>

            <section aria-label="Part four: the lesson">
              <div className="lp-part-head">
                <span className="lp-part-num">04</span>
                <h4>The lesson</h4>
              </div>
              <div className="lp-lesson">
                <p>
                  Deduplicate in storage, not in memory. A constraint the database enforces
                  survives every crash your code doesn’t.
                </p>
                <div className="lp-chip-row">
                  <Chip kind="confirmed" icon={<IconCheck size={10} />}>
                    Confirmed by you
                  </Chip>
                  <Chip kind="draft" icon={<IconAsterisk size={10} />}>
                    Draft rationale — review pending
                  </Chip>
                </div>
              </div>
            </section>
          </div>
        </div>
      </article>
      <p className="lp-caption">
        Illustrative story. Create your own from any public pull request.
      </p>
    </>
  )
}
