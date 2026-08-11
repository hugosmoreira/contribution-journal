import type { PrStory } from '@journal/domain'
import type { StoryGraph } from '@journal/visualizations'
import MapEditor from './MapEditor'
import ExportMenu from './ExportMenu'
import PublishMenu from './PublishMenu'

// Server components that AWAIT a draft promise. The story page starts both
// drafts, renders the header and timeline immediately, and suspends only
// these — so a slow model call delays the maps, never the evidence.
//
// The promises come from `getAssistant()`, which catches every failure and
// resolves to a skeleton draft, and from `layoutGraph`, which falls back to
// `chainLayout`. Neither rejects, so no Suspense boundary can error here.

type Props = {
  story: PrStory
  psPromise: Promise<StoryGraph>
  reviewPromise: Promise<StoryGraph>
  relayoutAction: (graph: StoryGraph) => Promise<StoryGraph>
  onFirstEdit: () => Promise<void>
  publishable: boolean
}

function storageKey(prefix: string, story: PrStory): string {
  return `${prefix}:${story.ref.owner}/${story.ref.repo}/${story.ref.number}`
}

export async function StoryActions({
  story,
  psPromise,
  reviewPromise,
  publishable,
}: Pick<Props, 'story' | 'psPromise' | 'reviewPromise' | 'publishable'>) {
  const [psDraft, reviewDraft] = await Promise.all([psPromise, reviewPromise])
  const review = reviewDraft.nodes.length > 0 ? reviewDraft : null
  return (
    <>
      {publishable ? (
        <PublishMenu
          refValue={story.ref}
          kind="pr"
          slots={[
            { key: 'problemSolution', prefix: 'psmap', draft: psDraft },
            ...(review
              ? [{ key: 'reviewEvolution', prefix: 'remap', draft: review, optional: true }]
              : []),
          ]}
        />
      ) : null}
      <ExportMenu story={story} psDraft={psDraft} reviewDraft={review} />
    </>
  )
}

export async function ProblemSolutionSection({
  story,
  psPromise,
  relayoutAction,
  onFirstEdit,
}: Pick<Props, 'story' | 'psPromise' | 'relayoutAction' | 'onFirstEdit'>) {
  const draft = await psPromise
  // Honest provenance labeling (SPEC_V0.1 §3.5): say whether a model drafted
  // this or it was assembled from evidence alone.
  const aiDrafted = draft.nodes.some((n) => n.provenance === 'ai')
  return (
    <section>
      <div className="section-head">
        <h2>Problem → solution map</h2>
        <span className="provenance">
          {aiDrafted
            ? 'AI-drafted from the evidence — dashed nodes are unconfirmed, every node is yours to edit'
            : 'assembled from evidence — no AI; dashed nodes are unconfirmed, every node is yours to edit'}
        </span>
      </div>
      <MapEditor
        draft={draft}
        storageKey={storageKey('psmap', story)}
        relayoutAction={relayoutAction}
        onFirstEdit={onFirstEdit}
      />
    </section>
  )
}

export async function ReviewEvolutionSection({
  story,
  reviewPromise,
  relayoutAction,
}: Pick<Props, 'story' | 'reviewPromise' | 'relayoutAction'>) {
  const draft = await reviewPromise
  // A PR with no review feedback has no review story — render nothing rather
  // than an empty frame.
  if (draft.nodes.length === 0) return null
  return (
    <section>
      <div className="section-head">
        <h2>Review evolution</h2>
        <span className="provenance">
          feedback → your reading → the change → the lesson, per review thread
        </span>
      </div>
      <MapEditor draft={draft} storageKey={storageKey('remap', story)} relayoutAction={relayoutAction} />
    </section>
  )
}

/** Shown while a draft is still being written. */
export function MapPending({ heading, note }: { heading: string; note: string }) {
  return (
    <section>
      <div className="section-head">
        <h2>{heading}</h2>
        <span className="provenance">{note}</span>
      </div>
      <div className="map-pending" role="status" aria-live="polite">
        <span className="spinner" aria-hidden />
        <p>Reading the evidence and drafting this map…</p>
      </div>
    </section>
  )
}
