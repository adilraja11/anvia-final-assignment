# Platform valuation integration contract

Status: proposed platform contract. It maps the implemented local API stage for development
validation; it does not make that API a public browser contract.

## Purpose and boundary

This contract lets `@repo/platform` depend on a small valuation domain adapter instead of binding
routes and components directly to an HTTP endpoint. The adapter has two modes:

- A development-only implementation maps to the synchronous local API routes in `@repo/api`.
- A future browser-ready implementation keeps the platform-facing input and outcome model, but
  supplies secure upload, persistent idempotent jobs, access control, rate limits, and evidence
  presentation.

The current routes are `POST /api/agents/image-identification` and `POST /api/agents/valuation`.
They are unauthenticated local-demo endpoints that may trigger paid services. They must not be
called by a public deployment. See the API [agent API contract](../../../api/docs/contracts/agent-api.md)
for their server-side validation and public error envelope.

The client only renders server-calculated numeric fields and returned explanation fields. It never
calculates a suggestion, a market range, confidence, or a fallback evidence set. All user-facing
copy remains Bahasa Indonesia.

## Platform adapter

The platform depends on these domain operations:

```ts
type ProductCondition = "Seperti baru" | "Baik" | "Cukup" | "Rusak";

type ValuationInput = {
	productName: string;
	productCondition: ProductCondition;
	productDescription?: string;
};

type ValuationGateway = {
	identifyImage(file: File, signal?: AbortSignal): Promise<ImageIdentificationResult>;
	requestValuation(
		input: ValuationInput,
		signal?: AbortSignal,
	): Promise<ValuationResult>;
};
```

`productName` is the seller-confirmed price-critical product text. `productDescription` is optional,
untrusted context; it cannot replace confirmed identity or condition. The local API accepts exactly
these fields: a non-empty name of at most 160 characters, one allowed condition, and an optional
description of at most 2,000 characters. It accepts neither an asking price nor a location.

The current form's `askingPrice` and mock-source result comparison are not part of this contract.
They must be removed before a live or development-only gateway drives the journey. Location may
remain a mock-only UI field until a later API contract accepts it; it must not be silently added to
the local valuation request.

## Development-only HTTP mapping

The local gateway translates only as follows:

| Adapter operation | Local request | Local response |
| --- | --- | --- |
| `identifyImage` | `POST /api/agents/image-identification`, `multipart/form-data`, one `image` part | `{ result: ImageIdentificationResult }` |
| `requestValuation` | `POST /api/agents/valuation`, `application/json`, exact `ValuationInput` shape | `{ result: ValuationResult }` |

Image preflight in the browser may give prompt feedback, but is not security validation. The server
is authoritative: it accepts exactly one JPEG, PNG, or WebP decoded from its actual content, up to
10 MB, at least 300 x 300 pixels, at most 25 megapixels, and not animated. It sanitizes the image
in memory before identification.

This gateway is enabled only in an explicitly local development configuration. It must fail closed
for production builds and hosted environments, rather than falling back to simulated progress,
mock prices, or mock evidence.

## Result model

`ImageIdentificationResult` is one of:

```ts
type ImageIdentificationResult =
	| { status: "SUPPORTED"; productName: string }
	| { status: "UNSUPPORTED_CATEGORY" }
	| { status: "MORE_INFORMATION_REQUIRED" };
```

`ValuationResult` is one of the following shapes:

| Status | Required fields available to the platform | UI behavior |
| --- | --- | --- |
| `VALUATED` | explanation, pros, cons, evidence IDs, calculated suggested price, calculated Blibli P25--P75 range, confidence, confidence reason, accepted count, coverage, outlier count | Render result. Keep the item-price, uncertainty, and advertised-asking-price disclosures. |
| `UNSUPPORTED_CATEGORY` | explanation | Show a dedicated unsupported-category outcome; do not offer a low-confidence price. |
| `MORE_INFORMATION_REQUIRED` | explanation, `missingFields` | Return to product details, preserve entered values, expose the missing fields, and move focus to the first correction. |
| `INSUFFICIENT_EVIDENCE` | explanation, evidence IDs, accepted count, coverage, outlier count | Show the dedicated evidence-shortage outcome without price fields. |
| `SERVICE_FAILURE` | explanation | Show a service-failure outcome and a retry action. Never substitute mock evidence. |

The future browser-ready workflow also maps `RATE_LIMITED` to its own outcome and explains that a
new paid run was not started. It is not returned by the current local agent route.

For `VALUATED`, display the API's server-rounded `suggestedListingPriceIdr` separately from
`observedMarketRangeIdr`, labelled **"Rentang harga pasar saat ini di Blibli"**. Keep
**"Estimasi hanya mencakup harga barang."** and the limitation that authenticity, ownership,
transaction safety, and hidden physical condition are not verified.

The local result exposes only `evidenceIds`, not representative listing title, price, condition,
city, or URL. A UI driven by this route may display the returned summary fields and IDs only; it
cannot claim it has the PRD's live evidence-listing panel. It must not enrich the result with mock
listings. A browser-ready result needs a separately approved representative-evidence response.

## Transport failures

The local API uses this browser-safe envelope for route failures:

```json
{
	"error": {
		"code": "INVALID_REQUEST",
		"message": "Permintaan tidak valid."
	}
}
```

| HTTP status | Code | Platform treatment |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | Keep the user on the relevant step and show the supplied Indonesian validation message. |
| 413 | `IMAGE_TOO_LARGE` | Return to image selection and show the size error. |
| 415 | `UNSUPPORTED_IMAGE_TYPE` | Return to image selection and show the format error. |
| 422 | `INVALID_IMAGE` | Return to image selection and show the invalid-image error. |
| 499 | `REQUEST_CANCELLED` | Treat as cancelled; do not show a false successful result. |
| 500 | `AGENT_SERVICE_FAILURE` | Show a service-failure state with retry. |

An adapter must reject malformed envelopes and unknown statuses rather than trying to render them.
Request cancellation is passed through `AbortSignal`; a cancelled request does not create a mock
result.

## Browser-ready job transition

The synchronous adapter is temporary. The browser-ready adapter will create a server-owned,
idempotent valuation job and query or subscribe to it by `jobId`. The result route should carry
only `jobId`, so a refresh can resume its status; it must never place prices, product details,
presigned URLs, or raw evidence in the URL. The server remains the authority for job access and
status.

The four intended progress labels are `Mengidentifikasi produk`, `Mencari produk pembanding`,
`Menghitung estimasi harga`, and `Menyiapkan penjelasan`. The current synchronous API has no
progress transport, so a development-only gateway must not present timed simulated stages as live
status.

## Non-negotiable integration rules

- Treat image bytes, user text, response evidence IDs, and all URLs as untrusted data.
- Do not expose provider credentials, raw provider payloads, model output beyond the approved
  response, or server configuration.
- Do not turn the local endpoint into a public API via a `VITE_*` base URL or permissive hosted
  CORS configuration.
- Do not use hard-coded marketplace data as a live-provider fallback.
- Do not show a result solely from image identification; valuation still requires seller-confirmed
  name and condition.
