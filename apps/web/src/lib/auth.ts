import { randomBytes } from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  encryptToken,
  hashSessionToken,
  newRandomToken,
  oauthConfigured,
  type GitHubUser,
} from '@journal/auth'
import { databaseConfigured, db, schema } from '@journal/db'

export type SessionUser = {
  userId: string
  login: string
  name: string | null
  avatarUrl: string | null
}

/** Sign-in needs both the OAuth app credentials and the database. */
export function signInAvailable(): boolean {
  return oauthConfigured() && databaseConfigured()
}

/** Deployments behind a proxy can pin the public origin explicitly. */
export function requestOrigin(request: { nextUrl: { origin: string } }): string {
  return process.env.JOURNAL_BASE_URL ?? request.nextUrl.origin
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
} as const

/**
 * The signed-in user for this request, or null. Wrapped in React cache() so
 * the page, its actions, and the session route share one lookup per request.
 * Fails closed: any storage or cookie problem reads as signed out.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  try {
    if (!databaseConfigured()) return null
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    if (!token) return null
    const session = await db().query.sessions.findFirst({
      where: eq(schema.sessions.tokenHash, hashSessionToken(token)),
    })
    if (!session || session.expiresAt.getTime() < Date.now()) return null
    const user = await db().query.users.findFirst({ where: eq(schema.users.id, session.userId) })
    if (!user) return null
    return { userId: user.id, login: user.login, name: user.name, avatarUrl: user.avatarUrl }
  } catch {
    return null
  }
})

/**
 * Upserts on GitHub's numeric id (logins are renameable) and refreshes the
 * profile fields. The access token is stored ONLY as AES-256-GCM ciphertext,
 * and only when JOURNAL_SECRET is configured — otherwise it is dropped
 * (SPEC §3.9: tokens server-side, encrypted, never in browser storage).
 */
export async function upsertUser(ghUser: GitHubUser, accessToken: string): Promise<string> {
  const accessTokenEnc = encryptToken(accessToken, process.env.JOURNAL_SECRET)
  const profile = {
    login: ghUser.login,
    name: ghUser.name,
    avatarUrl: ghUser.avatarUrl,
    accessTokenEnc,
    updatedAt: new Date(),
  }
  const rows = await db()
    .insert(schema.users)
    .values({ id: randomBytes(12).toString('base64url'), githubId: ghUser.githubId, ...profile })
    .onConflictDoUpdate({ target: schema.users.githubId, set: profile })
    .returning({ id: schema.users.id })
  const id = rows[0]?.id
  if (!id) throw new Error('user upsert returned no row')
  return id
}

/** Creates a session row and returns the raw cookie value (never stored). */
export async function createSession(userId: string): Promise<string> {
  const token = newRandomToken(32)
  await db()
    .insert(schema.sessions)
    .values({
      tokenHash: hashSessionToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
    })
  return token
}

/** Deletes the caller's session row; cookie clearing is the caller's job. */
export async function destroySessionRow(token: string): Promise<void> {
  await db().delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashSessionToken(token)))
}
