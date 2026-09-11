import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'
import { PgDrizzle } from '@doubleblind/db'
import { setups } from '@doubleblind/db/schema'
import {
  hasTestDb,
  migrate,
  TestDbLive,
  truncateAll,
} from '@doubleblind/db/testing'
import {
  PrivateLayer,
  Profile,
  type ProfileId,
  Proposal,
  type SetupId,
  Venue,
} from '@doubleblind/shared'
import { eq } from 'drizzle-orm'
import {
  ConfigProvider,
  Duration,
  Effect,
  Layer,
  ManagedRuntime,
  TestClock,
  TestContext,
} from 'effect'
import { EmbeddingModelDeterministic } from '../src/embeddings.ts'
import { Doubleblind } from '../src/service.ts'
import { SetupLifecycle } from '../src/setups.ts'

/**
 * The setup lifecycle against a real Postgres, through the five methods the
 * service calls and nothing else. The row, the guard and the ordered pair are
 * exactly the parts a mock would hide, so nothing here is mocked but the
 * embedding model, and time, which TestClock owns.
 */

if (!hasTestDb) {
  console.warn(
    '\n' +
      '  ############################################################\n' +
      '  #  setups.test.ts SKIPPED: TEST_DATABASE_URL is not set.   #\n' +
      '  #  Run `bun run test:db` to exercise the database.         #\n' +
      '  ############################################################\n'
  )
}

const TestLayer = Layer.mergeAll(
  SetupLifecycle.Default,
  Doubleblind.Default
).pipe(
  Layer.provide(EmbeddingModelDeterministic),
  Layer.provideMerge(TestDbLive)
)

/**
 * The same layer with a cap of two, so the weekly limit can be reached in a
 * test without expressing twenty interests. The map falls back to the
 * environment, which is where TEST_DATABASE_URL still comes from.
 */
const CappedLayer = TestLayer.pipe(
  Layer.provide(
    Layer.setConfigProvider(
      ConfigProvider.fromMap(new Map([['INTEREST_WEEKLY_CAP', '2']])).pipe(
        ConfigProvider.orElse(() => ConfigProvider.fromEnv())
      )
    )
  )
)

const runtime = ManagedRuntime.make(TestLayer)
const cappedRuntime = ManagedRuntime.make(CappedLayer)

/**
 * Every test runs on TestClock, so a setup created in one test and a setup
 * created in the next both start at the same instant and nothing depends on
 * how long the suite took to run.
 */
const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    SetupLifecycle | Doubleblind | PgDrizzle.PgDrizzle
  >
): Promise<A> =>
  runtime.runPromise(Effect.provide(effect, TestContext.TestContext))

const runCapped = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    SetupLifecycle | Doubleblind | PgDrizzle.PgDrizzle
  >
): Promise<A> =>
  cappedRuntime.runPromise(Effect.provide(effect, TestContext.TestContext))

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */

const BRIEF =
  'She is a hydrologist who reads the weather like other people read faces. ' +
  'She values directness. Dealbreaker: calling a car park a hike.'

const UNKNOWN_PROFILE_ID = '00000000-0000-4000-8000-000000000000'

const SLOT_ONE = '2026-09-18T19:30:00Z'
const SLOT_TWO = '2026-09-19T19:30:00Z'
const SLOT_THREE = '2026-09-20T20:00:00Z'
/** The same instant as SLOT_ONE, spelled differently. */
const SLOT_ONE_RESPELLED = '2026-09-18T21:30:00+02:00'

const profileFixture = (firstName: string): Profile =>
  new Profile({
    age: 34,
    gender: 'woman',
    interestedIn: ['man'],
    city: 'Reykjavík',
    country: 'IS',
    radiusKm: 25,
    availability: 'weekday evenings, sunday afternoons',
    brief: `${BRIEF} Called ${firstName}.`,
    privateLayer: new PrivateLayer({
      firstName,
      phone: '+3548221234',
      photoUrl: `https://example.invalid/${firstName}.jpg`,
    }),
  })

const publishFixture = (firstName: string) =>
  Doubleblind.pipe(
    Effect.flatMap((service) => service.publish(profileFixture(firstName))),
    Effect.map((response) => response.profileId)
  )

