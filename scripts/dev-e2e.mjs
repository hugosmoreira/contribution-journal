// Dev server for e2e runs: identical to `npm run dev` but with the AI layer
// pinned to the deterministic null adapter. The e2e suite asserts on the
// skeleton drafts' labels, which a live model would (correctly) replace —
// and test runs should not spend API tokens. Env set here wins over
// .env.local because Next.js only fills variables that are not already set.
import { spawn } from 'node:child_process'

const child = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  // Only JOURNAL_DISABLE_AI is forced. Everything else — including
  // JOURNAL_API_TOKEN — comes from apps/web/.env.local, so the server and
  // the test suite can never disagree about the value.
  env: { ...process.env, JOURNAL_DISABLE_AI: '1' },
})
child.on('exit', (code) => process.exit(code ?? 0))
