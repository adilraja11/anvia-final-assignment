# Anonymous cookie ownership contract

Status: proposed public-hardening contract; not implemented.

This contract adds per-browser ownership to the persistent valuation and valuation-chat routes. It
extends the [valuation workflow API contract](valuation-workflow-api.md), the
[valuation data model](valuation-data-model.md), and the
[valuation chat API contract](valuation-chat-api.md). The delivery sequence is in the
[anonymous cookie implementation plan](../plans/anonymous-cookie-ownership.md).

Until this contract is implemented, `GET /api/valuations` remains a shared collection and opaque
valuation IDs remain unscoped read capabilities. Do not present the current routes as private user
history.

## Product boundary

The cookie identifies one anonymous browser profile. It is not a user account, authentication, or
proof of a person or device.

- Clearing cookies, using private browsing, or changing browsers creates a new anonymous owner.
- History does not transfer across browsers or devices and cannot be recovered by email or another
  identity.
- A stolen cookie can read that browser profile's retained valuations until the valuation expires
  or the cookie is replaced.
- Valuations and evidence still expire after 24 hours. Cookie lifetime does not extend data
  retention.
- Cookie ownership is one abuse-control signal, not the only rate-limit defense. Network-level and
  global spending controls remain required because users can clear cookies.

No cookie value, owner key, or account-like identifier is returned in JSON or made available to
browser JavaScript.

## Cookie contract

The API, not the browser, creates the anonymous credential with a cryptographically secure random
generator.

| Property | Contract |
| --- | --- |
| Cookie name | `asli_segini_anon` |
| Value | 32 random bytes encoded as unpadded base64url |
| JavaScript access | `HttpOnly` |
| Transport | `Secure` in non-local environments |
| Cross-site policy | `SameSite=Lax` |
| Scope | `Path=/`; omit `Domain` |
| Default lifetime | 30 days, configurable server-side |

Production platform and API deployments must be same-site, such as `aslisegini.app` and
`api.aslisegini.app`. Deploying them on unrelated sites would require `SameSite=None; Secure` and
would depend on third-party-cookie behavior; that topology is outside this contract.

The server validates the cookie's exact base64url shape and decoded length. A missing or malformed
cookie is treated as a new anonymous browser, never as a client error containing validation detail.
The server replaces malformed values. It must not accept an ownership credential from a request
body, URL, local storage, or a custom user-ID header.

The cookie is not refreshed on every request. Its expiry is measured from issuance so passive use
does not create indefinite browser tracking. A future explicit reset operation may expire the
cookie, but account recovery and merging are out of scope.

## Owner derivation and storage

The raw cookie is a bearer credential and must never be stored in PostgreSQL, Redis, logs, traces,
analytics, queue payloads, or error reports. Derive a fixed owner key as:

```text
ownerKey = lowercaseHex(SHA-256("asli-segini-owner-v1\0" + rawCookieValue))
```

Because the cookie contains 256 random bits, the one-way hash is sufficient for database lookup;
the fixed version prefix provides domain separation and a future migration point. The resulting
64-character value is server-internal and is never accepted directly from a client.

Add the required owner key to `Valuation` and scope idempotency to the owner:

```prisma
model Valuation {
	id             String @id @default(cuid())
	ownerKey       String @db.Char(64)
	idempotencyKey String @db.VarChar(128)

	// Existing valuation fields and relations remain unchanged.

	@@unique([ownerKey, idempotencyKey])
	@@index([ownerKey, createdAt])
}
```

Remove the global uniqueness constraint on `idempotencyKey`. Two anonymous owners may use the
same idempotency key without sharing or conflicting with each other's valuation. The worker job ID
continues to be the globally unique valuation ID, and queue payloads continue to contain only the
valuation ID and contract version.

Chat sessions inherit ownership through their required valuation relation. Do not overload
`AgentMemorySession.userId`, duplicate the raw cookie, or rely on session metadata for ownership.
Every chat query must join or first resolve a valuation with both `id` and `ownerKey`.

## Request lifecycle

Valuation and nested chat middleware derives an internal owner context before invoking a route.
The route and service layers receive `ownerKey`; they never receive the raw cookie.

### Safe reads

For a request without a valid cookie, the API issues a new cookie and:

- `GET /api/valuations` returns `200 { "valuations": [] }`;
- valuation detail, evidence, and chat-session reads return `404 RESOURCE_NOT_FOUND`.

This behavior creates no valuation and reveals nothing about another owner. A direct result link
opened in another browser is therefore inaccessible.

