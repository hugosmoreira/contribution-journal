import { type NextRequest, NextResponse } from 'next/server'
import { OAUTH_STATE_COOKIE, buildAuthorizeUrl, newRandomToken, safeNextPath } from '@journal/auth'
import { requestOrigin, signInAvailable } from '../../../../lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Starts the GitHub OAuth dance. The state nonce rides in an httpOnly cookie
 * and must round-trip through GitHub untouched (CSRF guard); the post-login
 * destination rides alongside it, never in the authorize URL.
 */
export function GET(request: NextRequest) {
  const origin = requestOrigin(request)
  const next = safeNextPath(request.nextUrl.searchParams.get('next'))
  if (!signInAvailable()) return NextResponse.redirect(new URL(next, origin))

  const state = newRandomToken(24)
  const response = NextResponse.redirect(
    buildAuthorizeUrl({
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID as string,
      redirectUri: new URL('/api/auth/callback', origin).toString(),
      state,
    }),
  )
  response.cookies.set(OAUTH_STATE_COOKIE, JSON.stringify({ state, next }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  })
  return response
}
