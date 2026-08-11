'use client'

// Client-side session probe, shared by AuthMenu and PublishMenu. The result
// is cached per page load (one network call even with several consumers);
// auth changes reload the page, which naturally resets it.

export type ClientSession = {
  signInAvailable: boolean
  user: { login: string; name: string | null; avatarUrl: string | null } | null
}

const SIGNED_OUT: ClientSession = { signInAvailable: false, user: null }

let cached: Promise<ClientSession> | null = null

export function fetchSession(): Promise<ClientSession> {
  if (!cached) {
    cached = fetch('/api/auth/session', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<ClientSession>) : SIGNED_OUT))
      .catch(() => SIGNED_OUT)
  }
  return cached
}
