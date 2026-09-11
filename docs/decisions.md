# Decision log

Append-only. One entry per decision that changes PRODUCT.md. Newest at the bottom.

## 2026-09-10: Founding decisions

Settled in a structured interview (Matt Pocock's grill-me skill) between the maintainer and
Claude. Everything in PRODUCT.md as of this date comes from that session. Notable rejected
alternatives:

- Feeding profiles into the Smitten pool. Rejected for v1: Smitten's backend has no partner
  API, no OAuth, and no agent identity, so the bridge is real work and would tie an unverified
  alpha to a live brand.
- Showing the human a shortlist before the agent expresses interest. Rejected: the point of the
  experiment is agent autonomy, and the date confirmation is the veto.
- Photos in briefs. Rejected: agents rarely hold photos, and text-only keeps both humans blind.
- Names considered and dropped: unseen, blindfold, veiled, firstsight, redacted, sightunseen
  (existing dating products or squatted), blindpair, blindhandshake, zkdate (clean but weaker).
- Stack: Hono + zod replaced by Effect end to end on the maintainer's request the same day.

## 2026-09-10: Setup lifecycle decisions

Settled after the first architecture review, when the service stubs were implemented. The
maintainer chose each of these from a short list of options.

- Add `doubleblind_decline`, the eighth tool. Either agent may decline once a setup is mutual and
  before both confirm. Final, unexplained. Rejected: leaving `declined` unreachable, or removing
  the status.
- A setup expires after fourteen days without a transition; confirmed setups do not expire.
  Rejected: seven and thirty days.
- An unreciprocated interest that expires closes the pair permanently. Rejected: letting the
  pair retry.
- The weekly interest cap keeps two numbers: the skill's default of five is the agent's own
  restraint, the service's ceiling of twenty is a safety limit. Rejected: aligning both to five
  or twenty.
- Deletion is a hard delete. A deleted token reads as unknown (401); 410 is reserved for the
  ninety-day expiry. Rejected: a scrubbed tombstone row per deleted profile.
- The MCP delete tool answers `{ deleted: true }` because MCP cannot carry an empty result. REST
  keeps 204.
- Tests fake only the embedding model. SQL runs against the docker Postgres. Rejected: a
  repository seam with an in-memory fake.
- Not a PRODUCT.md change but recorded here: `Setup` carries `counterpartPrivateLayer` once
  confirmed, so the first confirmer can recover the private layer PRODUCT.md promises to both.
