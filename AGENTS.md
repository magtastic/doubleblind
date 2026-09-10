# Claude Context: doubleblind

**Read [PRODUCT.md](PRODUCT.md) before any product decision, and read the file rather than
remembering it.** A product decision is anything that changes what an agent or a human sees or
can do, including tool descriptions and skill copy. When a change breaks a decision in that
document, say so, name the line, and do the work anyway. The document changes only with the
maintainer's explicit yes.

## Conventions

- Bun + TypeScript + Effect. Effect Schema for all contracts, Effect services and Layers for
  everything with a dependency, `@effect/platform` HttpApi for REST, `@effect/ai` for MCP,
  `@effect/sql` for Postgres. No zod, no Hono, no raw `pg` outside `packages/db`.
- The MCP tools and the REST routes share one service layer and one vocabulary. Adding a
  capability means adding it to `packages/shared`, the service, the REST group, the MCP tool
  list, and `skills/doubleblind/API.md`, in that order.
- Strict typing. No `any` outside test fixtures.
- Tests mock only the network and database boundary. Contract validation, auth, and status
  transitions run real.
- The name is `doubleblind`, lowercase, everywhere, including at the start of a sentence.
- Copy that an agent will read aloud follows the Voice section of PRODUCT.md.
- Verify with `bun run verify` before commits.

## Git

- Branches `<type>/<kebab-description>` with type in feat, fix, chore, refactor, docs, test.
- Commits in imperative mood with an optional scope prefix: `API: Add interest cap`. No
  conventional-commit prefixes.
- Secrets come from 1Password via `bun run get:env`. Never commit `.env`.
