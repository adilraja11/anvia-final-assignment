# Valuation chat API integration plan

Status: implemented locally; public release hardening remains.

## Goal and references

Add a tool-free, persisted follow-up chat for a successful valuation without changing the
deterministic result or starting another marketplace run. The governing route, grounding, memory,
error, and security rules are in the
[valuation chat API contract](../contracts/valuation-chat-api.md). The parent valuation behavior
remains governed by [valuation-workflow-api.md](../contracts/valuation-workflow-api.md).

The existing `/api/chat*` code is useful only as a reference for JSONL projection and Prisma memory.
It is not the target valuation-chat route or agent.

## Current state

- `/api/valuations/:valuationId` returns a persisted terminal result and the evidence endpoint
  returns a safe accepted-evidence projection.
- `/api/chat/:sessionId` parses Client Protocol requests and produces JSONL, but it has no
  `valuationId` binding or result grounding.
- The chat route constructs `createValuationAgent`, whose fixed prompt expects valuation JSON and
  whose tool can launch Blibli retrieval.
- `createValuationAgent` deliberately treats its legacy `memory` option as deprecated and does not
  attach it to the runtime, so the current route is not a valid persistent multi-turn design.
- Session list, read, stream, and deletion currently lack actor ownership enforcement.
- The platform result page does not render a chat interface.

## Target flow

1. A successful result page creates or recovers the single chat session bound to its valuation.
2. The browser restores projected messages from that session.
3. The browser sends a validated Client Protocol message request to the nested streaming route.
4. The API authorizes the valuation/session pair and obtains a per-session active-turn claim.
5. The API reloads the immutable valuation result and accepted evidence from PostgreSQL.
6. The API constructs a bounded, labelled grounding document and starts the tool-free explainer
   agent with Prisma memory.
7. The API projects runtime events through `agentToClientStream` and returns a JSONL response.
8. Disconnect cancels only the active model run. The stored valuation and evidence remain
   unchanged.

## Phase 1 - Session relation and schemas

1. Choose the smallest first-class database binding: extend `AgentMemorySession` with a nullable,
   unique valuation relation or add a dedicated valuation-chat session model that owns Anvia
   memory scope. Include future actor or tenant scope in the uniqueness design.
2. Cascade session/message/error deletion from valuation deletion and ensure expiry cleanup removes
   chat no later than the valuation.
3. Add strict Zod schemas for session envelopes, history projection, route parameters, empty create
   body, safe error envelopes, and chat limits.
4. Add service functions that create-or-recover, resolve, authorize, and clear a bound session
   without model calls.
5. Keep valuation and session IDs out of JSON metadata as the source of relational truth.

Exit: persistence enforces one correctly scoped active session and cleanup can leave no orphaned
chat data.

## Phase 2 - Dedicated result-explainer agent

1. Add a separate `createValuationChatAgent` under `@repo/agents` with a stable ID, conversational
   Bahasa Indonesia instructions, bounded tokens and turns, and no tools or MCP servers.
2. Add a focused prompt that permits exact quotation and explanation of server-calculated values
   but forbids new calculation, price adjustment, general product claims, and new retrieval.
3. Accept a server-constructed grounding document as context; do not accept caller-provided system
   instructions, tools, model settings, or arbitrary context.
4. Attach memory through the supported Anvia shape `memory: { store }` and preserve only reviewed
   user/assistant conversation messages.
5. Export the factory from `@repo/agents` and rebuild the package before API integration.

Exit: direct agent checks show grounded conversational answers, explicit unknowns, and zero tool
calls for normal and adversarial prompts.

## Phase 3 - Grounding service

1. Load the valuation by ID and require terminal `VALUATED` status before any model work.
2. Read all accepted evidence required for explanation from PostgreSQL, but include only approved
   normalized fields in model context.
