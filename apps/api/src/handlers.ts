import { HealthResponse } from '@doubleblind/shared'
import { HttpApiBuilder } from '@effect/platform'
import { Effect, Layer, Redacted } from 'effect'
import { BearerAuth, DoubleblindApi } from './api.ts'
import { CurrentCaller, Doubleblind } from './service.ts'

/**
 * Bearer auth placeholder: reads the token and puts a caller in context.
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
          CurrentCaller.pipe(
            Effect.flatMap((caller) =>
              service.candidates(caller, urlParams.limit)
            )
          )
        )
        .handle('interest', ({ payload }) =>
          CurrentCaller.pipe(
            Effect.flatMap((caller) => service.interest(caller, payload))
          )
        )
        .handle('propose', ({ payload }) =>
          CurrentCaller.pipe(
            Effect.flatMap((caller) => service.propose(caller, payload))
          )
        )
        .handle('confirm', ({ payload }) =>
          CurrentCaller.pipe(
            Effect.flatMap((caller) => service.confirm(caller, payload))
          )
        )
        .handle('deleteProfile', () =>
          CurrentCaller.pipe(
            Effect.flatMap((caller) => service.deleteProfile(caller))
          )
        )
        .handle('setups', () =>
          CurrentCaller.pipe(Effect.flatMap((caller) => service.setups(caller)))
        )
    })
).pipe(Layer.provide(Doubleblind.Default))
