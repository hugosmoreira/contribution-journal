import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  IssueStorySchema,
  PrStorySchema,
  type GitHubItemRef,
  type IssueStory,
  type PrStory,
} from '@journal/domain'

// v0.1-slice cache: JSON on disk so repeated imports during a session cost
// zero GitHub requests. Replaced by Postgres-backed ImportSnapshots when
// persistence lands (ADR-0002); the shape mirrors that model on purpose.
// Serverless hosts have read-only project dirs; JOURNAL_CACHE_DIR points the
// file caches somewhere writable (e.g. /tmp/journal-cache on Netlify).
const CACHE_DIR = join(process.env.JOURNAL_CACHE_DIR || join(process.cwd(), '.cache'), 'imports')
const TTL_MS = 10 * 60 * 1000

function cachePath(ref: GitHubItemRef): string {
  // '!' cannot appear in owner/repo (domain schema allows only [A-Za-z0-9_.-]),
  // so the key is injective — 'a__b/c' and 'a/b__c' get distinct files — and
  // the filename contains no path separators, so it cannot escape CACHE_DIR.
  return join(CACHE_DIR, `${ref.owner}!${ref.repo}!${ref.kind}-${ref.number}.json`)
}

function sameRef(a: GitHubItemRef, b: GitHubItemRef): boolean {
  return a.owner === b.owner && a.repo === b.repo && a.number === b.number && a.kind === b.kind
}

export function readCachedStory(ref: GitHubItemRef): PrStory | null {
  try {
    const raw = JSON.parse(readFileSync(cachePath(ref), 'utf8'))
    if (typeof raw.fetchedAt !== 'number' || Date.now() - raw.fetchedAt > TTL_MS) return null
    const story = PrStorySchema.parse(raw.story)
    // Belt and braces: never serve a story whose identity differs from the request.
    return sameRef(story.ref, ref) ? story : null
  } catch {
    return null
  }
}

export function readCachedIssue(ref: GitHubItemRef): IssueStory | null {
  try {
    const raw = JSON.parse(readFileSync(cachePath(ref), 'utf8'))
    if (typeof raw.fetchedAt !== 'number' || Date.now() - raw.fetchedAt > TTL_MS) return null
    const story = IssueStorySchema.parse(raw.story)
    return sameRef(story.ref, ref) ? story : null
  } catch {
    return null
  }
}

// Anonymous callers can mint one cache file per PR; without a sweep the
// directory grows forever. Expired entries go first, then oldest-first
// eviction down to the cap.
const MAX_CACHE_FILES = 200

function sweepCache(): void {
  try {
    const files = readdirSync(CACHE_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const path = join(CACHE_DIR, f)
        return { path, mtime: statSync(path).mtimeMs }
      })
    const now = Date.now()
    const live = files.filter((f) => {
      if (now - f.mtime > TTL_MS) {
        try {
          unlinkSync(f.path)
        } catch {
          return true
        }
        return false
      }
      return true
    })
    if (live.length > MAX_CACHE_FILES) {
      for (const f of live.sort((a, b) => a.mtime - b.mtime).slice(0, live.length - MAX_CACHE_FILES)) {
        try {
          unlinkSync(f.path)
        } catch {
          // Best effort.
        }
      }
    }
  } catch {
    // Sweeping is best-effort.
  }
}

export function writeCachedStory(ref: GitHubItemRef, story: PrStory | IssueStory): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(cachePath(ref), JSON.stringify({ fetchedAt: Date.now(), story }))
    sweepCache()
  } catch {
    // Cache is best-effort; failing to write must never break an import.
  }
}
