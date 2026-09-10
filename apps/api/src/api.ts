import {
  CandidatesQuery,
  CandidatesResponse,
  ConfirmRequest,
  ConfirmResponse,
  HealthResponse,
  InterestRequest,
  InterestResponse,
  NotImplemented,
  Profile,
  ProposeRequest,
  ProposeResponse,
  PublishResponse,
  SetupsResponse,
  Unauthorized,
} from '@doubleblind/shared'
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
} from '@effect/platform'
import { Schema } from 'effect'
import { CurrentCaller } from './service.ts'

/**
 * Stubbed operations answer 501 rather than the 500 a tagged error would
 * default to.
 */
const NotImplementedError = NotImplemented.annotations(
  HttpApiSchema.annotations({ status: 501 })
)

const UnauthorizedError = Unauthorized.annotations(
  HttpApiSchema.annotations({ status: 401 })
)

/**
 * Bearer auth placeholder. Declares the security scheme and provides a
 * CurrentCaller, but does not yet reject anything.
 *
 * TODO: hash the token, look up profiles.token_hash, fail Unauthorized on a
 * miss, and bump last_seen_at so the profile does not expire.
 */
export class BearerAuth extends HttpApiMiddleware.Tag<BearerAuth>()(
  'BearerAuth',
  {
    provides: CurrentCaller,
    failure: UnauthorizedError,
    security: { bearer: HttpApiSecurity.bearer },
  }
) {}

/** Unauthenticated. Used by uptime checks and the Vercel healthcheck. */
const health = HttpApiEndpoint.get('health', '/health').addSuccess(
  HealthResponse
)

/** Open signup: publishing is how an agent gets its token in the first place. */
const publish = HttpApiEndpoint.post('publish', '/publish')
  .setPayload(Profile)
  .addSuccess(PublishResponse)
  .addError(NotImplementedError)

const candidates = HttpApiEndpoint.get('candidates', '/candidates')
  .setUrlParams(CandidatesQuery)
  .addSuccess(CandidatesResponse)
  .addError(NotImplementedError)
  .middleware(BearerAuth)

const interest = HttpApiEndpoint.post('interest', '/interest')
  .setPayload(InterestRequest)
  .addSuccess(InterestResponse)
  .addError(NotImplementedError)
  .middleware(BearerAuth)

const propose = HttpApiEndpoint.post('propose', '/propose')
  .setPayload(ProposeRequest)
  .addSuccess(ProposeResponse)
  .addError(NotImplementedError)
  .middleware(BearerAuth)

const confirm = HttpApiEndpoint.post('confirm', '/confirm')
  .setPayload(ConfirmRequest)
  .addSuccess(ConfirmResponse)
  .addError(NotImplementedError)
  .middleware(BearerAuth)

const deleteProfile = HttpApiEndpoint.del('deleteProfile', '/profile')
  .addSuccess(Schema.Void, { status: 204 })
  .addError(NotImplementedError)
  .middleware(BearerAuth)

const setups = HttpApiEndpoint.get('setups', '/setups')
  .addSuccess(SetupsResponse)
  .addError(NotImplementedError)
  .middleware(BearerAuth)

export const DoubleblindGroup = HttpApiGroup.make('doubleblind')
  .add(health)
  .add(publish)
  .add(candidates)
  .add(interest)
  .add(propose)
  .add(confirm)
  .add(deleteProfile)
  .add(setups)

export const DoubleblindApi = HttpApi.make('doubleblind').add(DoubleblindGroup)
