# Platform API route contract

Status: source-verified on 2026-09-19. This contract covers only the image-identification and
persistent valuation routes currently in platform integration scope. Their implementation does not
make them safe for a public multi-user deployment.

## Scope and route map

The API mounts the scoped routers in
[`src/index.ts`](../../../api/src/index.ts#L8-L11). This document covers exactly these five routes:

| Method and path | Purpose | `api.ts` selector |
| --- | --- | --- |
| `POST /api/agents/image-identification` | Propose a product identity from an image | `api.api.agents["image-identification"].$post` |
| `GET /api/valuations` | List retained valuation summaries | `api.api.valuations.$get()` |
| `POST /api/valuations` | Create or reuse a queued valuation | `api.api.valuations.$post` |
| `GET /api/valuations/:valuationId` | Poll or read one valuation | `api.api.valuations[":valuationId"].$get` |
| `GET /api/valuations/:valuationId/evidence` | Read accepted evidence | `api.api.valuations[":valuationId"].evidence.$get` |

Sources: [`agents/router.ts`](../../../api/src/modules/agents/router.ts#L58-L98) and
[`valuations/router.ts`](../../../api/src/modules/valuations/router.ts#L69-L180).

## Hono client integration

Import the singleton from [`src/utils/api.ts`](../../src/utils/api.ts#L1-L4):

```ts
import { api } from "#/utils/api";

const detailResponse = await api.api.valuations[":valuationId"].$get({
	param: { valuationId },
});
const imageResponse = await api.api.agents["image-identification"].$post({
	form: { image: file },
});
const createResponse = await api.api.valuations.$post({
	json: input,
	header: { "idempotency-key": key },
});
```

The image route uses `c.req.parseBody()` and valuation creation uses `c.req.json()` directly, so
their request schemas are not declared through Hono validator middleware. Define platform-side
input types explicitly and validate decoded responses at the browser boundary. Let the client set
the multipart boundary; do not set `content-type` when sending `form`. The base URL is currently
hard-coded to `http://localhost:8000`, so this client is development-only. Sources:
[`agents/router.ts`](../../../api/src/modules/agents/router.ts#L65-L82),
[`valuations/router.ts`](../../../api/src/modules/valuations/router.ts#L100-L137), and
[`api.ts`](../../src/utils/api.ts#L1-L4).

## Image-identification contract

`POST /api/agents/image-identification` expects `multipart/form-data` containing exactly one
`image` file. The decoded image must be JPEG, PNG, or WebP; at most 10 MiB; one frame; at least
300x300 pixels; and at most 25 megapixels. The whole multipart request is limited to 10 MiB plus
256 KiB overhead. Sources:
[`agents/router.ts`](../../../api/src/modules/agents/router.ts#L11-L12) and
[`services.ts`](../../../api/src/modules/agents/services.ts#L91-L145).

A valid business outcome returns `200 { result }`; `result` is either
`{ status: "SUPPORTED", productName }`, `{ status: "UNSUPPORTED_CATEGORY" }`, or
`{ status: "MORE_INFORMATION_REQUIRED" }`. The exact response schema is in
[`schema.ts`](../../../api/src/modules/agents/schema.ts#L22-L39). Failures use
`{ "error": { "code": string, "message": string } }`:

| HTTP | Code |
| ---: | --- |
| 400 | `INVALID_REQUEST` |
| 413 | `IMAGE_TOO_LARGE` |
| 415 | `UNSUPPORTED_IMAGE_TYPE` |
| 422 | `INVALID_IMAGE` |
| 499 | `REQUEST_CANCELLED` |
| 500 | `AGENT_SERVICE_FAILURE` |

Source: [`agents/router.ts`](../../../api/src/modules/agents/router.ts#L18-L52).

## Persistent valuation contract

The valuation source of truth is
[`valuations/router.ts`](../../../api/src/modules/valuations/router.ts#L69-L180) and
[`schema.ts`](../../../api/src/modules/valuations/schema.ts#L13-L197).

### Transport decision

Valuation is an asynchronous job, not a synchronous calculation request. A normal HTTP response
cannot keep updating `progressLabels` after it has been returned. Streaming could use a separate
SSE or WebSocket contract, but neither exists in this route set and neither makes the work itself
synchronous. `POST /api/valuations` creates or reuses a PostgreSQL row, enqueues BullMQ, and returns
`202 Accepted`; it never calls the expensive runner. The separately run worker processes the job
(`pnpm worker:dev`, or included in `pnpm dev`). The client polls the returned ID no sooner than
`pollAfterMs` until `valuation.state === "COMPLETED"`, then branches on `result.status`.

PostgreSQL is the durable authority for the job's coarse state and terminal result. BullMQ/Redis
owns queue delivery and temporary stage progress. Do not replace either with an in-process
fire-and-forget promise: it can disappear on API restart and does not coordinate safely across API
instances. Sources:
[`valuation-service.ts`](../../../api/src/modules/valuations/valuation-service.ts#L177-L253),
[`worker.ts`](../../../api/src/worker.ts#L41-L129),
[`queue.ts`](../../../api/src/config/queue.ts#L1-L14), and
[`package.json`](../../../api/package.json#L5-L14).

For a new successfully enqueued job the response is:

```json
{ "valuation": { "id": "cm123example", "state": "QUEUED", "stage": "QUEUED", "createdAt": "2026-09-19T04:00:00.000Z", "expiresAt": "2026-09-20T04:00:00.000Z", "pollAfterMs": 1000 } }
```

An exact idempotent replay returns the row's current state, which may already be running or
completed. If enqueueing a newly created row fails, the implementation persists
`SERVICE_FAILURE` and still returns its current state with `202`; the client must therefore inspect
the returned state rather than assume every accepted response is queued.

### Polling, progress, and terminal results

While `state` is `QUEUED` or `RUNNING`, `result` is `null`. The detail route reads temporary BullMQ
progress and exposes one of these stages:

| Server stage | Bahasa Indonesia UI label | UI treatment |
| --- | --- | --- |
| `QUEUED` | `Menunggu antrean` | Waiting; no work-stage step is complete yet |
| `VALIDATING_IDENTITY` | `Mengidentifikasi produk` | First existing progress label |
| `FINDING_COMPARABLES` | `Mencari produk pembanding` | Second existing progress label |
| `CALCULATING_PRICE` | `Menghitung estimasi harga` | Third existing progress label |
| `PREPARING_EXPLANATION` | `Menyiapkan penjelasan` | Fourth existing progress label |
| `COMPLETED` | `Selesai` | Stop polling and render the terminal outcome |

The four middle labels match
[`progressLabels`](../../src/modules/valuation/components/valuation-experience.tsx#L45-L50).
Use a keyed stage-to-label mapping for live mode; the current array and timed advancement remain
mock-only. A poller must cancel on route exit, avoid overlapping reads, use `pollAfterMs`, back off
after transient failures, and stop on `state === "COMPLETED"`, `404`, or expiry. `state` is the
terminal authority; `stage` is display-only.

On `COMPLETED`, `result` is one of `VALUATED`, `UNSUPPORTED_CATEGORY`,
`MORE_INFORMATION_REQUIRED`, `INSUFFICIENT_EVIDENCE`, or `SERVICE_FAILURE`. Only `VALUATED` may
lead to the evidence route. Source:
[`schema.ts`](../../../api/src/modules/valuations/schema.ts#L34-L49) and
[`valuation-service.ts`](../../../api/src/modules/valuations/valuation-service.ts#L313-L342).

Current progress is coarse: `VALIDATING_IDENTITY` and `FINDING_COMPARABLES` are published
back-to-back before the whole expensive runner. The runner persists the terminal result before
`CALCULATING_PRICE` and `PREPARING_EXPLANATION` are published, so those stages are normally hidden
by the detail response's terminal `COMPLETED` stage. If Redis progress is unavailable, a running
row may also fall back to `stage: "COMPLETED"`. Render the latest stage but never infer completion
from it, force every label to appear, or add fake delays. Precise phases require moving updates into
the corresponding runner operations. Sources:
[`worker.ts`](../../../api/src/worker.ts#L74-L100) and
[`runner.ts`](../../../api/src/modules/valuations/runner.ts#L94-L265).

- `GET /api/valuations` returns `200 { valuations: Summary[] }`, newest first. A summary contains
  `id`, confirmed product fields, `state`, nullable `stage` and terminal `status`, `createdAt`, and
  `expiresAt`. The handler currently ignores query parameters. Its only explicit route failure is
  `500 INTERNAL_SERVICE_FAILURE`.
- `POST /api/valuations` requires strict JSON `{ productName, productCondition,
  productDescription? }`. A trimmed name is 1-160 characters, an optional description is 1-2,000,
  and condition is `Seperti baru`, `Baik`, `Cukup`, or `Rusak`. The request must have an `Origin`
  exactly matching `PLATFORM_URL` (default `http://localhost:3000`). An optional `Idempotency-Key`
  must contain 16-128 printable ASCII characters. Success is the `202` job acknowledgement above;
  an exact keyed replay reuses its row, while a changed payload conflicts. It may return 400, 409
  `IDEMPOTENCY_CONFLICT`, 429, 500, or 503. Source:
  [`schema.ts`](../../../api/src/modules/valuations/schema.ts#L3-L23),
  [`router.ts`](../../../api/src/modules/valuations/router.ts#L111-L150), and
  [`valuation-service.ts`](../../../api/src/modules/valuations/valuation-service.ts#L161-L253).
- `GET /api/valuations/:valuationId` returns the `200 { valuation, result }` polling representation
  described above. It may return 404 `RESOURCE_NOT_FOUND` or 500.
- `GET /api/valuations/:valuationId/evidence` returns `200` only for a `VALUATED` result:
  `{ valuationId, source: "BLIBLI", acceptedComparableCount, evidenceCoverage: "NATIONAL",
  retrievedAt, listings }`. It contains 1-5 `{ id, title, priceIdr, listingUrl }` rows and may
  return 404, 409 `RESULT_NOT_AVAILABLE`, or 500.

All valuation-route errors use `{ "error": { "code": string, "message": string } }`:

| HTTP | Code and trigger |
| ---: | --- |
| 400 | `INVALID_REQUEST`, including a creation body over 64 KiB |
| 404 | `RESOURCE_NOT_FOUND` |
| 409 | `IDEMPOTENCY_CONFLICT` or `RESULT_NOT_AVAILABLE` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_SERVICE_FAILURE` |
| 503 | `SERVICE_UNAVAILABLE` |

Each valuation request first runs 24-hour expiry cleanup, so cleanup failure can return `500`.
Valuation and image-identification responses set `Cache-Control: no-store`. Sources:
[`valuations/router.ts`](../../../api/src/modules/valuations/router.ts#L25-L99) and
[`agents/router.ts`](../../../api/src/modules/agents/router.ts#L58-L63).

## Deployment boundary

The root app applies permissive CORS, and none of these five routes authenticates a user or checks
resource ownership. Valuation creation additionally validates `Origin`, but that is not
authentication; the list, detail, and evidence reads do not perform the same check. Treat this
surface as a local demo. Authentication, owner scoping, private upload/quarantine/deletion,
production-safe image transport, and a secured public browser workflow remain outside the current
HTTP contract. Sources: [`index.ts`](../../../api/src/index.ts#L8-L11) and
[`valuations/router.ts`](../../../api/src/modules/valuations/router.ts#L69-L79).
