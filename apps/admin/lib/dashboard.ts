import { DbLive, PgDrizzle } from '@doubleblind/db'
import {
  adminEvents,
  PROFILE_TTL_DAYS,
  profiles,
  setups,
} from '@doubleblind/db/schema'
import { SETUP_STATUSES, type SetupStatus } from '@doubleblind/shared'
import { desc, sql } from 'drizzle-orm'
import { Cause, Clock, Effect } from 'effect'

/**
 * Everything the console reads out of Postgres.
 *
 * This module is the only place in the admin app that talks to the database:
 * it builds the layer, runs the queries and hands back plain data, so the
 * components stay dumb and never import Effect.
 *
 * PRODUCT.md is a privacy product and this is an operations console, so no
 * query here selects a brief, a private-layer field, an email or a token hash.
 * Profile ids only.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** How close to the 90-day cutoff counts as "about to go". */
const EXPIRING_SOON_DAYS = 7

export interface ProfileCounts {
  readonly total: number
  readonly live: number
  readonly expiringSoon: number
  readonly expired: number
}

export interface SetupCount {
  readonly status: SetupStatus
  readonly count: number
}

export interface AdminEvent {
  readonly id: string
  readonly kind: string
  readonly profileId: string | null
  /** ISO-8601, formatted here so the component does no date work. */
  readonly createdAt: string
}

export interface Dashboard {
  readonly profiles: ProfileCounts
  readonly setups: ReadonlyArray<SetupCount>
  readonly events: ReadonlyArray<AdminEvent>
}

export type DashboardResult =
  | { readonly _tag: 'Loaded'; readonly dashboard: Dashboard }
  | { readonly _tag: 'Unavailable'; readonly reason: string }

/** Matches the API's lazy expiry: nothing walks the tables, the cutoff does. */
const countProfiles = (at: number) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle
    const dead = new Date(at - PROFILE_TTL_DAYS * DAY_MS).toISOString()
    const soon = new Date(
      at - (PROFILE_TTL_DAYS - EXPIRING_SOON_DAYS) * DAY_MS
    ).toISOString()

    const rows = yield* db
      .select({
        total: sql<number>`count(*)::int`,
        live: sql<number>`(count(*) filter (
          where ${profiles.lastSeenAt} > ${dead}::timestamptz
        ))::int`,
        expiringSoon: sql<number>`(count(*) filter (
          where ${profiles.lastSeenAt} > ${dead}::timestamptz
            and ${profiles.lastSeenAt} <= ${soon}::timestamptz
        ))::int`,
        expired: sql<number>`(count(*) filter (
          where ${profiles.lastSeenAt} <= ${dead}::timestamptz
        ))::int`,
      })
      .from(profiles)

    return rows[0] ?? { total: 0, live: 0, expiringSoon: 0, expired: 0 }
  })

/**
 * Grouped by the status the agents actually see. `setups.ts` in the API reads
 * an unsettled row whose `expiresAt` has passed as `expired` and never trusts
 * the stored column; the CASE below is that rule in SQL, so the console's
 * numbers cannot drift from the product's.
 */
const countSetups = (at: number) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle
    const now = new Date(at).toISOString()
    const status = sql<SetupStatus>`case
      when ${setups.status} in ('confirmed', 'declined', 'expired')
        then ${setups.status}
      when ${setups.expiresAt} <= ${now}::timestamptz
        then 'expired'::setup_status
      else ${setups.status}
    end`

    /**
     * By ordinal, not by the expression again: drizzle qualifies column
     * references inside `groupBy` (`"setups"."status"`) but not in the select
     * list (`"status"`), and Postgres then reads the two CASEs as different
     * expressions and rejects the query.
     */
    const rows = yield* db
      .select({ status, count: sql<number>`count(*)::int` })
      .from(setups)
      .groupBy(sql`1`)

    const counted = new Map(rows.map((row) => [row.status, row.count]))
    return SETUP_STATUSES.map(
      (value): SetupCount => ({ status: value, count: counted.get(value) ?? 0 })
    )
  })

/** The audit trail. `payload` is deliberately not selected: it is free-form. */
const recentEvents = Effect.gen(function* () {
  const db = yield* PgDrizzle.PgDrizzle
  const rows = yield* db
    .select({
      id: adminEvents.id,
      kind: adminEvents.kind,
      profileId: adminEvents.profileId,
      createdAt: adminEvents.createdAt,
    })
    .from(adminEvents)
    .orderBy(desc(adminEvents.createdAt))
    .limit(50)

  return rows.map(
    (row): AdminEvent => ({
      id: row.id,
      kind: row.kind,
      profileId: row.profileId,
      createdAt: row.createdAt.toISOString(),
    })
  )
})

const dashboard = Effect.gen(function* () {
  const at = yield* Clock.currentTimeMillis
  const [counts, statuses, events] = yield* Effect.all(
    [countProfiles(at), countSetups(at), recentEvents],
    { concurrency: 'unbounded' }
  )
  return { profiles: counts, setups: statuses, events } satisfies Dashboard
})

/**
 * Runs the whole page's reads, or explains why it could not.
 *
 * Nothing here is allowed to throw: `next build` runs with no DATABASE_URL at
 * all, and a console that 500s the moment Postgres blinks is worse than one
 * that says so. The layer is built per call rather than memoized so a database
 * that comes back does not stay broken behind a cached failed layer; the
 * console is low traffic and the queries are small.
 *
 * The connection string is `Config.redacted`, so the password cannot reach
 * this string.
 */
export const loadDashboard = (): Promise<DashboardResult> =>
  Effect.runPromise(
    dashboard.pipe(
      Effect.map((value) => ({ _tag: 'Loaded', dashboard: value }) as const),
      Effect.provide(DbLive),
      Effect.catchAllCause((cause) =>
        Effect.succeed({
          _tag: 'Unavailable',
          reason: Cause.pretty(cause),
        } as const)
      )
    )
  )
