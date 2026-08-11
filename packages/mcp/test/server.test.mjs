// Drives the MCP server over a real stdio transport, exactly as Codex does,
// against a stub journal app. Proves the wire contract: tools are advertised,
// arguments reach the API, and failures come back as readable text rather
// than a crashed server.
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const SERVER = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'server.mjs')
const TOKEN = 'test-token-that-is-long-enough-01'

let app
let baseUrl
let client
const received = []

before(async () => {
  app = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null
      received.push({ url: req.url, method: req.method, auth: req.headers.authorization, body })
      res.setHeader('content-type', 'application/json')
      if (req.url.startsWith('/api/capture')) {
        if (body?.owner === 'fail') {
          res.statusCode = 502
          res.end(JSON.stringify({ ok: false, error: 'GitHub says this pull request does not exist.' }))
          return
        }
        res.end(
          JSON.stringify({
            ok: true,
            storyUrl: 'http://example.test/story/o/r/1',
            summary: 'o/r#1 "Fix retry race" (merged); 6 timeline events',
            maps: { problemSolution: 7, reviewEvolution: 5, fromAgentNotes: 1 },
          }),
        )
        return
      }
      if (req.url.startsWith('/api/recent')) {
        res.end(
          JSON.stringify({
            ok: true,
            days: 7,
            stories: [{ ref: 'o/r#1', capturedAt: '2026-08-01T10:00:00Z', storyUrl: 'http://example.test/story/o/r/1' }],
          }),
        )
        return
      }
      res.statusCode = 404
      res.end(JSON.stringify({ ok: false, error: 'not found' }))
    })
  })
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${app.address().port}`

  client = new Client({ name: 'test-client', version: '1.0.0' })
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [SERVER],
      env: { ...process.env, JOURNAL_BASE_URL: baseUrl, JOURNAL_API_TOKEN: TOKEN },
    }),
  )
})

after(async () => {
  await client?.close()
  await new Promise((resolve) => app.close(resolve))
})

describe('contribution-journal MCP server', () => {
  it('advertises both tools with descriptions an agent can act on', async () => {
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name).sort()
    assert.deepEqual(names, ['capture_pull_request', 'list_recent_stories'])
    const capture = tools.find((t) => t.name === 'capture_pull_request')
    assert.match(capture.description, /notes/i)
    assert.ok(capture.inputSchema.properties.url)
    assert.ok(capture.inputSchema.properties.notes)
    const recent = tools.find((t) => t.name === 'list_recent_stories')
    assert.equal(recent.annotations.readOnlyHint, true)
  })

  it('captures a pull request and returns the story link', async () => {
    received.length = 0
    const result = await client.callTool({
      name: 'capture_pull_request',
      arguments: {
        url: 'https://github.com/o/r/pull/1',
        notes: ['Tried a mutex first; it deadlocked.'],
      },
    })
    assert.equal(result.isError ?? false, false)
    const text = result.content[0].text
    assert.match(text, /http:\/\/example\.test\/story\/o\/r\/1/)
    assert.match(text, /private/i)
    assert.match(text, /AGENT/)

    const call = received.find((r) => r.url === '/api/capture')
    assert.equal(call.method, 'POST')
    assert.equal(call.auth, `Bearer ${TOKEN}`)
    assert.equal(call.body.url, 'https://github.com/o/r/pull/1')
    assert.deepEqual(call.body.notes, ['Tried a mutex first; it deadlocked.'])
  })

  it('accepts owner/repo/number instead of a url', async () => {
    received.length = 0
    await client.callTool({
      name: 'capture_pull_request',
      arguments: { owner: 'o', repo: 'r', number: 7 },
    })
    const call = received.find((r) => r.url === '/api/capture')
    assert.equal(call.body.owner, 'o')
    assert.equal(call.body.number, 7)
  })

  it('rejects a call with neither url nor owner/repo/number, without calling the app', async () => {
    received.length = 0
    const result = await client.callTool({ name: 'capture_pull_request', arguments: {} })
    assert.equal(result.isError, true)
    assert.match(result.content[0].text, /Give either/)
    assert.equal(received.length, 0)
  })

  it('surfaces an app error as readable text instead of dying', async () => {
    const result = await client.callTool({
      name: 'capture_pull_request',
      arguments: { owner: 'fail', repo: 'r', number: 1 },
    })
    assert.equal(result.isError, true)
    assert.match(result.content[0].text, /does not exist/)
    // The server is still alive after an error.
    const { tools } = await client.listTools()
    assert.equal(tools.length, 2)
  })

  it('lists recent stories', async () => {
    const result = await client.callTool({ name: 'list_recent_stories', arguments: { days: 7 } })
    assert.equal(result.isError ?? false, false)
    assert.match(result.content[0].text, /o\/r#1/)
  })
})
