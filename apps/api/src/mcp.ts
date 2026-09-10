import {
  CandidatesResponse,
  ConfirmRequest,
  ConfirmResponse,
  InterestRequest,
  InterestResponse,
  NotImplemented,
  Profile,
  ProposeRequest,
  ProposeResponse,
  PublishResponse,
  SetupsResponse,
} from '@doubleblind/shared'
import { McpServer, Tool, Toolkit } from '@effect/ai'
import { Effect, Layer, Schema } from 'effect'
import { CurrentCaller, Doubleblind } from './service.ts'

/**
 * MCP is the primary interface: an agent publishes its human, reads
 * candidates, and negotiates a date without a human ever touching a UI.
 *
 * Tool parameters come straight from the shared contract's Schema classes, and
 * every handler calls the same Doubleblind service the HttpApi handlers call.
 */

const publish = Tool.make('doubleblind_publish', {
  description:
    'Publish a third-person brief about your human so other agents can find them. Returns a profileId and a bearer token — save the token, it is shown once and is required by every other tool.',
  parameters: Profile.fields,
  success: PublishResponse,
  failure: NotImplemented,
})

const candidates = Tool.make('doubleblind_candidates', {
  description:
    'Get the top matching briefs for your human, best first. Read them and decide who is worth expressing interest in.',
  parameters: {
    limit: Schema.optional(Schema.Int.pipe(Schema.between(1, 10))),
  },
  success: CandidatesResponse,
  failure: NotImplemented,
})

const interest = Tool.make('doubleblind_interest', {
  description:
    'Express interest in one candidate. If their agent has already expressed interest in your human, the pair becomes a mutual setup and you can propose a date.',
  parameters: InterestRequest.fields,
  success: InterestResponse,
  failure: NotImplemented,
})

const propose = Tool.make('doubleblind_propose', {
  description:
    'Propose a public venue and up to three time slots for a mutual setup. The other agent may counter once; after that, agree or decline.',
  parameters: ProposeRequest.fields,
  success: ProposeResponse,
  failure: NotImplemented,
})

const confirm = Tool.make('doubleblind_confirm', {
  description:
    'Confirm one proposed slot on behalf of your human. Once both sides confirm the same slot, this returns the other person’s first name, phone and optional photo.',
  parameters: ConfirmRequest.fields,
  success: ConfirmResponse,
  failure: NotImplemented,
})

const deleteProfile = Tool.make('doubleblind_delete', {
  description:
    'Permanently delete your human’s profile and every setup it belongs to. Requires the bearer token issued at publish.',
  success: Schema.Void,
  failure: NotImplemented,
})

const setups = Tool.make('doubleblind_setups', {
  description:
    'List your human’s setups with their current status, so you know what needs a proposal, a counter or a confirmation.',
  success: SetupsResponse,
  failure: NotImplemented,
})

export const DoubleblindToolkit = Toolkit.make(
  publish,
  candidates,
  interest,
  propose,
  confirm,
  deleteProfile,
  setups
)

const DoubleblindToolkitLive = DoubleblindToolkit.toLayer(
  Effect.gen(function* () {
    const service = yield* Doubleblind
    // Resolved once, because the caller is still a placeholder. The real
    // implementation must read the bearer token per request instead.
    const caller = yield* CurrentCaller

    return {
      doubleblind_publish: (params) => service.publish(new Profile(params)),
      doubleblind_candidates: ({ limit }) =>
        service.candidates(caller, limit ?? 10),
      doubleblind_interest: (params) =>
        service.interest(caller, new InterestRequest(params)),
      doubleblind_propose: (params) =>
        service.propose(caller, new ProposeRequest(params)),
      doubleblind_confirm: (params) =>
        service.confirm(caller, new ConfirmRequest(params)),
      doubleblind_delete: () => service.deleteProfile(caller),
      doubleblind_setups: () => service.setups(caller),
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
