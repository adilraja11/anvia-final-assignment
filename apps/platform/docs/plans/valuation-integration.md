# Platform valuation integration plan

Status: Phases 1 and 2 implemented in `@repo/platform`. Phases 3 and 4 remain blocked on the
browser-ready server contract. The local agent API is still only a development-stage dependency.

## Goal

Replace the platform's mock-only valuation journey in controlled increments while preserving the
seller-first product contract: no asking/original price input, only server-calculated prices, and
no fabricated marketplace evidence. The platform-facing contract is
[valuation integration contract](../contract/valuation-integration.md).

## Current implementation and API gap

The platform now defaults to visibly labelled mock mode and can explicitly select a validated,
same-origin local API adapter during Vite development. The asking-price path has been removed,
local requests are cancellable, and live local results render only returned summary fields and
evidence IDs. The API still does not implement the full public workflow.

| Capability | Current local API stage | Required before browser-ready integration |
| --- | --- | --- |
| Image input | One multipart image is validated and sanitized in memory | Private R2 quarantine, presigned upload, cleanup, and object authorization |
| Identity | Returns a proposed product name | Confirmed seller input remains platform work |
| Valuation | Synchronous request with name, condition, optional description | Persistent idempotent job, polling or events, retry durability, 90-second boundary |
| Usage safety | Not provided for public browser use | Anonymous limits, spending circuit breaker, bot controls, access control, production CORS |
| Evidence result | Summary metadata and evidence IDs | Three to five safe representative Blibli listings with title, price, condition/city when available, timestamp, and approved direct URL |
| Progress | No client protocol | Server-derived stages for the four localized progress labels |
| Location | Not accepted | A later approved request/selection contract, if product requirements still call for it |

## Phase 1 — Make the UI contract-compatible

Implementation status: complete.

This phase is a platform change and does not make network calls yet.

1. Replace the current `ValuationDetails` shape with `productName`, `productCondition`, and optional
   `productDescription` for the integration path.
2. Remove the asking-price form control, validation, result marker, negotiation target, and all copy
   derived from it. The seller never supplies an asking or original price.
3. Keep the location control only as visibly mock/deferred UI until an API supports it; do not put it
   in the local valuation request.
4. Refactor result rendering around the discriminated outcome model. It must render numeric result
   fields only from a gateway response.
5. Add dedicated, accessible outcome views for unsupported category, more information required,
   insufficient evidence, service failure, and eventual rate limiting. Preserve user input on
   correction/retry and focus the first missing field for `MORE_INFORMATION_REQUIRED`.
6. Retain labelled mock mode until a gateway is deliberately enabled. Mock values and sources must
   remain visibly mock and cannot share rendering paths with live data.

## Phase 2 — Add a development-only gateway

Implementation status: complete. Set `VITE_VALUATION_MODE=local-api` in the root `.env` and run
`pnpm dev`; Vite proxies same-origin `/api` requests to the local API port. The same setting fails
closed in a production build. Omit it or set it to `mock` for the labelled mock journey.

Once Phase 1 has the contract-compatible UI model, add an adapter implementation that maps only to
the current `/api/agents/*` endpoints.

1. Create a small gateway module that validates response envelopes and discriminated statuses at the
   browser boundary.
2. Send the selected `File` as a single `image` multipart part to identification. Use server errors
   as the final authority even if browser preflight has passed.
3. Require the seller to confirm the proposed name and choose one allowed second-hand condition
   before sending the valuation request. Serialize no unknown properties.
4. Pass cancellation through `AbortSignal`; clear in-flight state on route exit or replacement.
5. Gate the adapter to explicit local development configuration. Production and hosted builds must
   not be able to select it.
6. For a current `VALUATED` response, render its calculated prices, explanation, confidence summary,
   and evidence IDs only. Do not render representative live listings, a timestamp, or a mock
   evidence panel as if supplied by the API.
7. Do not simulate four stages from a timer while this request is running. Use a truthful indeterminate
   local-analysis state until the API provides server progress.

Manual local validation covers a valid supported image and valuation, an invalid image, a rejected
extra request field, each business outcome reachable with configured services, a cancelled request,
and a provider failure. It must not log image bytes, free text, raw provider results, or secrets.

## Phase 3 — Complete the server contract

Implementation status: not started by this platform plan.

This phase belongs primarily in `apps/api`; platform work waits for its approved contract. The API
must provide:

1. A secure image upload lifecycle that satisfies the R2 quarantine and sanitization requirements.
2. A job-creation operation with idempotency semantics and a persistent opaque `jobId`.
3. A status read or subscription operation that exposes only browser-safe progress and outcome
   fields.
4. Authorization, anonymous rate limiting, global spending controls, narrow production CORS, and
   proper error behavior.
5. A successful result with safe representative accepted Blibli evidence and retrieval time, plus
   `RATE_LIMITED` when a paid run is blocked.

Do not treat the present local endpoints as a shortcut around any item in this phase.

## Phase 4 — Integrate the browser-ready workflow

Implementation status: waiting for Phase 3 and an approved browser contract.

After a reviewed API contract exists:

1. Implement the production gateway against the job endpoints while keeping the platform domain
   adapter stable.
2. Navigate to a result route keyed by `jobId` after job creation. On refresh, restore server status
   rather than rerunning a valuation or using local state.
3. Map server progress to the four Indonesian labels and show only server-reported status.
4. Render server-calculated `suggestedListingPriceIdr` separately from the observed Blibli range,
   evidence count, confidence reason, explanation, pros, cons, evidence timestamp, and approved
   representative listing links.
5. Keep the required disclosures on every successful result: item price only; Blibli values are
   advertised asking prices; authenticity, ownership, transaction safety, and hidden condition are
   not verified.
6. Ensure retry and refresh reuse the server's idempotency rules rather than creating duplicate
   paid runs.

## Verification and acceptance

- Run `pnpm --filter @repo/platform typecheck` after TypeScript/TSX changes and the platform build
  when routing or Vite integration changes.
- Exercise keyboard-only upload, details correction, cancellation, and all outcome paths. Error
  messages and focus management must remain in Bahasa Indonesia.
- Check that client code contains no valuation formula, no asking-price decision logic, no provider
  credential, and no hidden evidence fallback.
- Confirm an identifier-only result cannot visually imply that individual listing metadata was
  returned.
- Confirm a hosted production build cannot use the development-only local-agent adapter.
- Before declaring the workflow live, verify the server-side contract in Phase 3 and the
  platform/API integration together; the current local route alone is insufficient.
