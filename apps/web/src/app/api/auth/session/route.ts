import { NextResponse } from 'next/server'
import { getSession, signInAvailable } from '../../../../lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Session probe for client components. Fetched client-side so server-rendered
 * pages stay cacheable and identical for every visitor; the response carries
 * no ids or tokens — just what the header needs to render.
 */
export async function GET() {
  const session = await getSession()
  return NextResponse.json(
    {
      signInAvailable: signInAvailable(),
      user: session ? { login: session.login, name: session.name, avatarUrl: session.avatarUrl } : null,
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
