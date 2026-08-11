import { ImageResponse } from 'next/og'

// Landing-page Open Graph image — what the bare domain looks like pasted into
// X or Slack. Static by design: same visual language as the per-story card in
// s/[slug]/opengraph-image.tsx, with a schematic map showing the one mechanism
// that matters (drafted nodes are dashed, confirmed nodes are solid).
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Contribution Journal — turn a pull request into a story people can follow.'

const KIND_COLORS: Record<string, string> = {
  symptom: '#7c8cff',
  hypothesis: '#fbbf24',
  root_cause: '#f87171',
  fix: '#60a5fa',
  validation: '#4ade80',
  outcome: '#b794f6',
}

// Two explicit rows: flex wrapping at an arrow would leave it dangling at a
// row edge, and the card has to look deliberate at every width it never gets.
const PREVIEW_ROWS = [
  [
    { kind: 'symptom', label: 'Flaky e2e test', confirmed: true },
    { kind: 'hypothesis', label: 'Race in teardown', confirmed: false },
    { kind: 'root_cause', label: 'Shared temp dir', confirmed: false },
  ],
  [
    { kind: 'fix', label: 'Isolate per test', confirmed: true },
    { kind: 'validation', label: '40 green runs', confirmed: true },
    { kind: 'outcome', label: 'Merged', confirmed: true },
  ],
]

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px 72px',
          backgroundColor: '#0b0e14',
          backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% -20%, rgba(124,140,255,0.25), transparent)',
          color: '#e7eaf2',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: '#7c8cff', fontSize: 24, letterSpacing: 4, textTransform: 'uppercase' }}>
            Contribution Journal
          </span>
          <div style={{ display: 'flex', fontSize: 54, fontWeight: 700, lineHeight: 1.15, marginTop: 26, maxWidth: 1020 }}>
            Turn a pull request into a story people can follow.
          </div>
          <div style={{ display: 'flex', color: '#8b94a8', fontSize: 27, marginTop: 18, maxWidth: 960 }}>
            Paste a public GitHub PR. Every drafted claim cites the commit, comment, or review behind it.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {PREVIEW_ROWS.map((row, r) => (
            <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {row.map((node, i) => (
                <div key={node.kind} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      border: `2px ${node.confirmed ? 'solid' : 'dashed'} ${KIND_COLORS[node.kind] ?? '#8b94a8'}`,
                      borderRadius: 12,
                      padding: '10px 16px',
                      backgroundColor: '#11151f',
                    }}
                  >
                    <span style={{ color: KIND_COLORS[node.kind] ?? '#8b94a8', fontSize: 15, textTransform: 'uppercase' }}>
                      {node.kind.replace('_', ' ')}
                    </span>
                    <span style={{ color: '#e7eaf2', fontSize: 18 }}>{node.label}</span>
                  </div>
                  {i < row.length - 1 ? <span style={{ color: '#46506a', fontSize: 26 }}>→</span> : null}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#8b94a8', fontSize: 26 }}>Open source · no account needed</span>
          <span style={{ color: '#5b6478', fontSize: 22 }}>
            GitHub records what you did. This is where you learn from it.
          </span>
        </div>
      </div>
    ),
    size,
  )
}
