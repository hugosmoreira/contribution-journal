# Version 0.1 Specification — "PR Story"

**Parent document:** `OPEN_SOURCE_CONTRIBUTION_JOURNAL_SPEC.md`
**Status:** Implementable scope. This document is authoritative for version 0.1 where it conflicts with the parent spec.
**Date:** July 2026

---

# 1. Goal

> A developer pastes a public GitHub pull request URL and, in under eight minutes, produces a shareable visual story of that contribution that another engineer would actually want to read.

That is the entire version 0.1. Nothing else.

## 1.1 Why this and not the parent spec's version 0.1

The parent spec's version 0.1 (section 15) contains eight major feature areas and no shareable output. It is approximately 10–14 weeks of solo work that produces something only its author will ever see.

This version is a wedge: one artifact, done well, that carries its own distribution. The depth described in the parent spec is not abandoned — it is sequenced behind evidence that anyone wants the artifact at all.

## 1.2 The success moment

A user pastes a URL. Fifteen seconds later they are looking at an accurate, editable diagram of the problem they solved, with every node linked to the comment, commit, or review that supports it. They fix two node labels, click publish, and paste the link into a conversation.

If that moment does not land, no amount of journaling, recall scheduling, or concept graphing will save the product. Build that moment first.

---

# 2. Positioning for Version 0.1

**Public framing:**

> Turn a pull request into a story people can follow.
>
> GitHub records what you did. This is where you learn from it.

The full learning-journal positioning from parent spec section 4 is correct for version 0.3 and beyond. It is too abstract to acquire the first thousand users. Lead with the artifact; reveal the philosophy once people are inside.

---

# 3. In Scope

Each item is a hard requirement for release. Items are ordered by build sequence.

### 3.1 Import

- Accept a public GitHub pull request URL. Accept a public issue URL as a secondary path.
- Reject other URL shapes with a clear, specific message.
- All GitHub access occurs **server side**. See ADR `0001`.
- Primary fetch is a single GraphQL query covering pull request, reviews, review comments, issue comments, commits, changed file metadata, and timeline events. Check runs may use REST.
- Detect and follow a linked issue when one is referenced.
- Cache imported evidence keyed on repository, number, and head SHA. Re-import of unchanged content performs no network calls.
- Anonymous users may import without signing in, subject to a per-IP daily quota. Exceeding the quota prompts GitHub sign-in.

### 3.2 Evidence normalization

- Every imported item becomes an `EvidenceArtifact` per parent spec section 21.2, unchanged.
- Every artifact carries a stable source identity and a content hash. Re-import must not duplicate.
- Secrets and token-shaped strings are redacted at import time, before storage.
- Imported text is stored and handled as untrusted data throughout. See parent spec section 24.3.

### 3.3 The three visuals

Version 0.1 ships exactly three diagram types.

**a. Contribution timeline**
Chronological events: issue opened, first commit, PR opened, CI failure, review requested, maintainer comment, new commit, approval, merged or closed. Generated fully from evidence with no AI required.

**b. Problem-to-solution map**
Symptom → hypotheses → root cause → fix → validation → outcome, per parent spec section 12.2. AI-drafted, user-edited. Required nodes must be present or the story cannot be published.

**c. Review evolution map**
Maintainer feedback → contributor interpretation → change made → evidence after change → lesson, per parent spec section 12.6.

**Note on (c):** this replaces the architecture slice map from parent spec section 15.4. Reasons: it is the most differentiated visual in the entire parent spec, no competitor produces anything like it, it derives entirely from data already imported (reviews and subsequent commits), and it requires no static analysis or file-tree interaction. The architecture slice map is deferred to version 0.2, where it belongs — it is the most expensive of the three and the least distinctive.

### 3.4 Editing

- Every node is editable: rename, delete, add, re-link.
- Every node may be linked to one or more evidence artifacts.
- Nodes display an evidence badge; clicking it opens the source with a deep link to GitHub.
- Nodes may be marked uncertain.
- Layout is automatic (ELK) with manual override preserved.

### 3.5 Provenance display

The four-state claim model from parent spec section 10.2 is retained, but the version 0.1 surface is deliberately minimal:

- AI-generated nodes render visually distinct from user-authored nodes until confirmed.
- Editing or explicitly confirming a node marks it user-confirmed.
- A node with no linked evidence is marked inferred and is visually flagged.
- **Not in 0.1:** the full claim confirmation interface, claim categories, and the evidence ledger screen. The data model supports them; the UI does not ship yet.

### 3.6 AI drafting

