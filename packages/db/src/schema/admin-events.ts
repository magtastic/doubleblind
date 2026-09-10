import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Append-only audit trail for the admin site. Deliberately has no foreign key
 * to `profiles`: deletion events must outlive the profile they describe.
 */
export const adminEvents = pgTable(
  'admin_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** e.g. 'profile.published', 'profile.deleted', 'setup.confirmed'. */
    kind: text().notNull(),
    profileId: uuid(),
    payload: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('admin_events_kind_idx').on(table.kind),
    index('admin_events_created_at_idx').on(table.createdAt),
    index('admin_events_profile_id_idx').on(table.profileId),
  ]
)

export type AdminEventRow = typeof adminEvents.$inferSelect
export type NewAdminEventRow = typeof adminEvents.$inferInsert
