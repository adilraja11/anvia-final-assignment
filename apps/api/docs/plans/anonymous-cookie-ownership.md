# Anonymous cookie ownership implementation plan

Status: proposed; not implemented.

## Goal and references

Make the existing persistent valuation and valuation-chat routes private to one anonymous browser
without adding sign-up, cross-device recovery, or client-readable identity. The governing behavior
is in the [anonymous cookie ownership contract](../contracts/anonymous-cookie-ownership.md). Preserve
the valuation rules in the [workflow API contract](../contracts/valuation-workflow-api.md),
[data-model contract](../contracts/valuation-data-model.md), and
[chat API contract](../contracts/valuation-chat-api.md).

## Current state

- `Valuation` has no owner field and `idempotencyKey` is globally unique.
- `GET /api/valuations` lists every retained row.
- Detail, evidence, and valuation-chat services resolve resources by opaque IDs without an owner.
- The app has exact-origin checks on some mutations, but CORS does not enable credentials and the
  checks are not consistently applied to all chat mutations.
- Chat rate limiting primarily derives an actor from forwarding/IP headers.
- The platform can therefore use these routes only as a controlled local demo, not private public
  history.

## Target module shape

Keep raw cookie handling separate from valuation business logic:

```text
src/
├── index.ts                                  # narrow credentialed CORS
├── middleware/
│   └── anonymous-owner.ts                   # cookie parse/issue/hash and owner context
└── modules/
    ├── valuations/
    │   ├── router.ts                        # read/mutation handshake and origin checks
    │   └── valuation-service.ts             # owner-scoped create/list/read/evidence
    └── valuation-chat/
        ├── router.ts                        # owner context, origin, rate scope
        └── service.ts                       # owner-scoped valuation/session operations
```

The exact file split may follow existing conventions, but only middleware may see the raw cookie.
Services accept the derived `ownerKey` explicitly so omission is visible in types and tests.

## Delivery sequence

### 1. Cookie primitive and tests

1. Add a typed Hono context variable for anonymous ownership.
2. Generate 32 random bytes with Node cryptography and encode unpadded base64url.
3. Strictly parse the cookie and derive the versioned SHA-256 owner key.
4. Set `HttpOnly`, `SameSite=Lax`, `Path=/`, host-only scope, configured max age, and
   environment-aware `Secure`.
5. Add helpers for safe-read bootstrap, mutation precondition failure, and redacted diagnostics.
6. Unit-test valid, absent, malformed, replaced, local, and production cookie behavior.

Exit: routes can consume a derived owner context without reading or persisting the raw credential.

### 2. Prisma migration and legacy isolation

1. Read the current database retention state before migration.
2. Add nullable `Valuation.ownerKey`, its owner/created-time index, and a temporary compatible
   migration.
3. Change reads immediately to exclude ownerless rows. Never attach a legacy row to a new cookie.
4. Replace global `idempotencyKey` uniqueness with `@@unique([ownerKey, idempotencyKey])` after all
   write paths supply owner scope.
5. After the 24-hour legacy retention window, remove remaining ownerless demo rows through an
   explicit reviewed deployment step, make `ownerKey` required, and regenerate Prisma.
6. Keep `ValuationEvidence` and `AgentMemorySession` ownership relational through `Valuation`; do
   not add raw-cookie columns.

Exit: every newly created valuation has one required owner and ownerless legacy rows are
inaccessible throughout rollout.

### 3. Owner-scope valuation services

1. Change `createOrReuseValuation` to require `ownerKey` and perform replay/conflict checks through
   the compound owner/idempotency key.
2. Persist owner scope in the same create operation as confirmed valuation input.
3. Require `ownerKey` in `readValuations`, `readValuation`, and `readEvidence` and include it in the
   first database predicate.
4. Resolve ownership before calling `queueStage`; unauthorized IDs must not produce Redis work or
   timing differences that reveal existence.
5. Keep worker and runner operations internal by valuation ID. They must not accept browser
   cookies and must not put owner scope in BullMQ payloads.
6. Update usage reservation to combine owner-derived, trusted-network, and global controls without
   logging owner values.

Exit: no valuation service reachable from an HTTP route can perform an unscoped browser read or
creation.

### 4. Route handshake, origin, and CORS

1. Mount anonymous-owner middleware over `/api/valuations` and all nested chat routes.
2. For missing/invalid cookies, implement empty-list/404 safe reads and side-effect-free
   `428 ANONYMOUS_SESSION_REQUIRED` mutations.
