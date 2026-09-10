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
