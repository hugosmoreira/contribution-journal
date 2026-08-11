import type { Metadata } from 'next'
import './globals.css'

// JOURNAL_BASE_URL wins (set behind a proxy); URL is Netlify's build-time
// primary site URL. Without a metadataBase the og:image URL would be relative
// and link previews on X/Slack would not resolve it.
const base = process.env.JOURNAL_BASE_URL ?? process.env.URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: 'Contribution Journal — understand the work, not just the diff',
  description:
    'Turn a GitHub pull request into a visual, evidence-backed story you can understand, explain, and remember. Read-only, private by default.',
  openGraph: {
    title: 'Contribution Journal',
    description:
      'Turn a pull request into a story people can follow. Evidence-linked timeline and editable maps from any public GitHub PR.',
    url: '/',
    siteName: 'Contribution Journal',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
