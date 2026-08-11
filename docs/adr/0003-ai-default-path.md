# ADR 0003 — AI Is the Default Path

**Status:** Accepted — implemented in v0.1
**Date:** July 2026
**Supersedes:** `OPEN_SOURCE_CONTRIBUTION_JOURNAL_SPEC.md` §5.5 and §36.3 (AI optional; product must be fully usable without it)

---

## Context

The parent spec makes AI strictly optional. §5.5 requires that the non-AI workflow be complete, and §36.3 lists "AI is optional" among decisions that should not be reopened without evidence.

The motivation is sound and should be preserved: the product must not become another place where a user presses a button and accepts a polished answer they do not understand (§5.2). AI-generated claims must be labeled and source-linked (§5.3, §14.3). The project must remain self-hostable without dependence on a commercial provider.

But the operative consequence of "fully usable without AI" is that the **default first-run experience** must be usable without AI. And without AI, version 0.1 is a blank diagram canvas and a form.

In short: the moment that causes adoption is *paste a URL, get an accurate map in fifteen seconds*. Nobody shares a blank canvas. A product whose default experience is unpaid data entry does not acquire users, and a product with no users cannot validate the learning loop that the rest of the spec is built around.

This ADR constitutes the evidence §36 requires for reopening the decision.

---

## Decision

**AI drafting is the default experience. The no-AI path is preserved as an adapter contract, not as the default.**

### 1. Hosted AI is on by default, with no user-supplied key

A first-time visitor gets AI-drafted diagrams without configuring anything. Inference cost is borne by the project, bounded by the same per-IP quota that governs anonymous imports (ADR `0001`).

### 2. The adapter interface from parent spec §14.4 is implemented as specified

```ts
export interface LearningAssistant {
  extractClaims(input: EvidenceBundle): Promise<ClaimDraft[]>;
  proposeDiagram(input: ContributionContext): Promise<DiagramDraft>;
  generateQuestions(input: ConfirmedKnowledge): Promise<PracticeQuestion[]>;
  critiqueExplanation(input: ExplanationReviewInput): Promise<ExplanationFeedback>;
}
```

Version 0.1 implements two adapters:

- **Hosted** — the default, using one provider.
- **Null** — deterministic, produces skeleton drafts from evidence structure alone (timeline events, review threads, commit sequence) with no inference.

Bring-your-own-key and local model adapters are not built in 0.1, per parent spec §14.4's own guidance not to build every provider at once. The interface guarantees they remain cheap to add.

### 3. The null adapter is exercised in CI

Every build runs the full import-to-export flow against the null adapter. This is what keeps "works without AI" true in practice rather than aspirationally. The no-AI codepath cannot rot, because a broken one breaks the build.

The contribution timeline (`SPEC_V0.1.md` §3.3a) is generated entirely from evidence with no inference in any configuration, so a meaningful artifact exists even with AI fully disabled.

### 4. Provenance requirements are unchanged and strengthened

Nothing in parent spec §5.3, §14.2, or §14.3 is relaxed. Specifically:

- Every AI-generated node references at least one `EvidenceArtifact`, or is marked `inferred` and visually flagged.
- AI-generated nodes render distinctly from user-authored and user-confirmed nodes.
- Editing a node marks it user-confirmed.
- No AI output is ever presented as verified fact absent evidence links.

**The provenance model is what makes AI-first safe.** Parent spec §10 was designed precisely so that AI could draft aggressively while the human remains the authority. This decision uses that design as intended rather than working around it.

### 5. Explain-before-reveal moves to version 0.2, unchanged in substance

Parent spec §5.2 and §13.1 require the user to attempt an explanation before seeing an AI draft. This remains a core product commitment.

It is sequenced into 0.2 alongside the journal, where it belongs pedagogically — the coaching flow makes sense in the context of writing a journal, not in the context of a first-visit diagram. It is not weakened, and it is not optional when it ships.

### 6. Imported content remains untrusted input

Parent spec §24.3 is unchanged and its importance increases. The drafting path:

- Treats all imported repository content as data, never as instructions
- Maintains a strict system boundary separating application instructions from repository text
- Has no tool access
- Never executes instructions found in issue bodies, comments, diffs, or documentation

This is covered by explicit test cases per `SPEC_V0.1.md` §6.13.

### 7. Self-hosting keeps the no-AI guarantee

Version 1.0 self-hosting documentation covers running the application with the null adapter or a local model, with no commercial provider dependency. The claim "works without AI" moves from the README headline to the self-hosting documentation, where it is a genuine and verifiable operational guarantee rather than a description of the default experience.

---

## Consequences

### Accepted costs

- **Inference cost per anonymous import.** Bounded by quota and by the shared evidence cache. Should be modest at early volume, but must be monitored — an unbounded free AI endpoint is an abuse target.
- **A philosophical commitment is softened.** The parent spec's principled stance is partially traded for adoption. This is recorded honestly here rather than quietly abandoned.
- **A provider dependency exists in the hosted product.** Mitigated by the adapter interface; the hosted default is replaceable.
- **Perceived quality is now coupled to draft accuracy.** If drafts are consistently wrong, the product feels worse than a blank canvas would have. Mitigated by validating draft quality against the five dogfood contributions during week 3 (`SPEC_V0.1.md` §7) before committing to the release.

### Gains

- The first-visit experience delivers value in seconds instead of requiring unpaid data entry.
- Time to a completed story drops below the eight-minute target.
- The editing-and-correction loop — the actual learning mechanism, per parent spec §5.4 — is *more* likely to happen with a draft present, because correcting a wrong node requires genuine understanding while filling a blank one can be skipped.
- The product has something to show, which is the precondition for the product being shown.

### Note on the learning argument

There is a reasonable objection that giving the user a draft undermines the self-explanation effect the parent spec builds on (§38).

The counter, and the reason this is acceptable: parent spec §5.4 already establishes correction as a learning mechanism, and the research summarized in §38 is explicit that generic "explain this" prompts do not reliably produce learning. Identifying and fixing an incorrect node in a drafted causal map is an inferential act. Staring at an empty canvas is more often an abandonment event than a learning one.

This is a hypothesis, not a proven claim. It is testable once explain-before-reveal ships in 0.2 — compare correction rates and recall performance between drafted and blank starting states. Record the result.

---

## Alternatives Rejected

**Keep AI strictly optional, off by default.** Faithful to the parent spec. Rejected: produces a first-run experience with no output, and therefore no adoption, and therefore no ability to validate anything else in the spec.

**AI available only with a user-supplied API key.** Removes inference cost and provider dependency entirely. Rejected: asking a first-time visitor to obtain and paste an API key before seeing any value is a harder gate than sign-in, and it would be encountered before the user has any reason to care.

**Draft only after the user attempts an explanation, in 0.1.** Most faithful to parent spec §5.2. Rejected for 0.1 sequencing only: it front-loads homework onto a visitor who has not yet seen what the product produces. It ships in 0.2 with the journal, unchanged in substance.

**Deterministic, non-AI diagram generation from evidence structure alone.** This is the null adapter, and it is genuinely useful for the timeline. Rejected as the default for the causal maps: a problem-to-solution map requires inferring causality from prose, which structural analysis cannot do. The result would be a list of events, not an explanation.

---

## Revisit When

- Draft accuracy is measured against the dogfood set and falls below usefulness — reconsider shipping editing-first with skeleton drafts.
- Inference cost per user exceeds sustainable limits for the free tier.
- Explain-before-reveal ships in 0.2 and the drafted-versus-blank comparison produces a result.
- A local model adapter becomes good enough to be the hosted default, removing the provider dependency.
