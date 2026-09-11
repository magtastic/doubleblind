import { Gone, type ProfileId, Unauthorized } from '@doubleblind/shared'
import { Effect, Layer, Redacted } from 'effect'
import { Caller } from '../../src/caller.ts'
import type { AuthenticatedProfile } from '../../src/service.ts'

/**
 * A canned Caller for the transport tests: a token table instead of a
 * database. The real one is exercised against Postgres in caller.test.ts and
 * end to end in auth.test.ts; here the point is only that each transport asks
 * it the right question and reports its answer the right way.
 */

/** A syntactically valid profile id that no test ever stores. */
export const FAKE_PROFILE_ID: ProfileId = '11111111-1111-4111-8111-111111111111'

/** Resolves to FAKE_PROFILE_ID unless a test says otherwise. */
export const GOOD_TOKEN = 'good-token'
/** In the table, but its profile has not checked in for ninety days. */
export const GONE_TOKEN = 'gone-token'
/** Never issued, or issued to a profile that has since been deleted. */
export const UNKNOWN_TOKEN = 'unknown-token'

export const fakeCaller = (
  tokens: Readonly<Record<string, ProfileId>> = {
    [GOOD_TOKEN]: FAKE_PROFILE_ID,
  }
) =>
  Layer.succeed(
    Caller,
    Caller.make({
      resolve: (
        token
      ): Effect.Effect<AuthenticatedProfile, Unauthorized | Gone> => {
        const secret = typeof token === 'string' ? token : Redacted.value(token)
        if (secret === GONE_TOKEN) {
          return Effect.fail(new Gone())
        }
        const profileId = tokens[secret]
        return profileId === undefined
          ? Effect.fail(new Unauthorized())
          : Effect.succeed({ profileId })
      },
    })
  )
