import { type NextRequest, NextResponse } from 'next/server'
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  exchangeCodeForToken,
  fetchGitHubUser,
  safeNextPath,
  tokensEqual,
} from '@journal/auth'
import {
  createSession,
  requestOrigin,
  sessionCookieOptions,
  signInAvailable,
  upsertUser,
} from '../../../../lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Completes the GitHub OAuth dance. Every failure redirects home with an
 * error CODE only — GitHub error detail goes to the server log, never the
 * browser (the home page allowlists which codes it will render).
 */
export async function GET(request: NextRequest) {
  const origin = requestOrigin(request)
  const fail = (code: string) => {
    const response = NextResponse.redirect(new URL(`/?error=${code}`, origin))
    response.cookies.delete(OAUTH_STATE_COOKIE)
    return response
  }
  if (!signInAvailable()) return NextResponse.redirect(new URL('/', origin))

  let next = '/'
  try {
    const stateCookie = request.cookies.get(OAUTH_STATE_COOKIE)?.value
    const stateParam = request.nextUrl.searchParams.get('state')
    const code = request.nextUrl.searchParams.get('code')
    if (!stateCookie || !stateParam) return fail('auth_state')
    const parsed = JSON.parse(stateCookie) as { state?: string; next?: string }
    if (!parsed.state || !tokensEqual(parsed.state, stateParam)) return fail('auth_state')
    next = safeNextPath(parsed.next)
    // The user pressed "cancel" on GitHub's screen — not an error.
    if (!code) return fail('auth_denied')

    const accessToken = await exchangeCodeForToken({
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET as string,
      code,
      redirectUri: new URL('/api/auth/callback', origin).toString(),
    })
    const ghUser = await fetchGitHubUser(accessToken)
    const userId = await upsertUser(ghUser, accessToken)
    const sessionToken = await createSession(userId)

    const response = NextResponse.redirect(new URL(next, origin))
    response.cookies.delete(OAUTH_STATE_COOKIE)
    response.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions)
    return response
  } catch (err) {
    console.error('[auth] callback failed:', err instanceof Error ? err.message : err)
    return fail('auth_github')
  }
}
