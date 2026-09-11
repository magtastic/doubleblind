import { PgDrizzle } from '@doubleblind/db'
import {
  PROFILE_TTL_DAYS,
  profiles,
  type SetupRow,
  setups,
} from '@doubleblind/db/schema'
import {
  ConfirmResponse,
  Conflict,
  DeclineResponse,
  InterestResponse,
  NotFound,
  PrivateLayer,
  type ProfileId,
  Proposal,
  ProposeResponse,
  RateLimited,
  Setup,
  type SetupId,
  type SetupRole,
  type SetupStatus,
  SetupsResponse,
} from '@doubleblind/shared'
import { and, desc, eq, gt, inArray, or } from 'drizzle-orm'
import { Clock, Config, Effect, Schema } from 'effect'
import type { AuthenticatedProfile } from './service.ts'

/**
 * The setup: one row per pair, from the first one-way interest to the release
 * of the private layer.
 *
 * Everything that makes a setup a setup lives in here — the ordered pair and
 * the role it implies, the one-counter rule, the rule that a pending interest
 * is invisible to the side that has not reciprocated, the weekly cap, lazy
 * expiry, and the guarded write that keeps two concurrent calls from stepping
 * on each other. The adapters and `Doubleblind` know none of it; they call the
 * five methods below.
 *
 * `AuthenticatedProfile` is imported as a type only. `service.ts` imports this
 * module for real, so a value import would close a module cycle and leave
 * `SetupLifecycle` undefined for whichever file is loaded first.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * How long a setup survives without a transition, refreshed on every
 * transition. PRODUCT.md fixes no number; fourteen days is this module's
 * assumption and the only place it is written down.
 *
 * Exported for this module's tests.
 */
export const SETUP_TTL_MS = 14 * DAY_MS

/**
 * The window the weekly interest cap counts over.
 *
 * Exported for this module's tests.
 */
export const INTEREST_WINDOW_MS = 7 * DAY_MS

/**
 * PRODUCT.md: "Profiles expire automatically after ninety days without a
 * check-in." Derived from the schema constant rather than imported from
 * `service.ts`, for the module-cycle reason above; the two are the same
 * ninety days.
 */
const PROFILE_TTL_MS = PROFILE_TTL_DAYS * DAY_MS

/** Statuses that no longer age out: expiry has nothing left to say about them. */
const SETTLED: ReadonlySet<SetupStatus> = new Set<SetupStatus>([
  'confirmed',
  'declined',
  'expired',
])

/**
 * The window in which either side may still say no: from mutual interest up
 * to the moment a date is settled. A one-way interest is not in it — there is
 * nothing to decline that the other side knows about — and neither is
 * anything already settled.
 */
const DECLINABLE: ReadonlySet<SetupStatus> = new Set<SetupStatus>([
  'mutual',
  'proposed',
  'countered',
])

/**
 * The status the outside world sees. Expiry is lazy: no job walks the table,
 * so a row whose `expiresAt` has passed reads as `expired` from here on and
 * every operation answers from this, never from the stored column.
 */
const effectiveStatus = (row: SetupRow, at: number): SetupStatus =>
  SETTLED.has(row.status)
    ? row.status
    : row.expiresAt.getTime() <= at
      ? 'expired'
      : row.status

/** The caller's side of the ordered pair, or null if they are not in it. */
const roleIn = (row: SetupRow, profileId: ProfileId): SetupRole | null =>
  row.profileAId === profileId ? 'a' : row.profileBId === profileId ? 'b' : null

/**
 * PRODUCT.md, Vocabulary: interest is "invisible to the other side until
 * mutual". A pending row therefore exists only for the side that expressed it.
 */
const visibleTo = (row: SetupRow, role: SetupRole): boolean =>
  row.status !== 'interest_pending' ||
  (role === 'a' ? row.interestedAAt !== null : row.interestedBAt !== null)

const interestOf = (row: SetupRow, role: SetupRole): Date | null =>
  role === 'a' ? row.interestedAAt : row.interestedBAt

const confirmedBy = (row: SetupRow, role: SetupRole): boolean =>
  role === 'a' ? row.confirmedA : row.confirmedB

