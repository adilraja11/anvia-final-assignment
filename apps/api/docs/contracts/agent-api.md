# Agent API contract

Status: implemented on 2026-09-15 for unauthenticated local-demo use.

This document defines the local agent-stage HTTP interface planned by the
[agent API integration plan](../plans/agent-api-integration.md). It is not the final browser-facing
AsliSegini? valuation contract.

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
- exactly four fields: product name, listing description, condition, and asking price;
- a positive safe-integer asking price in IDR;
- no arbitrary prompt, chat history, image URL, actor ID, tool settings, retry settings, model
  settings, or provider configuration.

Exact JSON shape:

```json
{
	"productName": "PlayStation 5 Slim Disc Edition 1 TB",
	"productDescription": "Kondisi\nBekas - Seperti Baru\nPs 5 slim disk original. Second like new\nOriginal tanpa game\nBisa game online/offline\nKondisi normal no minus\nKelengkapan fullset",
	"productCondition": "Baru",
	"productAskingPriceIdr": 8500000
}
```

All four fields are required and unknown fields are rejected. `productName` is limited to 160
characters and `productDescription` to 2,000 characters. `productCondition` must be exactly one of
`Baru`, `Seperti baru`, `Baik`, `Cukup`, `Rusak`, or `Tidak diketahui`.

`productCondition` is the confirmed authoritative condition. Text in `productDescription` remains
untrusted listing context and cannot override the structured condition or asking price when it
conflicts. The agent validates whether `productName` and `productDescription` contain enough
category-specific, price-critical identity. If not, it returns `MORE_INFORMATION_REQUIRED` before
marketplace retrieval rather than guessing.

Application code serializes the validated object into one deterministic, clearly delimited agent
prompt. User-provided strings remain untrusted data. The service creates a stateless valuation agent
with its stable default ID, attaches no chat memory, disables optional web tools, forwards the abort
signal, and returns only `generateValuationResult` output.

Successful response:

```json
{
	"result": {
		"status": "SUCCESS",
		"explanation": "...",
		"pros": [],
		"cons": [],
		"evidenceIds": []
	}
}
```

The response may instead contain `UNSUPPORTED_CATEGORY`, `MORE_INFORMATION_REQUIRED`,
`INSUFFICIENT_EVIDENCE`, or `SERVICE_FAILURE`, preserving each agent result exactly. It never adds
calculated price fields. In this contract, `SUCCESS` means the agent stage completed; it does not
mean a final `VALUATED` result exists.

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
- The valuation agent receives only validated fields and cannot accept caller-selected capabilities.
- Responses contain only schema-approved result fields or the public error envelope.
- The routes are unauthenticated for local testing; network-level access must remain local-only.
- This contract cannot be exposed directly to anonymous browsers until the PRD's job, idempotency,
  authentication, rate-limit, and spending controls are implemented.
