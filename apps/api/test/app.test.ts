import { describe, expect, test } from 'bun:test'
import { Effect } from 'effect'
import { makeWebHandler } from '../src/http.ts'
import { Doubleblind } from '../src/service.ts'

// No database: the service stubs need none, so tests stay hermetic.
const { handler } = makeWebHandler(Doubleblind.Default)

const validProfile = {
  age: 34,
  gender: 'woman',
  interestedIn: ['man', 'non_binary'],
  city: 'Reykjavík',
  country: 'IS',
  radiusKm: 25,
  availability: 'weekday evenings, sunday afternoons',
  brief:
    'She is a hydrologist who reads the weather like other people read faces. ' +
    'She values directness and dislikes being managed. She wants someone who ' +
    'has their own thing going on. Dealbreaker: anyone who calls hiking a ' +
    'hobby and means a car park.',
  privateLayer: {
    firstName: 'Sigrún',
    phone: '+3548221234',
  },
}

/** Drives the same web handler that the Vercel Function exports. */
const request = (path: string, init?: RequestInit) =>
  Effect.promise(() => handler(new Request(`http://localhost${path}`, init)))

const postJson = (path: string, body: unknown) =>
  request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('GET /health', () => {
  test('returns ok', async () => {
    const res = await Effect.runPromise(request('/health'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})

describe('POST /publish', () => {
  test('rejects an invalid body with 400', async () => {
    const res = await Effect.runPromise(
      postJson('/publish', { ...validProfile, age: 12 })
    )
    expect(res.status).toBe(400)
  })

  test('accepts a valid body and reports not_implemented', async () => {
    const res = await Effect.runPromise(postJson('/publish', validProfile))
    expect(res.status).toBe(501)
    expect(await res.json()).toMatchObject({
      _tag: 'NotImplemented',
      operation: 'publish',
    })
  })
})
