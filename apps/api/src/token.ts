import { createHash, randomBytes } from 'node:crypto'
import { Effect } from 'effect'

/**
 * Bearer tokens. Shared by publish, which issues one, and the Caller module,
 * which resolves one.
 *
 * Only the hash is ever stored, so a database dump does not hand out
 * accounts, and a lost token cannot be recovered — only replaced.
 */

/** 32 random bytes, base64url. 256 bits, URL-safe, no padding. */
export const generateToken = (): Effect.Effect<string> =>
  Effect.sync(() => randomBytes(32).toString('base64url'))

/** SHA-256 hex. Fast on purpose: the token is high-entropy, not a password. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex')
