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
bun run db:up        # local Postgres with pgvector on :5434
bun run db:migrate
bun run dev
bun run verify       # typecheck + biome + tests
```

## Hosting and CI

| | |
|---|---|
| API + MCP | https://doubleblind-api.vercel.app |
| Admin | https://doubleblind-admin.vercel.app |

Both are Vercel projects under the `smitten-server` team. Neither is connected to this repo on
Vercel's side, deliberately: GitHub Actions owns deployment, so the tests gate it.

`*.vercel.app` is where this lives for now, not where it lands. `doubleblind.date` is bought and
has no DNS yet; moving to it is deferred. The skill hardcodes the API URL, so that move is also a
skill release.

- `.github/workflows/pr.yml` runs on pull requests to `main` and on pushes to `main`.
- `.github/workflows/deploy.yml` runs on pushes to `main`: verify, then migrate, then the two
  Vercel deploys in parallel, then the skill release. Each stage waits for the one before it.
- Both call `.github/workflows/verify.yml`, which is the only definition of the checks: `bun run
  verify` plus `bun run test:db` against a pgvector service container on :5434.

### Secrets

Three repository secrets, in Settings → Secrets and variables → Actions. Everything else the
running services need is a Vercel project environment variable, not an Actions secret.

| Secret | Where it comes from |
|---|---|
| `VERCEL_TOKEN` | vercel.com → Account Settings → Tokens, scoped to the `smitten-server` team |
| `DATABASE_URL` | 1Password, item `doubleblind/DATABASE_URL`. Same value as `bun run get:env` writes. The role must be allowed `CREATE EXTENSION vector` |
| `NPM_TOKEN` | npmjs.com → Access Tokens → Granular, write access to the `doubleblind` package |

### Releasing the skill

`npx skills add magtastic/doubleblind` installs from GitHub, not from npm: the `skills` CLI
resolves git and URL sources only, and keys the install directory off the `name` in SKILL.md
frontmatter. That path needs the repo to be public and nothing else. The npm package exists
alongside it, for projects that depend on the skill and run `npx skills sync`, which scans
`node_modules` for a `SKILL.md` at a package root.

To cut a release, bump the version in **both** `skills/doubleblind/package.json` and
`.claude-plugin/plugin.json` to the same number, then merge to `main`. The release job fails if
the two disagree. It publishes to npm and cuts a `v<version>` GitHub release, and skips either
one cleanly if that version is already out — so merges that do not touch the version are a no-op.

### Deploying by hand

If Actions is down. From the repo root, with `DATABASE_URL` and a Vercel token in the
environment:

```sh
bun install --frozen-lockfile
bun run verify
bunx drizzle-kit migrate

export VERCEL_ORG_ID=team_gDnXmbne0PuTiJ95im5rbTr6
export VERCEL_PROJECT_ID=prj_KnEDfyETA8ldC7VZvB2YjDR1jnhk   # doubleblind-admin: prj_ImBVG3ODEhUEcAHcEMbQlaBMZTgi
npx vercel@59.16.0 pull --yes --environment=production --token="$VERCEL_TOKEN"
npx vercel@59.16.0 build --prod --token="$VERCEL_TOKEN"
npx vercel@59.16.0 deploy --prebuilt --prod --token="$VERCEL_TOKEN"
```

Migrate before deploying the API, never after. Repeat the last four lines with the other project
id for the admin.
