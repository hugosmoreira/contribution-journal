# Contribution Journal

**Turn a pull request into a story people can follow.**

> GitHub records what you did. This is where you learn from it.

Paste a public GitHub pull request URL. The timeline appears in a couple of seconds and the drafted maps stream in behind it — longer on a big pull request, because a model is writing them. What you get is an editable, evidence-linked visual story of that contribution: what the problem was, what you tried, what the reviewers pushed back on, and what actually shipped. Every node links to the comment, commit, or review that supports it. Publish it as a link, or export it.

Built for people whose code is increasingly written by AI agents — where the work is real but the *understanding* has to be reconstructed afterwards.

---

## What it produces

Three diagrams from one URL:

| Diagram | What it shows | Where it comes from |
|---|---|---|
| **Contribution timeline** | Opened → commits → CI → review → approval → merged | Evidence only. No AI involved. |
| **Problem → solution map** | Symptom → hypotheses → root cause → fix → validation → outcome | AI-drafted from the evidence, fully editable |
| **Review evolution map** | Maintainer feedback → your reading of it → the change → the lesson | AI-drafted from the evidence, fully editable |

Every drafted node renders dashed until you confirm or edit it, and a node with no linked evidence is flagged as inferred. **The tool never claims to know something the evidence does not show** — where the record is silent, the draft asks you a question instead of inventing an answer.

Export to Markdown (with embedded Mermaid), JSON, or standalone SVG. Publish to an unlisted or public page with a generated preview image.

## Or let your agent do it

If you build with a coding agent, you should not have to paste anything. [`packages/mcp`](packages/mcp/README.md) is an MCP server your agent connects to; when it finishes a pull request it calls one tool and the story is waiting for you.

The agent can also pass along what the public record cannot hold — the approach it abandoned, what failed first, why one design won. That context becomes nodes labelled **AGENT**, kept visually distinct and carrying no evidence link, because an agent's account of its own work is a claim rather than proof. Capture never publishes; the story stays private until you decide otherwise.

---

## Quick start

Requirements: Node 20+, Docker (for the dev database).

```bash
git clone https://github.com/hugosmoreira/contribution-journal.git && cd contribution-journal
npm install
cp apps/web/.env.example apps/web/.env.local   # DATABASE_URL is pre-filled
docker compose up -d          # dev Postgres on port 5544
npm run push -w packages/db   # apply the schema
npm run dev                   # http://localhost:3000
```

Paste any public pull request URL and you have a story. Nothing else is required — no account, no API key.

### Optional configuration

Everything below is optional and already listed, with comments, in
[`apps/web/.env.example`](apps/web/.env.example) — the file you copied above.
The ones most people want:

```bash
GITHUB_TOKEN=...              # raises GitHub imports from 60 to 5,000 req/hr
ANTHROPIC_API_KEY=...         # AI-drafted maps; without it you get evidence-only skeletons
GITHUB_OAUTH_CLIENT_ID=...    # GitHub sign-in (callback: /api/auth/callback)
GITHUB_OAUTH_CLIENT_SECRET=...
JOURNAL_SECRET=...            # 32+ chars: encrypts stored GitHub tokens at rest
JOURNAL_API_TOKEN=...         # 24+ chars: turns on agent capture (packages/mcp)
METRICS_SALT=...              # set in production: salts the hashed quota keys
```

To confirm an API key is actually working — rather than silently falling back
to skeleton maps — run `npm run test:live -w packages/ai`.

**The app works without every one of these.** No AI key means deterministic skeleton maps built from evidence alone — a supported mode, exercised in CI, not a degraded one (see [ADR-0003](docs/adr/0003-ai-default-path.md)).

---

## What it will not do

These are permanent product decisions, not missing features:

- **No contributor scores, rankings, or leaderboards.** Ever.
- **No recruiter-facing skill signals.** This is a learning tool, not a résumé generator.
- **No write access to your GitHub account.** Sign-in requests no OAuth scopes at all — the read-only public grant. There is no code path that can write to a repository.
- **Nothing is public by default.** Publishing is an explicit action, and unpublishing is a hard delete.

---

## Privacy and data

- Imported content is treated as untrusted data throughout. Secrets and token-shaped strings are redacted at import, before storage.
- Prompt injection is structurally prevented, not filtered: the model cites evidence by event id only, and the server resolves those ids against real events — a fabricated link cannot survive the round trip.
- Metrics store salted hashes, never raw IPs or usernames.
- Deleting your account is a hard delete: sessions, published stories, and your metric rows all go.

See [SECURITY.md](SECURITY.md) for the threat model and how to report a vulnerability.

---

## Repository layout

```
apps/web/               Next.js app (App Router)
packages/domain/        Zod schemas — the shared vocabulary
packages/github/        URL parsing, server-side import, redaction, caching
packages/visualizations/Graph model, ELK layout
packages/ai/            LearningAssistant adapters (Anthropic + null)
packages/export/        Markdown, Mermaid, SVG, JSON
packages/auth/          GitHub OAuth core (pure, no framework)
packages/mcp/           MCP server so a coding agent captures its own PRs
packages/db/            Drizzle + Postgres schema
docs/adr/               Architecture decision records
```

## Development

```bash
npx playwright install chromium   # once: the e2e and a11y suites drive a real browser

npm test        # unit tests across all packages
npm run typecheck # TypeScript, no emit
npm run dev:e2e # dev server with AI pinned to the null adapter
npm run e2e     # Playwright end-to-end checks (needs a server running)
npm run a11y    # axe-core WCAG 2.1 A/AA audit of the core flows
npm run build   # production build (stop the dev server first — they share .next)
```

`npm test` and `npm run typecheck` run on every push and pull request
([CI workflow](.github/workflows/ci.yml)), with `JOURNAL_DISABLE_AI=1` so the
no-key path is the one under test.

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Status

Version 0.1 — the "PR Story" wedge. The full roadmap (structured journal, GitHub watcher, agent capture, spaced recall) is sequenced behind evidence that people want the artifact at all. See `SPEC_V0.1.md` for the scope contract.

## License

[Apache-2.0](LICENSE).
