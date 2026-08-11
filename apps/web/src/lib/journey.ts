import { importIssue, importPr, parseGitHubUrl } from '@journal/github'
import type { GitHubItemRef, IssueStory, PrStory, TimelineEvent } from '@journal/domain'

// Shared journey assembly — used by the /journey page AND the publish action,
// so the published bundle is built exactly like the page the owner saw.

/** Same-repo PR refs from the issue's cross-references, merged PRs first —
 * they are the halves the journey joins. Capped at 2 to bound import cost
 * and keep the drafting prompt coherent. */
export function sameRepoPrRefs(issue: IssueStory): GitHubItemRef[] {
  const scored: Array<{ ref: GitHubItemRef; merged: boolean }> = []
  for (const pr of issue.linkedPrs) {
    const parsed = parseGitHubUrl(pr.url)
    if (
      parsed.ok &&
      parsed.ref.kind === 'pr' &&
      parsed.ref.owner === issue.ref.owner &&
      parsed.ref.repo === issue.ref.repo
    ) {
      scored.push({ ref: parsed.ref, merged: pr.state === 'merged' })
    }
  }
  scored.sort((a, b) => Number(b.merged) - Number(a.merged))
  return scored.slice(0, 2).map((s) => s.ref)
}

/** One chronology, every event tagged with the artifact it came from. */
export function mergedJourneyEvents(issue: IssueStory, prs: PrStory[]): TimelineEvent[] {
  return [
    ...issue.events.map((e) => ({ ...e, origin: `issue #${issue.ref.number}` })),
    ...prs.flatMap((pr) => pr.events.map((e) => ({ ...e, origin: `PR #${pr.ref.number}` }))),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

export type JourneyData = { issue: IssueStory; prs: PrStory[]; events: TimelineEvent[] }

/**
 * Imports the full journey for an issue ref. A missing PR half drops rather
 * than failing the journey; zero importable PRs yields prs: [] and the
 * caller decides how to degrade.
 */
export async function loadJourney(ref: GitHubItemRef): Promise<JourneyData> {
  const issue = await importIssue(ref)
  const prs = (
    await Promise.all(sameRepoPrRefs(issue).map((prRef) => importPr(prRef).catch(() => null)))
  ).filter((p): p is PrStory => p !== null)
  return { issue, prs, events: mergedJourneyEvents(issue, prs) }
}
