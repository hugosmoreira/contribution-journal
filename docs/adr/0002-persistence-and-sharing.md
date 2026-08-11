# ADR 0002 — Persistence and Sharing

**Status:** Accepted — implemented in v0.1
**Date:** July 2026
**Supersedes:** `OPEN_SOURCE_CONTRIBUTION_JOURNAL_SPEC.md` §15.7 and §18.2 (IndexedDB as system of record in version 0.1)
**Depends on:** ADR `0001`

---

## Context

The parent spec specifies IndexedDB as version 0.1's storage layer (§15.7, §18.2), justified by the "private by default" principle (§5.6). Server-side Postgres is deferred to a later version.

Three forces make this untenable for version 0.1.

### 1. ADR 0001 already requires a backend

The rate limit analysis forces server-side GitHub access and a shared evidence cache. Once a backend and a database exist for evidence, maintaining a separate client-side system of record for user artifacts adds a synchronization problem for no benefit.

### 2. Local-only storage makes public sharing impossible

`SPEC_V0.1.md` §3.7 requires server-rendered public story pages with Open Graph images — shared story links are the product's only growth loop.

A client-only application cannot serve a page to a visitor who does not have the author's browser. Export-a-file-and-host-it-yourself is not a sharing mechanism anyone will use.

### 3. "Private by default" conflates policy with storage location

The concern in parent spec §5.6 is legitimate: a technical learning journal contains incorrect assumptions, admissions of confusion, and private observations. It must not leak.

But what the user actually needs is a set of **guarantees**:

- Nothing becomes public without a deliberate action
- Private content is never indexed or served publicly
- Data can be fully exported
- Data can be permanently deleted
- AI transmission is controllable

Every one of these is satisfiable with server-side storage. None of them requires the data to live exclusively in the user's browser. Local-only storage was a proxy for these guarantees, not the guarantee itself.

---

## Decision

### 1. PostgreSQL is the system of record

All contributions, diagrams, evidence, reflections, and user data live server-side in Postgres, accessed through Drizzle ORM.

Schema stays portable — no vendor-specific extensions, no proprietary features — so that self-hosting at version 1.0 remains straightforward and the hosting provider remains a replaceable decision.

### 2. Visibility is a per-contribution property, defaulting to private

```ts
visibility: "private" | "unlisted" | "public"   // default "private"
```

- **private** — visible only to the owner. Never served publicly, never indexed, excluded from all public surfaces.
- **unlisted** — accessible via an unguessable `shareSlug`, `noindex`, not discoverable.
- **public** — served publicly, indexable, eligible for Open Graph generation.

Publishing is always an explicit user action. Nothing transitions to public automatically, ever. This preserves parent spec §5.6 as a policy guarantee.

### 3. Field-level privacy within a published contribution

Reflections (parent spec §21.4) carry their own visibility. Publishing a contribution never publishes its reflections unless each is individually marked public.

The mistake library, when it ships in version 0.4, is private-only with no publish path. This preserves parent spec §13.6.

### 4. IndexedDB is a resilience layer, not a store of record

IndexedDB is used only for:

- In-progress editor state, so a refresh or crash does not lose work
- Anonymous drafts before sign-in, claimable on account creation

It is explicitly **not** a mirror of server state, and no offline-first synchronization is implemented. Bidirectional sync between a local store and a server store is a well-known source of unbounded complexity — conflict resolution, merge semantics, divergence — and it buys nothing for a product whose core operation requires network access to GitHub anyway.

### 5. User data controls ship in version 0.1

Non-negotiable, and the mechanism by which the parent spec's §24.6 promises are actually kept:

- Export all data as JSON
- Export any contribution as Markdown with embedded Mermaid
- Hard-delete a single contribution — rows removed, not soft-flagged
- Hard-delete the account and all associated data
- Deletion cascades to derived artifacts, diagrams, reflections, and Open Graph images

Deletion is real deletion. The shared public evidence cache from ADR `0001` may retain imported *public GitHub content* — which is public information the user did not author — but retains nothing the user wrote, edited, confirmed, or generated.

### 6. Multi-tenancy boundary exists from day one

`Contribution.orgId` is present in the schema, `null` for personal contributions, and every query is scoped through it.

This costs essentially nothing now. It is the difference between a configuration change and a painful data migration if an organization-scoped product is ever attempted.

---

## Consequences

### Accepted costs

- **We now hold user data.** This requires a privacy policy, a documented retention position, encryption at rest, and access logging — earlier in the project's life than the parent spec assumed.
- **The threat model moves forward.** Parent spec §25.2 lists a threat model as a prerequisite for private repository support. Holding any user data moves a lightweight version of it into version 0.1.
- **Offline use is lost.** Acceptable: the product's primary operation requires GitHub API access regardless.
- **Hosting cost.** Small, and predictable.

### Gains

- Public story pages, and therefore the growth loop, become possible at all.
- Server-rendered pages give correct Open Graph images and search indexing.
- No client/server synchronization complexity.
- The Path B pivot requires auth and tenancy changes, not a storage rewrite.
- Cross-device access, which users will expect immediately.

### Explicitly preserved from the parent spec

- Nothing becomes public without a deliberate action (§5.6)
- Full export and deletion under user control (§24.6)
- Markdown export as a first-class, application-independent artifact (§36.8)
- No raw repository code stored beyond selected evidence (§24.1)
- No private repository data until the GitHub App and threat model exist (§24.2)

---

## Alternatives Rejected

**Pure local-first with export-based sharing.** Maximally faithful to parent spec §5.6. Rejected: it eliminates the only growth mechanism the product has. A tool nobody can share is a personal script, and the parent spec's own §40 argues for a project with community contribution surfaces — which requires a community.

**Local-first with optional server sync (CRDT or similar).** Technically attractive and philosophically consistent. Rejected as premature: it is likely more engineering effort than the entire rest of version 0.1, to solve a problem no user has reported yet, in a product that has not validated its core loop.

**Server-side for public contributions only, local for private.** Appears to satisfy both goals. Rejected: two systems of record with different capabilities, an awkward migration whenever a user changes visibility, and a confusing mental model. Users would not be able to predict where their data lives.

**Encrypted client-side storage with server as opaque blob store.** Strong privacy properties. Rejected: incompatible with server-rendered public pages, incompatible with server-side AI drafting, and it makes the eventual team features impossible.

---

## Revisit When

- Private repository support begins — encryption at rest for repository-derived content needs specific treatment (parent spec §37).
- Self-hosting is prioritized for version 1.0 — the schema portability commitment gets tested for real.
- A concrete user demand for offline use appears, measured rather than assumed.
