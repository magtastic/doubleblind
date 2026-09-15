import { expect, test } from 'bun:test'
import { isSuperAdmin } from '../lib/access.ts'

test('only the designated Google account has super-admin access', () => {
  expect(isSuperAdmin('magnus@smitten.fun')).toBe(true)
  expect(isSuperAdmin('Magnus@Smitten.fun')).toBe(true)
  for (const email of [
    null,
    undefined,
    '',
    'someone@smitten.fun',
    'magnus@smitten.co',
    'magnus+test@smitten.fun',
    'magnus@smitten.fun.evil.example',
  ]) {
    expect(isSuperAdmin(email)).toBe(false)
  }
})
