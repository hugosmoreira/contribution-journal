# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Version 0.1 is feature-complete and pre-release. Remaining before tagging
`0.1.0`: five dogfood contributions imported, completed, and published
(`SPEC_V0.1.md` §6, item 17).

### Added

- **Import and timeline.** Paste a public GitHub pull request URL for a
  server-side import (paginated REST, secret redaction at import time, file
  cache keyed on ref and head SHA) that renders an accurate contribution
  timeline built from evidence alone — no AI involved.
- **Problem → solution map.** An editable React Flow graph with server-side
  ELK auto-layout and a deterministic chain-layout fallback. Nodes can be
  renamed, added, deleted, reconnected, marked uncertain, and linked to
  evidence; every evidence badge deep-links to GitHub. Manual positions are
  preserved.
- **Review evolution map.** Maintainer feedback → contributor interpretation →
  the change made → the lesson, derived per review thread. Replaces the parent
  spec's architecture-slice map for 0.1.
- **AI drafting.** `LearningAssistant` adapter with an Anthropic provider
  (`claude-opus-5`, structured outputs) and a null adapter exercised in CI.
  The model cites evidence by event id only and the server resolves those ids
  against real events, so fabricated links are structurally impossible. Drafts
  are disk-cached and fall back to skeletons on any failure, including refusal.
- **Provenance display.** Drafted nodes render dashed and unconfirmed until a
  human edits or confirms them; nodes with no linked evidence are flagged as
  inferred. Page chips state honestly whether a model drafted the map or it was
  assembled from evidence alone.
- **Publish and share.** Explicit publish to `private` / `unlisted` / `public`,
  server-rendered public pages at `/s/[slug]`, per-story Open Graph images, and
  unpublish as a hard delete. The story is re-imported server-side on publish,
  so a client can supply only its edited maps — never a forged story.
- **Export.** Markdown with embedded Mermaid, full JSON, and standalone SVG for
  all three diagrams. Exports run client-side, so they include your edits.
- **GitHub sign-in.** OAuth with **no scopes requested** (the read-only public
  grant), state-nonce CSRF protection, httpOnly session cookies stored only as
  hashes, and optional AES-256-GCM encryption of access tokens at rest.
- **Ownership and claiming.** Anonymous publishes are controlled by a per-browser
  ownership token and attach silently to your account when you sign in. A
  signed-in user whose GitHub login matches the server-imported pull request
  author can **claim a story a stranger published**, which invalidates the
  squatter's token.
- **Account deletion.** A hard delete cascading to sessions, owned published
  stories, and the account's own metric rows.
- **Quotas and metrics.** Daily import and publish allowances — per IP when
  anonymous, per account when signed in, with the anonymous limit prompting
  sign-in. The five launch health metrics are instrumented with salted
  hashes and no PII; `node scripts/metrics-report.mjs`
  prints the funnel against its targets.
- **Accessibility.** `npm run a11y` runs an axe-core WCAG 2.1 A/AA audit over
  the home page, the story editor (including the node inspector), and a
  published public page. All flows pass.
- **Community files and ADRs.** README, CONTRIBUTING, CODE_OF_CONDUCT,
  SECURITY, LICENSE (Apache-2.0), this changelog, and three architecture
  decision records covering GitHub import, persistence, and the AI default path.

- **Agent capture over MCP.** `packages/mcp` is a stdio MCP server exposing
  `capture_pull_request` and `list_recent_stories`, so a coding agent turns the
  pull request it just finished into a story without anyone pasting a URL. It
  calls the app's token-authenticated `POST /api/capture`, which runs the same
  import and drafting path as the web page and warms its cache, so the story is
  ready the moment its author opens the link. Capture never publishes —
  publishing remains an explicit human action.
- **Agent-reported context, honestly labelled.** Captures may carry `notes`
  describing what the public record cannot show: the approach that was
  abandoned, what failed first, why a design won. These get their own
  provenance, `agent` — rendered amber and labelled AGENT in the editor,
  flagged as unverified in Markdown and SVG exports, and never given an
  evidence link, because nothing public backs them. A node grounded in the
  GitHub record keeps its evidence and stays `ai`, so the new label can never
  hide real grounding. Notes persist alongside the story so the page drafts
  with the same context the capture used, and a map the author has already
  edited always wins over a re-capture.

### Fixed

- **The story no longer waits on the AI.** The page streams: the header and
  contribution timeline render as soon as the GitHub import lands, and each map
  arrives independently behind its own placeholder. On a 98-event pull request
  this moved first paint from 48 seconds to 2.5.
- **The review evolution map no longer disappears on projects that review in
  the comment thread.** It was gated on formal review events only, so
  repositories like rust-lang/rust and python/cpython — where maintainers leave
  substantive feedback as ordinary pull-request comments — produced no map at
  all. Non-author, non-bot comments now count as feedback.
- **Re-opening a story no longer consumes the daily import allowance.** The
  quota counted every page view even when the story and its drafts came
  entirely from cache, so working on one story could lock you out. It now
  counts distinct stories per day; metric events are still recorded on every
  view, so the funnel numbers are unchanged.
- Accessibility: raised the `--faint` token from `#5b6478` to `#808a9c`, which
  was failing WCAG AA contrast (3.07:1) for 11px evidence links and node flags,
  and gave the visibility selector an accessible name.

### Security

- Imported content is treated as untrusted data end to end; URLs are gated by
  schema to `github.com` HTTPS before reaching any `href`, Markdown link, or
  exported SVG.
- Prompt injection, Markdown sanitization, and SVG sanitization are each pinned
  by tests rather than by review attention.
- Graph size caps bound the synchronous server-side ELK layout — an unbounded
  client-supplied graph would otherwise be a CPU exhaustion vector.
- Anonymous abuse is bounded by per-IP publish limits, a global row cap, a byte
  ceiling on client-supplied maps, and an admin takedown token.
