import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GitHubItemRef } from '@journal/domain'
import { normalizeAgentNotes, type AgentNote } from './index'

// Agent notes have to outlive the capture request that carried them: the
// author opens the story later, in a browser, and the page must draft with
// the SAME context the capture used — otherwise the agent's account silently
// vanishes from the map and the draft is paid for twice.
//
// Disk-backed like the import and draft caches, and replaced by Postgres on
// the same schedule (ADR-0002).

const NOTES_DIR = join(process.env.JOURNAL_CACHE_DIR || join(process.cwd(), '.cache'), 'agent-notes')
const TTL_MS = 30 * 24 * 60 * 60 * 1000

function notesPath(ref: GitHubItemRef): string {
  return join(NOTES_DIR, `${ref.owner.toLowerCase()}!${ref.repo.toLowerCase()}!${ref.number}.json`)
}

export function readAgentNotes(ref: GitHubItemRef): AgentNote[] {
  try {
    const raw = JSON.parse(readFileSync(notesPath(ref), 'utf8'))
    if (typeof raw.savedAt !== 'number' || Date.now() - raw.savedAt > TTL_MS) return []
    // Re-normalize on read: ids are reassigned server-side, so a hand-edited
    // or corrupted file cannot inject ids the drafting layer would trust.
    return normalizeAgentNotes((raw.notes as AgentNote[] | undefined)?.map((n) => n.text))
  } catch {
    return []
  }
}

/**
 * Empty input is ignored rather than treated as a clear: a later capture
 * that happens to carry no notes must not wipe context an earlier one gave.
 * A capture WITH notes replaces them, so re-capturing is how you correct
 * yourself.
 */
export function writeAgentNotes(ref: GitHubItemRef, notes: AgentNote[]): void {
  if (notes.length === 0) return
  try {
    mkdirSync(NOTES_DIR, { recursive: true })
    writeFileSync(notesPath(ref), JSON.stringify({ savedAt: Date.now(), notes }))
  } catch (err) {
    console.error('[ai] could not persist agent notes:', err instanceof Error ? err.message : err)
  }
}
