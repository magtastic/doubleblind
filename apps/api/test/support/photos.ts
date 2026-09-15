import { randomUUID } from 'node:crypto'
import {
  decodePhoto,
  PhotoLinks,
  PhotoStorage,
  photoLinks,
} from '@doubleblind/photos'
import { Effect, Layer } from 'effect'

/** Object storage is a network boundary; link signing and image validation run real. */
export const photoObjects = new Map<
  string,
  { bytes: Uint8Array; contentType: string }
>()
export const TestPhotos = Layer.mergeAll(
  Layer.succeed(
    PhotoLinks,
    photoLinks('test-only-secret', 'https://photos.example')
  ),
  Layer.succeed(
    PhotoStorage,
    PhotoStorage.of({
      upload: (value) =>
        Effect.sync(() => {
          const photo = decodePhoto(value)
          const key = `photos/${randomUUID()}.${photo.extension}`
          photoObjects.set(key, photo)
          return key
        }),
      remove: (key) =>
        Effect.sync(() => {
          photoObjects.delete(key)
        }),
      read: (key) => Effect.sync(() => photoObjects.get(key) ?? null),
    })
  )
)
