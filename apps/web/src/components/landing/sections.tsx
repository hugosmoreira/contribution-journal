import {
  ArrowUp,
  Chip,
  IconCheck,
  IconCommit,
  IconComment,
  IconIssue,
  IconLock,
  IconMerge,
  IconPr,
} from './icons'

// The middle sections of the landing page. Server components, no client JS.
// Honesty rules baked in: pull requests are the product TODAY; everything
// about issues lives in the clearly-badged "Coming in v0.2" section.

export function HumanProblem() {
  return (
    <section className="lp-section lp-band" aria-labelledby="problem-h">
      <div className="lp-container">
        <p className="lp-kicker">The human problem</p>
        <h2 id="problem-h" className="lp-h2" style={{ maxWidth: '19ch' }}>
          Software is being produced <em>faster than people can understand it.</em>
        </h2>
        <div className="lp-problem-grid">
          <div className="lp-problem-item">
            <h3>Activity is preserved. Understanding is not.</h3>
            <p>
              GitHub records every event, forever. The reasoning that connects those events
              lives in people’s heads — and it leaves when they do.
            </p>
          </div>
          <div className="lp-problem-item">
            <h3>Working code can skip the learning.</h3>
            <p>
              An AI agent can close an issue without anyone on the team understanding why the
              fix is right. The knowledge was never transferred, because it was never held.
            </p>
          </div>
          <div className="lp-problem-item">
            <h3>The reasoning is scattered.</h3>
            <p>
              Why a change happened is split across an issue thread, four review comments, a
              commit message and a CI log. Nobody reads all of it twice.
            </p>
          </div>
          <div className="lp-problem-item">
            <h3>Work ends unexplained.</h3>
            <p>
              Contributors finish real work they cannot yet explain — which means they cannot
              reuse it, teach it, or defend it.
            </p>
          </div>
        </div>

        <div className="lp-stack">
          <p className="lp-vh">
            GitHub activity flows into Contribution Journal, the learning layer, which turns
            it into human understanding.
          </p>
          <div className="lp-stack-row">
            <strong>Human understanding</strong>
            <span>what you can explain and reuse</span>
          </div>
          <div className="lp-stack-arrow" aria-hidden="true">
            <ArrowUp />
          </div>
          <div className="lp-stack-row lp-stack-row--hi">
            <strong>Contribution Journal — the learning layer</strong>
            <span>evidence in, understanding out</span>
          </div>
          <div className="lp-stack-arrow" aria-hidden="true">
            <ArrowUp />
          </div>
          <div className="lp-stack-row">
            <strong>GitHub activity</strong>
            <span>comments · commits · reviews · checks</span>
          </div>
        </div>
        <p className="lp-note" style={{ marginTop: 32 }}>
          None of this is an argument against AI. It is the reason understanding now has to be
          deliberate.
        </p>
      </div>
    </section>
  )
}

