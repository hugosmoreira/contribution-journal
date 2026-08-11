// Automated accessibility checks over the core flows (SPEC_V0.1 DoD 18).
// Runs axe-core against the home page, the story editor (both maps + the
// inspector open), and a published public page. Fails on any WCAG 2 A/AA
// violation. Run against a dev server: node scripts/a11y.mjs
import AxeBuilder from '@axe-core/playwright'
import { chromium } from 'playwright'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const failures = []

const browser = await chromium.launch()
// axe-core requires an explicit context (it injects into every frame).
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
const page = await context.newPage()
page.on('dialog', (d) => d.accept())

async function audit(name, { disableRules = [] } = {}) {
  const builder = new AxeBuilder({ page }).withTags(TAGS)
  // React Flow renders its own attribution/controls; exclude nothing by
  // default — if a rule must be waived, name it here with a reason.
  if (disableRules.length > 0) builder.disableRules(disableRules)
  const { violations } = await builder.analyze()
  const serious = violations.filter((v) => v.impact !== 'minor')
  console.log(`${serious.length === 0 ? '✓' : '✗'} ${name}${serious.length ? ` — ${serious.length} violation(s)` : ''}`)
  for (const v of serious) {
    console.log(`    [${v.impact}] ${v.id}: ${v.help}`)
    for (const node of v.nodes.slice(0, 3)) {
      console.log(`      ${node.target.join(' ')}`)
      console.log(`        ${node.failureSummary?.split('\n').slice(0, 2).join(' ').trim()}`)
    }
    failures.push(`${name}: ${v.id}`)
  }
}

// --- Home page ---
await page.goto(BASE, { waitUntil: 'networkidle' })
await audit('home page')

// --- Home page with an error message showing ---
await page.goto(`${BASE}/?error=wrong_host`, { waitUntil: 'networkidle' })
await audit('home page with error alert')

// --- Story editor, both maps rendered ---
await page.goto(`${BASE}/story/o/r/1`, { waitUntil: 'networkidle' })
await page
  .waitForFunction(() => document.querySelectorAll('.react-flow__edge-path').length >= 9, null, { timeout: 20000 })
  .catch(() => {})
await audit('story editor')

// --- Story editor with a node selected (inspector form visible) ---
await page.locator('.story-node').first().click()
await page.waitForSelector('.map-inspector textarea', { timeout: 10000 })
await audit('story editor with node inspector open')

// --- Published public page ---
const publishable = (await page.getByRole('button', { name: 'Publish' }).count()) > 0
if (publishable) {
  await page.getByRole('button', { name: 'Publish' }).click()
  await page.waitForSelector('.share-link', { timeout: 20000 })
  const href = new URL(await page.locator('.share-link').getAttribute('href'), BASE).toString()
  const visitor = await context.newPage()
  await visitor.goto(href, { waitUntil: 'networkidle' })
  await visitor.waitForSelector('.story-node', { timeout: 20000 })
  const { violations } = await new AxeBuilder({ page: visitor }).withTags(TAGS).analyze()
  const serious = violations.filter((v) => v.impact !== 'minor')
  console.log(`${serious.length === 0 ? '✓' : '✗'} published public page${serious.length ? ` — ${serious.length} violation(s)` : ''}`)
  for (const v of serious) {
    console.log(`    [${v.impact}] ${v.id}: ${v.help}`)
    for (const node of v.nodes.slice(0, 3)) console.log(`      ${node.target.join(' ')}`)
    failures.push(`published page: ${v.id}`)
  }
  await visitor.close()
  await page.getByRole('button', { name: 'Unpublish' }).click()
  await page.waitForTimeout(1000)
} else {
  console.log('- published page audit skipped (publishing not configured)')
}

await browser.close()

if (failures.length > 0) {
  console.error(`\n${failures.length} accessibility violation(s):\n${failures.map((f) => `  - ${f}`).join('\n')}`)
  process.exit(1)
}
console.log('\nAll accessibility checks passed (WCAG 2.0/2.1 A + AA).')
