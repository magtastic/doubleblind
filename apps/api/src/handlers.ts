import { HealthResponse } from '@doubleblind/shared'
import { HttpApiBuilder } from '@effect/platform'
import { Effect, Layer, Redacted } from 'effect'
import { BearerAuth, DoubleblindApi } from './api.ts'
import { CurrentProfile, Doubleblind } from './service.ts'

/**
 * Bearer auth placeholder: reads the token and puts a profile in context.
 * It does not reject anything yet — see the TODO on BearerAuth.
 */
export const BearerAuthLive = Layer.succeed(
  BearerAuth,
  BearerAuth.of({
    bearer: (token) =>
      Effect.succeed({ profileId: '', token: Redacted.value(token) }),
  })
)

export const DoubleblindGroupLive = HttpApiBuilder.group(
  DoubleblindApi,
  'doubleblind',
  (handlers) =>
    Effect.gen(function* () {
      const service = yield* Doubleblind

      return handlers
        .handle('health', () =>
          Effect.succeed(new HealthResponse({ ok: true }))
        )
        .handle('publish', ({ payload }) => service.publish(payload))
        .handle('candidates', ({ urlParams }) =>
          CurrentProfile.pipe(
            Effect.flatMap((current) =>
              service.candidates(current, urlParams.limit)
            )
          )
        )
        .handle('interest', ({ payload }) =>
          CurrentProfile.pipe(
            Effect.flatMap((current) => service.interest(current, payload))
          )
        )
        .handle('propose', ({ payload }) =>
          CurrentProfile.pipe(
            Effect.flatMap((current) => service.propose(current, payload))
          )
        )
        .handle('confirm', ({ payload }) =>
          CurrentProfile.pipe(
            Effect.flatMap((current) => service.confirm(current, payload))
          )
        )
        .handle('deleteProfile', () =>
          CurrentProfile.pipe(
            Effect.flatMap((current) => service.deleteProfile(current))
          )
        )
        .handle('setups', () =>
          CurrentProfile.pipe(
            Effect.flatMap((current) => service.setups(current))
          )
        )
    })
)
