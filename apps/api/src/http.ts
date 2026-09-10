import {
  Etag,
  FileSystem,
  HttpLayerRouter,
  HttpPlatform,
  Path,
} from '@effect/platform'
import { Layer } from 'effect'
import { DoubleblindApi } from './api.ts'
import { BearerAuthLive, DoubleblindGroupLive } from './handlers.ts'
import { McpRoutes } from './mcp.ts'
import { CurrentCaller, Doubleblind } from './service.ts'

/**
 * Platform services required by addHttpApi. Deliberately runtime-agnostic —
 * a noop filesystem rather than Bun's or Node's — so the exact same handler
 * runs under `bun run --hot` locally and in a Vercel Function.
 * Nothing here is served from disk.
 */
const PlatformLive = Layer.mergeAll(
  Etag.layer,
  Path.layer,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

/** REST routes for the website. */
const ApiRoutes = HttpLayerRouter.addHttpApi(DoubleblindApi).pipe(
  Layer.provide(DoubleblindGroupLive),
  Layer.provide(BearerAuthLive)
)

/**
 * Placeholder caller for MCP. The HttpApi gets its caller from BearerAuth
 * middleware, but MCP tool handlers sit behind the RPC protocol and have no
 * equivalent hook yet.
 *
 * TODO: resolve the caller per request from the Authorization header.
 */
const McpCallerLive = Layer.succeed(CurrentCaller, {
  profileId: '',
  token: '',
})

/**
 * MCP and REST share one router, so a single web handler serves /mcp
 * alongside every REST route, backed by the same service Layer.
 */
export const AllRoutes = Layer.mergeAll(
  ApiRoutes,
  McpRoutes.pipe(Layer.provide([Doubleblind.Default, McpCallerLive]))
)

export const { handler, dispose } = HttpLayerRouter.toWebHandler(
  AllRoutes.pipe(Layer.provideMerge(PlatformLive))
)
