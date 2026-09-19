# Platform API route integration plan

Status: planned. This plan covers only `POST /api/agents/image-identification` and the four
implemented `/api/valuations*` routes. The platform defaults to a labelled client-only mock; its
development-only gateway already calls image identification, while the persistent valuation routes
are not integrated yet.

Use the [implemented API route contract](../contract/api-routes.md) for exact request, response,
error, and client-call details. The [valuation integration plan](valuation-integration.md) continues
to govern the existing valuation UI while this focused route set is introduced.

## Goal

Connect the five scoped routes through a small platform-owned data layer while preserving the
server as the trust and calculation boundary. Route components may start requests and render
states; they must not duplicate transport parsing, error mapping, polling, or valuation math.

The valuation path is deliberately asynchronous. `POST /api/valuations` only creates or reuses the
durable row and enqueues work, returning `202 Accepted`; it must never await the expensive runner.
The client then polls the returned ID. A plain synchronous request cannot drive truthful live
progress after its response, and no streaming contract is currently implemented.

## Pre-integration corrections

Complete these before moving screens to `#/utils/api`:

1. Replace the hard-coded `http://localhost:8000` client origin with a browser same-origin base.
   Development requests must continue through the Vite `/api` proxy; do not expose provider
   credentials or add a public `VITE_*` server URL.
2. Add Hono validator middleware for the scoped JSON, multipart, parameter, and header inputs.
   Current handlers validate at runtime but do not encode most request inputs in `AppType`, so the
   RPC client cannot yet provide complete request inference.
3. Keep browser-bound runtime response checks. `AppType` cannot prove that a deployed server,
   proxy, or malformed error returned the expected shape.
4. Add one platform error mapper for non-2xx JSON envelopes, malformed responses, network failure,
   cancellation, and unexpected content types. Check status and content type before decoding JSON.

Exit: typechecking proves the documented `json`, `form`, `param`, and `header` calls, and local
requests use the Vite proxy without CORS or origin drift.

## Phase 1 — Shared client boundary

Create focused modules under `src/utils/api/` or a similarly small domain boundary:

- `client.ts`: the single `hc<AppType>` instance and typed path builders;
- `errors.ts`: safe API error parsing and user-facing Bahasa Indonesia mapping;
- `valuations.ts`: create, list, poll/read, and evidence operations;
- `image-identification.ts`: the development-only image-identification operation.

Do not import API server schemas or Prisma types into components. Infer transport responses where
useful, validate them at runtime, and map them into platform domain types. Pass `AbortSignal`
through request options and cancel work when a route unmounts or a newer request replaces it.

Exit: transport behavior is unit-testable without rendering a route, and no component repeats
error or JSON parsing.

## Phase 2 — Persistent valuation workflow

1. Load `GET /api/valuations` in a TanStack Router loader and render retained summaries. Treat the
   collection as an unscoped local-demo resource, not private user history. It does not read
   BullMQ progress, so use only the detail route for live progress labels.
2. Submit `POST /api/valuations` with the confirmed product name, condition, and optional
   description. Generate one 16–128 printable-ASCII idempotency key per user submission and retain
   it for retries. Treat `202` as job acknowledgement, not a result response, and inspect the
   returned state because an idempotent replay may already be terminal. If it is completed, read
   detail once; otherwise begin polling.
3. Navigate using only the returned opaque valuation ID. Persist enough route/session state to
   resume polling after refresh. Do not put product text, prices,
   evidence, or presigned data in the URL.
4. Poll `GET /api/valuations/:valuationId` no sooner than `pollAfterMs`. Schedule the next request
   only after the previous request settles, cancel it on route exit, stop only on
   `state === "COMPLETED"`, `404`, or expiry, and back off after transient network or `5xx`
   failures. Treat `stage` as display-only. Aborting a fetch stops only that request and future
   polling; this scoped API has no operation that cancels the already-enqueued worker job.
5. While queued or running, require `result === null` and render `valuation.stage` through this
   keyed mapping:

   ```ts
   const progressLabel = {
   	QUEUED: "Menunggu antrean",
   	VALIDATING_IDENTITY: "Mengidentifikasi produk",
   	FINDING_COMPARABLES: "Mencari produk pembanding",
   	CALCULATING_PRICE: "Menghitung estimasi harga",
   	PREPARING_EXPLANATION: "Menyiapkan penjelasan",
   	COMPLETED: "Selesai",
   } as const;
   ```

   Replace the live mode's numeric `analysisStep` timer with the server stage. Keep the existing
   timed `progressLabels` array only in the visibly labelled mock path.
