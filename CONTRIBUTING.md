# Contributing

Thanks for considering it. This project exists because reconstructing your own work after the fact is hard — so contributions that make the reconstruction *more honest* are the most valuable ones here.

## Before you start

- **Small fixes:** just open a pull request.
- **Anything larger:** open an issue first and describe the problem you hit. A short conversation saves rewrites.
- **New features:** check `SPEC_V0.1.md` §4 first. Version 0.1 has a deliberately narrow scope and a deferral table; if your idea is already assigned to 0.2 or later, the issue is still worth opening — it just will not be merged yet.

## Development setup

Requirements: Node 20+, Docker.

```bash
npm install
docker compose up -d           # dev Postgres on port 5544
npm run push -w packages/db    # apply the schema
npm run dev
```

Optional keys go in `apps/web/.env.local` (gitignored) — see the README. Everything works without them.

## Running the checks

```bash
npx playwright install chromium   # once: e2e and a11y drive a real browser

npm test          # unit tests, all packages
npm run typecheck # TypeScript, no emit
npm run dev:e2e   # dev server with AI pinned to the null adapter (terminal 1)
npm run e2e       # Playwright end-to-end checks (terminal 2)
npm run a11y      # axe-core WCAG 2.1 A/AA audit
npm run build     # production build
```

The e2e suite refuses to report a pass when a suite could not run (no database,
no `JOURNAL_API_TOKEN`); it exits non-zero and names what it skipped. Use
`E2E_ALLOW_SKIP=1` if you deliberately want a partial run.

Two gotchas that will waste your afternoon:

- **Do not run `npm run build` while a dev server is running.** They share `apps/web/.next`, and the build leaves the dev server throwing `Cannot find module './901.js'` until you restart it.
- **Interactive UI cannot be verified in a hidden browser pane.** React Flow needs `requestAnimationFrame`, which never fires in a pane that is not displayed. Use Playwright with headless Chromium.

## The rules that are not negotiable

These come from the product spec and are enforced in review:

1. **No GitHub write permission, anywhere.** Sign-in requests no OAuth scopes at all. A pull request that adds a scope will not be merged.
2. **Imported content is data, never instructions.** The AI layer cites evidence by event id and the server resolves those ids against real events. Do not add a path where model output becomes a URL, a command, or markup directly.
3. **Provenance stays honest.** If a node was drafted by a model, it renders as a draft until a human confirms it. Do not "clean up" the dashed borders, the AI badge, or the inferred flag.
4. **No scores, rankings, or recruiter signals.** Not as an option, not behind a flag.
5. **Nothing becomes public implicitly.** Publishing is an explicit user action; unpublishing is a hard delete.

## Code conventions

- TypeScript everywhere; Zod schemas in `packages/domain` are the shared vocabulary — extend them rather than passing loose objects between packages.
- Validate at boundaries. Anything arriving from a client, GitHub, or a model gets parsed by a schema before use.
- Comments explain *why*, especially where the code looks odd on purpose. Several of the strangest lines in this repo are load-bearing — the ELK layout must stay server-side, size caps on graphs are a DoS guard, and localStorage persistence is gated on state rather than a ref because of a StrictMode double-mount race. If you find such a line, leave the comment.
- Match the surrounding style rather than introducing a new one.

## Tests

New behavior needs a test. In particular:

- Security properties (redaction, injection boundary, sanitization, ownership) must be pinned by a test, not by review attention.
- The null AI adapter path must keep working — it is what self-hosters without an API key get.

## Pull requests

- One logical change per pull request.
- Explain the problem before the solution. If you can, say what you *tried* that did not work — that context is the whole point of this project.
- Make sure `npm test`, `npm run typecheck`, `npm run e2e`, and `npm run a11y` pass.

## License

By contributing you agree that your contributions are licensed under [Apache-2.0](LICENSE).