export function HowItWorks() {
  return (
    <section className="lp-section" id="how-it-works" aria-labelledby="how-h">
      <div className="lp-container">
        <p className="lp-kicker">How it works</p>
        <h2 id="how-h" className="lp-h2">
          Three steps from URL to understanding.
        </h2>
        <div className="lp-how-grid">
          <div>
            <div className="lp-step-num" aria-hidden="true">
              01
            </div>
            <h3>Paste</h3>
            <p className="lp-how-text">Paste a link to any public pull request or issue.</p>
            <div className="lp-mini">
              <div className="lp-mini-label">GitHub URL</div>
              <div className="lp-mini-url">github.com/lumen-ui/lumen/pull/2287</div>
              <div className="lp-chip-row">
                <Chip kind="confirmed">Detected: public pull request</Chip>
              </div>
            </div>
          </div>
          <div>
            <div className="lp-step-num" aria-hidden="true">
              02
            </div>
            <h3>Understand</h3>
            <p className="lp-how-text">
              Explore the problem, the approaches, the review and the outcome — every claim
              linked to its evidence.
            </p>
            <div className="lp-mini">
              <div className="lp-mini-row">
                <span className="lp-mini-row-name">
                  <span className="lp-dot" aria-hidden="true" />
                  Problem
                </span>
                <span className="lp-mini-row-meta">from the description</span>
              </div>
              <div className="lp-mini-row">
                <span className="lp-mini-row-name">
                  <span className="lp-dot" aria-hidden="true" />
                  Implementation
                </span>
                <span className="lp-mini-row-meta">6 commits</span>
              </div>
              <div className="lp-mini-row lp-mini-row--amber">
                <span className="lp-mini-row-name">
                  <span className="lp-dot lp-dot--amber" aria-hidden="true" />
                  Review
                </span>
                <span className="lp-mini-row-meta">1 blocking</span>
              </div>
              <div className="lp-mini-row">
                <span className="lp-mini-row-name">
                  <span className="lp-dot" aria-hidden="true" />
                  Revisions
                </span>
                <span className="lp-mini-row-meta">2 commits</span>
              </div>
              <div className="lp-mini-row lp-mini-row--green">
                <span className="lp-mini-row-name">
                  <span className="lp-dot lp-dot--green" aria-hidden="true" />
                  Outcome
                </span>
                <span className="lp-mini-row-meta">merged</span>
              </div>
            </div>
          </div>
          <div>
            <div className="lp-step-num" aria-hidden="true">
              03
            </div>
            <h3>Make it yours</h3>
            <p className="lp-how-text">
              Correct the draft, confirm what’s true, record the lesson — then export or
              publish if you want.
            </p>
            <div className="lp-mini">
              <div className="lp-mini-edit">
                <del>the backoff was misconfigured</del>{' '}
                <strong>retries overlapped by design</strong>
              </div>
              <div className="lp-chip-row">
                <Chip kind="confirmed">Corrected by you</Chip>
                <Chip kind="evidence">12 evidence links</Chip>
              </div>
              <div className="lp-mini-foot">
                <span>Visibility</span>
                <Chip kind="ink" icon={<IconLock size={10} />}>
                  Private — share when ready
                </Chip>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function ComingNext() {
  return (
    <section className="lp-section" id="coming-next" aria-labelledby="next-h">
      <div className="lp-container">
        <div className="lp-kicker-row">
          <p className="lp-kicker">Coming next</p>
          <Chip kind="inferred">v0.2 — in development, not released</Chip>
        </div>
        <h2 id="next-h" className="lp-h2">
          An issue and a pull request are <em>halves of the same story.</em>
        </h2>
        <p className="lp-lede">
          Contribution Journal reads pull requests — and now issues too, each as its own
          story. Next, it joins both halves into one: context → discussion → approaches →
          implementation → review → validation → lesson.
        </p>

        <div className="lp-entry-grid">
          <div className="lp-entry">
            <div className="lp-entry-head">
              <IconIssue size={17} strokeWidth={2} />
              <strong>Issue</strong>
              <span>where the why lives</span>
            </div>
            <div className="lp-entry-list">
              {['Problem', 'Context', 'Affected users', 'Discussion', 'Constraints', 'Proposed approaches', 'Open questions'].map(
                (item) => (
                  <div key={item} className="lp-entry-item">
                    <i aria-hidden="true" />
                    {item}
                  </div>
                ),
              )}
            </div>
          </div>
          <div className="lp-entry lp-entry--pr">
            <div className="lp-entry-head">
              <IconPr size={17} strokeWidth={2} />
              <strong>Pull request</strong>
              <span>where the how lives</span>
            </div>
            <div className="lp-entry-list">
              {['Implementation', 'Commits', 'Review feedback', 'Revisions', 'Tests', 'Validation', 'Outcome'].map(
                (item) => (
                  <div key={item} className="lp-entry-item">
                    <i aria-hidden="true" />
                    {item}
                  </div>
                ),
              )}
            </div>
          </div>
        </div>

        <div className="lp-merge-lines" aria-hidden="true">
          <svg width="100%" height="92" viewBox="0 0 1000 92" preserveAspectRatio="none">
            <path
              d="M250 0 V38 H750 V0"
              fill="none"
              stroke="rgba(125,177,255,0.45)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M500 38 V92"
              fill="none"
              stroke="rgba(125,177,255,0.45)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span className="lp-merge-node" />
        </div>
        <div className="lp-merge-result">
          <h3>One evidence-backed learning story.</h3>
          <div className="lp-chip-row">
            <Chip kind="inferred">Arriving in v0.2</Chip>
            <Chip kind="evidence">every step evidence-linked</Chip>
          </div>
        </div>
        <p className="lp-note" style={{ marginTop: 24 }}>
          Issue links already work — paste one and you get the issue&apos;s own story, with
          its linked pull requests one click away. The joined view is what&apos;s coming.
        </p>
      </div>
    </section>
  )
}

export function Trust() {
  return (
    <section className="lp-section" id="trust" aria-labelledby="trust-h">
      <div className="lp-container">
        <p className="lp-kicker">Trust &amp; provenance</p>
        <h2 id="trust-h" className="lp-h2">
          Every claim can show its receipt.
        </h2>
        <div className="lp-card-grid">
          <div className="lp-card">
            <h3 className="lp-card-title">Claims link to evidence</h3>
            <p className="lp-card-demo">
              Retries fired while delivery was in flight{' '}
              <span className="lp-chip-inline">PR #4907 · c7</span>
            </p>
            <p className="lp-card-note">
              Every factual sentence can point at the commit, comment, review or check it came
              from — one click back to GitHub.
            </p>
          </div>
          <div className="lp-card">
            <h3 className="lp-card-title">AI content is labeled</h3>
            <div className="lp-card-demo">
              <Chip kind="draft">AI draft — unconfirmed</Chip>
            </div>
            <p className="lp-card-note">
              Drafts stay visibly dashed and labeled until a person edits or confirms them.
              What was read and what was reasoned never blur together.
            </p>
          </div>
          <div className="lp-card">
            <h3 className="lp-card-title">You can correct every draft</h3>
            <p className="lp-card-demo">
              <del>a caching bug</del> <strong>a delivery-dedup gap</strong>{' '}
              <span className="lp-chip-inline" style={{ borderColor: 'rgba(91,208,139,0.45)', color: 'var(--lp-green-text)' }}>
                Corrected
              </span>
            </p>
            <p className="lp-card-note">
              Your corrections outrank the draft — and the story records that a person
              checked.
            </p>
          </div>
          <div className="lp-card">
            <h3 className="lp-card-title">
              <IconLock size={15} strokeWidth={2} />
              Read-only by design
            </h3>
            <p className="lp-card-note">
              Contribution Journal reads public GitHub activity. It cannot write, comment,
              open PRs, or touch your repositories. There is no write permission to grant.
            </p>
          </div>
          <div className="lp-card">
            <h3 className="lp-card-title">Nothing public by default</h3>
            <div className="lp-card-demo">
              <Chip kind="ink" icon={<IconLock size={10} />}>
                Private — share when ready
              </Chip>
            </div>
            <p className="lp-card-note">
              Your edits stay in your browser until you publish. Publishing is a decision you
              make, story by story.
            </p>
          </div>
          <div className="lp-card">
            <h3 className="lp-card-title">Yours to delete</h3>
            <div className="lp-card-demo">
              <Chip kind="rejected">Unpublish</Chip>
            </div>
            <p className="lp-card-note">
              Unpublish a story and the share link stops working immediately. What you made is
              yours to keep — or remove.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export function AccessibilitySection() {
  return (
    <section className="lp-section lp-band" id="accessibility" aria-labelledby="a11y-h">
      <div className="lp-container">
        <p className="lp-kicker">Accessibility</p>
        <h2 id="a11y-h" className="lp-h2">
          Understanding should not depend on how someone{' '}
          <em>sees, moves, reads or processes</em> information.
        </h2>
        <p className="lp-lede">
          Stories are built from text. The map is a view of that text — every node is written,
          edited and labeled as plain language, and the timeline reads top to bottom like a
          document.
        </p>

        <div className="lp-a11y-grid">
          <div className="lp-card lp-card--panel">
            <div className="lp-mini-label" style={{ marginBottom: 22 }}>
              The same story, as a map
            </div>
            <div
              className="lp-map-demo"
              role="group"
              aria-label="The story as a map: problem, two approaches, focus stack, merged"
              tabIndex={0}
            >
              <span className="lp-map-node">Problem</span>
              <span className="lp-map-edge" aria-hidden="true" />
              <span className="lp-map-node">Two approaches</span>
              <span className="lp-map-edge" aria-hidden="true" />
              <span className="lp-map-node lp-map-node--active">Focus stack</span>
              <span className="lp-map-edge" aria-hidden="true" />
              <span className="lp-map-node lp-map-node--merged">Merged</span>
            </div>
            <div className="lp-map-branch">
              <Chip kind="rejected">Sentinels — rejected: doubled tab stops</Chip>
            </div>
          </div>
          <div className="lp-card lp-card--panel">
            <div className="lp-mini-label" style={{ marginBottom: 16 }}>
              The same story, as structured text
            </div>
            <ol className="lp-a11y-list">
              <li>Problem: focus escaped the nested dialog.</li>
              <li>
                Two approaches were considered.
                <ol>
                  <li>Sentinel elements — rejected: doubled tab stops.</li>
                  <li>A focus stack — chosen.</li>
                </ol>
              </li>
              <li>The focus stack was implemented and merged.</li>
            </ol>
          </div>
        </div>

        <div className="lp-checklist">
          {[
            'The timeline in every story is real chronological text',
            'Visible labels on every input — never placeholder-only',
            'No meaning carried by color alone: every state pairs a shape with a written label',
            'Full keyboard operation of this page, with obvious focus states',
            'Text and control contrast checked against WCAG 2.2 AA',
            'Motion respects prefers-reduced-motion — nothing autoplays',
            'Reflows cleanly at 200% zoom and on 375px screens',
          ].map((claim) => (
            <span key={claim} className="lp-check">
              <IconCheck size={13} />
              {claim}
            </span>
          ))}
          <span className="lp-check">
            <Chip kind="inferred">v0.2</Chip>A structured-text view of every map
          </span>
        </div>
      </div>
    </section>
  )
}

export function ExampleStory() {
  return (
    <section className="lp-section" id="example" aria-labelledby="example-h">
      <div className="lp-container">
        <p className="lp-kicker">An example, end to end</p>
        <h2 id="example-h" className="lp-h2">
          Keyboard focus escapes the nested dialog.
        </h2>
        <div className="lp-chip-row" style={{ marginTop: 20 }}>
          <Chip icon={null}>lumen-ui/lumen</Chip>
          <Chip kind="evidence" icon={<IconPr size={11} />}>
            PR #2287
          </Chip>
          <Chip kind="confirmed" icon={<IconMerge size={11} />}>
            Merged
          </Chip>
        </div>

        <div className="lp-dl">
          <div className="lp-dl-row">
            <div className="lp-dl-key">The problem</div>
            <div className="lp-dl-val">
              With one dialog open above another, <kbd className="lp-kbd">Tab</kbd> moved
              focus behind the backdrop into the page. Screen-reader users lost their place
              entirely; keyboard users could not get back.{' '}
              <span className="lp-chip-inline">PR #2287</span>
            </div>
          </div>
          <div className="lp-dl-row">
            <div className="lp-dl-key">Considered</div>
            <div className="lp-dl-val">
              Sentinel elements around each dialog that bounce focus back — or a single focus
              manager that tracks open dialogs as a stack.
            </div>
          </div>
          <div className="lp-dl-row">
            <div className="lp-dl-key">Rejected, because</div>
            <div className="lp-dl-val">
              Sentinels doubled tab stops and confused screen readers — it would have traded
              one audience’s bug for another’s.{' '}
              <span
                className="lp-chip-inline"
                style={{ borderColor: 'rgba(242,109,118,0.45)', color: 'var(--lp-red-text)' }}
              >
                Rejected
              </span>{' '}
              <span className="lp-chip-inline" style={{ borderColor: 'rgba(255,255,255,0.22)', color: 'var(--lp-muted)' }}>
                comment · @osei
              </span>
            </div>
          </div>
          <div className="lp-dl-row">
            <div className="lp-dl-key">The review said</div>
            <div className="lp-dl-val">
              <blockquote className="lp-quote">
                <p>
                  “Restoring focus to the body loses the user’s place. Restore to the element
                  that opened the dialog — and test the close path, not just the open.”
                </p>
                <div className="lp-quote-by">@tan — review</div>
              </blockquote>
            </div>
          </div>
          <div className="lp-dl-row">
            <div className="lp-dl-key">What changed</div>
            <div className="lp-dl-val">
              One focus stack for the whole app: each layer records its opener, traps{' '}
              <kbd className="lp-kbd">Tab</kbd> inside the top layer, and hands focus back to
              the opener on close.{' '}
              <span className="lp-chip-inline" style={{ borderColor: 'rgba(255,255,255,0.22)', color: 'var(--lp-muted)' }}>
                4 commits · +212 −96
              </span>
            </div>
          </div>
          <div className="lp-dl-row">
            <div className="lp-dl-key">Validated by</div>
            <div className="lp-dl-val">
              A keyboard walkthrough script and an axe audit in CI; a manual pass with
              VoiceOver and NVDA.{' '}
              <span
                className="lp-chip-inline"
                style={{ borderColor: 'rgba(91,208,139,0.45)', color: 'var(--lp-green-text)' }}
              >
                CI · all checks passed
              </span>
            </div>
          </div>
          <div className="lp-dl-row">
            <div className="lp-dl-key">The lesson</div>
            <div className="lp-dl-val">
              <p className="lp-dl-lesson">
                Model modality as a stack. Every layer must know who opened it —{' '}
                <em style={{ color: '#c9d4ea' }}>focus is state, not markup.</em>
              </p>
              <Chip kind="confirmed">Confirmed by the author</Chip>
            </div>
          </div>
        </div>
        <p className="lp-caption">
          Illustrative example. Your story is built from your pull request’s real record.
        </p>
      </div>
    </section>
  )
}