6. On `state === "COMPLETED"`, stop polling and require a terminal `result`. Branch explicitly on
   `VALUATED`, `UNSUPPORTED_CATEGORY`, `MORE_INFORMATION_REQUIRED`, `INSUFFICIENT_EVIDENCE`, and
   `SERVICE_FAILURE`; completion itself does not imply a successful valuation.
7. Fetch `GET /api/valuations/:valuationId/evidence` only after a `VALUATED` result. A
   `409 RESULT_NOT_AVAILABLE` response is not an empty evidence result.
8. Render stages and terminal outcomes from server fields. Never calculate price, range,
   confidence, or fallback evidence in the browser.

The current worker stage timing is coarse. `VALIDATING_IDENTITY` and `FINDING_COMPARABLES` are
published back-to-back before the expensive runner. The runner persists the terminal result before
`CALCULATING_PRICE` and `PREPARING_EXPLANATION` are published, so detail polling normally exposes
neither. Redis progress failure can also produce `state: "RUNNING"` with `stage: "COMPLETED"`.
Always trust `state` for termination, show the latest stage, allow jumps, and never delay the UI to
display every label. Exact phase visibility requires emitting progress at real runner boundaries
and correcting the running-stage fallback before promising a faithful four-step live UI.

Preserve the required disclosures: the recommendation covers item price only; Blibli values are
advertised asking prices; the result does not verify authenticity, ownership, transaction safety,
or hidden physical condition.

Exit: create → poll → result → evidence survives refresh, keyed retries reuse the valuation, and
every documented non-success response has an intentional screen state.

## Runtime ownership

- PostgreSQL owns durable `QUEUED`/`PROCESSING`/terminal status, inputs, results, and evidence.
- BullMQ on Redis owns queue delivery and temporary stage progress; Redis also holds temporary
  usage controls and evidence cache outside the platform contract.
- The API process validates, persists, enqueues, and serves reads. It does not execute valuation
  work in the POST request.
- The separate worker executes jobs. Run `pnpm worker:dev` for split local services; `pnpm dev`
  already includes it.

Do not introduce an in-process fire-and-forget promise, simulated live progress timers, or a long
blocking POST. Those approaches lose work on process restart, cannot coordinate multiple API
instances reliably, and make progress labels untrustworthy.

## Phase 3 — Development-only image identification

Move the existing `POST /api/agents/image-identification` gateway call to the shared client boundary
without changing its development-only `VITE_VALUATION_MODE=local-api` gate. Send exactly one
`image` multipart form part, let the client set its multipart boundary, and keep server validation
authoritative. Preserve the explicit `SUPPORTED`, `UNSUPPORTED_CATEGORY`, and
`MORE_INFORMATION_REQUIRED` UI states; provider failure must not produce mock output.

Exit: the default experience remains visibly mock, local image identification fails closed in
production, and invalid files receive intentional feedback for each documented status.

## TanStack Router conventions

- Use loaders for initial GET data and route-level not-found handling.
- Use component event handlers or mutations for POST operations and disable duplicate submissions
  while a request is active.
- After mutation success, invalidate or redirect instead of mutating loader snapshots in place.
- Keep route search parameters serializable and non-sensitive; opaque IDs belong in path params.
- Put toasts at user-triggered mutation boundaries. Inline states own field validation, loading,
  polling, missing information, and recoverable errors.

## Verification and release gates

- Run `pnpm --filter @repo/platform typecheck` and `pnpm --filter @repo/api typecheck`.
- Run `pnpm --filter @repo/platform build` after client-base, route, or Vite changes.
- Run `pnpm check` for repository formatting and linting.
- Test all documented success and non-success statuses, malformed JSON, HTML proxy errors, offline
  mode, aborts, duplicate submissions, refresh recovery, non-overlapping polls, skipped stages,
  terminal-result branching, and polling cleanup.
- Run PostgreSQL, Redis, API, and worker for persistent valuation tests; an API without the worker
  must visibly remain queued or fail safely.
- Before public release, block on authentication, owner-scoped valuation reads, narrow production
  CORS, public image upload/storage, and reviewed rate and spending controls.

Do not declare this integration complete merely because each scoped route was called once.
Completion means the UI represents each route's lifecycle, failure modes, security boundary, and
current local limitations truthfully.