3. Preserve safe JSON envelopes and `Cache-Control: no-store`; never serialize owner context.
4. Apply exact allowed-origin validation to valuation creation and every chat `POST`/`DELETE`,
   including streaming.
5. Configure Hono CORS with the exact platform origin, `credentials: true`, required methods and
   headers, exposed Anvia protocol header, and `Vary: Origin`.
6. Verify local Vite-proxy, localhost cross-origin, same-site production, and rejected-origin
   behavior.

Exit: the browser can establish ownership, while missing credentials and cross-site mutations
cause no paid, model, or deletion work.

### 5. Scope valuation chat

1. Pass `ownerKey` into create/recover, history, grounding, turn acquisition, streaming, and delete
   service calls.
2. Resolve a `VALUATED` valuation by `{ id, ownerKey }` before looking up its session.
3. Resolve session IDs through the already authorized valuation relation for every operation.
4. Replace IP-only chat actor scope with owner plus valuation/session scope while retaining trusted
   network and global safeguards.
5. Ensure another owner gets `404` before memory reads, model construction, rate consumption,
   streaming, or deletion.
6. Preserve the one-session-per-valuation relation and existing chat expiry/cascade behavior.

Exit: possession of valuation and session IDs without the cookie grants no chat capability.

### 6. Observability and cleanup

1. Redact incoming `Cookie` and outgoing `Set-Cookie` headers before request logging or tracing.
2. Audit error reporting, queue logs, Prisma diagnostics, analytics, and tests for raw cookies and
   owner keys.
3. Confirm 24-hour cleanup remains owner-independent and cascades to evidence and chat sessions.
4. Document cookie name, lifetime, `Secure` mode, trusted proxy behavior, and allowed platform
   origin in deployment configuration without documenting secret values.

Exit: ownership is enforceable without turning its credential into telemetry or long-lived
tracking data.

## Test matrix

Cover at minimum:

- no-cookie list bootstrap, direct-detail 404, and first-mutation 428/retry;
- cookie attributes in local and production modes;
- malformed-cookie replacement and no reuse of ownerless legacy rows;
- owner A/B isolation for list, detail, evidence, chat creation/history/stream/delete;
- same idempotency key across owners, same-owner replay, same-owner payload conflict, and races;
- no queue lookup/provider/model/memory/deletion call for unauthorized or precondition requests;
- retained valuation expiry while the cookie remains present;
- exact-origin credentialed preflight and mutation requests, plus denied origins;
- chat JSONL transport with credentials and safe failure before streaming starts; and
- log/trace snapshots containing neither cookie values nor owner keys.

## Verification commands

Run after implementation:

```sh
pnpm db:generate
pnpm --filter @repo/api typecheck
pnpm --filter @repo/api build
pnpm --filter @repo/platform typecheck
pnpm --filter @repo/platform build
pnpm check
```

Exercise PostgreSQL and Redis locally with two isolated browser contexts. Confirm each sees only its
own retained valuations and chat, then clear one browser's cookie and confirm its previous IDs
become inaccessible without affecting the other browser.

## Rollout and rollback

1. Deploy the nullable schema before code that writes `ownerKey`.
2. Deploy API owner scoping and credentialed CORS with the platform credential transport in the
   same release window. Keep public exposure disabled during mixed-version deployment.
3. Wait out the 24-hour legacy window, remove remaining ownerless demo data through a reviewed
   operation, then enforce the non-null column and final composite uniqueness.
4. Monitor safe counts of 428, 404, create success, and cookie-blocked UI errors without recording
   credentials or owner keys.

Rollback may restore the prior binary while the nullable column exists, but it must not reopen an
unscoped public collection. If ownership enforcement cannot be preserved, disable the public
valuation routes until the corrected release is deployed.

## Release gate

- Every browser-reachable valuation and valuation-chat query is owner-scoped.
- A missing cookie cannot start paid work, invoke a model, or delete state.
- Idempotency is scoped per owner and remains race-safe.
- Platform/API credential transport passes in the deployed origin topology.
- Legacy ownerless rows are inaccessible and the final schema has no ownerless valuation.
- Cookies and owner keys are absent from public responses and observability data.
- The anonymous, same-browser-only limitation is stated accurately; no account or cross-device
  recovery claim is introduced.
