# ADR 0001 — GitHub Import Architecture and Rate Limits

**Status:** Accepted — partially implemented in v0.1 (see below)
**Date:** July 2026
**Supersedes:** `OPEN_SOURCE_CONTRIBUTION_JOURNAL_SPEC.md` §18.2 (REST-first) and §20.1 (client-side public import)

## Implementation status (v0.1)

The decisions here are accepted, but one is not yet built. Stated plainly so
the document is not read as a description of the current code:

- **Built:** all GitHub access is server-side, behind one app-owned credential,
  with a shared cache keyed on repository + number + head SHA, a per-caller
  daily quota, and rate-limit exhaustion surfaced as a specific message with a
  retry time.
- **Not built:** the single-GraphQL-query import. v0.1 imports through
  **paginated REST** calls (`packages/github/src/fetch.ts`), which costs more
  requests per story than the design here intends. The server-side credential
  and cache keep that within limits for now; moving to GraphQL is a known
  migration, not a change of decision.

---

## Context

The parent spec treats GitHub authentication as an optimization: "Public GitHub resources can be read without full installation, although authentication improves rate limits" (§20.1). It also directs "REST API first, GraphQL only where it reduces request volume meaningfully" (§18.2).

Both positions are unworkable for the version 0.1 flow.

### Rate limit arithmetic

GitHub REST API limits:

| Credential | Limit |
|---|---|
| Unauthenticated | 60 requests/hour, **per IP address** |
| User OAuth token | 5,000 requests/hour, per user |
| GitHub App installation | 5,000 requests/hour minimum, scaling with installation size |

A realistic pull request import requires:

| Resource | Calls |
|---|---|
| Repository metadata | 1 |
| Pull request | 1 |
| Commits (paginated) | 1–3 |
| Changed files (paginated) | 1–5 |
| Reviews | 1–2 |
| Review comments | 1–3 |
| Issue comments | 1–3 |
| Timeline events | 1–3 |
| Check runs | 1–2 |
| Linked issue + its comments | 2–3 |
| **Total** | **≈11–26** |

Against a 60/hour unauthenticated budget, that is **two to five imports per hour, shared across every anonymous visitor behind a given IP address**. A single user demonstrating the product to a colleague would exhaust it. A link on Hacker News would exhaust it in seconds and the product would appear broken to everyone who clicked.

Anonymous import is a requirement — see `SPEC_V0.1.md` §1.2, where the first-visit experience is the entire product thesis. Therefore the rate limit must be solved architecturally rather than by requiring sign-in.

### GraphQL

The GitHub GraphQL API can retrieve the pull request, reviews, review comments, issue comments, commits, changed file metadata, and timeline events **in a single request**. Its budget is 5,000 points per hour, where a query's point cost is derived from the number of nodes requested; a well-bounded single-PR query costs on the order of 10–20 points rather than 10–26 separate REST calls against a request-count budget.

The constraint: **the GraphQL API requires authentication unconditionally.** There is no anonymous access. This forces the credential decision regardless of which API is chosen.

### Conditional requests

REST responses returning `304 Not Modified` in response to an `If-None-Match` header **do not count against the rate limit**. This makes ETag-based revalidation essentially free and is the primary mechanism for keeping refresh cost near zero.

---

## Decision

### 1. All GitHub access is server side

No GitHub API call originates from the browser, ever. This follows from the credential requirement above and independently satisfies parent spec §24.5 (never store tokens in browser storage).

### 2. GraphQL is the primary import path

A single bounded GraphQL query retrieves the pull request and its associated discussion, review, commit, file, and timeline data. REST is used only for check runs and for any resource GraphQL exposes awkwardly.

This reverses parent spec §18.2. The stated condition for using GraphQL — "where it reduces request volume meaningfully" — is precisely satisfied here: roughly 20 requests become 1.

### 3. Anonymous imports use an application-owned credential

Anonymous imports are served by an application-controlled GitHub credential, subject to:

- A per-IP daily import quota
- A global circuit breaker that degrades to a queued or cached-only mode rather than failing hard
- Cache-first resolution, so popular pull requests cost nothing after the first import

Exceeding the per-IP quota prompts GitHub sign-in with a clear explanation. It does not present an error.

### 4. Signed-in users import with their own token

After OAuth sign-in (read-only public scope), imports use the user's own token against their own 5,000/hour budget. Tokens are stored server-side, encrypted at rest, and never returned to the client.

This makes sign-in genuinely valuable to the user rather than a gate, which is the correct incentive structure.

### 5. Evidence is cached and content-addressed

Imported evidence is cached keyed on `(repositoryId, itemNumber, headSha)` with the stored ETag.

- Immutable evidence — merged pull requests, closed issues — is never refetched.
- Open items revalidate with `If-None-Match`; a `304` is free.
- Re-import produces no duplicate `EvidenceArtifact` rows, satisfying parent spec §31 B4.
- The cache is shared across users. Two people importing the same popular pull request cost one fetch.

### 6. Secondary rate limits are handled explicitly

Respect `Retry-After` and `x-ratelimit-*` headers. Exponential backoff on secondary limits. Never retry in a tight loop. Rate limit exhaustion surfaces to the user as an accurate, specific message with an expected retry time — never as a generic failure.

---

## Consequences

### Accepted costs

- **A backend is required from day one.** This reverses the parent spec's implicit client-only version 0.1 and forces ADR `0002`.
- **The application-owned credential is an abuse surface.** Quotas, a circuit breaker, and monitoring are release requirements, not follow-ups.
- **GraphQL schema coupling.** GitHub GraphQL schema changes will break imports more visibly than REST would. Mitigated by fixture-based contract tests, which the parent spec already requires (§18.2).
- **Operational cost.** Hosting plus Postgres. Negligible at expected early volume.

### Gains

- Anonymous first-visit import works, which is the entire acquisition mechanism.
- Import latency drops substantially — one round trip instead of a paginated cascade.
- The shared evidence cache becomes more valuable as usage grows.
- Cached public evidence is the corpus backing server-rendered public story pages and their Open Graph images.
- Token handling satisfies parent spec §24.5 by construction rather than by discipline.

### Explicitly preserved

- No GitHub write permissions (parent spec §36.7).
- No private repository access in version 0.1 (parent spec §16).
- Imported content is untrusted input throughout (parent spec §24.3).
- Only changed-file metadata and selected diff hunks are stored — not full repository contents (parent spec §24.1).

---

## Alternatives Rejected

**Require sign-in before any import.** Simplest, and removes the anonymous quota problem entirely. Rejected because it destroys the first-visit moment that `SPEC_V0.1.md` §1.2 identifies as the product's only acquisition mechanism. Sign-in walls on developer tools reliably lose the majority of first-time visitors.

**Browser-side import with a user-supplied personal access token.** No backend required, and appealing for a local-first product. Rejected: it violates parent spec §24.5, asks a first-time visitor to create a PAT before seeing any value, and makes public share pages impossible.

**REST with aggressive pagination limits.** Keeps the parent spec's REST-first direction by capping page sizes. Rejected: still 10+ requests per import, and truncating comments or commits silently damages evidence completeness — which is the product's core claim.

**Proxy through a serverless function with no cache.** Solves the token exposure problem only. Rejected: does nothing about the rate limit itself, which is the actual constraint.

---

## Revisit When

- Private repository support begins — the GitHub App installation token model replaces the OAuth token path (parent spec §20.2).
- Anonymous import abuse exceeds what quotas and the circuit breaker absorb.
- GitHub materially changes GraphQL point costs or REST limits.
