// Prints the five launch health metrics from the dev
// database. Run: node scripts/metrics-report.mjs
import postgres from 'postgres'

const url = process.env.DATABASE_URL ?? 'postgres://journal:journal_dev@localhost:5544/journal'
const sql = postgres(url, { max: 1 })

const [imports] = await sql`select count(distinct ref)::int as n from metric_events where kind = 'import'`
const [completed] = await sql`select count(distinct ref)::int as n from metric_events where kind = 'first_edit'`
const [published] = await sql`select count(distinct ref)::int as n from metric_events where kind = 'publish'`
const [views] = await sql`select count(*)::int as n from metric_events where kind = 'public_view'`
const [returners] = await sql`
  select count(*)::int as n from (
    select ip_hash from metric_events
    where kind = 'import' and ip_hash is not null
    group by ip_hash
    having count(distinct date_trunc('day', created_at)) > 1
  ) t`
const [visitors] = await sql`
  select count(distinct ip_hash)::int as n from metric_events
  where kind = 'import' and ip_hash is not null`
const [medianMinutes] = await sql`
  select percentile_cont(0.5) within group (order by extract(epoch from (f.first_edit - i.first_import)) / 60)::numeric(10,1) as m
  from (select ref, min(created_at) as first_import from metric_events where kind = 'import' group by ref) i
  join (select ref, min(created_at) as first_edit from metric_events where kind = 'first_edit' group by ref) f using (ref)
  where f.first_edit >= i.first_import`

const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : 'n/a')

console.log('Launch health metrics')
console.log('---------------------')
console.log(`Stories imported (distinct PRs):     ${imports.n}`)
console.log(`Import → completed (first edit):     ${pct(completed.n, imports.n)}  (target > 40%, kill < 20%)`)
console.log(`Share rate (published / completed):  ${pct(published.n, completed.n)}  (target > 25%, kill < 10%)`)
console.log(`Return rate (multi-day visitors):    ${pct(returners.n, visitors.n)}  (target > 30%, kill < 15%)`)
console.log(`Median import → first edit:          ${medianMinutes?.m ?? 'n/a'} min  (target < 8 min proxy)`)
console.log(`Public story views:                  ${views.n}`)
console.log(`Recall completion:                   n/a until v0.4`)

await sql.end()
