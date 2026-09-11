import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'
import { PgDrizzle } from '@doubleblind/db'
import { adminEvents, profiles, setups } from '@doubleblind/db/schema'
import {
  hasTestDb,
  migrate,
  TestDbLive,
  truncateAll,
} from '@doubleblind/db/testing'
import {
  ConfirmRequest,
  DeclineRequest,
  InterestRequest,
  PrivateLayer,
  Profile,
  type ProfileId,
  Proposal,
  ProposeRequest,
  Venue,
} from '@doubleblind/shared'
import { and, eq } from 'drizzle-orm'
import {
  Duration,
  Effect,
  Layer,
  ManagedRuntime,
  TestClock,
  TestContext,
} from 'effect'
import { EmbeddingModelDeterministic } from '../src/embeddings.ts'
import { Doubleblind } from '../src/service.ts'
import { hashToken } from '../src/token.ts'

/**
 * The service against a real Postgres, through the same interface the REST and
 * MCP adapters use. Only two things are substituted: the database points at
 * TEST_DATABASE_URL, and the embedding model is a hash instead of a network
 * call, so similarity is exactly reproducible.
 */

if (!hasTestDb) {
  console.warn(
    '\n' +
      '  ############################################################\n' +
      '  #  service.test.ts SKIPPED: TEST_DATABASE_URL is not set.  #\n' +
      '  #  Run `bun run test:db` to exercise the database.         #\n' +
      '  ############################################################\n'
  )
}

const TestLayer = Doubleblind.Default.pipe(
  Layer.provide(EmbeddingModelDeterministic),
  Layer.provideMerge(TestDbLive)
)

const runtime = ManagedRuntime.make(TestLayer)

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */

const HYDROLOGY_BRIEF =
  'She is a hydrologist who reads the weather like other people read faces. ' +
  'She values directness. Dealbreaker: calling a car park a hike.'

const CELLO_BRIEF =
  'He repairs cellos in a basement workshop and cycles everywhere. He values ' +
  'patience and long friendships. Dealbreaker: contempt for slow work.'

type ProfileOverrides = {
  readonly gender?: Profile['gender']
  readonly interestedIn?: Profile['interestedIn']
  readonly country?: string
  readonly brief?: string
}

const profileFixture = (
  firstName: string,
  overrides: ProfileOverrides = {}
): Profile =>
  new Profile({
    age: 34,
    gender: overrides.gender ?? 'woman',
    interestedIn: overrides.interestedIn ?? ['man'],
    city: 'Reykjavík',
    country: overrides.country ?? 'IS',
    radiusKm: 25,
    availability: 'weekday evenings, sunday afternoons',
    brief: overrides.brief ?? HYDROLOGY_BRIEF,
    privateLayer: new PrivateLayer({ firstName, phone: '+3548221234' }),
  })

/** Publishes a fixture and hands back the id the service issued. */
const publishFixture = (firstName: string, overrides: ProfileOverrides = {}) =>
  Doubleblind.pipe(
    Effect.flatMap((service) =>
      service.publish(profileFixture(firstName, overrides))
    ),
    Effect.map((response) => response.profileId)
  )

/** The pair table enforces profileAId < profileBId; respect it. */
const pairUp = (one: ProfileId, other: ProfileId) =>
  PgDrizzle.PgDrizzle.pipe(
    Effect.flatMap((db) =>
      db.insert(setups).values({
        profileAId: one < other ? one : other,
        profileBId: one < other ? other : one,
        status: 'interest_pending',
        expiresAt: new Date('2027-01-01T00:00:00Z'),
      })
    )
  )

const candidatesFor = (profileId: ProfileId) =>
  Doubleblind.pipe(
    Effect.flatMap((service) => service.candidates({ profileId }, 10))
  )

const describeDb = hasTestDb ? describe : describe.skip