- Hosted AI is on by default. No API key required from the user. See ADR `0003`.
- AI drafts the problem-to-solution map and the review evolution map from the evidence bundle.
- Every generated node must reference at least one evidence artifact or be marked inferred.
- The `LearningAssistant` adapter interface from parent spec section 14.4 is implemented, with a null adapter producing skeleton drafts, exercised in CI.
- Prompt boundary treats all imported content as data. Instructions found inside issue bodies, comments, or diffs are never executed.

### 3.7 Sharing

- Each contribution has visibility: `private` (default), `unlisted`, `public`.
- Publishing is an explicit action. Nothing is public by default.
- Public story pages are server-rendered, readable without an account, and fast.
- **Open Graph images are generated per story** — diagram preview, repository, title, outcome. This is a requirement, not polish.
- Reflections and any field marked private are excluded from the public page.

### 3.8 Export

- Markdown export following the parent spec section 23 structure, reduced to the sections that exist in 0.1.
- Mermaid blocks embedded for each diagram.
- SVG export of each diagram.
- Full JSON export of all user data.

### 3.9 Account and data control

- GitHub OAuth sign-in, read-only public scope. No write permissions.
- Anonymous drafts are claimable on sign-in.
- Hard delete of a single contribution.
- Hard delete of the entire account and all associated data.
- Tokens are stored server-side, encrypted, and never placed in browser storage.

### 3.10 Instrumentation

The five launch health metrics (the import → first edit → publish funnel, public views, and return visits) are instrumented before the first public link is shared. This is a release requirement.

---

# 4. Out of Scope for 0.1

Deferred, with destination:

| Deferred | Lands in |
|---|---|
| Structured journal editor | 0.2 |
| Evidence ledger screen | 0.2 |
| Claim confirmation interface | 0.2 |
| Explain-before-reveal coach mode | 0.2 |
| Architecture slice map | 0.2 |
| Hypothesis board | 0.2 |
| Dashboard | 0.2 |
| GitHub App and PR Context Card bot | 0.3 |
| Private repository support | 0.3 |
| Concept graph | 0.4 |
| Recall scheduling and practice queue | 0.4 |
| Validation matrix | 0.4 |
| Teach-back and confidence calibration | 0.4 |
| Teams, organizations, billing | 1.0 |
| Self-hosting documentation | 1.0 |
| GitLab and Forgejo adapters | 1.0 |

Everything in parent spec section 16 remains prohibited, unchanged.

**Additionally prohibited, permanently:** contributor scores, volume rankings, recruiter-facing skill signals.

---

# 5. Architecture

## 5.1 Revised stack

Unchanged from parent spec section 18.2 except where noted.

```
Next.js (App Router) + React + TypeScript
Zod for schema validation
pnpm workspaces + Turborepo
Octokit — GraphQL primary, REST for check runs
PostgreSQL + Drizzle ORM          [changed: was IndexedDB-only]
React Flow (XYFlow) + ELK.js for editable graphs
Mermaid for export only            [changed: not a rendering path]
Vitest + Playwright
Tailwind CSS
```

Three deliberate simplifications:

- **Mermaid is export-only.** Rendering, editing, and layout are React Flow plus ELK. Maintaining two rendering paths for the same diagram is not worth it at this stage.
- **No Markdown editor library in 0.1.** There is no journal yet. Defer the CodeMirror/MDXEditor/Milkdown decision to 0.2.
- **IndexedDB is a resilience layer, not the system of record.** See ADR `0002`.

## 5.2 Monorepo

Reduced from parent spec section 18.1 to the packages that have content in 0.1:

```
open-source-contribution-journal/
├── apps/
│   └── web/
├── packages/
│   ├── domain/          Zod schemas, types
│   ├── github/          Import, normalization, caching
│   ├── evidence/        Provenance, hashing, redaction
│   ├── visualizations/  Graph model, layout, editors
│   ├── ai/              LearningAssistant adapters
│   ├── export/          Markdown, Mermaid, SVG, JSON
│   └── ui/              Shared components
├── docs/
│   └── adr/
├── examples/
└── [community files]
```

`packages/journal` and `packages/learning` are created when 0.2 and 0.4 begin, not before. Empty packages are cost without benefit.

## 5.3 Data model deltas

The parent spec's section 21 domain model is adopted essentially unchanged. Two additions required by this version:

```ts
// Multi-tenancy boundary present from day one, single-tenant in 0.1.
// Required so the Path B pivot is a configuration change, not a migration.
interface Contribution {
  // ...all fields from parent spec §21.1
  orgId: string | null;        // null = personal
  shareSlug?: string;          // set on first publish, stable forever
}
```

