# Platform valuation integration contract

Status: the persistent asynchronous API workflow is implemented in `@repo/api`; the platform has
not yet integrated it. The platform still defaults to labelled mock mode and its optional local
adapter still calls the legacy synchronous valuation route.

## Purpose and boundary

The live integration uses `POST /api/agents/image-identification` to propose an editable identity,
then uses the persistent `/api/valuations*` workflow for valuation. The exact HTTP shapes, errors,
and `src/utils/api.ts` selectors are defined in the focused
[API route contract](api-routes.md); this document defines how the platform consumes them.

These implemented endpoints remain local-demo infrastructure, not a public-safe browser contract.
Authentication, owner-scoped reads, production CORS, and secure public image transport are still
required before public deployment.

## Why progress is asynchronous

A normal synchronous `POST` cannot return intermediate progress labels: it produces one final HTTP
response. Keeping the connection open would also tie expensive provider and model work to the HTTP
request lifecycle. Do not add a synchronous valuation request solely to drive `progressLabels`.

The existing asynchronous contract already supplies truthful progress:

1. `POST /api/valuations` validates input, creates or reuses a PostgreSQL row, enqueues one BullMQ
   job, and returns `202 Accepted` immediately.
2. The platform retains the returned valuation ID and polls
   `GET /api/valuations/:valuationId` after `pollAfterMs`.
3. The separate worker, run locally with `pnpm worker:dev`, performs the expensive work and updates
   BullMQ progress.
4. Polling stops when `valuation.state === "COMPLETED"`; the UI then branches on `result.status`.

Do not run valuation inside the HTTP handler, start an in-process fire-and-forget promise, or use
timer-simulated progress in live mode. Those approaches are not durable across restarts and do not
represent server work.

## Platform gateway

Keep HTTP details out of route components. The platform-facing adapter should expose operations
equivalent to:

```ts
type ProductCondition = "Seperti baru" | "Baik" | "Cukup" | "Rusak";

type ValuationInput = {
	productName: string;
	productCondition: ProductCondition;
	productDescription?: string;
};

type ValuationGateway = {
	identifyImage(file: File, signal?: AbortSignal): Promise<ImageIdentificationResult>;
	createValuation(
		input: ValuationInput,
		idempotencyKey: string,
		signal?: AbortSignal,
	): Promise<ValuationProgress>;
	readValuation(id: string, signal?: AbortSignal): Promise<ValuationRead>;
	readEvidence(id: string, signal?: AbortSignal): Promise<ValuationEvidence>;
};
```

`productName` is the seller-confirmed price-critical identity. `productDescription` is optional,
untrusted context. Asking/original price and location are not accepted by the current creation
route and must not be serialized into it.

Use a stable idempotency key for retries of one submission. Reusing that key with changed product
fields is a conflict. Cancelling a browser fetch stops only that fetch; it does not cancel a job
already durably created.

## Create, poll, and restore

Successful creation returns `202` with a valuation whose initial state and stage are `QUEUED`, plus
`id`, retention timestamps, and `pollAfterMs`. The client must:

- store the opaque ID in the ID-based result route so refresh can resume polling;
- validate every decoded response at the browser boundary;
- wait at least `pollAfterMs` between reads and avoid overlapping polls;
- continue while state is `QUEUED` or `RUNNING` and `result` is `null`;
- stop on `COMPLETED`, terminal HTTP errors, route exit, or expiry; and
- never create another valuation merely because a poll failed.

`GET /api/valuations` can restore retained summaries, but active progress must come from the detail
route because the list response does not read temporary BullMQ progress.

## Progress-label mapping

Render only the latest server-reported stage in live mode:

| Server stage | Bahasa Indonesia label |
| --- | --- |
| `QUEUED` | `Menunggu antrean` |
| `VALIDATING_IDENTITY` | `Mengidentifikasi produk` |
| `FINDING_COMPARABLES` | `Mencari produk pembanding` |
| `CALCULATING_PRICE` | `Menghitung estimasi harga` |
| `PREPARING_EXPLANATION` | `Menyiapkan penjelasan` |
| `COMPLETED` | `Selesai` |

Stages communicate current work, not a guaranteed percentage. Poll responses may repeat or skip a
stage, so the UI must not require every label to appear before completion. `COMPLETED` means inspect
the result; it does not necessarily mean a price was produced.

## Terminal outcomes and evidence

When state is `COMPLETED`, `result` must be non-null and has one of these statuses:

| Result status | Platform behavior |
| --- | --- |
| `VALUATED` | Render only server-calculated price, market range, confidence, explanation, pros, cons, and limitations; then request evidence. |
| `UNSUPPORTED_CATEGORY` | Show the dedicated unsupported-category outcome without price fields. |
| `MORE_INFORMATION_REQUIRED` | Preserve input, show `missingFields`, and focus the first field needing correction. |
| `INSUFFICIENT_EVIDENCE` | Show evidence shortage and accepted count without a price. |
| `SERVICE_FAILURE` | Show a service-failure outcome and an intentional retry action; never substitute mock data. |

Evidence is read from `GET /api/valuations/:valuationId/evidence` only after `VALUATED`. Render only
the approved listing fields returned there. Keep the item-price-only statement, label the market
range as **"Rentang harga pasar saat ini di Blibli"**, disclose that listings are advertised asking
prices, and retain the authenticity, ownership, transaction-safety, and hidden-condition limits.

`429 RATE_LIMITED` is a creation failure and does not create a terminal valuation result. Transport
errors remain distinct from business outcomes; reject malformed envelopes and unknown statuses.

## Durable runtime ownership

- PostgreSQL is authoritative for durable input, coarse state, terminal result, and accepted
  evidence. A result survives browser navigation and Redis progress loss until retention expiry.
- BullMQ/Redis owns delivery and temporary active-stage progress. The worker, not the API process,
  performs valuation work.
- Redis also supports temporary cache and usage controls; it is not the terminal result store.
- Application code calculates prices and confidence. AI may identify, normalize, match, and
  explain, but never supplies the final calculation.

## Public-readiness blockers

Do not present this integration as publicly ready until all valuation reads authenticate and enforce
ownership, production CORS is narrow, and image upload uses private quarantine, validation,
sanitization, scoped access, and deletion. An opaque valuation ID and an `Origin` check are not
authorization. Keep provider credentials, presigned URLs, raw payloads, queue metadata, and private
errors out of browser responses and logs.