describeDb('Doubleblind service', () => {
  beforeAll(() => runtime.runPromise(migrate))
  beforeEach(() => runtime.runPromise(truncateAll))
  afterAll(() => runtime.dispose())

  describe('publish', () => {
    test('stores only the hash of the token it hands back', async () => {
      const stored = await runtime.runPromise(
        Effect.gen(function* () {
          const service = yield* Doubleblind
          const db = yield* PgDrizzle.PgDrizzle

          const published = yield* service.publish(profileFixture('Sigrún'))

          const rows = yield* db
            .select({ id: profiles.id, tokenHash: profiles.tokenHash })
            .from(profiles)

          return { published, rows }
        })
      )

      expect(stored.rows).toHaveLength(1)
      expect(stored.rows[0]?.id).toBe(stored.published.profileId)
      expect(stored.rows[0]?.tokenHash).toBe(hashToken(stored.published.token))
      // The token itself must not be recoverable from the row.
      expect(stored.rows[0]?.tokenHash).not.toBe(stored.published.token)
    })

    test('records a signup for the admin site with no personal data', async () => {
      const events = await runtime.runPromise(
        Effect.gen(function* () {
          const service = yield* Doubleblind
          const db = yield* PgDrizzle.PgDrizzle

          yield* service.publish(profileFixture('Sigrún'))

          return yield* db
            .select({
              kind: adminEvents.kind,
              payload: adminEvents.payload,
            })
            .from(adminEvents)
        })
      )

      expect(events).toHaveLength(1)
      expect(events[0]?.kind).toBe('profile.published')
      expect(events[0]?.payload).toEqual({ country: 'IS', gender: 'woman' })
    })
  })

  describe('candidates', () => {
    test('applies every hard filter', async () => {
      const result = await runtime.runPromise(
        Effect.gen(function* () {
          const caller = yield* publishFixture('Sigrún')

          // Mutual interest, same country: the only two that qualify.
          const match = yield* publishFixture('Jón', {
            gender: 'man',
            interestedIn: ['woman'],
          })
          const otherMatch = yield* publishFixture('Ari', {
            gender: 'man',
            interestedIn: ['woman'],
            brief: CELLO_BRIEF,
          })

          // The caller is not interested in women.
          yield* publishFixture('Halla', {
            gender: 'woman',
            interestedIn: ['woman'],
          })
          // Not interested in the caller's gender.
          yield* publishFixture('Björn', {
            gender: 'man',
            interestedIn: ['man'],
          })
          // Right genders, wrong country.
          yield* publishFixture('Tom', {
            gender: 'man',
            interestedIn: ['woman'],
            country: 'GB',
          })
          // Already paired with the caller, so off the list whatever the status.
          const paired = yield* publishFixture('Einar', {
            gender: 'man',
            interestedIn: ['woman'],
          })
          yield* pairUp(caller, paired)

          const response = yield* candidatesFor(caller)
          return { caller, match, otherMatch, response }
        })
      )

      expect(
        [...result.response.candidates].map((one) => one.profileId).sort()
      ).toEqual([result.match, result.otherMatch].sort())
      // Never the caller themselves.
      expect(
        result.response.candidates.some(
          (one) => one.profileId === result.caller
        )
      ).toBe(false)
      // The candidate view carries no radius and no private layer.
      expect(
        Object.keys(result.response.candidates[0]?.core ?? {}).sort()
      ).toEqual(
        [
          'age',
          'gender',
          'interestedIn',
          'city',
          'country',
          'availability',
        ].sort()
      )
    })

    test('orders by brief similarity, best first', async () => {
      const result = await runtime.runPromise(
        Effect.gen(function* () {
          const caller = yield* publishFixture('Sigrún')
          const different = yield* publishFixture('Ari', {
            gender: 'man',
            interestedIn: ['woman'],
            brief: CELLO_BRIEF,
          })
          // Byte-identical brief, so cosine distance is exactly 0.
          const identical = yield* publishFixture('Jón', {
            gender: 'man',
            interestedIn: ['woman'],
          })

          const response = yield* candidatesFor(caller)
          return { different, identical, response }
        })
      )

      const ranked = result.response.candidates
      expect(ranked.map((one) => one.profileId)).toEqual([
        result.identical,
        result.different,
      ])
      expect(ranked[0]?.score).toBeCloseTo(1, 5)
      expect(ranked[1]?.score).toBeLessThan(ranked[0]?.score ?? 0)
    })

    test('drops a profile that has not checked in for 90 days', async () => {
      const result = await runtime.runPromise(
        Effect.gen(function* () {
          const caller = yield* publishFixture('Sigrún')
          yield* publishFixture('Jón', {
            gender: 'man',
            interestedIn: ['woman'],
          })

          const before = yield* candidatesFor(caller)
          yield* TestClock.adjust(Duration.days(91))
          const after = yield* candidatesFor(caller)

          return { before, after }
        }).pipe(Effect.provide(TestContext.TestContext))
      )

      expect(result.before.candidates).toHaveLength(1)
      expect(result.after.candidates).toHaveLength(0)
    })
  })

  describe('deleteProfile', () => {
    test('hard-deletes the row, cascades the setups, and logs the deletion', async () => {
      const result = await runtime.runPromise(
        Effect.gen(function* () {
          const service = yield* Doubleblind
          const db = yield* PgDrizzle.PgDrizzle

          const caller = yield* publishFixture('Sigrún')
          const other = yield* publishFixture('Jón', {
            gender: 'man',
            interestedIn: ['woman'],
          })
          yield* pairUp(caller, other)

          yield* service.deleteProfile({ profileId: caller })

          const remaining = yield* db.select({ id: profiles.id }).from(profiles)
          const pairs = yield* db.select({ id: setups.id }).from(setups)
          const logged = yield* db
            .select({ kind: adminEvents.kind })
            .from(adminEvents)
            .where(
              and(
                eq(adminEvents.kind, 'profile.deleted'),
                eq(adminEvents.profileId, caller)
              )
            )

          return { caller, other, remaining, pairs, logged }
        })
      )

      expect(result.remaining.map((one) => one.id)).toEqual([result.other])
      expect(result.pairs).toHaveLength(0)
      expect(result.logged).toHaveLength(1)
    })
  })

  /**
   * The setup operations are SetupLifecycle's, and its own suite covers the
   * rules. These only prove the service reaches it and hands back what it
   * returns, so a broken wiring cannot pass.
   */
  describe('the setup lifecycle', () => {
    const SLOT = '2026-09-18T19:30:00Z'

    test('carries a pair from interest to a confirmed date', async () => {
      const result = await runtime.runPromise(
        Effect.gen(function* () {
          const service = yield* Doubleblind

          const one = yield* publishFixture('Sigrún')
          const two = yield* publishFixture('Jón', {
            gender: 'man',
            interestedIn: ['woman'],
          })

          yield* service.interest(
            { profileId: one },
            new InterestRequest({ profileId: two })
          )
          const mutual = yield* service.interest(
            { profileId: two },
            new InterestRequest({ profileId: one })
          )

          // a is the smaller of the two ids, and a proposes first. Which
          // fixture that is depends on the uuids postgres handed out, so the
          // names travel with the roles rather than being assumed.
          const oneIsA = one < two
          const a = { profileId: oneIsA ? one : two }
          const b = { profileId: oneIsA ? two : one }
          const aName = oneIsA ? 'Sigrún' : 'Jón'
          const bName = oneIsA ? 'Jón' : 'Sigrún'

          const proposed = yield* service.propose(
            a,
            new ProposeRequest({
              setupId: mutual.setupId,
              proposal: new Proposal({
                venue: new Venue({
                  name: 'Kaffi Vest',
                  address: 'Hagamelur 67, Reykjavík',
                }),
                slots: [SLOT],
              }),
            })
          )

          yield* service.confirm(
            a,
            new ConfirmRequest({ setupId: mutual.setupId, slot: SLOT })
          )
          const confirmed = yield* service.confirm(
            b,
            new ConfirmRequest({ setupId: mutual.setupId, slot: SLOT })
          )

          const listed = yield* service.setups(a)

          return { aName, bName, mutual, proposed, confirmed, listed }
        })
      )

      expect(result.mutual.status).toBe('mutual')
      expect(result.proposed.status).toBe('proposed')
      expect(result.confirmed.status).toBe('confirmed')
      // b confirms last, so b is handed a's private layer.
      expect(result.confirmed.privateLayer?.firstName).toBe(result.aName)
      expect(result.listed.setups).toHaveLength(1)
      expect(result.listed.setups[0]?.status).toBe('confirmed')
      expect(result.listed.setups[0]?.counterpartPrivateLayer?.firstName).toBe(
        result.bName
      )
    })

    test('reaches the lifecycle to decline a setup', async () => {
      const result = await runtime.runPromise(
        Effect.gen(function* () {
          const service = yield* Doubleblind

          const one = yield* publishFixture('Sigrún')
          const two = yield* publishFixture('Jón', {
            gender: 'man',
            interestedIn: ['woman'],
          })

          yield* service.interest(
            { profileId: one },
            new InterestRequest({ profileId: two })
          )
          const mutual = yield* service.interest(
            { profileId: two },
            new InterestRequest({ profileId: one })
          )

          const declined = yield* service.decline(
            { profileId: one },
            new DeclineRequest({ setupId: mutual.setupId })
          )
          const listed = yield* service.setups({ profileId: two })

          return { declined, listed }
        })
      )

      expect(result.declined.status).toBe('declined')
      expect(result.listed.setups[0]?.status).toBe('declined')
    })

    test("hands the module's failures back unchanged", async () => {
      const result = await runtime.runPromise(
        Effect.gen(function* () {
          const service = yield* Doubleblind
          const one = yield* publishFixture('Sigrún')

          return yield* Effect.flip(
            service.interest(
              { profileId: one },
              new InterestRequest({
                profileId: '00000000-0000-4000-8000-000000000000',
              })
            )
          )
        })
      )

      expect(result._tag).toBe('NotFound')
    })
  })
})
