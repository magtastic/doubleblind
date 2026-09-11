import { createHash } from 'node:crypto'
import { EMBEDDING_DIMENSIONS } from '@doubleblind/db/schema'
import { EmbeddingModel } from '@effect/ai'
import { OpenAiClient, OpenAiEmbeddingModel } from '@effect/ai-openai'
import { FetchHttpClient } from '@effect/platform'
import { Config, Effect, Layer } from 'effect'

/**
 * The embeddings seam. Ranking candidates is nearest-neighbour search over
 * brief embeddings, so the service depends on `@effect/ai`'s `EmbeddingModel`
 * tag and nothing more specific.
 *
 * Two adapters implement it: OpenAI in production, a deterministic hash in
 * tests and keyless local dev.
 */

/** text-embedding-3-small at 1536 dims, matching the vector column. */
export const EMBEDDING_MODEL = 'text-embedding-3-small'

export const EmbeddingModelOpenAi = OpenAiEmbeddingModel.layerBatched({
  model: EMBEDDING_MODEL,
  config: { dimensions: EMBEDDING_DIMENSIONS },
}).pipe(
  Layer.provide(
    OpenAiClient.layerConfig({ apiKey: Config.redacted('OPENAI_API_KEY') })
  ),
  Layer.provide(FetchHttpClient.layer)
)

/**
 * A unit vector derived from SHA-256 of the text: identical texts give
 * identical vectors, different texts give different ones, and nothing is
 * random, so a test can predict the ordering it expects.
 *
 * Each digest yields sixteen int16s; enough digests are chained to fill the
 * requested dimensionality, then the vector is L2-normalised so cosine
 * distance behaves the way pgvector's `<=>` expects.
 */
export const deterministicEmbedding = (
  input: string,
  dimensions = EMBEDDING_DIMENSIONS
): Array<number> => {
  const values: Array<number> = []

  for (let round = 0; values.length < dimensions; round += 1) {
    const digest = createHash('sha256')
      .update(input, 'utf8')
      .update(Uint8Array.of(round & 0xff))
      .digest()

    for (let at = 0; at + 1 < digest.length && values.length < dimensions; ) {
      values.push(digest.readInt16BE(at) / 0x8000)
      at += 2
    }
  }

  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0))
  return norm === 0 ? values : values.map((value) => value / norm)
}

/** Keyless, offline, deterministic. Used by the module tests and by dev. */
export const EmbeddingModelDeterministic = Layer.succeed(
  EmbeddingModel.EmbeddingModel,
  EmbeddingModel.EmbeddingModel.of({
    embed: (input) => Effect.succeed(deterministicEmbedding(input)),
    embedMany: (input) =>
      Effect.succeed(input.map((one) => deterministicEmbedding(one))),
  })
)
