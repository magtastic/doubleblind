import { DbLive } from '@swipeless/db'
import { PhotoLinksLive, PhotoStorageLive } from '@swipeless/photos'
import { Layer } from 'effect'
import { Caller } from './caller.ts'
import { EmbeddingModelOpenAi } from './embeddings.ts'
import { Swipeless } from './service.ts'

/**
 * The production application layer: the service and the caller resolver, both
 * over Postgres, with OpenAI behind the embeddings seam. The bearer-auth
 * middleware is derived from Caller inside http.ts, so it is not here.
 *
 * Building this reads DATABASE_URL and OPENAI_API_KEY, so it fails fast on a
 * misconfigured deploy. Tests substitute their own layer of the same shape.
 */
export const AppLive = Layer.mergeAll(Swipeless.Default, Caller.Default).pipe(
  Layer.provide(DbLive),
  Layer.provide(PhotoLinksLive),
  Layer.provide(PhotoStorageLive),
  Layer.provide(EmbeddingModelOpenAi)
)
