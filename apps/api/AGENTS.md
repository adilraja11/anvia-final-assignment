# AGENTS.md

## Scope

This package serves the Hono API. The current `/api/chat` routes create, list, load, stream, and clear Prisma-backed agent-memory sessions; `src/lib/prisma.ts` owns the Prisma client, and `@repo/agents` owns agent construction.

For a streaming or client-protocol change, read [../../ANVIA_APPS.md](../../ANVIA_APPS.md). Keep the API as the trust boundary: authenticate, authorize, validate input, rate-limit where the product contract requires it, and project only browser-safe client events. Provider credentials, raw runtime events, tool arguments/results, private errors, and continuations stay server-side.

## Markdown naming and routing

Follow the repository [Markdown naming and routing policy](../../AGENTS.md#markdown-naming-and-routing). Keep API-wide contracts in uppercase filenames and name any focused API reference in lowercase kebab-case. Link a focused document from this file with the exact API change that requires it.

## Persistence and contracts

- Update `prisma/schema.prisma` for data-model changes, create a migration through Prisma, then regenerate the client. Do not edit `src/generated/prisma/` or existing migration files by hand.
- Preserve session ownership and scope when changing memory reads, writes, streams, or deletion. A browser-supplied session ID is untrusted input, not authorization.
- Keep `DATABASE_URL` and all provider secrets in the root `.env`; never pass server secrets through `VITE_*` variables or API responses.
- If an API change depends on a new agent export, update and build `@repo/agents` as part of the same change.

## Verification

- `pnpm --filter @repo/api typecheck` for TypeScript changes.
- `pnpm --filter @repo/api build` for compiled-server changes.
- `pnpm db:generate` after schema changes; use `pnpm db:migrate` only with the intended local migration and configured database.
- Start with `pnpm dev:api` and exercise the changed route when local database and provider configuration are available.
