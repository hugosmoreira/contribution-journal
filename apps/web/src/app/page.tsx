import { redirect } from 'next/navigation'
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from 'next/font/google'
import { parseGitHubUrl } from '@journal/github'
import AuthMenu from '../components/AuthMenu'
import { IconLock, LogoMark } from '../components/landing/icons'
import { GlimpseStrip, StoryArtifact } from '../components/landing/StoryArtifact'
import {
  AccessibilitySection,
  ComingNext,
  ExampleStory,
  HowItWorks,
  HumanProblem,
  Trust,
} from '../components/landing/sections'
import './landing.css'

// Landing typography (self-hosted at build by next/font — no runtime request).
// Scoped to this page via CSS variables on the .lp root; the story editor
// keeps its existing look.
const serif = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
})
const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
})
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

// The query param carries an error CODE, never free text — reflecting
// arbitrary strings into the alert box would let crafted links put
// attacker-authored sentences in first-party UI.
const ERROR_MESSAGES: Record<string, string> = {
  empty: 'Paste a GitHub pull request or issue URL to begin.',
  not_url: "That doesn't look like a URL. Expected something like github.com/owner/repo/pull/123.",
  wrong_host: 'Only public github.com links are supported.',
  bad_name: 'That URL contains characters GitHub owners and repositories never use — check it and try again.',
  bad_number: 'The pull request or issue number in that URL is not a plain number.',
  repo_only: 'That is a repository link. Paste a specific pull request or issue, e.g. github.com/owner/repo/pull/123.',
  profile_only: 'That is a profile link. Paste a specific pull request or issue, e.g. github.com/owner/repo/pull/123.',
  unrecognized: 'Unrecognized GitHub link shape. Expected github.com/owner/repo/pull/123 or /issues/123.',
  auth_state: "Sign-in didn't complete — the security check failed. Try signing in again.",
  auth_denied: 'GitHub sign-in was cancelled — nothing changed.',
  auth_github: "Couldn't finish signing in with GitHub. Try again in a moment.",
}

async function createStory(formData: FormData) {
  'use server'
  const raw = String(formData.get('url') ?? '')
  const parsed = parseGitHubUrl(raw)
  if (!parsed.ok) {
    redirect(`/?error=${parsed.code}`)
  }
  const { owner, repo, number, kind } = parsed.ref
  redirect(kind === 'issue' ? `/issue/${owner}/${repo}/${number}` : `/story/${owner}/${repo}/${number}`)
}

function UrlForm({ inputId, describedBy }: { inputId: string; describedBy: string }) {
  return (
    <form action={createStory} className="lp-form">
      <input
        id={inputId}
        name="url"
        className="lp-input"
        type="text"
        inputMode="url"
        spellCheck={false}
        autoComplete="off"
        placeholder="https://github.com/owner/repo/pull/123"
        aria-describedby={describedBy}
      />
      <button type="submit" className="lp-btn">
        Create story
      </button>
    </form>
  )
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error
  const error = rawError
    ? (ERROR_MESSAGES[rawError] ?? 'Something went wrong with that link — try pasting a pull request URL.')
    : undefined

  return (
    <div className={`lp ${serif.variable} ${sans.variable} ${mono.variable}`}>
      <a className="lp-skip" href="#main">
        Skip to main content
      </a>

      <header>
        <nav className="lp-nav" aria-label="Primary">
          <a href="/" className="lp-brand">
            <LogoMark />
            Contribution Journal
          </a>
          <a className="lp-nav-link" href="#how-it-works">
            How it works
          </a>
          <a className="lp-nav-link" href="#example">
            Example story
          </a>
          <a className="lp-nav-link" href="#accessibility">
            Accessibility
          </a>
          <a className="lp-nav-link" href="https://github.com/hugosmoreira/contribution-journal" rel="noopener">
            GitHub
          </a>
          <AuthMenu />
          <a className="lp-btn lp-btn--nav" href="#create">
            Create a story
          </a>
        </nav>
      </header>

      <main id="main">
        <div className="lp-hero-bg" id="create">
          <section className="lp-container lp-hero" aria-labelledby="hero-h">
            <p className="lp-kicker">Evidence-backed learning stories from GitHub</p>
            <h1 id="hero-h" className="lp-display">
              <span>Understand the work,</span>
              <span>
                <em>not just the diff.</em>
              </span>
            </h1>
            <p className="lp-lede">
              Turn a GitHub pull request or issue into a visual, evidence-backed story you can
              understand, explain, and remember.
            </p>

            <div className="lp-hero-form-wrap">
              <label htmlFor="pr-url" className="lp-label">
                GitHub pull request or issue URL
              </label>
              <UrlForm inputId="pr-url" describedBy="hero-trust" />
              {error ? (
                <p className="lp-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="lp-form-row">
                <a className="lp-secondary" href="#example">
                  Explore an example →
                </a>
              </div>
              <p className="lp-trust-line" id="hero-trust">
                <IconLock size={14} />
                Works with any public pull request or issue. No sign-in required. Read-only —
                nothing is written to GitHub.
              </p>
            </div>

            <GlimpseStrip />
          </section>
        </div>

        <section className="lp-section" id="artifact" aria-labelledby="artifact-h">
          <div className="lp-container">
            <p className="lp-kicker">The artifact</p>
            <h2 id="artifact-h" className="lp-h2">
              One story, reconstructed from the record.
            </h2>
            <p className="lp-lede">
              Contribution Journal reads the pull request — every commit, comment, review and
              check — then rebuilds the work as a story a person can follow.
            </p>
            <StoryArtifact />
          </div>
        </section>

        <HumanProblem />
        <HowItWorks />
        <ComingNext />
        <Trust />
        <AccessibilitySection />
        <ExampleStory />

        <section className="lp-section lp-close-bg lp-close" id="start" aria-labelledby="close-h">
          <div className="lp-container">
            <h2 id="close-h" className="lp-display">
              <span>Your next pull request should</span>
              <span>
                leave you with <em>more than merged code.</em>
              </span>
            </h2>
            <p className="lp-lede">
              Turn the work into something you can understand, explain and remember.
            </p>
            <div className="lp-hero-form-wrap">
              <label htmlFor="pr-url-2" className="lp-label">
                GitHub pull request or issue URL
              </label>
              <UrlForm inputId="pr-url-2" describedBy="close-trust" />
              <p className="lp-trust-line" id="close-trust">
                <IconLock size={14} />
                Read-only. Evidence-linked. Nothing is published without you.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <span className="lp-brand">
            <LogoMark size={17} />
            Contribution Journal
          </span>
          <a className="lp-footer-link" href="#how-it-works">
            How it works
          </a>
          <a className="lp-footer-link" href="#example">
            Example story
          </a>
          <a className="lp-footer-link" href="#accessibility">
            Accessibility
          </a>
          <a className="lp-footer-link" href="#trust">
            Privacy &amp; trust
          </a>
          <a className="lp-footer-link" href="https://github.com/hugosmoreira/contribution-journal" rel="noopener">
            GitHub
          </a>
          <a
            className="lp-footer-link"
            href="https://www.apache.org/licenses/LICENSE-2.0"
            rel="noopener"
          >
            Apache-2.0 license
          </a>
          <span className="lp-footer-tag">read-only · evidence-linked · private by default</span>
        </div>
      </footer>
    </div>
  )
}
