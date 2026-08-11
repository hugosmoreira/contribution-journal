// End-to-end suite: exercises editing, persistence, export, the full publish
// lifecycle, and the sign-in/ownership-claim flows against a running dev
// server (npm run dev) using the seeded fixture story.
// Run: node scripts/seed-fixture.mjs && node scripts/e2e.mjs
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const failures = []

// A suite that prints "all checks passed" after silently skipping a third of
// itself is worse than no suite. Skips are recorded and, by default, fail the
// run — set E2E_ALLOW_SKIP=1 to permit a partial run (e.g. no database).
const skipped = []
function skip(suite, reason) {
  skipped.push(`${suite} (${reason})`)
  console.log(`- ${suite} SKIPPED: ${reason}`)
}

// The app reads its token from apps/web/.env.local, so read it from the same
// place rather than trusting the shell — a mismatch would look like a
// genuine auth failure.
function envLocal(key) {
  if (process.env[key]) return process.env[key]
  try {
    const match = new RegExp(`^${key}=(.+)$`, 'm').exec(readFileSync('apps/web/.env.local', 'utf8'))
    return match ? match[1].trim() : undefined
  } catch {
    return undefined
  }
}

let passes = 0
function check(name, ok) {
  console.log(`${ok ? '✓' : '✗'} ${name}`)
  if (ok) passes++
  else failures.push(name)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)))
page.on('dialog', (d) => d.accept())

// --- Story page renders with both maps ---
await page.goto(`${BASE}/story/o/r/1`, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
// Fixture renders 9 edges total (5 problem→solution + 4 review evolution);
// poll rather than sleep — edge paths paint progressively after hydration.
await page
  .waitForFunction(() => document.querySelectorAll('.react-flow__edge-path').length >= 9, null, { timeout: 20000 })
  .catch(() => {})
check('problem→solution map renders with edges', (await page.locator('.react-flow__edge-path').count()) >= 9)
check('review evolution map renders', (await page.locator('.story-node.kind-feedback').count()) === 1)
check('timeline renders', (await page.locator('.timeline li').count()) === 6)

// --- Editing persists across reloads ---
await page.locator('.story-node', { hasText: 'What was the underlying cause?' }).first().click()
await page.locator('.map-inspector textarea').fill('E2E: retry window raced the tick')
await page.waitForTimeout(400)
await page.reload({ waitUntil: 'networkidle' })
// Count edges rather than waiting for one to be "visible": a perfectly
// horizontal edge has a zero-height bounding box, which Playwright treats as
// invisible, and the maps now stream in after the evidence.
await page
  .waitForFunction(() => document.querySelectorAll('.react-flow__edge-path').length >= 9, null, { timeout: 30000 })
  .catch(() => {})
check('edit survives reload', (await page.locator('.story-node', { hasText: 'E2E:' }).count()) === 1)

// --- Multi-select delete keeps the graph consistent ---
// Delete only non-required kinds — the publish gate (SPEC §3.3b) rejects a
// map missing its symptom/fix/outcome spine, which a later step publishes.
const before = await page.locator('.story-node').count()
await page.locator('.story-node', { hasText: 'First approach' }).first().click()
await page.locator('.story-node', { hasText: 'Approved by 1 reviewer' }).first().click({ modifiers: ['Control'] })
await page.getByRole('button', { name: 'Delete node' }).click()
await page.waitForTimeout(400)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.story-node', { timeout: 20000 })
await page.waitForTimeout(600)
check('multi-delete persists without corrupting the graph', (await page.locator('.story-node').count()) < before && (await page.locator('.story-node', { hasText: 'E2E:' }).count()) === 1)

// --- Export includes edits ---
const [mdDownload] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: '↓ Markdown' }).click(),
])
const mdPath = await mdDownload.path()
const md = mdPath ? await import('node:fs').then((fs) => fs.readFileSync(mdPath, 'utf8')) : ''
check('markdown export contains the edit and mermaid', md.includes('E2E:') && md.includes('```mermaid'))

// --- Re-opening a story must not consume the daily import allowance ---
// (The quota bounds GitHub/model spend; a cached re-read costs neither.
// Counting raw views used to lock people out of their own story.)
let reopenOk = true
for (let i = 0; i < 3; i++) {
  await page.goto(`${BASE}/story/o/r/1`, { waitUntil: 'networkidle' })
  if ((await page.locator('.error-card').count()) > 0) reopenOk = false
}
check('re-opening the same story does not burn quota', reopenOk)

// --- SVG export (SPEC §3.8): includes edits, escaped, self-contained ---
const [svgDownload] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: '↓ Map SVG' }).click(),
])
const svgPath = await svgDownload.path()
const svg = svgPath ? await import('node:fs').then((fs) => fs.readFileSync(svgPath, 'utf8')) : ''
check(
  'map SVG export contains the edit and no raw markup',
  svg.startsWith('<svg') && svg.includes('E2E:') && !svg.includes('<script'),
)
const [tlDownload] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: '↓ Timeline SVG' }).click(),
])
const tlPath = await tlDownload.path()
const tl = tlPath ? await import('node:fs').then((fs) => fs.readFileSync(tlPath, 'utf8')) : ''
check('timeline SVG export renders every event', tl.startsWith('<svg') && (tl.match(/<circle /g) ?? []).length === 6)

