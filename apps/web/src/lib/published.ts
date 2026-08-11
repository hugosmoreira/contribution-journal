import { cache } from 'react'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import {
  IssueStorySchema,
  PrStorySchema,
  TimelineEventSchema,
  type IssueStory,
  type PrStory,
  type TimelineEvent,
} from '@journal/domain'
import { StoryGraphSchema, type StoryGraph } from '@journal/visualizations/graph'
import { contributions, databaseConfigured, db } from '@journal/db'

// One published row per (owner, repo, number, kind). Each kind stores its own
// story payload and map set; the schemas below are the read/write gate.

export const PublishKindSchema = z.enum(['pr', 'issue', 'journey'])
export type PublishKind = z.infer<typeof PublishKindSchema>

export const MapsSchema = z.object({
  problemSolution: StoryGraphSchema,
  reviewEvolution: StoryGraphSchema.optional(),
})
export type ExportedMaps = z.infer<typeof MapsSchema>

export const IssueMapsSchema = z.object({ issueExploration: StoryGraphSchema })
export type IssueMaps = z.infer<typeof IssueMapsSchema>

export const JourneyMapsSchema = z.object({ journey: StoryGraphSchema })
export type JourneyMaps = z.infer<typeof JourneyMapsSchema>

export const JourneyBundleSchema = z.object({
  issue: IssueStorySchema,
  prs: z.array(PrStorySchema).max(4),
  events: z.array(TimelineEventSchema),
})
export type JourneyBundle = z.infer<typeof JourneyBundleSchema>

type PublishedBase = { visibility: 'unlisted' | 'public'; updatedAt: Date }

export type PublishedStory = PublishedBase &
  (
    | { kind: 'pr'; story: PrStory; maps: ExportedMaps }
    | { kind: 'issue'; story: IssueStory; maps: IssueMaps }
    | { kind: 'journey'; bundle: JourneyBundle; maps: JourneyMaps }
  )

/**
 * Loads a published story by share slug. Returns null (never throws) for
 * missing rows, private rows, schema drift, or an unconfigured database —
 * the public page 404s instead of erroring. Wrapped in React cache() so
 * generateMetadata, the page, and the OG image share one query per request.
 */
export const getPublished = cache(async (slug: string): Promise<PublishedStory | null> => {
  if (!databaseConfigured() || !/^[A-Za-z0-9_-]{6,32}$/.test(slug)) return null
  try {
    const row = await db().query.contributions.findFirst({
      where: eq(contributions.shareSlug, slug),
    })
    if (!row || row.visibility === 'private') return null
    const base = { visibility: row.visibility, updatedAt: row.updatedAt }
    // Rows from before the kind column default to 'pr' at the database layer.
    if (row.kind === 'issue') {
      return {
        ...base,
        kind: 'issue',
        story: IssueStorySchema.parse(row.story),
        maps: IssueMapsSchema.parse(row.maps),
      }
    }
    if (row.kind === 'journey') {
      return {
        ...base,
        kind: 'journey',
        bundle: JourneyBundleSchema.parse(row.story),
        maps: JourneyMapsSchema.parse(row.maps),
      }
    }
    return {
      ...base,
      kind: 'pr',
      story: PrStorySchema.parse(row.story),
      maps: MapsSchema.parse(row.maps),
    }
  } catch {
    return null
  }
})

/** The events a public page's timeline shows for a published row. */
export function publishedEvents(published: PublishedStory): TimelineEvent[] {
  return published.kind === 'journey' ? published.bundle.events : published.story.events
}

/** Display title/refline shared by the public page and OG image. */
export function publishedTitle(published: PublishedStory): {
  title: string
  refLine: string
  state: string
} {
  if (published.kind === 'journey') {
    const { issue } = published.bundle
    return {
      title: issue.title,
      refLine: `${issue.ref.owner}/${issue.ref.repo} issue #${issue.ref.number} — full journey`,
      state: issue.state,
    }
  }
  const { story } = published
  const kindLabel = published.kind === 'issue' ? 'issue #' : '#'
  return {
    title: story.title,
    refLine: `${story.ref.owner}/${story.ref.repo} ${kindLabel}${story.ref.number}`,
    state: story.state,
  }
}
