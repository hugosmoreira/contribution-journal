# Security Policy

## Reporting a vulnerability

Please report security issues privately through **GitHub Security Advisories** on this repository (Security → Report a vulnerability), not through public issues.

Include: what you found, how to reproduce it, and what an attacker could do with it. If you have a proof of concept, a minimal one is worth more than a long one.

This is a solo-maintained open-source project. Expect an acknowledgement within a week, and please give a reasonable window for a fix before public disclosure. If a fix requires a coordinated release, we will agree on the date together.

## Supported versions

Version 0.1 is pre-release. Only the current `main` branch receives fixes.

## Threat model

The application imports untrusted content from GitHub, feeds it to a language model, renders it in a browser, and serves some of it publicly. The security posture follows from that.

**Imported GitHub content is untrusted data throughout.** Issue bodies, comments, diffs, and review threads may contain anything, including text designed to look like instructions.

- Prompt injection is prevented structurally rather than by filtering: the model may cite evidence **only by event id**, and the server resolves those ids against the events it actually imported. A fabricated link cannot survive the round trip, and a node whose evidence does not resolve is marked inferred rather than silently kept.
- The drafting path has no tool access. There is nothing for injected instructions to reach.
- URLs are gated by schema (`github.com` HTTPS only) before they can land in an `href`, in Markdown, or in an exported SVG — React's text escaping does not protect attribute positions.
- Secrets and token-shaped strings are redacted at import time, before storage.
- Markdown and SVG export escape all untrusted text; both are covered by tests.

**GitHub access is read-only by construction.** Sign-in requests **no OAuth scopes at all** — the empty scope is GitHub's read-only public grant. There is no code path in this repository that performs a write against the GitHub API.

**Credentials.**

- GitHub access tokens are stored server-side only, as AES-256-GCM ciphertext, and only when `JOURNAL_SECRET` (32+ characters) is configured. Without it, tokens are never persisted at all. Tokens are never placed in browser storage.
- Session cookies are `httpOnly`, `sameSite=lax`, and `secure` in production. Only the SHA-256 hash of a session token is stored, so a leaked database cannot be replayed as live sessions.
- The OAuth handshake is CSRF-protected by a state nonce in an httpOnly cookie, compared in constant time.
- Post-sign-in redirects accept same-origin absolute paths only.

**Ownership and abuse.** Anonymous publishing is bounded by per-IP daily limits, a global row cap, and a byte ceiling on client-supplied maps. Only the publishing browser's ownership token can update or unpublish a story. Because a stranger could otherwise squat a pull request they did not write, a signed-in user whose GitHub login matches the **server-imported** author of the pull request can claim the row, which invalidates the previous token. The author login is never taken from the client.

**Denial of service.** Graph size caps are load-bearing: the server-side ELK layout runs synchronously, so an unbounded graph would be a CPU exhaustion vector. Import pagination is capped and truncation is disclosed in the UI rather than hidden.

## Out of scope

- Findings that require access to a user's own browser or machine.
- Rate-limit exhaustion of the public GitHub API by an authenticated operator's own token.
- Missing hardening headers on a local development server.
- Content correctness of AI-drafted maps (that is a product concern — the drafts are explicitly labelled as unconfirmed).

## What we ask of you

Please do not run automated scanners against a hosted deployment, access data belonging to other users, or degrade service for others while testing. Testing against your own local instance is always welcome.
