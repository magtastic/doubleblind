import { GENDERS } from '@doubleblind/shared'
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core'

/** Dimensionality of the brief embedding (OpenAI text-embedding-3-small). */
export const EMBEDDING_DIMENSIONS = 1536

export const genderEnum = pgEnum('gender', GENDERS)

export const profiles = pgTable(
  'profiles',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** SHA-256 of the bearer token. The token itself is never stored. */
    tokenHash: text().notNull().unique(),

    // Core
    age: integer().notNull(),
    gender: genderEnum().notNull(),
    interestedIn: genderEnum().array().notNull(),
    city: text().notNull(),
    country: text().notNull(),
    radiusKm: integer().notNull().default(25),
    availability: text().notNull(),

    // Brief
    brief: text().notNull(),
    embedding: vector({ dimensions: EMBEDDING_DIMENSIONS }),

    // Private layer, released only on a confirmed date
    firstName: text().notNull(),
    phone: text().notNull(),
    photoUrl: text(),

    email: text(),
    standingInstructions: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Bumped on every authenticated call; profiles expire 90d after this. */
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('profiles_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
    index('profiles_last_seen_at_idx').on(table.lastSeenAt),
    index('profiles_location_idx').on(table.country, table.city),
  ]
)

export type ProfileRow = typeof profiles.$inferSelect
export type NewProfileRow = typeof profiles.$inferInsert

/**
 * Profiles expire 90 days after their last check-in. There is no soft delete
 * and no SQL-side "active" filter: deletion is a hard delete with cascade, and
 * the expiry cutoff is computed from Effect's Clock and passed as a parameter
 * so TestClock can move it.
 */
export const PROFILE_TTL_DAYS = 90
