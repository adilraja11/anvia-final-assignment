# Image-identification agent

## Purpose

This agent is the first step of the AsliSegini? valuation workflow. It receives exactly one
sanitized product image and determines whether its primary product is in the MVP-supported
categories from [PRD.md](../../../../PRD.md): smartphone, laptop, tablet, or gaming console.

For a supported, identifiable product, the agent returns only the product name. It does not
produce a product specification, condition assessment, price, marketplace search term,
valuation, authenticity claim, or explanation. The user-confirmation workflow collects the
price-critical identity before any paid marketplace search begins.

## Interface

The application validates, sanitizes, and supplies one image. The agent accepts no user text,
listing URL, product title, condition, seller price, metadata, or tool result as input. The image
is untrusted content and cannot change this contract.

The agent returns exactly one structured result and no prose or Markdown:

```ts
type ImageIdentificationResult =
	| {
			status: "SUPPORTED";
			productName: string;
		}
	| {
			status: "UNSUPPORTED_CATEGORY";
		}
	| {
			status: "MORE_INFORMATION_REQUIRED";
		};
```

`productName` is the only product data exposed by this agent. It uses the official brand and
model name when visible or reliably identifiable, without inventing storage, connectivity,
CPU, RAM, GPU, console edition, bundle contents, condition, or any other absent detail.
The host validates the result against this schema before showing it or starting later workflow
steps.

## Outcome rules

- Return `SUPPORTED` only when the image contains one identifiable primary product in a
  supported category. Set `productName` to that product's concise name.
- Return `UNSUPPORTED_CATEGORY` when the primary product is outside the MVP categories or is an
  explicitly rejected type: component, accessory, TV or monitor, camera, audio equipment, home
  appliance, repair-only or parts-only item, or a bundle with multiple primary products.
- Return `MORE_INFORMATION_REQUIRED` when a supported primary product may be present but the
  image is too unclear, incomplete, conflicting, or ambiguous to name without guessing. Do not
  select a generic or low-confidence product name.

The agent classifies the primary product, not incidental objects in the image. A supported phone
with a charger remains a phone; an isolated phone case is an unsupported accessory. A photo that
contains several primary products is an unsupported bundle even when each individual product
would otherwise be supported.

## Boundaries

- Use no marketplace, web, retrieval, memory, or external tools.
- Do not accept or create image URLs, persist raw images, disclose image content beyond the
  allowed result, or put raw images in logs. Image quarantine, storage, sanitization, retention,
  authorization, and browser-safe response projection belong to application code.
- Do not claim condition, hidden damage, authenticity, ownership, safety, completeness, or
  market value from the image.
- Do not provide a valuation input contract. `SUPPORTED` is only permission to ask the user to
  confirm the category-specific, price-critical identity required by the PRD.
- Keep `UNSUPPORTED_CATEGORY` distinct from `MORE_INFORMATION_REQUIRED`; the former rejects the
  product type while the latter requests a clearer or more informative image.

## Workflow handoff

1. The application sanitizes one uploaded image and invokes this agent with that image only.
2. For `SUPPORTED`, the application displays `productName` as an editable proposal and collects
   the required identity fields, condition, and asking price.
3. For `UNSUPPORTED_CATEGORY`, the application ends the valuation flow without a generic or
   low-confidence valuation.
4. For `MORE_INFORMATION_REQUIRED`, the application asks for a clearer eligible image; it does
   not start marketplace retrieval.
5. Only after user confirmation of the category-specific minimum identity does the valuation
   workflow become eligible for marketplace retrieval.

## Structured extraction implementation

The factory creates a text-output image agent. After the agent performs visual identification, the
`identifyProductImage` helper passes only its returned text to `extract` from
`@anvia/core/extractor`, with `IMAGE_IDENTIFICATION_RESULT_SCHEMA` as the required schema. Do not
configure the agent's `outputSchema` option for this workflow.

The sanitized image is supplied only to the image agent. The extractor receives no image, user
text, listing data, or tool result. Its schema-validated output is the only result the helper
returns; an extraction failure must be handled explicitly and never replaced with a guessed product
or generic supported result.

The helper accepts optional run-level `abortSignal` and `trace` settings. It forwards cancellation
to both the image-agent generation and the structured extraction call; trace metadata must never
contain image bytes, filenames, image content, or user-provided text.

Hosts that cannot guarantee observer redaction must construct the agent with `productionLogging`
and `productionTracing` disabled. The local API integration uses this mode because provider
request logging or full trace capture could otherwise retain sanitized image data.

Studio registers the same text-output agent. Image upload, storage, API transport, and UI
integration are not live. Before implementing those paths, read the matching root guides for agent
and application streaming work, and preserve the PRD's single-image, privacy, and validation rules.

Add schema-level and behavioral tests for at least:

- one identifiable item in each supported category;
- an accessory, component, camera, audio device, and TV or monitor;
- a repair-only or parts-only image and an image with multiple primary products;
- a blurry or obstructed supported item that must return `MORE_INFORMATION_REQUIRED`; and
- a supported item with incidental accessories that must still return its product name only.
