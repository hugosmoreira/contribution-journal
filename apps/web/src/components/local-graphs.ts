'use client'

import { StoryGraphSchema, type StoryGraph } from '@journal/visualizations/graph'

/**
 * The user's edited map from local drafts, falling back to the server draft —
 * what you see in the editor is what gets exported and published.
 */
export function currentGraph(storageKey: string, fallback: StoryGraph): StoryGraph {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const parsed = StoryGraphSchema.safeParse(JSON.parse(raw))
      if (parsed.success) return parsed.data
    }
  } catch {
    // Unreadable local draft — use the server draft instead.
  }
  return fallback
}