```ts
// Cache identity for import idempotency
interface ImportSnapshot {
  id: string;
  repositoryId: string;
  itemNumber: number;
  headSha: string;
  fetchedAt: string;
  etag?: string;
  evidenceIds: string[];
}
```

`orgId` costs nothing now and prevents a painful migration later. Do not omit it.

---

# 6. Definition of Done

Version 0.1 ships when:

1. A user pastes a public GitHub pull request URL and an import completes in under 20 seconds.
2. Import is idempotent — re-importing produces no duplicate evidence.
3. The contribution timeline renders accurately from evidence with no AI involvement.
4. The problem-to-solution map and review evolution map are AI-drafted and fully editable.
5. Every node can be linked to evidence, and every evidence badge deep-links to GitHub.
6. AI-generated content is visually distinguishable from confirmed content.
7. A story can be published to a public URL that renders without an account.
8. Public story pages produce a correct Open Graph image.
9. Markdown, Mermaid, SVG, and JSON export all work.
10. A user can hard-delete a contribution and hard-delete their entire account.
11. Anonymous import works within quota; exceeding quota prompts sign-in cleanly.
12. No GitHub write permission is requested anywhere.
13. Imported content cannot inject instructions into the AI layer — covered by a test.
14. Markdown and SVG rendering are sanitized — covered by a test.
15. Rate limit exhaustion degrades gracefully with an accurate message.
16. The five launch health metrics are instrumented.
17. Five real contributions from the dogfood set are imported, completed, and published.
18. Core flows pass automated accessibility checks.
19. Repository includes README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, LICENSE, CHANGELOG, and the three ADRs.

Items 17 and 19 are not optional. The published stories are the launch.

---

# 7. Build Sequence

Estimates assume one person at roughly 25–30 focused hours per week. Halve the weekly rate and double the calendar if this is evenings-and-weekends work.

### Week 1 — Foundation and import

Monorepo, Zod domain schemas, GitHub URL parser, GraphQL import query, evidence normalization with content hashing and secret redaction, Postgres schema, import caching. Fixture-driven tests against recorded GitHub payloads.

**Milestone:** a URL produces a complete, deduplicated evidence set in the database.

### Week 2 — Timeline and graph infrastructure

React Flow plus ELK graph editor, node and edge model, evidence linking, evidence badges with GitHub deep links, contribution timeline generated from evidence. No AI yet.

**Milestone:** an imported PR renders an accurate, editable timeline.

### Week 3 — AI drafting

`LearningAssistant` interface, one hosted provider, null adapter, prompt boundary with untrusted-input handling, problem-to-solution map drafting, review evolution map drafting, provenance labeling, inferred-node flagging.

**Milestone:** a URL produces two useful drafted maps in under 20 seconds.

### Week 4 — Publish and export

Visibility model, publish flow, server-rendered public story pages, Open Graph image generation, Markdown/Mermaid/SVG/JSON export, account deletion, instrumentation.

**Milestone:** a story can be shared as a link that looks good pasted into a conversation.

### Week 5 — Dogfood, harden, launch

Import and publish the five dogfood contributions. Fix what they reveal — this will be more than expected, and this week's real purpose is to absorb that. Accessibility pass, security tests, rate limit degradation, community files, ADRs, README.

**Milestone:** version 0.1 released with five published example stories.

**Realistic total: 5–7 weeks.** Treat week 5 as elastic; it is where the product actually becomes good.

---

# 8. Risks

| Risk | Mitigation |
|---|---|
| AI-drafted maps are inaccurate enough to feel useless | Week 3 is validated against the five dogfood PRs before proceeding. If drafts are consistently wrong, ship editing-first with skeleton drafts instead of abandoning the release. |
| Nobody shares the artifact | Measured directly (share rate, target > 25%). If below 10%, the artifact is the problem — fix it before building 0.2. |
| GitHub rate limits under anonymous load | Server-side caching, conditional requests, per-IP quota. See ADR `0001`. |
| Import completeness varies wildly across repositories | Dogfood set deliberately spans different repository conventions per parent spec section 29. |
| Scope creep back toward the parent spec | Section 4 of this document is a contract. Anything not in section 3 waits. |
| Prompt injection from imported content | Strict data boundary, no tool access in the drafting path, explicit test coverage. |

---

# 9. What Success Looks Like at 0.1

Not revenue. Not stars. Specifically:

- Five published stories that you would send to a hiring manager without hedging.
- Median time-to-published-story under eight minutes.
- At least a quarter of completed stories getting published.
- At least one person you have never met importing a second pull request.

That last one is the signal that this is a product rather than a personal tool. Everything in 0.2 and beyond is contingent on it.
