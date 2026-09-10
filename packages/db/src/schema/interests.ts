import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { profiles } from './profiles.ts'

/**
 * A one-way expression of interest. When both directions exist, the pair
 * becomes a setup.
 */
export const interests = pgTable(
  'interests',
  {
    id: uuid().primaryKey().defaultRandom(),
    fromProfileId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    toProfileId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('interests_from_to_key').on(table.fromProfileId, table.toProfileId),
    index('interests_to_profile_id_idx').on(table.toProfileId),
    check(
      'interests_no_self_interest',
      sql`${table.fromProfileId} <> ${table.toProfileId}`
    ),
  ]
)

export type InterestRow = typeof interests.$inferSelect
export type NewInterestRow = typeof interests.$inferInsert
