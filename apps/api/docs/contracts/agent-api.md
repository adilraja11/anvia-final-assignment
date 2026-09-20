# Agent API contract

Status: implemented for unauthenticated local-demo use. The valuation route returns a
deterministic local valuation result, but it is not the final browser-facing product workflow.

This document defines the local agent-stage HTTP interface planned by the
[agent API integration plan](../plans/agent-api-integration.md). It is not the final browser-facing
AsliSegini? seller listing-price recommendation contract.

## PRD alignment

The current PRD is for individual Indonesian sellers of second-hand computers, handphones, tablets,
gaming consoles, and cameras. Its public workflow collects identity, second-hand condition,
listing details, and location; it does not collect an asking or original price. Its deterministic
result uses one Blibli evidence set to produce a median-based suggested price and a separately
labeled observed market range.

The valuation route accepts confirmed product identity, a confirmed second-hand condition, and an
optional product description. It uses only the fixed Blibli boundary and passes its normalized
result to application-owned `calculateValuation`. The model supplies only the grounded Bahasa
Indonesia explanation and evidence IDs; it does not calculate price fields.

These remain local-only integration routes and must not be presented as the complete public product
API. Persistent jobs, access controls, usage limits, evidence persistence, and browser workflow
work require separate implementation.

## Route scope

Mount `agentApiRouter` at `/api/agents`. Both endpoints return synchronous JSON responses and
currently require no authentication. They are for local demo use only and must not be exposed to
the public internet because valuation requests can trigger paid model and marketplace calls.

## `POST /api/agents/image-identification`

Request:

- `multipart/form-data` containing exactly one `image` file;
- JPEG, PNG, or WebP based on decoded content, not filename or declared MIME type;
- at most 10 MB, at least 300 x 300 pixels, at most 25 megapixels, and not animated.

Processing:

1. Enforce the request-body limit before fully buffering the upload.
2. Reject missing, duplicate, non-file, unsupported, undecodable, animated, or out-of-bounds images.
3. Decode and re-encode the image to strip metadata.
4. Pass only sanitized in-memory bytes, detected media type, and `detail: "high"` to
   `identifyProductImage`.
5. Release image buffers after the request. Never log or trace image bytes, filenames, or image
   content.

Successful response:

```json
{
	"result": {
		"status": "SUPPORTED",
		"productName": "Apple iPhone 15"
	}
}
```

The other valid results are `UNSUPPORTED_CATEGORY` and `MORE_INFORMATION_REQUIRED`. These business
outcomes use HTTP `200`; request or service failures use the error contract below.

## `POST /api/agents/valuation`

Request:

- `application/json` only;
- exactly one confirmed product name and second-hand condition, plus an optional product
  description;
- no arbitrary prompt, chat history, image URL, actor ID, tool settings, retry settings, model
  settings, or provider configuration.

Exact JSON shape:

```json
{
	"productName": "PlayStation 5 Slim Disc Edition 1 TB",
	"productCondition": "Seperti baru",
	"productDescription": "Original tanpa game, kelengkapan fullset, kondisi normal."
}
```

`productName` and `productCondition` are required; `productDescription` is optional. Unknown fields
are rejected. `productName` is limited to 160 characters and `productDescription` to 2,000
characters. `productCondition` must be exactly one of `Seperti baru`, `Baik`, `Cukup`, or `Rusak`.

`productDescription` remains untrusted data and cannot override confirmed identity or condition.
The local endpoint does not accept location, so its calculation uses nationwide evidence.

The agent validates whether the supplied product information contains enough category-specific,
price-critical identity. If not, it returns `MORE_INFORMATION_REQUIRED` before marketplace
retrieval rather than guessing.

Application code serializes the validated object into one deterministic, clearly delimited agent
prompt. User-provided strings remain untrusted data. The service creates a stateless valuation
agent with its stable default ID, attaches no chat memory, forwards the abort signal, and returns
only schema-approved fields. The agent can use only the fixed Blibli search boundary; it cannot
select a provider, actor, result limit, retry policy, proxy, or credential. The API requires one
observed provider result; an absent or duplicate tool result becomes `SERVICE_FAILURE`.

Successful response:

```json
{
	"result": {
		"status": "VALUATED",
		"explanation": "...",
		"pros": [],
		"cons": [],
		"evidenceIds": [],
		"suggestedListingPriceIdr": 7500000,
		"observedMarketRangeIdr": { "minimum": 7000000, "maximum": 8000000 },
		"confidence": "MEDIUM",
		"confidenceReason": "Tiga sampai sembilan listing Blibli yang sebanding diterima.",
		"acceptedComparableCount": 8,
		"evidenceCoverage": "NATIONAL",
		"outlierCount": 1
	}
}
```

`VALUATED` contains a median-based suggested price, the unweighted P25--P75 observed market
range, confidence, and deterministic evidence summary. Displayed prices are rounded half-up to
the nearest Rp1.000 by `calculateValuation`.

The response may instead contain `UNSUPPORTED_CATEGORY`, `MORE_INFORMATION_REQUIRED`,
`INSUFFICIENT_EVIDENCE`, or `SERVICE_FAILURE`. `INSUFFICIENT_EVIDENCE` includes `explanation`,
`evidenceIds`, `acceptedComparableCount`, `evidenceCoverage`, and `outlierCount`; it has no price
fields. `SERVICE_FAILURE` distinguishes a provider failure from successful retrieval with too few
accepted listings. The response never exposes raw provider payloads or unselected evidence.

## Error contract

Every route-level failure returns a stable browser-safe envelope:

```json
{
	"error": {
		"code": "INVALID_REQUEST",
		"message": "Permintaan tidak valid."
	}
}
```

Mappings:

- `400 INVALID_REQUEST`: malformed multipart/JSON or schema failure;
- `413 IMAGE_TOO_LARGE`: request or file exceeds the configured limit;
- `415 UNSUPPORTED_IMAGE_TYPE`: decoded content is not JPEG, PNG, or WebP;
- `422 INVALID_IMAGE`: invalid dimensions, animation, or decode failure;
- `499 REQUEST_CANCELLED`: client disconnect identified before a response;
- `500 AGENT_SERVICE_FAILURE`: provider, model, extraction, or unexpected server failure.

Validation details, stack traces, raw model output, runtime events, tool arguments/results, provider
payloads, credentials, and continuations remain server-side. Agent business statuses are not HTTP
errors.

## Security invariants

- Image bytes and user free text never appear in logs or trace metadata.
- API-created agents disable the shared production logger and full Lens tracing because their
  provider-request capture is not safe for images or user free text.
- The image agent receives one sanitized image and no user text.
- The valuation agent receives only validated fields and cannot accept caller-selected
  capabilities; it has only the fixed Blibli search boundary.
- Responses contain only schema-approved result fields or the public error envelope.
- The routes are unauthenticated for local testing; network-level access must remain local-only.
- This contract cannot be exposed directly to anonymous browsers until the PRD's job, idempotency,
  authentication, rate-limit, and spending controls are implemented.
