import {
  CandidatesResponse,
  ConfirmResponse,
  DeclineResponse,
  InterestResponse,
  ProposeResponse,
  PublishResponse,
  SetupsResponse,
} from '@doubleblind/shared'
import { Effect, Layer } from 'effect'
import { Doubleblind } from '../../src/service.ts'
import { FAKE_PROFILE_ID, fakeCaller } from './fake-caller.ts'

export { FAKE_PROFILE_ID }

/**
 * A canned Doubleblind for the transport tests.
 *
 * These tests are about the adapters: routing, schema validation, and the
 * mapping from a declared failure to an HTTP status or an MCP tool error. The
 * service itself is exercised against a real database in service.test.ts, so
 * here it is replaced wholesale and each test overrides only the method it
 * cares about.
 */

export const FAKE_SETUP_ID = '22222222-2222-4222-8222-222222222222'

type FakeService = Omit<Doubleblind, '_tag'>

const defaults: FakeService = {
  publish: () =>
    Effect.succeed(
      new PublishResponse({ profileId: FAKE_PROFILE_ID, token: 'fake-token' })
    ),
  candidates: () => Effect.succeed(new CandidatesResponse({ candidates: [] })),
  interest: () =>
    Effect.succeed(
      new InterestResponse({
        setupId: FAKE_SETUP_ID,
        status: 'interest_pending',
      })
    ),
  propose: () => Effect.succeed(new ProposeResponse({ status: 'proposed' })),
  confirm: () => Effect.succeed(new ConfirmResponse({ status: 'confirmed' })),
  decline: () => Effect.succeed(new DeclineResponse({ status: 'declined' })),
  deleteProfile: () => Effect.void,
  setups: () => Effect.succeed(new SetupsResponse({ setups: [] })),
}

/**
 * An app layer of the same shape as AppLive — a service and a caller resolver
 * — with no database behind it.
 */
export const fakeApp = (
  overrides: Partial<FakeService> = {},
  caller = fakeCaller()
) =>
  Layer.mergeAll(
    Layer.succeed(Doubleblind, Doubleblind.make({ ...defaults, ...overrides })),
    caller
  )
