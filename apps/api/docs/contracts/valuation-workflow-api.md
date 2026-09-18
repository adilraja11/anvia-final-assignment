# Valuation workflow API contract

Status: proposed MVP; not implemented.

This contract refines [brainstorming-idea.md](../brainstorming-idea.md) using
[PRD.md](../../../../PRD.md), [PRD_TECHNICAL.md](../../../../PRD_TECHNICAL.md), and the
[data model](valuation-data-model.md). Delivery order is in the
[integration plan](../plans/valuation-workflow-integration.md). Existing synchronous
`/api/agents/*` routes remain local-only under the [agent API contract](agent-api.md).

## Routes and shared rules

| Purpose | Route |
| --- | --- |
| Local image proposal | `POST /api/agents/image-identification` |
| Create/reuse valuation | `POST /api/valuations` |
| Poll/read result | `GET /api/valuations/:valuationId` |
| Read accepted evidence | `GET /api/valuations/:valuationId/evidence` |

The valuation owns its evidence; do not add `/api/product/:id` or `/api/evidence/:id` aliases.

- JSON is UTF-8; public text is Bahasa Indonesia; timestamps are ISO 8601 UTC; money is integer IDR.
- Responses send `Cache-Control: no-store`; unknown request fields are rejected.
- A server-issued `HttpOnly`, `Secure`, `SameSite=Lax` cookie supplies `ownerId`. Every resource
  query includes it; possession of an opaque ID is not authorization.
- Mutations require an allowed `Origin`; credentialed cross-origin access is disabled.
- Never return secrets, presigned URLs, raw runtime/tool/provider data, private errors, rejected
  evidence, or continuations.

The existing multipart image route remains development-only. `SUPPORTED` proposes an editable
title; it does not authorize paid retrieval. Public image transport still requires the PRD's private
R2 quarantine, sanitization, scoped access, and deletion flow.

## `POST /api/valuations`

Requires `Content-Type: application/json` and an `Idempotency-Key` of 16–128 printable ASCII
characters.

```json
{
	"productName": "PlayStation 5 Slim Disc Edition 1 TB",
	"productCondition": "Seperti baru",
	"productDescription": "Original tanpa game, kelengkapan fullset, kondisi normal."
}
```

- `productName`: required, trimmed, 1–160 characters.
- `productCondition`: `Seperti baru`, `Baik`, `Cukup`, or `Rusak`.
- `productDescription`: optional, trimmed, 1–2,000 characters when present.
- Asking/original prices, arbitrary prompts, image URLs, actor/model/provider/tool/retry settings,
  and other fields are rejected.
- Strings are untrusted data and cannot change permissions, limits, provider, cache, or formula.

Missing price-critical identity completes as `MORE_INFORMATION_REQUIRED` before a paid run.
Successful creation or exact replay returns `202`:

```json
{
	"valuation": {
		"id": "cm123example",
		"state": "QUEUED",
		"stage": "QUEUED",
		"createdAt": "2026-09-18T04:00:00.000Z",
		"expiresAt": "2026-09-19T04:00:00.000Z",
		"pollAfterMs": 1000
	}
}
```

Reuse with different validated product fields returns `409 IDEMPOTENCY_CONFLICT`. Redis principal
or global usage limits return `429 RATE_LIMITED` before a row or paid run is created. A valid cache
hit still creates a valuation but avoids a live provider run.

## `GET /api/valuations/:valuationId`

During processing, `result` is `null`. `state` is `QUEUED`, `RUNNING`, or `COMPLETED`; BullMQ may
report stage `QUEUED`, `VALIDATING_IDENTITY`, `FINDING_COMPARABLES`, `CALCULATING_PRICE`,
`PREPARING_EXPLANATION`, or `COMPLETED`. Clients follow `pollAfterMs`, back off, and stop on a
terminal state, `404`, or expiry.

A valued terminal result has this shape:

