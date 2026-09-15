import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

/**
 * The doubleblind API contract.
 *
 * Every schema here is shared by the HttpApi endpoints, the MCP tools and the
 * database layer, so it is the single source of truth for what an agent may
 * say about its human and what the service says back.
 */

/* -------------------------------------------------------------------------- */
/*  Primitives                                                                */
/* -------------------------------------------------------------------------- */

export const GENDERS = ['man', 'woman', 'non_binary'] as const

export const Gender = Schema.Literal(...GENDERS).annotations({
  identifier: 'Gender',
})
export type Gender = typeof Gender.Type

export const SETUP_STATUSES = [
  'interest_pending',
  'mutual',
  'proposed',
  'countered',
  'confirmed',
  'declined',
  'expired',
] as const

export const SetupStatus = Schema.Literal(...SETUP_STATUSES).annotations({
  identifier: 'SetupStatus',
})
export type SetupStatus = typeof SetupStatus.Type

/** ISO-3166-1 alpha-2, uppercase. */
export const CountryCode = Schema.String.pipe(
  Schema.pattern(/^[A-Z]{2}$/)
).annotations({
  identifier: 'CountryCode',
  description: 'ISO-3166-1 alpha-2 country code, uppercase, e.g. IS',
})

export const PhoneNumber = Schema.String.pipe(
  Schema.pattern(/^\+[1-9]\d{6,14}$/)
).annotations({
  identifier: 'PhoneNumber',
  description: 'E.164 phone number, e.g. +3548221234',
})

export const ProfileId = Schema.UUID.annotations({ identifier: 'ProfileId' })
export type ProfileId = typeof ProfileId.Type

export const SetupId = Schema.UUID.annotations({ identifier: 'SetupId' })
export type SetupId = typeof SetupId.Type

/** ISO-8601 instant, e.g. 2026-09-18T19:30:00Z. */
export const Timestamp = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/)
).annotations({ identifier: 'Timestamp' })

export const BRIEF_MAX_LENGTH = 6000

/**
 * A third-person portrait written by the agent, in markdown.
 *
 * By convention it covers, in order: who they are / how they live / what they
 * value / what they want / dealbreakers. Only the length is enforced.
 */
export const Brief = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(BRIEF_MAX_LENGTH)
).annotations({ identifier: 'Brief' })

/* -------------------------------------------------------------------------- */
/*  Profile                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The structured, filterable facts about a human. Shared by ProfileCore and
 * CandidateCore, which differ only in whether radiusKm is present.
 */
const coreFields = {
  age: Schema.Int.pipe(Schema.between(18, 99)),
  gender: Gender,
  interestedIn: Schema.NonEmptyArray(Gender),
  city: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(120)),
  country: CountryCode,
  /** Free text, short: "weekday evenings, sunday afternoons". */
  availability: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200)),
}

export class ProfileCore extends Schema.Class<ProfileCore>('ProfileCore')({
  ...coreFields,
  radiusKm: Schema.optionalWith(Schema.Int.pipe(Schema.between(1, 500)), {
    default: () => 25,
  }),
}) {}

/** What another agent gets to see: no radius, no private layer. */
export class CandidateCore extends Schema.Class<CandidateCore>('CandidateCore')(
  coreFields
) {}

/** Withheld until both humans confirm a date. */
export class PrivateLayer extends Schema.Class<PrivateLayer>('PrivateLayer')({
  firstName: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(80)),
  phone: PhoneNumber,
  photoUrl: Schema.optional(
    Schema.String.pipe(
      Schema.maxLength(1400000),
      Schema.pattern(
        /^(https:\/\/[^\s]+|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2})$/
      )
    )
  ),
}) {}

export class Profile extends ProfileCore.extend<Profile>('Profile')({
  brief: Brief,
  privateLayer: PrivateLayer,
  email: Schema.optional(Schema.String),
  /** Agent-steering, e.g. "no weekdays", "never propose bars". */
  standingInstructions: Schema.optional(
    Schema.String.pipe(Schema.maxLength(1000))
  ),
}) {}

export class Candidate extends Schema.Class<Candidate>('Candidate')({
  profileId: ProfileId,
  core: CandidateCore,
  brief: Brief,
  score: Schema.Number.pipe(Schema.between(0, 1)),
}) {}

/* -------------------------------------------------------------------------- */
/*  Setups                                                                    */
/* -------------------------------------------------------------------------- */

export class Venue extends Schema.Class<Venue>('Venue')({
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200)),
  address: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(400)),
}) {}

export class Proposal extends Schema.Class<Proposal>('Proposal')({
  venue: Venue,
  /** 1-3 candidate start times. */
  slots: Schema.Array(Timestamp).pipe(Schema.minItems(1), Schema.maxItems(3)),
  note: Schema.optional(Schema.String.pipe(Schema.maxLength(500))),
}) {}

/** The caller's role in a setup: a proposes first, b may counter once. */
export const SetupRole = Schema.Literal('a', 'b').annotations({
  identifier: 'SetupRole',
})
export type SetupRole = typeof SetupRole.Type

export class Setup extends Schema.Class<Setup>('Setup')({
  setupId: SetupId,
  counterpartProfileId: ProfileId,
  role: SetupRole,
  status: SetupStatus,
  proposal: Schema.NullOr(Proposal),
  counter: Schema.NullOr(Proposal),
  confirmedSlot: Schema.NullOr(Timestamp),
  /** Whether the caller has confirmed. The counterpart's flag is not exposed. */
  youConfirmed: Schema.Boolean,
  /**
   * The counterpart's private layer, present only once the setup is
   * confirmed. Listing setups is how an agent recovers it after the
   * confirm call, so it does not have to store it.
   */
  counterpartPrivateLayer: Schema.optional(PrivateLayer),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  expiresAt: Timestamp,
}) {}

