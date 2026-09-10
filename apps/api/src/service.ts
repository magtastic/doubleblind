import type {
  CandidatesResponse,
  ConfirmRequest,
  ConfirmResponse,
  InterestRequest,
  InterestResponse,
  Profile,
  ProposeRequest,
  ProposeResponse,
  PublishResponse,
  SetupsResponse,
} from '@doubleblind/shared'
import { NotImplemented } from '@doubleblind/shared'
import { Context, Effect } from 'effect'

/**
 * The authenticated caller, resolved from the bearer token issued at publish.
 */
export interface Caller {
  readonly profileId: string
  readonly token: string
}

export class CurrentCaller extends Context.Tag('CurrentCaller')<
  CurrentCaller,
  Caller
>() {}

/** Every stub returns this shape: fails, but declares its eventual success. */
type Stub<A> = Effect.Effect<A, NotImplemented>

const notImplemented = <A>(operation: string): Stub<A> =>
  Effect.fail(new NotImplemented({ operation }))

/**
 * The service layer. The HttpApi handlers and the MCP tools both call these
 * and nothing else, so the two interfaces can never drift.
 *
 * Every method is a stub failing with NotImplemented, which the HttpApi maps
 * to a 501 and the MCP toolkit reports as a tool error.
 */
export class Doubleblind extends Effect.Service<Doubleblind>()('Doubleblind', {
  succeed: {
    publish: (_profile: Profile): Stub<PublishResponse> =>
      notImplemented('publish'),

    candidates: (_caller: Caller, _limit: number): Stub<CandidatesResponse> =>
      notImplemented('candidates'),

    interest: (
      _caller: Caller,
      _request: InterestRequest
    ): Stub<InterestResponse> => notImplemented('interest'),

    propose: (
      _caller: Caller,
      _request: ProposeRequest
    ): Stub<ProposeResponse> => notImplemented('propose'),

    confirm: (
      _caller: Caller,
      _request: ConfirmRequest
    ): Stub<ConfirmResponse> => notImplemented('confirm'),

    deleteProfile: (_caller: Caller): Stub<void> => notImplemented('delete'),

    setups: (_caller: Caller): Stub<SetupsResponse> => notImplemented('setups'),
  },
}) {}