// --- Agent capture API (what the MCP server calls) ---
{
  const token = envLocal('JOURNAL_API_TOKEN')
  const capture = (headers, body) =>
    page.request.post(`${BASE}/api/capture`, { headers, data: body, failOnStatusCode: false })

  const noAuth = await capture({}, { url: 'https://github.com/o/r/pull/1' })
  check('capture rejects an unauthenticated call', noAuth.status() === 401 || noAuth.status() === 503)

  if (token) {
    const auth = { authorization: `Bearer ${token}` }
    const wrong = await capture({ authorization: 'Bearer wrong-token-wrong-token-xx' }, { url: 'https://github.com/o/r/pull/1' })
    check('capture rejects a wrong token', wrong.status() === 401)

    const bad = await capture(auth, { url: 'https://example.com/not/github' })
    check('capture rejects a non-GitHub URL with 400', bad.status() === 400)

    const ok = await capture(auth, {
      url: 'https://github.com/o/r/pull/1',
      notes: ['Tried a mutex first; it deadlocked under the scheduler tick.'],
    })
    const payload = ok.ok() ? await ok.json() : {}
    check(
      'capture returns a story link and labels agent notes',
      ok.ok() && String(payload.storyUrl ?? '').includes('/story/o/r/1') && payload.maps?.fromAgentNotes >= 1,
    )
    check('capture never publishes on its own', payload.published === false)

    // The captured notes must survive into the page the author opens. Use a
    // fresh context: this browser has saved edits for o/r#1 from earlier
    // checks, and a saved map correctly wins over a redraft — the agent must
    // never silently overwrite work the author already did.
    const fresh = await browser.newPage()
    await fresh.goto(`${BASE}/story/o/r/1`, { waitUntil: 'networkidle' })
    await fresh.waitForSelector('.story-node', { timeout: 20000 })
    const agentNodes = await fresh.locator('.story-node.prov-agent').count()
    const agentEvidence = await fresh.locator('.story-node.prov-agent .node-evidence a').count()
    check('agent notes reach the story page, labelled and evidence-free', agentNodes >= 1 && agentEvidence === 0)
    await fresh.close()
  } else {
    skip('capture auth suite', 'JOURNAL_API_TOKEN not set')
  }
}

// --- Sign-in routes degrade safely (no OAuth app configured in dev) ---
// ?next is attacker-influencable: wherever the redirect lands (GitHub when
// configured, home when not), an external destination must never survive.
const signinProbe = await page.request.get(`${BASE}/api/auth/signin?next=https://evil.example/x`, {
  maxRedirects: 0,
})
const signinLocation = signinProbe.headers()['location'] ?? ''
check(
  'signin redirect never forwards to a foreign origin',
  signinProbe.status() >= 300 && signinProbe.status() < 400 && !signinLocation.includes('evil.example'),
)
const forgedCallback = await page.request.get(`${BASE}/api/auth/callback?code=x&state=forged`, {
  maxRedirects: 0,
})
check(
  'callback with forged state redirects home, never 500s',
  forgedCallback.status() >= 300 && forgedCallback.status() < 400,
)

