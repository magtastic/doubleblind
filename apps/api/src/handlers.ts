import { HealthResponse } from '@doubleblind/shared'
import { HttpApiBuilder } from '@effect/platform'
import { Effect, Layer } from 'effect'
import { BearerAuth, DoubleblindApi } from './api.ts'
import { Caller } from './caller.ts'
import { CurrentProfile, Doubleblind } from './service.ts'

/**
 * The REST half of authentication: the platform pulls the token out of the
 * Authorization header, the Caller module does everything else. All this
 * adapter contributes is the wiring, which is the point — the MCP adapter
 * reaches the same `resolve` by a different route.
 */
export const BearerAuthLive = Layer.effect(
  BearerAuth,
  Effect.gen(function* () {
    const caller = yield* Caller
    return BearerAuth.of({ bearer: (token) => caller.resolve(token) })
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
        .handle('decline', ({ payload }) =>
          CurrentProfile.pipe(
            Effect.flatMap((current) => service.decline(current, payload))
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
