import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

// Launch health metrics (SPEC_V0.1 DoD 16).
// Privacy-light: no usernames, no raw IPs — only a salted hash for
// quota/return-rate grouping, and the story ref.
export const metricEvents = pgTable(
  'metric_events',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['import', 'first_edit', 'publish', 'public_view'] }).notNull(),
    ref: text('ref').notNull(),
    ipHash: text('ip_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('metric_events_kind_idx').on(table.kind, table.createdAt),
    index('metric_events_ip_idx').on(table.ipHash, table.createdAt),
  ],
)

// GitHub-authenticated users (SPEC_V0.1 §3.9): read-only public OAuth, no
// write scopes. Deleting a row cascades to sessions and owned contributions —
// account deletion is a hard delete of everything, not a soft flag.
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    // GitHub's numeric id is the stable identity; logins can be renamed.
    githubId: text('github_id').notNull(),
    login: text('login').notNull(),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    // AES-256-GCM ciphertext of the GitHub access token, or null when
    // JOURNAL_SECRET is unset (no v0.1 feature needs the token, so without a
    // secret we simply never store it). Plaintext never touches disk.
    accessTokenEnc: text('access_token_enc'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_github_id_idx').on(table.githubId)],
)

export const sessions = pgTable(
  'sessions',
  {
    // Only the SHA-256 of the browser cookie value is stored — a leaked
    // table cannot be replayed as live sessions.
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
)

// System of record for published contributions (ADR-0002: Postgres, not
// browser storage; "private by default" is policy — rows exist only after an
// explicit publish, and hard delete removes the row).
export const contributions = pgTable(
  'contributions',
  {
    id: text('id').primaryKey(),
    // Multi-tenancy boundary from day one, single-tenant in 0.1 (SPEC_V0.1 §5.3).
    orgId: text('org_id'),
    owner: text('owner').notNull(),
    repo: text('repo').notNull(),
    number: text('number').notNull(),
    // What the row is a story OF. GitHub shares one number sequence between
    // issues and PRs, and a journey is anchored on its issue's number — the
    // kind keeps issue #5, PR #5, and journey #5 as distinct publishables.
    kind: text('kind', { enum: ['pr', 'issue', 'journey'] }).notNull().default('pr'),
    title: text('title').notNull(),
    state: text('state').notNull(),
    visibility: text('visibility', { enum: ['private', 'unlisted', 'public'] })
      .notNull()
      .default('private'),
    // Set on first publish, stable forever (SPEC_V0.1 §5.3).
    shareSlug: text('share_slug'),
    // SHA-256 of the anonymous ownership token handed to the publishing
    // browser. Update/unpublish require it until OAuth claims the row.
    ownerTokenHash: text('owner_token_hash'),
    // Account ownership once a signed-in user publishes, attaches, or claims
    // the row as the proven PR author. Cascade: deleting the account
    // hard-deletes its published stories (SPEC DoD 10).
    ownerUserId: text('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
    // Salted IP hash of the publisher — abuse cleanup handle, never a raw IP.
    publisherIpHash: text('publisher_ip_hash'),
    story: jsonb('story').notNull(),
    maps: jsonb('maps').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('contributions_share_slug_idx').on(table.shareSlug),
    // UNIQUE: concurrent first-publishes of the same story must collapse to
    // one row — a plain index let a race create orphan duplicates.
    uniqueIndex('contributions_ref_idx').on(table.owner, table.repo, table.number, table.kind),
    // Per-user publish quota counts by owner.
    index('contributions_owner_user_idx').on(table.ownerUserId),
  ],
)