```json
{
	"valuation": { "id": "cm123example", "state": "COMPLETED", "stage": "COMPLETED" },
	"result": {
		"status": "VALUATED",
		"productName": "PlayStation 5 Slim Disc Edition 1 TB",
		"productCondition": "Seperti baru",
		"suggestedListingPriceIdr": 12999000,
		"observedMarketRangeIdr": { "minimum": 11699000, "maximum": 14750000 },
		"confidence": "MEDIUM",
		"confidenceReason": "Lima sampai 14 listing Blibli yang sebanding diterima.",
		"acceptedComparableCount": 8,
		"evidenceCoverage": "NATIONAL",
		"evidenceRetrievedAt": "2026-09-18T04:00:27.000Z",
		"explanation": "Harga dihitung sistem dari bukti Blibli yang diterima.",
		"pros": [],
		"cons": [],
		"limitations": ["Estimasi hanya mencakup harga barang."]
	}
}
```

Application code calculates the median suggestion, unweighted P25–P75 range, half-up Rp1.000
rounding, evidence count, and confidence. AI only explains the calculated result.
`limitations` always covers item-only pricing, Blibli advertised-price limitations, and the lack of
authenticity, ownership, safety, or hidden-condition verification.

Other terminal statuses are `UNSUPPORTED_CATEGORY`, `MORE_INFORMATION_REQUIRED`,
`INSUFFICIENT_EVIDENCE`, and `SERVICE_FAILURE`. All contain a safe `explanation`;
`MORE_INFORMATION_REQUIRED` adds `missingFields`; `INSUFFICIENT_EVIDENCE` adds accepted count but
no price/range/confidence. A failed single MVP provider run is `SERVICE_FAILURE`; successful
retrieval with fewer than five accepted listings is `INSUFFICIENT_EVIDENCE`.

## `GET /api/valuations/:valuationId/evidence`

Available only for `VALUATED`; it never invokes a provider.

```json
{
	"valuationId": "cm123example",
	"source": "BLIBLI",
	"acceptedComparableCount": 8,
	"evidenceCoverage": "NATIONAL",
	"retrievedAt": "2026-09-18T04:00:27.000Z",
	"listings": [
		{
			"id": "cm456example",
			"title": "Sony PlayStation 5 Slim Disc Edition 1TB",
			"priceIdr": 12999000,
			"listingUrl": "https://www.blibli.com/p/example"
		}
	]
}
```

Return at most five accepted rows in deterministic order. URLs must be validated HTTPS Blibli
links. Do not return seller/profile/contact/photo data or raw attributes. Before `VALUATED`, return
`409 RESULT_NOT_AVAILABLE`; inaccessible, unknown, or expired IDs return `404 RESOURCE_NOT_FOUND`.

## Errors

```json
{ "error": { "code": "INVALID_REQUEST", "message": "Permintaan tidak valid." } }
```

| HTTP | Code |
| ---: | --- |
| `400` | `INVALID_REQUEST` |
| `404` | `RESOURCE_NOT_FOUND` |
| `409` | `IDEMPOTENCY_CONFLICT` or `RESULT_NOT_AVAILABLE` |
| `413` | `REQUEST_TOO_LARGE` |
| `429` | `RATE_LIMITED` |
| `500` | `INTERNAL_SERVICE_FAILURE` |
| `503` | `SERVICE_UNAVAILABLE` |

Never expose validation details, exceptions, database/provider errors, or queue metadata.

## MVP invariants

- `(ownerId, idempotencyKey)` is unique; exact replay returns the original valuation.
- BullMQ `jobId` equals valuation ID. The worker atomically changes `QUEUED` to `PROCESSING`; only
  the winner may call providers.
- The API enqueues through `src/config/queue.ts`; only the separately run `src/worker.ts` executes
  jobs, using the shared name and connection from `src/config/queue-connection.ts`.
- Perform at most one live Blibli run. Queue/stale-worker failures become `SERVICE_FAILURE` rather
  than repeating possibly paid work.
- PostgreSQL owns coarse status and terminal results; BullMQ owns temporary progress; Redis owns
  cache and usage counters.
- Delete valuation/evidence after 24 hours and cache after six hours. Images are deleted immediately
  when possible and within 24 hours.
- Logs and analytics exclude images, filenames, free text, raw evidence, seller data, and secrets.
