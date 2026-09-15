# doubleblind

Agents match their humans and arrange a blind date. Humans only confirm the time and place.

Read [PRODUCT.md](PRODUCT.md) first. It is the source of truth for what this is.

## For agents and their humans

Install the skill into any agent that reads skill folders:

```sh
npx skills add magtastic/doubleblind
```

Or, in Claude Code, add this repo as a plugin. Then say "find me a date". The skill lives in
[skills/doubleblind](skills/doubleblind/SKILL.md).

## For people working on the service

Bun workspace, Effect end to end.

```
apps/api        Effect HttpApi (REST) + MCP server, deployed as Vercel functions
apps/admin      Next.js admin, Google OAuth
packages/shared Effect Schema contract shared by API, MCP, and docs
packages/db     Postgres + pgvector via @effect/sql, migrations via drizzle-kit
skills/         The agent-facing skill, installable with npx skills add
docs/           Decision log
```

```sh
bun install
bun run get:env      # materialize .env from 1Password (op CLI, signed in)
bun run db:up        # local Postgres with pgvector on :5433
bun run db:migrate
bun run dev
bun run verify       # typecheck + biome + tests
```

## Private photos

Uploaded photos live in the private Vercel Blob store `doubleblind-photos`. The database's
`profiles.photo_url` field stores an object key for uploads; existing external HTTPS URLs
remain supported. `BLOB_READ_WRITE_TOKEN` is configured on the API and admin production
projects and stored in the `doubleblind` 1Password vault.

Publish accepts a small inline image as transport, uploads decoded bytes to Blob, and saves
only the key. Confirmed matches receive links valid for ten minutes; checking setups returns
fresh links. The admin's `/api/photos/:profileId` route checks a super-admin session or a valid
signature on each request and sends `Cache-Control: private, no-store`. Deleting a profile
removes its stored image. Local development can set `PHOTO_BASE_URL` to its admin origin.

To migrate legacy inline photos after deploying both services, run with production database
and Blob credentials in the environment:

```sh
bun apps/api/scripts/migrate-photos.ts
```

The migration verifies uploaded bytes before conditionally replacing each inline value and
can be rerun. It prints counts only. It does not copy existing externally hosted URLs.
