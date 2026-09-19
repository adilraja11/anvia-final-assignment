# AGENTS.md

## Scope

This package serves the Hono API. The current `/api/chat` routes create, list, load, stream, and clear Prisma-backed agent-memory sessions; `src/lib/prisma.ts` owns the Prisma client, and `@repo/agents` owns agent construction.

For a streaming or client-protocol change, read [../../ANVIA_APPS.md](../../ANVIA_APPS.md). Keep the API as the trust boundary: authenticate, authorize, validate input, rate-limit where the product contract requires it, and project only browser-safe client events. Provider credentials, raw runtime events, tool arguments/results, private errors, and continuations stay server-side.

## Markdown naming and routing

Follow the repository [Markdown naming and routing policy](../../AGENTS.md#markdown-naming-and-routing). Keep API-wide contracts in uppercase filenames and name any focused API reference in lowercase kebab-case. Link a focused document from this file with the exact API change that requires it.

Before implementing or revising the dedicated image-identification or valuation-agent HTTP routes,
read the [agent API integration plan](docs/plans/agent-api-integration.md).
When changing those routes' request, response, validation, authentication, or error behavior, also
read the [agent API contract](docs/contracts/agent-api.md).
The intended public product contract is seller-first and second-hand-only: it accepts no asking or
original price, derives a median-based suggestion from one Blibli evidence set, and returns a
separate observed Blibli market range. The local-only valuation route implements that calculation
boundary, but it remains a synchronous stage contract: do not present it as the public product API
until its job, access-control, rate-limit, persistence, and browser contracts exist.

Before implementing or revising the persistent valuation job, result, or evidence workflow, read
the [valuation workflow integration plan](docs/plans/valuation-workflow-integration.md). When
changing its public request, polling, result, evidence, access-control, idempotency, or error
behavior, also read the [valuation workflow API contract](docs/contracts/valuation-workflow-api.md).
The workflow documents describe a proposed target and do not make those routes live.

Before adding or changing Prisma models, enums, relations, indexes, migrations, retention, or
worker-claim fields for that workflow, read the
[valuation data-model contract](docs/contracts/valuation-data-model.md).

Before implementing or revising valuation-scoped follow-up chat routes, chat-session binding,
valuation-result grounding, or the dedicated explainer agent, read the
[valuation chat API contract](docs/contracts/valuation-chat-api.md). Before sequencing that work,
also read the [valuation chat integration plan](docs/plans/valuation-chat-integration.md). These
documents describe a proposed tool-free explanation surface and do not make it live.

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
