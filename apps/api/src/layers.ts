import { DbLive } from '@doubleblind/db'
import { Layer } from 'effect'
import { Doubleblind } from './service.ts'

/**
 * The production application layer: the service over the database.
 *
 * Building this reads DATABASE_URL, so it fails fast on a misconfigured
 * deploy. Tests deliberately use `Doubleblind.Default` alone so they need no
 * database.
 */
export const AppLive = Doubleblind.Default.pipe(Layer.provideMerge(DbLive))
