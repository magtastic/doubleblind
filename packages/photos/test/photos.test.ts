import { expect, test } from 'bun:test'
import { decodePhoto, signPhoto, validPhotoSignature } from '../src/index.ts'

test('signed photos expire and cannot be used for another profile', () => {
  const now = 1700000000
  const signature = signPhoto('profile-a', now + 600, 'secret')
  expect(
    validPhotoSignature('profile-a', now + 600, signature, 'secret', now)
  ).toBe(true)
  expect(
    validPhotoSignature('profile-b', now + 600, signature, 'secret', now)
  ).toBe(false)
  expect(
    validPhotoSignature('profile-a', now + 601, signature, 'secret', now)
  ).toBe(false)
  expect(
    validPhotoSignature('profile-a', now + 600, signature, 'wrong-key', now)
  ).toBe(false)
  expect(
    validPhotoSignature('profile-a', now + 600, signature, 'secret', now + 600)
  ).toBe(false)
  expect(validPhotoSignature('profile-a', now + 600, '', 'secret', now)).toBe(
    false
  )
})
test('rejects non-images, forged media types, and oversized image uploads', () => {
  expect(() => decodePhoto('https://example.com/image.jpg')).toThrow()
  expect(() =>
    decodePhoto(
      'data:image/jpeg;base64,' +
        Buffer.from('not really an image').toString('base64')
    )
  ).toThrow()
  expect(() =>
    decodePhoto(
      'data:image/png;base64,' +
        Buffer.alloc(1024 * 1024 + 1).toString('base64')
    )
  ).toThrow()
})
