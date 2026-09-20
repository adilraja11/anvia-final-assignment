# MCP valuation server plan

Status: proposed MVP. This plan exposes the existing valuation workflow to MCP clients; it does
not turn the valuation agent into an MCP client.

## Goal

Let a compatible remote MCP client, such as ChatGPT or Claude, request an AsliSegini? valuation
through a stable production endpoint. The API contract is
[MCP valuation server API contract](../../../../apps/api/docs/contracts/mcp-valuation-server-api.md).

The MVP publishes only `start_valuation` and `get_valuation`. It deliberately excludes account
linking, OAuth, images, MCP resources/prompts/UI, evidence browsing, arbitrary marketplace search,
and generic agent chat.

## Architecture

```text
MCP client
    → HTTPS Streamable HTTP /mcp in apps/api
    → MCP tool adapter
    → existing valuation service and BullMQ queue
    → existing worker
    → fixed Blibli tool + valuation agent explanation
    → deterministic valuation engine
    → PostgreSQL result
    → get_valuation MCP tool
```

`apps/api` owns the transport, MCP request validation, tool schemas, safe result projection,
configured MVP owner key, rate limiting, and deployment route. `@repo/agents` continues to own
only agent construction, the fixed guarded Blibli tool, and the deterministic valuation library.

Do not install or use `@anvia/mcp` for this server-facing feature unless a later requirement makes
AsliSegini consume an external MCP server. The Anvia MCP client pattern must not be attached to
`createValuationAgent`; that factory has a deliberately fixed one-tool boundary.

## Delivery sequence

### 1. Lock the public tool contract

1. Review and approve the API contract before code changes.
2. Keep exactly two read/write classifications: `start_valuation` initiates a bounded valuation job;
   `get_valuation` only reads its safe status/result projection.
3. Make tool names, descriptions, input schemas, output schemas, status values, and error codes
   explicit and version-compatible.
4. State in both tool descriptions that valuations are estimates from Blibli advertised asking
   prices and that results can be pending.

Exit: an MCP client can discover a minimal, unambiguous tool surface without learning provider or
agent internals.

### 2. Add the API MCP server

1. Add an MCP server dependency that supports the current Streamable HTTP transport and is
   compatible with the Hono runtime.
2. Create a dedicated `apps/api/src/modules/mcp/` module for server construction, tool schemas,
   valuation-service adapter, and safe MCP error projection.
3. Mount the module at `/mcp` without changing `/api/valuations`, browser chat routes, or their
   browser-specific request handling.
4. Configure the server-owned `MCP_MVP_OWNER_KEY` through deployment secrets. Do not expose it in
   tool definitions, logs, client responses, or `VITE_*` variables.

Exit: MCP initialization and tool discovery work over a local Streamable HTTP endpoint.

### 3. Adapt the existing valuation workflow

1. Call `createOrReuseValuation` from an internal API service adapter using the configured MVP
   owner key; do not make an HTTP request back into the same Hono application.
2. Reuse the existing validation, idempotency, usage-limit, queue, worker, result, and evidence
   rules. Do not create a second provider/model/price-calculation path.
3. Map queued and running responses to successful `get_valuation` tool results with `result: null`
   and `pollAfterMs`.
4. Map terminal rows through the existing public response mappers. Preserve the distinction between
   `INSUFFICIENT_EVIDENCE` and `SERVICE_FAILURE`.

Exit: one MCP request follows the same durable job lifecycle as the production web application.

### 4. Deploy and validate

1. Route the stable public `/mcp` HTTPS path to `apps/api`; confirm that the deployed proxy supports
   streaming HTTP and does not buffer or rewrite MCP traffic.
2. Set request-size, connection, and tool-execution timeouts. `start_valuation` remains short-lived;
   long-running work stays in BullMQ.
3. Test initialization, discovery, valid calls, invalid schemas, idempotency replay/conflict,
   queued/running/each terminal status, expired IDs, rate limiting, queue failure, and safe error
   redaction with MCP Inspector.
4. Connect the deployed endpoint in a ChatGPT/Claude development integration, verify both tools,
   and retain the MCP request IDs and safe operational traces for failed calls.

Exit: compatible clients can create and poll a valuation without receiving browser events, raw
provider data, or server secrets.

## Non-goals and guardrails

- Do not add arbitrary MCP tools to `createValuationAgent` or permit an MCP client to select an
  actor, provider, model, search URL, retry count, proxy, cache policy, or calculation formula.
- Do not synchronously run the valuation inside an MCP tool call; the existing worker remains the
  execution boundary for paid/provider work.
- Do not expose the generic `/api/valuations` list, valuation-chat sessions, raw evidence, image
  identification, or a generic model prompt during this MVP.
- Do not hand-edit generated Prisma output or alter the current calculation contract.
- Do not represent the MCP endpoint as implemented or publicly installable until its deployment,
  transport validation, and production route are complete.

## Verification commands

After implementation, run:

```sh
pnpm --filter @repo/agents typecheck
pnpm --filter @repo/api typecheck
pnpm --filter @repo/api build
pnpm check
```

Then inspect the local and deployed endpoint with MCP Inspector and execute bounded smoke tests
using approved production-safe credentials.
