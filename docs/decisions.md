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

## 2026-09-11: Hosting, secrets and release decisions

Settled with the maintainer before any infrastructure existed. Four questions were put
explicitly; the rest follow from them.

- Ship on `*.vercel.app` for now and move to a custom domain later. `doubleblind.date` was
  bought but has no DNS records at all, and nothing about the alpha needs the name yet.
  Rejected: waiting for DNS before the first deploy.
- Two Vercel projects rather than one: `doubleblind-api` rooted at `apps/api` and
  `doubleblind-admin` rooted at `apps/admin`. They have different runtimes, different secrets and
  very different blast radii. Rejected: one project serving both behind rewrites.
- Postgres from Neon through the Vercel Marketplace. pgvector is a first-class extension there
  and the connection string is injected into the project rather than copied by hand. Rejected:
  a self-managed instance, and Supabase, which brings an auth and storage stack we do not use.
- Deployment runs from GitHub Actions, not from Vercel's Git integration. The repository is
  deliberately not connected to either Vercel project, so nothing reaches production that has not
  passed `bun run verify`, the database suites, and the migration step, in that order. Rejected:
  letting Vercel build on push, which deploys before tests finish and cannot order migrations
  against the deploy.
- The skill is released to npm and tagged as a GitHub release; the repository stays private.
  Rejected: making the repository public so the skill could be installed from a git URL.
- Secrets live in a new 1Password vault, `doubleblind`, which is what `.env.template` already
  pointed at. `AUTH_SECRET` was generated for this project. `OPENAI_API_KEY` is currently the
  key from the shared `Vercel Functions Environment` vault, so doubleblind's embedding usage
  bills to that account until a dedicated key replaces it.
- The MCP server is stateless per request: `@effect/rpc`'s HTTP protocol allocates a client id
  per POST and tears it down with the request scope, and neither `@effect/rpc` nor `@effect/ai`
  keeps a session map. That is why serverless functions are a safe host for it, and why the
  skill does not need sticky routing.