### Mutations and streams

For `POST` or `DELETE` without a valid cookie, the API issues a new cookie, performs no database,
queue, provider, model, memory, or deletion side effect, and returns:

```json
{
	"error": {
		"code": "ANONYMOUS_SESSION_REQUIRED",
		"message": "Sesi browser perlu disiapkan. Silakan coba lagi."
	}
}
```

The status is `428 Precondition Required`. The browser may retry once with the same idempotency key
after accepting the cookie. A second `428` indicates that cookies are unavailable; it must not
loop or create a paid valuation. This handshake also prevents an orphaned paid job when a browser
blocks cookies.

## Route authorization

All ownership decisions are enforced in `apps/api`; client-side filtering is never authorization.

| Route | Required ownership behavior |
| --- | --- |
| `GET /api/valuations` | Filter `where: { ownerKey }`, then apply retention and newest-first ordering |
| `POST /api/valuations` | Save `ownerKey`; find/replay idempotency by `(ownerKey, idempotencyKey)` |
| `GET /api/valuations/:valuationId` | Resolve by `{ id: valuationId, ownerKey }` before reading queue progress |
| `GET /api/valuations/:valuationId/evidence` | Resolve valuation and evidence through `{ id, ownerKey }` |
| Valuation chat routes | Resolve valuation ownership before session lookup, model work, streaming, or deletion |

An unknown, expired, malformed, or differently owned resource always returns the same
`404 RESOURCE_NOT_FOUND`. Do not use `403`, disclose whether an ID exists, query BullMQ for an
unauthorized ID, or distinguish a session/valuation mismatch from another ownership failure.

Ownership does not change calculation, evidence, retention, response schemas, or the rule that AI
cannot calculate the final price.

## Origin, CORS, and CSRF

Cookies require the following transport controls:

- Allow only the exact configured `PLATFORM_URL` origin; never combine credentialed CORS with `*`.
- Set `Access-Control-Allow-Credentials: true` and `Vary: Origin` on cross-origin responses.
- Allow only required methods and headers, including `Content-Type` and `Idempotency-Key`.
- Require the exact allowed `Origin` on every state-changing or model-invoking valuation/chat
  request, including chat deletion and message streaming.
- Keep `SameSite=Lax`, `HttpOnly`, host-only scope, and production `Secure` as defense in depth.
- Continue returning `Cache-Control: no-store` for valuation and chat responses.

The preferred production topology is same-origin `/api` routing. Local development may use the
Vite proxy or credentialed requests between the configured localhost origins.

## Privacy and operational rules

- Redact `Cookie` and `Set-Cookie` headers at the first logging and tracing boundary.
- Never record the raw cookie or owner key in analytics. If operational correlation is necessary,
  derive a separate short-lived keyed label and document its retention first.
- Rate-limit paid valuation creation using owner key plus network/global controls. Rate-limit chat
  using owner key plus valuation/session scope; do not use a user-supplied forwarding header
  without trusted-proxy validation.
- Do not expose ownership in queue job data. A claimed worker operates by valuation ID after the API
  has already established ownership at creation.
- Cleanup remains based on valuation age and cascades to evidence and chat memory regardless of
  cookie lifetime.

## Migration behavior

Existing valuation rows have no trustworthy anonymous owner. They must never be assigned to the
first browser that requests them or exposed through the new owner-scoped routes.

Use a staged migration: add nullable `ownerKey`, deploy owner-scoped reads that exclude `NULL`, wait
for the 24-hour retention window (or explicitly remove expired/demo rows with an approved
deployment operation), then make `ownerKey` required and replace global idempotency uniqueness with
the composite constraint. Do not backfill legacy rows with a shared owner.

## Verification requirements

Tests must prove:

- first safe read issues an HttpOnly cookie and reveals no existing rows;
- first mutation returns `428` with zero side effects, then succeeds once on retry;
- blocked cookies stop after one retry and create no row or paid work;
- each owner lists, reads, polls, and chats only with its own valuations;
- another owner receives indistinguishable `404` responses for detail, evidence, and chat;
- equal idempotency keys are independent across owners and conflicting payloads conflict only
  within one owner;
- unauthorized IDs never trigger BullMQ, provider, model, memory, or deletion work;
- cookie, owner key, and credential headers are absent from responses, logs, traces, and analytics;
- exact-origin credentialed CORS succeeds and disallowed origins fail; and
- expiry cleanup removes valuation, evidence, and chat while the longer-lived cookie remains safe.
