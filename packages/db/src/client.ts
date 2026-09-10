import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { PgClient } from '@effect/sql-pg'
import { Config, Layer } from 'effect'

/**
 * Postgres connection, configured from DATABASE_URL. Redacted so the password
 * never lands in a log line or a span attribute.
 */
export const PgLive = PgClient.layerConfig({
  url: Config.redacted('DATABASE_URL'),
})

/**
 * Drizzle query builder running on top of the Effect SqlClient, so queries are
 * Effects and take part in the same tracing, pooling and error channel.
 *
 * drizzle-kit still owns the schema and migrations; this is the read/write path.
 *
 * `casing` MUST match drizzle.config.ts: columns are declared without explicit
 * names (`tokenHash: text()`), so without it drizzle emits "tokenHash" instead
 * of "token_hash" and every query fails at runtime.
 *
 * The PgDrizzle tag is not generic over a schema, so tables are passed to each
 * query explicitly rather than through drizzle's relational query API.
 */
export const DbLive = PgDrizzle.layerWithConfig({
  casing: 'snake_case',
}).pipe(Layer.provideMerge(PgLive))

export { PgDrizzle }