const proposalFixture = (
  slots: readonly [string, ...Array<string>],
  name = 'Kaffi Vest'
) =>
  new Proposal({
    venue: new Venue({ name, address: 'Hagamelur 67, Reykjavík' }),
    slots,
  })

const caller = (profileId: ProfileId) => ({ profileId })

/** Two profiles that have each said yes to the other, plus who is which role. */
const mutualSetup = Effect.gen(function* () {
  const lifecycle = yield* SetupLifecycle
  const one = yield* publishFixture('Sigrún')
  const two = yield* publishFixture('Jón')

  const opened = yield* lifecycle.expressInterest(caller(one), two)
  const mutual = yield* lifecycle.expressInterest(caller(two), one)

  // Which fixture holds which role depends on the uuids postgres handed
  // out, so the names travel with the roles rather than being assumed.
  const oneIsA = one < two
  return {
    setupId: mutual.setupId,
    a: caller(oneIsA ? one : two),
    b: caller(oneIsA ? two : one),
    aName: oneIsA ? 'Sigrún' : 'Jón',
    bName: oneIsA ? 'Jón' : 'Sigrún',
    opened,
  }
})

/** The row as stored, for the assertions that are about the row itself. */
const rowOf = (setupId: SetupId) =>
  PgDrizzle.PgDrizzle.pipe(
    Effect.flatMap((db) =>
      db.select().from(setups).where(eq(setups.id, setupId))
    ),
    Effect.map((rows) => rows[0])
  )

const describeDb = hasTestDb ? describe : describe.skip