/* -------------------------------------------------------------------------- */
/*  Requests                                                                  */
/* -------------------------------------------------------------------------- */

export const PublishRequest = Profile
export type PublishRequest = Profile

export class CandidatesQuery extends Schema.Class<CandidatesQuery>(
  'CandidatesQuery'
)({
  limit: Schema.optionalWith(
    Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 10)),
    { default: () => 10 }
  ),
}) {}

export class InterestRequest extends Schema.Class<InterestRequest>(
  'InterestRequest'
)({
  profileId: ProfileId,
}) {}

export class ProposeRequest extends Schema.Class<ProposeRequest>(
  'ProposeRequest'
)({
  setupId: SetupId,
  proposal: Proposal,
}) {}

export class ConfirmRequest extends Schema.Class<ConfirmRequest>(
  'ConfirmRequest'
)({
  setupId: SetupId,
  slot: Timestamp,
}) {}

/**
 * Declining takes the setup and nothing else. PRODUCT.md, Voice: "No is
 * always enough. Never ask why." — so there is no reason to carry.
 */
export class DeclineRequest extends Schema.Class<DeclineRequest>(
  'DeclineRequest'
)({
  setupId: SetupId,
}) {}

/* -------------------------------------------------------------------------- */
/*  Responses                                                                 */
/* -------------------------------------------------------------------------- */

export class HealthResponse extends Schema.Class<HealthResponse>(
  'HealthResponse'
)({
  ok: Schema.Literal(true),
}) {}

export class PublishResponse extends Schema.Class<PublishResponse>(
  'PublishResponse'
)({
  profileId: ProfileId,
  /**
   * Opaque bearer token. Shown once, at publish. Store it; it authenticates
   * every later call and is the only way to delete the profile.
   */
  token: Schema.String.pipe(Schema.minLength(1)),
}) {}

export class CandidatesResponse extends Schema.Class<CandidatesResponse>(
  'CandidatesResponse'
)({
  candidates: Schema.Array(Candidate),
}) {}

export class InterestResponse extends Schema.Class<InterestResponse>(
  'InterestResponse'
)({
  setupId: SetupId,
  status: SetupStatus,
}) {}

export class ProposeResponse extends Schema.Class<ProposeResponse>(
  'ProposeResponse'
)({
  status: SetupStatus,
}) {}

export class ConfirmResponse extends Schema.Class<ConfirmResponse>(
  'ConfirmResponse'
)({
  status: SetupStatus,
  /** Released only once both humans have confirmed the same slot. */
  privateLayer: Schema.optional(PrivateLayer),
}) {}

/** Always `declined`: the call either settles the setup or fails. */
export class DeclineResponse extends Schema.Class<DeclineResponse>(
  'DeclineResponse'
)({
  status: SetupStatus,
}) {}

export class SetupsResponse extends Schema.Class<SetupsResponse>(
  'SetupsResponse'
)({
  setups: Schema.Array(Setup),
}) {}

/* -------------------------------------------------------------------------- */
/*  Errors                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Every declared error carries its HTTP status here, where the error is
 * defined, so REST and MCP cannot disagree about what a failure means. The
 * adapters consume the unions below and never re-annotate.
 *
 * 400 comes free from schema validation; these are the rest.
 */

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  'Unauthorized',
  {},
  HttpApiSchema.annotations<Unauthorized>({ status: 401 })
) {}

/** Unknown setup or profile. */
export class NotFound extends Schema.TaggedError<NotFound>()(
  'NotFound',
  {},
  HttpApiSchema.annotations<NotFound>({ status: 404 })
) {}

/** The action is not valid for the setup's current status, e.g. a second counter. */
export class Conflict extends Schema.TaggedError<Conflict>()(
  'Conflict',
  { status: SetupStatus },
  HttpApiSchema.annotations<Conflict>({ status: 409 })
) {}

/** The profile expired: 90 days without a check-in. */
export class Gone extends Schema.TaggedError<Gone>()(
  'Gone',
  {},
  HttpApiSchema.annotations<Gone>({ status: 410 })
) {}

/** Weekly interest cap reached. */
export class RateLimited extends Schema.TaggedError<RateLimited>()(
  'RateLimited',
  { retryAfterSeconds: Schema.Int },
  HttpApiSchema.annotations<RateLimited>({ status: 429 })
) {}

/* -------------------------------------------------------------------------- */
/*  Failure unions, one per operation                                         */
/* -------------------------------------------------------------------------- */

/**
 * Resolving the bearer token can fail two ways, and every authenticated
 * operation inherits both. This is what the REST middleware declares.
 */
export const AuthError = Schema.Union(Unauthorized, Gone)
export type AuthError = typeof AuthError.Type

/**
 * Publishing is open signup, so nothing about it is a declared failure: a bad
 * body is a 400 from schema validation, and an embedding or database outage is
 * a defect, not something an agent can act on.
 */
export const PublishError = Schema.Never
export type PublishError = typeof PublishError.Type

export const CandidatesError = AuthError
export type CandidatesError = AuthError

export const DeleteError = AuthError
export type DeleteError = AuthError

export const SetupsError = AuthError
export type SetupsError = AuthError

export const InterestError = Schema.Union(
  Unauthorized,
  Gone,
  NotFound,
  RateLimited
)
export type InterestError = typeof InterestError.Type

export const ProposeError = Schema.Union(Unauthorized, Gone, NotFound, Conflict)
export type ProposeError = typeof ProposeError.Type

export const ConfirmError = ProposeError
export type ConfirmError = ProposeError

export const DeclineError = ProposeError
export type DeclineError = ProposeError
