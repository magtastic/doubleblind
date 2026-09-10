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
import { CurrentProfile, type Doubleblind } from './service.ts'

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
 * Placeholder profile for MCP. The HttpApi resolves its caller through the
 * BearerAuth middleware, but MCP tool handlers sit behind the RPC protocol
 * and have no equivalent per-request hook.
 *
 * TODO: resolve the profile per request from the Authorization header.
 */
const McpProfileLive = Layer.succeed(CurrentProfile, {
  profileId: '',
  token: '',
})

/**
 * MCP and REST share one router, so a single web handler serves /mcp
 * alongside every REST route. Both still need a Doubleblind service, which
 * the caller supplies — that is what keeps the two interfaces on one
 * implementation.
 */
export const AllRoutes = Layer.mergeAll(
  ApiRoutes,
  McpRoutes.pipe(Layer.provide(McpProfileLive))
)

/**
 * Builds the web handler over a given app layer. Production passes AppLive
 * (service + database); tests pass a database-free layer.
 */
export const makeWebHandler = <E>(appLayer: Layer.Layer<Doubleblind, E>) =>
  HttpLayerRouter.toWebHandler(
    AllRoutes.pipe(Layer.provide(appLayer), Layer.provideMerge(PlatformLive))
  )
