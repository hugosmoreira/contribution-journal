'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import type { GitHubItemRef } from '@journal/domain'
import type { StoryGraph } from '@journal/visualizations/graph'
import { attachOwnership, claimStory, publishState, publishStory, unpublishStory } from '../app/actions'
import { currentGraph } from './local-graphs'
import { fetchSession } from './session-client'

export type PublishKind = 'pr' | 'issue' | 'journey'

/** One map in the published payload: `key` is the payload field name, and
 * `prefix` the localStorage namespace holding the user's edits. */
export type PublishSlot = {
  key: string
  prefix: string
  draft: StoryGraph
  /** Optional slots are dropped when empty (e.g. a PR with no review map). */
  optional?: boolean
}

function tokenKey(kind: PublishKind, refValue: GitHubItemRef): string {
  // PR tokens predate the kind concept; keeping their key shape preserves
  // ownership tokens already sitting in publishers' browsers.
  const base = `${refValue.owner}/${refValue.repo}/${refValue.number}`
  return kind === 'pr' ? `pubtoken:${base}` : `pubtoken:${kind}:${base}`
}

const ERRORS: Record<string, string> = {
  not_owner: 'This story was published from a different browser — only its publisher can change it.',
  not_configured: 'Publishing is not configured on this server (no database).',
  rate_limited: 'Publish limit reached for today — try again tomorrow.',
  incomplete_map: 'The map needs at least its problem and outcome nodes (plus a fix, for PR and journey stories) to publish.',
  error: 'Publishing failed — is the database running? (docker compose up -d)',
}

const CLAIM_ERRORS: Record<string, string> = {
  signed_out: 'Sign in with GitHub first, then claim the story.',
  not_author: "Claiming needs the story author's GitHub account — you're signed in as someone else.",
  not_found: 'This story is no longer published.',
  not_configured: ERRORS.not_configured,
  error: 'Claiming failed — try again in a moment.',
}

export default function PublishMenu({
  refValue,
  kind = 'pr',
  slots,
}: {
  refValue: GitHubItemRef
  kind?: PublishKind
  slots: PublishSlot[]
}) {
  const [slug, setSlug] = useState<string | null>(null)
  const [foreign, setForeign] = useState(false)
  const [claimable, setClaimable] = useState(false)
  const [visibility, setVisibility] = useState<'unlisted' | 'public'>('unlisted')
  const [ownerToken, setOwnerToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  // The share slug lives server-side and is revealed only to owners; fetch
  // fresh on mount so stale local state can't show dead links. Ownership is
  // the token in this browser's storage OR the signed-in account.
  useEffect(() => {
    let token: string | null = null
    try {
      token = localStorage.getItem(tokenKey(kind, refValue))
    } catch {
      // Storage blocked — treat as no token.
    }
    setOwnerToken(token)
    void Promise.all([publishState(refValue, kind, token), fetchSession()]).then(([state, session]) => {
      if (!state.published) {
        setSlug(null)
        setForeign(false)
        setClaimable(false)
      } else if (state.owned) {
        setSlug(state.slug)
        setForeign(false)
        setClaimable(false)
        if (state.visibility === 'public') setVisibility('public')
        // Anonymous publishes are claimable on sign-in (SPEC §3.9): quietly
        // attach token-owned rows to the account so they follow the user.
        if (session.user && token) void attachOwnership(refValue, kind, token)
      } else {
        setSlug(null)
        setForeign(true)
        setClaimable(state.claimable)
      }
    })
  }, [refValue, kind])

  const claim = useCallback(() => {
    setError(null)
    startTransition(async () => {
      const result = await claimStory(refValue, kind)
      if (!result.ok) {
        setError(CLAIM_ERRORS[result.code] ?? CLAIM_ERRORS.error)
        return
      }
      const state = await publishState(refValue, kind, null)
      if (state.published && state.owned) {
        setSlug(state.slug)
        setForeign(false)
        setClaimable(false)
        if (state.visibility === 'public') setVisibility('public')
      }
    })
  }, [refValue, kind])

  const collectMaps = useCallback(() => {
    const key = `${refValue.owner}/${refValue.repo}/${refValue.number}`
    const maps: Record<string, StoryGraph> = {}
    for (const slot of slots) {
      const graph = currentGraph(`${slot.prefix}:${key}`, slot.draft)
      if (slot.optional && graph.nodes.length === 0) continue
      maps[slot.key] = graph
    }
    return maps
  }, [refValue, slots])

  const publish = useCallback(() => {
    setError(null)
    startTransition(async () => {
      const result = await publishStory(refValue, kind, collectMaps(), visibility, ownerToken)
      if (!result.ok) {
        if (result.code === 'not_owner') setForeign(true)
        setError(ERRORS[result.code] ?? ERRORS.error)
        return
      }
      setSlug(result.slug)
      // ownerToken is null when this browser owns the row through the
      // signed-in account alone — nothing to store in that case.
      if (result.ownerToken) {
        setOwnerToken(result.ownerToken)
        try {
          localStorage.setItem(tokenKey(kind, refValue), result.ownerToken)
        } catch {
          // Best effort.
        }
      }
    })
  }, [refValue, kind, collectMaps, visibility, ownerToken])

  const unpublish = useCallback(() => {
    if (!window.confirm('Delete the published story? The share link will stop working immediately.')) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await unpublishStory(refValue, kind, ownerToken)
      if (!result.ok) {
        setError(ERRORS[result.code] ?? ERRORS.error)
        return
      }
      setSlug(null)
      try {
        localStorage.removeItem(tokenKey(kind, refValue))
      } catch {
        // Best effort.
      }
      setOwnerToken(null)
    })
  }, [refValue, kind, ownerToken])

  const copyLink = useCallback(() => {
    if (!slug) return
    const url = new URL(`/s/${slug}`, window.location.origin).toString()
    const done = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done, () => setError('Copy failed — copy the link text manually.'))
    } else {
      setError(`Copy this link manually: ${url}`)
    }
  }, [slug])

  return (
    <div className="publish-menu">
      {slug ? (
        <>
          <a className="share-link" href={`/s/${slug}`} target="_blank" rel="noreferrer">
            /s/{slug}
          </a>
          <button type="button" onClick={copyLink}>
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={publish}
            title="Push your latest edits to the published page"
          >
            {pending ? 'Saving…' : 'Update'}
          </button>
          <button type="button" className="danger" disabled={pending} onClick={unpublish}>
            Unpublish
          </button>
        </>
      ) : foreign ? (
        claimable ? (
          <>
            <span className="publish-note">published by someone else</span>
            <button
              type="button"
              disabled={pending}
              onClick={claim}
              title="GitHub says this story is yours — claiming takes over the published copy"
            >
              {pending ? 'Claiming…' : 'This story is yours — claim it'}
            </button>
          </>
        ) : (
          <span className="publish-note" title="Only the browser that published this story can change it">
            published elsewhere
          </span>
        )
      ) : (
        <>
          <select
            aria-label="Story visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as 'unlisted' | 'public')}
          >
            <option value="unlisted">unlisted link</option>
            <option value="public">public</option>
          </select>
          <button type="button" disabled={pending} onClick={publish}>
            {pending ? 'Publishing…' : 'Publish'}
          </button>
        </>
      )}
      {error ? <span className="publish-error">{error}</span> : null}
    </div>
  )
}
