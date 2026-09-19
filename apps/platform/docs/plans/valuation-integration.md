# Platform valuation integration plan

Status: the persistent API, PostgreSQL models, BullMQ producer, worker, polling detail, and evidence
read are implemented in `@repo/api`. Platform migration to that workflow is not implemented.

## Goal and references

Replace the platform's legacy synchronous local valuation call with create → poll → result while
preserving labelled mock mode and the seller-first product contract. Use the
[valuation integration contract](../contract/valuation-integration.md) for platform behavior and the
focused [API route contract](../contract/api-routes.md) for request/response shapes and `api.ts`
selectors.

This plan does not make the current endpoints publicly safe. Authentication, owner scoping,
production CORS, and secure public image transport remain release blockers.

## Current state

| Capability | API | Platform |
| --- | --- | --- |
| Image identification | Implemented as local multipart route | Local adapter implemented; public transport blocked |
| Valuation creation | PostgreSQL row + BullMQ enqueue; returns `202` | Not integrated |
| Worker | Separate `pnpm worker:dev` process | No client dependency beyond polling |
| Detail/progress polling | Implemented with `state`, `stage`, and `pollAfterMs` | Not integrated |
| Terminal results | Persisted in PostgreSQL | Legacy synchronous result path remains |
| Accepted evidence read | Implemented for `VALUATED` | Not integrated |
| Refresh recovery | Retained ID-based reads available | Not implemented |
| Public access controls | No authentication or ownership enforcement | Must remain local-demo only |

The existing `progressLabels` timer is acceptable only for clearly labelled mock mode. Live local
mode must derive its active label from the polled server stage.

## Phase 1 — Replace the gateway contract

Implementation status: not started.

1. Replace `requestValuation(): Promise<ValuationResult>` with separate create, detail-read, and
   evidence-read operations while keeping image identification separate.
2. Add platform schemas for creation, polling, terminal result, evidence, and safe error envelopes.
   Validate all decoded data before exposing it to components.
3. Call the implemented `/api/valuations*` selectors through `src/utils/api.ts`; remove the legacy
   synchronous live-valuation dependency.
4. Generate one stable 16–128 printable-ASCII idempotency key per deliberate submission. Reuse it
   for uncertain creation retries, but generate a new key for an intentional new valuation.
5. Serialize only confirmed name, condition, and optional description. Never include asking price,
   location, image bytes, provider settings, or unknown properties.
6. Keep the asynchronous gateway development-only until the public-readiness blockers are closed.

Exit: gateway tests cover strict decoding, `202`, every safe error code, abort behavior, and
idempotency conflict without invoking UI components.

## Phase 2 — Add the ID-based polling flow

Implementation status: not started.

1. On submit, call `POST /api/valuations` once and navigate to a result route containing only the
   returned opaque valuation ID.
2. Poll `GET /api/valuations/:valuationId` no sooner than `pollAfterMs`. Keep at most one read in
   flight, stop polling on route exit, and avoid creating a replacement job after read failures.
3. Continue through `QUEUED` and `RUNNING`; stop when state is `COMPLETED`. Treat `result: null`
   during active states as expected.
4. Resume the detail read from the route ID after refresh. Do not depend on component-local result
   state, and do not rerun valuation to recover a page.
5. Optionally use `GET /api/valuations` for a retained-history view, not for active stage polling.
6. Handle missing or expired IDs as unavailable results without silently creating a new paid run.

Exit: create → poll → completion survives navigation and refresh, and double submission with the
same key resolves to one valuation.

## Phase 3 — Connect server stages to progress UI

Implementation status: not started.

1. Replace live-mode timer advancement with this stage map:

   - `QUEUED` → `Menunggu antrean`
   - `VALIDATING_IDENTITY` → `Mengidentifikasi produk`
   - `FINDING_COMPARABLES` → `Mencari produk pembanding`
   - `CALCULATING_PRICE` → `Menghitung estimasi harga`
   - `PREPARING_EXPLANATION` → `Menyiapkan penjelasan`
   - `COMPLETED` → `Selesai`

2. Allow repeated and skipped stages. Do not animate through unobserved labels or derive a
   percentage that the server did not provide.
3. Keep the four timed labels only in visibly labelled mock mode. Never use simulated progress as a
   fallback when the API, Redis, worker, provider, or model fails.
4. Make queued, long-running, failed-poll, expired, and completed states keyboard-accessible and
   explain them in Bahasa Indonesia.

Exit: every live progress change is traceable to the latest validated detail response.

## Phase 4 — Render terminal outcomes and evidence

Implementation status: not started.

1. Once state is `COMPLETED`, branch on `result.status`: `VALUATED`, `UNSUPPORTED_CATEGORY`,
   `MORE_INFORMATION_REQUIRED`, `INSUFFICIENT_EVIDENCE`, or `SERVICE_FAILURE`.
2. Render numeric fields only for `VALUATED`; the browser must not calculate price, range,
   confidence, evidence count, or fallback values.
3. Fetch `GET /api/valuations/:valuationId/evidence` only for `VALUATED`. Display only returned safe
   listing fields and approved Blibli links.
4. Preserve input and focus the first correction for `MORE_INFORMATION_REQUIRED`. Keep provider
   failure distinct from insufficient evidence.
5. Retain all required item-only, advertised-asking-price, evidence-coverage, authenticity,
   ownership, transaction-safety, and hidden-condition disclosures.
6. Treat `429 RATE_LIMITED` as a creation failure; it is not a terminal result status.

Exit: every server outcome has a dedicated UI and no live failure path substitutes mock evidence.

## Phase 5 — Harden and verify

Implementation status: waiting for Phases 1–4.

Automate coverage for:

- successful `202` creation, idempotent replay, conflict, rate limit, and queue unavailability;
- queued/running polling, repeated or skipped stages, completion, refresh recovery, expiry, and
  transient read failure;
- all five terminal statuses and evidence unavailable before `VALUATED`;
- cancellation that stops browser work without claiming the durable job was cancelled;
- strict response validation, safe links, redacted logs, and no mock fallback; and
- absence of valuation formulas, in-process fire-and-forget work, synchronous live valuation, and
  live timer-simulated progress in platform code.

Run `pnpm worker:dev` alongside the API for local end-to-end checks. Then run:

```sh
pnpm --filter @repo/platform typecheck
pnpm --filter @repo/platform build
pnpm check
```

## Public release gate

Before enabling this workflow outside controlled local development:

1. Authenticate users and enforce ownership on list, detail, and evidence reads.
2. Replace permissive CORS with the reviewed production origin policy.
3. Replace local multipart image transport with private quarantine, server validation,
   metadata-stripping sanitization, scoped access, and bounded deletion.
4. Verify usage controls, retention cleanup, observability redaction, accessibility, and required
   safety/evaluation cases in the deployed topology.

PostgreSQL remains the durable job/result authority; BullMQ/Redis remains the queue and temporary
progress mechanism. Do not replace that split with synchronous HTTP work or an API-process promise.