// --- Publish lifecycle (requires DATABASE_URL) ---
const canPublish = (await page.getByRole('button', { name: 'Publish' }).count()) > 0 || (await page.locator('.share-link').count()) > 0
if (canPublish) {
  if ((await page.locator('.share-link').count()) === 0) {
    await page.getByRole('button', { name: 'Publish' }).click()
    await page.waitForSelector('.share-link', { timeout: 20000 })
  }
  const shareHref = new URL(await page.locator('.share-link').getAttribute('href'), BASE).toString()
  const visitor = await browser.newPage()
  await visitor.goto(shareHref, { waitUntil: 'networkidle' })
  await visitor.waitForSelector('.story-node', { timeout: 20000 })
  check('public page shows the edited story read-only',
    (await visitor.locator('.story-node', { hasText: 'E2E:' }).count()) === 1 &&
    (await visitor.locator('.map-inspector').count()) === 0)
  const og = await visitor.request.get(`${shareHref}/opengraph-image`)
  check('OG image responds with PNG', og.status() === 200 && (og.headers()['content-type'] || '').includes('image/png'))

  // Ownership: a different browser learns only that the story is published —
  // never the slug, never the controls.
  await visitor.goto(`${BASE}/story/o/r/1`, { waitUntil: 'networkidle' })
  await visitor.waitForSelector('.publish-note', { timeout: 20000 })
  check(
    'stranger browser sees no slug and cannot unpublish',
    (await visitor.locator('.share-link').count()) === 0 &&
      (await visitor.getByRole('button', { name: 'Unpublish' }).count()) === 0,
  )
  await page.getByRole('button', { name: 'Unpublish' }).click()
  let deadStatus = 0
  for (let i = 0; i < 20; i++) {
    deadStatus = (await visitor.request.get(shareHref)).status()
    if (deadStatus === 404) break
    await page.waitForTimeout(300)
  }
  check('unpublish hard-deletes the public page', deadStatus === 404)
  await visitor.close()

  // --- Sign-in, author claim, account deletion (SPEC §3.9, DoD 10) ---
  // A user + session are seeded straight into Postgres: the GitHub handshake
  // itself is unit-tested in packages/auth; everything downstream of it —
  // session cookie, header, claim, cascade delete — runs for real here.
  let sql = null
  let seeded = false
  try {
    const { default: postgres } = await import('postgres')
    sql = postgres(process.env.DATABASE_URL ?? 'postgres://journal:journal_dev@localhost:5544/journal', {
      max: 1,
      connect_timeout: 3,
    })
    await sql`delete from users where github_id = '999001'`
    await sql`insert into users (id, github_id, login, name) values ('e2e-user-1', '999001', 'hugo', 'Hugo E2E')`
    const rawSession = 'e2e-session-token-0123456789abcdefghij'
    await sql`insert into sessions (token_hash, user_id, expires_at)
              values (${createHash('sha256').update(rawSession).digest('hex')}, 'e2e-user-1', now() + interval '1 day')`
    seeded = true

    const authContext = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
    await authContext.addCookies([{ name: 'journal_session', value: rawSession, url: BASE }])
    const authPage = await authContext.newPage()
    authPage.on('dialog', (d) => d.accept())

    const sessionBody = await (await authPage.request.get(`${BASE}/api/auth/session`)).json()
    check('seeded session authenticates as the PR author', sessionBody.user?.login === 'hugo')

    // Re-publish anonymously from the main page — the "squatter" for this test.
    await page.getByRole('button', { name: 'Publish' }).click()
    await page.waitForSelector('.share-link', { timeout: 20000 })

    // The signed-in author gets a claim path, not a dead end.
    await authPage.goto(`${BASE}/story/o/r/1`, { waitUntil: 'networkidle' })
    await authPage.waitForSelector('.auth-user', { timeout: 20000 })
    check('header shows the signed-in login', (await authPage.locator('.auth-user', { hasText: 'hugo' }).count()) === 1)
    const claimButton = authPage.getByRole('button', { name: /claim it/ })
    await claimButton.waitFor({ timeout: 20000 })
    await claimButton.click()
    await authPage.waitForSelector('.share-link', { timeout: 20000 })
    check('author claim takes over the published story', (await authPage.locator('.share-link').count()) === 1)
    const claimedHref = new URL(await authPage.locator('.share-link').getAttribute('href'), BASE).toString()

    // The anonymous publisher's ownership token died with the claim.
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('.publish-note', { timeout: 20000 })
    check(
      'squatter token is dead after the author claim',
      (await page.getByRole('button', { name: 'Unpublish' }).count()) === 0,
    )

    // Deleting the account hard-deletes the user, sessions, and owned stories.
    await authPage.locator('.auth-user').click()
    // The dropdown buttons carry role="menuitem", not "button".
    await authPage.getByRole('menuitem', { name: 'Delete account…' }).click()
    await authPage.waitForURL(`${BASE}/`, { timeout: 20000 })
    let goneStatus = 0
    for (let i = 0; i < 20; i++) {
      goneStatus = (await authPage.request.get(claimedHref)).status()
      if (goneStatus === 404) break
      await authPage.waitForTimeout(300)
    }
    check('account deletion cascades to the published story', goneStatus === 404)
    const afterDelete = await (await authPage.request.get(`${BASE}/api/auth/session`)).json()
    check('deleted account has no session', afterDelete.user === null)
    const remaining = await sql`select count(*)::int as n from users where github_id = '999001'`
    check('user row is hard-deleted', remaining[0].n === 0)
    await authContext.close()
  } catch (err) {
    if (!seeded) skip('auth suite', 'database not reachable for seeding')
    else check(`auth suite completed without crashing (${String(err).slice(0, 140)})`, false)
  } finally {
    if (sql) {
      try {
        await sql`delete from users where github_id = '999001'`
      } catch {}
      await sql.end().catch(() => {})
    }
  }
} else {
  skip('publish + auth suites', 'no Publish control — DATABASE_URL not configured or app not connected')
}

check('zero page errors', pageErrors.length === 0)
await browser.close()

const ran = failures.length + passes
console.log(`\n${ran} checks ran, ${failures.length} failed, ${skipped.length} suite(s) skipped.`)

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):\n${failures.map((f) => `  - ${f}`).join('\n')}`)
  process.exit(1)
}

if (skipped.length > 0) {
  const detail = skipped.map((s) => `  - ${s}`).join('\n')
  if (process.env.E2E_ALLOW_SKIP === '1') {
    console.warn(`\nPassed, but this was a PARTIAL run — skipped:\n${detail}`)
  } else {
    console.error(
      `\nIncomplete run: ${skipped.length} suite(s) never executed, so this is not a pass.\n${detail}\n\n` +
        'Start the dev database (docker compose up -d) and set the matching env vars, ' +
        'or re-run with E2E_ALLOW_SKIP=1 to accept a partial run.',
    )
    process.exit(1)
  }
}

console.log('\nAll e2e checks passed.')
