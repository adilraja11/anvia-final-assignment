# Valuation chat API contract

Status: implemented locally; public release blocked.

## Purpose

Provide a streamed, Bahasa Indonesia follow-up chat for a completed valuation shown at
`/result/:valuationId`. The chat explains the immutable server-calculated result and accepted
Blibli evidence. It does not create, update, retry, or recalculate a valuation.

This contract extends the persisted valuation workflow in
[valuation-workflow-api.md](valuation-workflow-api.md). It uses the browser-safe Anvia Client
Protocol described in [ANVIA_APPS.md](../../../../ANVIA_APPS.md) and preserves the agent boundaries
in [ANVIA_AGENTS.md](../../../../ANVIA_AGENTS.md).

## Product boundary

The valuation chat is a narrow result explainer, not a second valuation agent or a general-purpose
assistant.

- Application code remains the authority for product identity, accepted evidence, suggested
  listing price, observed market range, evidence count, and confidence.
- The chat model may quote and explain persisted numeric values exactly as supplied by application
  code. It must not calculate, adjust, negotiate, or replace them.
- The chat agent has no tools, MCP servers, provider-retrieval capability, or side effects.
- A chat turn must never call Blibli, Apify, image identification, the valuation agent, or the
  valuation worker.
- A question cannot change the stored valuation or start a new paid run. A deliberate revaluation
  continues to use the normal valuation-creation flow and its own idempotency key.
- The assistant answers only from the stored valuation snapshot, accepted evidence, required
  limitations, and prior messages in the same bound session. When the snapshot does not establish
  an answer, it says so instead of relying on general model knowledge.
- User messages, prior assistant messages, product descriptions, and marketplace listing text are
  untrusted data. None can change instructions, tools, permissions, limits, or price logic.

## Route map

All routes are nested under the valuation so the resource relationship is explicit.

| Method and path | Purpose |
| --- | --- |
| `POST /api/valuations/:valuationId/chat/sessions` | Create or recover the valuation's chat session |
| `GET /api/valuations/:valuationId/chat/sessions/:sessionId` | Load browser-safe session history |
| `POST /api/valuations/:valuationId/chat/sessions/:sessionId/messages` | Stream one assistant response |
| `DELETE /api/valuations/:valuationId/chat/sessions/:sessionId` | Clear the bound chat session |

The existing general `/api/chat*` routes are not the valuation-chat contract. Do not add an alias
that accepts a client-provided valuation result or arbitrary grounding context.

## Shared route rules

- `valuationId` and `sessionId` are untrusted opaque identifiers. Resolve and authorize both on
  every request.
- The session must be bound to exactly one valuation through a first-class server-side relation.
  Request metadata and `AgentMemorySession.metadata` alone are not authorization or relational
  integrity.
- The server must verify that the session belongs to the route's valuation and current actor before
  loading history, streaming, or deletion.
- In the current anonymous local demo, possession of a valuation ID remains only a temporary read
  capability. This is not sufficient for public deployment; authenticated owner scope is a release
  blocker.
- Chat is available only when the valuation terminal status is `VALUATED`. Queued, processing,
  expired, missing, and non-valued outcomes must cause zero model and tool calls.
- Requests and JSON errors use UTF-8. Non-stream responses send `Cache-Control: no-store`.
- The streaming endpoint uses JSONL at both ends and returns only projected Client Protocol events.
  Raw runtime events, reasoning, provider payloads, prompts, valuation context, memory records,
  traces, and private errors never reach the browser.
- Enforce an allowed origin, request-byte limit, per-actor and per-session rate limits, one active
  turn per session, model timeout, and cancellation propagation before public use.

## Session persistence

There is at most one active chat session for a valuation and actor. Creating a session is
idempotent for that pair: the API returns the existing session when one remains available and
creates a new one otherwise.

Implement the binding with an explicit nullable `valuationId` relation on the memory session or a
dedicated valuation-chat session model. The database must enforce uniqueness and cascading cleanup;
do not search JSON metadata to establish the relationship. The chosen model must support future
owner or tenant scope without treating a session ID as authorization.

Chat memory stores only reviewed user and assistant messages. It does not duplicate the valuation
snapshot, evidence rows, raw provider output, system prompt, or generated grounding document. The
server reconstructs current grounding from PostgreSQL for every turn. A chat session expires no
later than its valuation and is deleted when the valuation is deleted.

The dedicated agent must attach Prisma memory using the Anvia agent option shape
`memory: { store }`. Passing a bare memory store through the existing `createValuationAgent`
compatibility option does not enable memory and is not part of this contract.

## `POST /api/valuations/:valuationId/chat/sessions`

The request has no user-controlled prompt or valuation fields. An empty JSON object is accepted:

```json
{}
```

The server verifies a completed `VALUATED` result before creating or returning a session. A new
session returns `201`; an existing session returns `200`:

```json
{
	"session": {
		"id": "chat_session_example",
		"valuationId": "valuation_example",
		"createdAt": "2026-09-19T04:00:00.000Z",
		"expiresAt": "2026-09-20T04:00:00.000Z"
	}
}
```

Creating or recovering a session performs no model, tool, marketplace, or worker call.

## `GET /api/valuations/:valuationId/chat/sessions/:sessionId`

Returns the session envelope plus browser-safe Client Protocol messages in stored order:

