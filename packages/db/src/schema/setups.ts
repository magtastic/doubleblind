import { type Proposal, SETUP_STATUSES } from '@doubleblind/shared'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { profiles } from './profiles.ts'

export const setupStatusEnum = pgEnum('setup_status', SETUP_STATUSES)

/**
 * A mutual match. `profileAId < profileBId` always, so a pair has exactly one
 * row regardless of who expressed interest first.
 */
export const setups = pgTable(
  'setups',
  {
    id: uuid().primaryKey().defaultRandom(),
    profileAId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    profileBId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    status: setupStatusEnum().notNull().default('interest_pending'),
    proposal: jsonb().$type<Proposal>(),
    counter: jsonb().$type<Proposal>(),
    confirmedSlot: timestamp({ withTimezone: true }),
    confirmedA: boolean().notNull().default(false),
    confirmedB: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [
    unique('setups_pair_key').on(table.profileAId, table.profileBId),
    index('setups_profile_a_id_idx').on(table.profileAId),
    index('setups_profile_b_id_idx').on(table.profileBId),
    index('setups_status_idx').on(table.status),
    check(
      'setups_ordered_pair',
      sql`${table.profileAId} < ${table.profileBId}`
    ),
  ]
)

export type SetupRow = typeof setups.$inferSelect
export type NewSetupRow = typeof setups.$inferInsert