describeDb('SetupLifecycle', () => {
  beforeAll(() => runtime.runPromise(migrate))
  beforeEach(() => runtime.runPromise(truncateAll))
  afterAll(async () => {
    await runtime.dispose()
    await cappedRuntime.dispose()
  })

  /* ------------------------------------------------------------------ */
  /*  Interest                                                          */
  /* ------------------------------------------------------------------ */

  describe('expressInterest', () => {
    test('opens a pending setup the other side cannot see', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const one = yield* publishFixture('Sigrún')
          const two = yield* publishFixture('Jón')

          const opened = yield* lifecycle.expressInterest(caller(one), two)

          const mine = yield* lifecycle.listFor(caller(one))
          const theirs = yield* lifecycle.listFor(caller(two))

          // Invisible means invisible: the counterpart cannot act on a setup
          // they are not supposed to know exists.
          const proposed = yield* Effect.flip(
            lifecycle.propose(
              caller(two),
              opened.setupId,
              proposalFixture([SLOT_ONE])
            )
          )
          const confirmed = yield* Effect.flip(
            lifecycle.confirm(caller(two), opened.setupId, SLOT_ONE)
          )

          return { opened, mine, theirs, proposed, confirmed }
        })
      )

      expect(result.opened.status).toBe('interest_pending')
      expect(result.mine.setups).toHaveLength(1)
      expect(result.mine.setups[0]?.status).toBe('interest_pending')
      expect(result.theirs.setups).toHaveLength(0)
      expect(result.proposed._tag).toBe('NotFound')
      expect(result.confirmed._tag).toBe('NotFound')
    })

    test('the second yes makes it mutual, with roles by id order', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const one = yield* publishFixture('Sigrún')
          const two = yield* publishFixture('Jón')

          const first = yield* lifecycle.expressInterest(caller(one), two)
          const second = yield* lifecycle.expressInterest(caller(two), one)

          const oneSees = yield* lifecycle.listFor(caller(one))
          const twoSees = yield* lifecycle.listFor(caller(two))

          return { one, two, first, second, oneSees, twoSees }
        })
      )

      expect(result.first.status).toBe('interest_pending')
      expect(result.second.status).toBe('mutual')
      // One pair, one row, whoever spoke first.
      expect(result.second.setupId).toBe(result.first.setupId)

      const oneIsA = result.one < result.two
      expect(result.oneSees.setups[0]?.role).toBe(oneIsA ? 'a' : 'b')
      expect(result.twoSees.setups[0]?.role).toBe(oneIsA ? 'b' : 'a')
      expect(result.oneSees.setups[0]?.status).toBe('mutual')
      expect(result.twoSees.setups[0]?.status).toBe('mutual')
      expect(result.oneSees.setups[0]?.counterpartProfileId).toBe(result.two)
      expect(result.twoSees.setups[0]?.counterpartProfileId).toBe(result.one)
      // Nothing of the other person leaks before a confirmed date.
      expect(result.oneSees.setups[0]?.counterpartPrivateLayer).toBeUndefined()
    })

    test('saying yes twice is idempotent', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const db = yield* PgDrizzle.PgDrizzle
          const one = yield* publishFixture('Sigrún')
          const two = yield* publishFixture('Jón')

          const first = yield* lifecycle.expressInterest(caller(one), two)
          yield* TestClock.adjust(Duration.hours(1))
          const again = yield* lifecycle.expressInterest(caller(one), two)

          const rows = yield* db.select({ id: setups.id }).from(setups)
          return { first, again, rows }
        })
      )

      expect(result.again.setupId).toBe(result.first.setupId)
      expect(result.again.status).toBe('interest_pending')
      expect(result.rows).toHaveLength(1)
    })

    test('a target that is missing, expired, or the caller is NotFound', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const one = yield* publishFixture('Sigrún')
          const stale = yield* publishFixture('Jón')

          const self = yield* Effect.flip(
            lifecycle.expressInterest(caller(one), one)
          )
          const unknown = yield* Effect.flip(
            lifecycle.expressInterest(caller(one), UNKNOWN_PROFILE_ID)
          )

          // Ninety days without a check-in and the profile is out of the pool.
          yield* TestClock.adjust(Duration.days(91))
          const expired = yield* Effect.flip(
            lifecycle.expressInterest(caller(one), stale)
          )

          return { self, unknown, expired }
        })
      )

      expect(result.self._tag).toBe('NotFound')
      expect(result.unknown._tag).toBe('NotFound')
      expect(result.expired._tag).toBe('NotFound')
    })
  })

  describe('the weekly cap', () => {
    test('stops the third interest in a week and says how long to wait', async () => {
      const result = await runCapped(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const one = yield* publishFixture('Sigrún')
          const two = yield* publishFixture('Jón')
          const three = yield* publishFixture('Ari')
          const four = yield* publishFixture('Einar')

          yield* lifecycle.expressInterest(caller(one), two)
          // Repeating one does not spend another.
          yield* lifecycle.expressInterest(caller(one), two)

          yield* TestClock.adjust(Duration.days(1))
          yield* lifecycle.expressInterest(caller(one), three)

          const capped = yield* Effect.flip(
            lifecycle.expressInterest(caller(one), four)
          )

          // The oldest interest leaves the window seven days after it was
          // expressed, and the cap lifts with it.
          yield* TestClock.adjust(Duration.days(7))
          const later = yield* lifecycle.expressInterest(caller(one), four)

          return { capped, later }
        })
      )

      expect(result.capped._tag).toBe('RateLimited')
      expect(
        result.capped._tag === 'RateLimited'
          ? result.capped.retryAfterSeconds
          : 0
      ).toBe(6 * 24 * 60 * 60)
      expect(result.later.status).toBe('interest_pending')
    })
  })

  /* ------------------------------------------------------------------ */
  /*  Proposal and counter                                              */
  /* ------------------------------------------------------------------ */

  describe('propose', () => {
    test('a proposes on a mutual setup', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const { setupId, a, b } = yield* mutualSetup

          const proposed = yield* lifecycle.propose(
            a,
            setupId,
            proposalFixture([SLOT_ONE, SLOT_TWO])
          )
          const seen = yield* lifecycle.listFor(b)

          return { proposed, seen }
        })
      )

      expect(result.proposed.status).toBe('proposed')
      expect(result.seen.setups[0]?.status).toBe('proposed')
      expect(result.seen.setups[0]?.proposal?.venue.name).toBe('Kaffi Vest')
      expect(result.seen.setups[0]?.proposal?.slots).toEqual([
        SLOT_ONE,
        SLOT_TWO,
      ])
      expect(result.seen.setups[0]?.counter).toBeNull()
    })

    test('b cannot open, and a cannot propose twice', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const { setupId, a, b } = yield* mutualSetup

          // b opening the bidding is not a counter; there is nothing to
          // counter yet.
          const early = yield* Effect.flip(
            lifecycle.propose(b, setupId, proposalFixture([SLOT_ONE]))
          )

          yield* lifecycle.propose(a, setupId, proposalFixture([SLOT_ONE]))

          const twice = yield* Effect.flip(
            lifecycle.propose(a, setupId, proposalFixture([SLOT_TWO]))
          )

          return { early, twice }
        })
      )

      expect(result.early).toMatchObject({ _tag: 'Conflict', status: 'mutual' })
      expect(result.twice).toMatchObject({
        _tag: 'Conflict',
        status: 'proposed',
      })
    })

    test('b counters once, clearing any confirmation, and never twice', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const { setupId, a, b } = yield* mutualSetup

          yield* lifecycle.propose(
            a,
            setupId,
            proposalFixture([SLOT_ONE, SLOT_TWO])
          )
          // a has already said yes to a slot when the counter arrives.
          yield* lifecycle.confirm(a, setupId, SLOT_ONE)

          const countered = yield* lifecycle.propose(
            b,
            setupId,
            proposalFixture([SLOT_THREE], 'Mokka')
          )

          const row = yield* rowOf(setupId)
          const aSees = yield* lifecycle.listFor(a)

          const twice = yield* Effect.flip(
            lifecycle.propose(b, setupId, proposalFixture([SLOT_TWO]))
          )

          return { countered, row, aSees, twice }
        })
      )

      expect(result.countered.status).toBe('countered')
      expect(result.row?.confirmedSlot).toBeNull()
      expect(result.row?.confirmedA).toBe(false)
      expect(result.row?.confirmedB).toBe(false)
      expect(result.aSees.setups[0]?.youConfirmed).toBe(false)
      expect(result.aSees.setups[0]?.counter?.venue.name).toBe('Mokka')
      // The original proposal is still on the row; only the counter is live.
      expect(result.aSees.setups[0]?.proposal?.venue.name).toBe('Kaffi Vest')
      expect(result.twice).toMatchObject({
        _tag: 'Conflict',
        status: 'countered',
      })
    })

    test('a slot from the replaced proposal is no longer on offer', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const { setupId, a, b } = yield* mutualSetup

          yield* lifecycle.propose(a, setupId, proposalFixture([SLOT_ONE]))
          yield* lifecycle.propose(b, setupId, proposalFixture([SLOT_THREE]))

          const stale = yield* Effect.flip(
            lifecycle.confirm(a, setupId, SLOT_ONE)
          )
          const live = yield* lifecycle.confirm(a, setupId, SLOT_THREE)

          return { stale, live }
        })
      )

      expect(result.stale).toMatchObject({
        _tag: 'Conflict',
        status: 'countered',
      })
      expect(result.live.status).toBe('countered')
    })
  })

  /* ------------------------------------------------------------------ */
  /*  Confirmation                                                      */
  /* ------------------------------------------------------------------ */

  describe('confirm', () => {
    test('a slot nobody offered is a conflict', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const { setupId, a } = yield* mutualSetup
          yield* lifecycle.propose(a, setupId, proposalFixture([SLOT_ONE]))

          return yield* Effect.flip(lifecycle.confirm(a, setupId, SLOT_THREE))
        })
      )

      expect(result).toMatchObject({ _tag: 'Conflict', status: 'proposed' })
    })

    test('the first answer is recorded and can still be changed', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const { setupId, a, b } = yield* mutualSetup
          yield* lifecycle.propose(
            a,
            setupId,
            proposalFixture([SLOT_ONE, SLOT_TWO])
          )

          const first = yield* lifecycle.confirm(a, setupId, SLOT_ONE)
          const afterFirst = yield* rowOf(setupId)

          // Nothing is settled until they both answer, so a may move.
          const changed = yield* lifecycle.confirm(a, setupId, SLOT_TWO)
          const afterChange = yield* rowOf(setupId)

          const aSees = yield* lifecycle.listFor(a)
          const bSees = yield* lifecycle.listFor(b)

          return { first, afterFirst, changed, afterChange, aSees, bSees }
        })
      )

      expect(result.first.status).toBe('proposed')
      expect(result.first.privateLayer).toBeUndefined()
      expect(result.afterFirst?.confirmedSlot?.toISOString()).toBe(
        new Date(SLOT_ONE).toISOString()
      )
      expect(result.changed.status).toBe('proposed')
      expect(result.afterChange?.confirmedSlot?.toISOString()).toBe(
        new Date(SLOT_TWO).toISOString()
      )
      expect(result.aSees.setups[0]?.youConfirmed).toBe(true)
      // The other side's flag is not exposed, only the slot on the table.
      expect(result.bSees.setups[0]?.youConfirmed).toBe(false)
      expect(result.bSees.setups[0]?.confirmedSlot).toBe(
        new Date(SLOT_TWO).toISOString()
      )
    })

    test('a different slot from the other side is a conflict', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const { setupId, a, b } = yield* mutualSetup
          yield* lifecycle.propose(
            a,
            setupId,
            proposalFixture([SLOT_ONE, SLOT_TWO])
          )
          yield* lifecycle.confirm(a, setupId, SLOT_ONE)

          const clash = yield* Effect.flip(
            lifecycle.confirm(b, setupId, SLOT_TWO)
          )
          const row = yield* rowOf(setupId)

          return { clash, row }
        })
      )

      expect(result.clash).toMatchObject({
        _tag: 'Conflict',
        status: 'proposed',
      })
      // The row is untouched by the failed confirm.
      expect(result.row?.status).toBe('proposed')
      expect(result.row?.confirmedSlot?.toISOString()).toBe(
        new Date(SLOT_ONE).toISOString()
      )
    })

    test('the same slot from both sides releases the private layer', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const { setupId, a, b, aName, bName } = yield* mutualSetup
          yield* lifecycle.propose(
            a,
            setupId,
            proposalFixture([SLOT_ONE, SLOT_TWO])
          )

          yield* lifecycle.confirm(a, setupId, SLOT_ONE)
          // Same instant, different spelling: slots are instants, not strings.
          const done = yield* lifecycle.confirm(b, setupId, SLOT_ONE_RESPELLED)

          const aSees = yield* lifecycle.listFor(a)
          const bSees = yield* lifecycle.listFor(b)

          const again = yield* Effect.flip(
            lifecycle.confirm(b, setupId, SLOT_ONE)
          )

          return { aName, bName, done, aSees, bSees, again }
        })
      )

      expect(result.done.status).toBe('confirmed')
      // b confirmed, so b is handed a's private layer.
      expect(result.done.privateLayer?.firstName).toBe(result.aName)
      expect(result.done.privateLayer?.phone).toBe('+3548221234')

      // And both recover it from their list, so neither has to store it.
      expect(result.aSees.setups[0]?.status).toBe('confirmed')
      expect(result.aSees.setups[0]?.counterpartPrivateLayer?.firstName).toBe(
        result.bName
      )
      expect(result.bSees.setups[0]?.counterpartPrivateLayer?.firstName).toBe(
        result.aName
      )
      expect(result.aSees.setups[0]?.counterpartPrivateLayer?.photoUrl).toBe(
        `https://example.invalid/${result.bName}.jpg`
      )
      expect(result.aSees.setups[0]?.youConfirmed).toBe(true)
      expect(result.bSees.setups[0]?.youConfirmed).toBe(true)

      expect(result.again).toMatchObject({
        _tag: 'Conflict',
        status: 'confirmed',
      })
    })
  })

  /* ------------------------------------------------------------------ */
  /*  Decline                                                           */
  /* ------------------------------------------------------------------ */

  describe('decline', () => {
    test.each([
      ['mutual', 0],
      ['proposed', 1],
      ['countered', 2],
    ] as const)(
      'either side ends a %s setup, and both then see declined',
      async (_status, transitions) => {
        const result = await run(
          Effect.gen(function* () {
            const lifecycle = yield* SetupLifecycle
            const { setupId, a, b } = yield* mutualSetup

            if (transitions > 0) {
              yield* lifecycle.propose(a, setupId, proposalFixture([SLOT_ONE]))
            }
            if (transitions > 1) {
              yield* lifecycle.propose(
                b,
                setupId,
                proposalFixture([SLOT_TWO], 'Mokka')
              )
            }

            // b says no as often as a would; the rule is not role-specific.
            const declined = yield* lifecycle.decline(b, setupId)

            const aSees = yield* lifecycle.listFor(a)
            const bSees = yield* lifecycle.listFor(b)

            return { declined, aSees, bSees }
          })
        )

        expect(result.declined.status).toBe('declined')
        // The side that was declined on is told the status and nothing else.
        expect(result.aSees.setups[0]?.status).toBe('declined')
        expect(result.bSees.setups[0]?.status).toBe('declined')
        expect(result.aSees.setups[0]?.counterpartPrivateLayer).toBeUndefined()
      }
    )

    test('a one-way interest cannot be withdrawn, and hides from the other side', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const one = yield* publishFixture('Sigrún')
          const two = yield* publishFixture('Jón')

          const opened = yield* lifecycle.expressInterest(caller(one), two)

          // The side that expressed it: there is nothing to take back.
          const mine = yield* Effect.flip(
            lifecycle.decline(caller(one), opened.setupId)
          )
          // The other side must not learn the row exists by declining it.
          const theirs = yield* Effect.flip(
            lifecycle.decline(caller(two), opened.setupId)
          )

          return { mine, theirs }
        })
      )

      expect(result.mine).toMatchObject({
        _tag: 'Conflict',
        status: 'interest_pending',
      })
      expect(result.theirs._tag).toBe('NotFound')
    })

    test('a confirmed date cannot be declined away', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const { setupId, a, b } = yield* mutualSetup
          yield* lifecycle.propose(a, setupId, proposalFixture([SLOT_ONE]))
          yield* lifecycle.confirm(a, setupId, SLOT_ONE)
          yield* lifecycle.confirm(b, setupId, SLOT_ONE)

          return yield* Effect.flip(lifecycle.decline(a, setupId))
        })
      )

      expect(result).toMatchObject({ _tag: 'Conflict', status: 'confirmed' })
    })

    test('declining is final: nothing reopens it and it never expires', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const { setupId, a, b } = yield* mutualSetup

          yield* lifecycle.decline(a, setupId)

          const again = yield* Effect.flip(lifecycle.decline(b, setupId))
          const proposed = yield* Effect.flip(
            lifecycle.propose(a, setupId, proposalFixture([SLOT_ONE]))
          )
          const confirmed = yield* Effect.flip(
            lifecycle.confirm(b, setupId, SLOT_ONE)
          )

          // Settled means settled: the fortnight does not turn it into
          // `expired`, and the row stays so the pair never re-matches.
          yield* TestClock.adjust(Duration.days(15))
          const later = yield* lifecycle.listFor(a)
          const row = yield* rowOf(setupId)

          return { again, proposed, confirmed, later, row }
        })
      )

      expect(result.again).toMatchObject({
        _tag: 'Conflict',
        status: 'declined',
      })
      expect(result.proposed).toMatchObject({
        _tag: 'Conflict',
        status: 'declined',
      })
      expect(result.confirmed).toMatchObject({
        _tag: 'Conflict',
        status: 'declined',
      })
      expect(result.later.setups[0]?.status).toBe('declined')
      expect(result.row?.status).toBe('declined')
    })
  })

  /* ------------------------------------------------------------------ */
  /*  Expiry                                                            */
  /* ------------------------------------------------------------------ */

  describe('expiry', () => {
    test('a setup left alone for a fortnight is expired', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const { setupId, a, b } = yield* mutualSetup

          const before = yield* lifecycle.listFor(a)
          yield* TestClock.adjust(Duration.days(15))
          const after = yield* lifecycle.listFor(a)

          const proposed = yield* Effect.flip(
            lifecycle.propose(a, setupId, proposalFixture([SLOT_ONE]))
          )
          const confirmed = yield* Effect.flip(
            lifecycle.confirm(b, setupId, SLOT_ONE)
          )

          return { before, after, proposed, confirmed }
        })
      )

      expect(result.before.setups[0]?.status).toBe('mutual')
      expect(result.after.setups[0]?.status).toBe('expired')
      expect(result.proposed).toMatchObject({
        _tag: 'Conflict',
        status: 'expired',
      })
      expect(result.confirmed).toMatchObject({
        _tag: 'Conflict',
        status: 'expired',
      })
    })

    test('each transition buys another fortnight', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const { setupId, a } = yield* mutualSetup

          yield* TestClock.adjust(Duration.days(10))
          yield* lifecycle.propose(a, setupId, proposalFixture([SLOT_ONE]))
          yield* TestClock.adjust(Duration.days(10))

          return yield* lifecycle.listFor(a)
        })
      )

      expect(result.setups[0]?.status).toBe('proposed')
    })

    test('a confirmed date does not expire', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const { setupId, a, b } = yield* mutualSetup
          yield* lifecycle.propose(a, setupId, proposalFixture([SLOT_ONE]))
          yield* lifecycle.confirm(a, setupId, SLOT_ONE)
          yield* lifecycle.confirm(b, setupId, SLOT_ONE)

          yield* TestClock.adjust(Duration.days(30))
          return yield* lifecycle.listFor(a)
        })
      )

      expect(result.setups[0]?.status).toBe('confirmed')
      expect(result.setups[0]?.counterpartPrivateLayer?.firstName).toBeDefined()
    })
  })

  /* ------------------------------------------------------------------ */
  /*  The guarded write                                                 */
  /* ------------------------------------------------------------------ */

  describe('the guard', () => {
    test('two proposals at once leave one winner and one conflict', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const { setupId, a } = yield* mutualSetup

          const [one, two] = yield* Effect.all(
            [
              Effect.either(
                lifecycle.propose(
                  a,
                  setupId,
                  proposalFixture([SLOT_ONE], 'Kaffi Vest')
                )
              ),
              Effect.either(
                lifecycle.propose(
                  a,
                  setupId,
                  proposalFixture([SLOT_TWO], 'Mokka')
                )
              ),
            ],
            { concurrency: 'unbounded' }
          )

          const row = yield* rowOf(setupId)
          return { one, two, row }
        })
      )

      const outcomes = [result.one, result.two]
      expect(outcomes.filter((one) => one._tag === 'Right')).toHaveLength(1)

      const loser = outcomes.find((one) => one._tag === 'Left')
      expect(loser?._tag === 'Left' ? loser.left : undefined).toMatchObject({
        _tag: 'Conflict',
        status: 'proposed',
      })

      // One proposal on the row, not a blend of two.
      expect(result.row?.status).toBe('proposed')
      expect(['Kaffi Vest', 'Mokka']).toContain(
        result.row?.proposal?.venue.name ?? ''
      )
      expect(result.row?.proposal?.slots).toHaveLength(1)
    })

    test('two sides confirming different slots at once do not both win', async () => {
      const result = await run(
        Effect.gen(function* () {
          const lifecycle = yield* SetupLifecycle
          const { setupId, a, b } = yield* mutualSetup
          yield* lifecycle.propose(
            a,
            setupId,
            proposalFixture([SLOT_ONE, SLOT_TWO])
          )

          const [one, two] = yield* Effect.all(
            [
              Effect.either(lifecycle.confirm(a, setupId, SLOT_ONE)),
              Effect.either(lifecycle.confirm(b, setupId, SLOT_TWO)),
            ],
            { concurrency: 'unbounded' }
          )

          const row = yield* rowOf(setupId)
          return { one, two, row }
        })
      )

      const outcomes = [result.one, result.two]
      expect(outcomes.filter((one) => one._tag === 'Right')).toHaveLength(1)

      const loser = outcomes.find((one) => one._tag === 'Left')
      expect(loser?._tag === 'Left' ? loser.left : undefined).toMatchObject({
        _tag: 'Conflict',
        status: 'proposed',
      })

      // Nobody was signed up for a date neither of them agreed to.
      expect(result.row?.status).toBe('proposed')
      expect(result.row?.confirmedA !== result.row?.confirmedB).toBe(true)
    })
  })
})
