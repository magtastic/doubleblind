import { HttpLayerRouter } from '@effect/platform'
import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { Layer } from 'effect'
import { AllRoutes } from './http.ts'
import { AppLive } from './layers.ts'

const port = Number(process.env.PORT ?? 3001)

// Local dev serves the same routes as production, on a real Bun server.
HttpLayerRouter.serve(AllRoutes).pipe(
  Layer.provide(AppLive),
  Layer.provide(BunHttpServer.layer({ port })),
  Layer.launch,
  BunRuntime.runMain
)