3. Convert BigInt money to validated integer IDR through the existing safe conversion path.
4. Construct a labelled snapshot that distinguishes confirmed input, `USER_PROVIDED` description,
   application-calculated results, `MARKET_EVIDENCE`, and unknowns.
5. Include the stored limitations and evidence timestamp. Never add raw provider responses,
   rejected evidence, seller data, photo URLs, credentials, or queue state.
6. Rebuild the snapshot on every turn rather than copying it into chat memory.

Exit: one deterministic service produces the complete allowed grounding surface and rejects every
incomplete or non-valued record before the model boundary.

## Phase 4 - Nested routes and stream safety

1. Add the four nested routes from the contract under the valuation router or a mounted child
   router without changing existing valuation response shapes.
2. Apply content type, origin, request-byte, text-length, turn-count, per-actor rate, and one-active-
   turn validation before model construction.
3. For history reads, project stored messages intentionally to browser-safe Client Protocol
   messages instead of returning memory-store records.
4. For message writes, parse `ClientStreamRequest`, allow only `messages`, ignore browser-provided
   history as authority, and use only the newest validated user text as new input.
5. Atomically acquire and release the session's in-flight claim so double submit cannot produce two
   overlapping assistant turns.
6. Project the agent stream with `agentToClientStream` and frame it with
   `createClientStreamResponse({ format: "jsonl" })`.
7. Propagate request abort, bound model duration, flush tracing, map pre-stream errors to safe JSON,
   and map post-header errors to safe protocol events.
8. Rename copied handbook trace names and tags; omit prompts, messages, grounding text, and evidence
   content from trace metadata.

Exit: every model invocation is preceded by valuation/session authorization and every browser event
passes through the client projection boundary.

## Phase 5 - Existing chat route disposition

1. Keep `/api/chat*` separate while the valuation chat is developed; do not silently change its
   semantics for unrelated callers.
2. Determine whether the legacy route has an active consumer. If none exists, schedule an explicit
   deprecation and removal rather than maintaining two ambiguous chat surfaces.
3. If it remains, fix its own authentication, validation, and memory behavior independently. Never
   route valuation follow-up questions through its marketplace-enabled agent.

Exit: the repository has one unambiguous valuation-chat contract and no compatibility alias that
bypasses valuation scoping.

## Phase 6 - Verification and release hardening

Cover at minimum:

- create versus recover semantics and concurrent session creation;
- cross-valuation, cross-session, expired, inaccessible, and future cross-owner identifiers;
- queued, processing, and every non-`VALUATED` terminal status causing zero model calls;
- safe grounding of each result field and representative evidence;
- refusal to recalculate, change prices, search marketplaces, invent facts or URLs, and reveal
  prompts or private data;
- prompt injection in user text, product description, listing title, and prior messages;
- history projection, ordering, refresh recovery, deletion, retention, and cascade cleanup;
- body, text, turn, concurrency, timeout, cancellation, and rate limits;
- malformed Client Protocol requests, interaction responses, attachments, and unsupported parts;
- JSONL headers, incremental rendering, safe stream errors, disconnects, and proxy buffering; and
- redacted logs and traces with no free text, evidence content, grounding document, or secrets.

Run after implementation:

```sh
pnpm db:generate
pnpm --filter @repo/agents typecheck
pnpm --filter @repo/agents build
pnpm --filter @repo/api typecheck
pnpm --filter @repo/api build
pnpm check
```

Exercise migrations, PostgreSQL memory, cancellation, and JSONL streaming locally. Live model smoke
tests must be bounded and use approved credentials; no test may invoke Blibli through the chat
agent.

## Public release gate

Do not enable valuation chat publicly until authentication and owner scope protect both valuation
and session routes, production CORS is narrow, abuse and concurrency controls are active, retention
cleanup is verified, observability is redacted, and deployed streaming behavior is tested. The
feature must demonstrate that no chat turn can invoke marketplace retrieval or modify deterministic
valuation data.
