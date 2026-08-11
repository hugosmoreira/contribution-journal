# Contribution Journal — MCP server

Lets a coding agent turn the pull request it just finished into a learning story, with no URL pasted anywhere.

This is the piece that makes the product match how the work actually happens: you and an agent build something, the agent already knows what it tried and abandoned, and that context is gone the moment the PR is merged. Capture keeps it.

## What the agent gets

| Tool | What it does |
|---|---|
| `capture_pull_request` | Imports a public PR and drafts its maps. Takes `url` (or `owner` + `repo` + `number`) and optional `notes`. Returns the story link. |
| `list_recent_stories` | What was captured recently — answers "what did I work on today?" |

**Capture never publishes.** Publishing stays an explicit human action; an agent should not make someone's work public on their behalf. The story is private until its author publishes it in the web app.

## Setup

**1. Give the web app a token.** In `apps/web/.env.local`, add any random string of 24+ characters:

```bash
JOURNAL_API_TOKEN=pick-a-long-random-string-here
```

Restart the app (`npm run dev`) and note the port it prints.

**2. Point your agent at the server.**

For **Codex**, add this to `~/.codex/config.toml` (create the file if it does not exist):

Codex needs an **absolute** path, so replace the one below with your own clone
location (on Windows, use forward slashes: `C:/code/contribution-journal/...`).

```toml
[mcp_servers.contribution-journal]
command = "node"
args = ["/absolute/path/to/contribution-journal/packages/mcp/src/server.mjs"]

[mcp_servers.contribution-journal.env]
JOURNAL_BASE_URL = "http://localhost:3000"
JOURNAL_API_TOKEN = "pick-a-long-random-string-here"
```

For **Claude Code**:

```bash
claude mcp add contribution-journal --env JOURNAL_BASE_URL=http://localhost:3000 --env JOURNAL_API_TOKEN=pick-a-long-random-string-here -- node ./packages/mcp/src/server.mjs
```

Set `JOURNAL_BASE_URL` to whatever port the app is actually serving on.

**3. Restart the agent** so it picks up the new server. Ask it to "capture the PR I just opened" and it will hand back a link.

## The notes are the point

Without notes, capture produces the same story you would get by pasting the URL yourself. With them, it produces something GitHub structurally cannot hold:

```
notes: [
  "First tried special-casing the stdin path, but that duplicated the
   extension allowlist in two places and would have drifted again.",
  "The failing case that started this: piping an SVG into `deno fmt --ext svg`
   errored while formatting the same file on disk worked fine.",
]
```

Those become nodes labelled **AGENT** in amber, visually separate from evidence-backed ones, and they carry no evidence link — because nothing public backs them. An agent's account of its own work is a claim, not proof, and the map says so.

## Notes and your edits

Re-capturing a PR with new notes redraws the draft, but **a map you have already edited wins** — the agent never silently overwrites your work. Use *Reset to draft* in the editor to pull in the newer draft.

## Environment

| Variable | Meaning |
|---|---|
| `JOURNAL_BASE_URL` | Where the web app is running (default `http://localhost:3000`) |
| `JOURNAL_API_TOKEN` | Must match the app's `JOURNAL_API_TOKEN` |
| `JOURNAL_MCP_TIMEOUT_MS` | How long to wait for drafting (default 300000 — large PRs are slow) |

## Development

```bash
npm test --workspace packages/mcp
```

The tests drive the server over a real stdio transport against a stub app, so they cover the wire contract an agent actually sees.