const other = (role: SetupRole): SetupRole => (role === 'a' ? 'b' : 'a')

const counterpartOf = (row: SetupRow, role: SetupRole): ProfileId =>
  role === 'a' ? row.profileBId : row.profileAId

/**
 * The ordered pair for two profiles. The unique key and the check constraint
 * both demand `profileAId < profileBId`, and lowercasing first keeps a
 * differently-cased id from ordering the pair the wrong way round.
 */
const pairOf = (
  callerId: ProfileId,
  targetId: ProfileId
): {
  readonly aId: ProfileId
  readonly bId: ProfileId
  readonly role: SetupRole
} => {
  const caller = callerId.toLowerCase()
  const target = targetId.toLowerCase()
  return caller < target
    ? { aId: caller, bId: target, role: 'a' }
    : { aId: target, bId: caller, role: 'b' }
}

/**
 * `confirmedSlot` is a timestamptz and the contract's `Timestamp` is an ISO
 * string, so slots are compared as instants. Two spellings of one moment are
 * the same slot; an unparseable one matches nothing.
 */
const instant = (timestamp: string): number => Date.parse(timestamp)

const sameInstant = (slot: string, stored: Date | null): boolean =>
  stored !== null &&
  Number.isFinite(instant(slot)) &&
  instant(slot) === stored.getTime()

const decodeProposal = Schema.decodeUnknown(Proposal)

/**
 * A database failure is not something an agent can act on, so it is a defect
 * rather than a declared error. Wrapping each query keeps the domain errors
 * alone in the method signatures.
 */
const query = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, never, R> => Effect.orDie(effect)