```json
{
	"session": {
		"id": "chat_session_example",
		"valuationId": "valuation_example",
		"createdAt": "2026-09-19T04:00:00.000Z",
		"expiresAt": "2026-09-20T04:00:00.000Z"
	},
	"messages": []
}
```

The API must intentionally project persisted runtime messages to the public client-message shape.
It must not serialize Prisma memory rows or provider-model messages directly. Reading history
performs no model or tool call.

## `POST /api/valuations/:valuationId/chat/sessions/:sessionId/messages`

The request body follows `ClientStreamRequest`. Only `type: "messages"` is enabled. Interaction
responses, resumable-stream cursors, attachments, tool parts, and non-text user content are outside
the MVP contract.

The server validates the entire request but accepts only the newest user message as new input.
Browser-supplied earlier messages and assistant messages are not authoritative history; prior
conversation comes from the bound server memory. The newest message must contain one non-empty text
part. Initial limits are:

- maximum request body: 16 KiB;
- maximum user text: 2,000 characters;
- maximum 30 accepted user turns per session; and
- one in-flight streamed response per session.

The response is a JSONL Client Protocol stream with the matching Anvia protocol header. Disconnect
and explicit cancellation abort the current model run but do not delete history or modify the
valuation.

Before starting the model, the server loads and validates a grounding snapshot containing only:

- confirmed product name and condition;
- optional user-provided product description, labelled `USER_PROVIDED`;
- persisted suggested listing price and observed market range;
- persisted confidence, confidence reason, accepted-comparable count, evidence coverage, and
  retrieval timestamp;
- persisted explanation, pros, cons, and required limitations; and
- the safe accepted-evidence projection: listing ID, title, item price, and validated Blibli URL.

The grounding document labels deterministic values as application-calculated and listing fields as
`MARKET_EVIDENCE`. The model can explain why the median-based suggestion differs from the P25-P75
market range, but it cannot recompute either. Evidence URLs may be repeated only when they came from
the validated snapshot; the model cannot invent or transform URLs.

## Dedicated explainer agent

Create a separate stable agent, for example `asli-segini-valuation-chat`. Do not reuse
`createValuationAgent`, its structured output prompt, or its `blibliSearch` tool.

The explainer agent must:

- answer in concise Bahasa Indonesia;
- use conversational text rather than valuation-result JSON;
- distinguish `USER_PROVIDED`, `MARKET_EVIDENCE`, application-calculated values, and unknowns;
- preserve that Blibli values are advertised asking prices, not official prices, historical
  original prices, or completed transactions;
- preserve the item-price-only, authenticity, ownership, transaction-safety, and hidden-condition
  limitations;
- decline requests to change the price, fabricate evidence, verify authenticity or ownership,
  contact sellers, negotiate, or perform a new search; and
- direct users to start a new valuation when materially changed identity or condition requires a
  new result.

Use bounded turns and tokens. The agent has no tools and no interaction/continuation flow.

## `DELETE /api/valuations/:valuationId/chat/sessions/:sessionId`

Clears the bound session and its messages, then returns `204`. It does not delete or change the
valuation or evidence. Deletion must verify the valuation/session/actor binding first.

## Errors

Non-stream failures use the valuation API's safe envelope:

```json
{
	"error": {
		"code": "CHAT_RESULT_NOT_AVAILABLE",
		"message": "Percakapan tersedia setelah valuasi berhasil."
	}
}
```

| HTTP | Code | Meaning |
| ---: | --- | --- |
| `400` | `INVALID_CHAT_REQUEST` | Invalid JSON, protocol request, IDs, or unsupported content |
| `404` | `RESOURCE_NOT_FOUND` | Valuation or session is missing, expired, inaccessible, or mismatched |
| `409` | `CHAT_RESULT_NOT_AVAILABLE` | Valuation exists but is not a completed `VALUATED` result |
| `409` | `CHAT_TURN_IN_PROGRESS` | The session already has an active response |
| `413` | `REQUEST_TOO_LARGE` | Request exceeds the byte limit |
| `429` | `CHAT_RATE_LIMITED` | Actor or session chat allowance is exhausted |
| `500` | `INTERNAL_SERVICE_FAILURE` | Safe internal failure |
| `503` | `CHAT_SERVICE_UNAVAILABLE` | Model or streaming service is unavailable |

Once streaming starts, failures are projected to safe Client Protocol error events. Never expose
database, model, prompt, memory, provider, or tracing details.

## Retention, privacy, and observability

- Retain chat messages no longer than the parent valuation's 24-hour retention window.
- Do not put user message text, product descriptions, evidence titles, listing URLs, or generated
  answers in application logs, analytics, trace metadata, or error responses.
- Operational events may record valuation ID, session ID, outcome category, token usage, duration,
  cancellation, and safe error category. Production identifiers should be access-controlled and
  minimized according to the final analytics policy.
- Do not include the raw grounding document or full prompt in production tracing.
- Rate-limit chat independently from paid valuation creation. Chat limits do not authorize or
  consume another marketplace run.

## Public release blockers

The feature remains local-demo-only until valuation and chat routes authenticate callers, enforce
owner or tenant scope, use narrow production CORS, implement abuse limits, validate deployed proxy
streaming behavior, redact observability, and prove cascade cleanup. Opaque valuation and session
IDs are not a substitute for authorization.
