'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { deleteAccount, signOut } from '../app/actions'
import { fetchSession, type ClientSession } from './session-client'

/**
 * Header auth control. Session state is fetched client-side (see
 * session-client.ts) so server-rendered pages stay identical for every
 * visitor; until the probe answers, this renders nothing.
 */
export default function AuthMenu() {
  const [session, setSession] = useState<ClientSession | null>(null)
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    let alive = true
    void fetchSession().then((value) => {
      if (alive) setSession(value)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!session) return null

  if (!session.user) {
    if (!session.signInAvailable) return null
    return (
      <a className="auth-signin" href={`/api/auth/signin?next=${encodeURIComponent(pathname || '/')}`}>
        Sign in with GitHub
      </a>
    )
  }

  const doSignOut = () =>
    startTransition(async () => {
      await signOut()
      window.location.reload()
    })

  const doDeleteAccount = () => {
    if (
      !window.confirm(
        'Delete your account? This permanently removes your sign-in and hard-deletes every story you published. This cannot be undone.',
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await deleteAccount()
      if (result.ok) window.location.href = '/'
    })
  }

  return (
    <div className="auth-menu" ref={menuRef}>
      <button
        type="button"
        className="auth-user"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {session.user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={session.user.avatarUrl} alt="" className="avatar" width={20} height={20} />
        ) : null}
        {session.user.login}
      </button>
      {open ? (
        <div className="auth-dropdown" role="menu">
          <button type="button" role="menuitem" disabled={pending} onClick={doSignOut}>
            Sign out
          </button>
          <button type="button" role="menuitem" className="danger" disabled={pending} onClick={doDeleteAccount}>
            Delete account…
          </button>
        </div>
      ) : null}
    </div>
  )
}
