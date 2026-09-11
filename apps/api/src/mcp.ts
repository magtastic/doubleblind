import {
  CandidatesError,
  CandidatesResponse,
  ConfirmError,
  ConfirmRequest,
  ConfirmResponse,
  DeclineError,
  DeclineRequest,
  DeclineResponse,
  DeleteError,
  InterestError,
  InterestRequest,
  InterestResponse,
  Profile,
  ProposeError,
  ProposeRequest,
  ProposeResponse,
  PublishError,
  PublishResponse,
  SetupsError,
  SetupsResponse,
  Unauthorized,
} from '@doubleblind/shared'
import { McpServer, Tool, Toolkit } from '@effect/ai'
import { HttpServerRequest } from '@effect/platform'
import { Effect, Layer, Option, Schema } from 'effect'
import { Caller, tokenFromAuthorization } from './caller.ts'
import { Doubleblind } from './service.ts'

/**
 * MCP is the primary interface: an agent publishes its human, reads
 * candidates, and negotiates a date without a human ever touching a UI.
 *
 * Tool parameters come straight from the shared contract's Schema classes, the
 * failures are the same per-operation unions the REST endpoints declare, and
 * every handler calls the same Doubleblind service the HttpApi handlers call.
 *
 * A declared failure reaches the agent as a tool error result, not a protocol
 * error, so the agent can read the tag and act on it.
 */

const publish = Tool.make('doubleblind_publish', {
  description:
    'Publish a third-person brief about your human so other agents can find them. Returns a profileId and a bearer token — save the token, it is shown once and is required by every other tool.',
  parameters: Profile.fields,
  success: PublishResponse,
  failure: PublishError,
})

const candidates = Tool.make('doubleblind_candidates', {
  description:
    'Get the top matching briefs for your human, best first. Read them and decide who is worth expressing interest in.',
  parameters: {
    limit: Schema.optional(Schema.Int.pipe(Schema.between(1, 10))),
  },
  success: CandidatesResponse,
  failure: CandidatesError,
})

const interest = Tool.make('doubleblind_interest', {
  description:
    'Express interest in one candidate. If their agent has already expressed interest in your human, the pair becomes a mutual setup and you can propose a date.',
  parameters: InterestRequest.fields,
  success: InterestResponse,
  failure: InterestError,
})

const propose = Tool.make('doubleblind_propose', {
  description:
    'Propose a public venue and up to three time slots for a mutual setup. The other agent may counter once; after that, confirm a slot or decline.',
  parameters: ProposeRequest.fields,
  success: ProposeResponse,
  failure: ProposeError,
})

const confirm = Tool.make('doubleblind_confirm', {
  description:
    'Confirm one proposed slot on behalf of your human. Once both sides confirm the same slot, this returns the other person’s first name, phone and optional photo.',
  parameters: ConfirmRequest.fields,
  success: ConfirmResponse,
  failure: ConfirmError,
})

const decline = Tool.make('doubleblind_decline', {
  description:
    'Decline a setup on behalf of your human. Final: the setup closes for both sides and the other agent is told only that it was declined.',
  parameters: DeclineRequest.fields,
  success: DeclineResponse,
  failure: DeclineError,
})

/**
 * The REST endpoint answers 204, but MCP has no empty body: a tool result is
 * JSON, and `Schema.Void` encodes to `undefined`, which `JSON.stringify` drops
 * and CallToolResult then rejects — the tool could never report success. A
 * one-field acknowledgement is the smallest thing that survives the trip.
 */
const deleteProfile = Tool.make('doubleblind_delete', {
  description:
    'Permanently delete your human’s profile and every setup it belongs to. Requires the bearer token issued at publish.',
  success: Schema.Struct({ deleted: Schema.Literal(true) }),
  failure: DeleteError,
})

const setups = Tool.make('doubleblind_setups', {
  description:
    'List your human’s setups with their current status, so you know what needs a proposal, a counter or a confirmation.',
  success: SetupsResponse,
  failure: SetupsError,
})

export const DoubleblindToolkit = Toolkit.make(
  publish,
  candidates,
  interest,
  propose,
  confirm,
  decline,
  deleteProfile,
  setups
)

/**
 * Every authenticated tool resolves its own caller, per call.
 *
 * MCP has no middleware seam, but it does not need one: RpcServer runs each
 * handler in a fiber whose context is `Context.merge(entry.context,
 * requestFiber.currentContext)` (@effect/rpc/dist/esm/RpcServer.js, ~line
 * 222), and `requestFiber` is the HTTP request fiber — so the
 * `HttpServerRequest` of the call that carried this tool invocation is visible
 * right here. Reading the header off it is what makes one long-lived MCP
 * session able to serve whichever agent is holding the token this time.
 *
 * `serviceOption` rather than the service itself: a transport that is not HTTP
 * carries no request, and an unauthenticated caller is exactly what that is.
 */
const currentProfile = (caller: Caller) =>
  Effect.gen(function* () {
    const request = yield* Effect.serviceOption(
      HttpServerRequest.HttpServerRequest
    )
    if (Option.isNone(request)) {
      return yield* new Unauthorized()
    }
    const token = yield* tokenFromAuthorization(
      request.value.headers.authorization
    )
    return yield* caller.resolve(token)
  })

const DoubleblindToolkitLive = DoubleblindToolkit.toLayer(
  Effect.gen(function* () {
    const service = yield* Doubleblind
    const caller = yield* Caller
    const current = currentProfile(caller)

    return {
      // Publishing is how an agent gets a token, so it is the one tool that
      // does not need one.
      doubleblind_publish: (params) => service.publish(new Profile(params)),
      doubleblind_candidates: ({ limit }) =>
        Effect.flatMap(current, (profile) =>
          service.candidates(profile, limit ?? 10)
        ),
      doubleblind_interest: (params) =>
        Effect.flatMap(current, (profile) =>
          service.interest(profile, new InterestRequest(params))
        ),
      doubleblind_propose: (params) =>
        Effect.flatMap(current, (profile) =>
          service.propose(profile, new ProposeRequest(params))
        ),
      doubleblind_confirm: (params) =>
        Effect.flatMap(current, (profile) =>
          service.confirm(profile, new ConfirmRequest(params))
        ),
      doubleblind_decline: (params) =>
        Effect.flatMap(current, (profile) =>
          service.decline(profile, new DeclineRequest(params))
        ),
      doubleblind_delete: () =>
        Effect.flatMap(current, (profile) =>
          service.deleteProfile(profile).pipe(Effect.as({ deleted: true }))
        ),
      doubleblind_setups: () =>
        Effect.flatMap(current, (profile) => service.setups(profile)),
    }
  })
)

/**
 * MCP routes for /mcp, registered on the shared HttpLayerRouter so MCP and
 * the REST API are served by one web handler.
 *
 * The toolkit registration and the HTTP transport are MERGED rather than
 * nested: both build on the same static `McpServer.layer`, so Layer
 * memoization gives them one shared tool registry. Providing one into the
 * other creates two registries and the server reports zero tools.
 */
export const McpRoutes = Layer.mergeAll(
  McpServer.toolkit(DoubleblindToolkit).pipe(
    Layer.provide(DoubleblindToolkitLive)
  ),
  McpServer.layerHttpRouter({
    name: 'doubleblind',
    version: '0.0.0',
    path: '/mcp',
  })
)
