import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Deployment diagnostics: reports which pieces are configured and whether the
 * database answers, with timings. Never exposes secrets — only the database
 * HOST and PORT (needed to distinguish the IPv6-only direct Supabase host
 * from the IPv4 pooler, the classic serverless misconfiguration).
 */
export async function GET() {
  const { draftBudgetMs } = await import('@journal/ai')
  const out: Record<string, unknown> = {
    databaseUrlSet: Boolean(process.env.DATABASE_URL),
    anthropicKeySet: Boolean(process.env.ANTHROPIC_API_KEY),
    deepseekKeySet: Boolean(process.env.DEEPSEEK_API_KEY),
    aiProvider: process.env.JOURNAL_AI_PROVIDER ?? '(auto)',
    aiModel: process.env.JOURNAL_AI_MODEL ?? '(default)',
    draftBudgetMs: draftBudgetMs(),
    githubTokenSet: Boolean(process.env.GITHUB_TOKEN),
    cacheDir: process.env.JOURNAL_CACHE_DIR ?? '(project dir)',
  }

  const url = process.env.DATABASE_URL
  if (url) {
    try {
      const u = new URL(url)
      out.dbHost = u.hostname
      out.dbPort = u.port || '5432'
    } catch {
      out.dbHost = 'unparseable'
    }
    const started = Date.now()
    try {
      const postgres = (await import('postgres')).default
      const sql = postgres(url, { max: 1, connect_timeout: 8 })
      await sql`select 1`
      await sql.end({ timeout: 1 })
      out.dbConnectMs = Date.now() - started
      out.db = 'ok'
    } catch (err) {
      out.dbConnectMs = Date.now() - started
      out.db = 'error'
      const anyErr = err as { message?: string; code?: string; name?: string }
      out.dbError = [anyErr.name, anyErr.code, anyErr.message?.slice(0, 200)]
        .filter(Boolean)
        .join(' · ')
    }
  }

  return NextResponse.json(out)
}
