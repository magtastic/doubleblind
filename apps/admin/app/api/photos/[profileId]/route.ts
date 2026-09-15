import { DbLive, PgDrizzle } from '@doubleblind/db'
import { profiles } from '@doubleblind/db/schema'
import {
  isPhotoKey,
  PhotoStorage,
  PhotoStorageLive,
  validPhotoSignature,
} from '@doubleblind/photos'
import { eq } from 'drizzle-orm'
import { Config, Effect, Redacted } from 'effect'
import { auth } from '../../../../auth.ts'
import { isSuperAdmin } from '../../../../lib/access.ts'

export const dynamic = 'force-dynamic'
export async function GET(
  request: Request,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { profileId } = await params
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      profileId
    )
  )
    return new Response(null, { status: 404, headers })
  const session = await auth()
  const url = new URL(request.url)
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      if (!isSuperAdmin(session?.user?.email)) {
        const secret = Redacted.value(
          yield* Config.redacted('BLOB_READ_WRITE_TOKEN')
        )
        if (
          !validPhotoSignature(
            profileId,
            Number(url.searchParams.get('expires')),
            url.searchParams.get('signature') ?? '',
            secret,
            Math.floor(Date.now() / 1000)
          )
        )
          return null
      }
      const db = yield* PgDrizzle.PgDrizzle
      const storage = yield* PhotoStorage
      const rows = yield* db
        .select({ photoUrl: profiles.photoUrl })
        .from(profiles)
        .where(eq(profiles.id, profileId))
        .limit(1)
      const key = rows[0]?.photoUrl
      if (!key || !isPhotoKey(key)) return null
      return yield* storage.read(key)
    }).pipe(
      Effect.provide(DbLive),
      Effect.provide(PhotoStorageLive),
      Effect.catchAllCause(() => Effect.succeed(null))
    )
  )
  if (!result) return new Response(null, { status: 404, headers })
  return new Response(Buffer.from(result.bytes), {
    headers: { ...headers, 'Content-Type': result.contentType },
  })
}
