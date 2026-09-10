import {
  CandidatesQuery,
  CandidatesResponse,
  ConfirmRequest,
  ConfirmResponse,
  Conflict,
  Gone,
  HealthResponse,
  InterestRequest,
  InterestResponse,
  NotFound,
  NotImplemented,
  Profile,
  ProposeRequest,
  ProposeResponse,
  PublishResponse,
  RateLimited,
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
import { CurrentProfile } from './service.ts'

/**
 * Stubbed operations answer 501 rather than the 500 a tagged error would
 * default to.
 */
const NotImplementedError = NotImplemented.annotations(
  HttpApiSchema.annotations({ status: 501 })
)

/**
 * The documented error surface (see skills/doubleblind/API.md). 400 comes free
 * from schema validation; these are the rest.
 */
const UnauthorizedError = Unauthorized.annotations(
  HttpApiSchema.annotations({ status: 401 })
)

/** Unknown setup or profile. */
const NotFoundError = NotFound.annotations(
  HttpApiSchema.annotations({ status: 404 })
)

/** Action not valid for the setup's current status, e.g. a second counter. */
const ConflictError = Conflict.annotations(
  HttpApiSchema.annotations({ status: 409 })
)

/** Caller's profile expired after 90 days without a check-in, or was deleted. */
const GoneError = Gone.annotations(HttpApiSchema.annotations({ status: 410 }))

/** Weekly interest cap reached. */
const RateLimitedError = RateLimited.annotations(
  HttpApiSchema.annotations({ status: 429 })
)

/**
 * Bearer auth placeholder. Declares the security scheme and provides a
 * CurrentProfile, but does not yet reject anything.
 *
 * TODO: hash the token, look up profiles.token_hash, fail Unauthorized on a
 * miss, and bump last_seen_at so the profile does not expire.
 */
export class BearerAuth extends HttpApiMiddleware.Tag<BearerAuth>()(
  'BearerAuth',
  {
    provides: CurrentProfile,
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
  .addError(GoneError)
  .middleware(BearerAuth)

const interest = HttpApiEndpoint.post('interest', '/interest')
  .setPayload(InterestRequest)
  .addSuccess(InterestResponse)
  .addError(NotImplementedError)
  .addError(NotFoundError)
  .addError(GoneError)
  .addError(RateLimitedError)
  .middleware(BearerAuth)

const propose = HttpApiEndpoint.post('propose', '/propose')
  .setPayload(ProposeRequest)
  .addSuccess(ProposeResponse)
  .addError(NotImplementedError)
  .addError(NotFoundError)
  .addError(ConflictError)
  .addError(GoneError)
  .middleware(BearerAuth)

const confirm = HttpApiEndpoint.post('confirm', '/confirm')
  .setPayload(ConfirmRequest)
  .addSuccess(ConfirmResponse)
  .addError(NotImplementedError)
  .addError(NotFoundError)
  .addError(ConflictError)
  .addError(GoneError)
  .middleware(BearerAuth)

const deleteProfile = HttpApiEndpoint.del('deleteProfile', '/profile')
  .addSuccess(Schema.Void, { status: 204 })
  .addError(NotImplementedError)
  .addError(GoneError)
  .middleware(BearerAuth)

const setups = HttpApiEndpoint.get('setups', '/setups')
  .addSuccess(SetupsResponse)
  .addError(NotImplementedError)
  .addError(GoneError)
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
