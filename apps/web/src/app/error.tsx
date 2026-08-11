'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// A cut stream on a big first-ever import surfaces here: serverless hosts
// kill a response that streams too long, but the function keeps drafting
// after the disconnect and caches the result — so a short-delay retry
// succeeds. Retry automatically before asking the user to. sessionStorage
// (keyed by path, 90s window) survives the remount that reset() causes and
// caps the loop at two attempts.
const MAX_AUTO_RETRIES = 2

function autoRetryCount(): number {
  try {
    const raw = sessionStorage.getItem(`retry:${location.pathname}`)
    if (!raw) return 0
    const { n, ts } = JSON.parse(raw) as { n: number; ts: number }
    return Date.now() - ts < 90_000 ? n : 0
  } catch {
    return 0
  }
}

function bumpAutoRetryCount(n: number) {
  try {
    sessionStorage.setItem(`retry:${location.pathname}`, JSON.stringify({ n, ts: Date.now() }))
  } catch {}
}

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const [autoRetrying, setAutoRetrying] = useState(() => autoRetryCount() < MAX_AUTO_RETRIES)

  useEffect(() => {
    const n = autoRetryCount()
    if (n >= MAX_AUTO_RETRIES) {
      setAutoRetrying(false)
      return
    }
    bumpAutoRetryCount(n + 1)
    // Second attempt waits longer: it usually only needs the draft cache the
    // first killed request is still busy writing.
    const timer = setTimeout(reset, 4000 + n * 3000)
    return () => clearTimeout(timer)
  }, [reset])

  if (autoRetrying) {
    return (
      <main className="story-page">
        <div className="error-card" role="status">
          <h1>Still working on this one…</h1>
          <p>
            Big pull request — the first import needs more time than the server lets a single page
            wait. Retrying automatically; the work already done is kept.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="story-page">
      <div className="error-card" role="alert">
        <h1>Something broke on this page</h1>
        <p>The error was on our side, not in your pull request. Try again — if it keeps happening, the import for this PR hit something we don&apos;t handle yet.</p>
        <p>
          <button type="button" className="retry-btn" onClick={reset}>
            Try again
          </button>{' '}
          <Link href="/" className="back-btn">
            ← Start over
          </Link>
        </p>
      </div>
    </main>
  )
}