export class SetupLifecycle extends Effect.Service<SetupLifecycle>()(
  'SetupLifecycle',
  {
    dependencies: [],
    effect: Effect.gen(function* () {
      const db = yield* PgDrizzle.PgDrizzle

      /**
       * PRODUCT.md: "A weekly cap on interests applies, default to be set in
       * the skill." Read once: a misconfigured cap is a deploy problem, not a
       * per-call one.
       */
      const weeklyCap = yield* Config.integer('INTEREST_WEEKLY_CAP').pipe(
        Config.withDefault(20),
        Effect.orDie
      )

      const rowById = (setupId: SetupId) =>
        query(
          db.select().from(setups).where(eq(setups.id, setupId)).limit(1)
        ).pipe(Effect.map((rows) => rows[0]))

      const rowByPair = (aId: ProfileId, bId: ProfileId) =>
        query(
          db
            .select()
            .from(setups)
            .where(and(eq(setups.profileAId, aId), eq(setups.profileBId, bId)))
            .limit(1)
        ).pipe(Effect.map((rows) => rows[0]))

      /**
       * The row as this caller may see it. A setup they are not part of, and a
       * pending interest they did not express, are both simply absent: the
       * counterpart must not be able to tell the two apart.
       */
      const visibleRow = (
        caller: AuthenticatedProfile,
        setupId: SetupId
      ): Effect.Effect<
        { readonly row: SetupRow; readonly role: SetupRole },
        NotFound
      > =>
        Effect.gen(function* () {
          const row = yield* rowById(setupId)
          if (row === undefined) return yield* new NotFound()
          const role = roleIn(row, caller.profileId)
          if (role === null || !visibleTo(row, role)) {
            return yield* new NotFound()
          }
          return { row, role }
        })

      /**
       * A guarded write touched nothing, so somebody else moved the row first.
       * Re-read and answer with what is true now rather than with what was
       * true when this call started.
       */
      const staleConflict = (
        caller: AuthenticatedProfile,
        setupId: SetupId
      ): Effect.Effect<never, NotFound | Conflict> =>
        Effect.gen(function* () {
          const { row } = yield* visibleRow(caller, setupId)
          const at = yield* Clock.currentTimeMillis
          return yield* new Conflict({ status: effectiveStatus(row, at) })
        })

      const guarded = (
        caller: AuthenticatedProfile,
        setupId: SetupId,
        touched: number
      ): Effect.Effect<void, NotFound | Conflict> =>
        touched > 0 ? Effect.void : staleConflict(caller, setupId)

      /**
       * The cap counts the interests this caller expressed inside the window,
       * whichever side of the pair they are on. `retryAfterSeconds` is the
       * wait until the oldest of them falls out of it.
       */
      const enforceCap = (
        callerId: ProfileId,
        at: number
      ): Effect.Effect<void, RateLimited> =>
        Effect.gen(function* () {
          const since = new Date(at - INTEREST_WINDOW_MS)

          const rows = yield* query(
            db
              .select({
                profileAId: setups.profileAId,
                interestedAAt: setups.interestedAAt,
                interestedBAt: setups.interestedBAt,
              })
              .from(setups)
              .where(
                or(
                  and(
                    eq(setups.profileAId, callerId),
                    gt(setups.interestedAAt, since)
                  ),
                  and(
                    eq(setups.profileBId, callerId),
                    gt(setups.interestedBAt, since)
                  )
                )
              )
          )

          const expressed = rows
            .map((row) =>
              row.profileAId === callerId
                ? row.interestedAAt
                : row.interestedBAt
            )
            .filter((when): when is Date => when !== null)
            .map((when) => when.getTime())

          if (expressed.length < weeklyCap) return

          const oldest = Math.min(...expressed)
          const retryAfterSeconds = Math.max(
            1,
            Math.ceil((oldest + INTEREST_WINDOW_MS - at) / 1000)
          )
          return yield* new RateLimited({ retryAfterSeconds })
        })

      const privateLayerOf = (profileId: ProfileId) =>
        Effect.gen(function* () {
          const rows = yield* query(
            db
              .select({
                firstName: profiles.firstName,
                phone: profiles.phone,
                photoUrl: profiles.photoUrl,
              })
              .from(profiles)
              .where(eq(profiles.id, profileId))
              .limit(1)
          )
          const row = rows[0]
          if (row === undefined) {
            // The cascade takes setups with the profile, so a confirmed setup
            // whose counterpart is gone cannot exist.
            return yield* Effect.dieMessage(
              'confirmed setup has no counterpart profile'
            )
          }
          return new PrivateLayer({
            firstName: row.firstName,
            phone: row.phone,
            ...(row.photoUrl === null ? {} : { photoUrl: row.photoUrl }),
          })
        })

      /** Stored jsonb comes back as a plain object; the contract wants a class. */
      const readProposal = (value: Proposal | null) =>
        value === null
          ? Effect.succeed(null)
          : decodeProposal(value).pipe(Effect.orDie)

      /**
       * The caller's view of one row. `youConfirmed` is the caller's flag
       * only: PRODUCT.md does not let either side watch the other decide.
       */
      const toSetup = (
        row: SetupRow,
        role: SetupRole,
        at: number,
        privateLayer: PrivateLayer | undefined
      ) =>
        Effect.gen(function* () {
          const proposal = yield* readProposal(row.proposal)
          const counter = yield* readProposal(row.counter)

          return new Setup({
            setupId: row.id,
            counterpartProfileId: counterpartOf(row, role),
            role,
            status: effectiveStatus(row, at),
            proposal,
            counter,
            confirmedSlot:
              row.confirmedSlot === null
                ? null
                : row.confirmedSlot.toISOString(),
            youConfirmed: confirmedBy(row, role),
            ...(privateLayer === undefined
              ? {}
              : { counterpartPrivateLayer: privateLayer }),
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            expiresAt: row.expiresAt.toISOString(),
          })
        })

      /**
       * Record this caller's interest on a row that already exists. Returns
       * the status the caller should be told about, which is the current one
       * whenever there is nothing to record.
       */
      const joinExisting = (
        caller: AuthenticatedProfile,
        row: SetupRow,
        role: SetupRole,
        at: number
      ): Effect.Effect<InterestResponse, RateLimited> =>
        Effect.gen(function* () {
          const status = effectiveStatus(row, at)

          // Already interested: idempotent, and it does not spend cap.
          if (interestOf(row, role) !== null) {
            return new InterestResponse({ setupId: row.id, status })
          }
          // Anything past the pending stage, expiry included, is unchanged by
          // a fresh interest.
          if (status !== 'interest_pending') {
            return new InterestResponse({ setupId: row.id, status })
          }

          yield* enforceCap(caller.profileId, at)

          const reciprocated = interestOf(row, other(role)) !== null
          const next: SetupStatus = reciprocated ? 'mutual' : 'interest_pending'

          const updated = yield* query(
            db
              .update(setups)
              .set({
                ...(role === 'a'
                  ? { interestedAAt: new Date(at) }
                  : { interestedBAt: new Date(at) }),
                status: next,
                updatedAt: new Date(at),
                expiresAt: new Date(at + SETUP_TTL_MS),
              })
              .where(
                and(
                  eq(setups.id, row.id),
                  eq(setups.status, 'interest_pending')
                )
              )
              .returning({ status: setups.status })
          )

          const written = updated[0]
          if (written !== undefined) {
            return new InterestResponse({
              setupId: row.id,
              status: written.status,
            })
          }

          // Someone moved the row underneath us. Interest declares no
          // Conflict, so answer with the truth: where the setup stands now.
          const fresh = yield* rowById(row.id)
          return new InterestResponse({
            setupId: row.id,
            status: fresh === undefined ? status : effectiveStatus(fresh, at),
          })
        })

      return {
        /**
         * One agent saying yes to another brief. The second yes on the same
         * pair is what makes a setup.
         */
        expressInterest: (
          caller: AuthenticatedProfile,
          targetProfileId: ProfileId
        ): Effect.Effect<InterestResponse, NotFound | RateLimited> =>
          Effect.gen(function* () {
            if (
              targetProfileId.toLowerCase() === caller.profileId.toLowerCase()
            ) {
              return yield* new NotFound()
            }

            const at = yield* Clock.currentTimeMillis
            const activeSince = new Date(at - PROFILE_TTL_MS)

            // An expired profile is as good as missing: it is not in the pool
            // and its agent is not listening.
            const targets = yield* query(
              db
                .select({ id: profiles.id })
                .from(profiles)
                .where(
                  and(
                    eq(profiles.id, targetProfileId),
                    gt(profiles.lastSeenAt, activeSince)
                  )
                )
                .limit(1)
            )
            if (targets[0] === undefined) return yield* new NotFound()

            const { aId, bId, role } = pairOf(caller.profileId, targetProfileId)

            const existing = yield* rowByPair(aId, bId)
            if (existing !== undefined) {
              return yield* joinExisting(caller, existing, role, at)
            }

            yield* enforceCap(caller.profileId, at)

            const inserted = yield* query(
              db
                .insert(setups)
                .values({
                  profileAId: aId,
                  profileBId: bId,
                  status: 'interest_pending',
                  interestedAAt: role === 'a' ? new Date(at) : null,
                  interestedBAt: role === 'b' ? new Date(at) : null,
                  createdAt: new Date(at),
                  updatedAt: new Date(at),
                  expiresAt: new Date(at + SETUP_TTL_MS),
                })
                .onConflictDoNothing({
                  target: [setups.profileAId, setups.profileBId],
                })
                .returning({ id: setups.id })
            )

            const created = inserted[0]
            if (created !== undefined) {
              return new InterestResponse({
                setupId: created.id,
                status: 'interest_pending',
              })
            }

            // The counterpart inserted the same pair between the read and the
            // insert. Their row is the row; join it.
            const raced = yield* rowByPair(aId, bId)
            if (raced === undefined) {
              return yield* Effect.dieMessage(
                'setup insert conflicted with a row that is not there'
              )
            }
            return yield* joinExisting(caller, raced, role, at)
          }),

        /**
         * A venue and up to three slots. `a` proposes; `b` may counter once,
         * which is the whole of PRODUCT.md's "The other agent may counter
         * once".
         */
        propose: (
          caller: AuthenticatedProfile,
          setupId: SetupId,
          proposal: Proposal
        ): Effect.Effect<ProposeResponse, NotFound | Conflict> =>
          Effect.gen(function* () {
            const { row, role } = yield* visibleRow(caller, setupId)
            const at = yield* Clock.currentTimeMillis
            const status = effectiveStatus(row, at)

            if (role === 'a' && status === 'mutual') {
              const updated = yield* query(
                db
                  .update(setups)
                  .set({
                    proposal,
                    status: 'proposed',
                    updatedAt: new Date(at),
                    expiresAt: new Date(at + SETUP_TTL_MS),
                  })
                  .where(
                    and(eq(setups.id, row.id), eq(setups.status, 'mutual'))
                  )
                  .returning({ id: setups.id })
              )
              yield* guarded(caller, setupId, updated.length)
              return new ProposeResponse({ status: 'proposed' })
            }

            if (role === 'b' && status === 'proposed') {
              const updated = yield* query(
                db
                  .update(setups)
                  .set({
                    counter: proposal,
                    status: 'countered',
                    // The counter replaces what was on the table, so any
                    // confirmation of the old slots goes with it.
                    confirmedSlot: null,
                    confirmedA: false,
                    confirmedB: false,
                    updatedAt: new Date(at),
                    expiresAt: new Date(at + SETUP_TTL_MS),
                  })
                  .where(
                    and(eq(setups.id, row.id), eq(setups.status, 'proposed'))
                  )
                  .returning({ id: setups.id })
              )
              yield* guarded(caller, setupId, updated.length)
              return new ProposeResponse({ status: 'countered' })
            }

            return yield* new Conflict({ status })
          }),

        /**
         * Both humans confirm the same slot or there is no date. Until the
         * counterpart confirms, a caller may move their own answer.
         */
        confirm: (
          caller: AuthenticatedProfile,
          setupId: SetupId,
          slot: string
        ): Effect.Effect<ConfirmResponse, NotFound | Conflict> =>
          Effect.gen(function* () {
            const { row, role } = yield* visibleRow(caller, setupId)
            const at = yield* Clock.currentTimeMillis
            const status = effectiveStatus(row, at)

            if (status !== 'proposed' && status !== 'countered') {
              return yield* new Conflict({ status })
            }

            const active = status === 'countered' ? row.counter : row.proposal
            if (active === null) {
              return yield* Effect.dieMessage(
                'setup is proposed or countered with nothing on the table'
              )
            }
            const offered = active.slots.some(
              (candidate) =>
                Number.isFinite(instant(slot)) &&
                instant(candidate) === instant(slot)
            )
            if (!offered) return yield* new Conflict({ status })

            const counterpartConfirmed = confirmedBy(row, other(role))

            if (counterpartConfirmed && !sameInstant(slot, row.confirmedSlot)) {
              // They already said a different evening. One proposal at a time:
              // this one is settled by countering, not by insisting.
              return yield* new Conflict({ status })
            }

            const chosen = new Date(instant(slot))

            if (counterpartConfirmed) {
              const updated = yield* query(
                db
                  .update(setups)
                  .set({
                    ...(role === 'a'
                      ? { confirmedA: true }
                      : { confirmedB: true }),
                    confirmedSlot: chosen,
                    status: 'confirmed',
                    updatedAt: new Date(at),
                    expiresAt: new Date(at + SETUP_TTL_MS),
                  })
                  .where(
                    and(
                      eq(setups.id, row.id),
                      eq(setups.status, status),
                      eq(setups.confirmedSlot, chosen),
                      role === 'a'
                        ? eq(setups.confirmedB, true)
                        : eq(setups.confirmedA, true)
                    )
                  )
                  .returning({ id: setups.id })
              )
              yield* guarded(caller, setupId, updated.length)

              const privateLayer = yield* privateLayerOf(
                counterpartOf(row, role)
              )
              return new ConfirmResponse({ status: 'confirmed', privateLayer })
            }

            const updated = yield* query(
              db
                .update(setups)
                .set({
                  ...(role === 'a'
                    ? { confirmedA: true }
                    : { confirmedB: true }),
                  confirmedSlot: chosen,
                  updatedAt: new Date(at),
                  expiresAt: new Date(at + SETUP_TTL_MS),
                })
                .where(
                  and(
                    eq(setups.id, row.id),
                    eq(setups.status, status),
                    // If they confirmed while we were deciding, this is no
                    // longer a free choice: lose the race and re-read.
                    role === 'a'
                      ? eq(setups.confirmedB, false)
                      : eq(setups.confirmedA, false)
                  )
                )
                .returning({ id: setups.id })
            )
            yield* guarded(caller, setupId, updated.length)

            return new ConfirmResponse({ status })
          }),

        /**
         * Either side ends the setup. PRODUCT.md, Voice: "No is always
         * enough. Never ask why." — nothing is carried but the setup id, and
         * the counterpart is told the status and not one word more.
         *
         * Final. `declined` is settled, so the row never expires and nothing
         * revives it; it stays in the table, which is what keeps the pair out
         * of each other's candidates for good. `expiresAt` is left where it
         * was rather than pushed: a settled row is not waiting for anything.
         */
        decline: (
          caller: AuthenticatedProfile,
          setupId: SetupId
        ): Effect.Effect<DeclineResponse, NotFound | Conflict> =>
          Effect.gen(function* () {
            const { row } = yield* visibleRow(caller, setupId)
            const at = yield* Clock.currentTimeMillis
            const status = effectiveStatus(row, at)

            // A pending interest is the caller's own yes, and PRODUCT.md gives
            // no way to take one back; the rest is already settled.
            if (!DECLINABLE.has(status)) {
              return yield* new Conflict({ status })
            }

            const updated = yield* query(
              db
                .update(setups)
                .set({ status: 'declined', updatedAt: new Date(at) })
                .where(
                  and(
                    eq(setups.id, row.id),
                    inArray(setups.status, [...DECLINABLE])
                  )
                )
                .returning({ id: setups.id })
            )
            yield* guarded(caller, setupId, updated.length)

            return new DeclineResponse({ status: 'declined' })
          }),

        /** Every setup this caller can see, newest first. */
        listFor: (
          caller: AuthenticatedProfile
        ): Effect.Effect<SetupsResponse> =>
          Effect.gen(function* () {
            const at = yield* Clock.currentTimeMillis

            const rows = yield* query(
              db
                .select()
                .from(setups)
                .where(
                  or(
                    eq(setups.profileAId, caller.profileId),
                    eq(setups.profileBId, caller.profileId)
                  )
                )
                .orderBy(desc(setups.createdAt), desc(setups.id))
            )

            const mine: Array<{
              readonly row: SetupRow
              readonly role: SetupRole
            }> = []
            for (const row of rows) {
              const role = roleIn(row, caller.profileId)
              if (role !== null && visibleTo(row, role)) {
                mine.push({ row, role })
              }
            }

            // The private layer is released at a confirmed date and nowhere
            // else. Listing setups is how an agent recovers it afterwards.
            const releasedTo = mine
              .filter(({ row }) => effectiveStatus(row, at) === 'confirmed')
              .map(({ row, role }) => counterpartOf(row, role))

            const layers = new Map<ProfileId, PrivateLayer>()
            if (releasedTo.length > 0) {
              const rows = yield* query(
                db
                  .select({
                    id: profiles.id,
                    firstName: profiles.firstName,
                    phone: profiles.phone,
                    photoUrl: profiles.photoUrl,
                  })
                  .from(profiles)
                  .where(inArray(profiles.id, releasedTo))
              )
              for (const row of rows) {
                layers.set(
                  row.id,
                  new PrivateLayer({
                    firstName: row.firstName,
                    phone: row.phone,
                    ...(row.photoUrl === null
                      ? {}
                      : { photoUrl: row.photoUrl }),
                  })
                )
              }
            }

            const result: Array<Setup> = []
            for (const { row, role } of mine) {
              const released =
                effectiveStatus(row, at) === 'confirmed'
                  ? layers.get(counterpartOf(row, role))
                  : undefined
              result.push(yield* toSetup(row, role, at, released))
            }

            return new SetupsResponse({ setups: result })
          }),
      }
    }),
  }
) {}
