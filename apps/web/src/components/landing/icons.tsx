import type { ReactNode } from 'react'

// Landing-page icon set (inline SVG, no dependency). All icons are decorative:
// every use pairs them with a written label, so they stay aria-hidden.

type IconProps = { size?: number; strokeWidth?: number }

function Svg({
  size = 10,
  strokeWidth = 2.2,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function IconLink(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <line x1="8" x2="16" y1="12" y2="12" />
    </Svg>
  )
}

export function IconCheck(props: IconProps) {
  return (
    <Svg strokeWidth={2.5} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  )
}

export function IconAsterisk(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 6v12" />
      <path d="M17.196 9 6.804 15" />
      <path d="m6.804 9 10.392 6" />
    </Svg>
  )
}

export function IconCross(props: IconProps) {
  return (
    <Svg strokeWidth={2.5} {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Svg>
  )
}

export function IconIssue(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconPr(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" x2="6" y1="9" y2="21" />
    </Svg>
  )
}

export function IconMerge(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </Svg>
  )
}

export function IconLock(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Svg>
  )
}

export function IconComment(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  )
}

export function IconCommit(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <circle cx="12" cy="12" r="3" />
      <line x1="3" x2="9" y1="12" y2="12" />
      <line x1="15" x2="21" y1="12" y2="12" />
    </Svg>
  )
}

/** Product mark: two graph nodes joined by an edge. */
export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" aria-hidden="true">
      <circle cx="5" cy="15.5" r="3" fill="#7DB1FF" />
      <circle cx="16" cy="5" r="2.6" fill="none" stroke="#7DB1FF" strokeWidth="1.6" />
      <path d="M7.2 13.2 13.9 7" stroke="#7DB1FF" strokeWidth="1.6" />
    </svg>
  )
}

export function ArrowUp() {
  return (
    <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden="true">
      <path d="M8 20V6 M2 11l6-6 6 6" fill="none" stroke="#7DB1FF" strokeWidth="1.6" />
    </svg>
  )
}

// ---------- Semantic state chips ----------

export type ChipKind =
  | 'evidence'
  | 'confirmed'
  | 'draft'
  | 'inferred'
  | 'rejected'
  | 'neutral'
  | 'ink'

const DEFAULT_ICON: Record<ChipKind, ReactNode> = {
  evidence: <IconLink />,
  confirmed: <IconCheck />,
  draft: <IconAsterisk />,
  inferred: <IconAsterisk />,
  rejected: <IconCross />,
  neutral: null,
  ink: null,
}

/**
 * One of the five semantic states (plus neutral/ink). Meaning is carried by
 * hue + border style + icon + the written label together — never color alone.
 */
export function Chip({
  kind = 'neutral',
  icon,
  children,
}: {
  kind?: ChipKind
  /** Pass null to suppress the kind's default icon. */
  icon?: ReactNode | null
  children: ReactNode
}) {
  const resolved = icon === undefined ? DEFAULT_ICON[kind] : icon
  const cls = kind === 'neutral' ? 'lp-chip' : `lp-chip lp-chip--${kind}`
  return (
    <span className={cls}>
      {resolved}
      {children}
    </span>
  )
}
