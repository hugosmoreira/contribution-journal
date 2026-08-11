#!/usr/bin/env node
// Contribution Journal MCP server.
//
// Lets a coding agent (Codex, Claude Code, anything speaking MCP) turn the
// pull request it just finished into a learning story, without its author
// pasting a URL anywhere. That was the founding constraint of this project:
// capture has to be automatic or on-demand, never a command typed mid-work.
//
// Plain .mjs on purpose — no build step, so a client can run it straight
// from a checkout with `node packages/mcp/src/server.mjs`.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const BASE_URL = (process.env.JOURNAL_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const API_TOKEN = process.env.JOURNAL_API_TOKEN ?? ''
const REQUEST_TIMEOUT_MS = Number(process.env.JOURNAL_MCP_TIMEOUT_MS ?? 300_000)

function textResult(text, isError = false) {
  return { content: [{ type: 'text', text }], isError }
}

const SETUP_HINT =
  'Set JOURNAL_API_TOKEN (the same 24+ character value as the web app) and JOURNAL_BASE_URL in this MCP server\'s environment.'

async function callApi(path, { method = 'GET', body } = {}) {
  if (!API_TOKEN) {
    throw new Error(`No JOURNAL_API_TOKEN configured for the MCP server. ${SETUP_HINT}`)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${API_TOKEN}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(
        `The journal app did not answer within ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s. Drafting a very large pull request can take a while — try again, or raise JOURNAL_MCP_TIMEOUT_MS.`,
      )
    }
    throw new Error(
      `Could not reach the journal app at ${BASE_URL}. Is it running (npm run dev)? Underlying error: ${err?.message ?? err}`,
    )
  } finally {
    clearTimeout(timer)
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error(`The journal app returned a non-JSON response (HTTP ${response.status}).`)
  }
  if (!response.ok || payload?.ok === false) {
    const detail = payload?.error ?? `HTTP ${response.status}`
    if (response.status === 401) {
      throw new Error(`The journal app rejected the token. ${SETUP_HINT}`)
    }
    throw new Error(detail)
  }
  return payload
}

const server = new McpServer(
  { name: 'contribution-journal', version: '0.1.0' },
  {
    instructions: [
      'Turns a finished GitHub pull request into a visual learning story (timeline, problem→solution map, review evolution map).',
      '',
      'Call capture_pull_request as soon as a pull request you worked on is opened or merged.',
      '',
      'Pass `notes` describing what the public record cannot show: approaches you tried and abandoned, what failed first, why you chose the design you did, what surprised you. Those become nodes labelled AGENT, kept visually distinct from evidence-backed ones. Be specific and factual; write nothing you did not actually do.',
      '',
      'Capture never publishes. The story stays private until its author explicitly publishes it in the web app.',
    ].join('\n'),
  },
)

server.registerTool(
  'capture_pull_request',
  {
    title: 'Capture a pull request as a learning story',
    description: [
      'Import a public GitHub pull request and draft its learning maps, so its author can review what happened without pasting a URL.',
      'Give either `url`, or `owner` + `repo` + `number`.',
      'Use `notes` for context GitHub cannot hold: abandoned approaches, what failed first, why a design won. Each note becomes a clearly-labelled AGENT node — never presented as proven.',
      'Does not publish anything; the result is private until a human publishes it.',
    ].join(' '),
    inputSchema: {
      url: z.string().optional().describe('Full pull request URL, e.g. https://github.com/owner/repo/pull/123'),
      owner: z.string().optional().describe('Repository owner, if not using url'),
      repo: z.string().optional().describe('Repository name, if not using url'),
      number: z.union([z.number(), z.string()]).optional().describe('Pull request number, if not using url'),
      notes: z
        .array(z.string())
        .optional()
        .describe(
          'What the GitHub record cannot show: approaches tried and abandoned, what failed first, why this design won, what surprised you. One idea per note.',
        ),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ url, owner, repo, number, notes }) => {
    if (!url && !(owner && repo && number !== undefined)) {
      return textResult('Give either `url`, or all three of `owner`, `repo` and `number`.', true)
    }
    try {
      const result = await callApi('/api/capture', {
        method: 'POST',
        body: { url, owner, repo, number, notes },
      })
      const lines = [
        `Captured ${result.summary}`,
        '',
        `Open the story: ${result.storyUrl}`,
        '',
        'It is private — nothing is public until its author publishes it there.',
      ]
      if (result.maps?.fromAgentNotes > 0) {
        lines.push(
          `${result.maps.fromAgentNotes} node(s) came from your notes and are labelled AGENT, because nothing in the public record backs them.`,
        )
      }
      return textResult(lines.join('\n'))
    } catch (err) {
      return textResult(`Capture failed: ${err?.message ?? err}`, true)
    }
  },
)

server.registerTool(
  'list_recent_stories',
  {
    title: 'List recently captured stories',
    description:
      'What has been captured recently, most recent first — useful for answering "what did I work on today?" or checking whether a pull request was already captured.',
    inputSchema: {
      limit: z.number().int().min(1).max(50).optional().describe('How many stories to return (default 10)'),
      days: z.number().int().min(1).max(90).optional().describe('How far back to look, in days (default 7)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ limit, days }) => {
    try {
      const params = new URLSearchParams()
      if (limit) params.set('limit', String(limit))
      if (days) params.set('days', String(days))
      const query = params.toString()
      const result = await callApi(`/api/recent${query ? `?${query}` : ''}`)
      if (result.note) return textResult(result.note)
      if (!result.stories?.length) {
        return textResult(`No stories captured in the last ${result.days} days.`)
      }
      const lines = result.stories.map((s) => `- ${s.ref} — ${s.storyUrl ?? '(no link)'} (captured ${s.capturedAt})`)
      return textResult([`Captured in the last ${result.days} days:`, ...lines].join('\n'))
    } catch (err) {
      return textResult(`Could not list stories: ${err?.message ?? err}`, true)
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
