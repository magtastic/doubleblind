import {
  Etag,
  FileSystem,
  HttpLayerRouter,
  HttpPlatform,
  Path,
} from '@effect/platform'
import { Layer } from 'effect'
import { DoubleblindApi } from './api.ts'
import type { Caller } from './caller.ts'
import { BearerAuthLive, DoubleblindGroupLive } from './handlers.ts'
import { McpRoutes } from './mcp.ts'
import type { Doubleblind } from './service.ts'

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
  Layer.provide(DoubleblindGroupLive)
)

/**
 * MCP and REST share one router, so a single web handler serves /mcp
 * alongside every REST route. Both authenticate through the same Caller: the
 * REST middleware is derived from it here rather than passed in, so there is
 * exactly one bearer-auth implementation and no way to wire a second.
 */
export const AllRoutes = Layer.mergeAll(ApiRoutes, McpRoutes).pipe(
  Layer.provide(BearerAuthLive)
)

/**
 * Builds the web handler over a given app layer. Production passes AppLive
 * (service + caller over Postgres and OpenAI); the transport tests pass a fake
 * of the same shape and no database.
 */
export const makeWebHandler = <E>(
  appLayer: Layer.Layer<Doubleblind | Caller, E>
) =>
  HttpLayerRouter.toWebHandler(
    AllRoutes.pipe(Layer.provide(appLayer), Layer.provideMerge(PlatformLive))
  )
