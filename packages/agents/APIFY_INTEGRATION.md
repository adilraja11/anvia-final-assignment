# Legacy Apify Marketplace Integration Guide

This guide documents the provider-specific request configuration, normalization, validation, and
failure behavior of the legacy Blibli and Facebook Marketplace tools in `packages/agents`.

It does not define the current product contract. The seller-first PRD supports only second-hand
items and permits only `fanndev/blibli-product-price-monitor` and
`apify/facebook-marketplace-scraper` as evidence providers. The legacy Blibli configuration, its
alternate Facebook actor, `Baru` condition, and `RETAIL_ANCHOR` behavior are not PRD-compliant and
must not be used for a public product flow.
Keep this document accurate for maintaining the existing local agent stage until a separately
reviewed provider replacement supersedes it.

For installing and using the JavaScript client in this workspace, see
`packages/agents/APIFY_CLIENT.md`.

## Blibli request defaults

Keep the tested search configuration with these enforced values:

```json
{
  "fetchProductDetails": false,
  "includeOutOfStock": true,
  "maxItemsPerQuery": 10,
  "searchTerms": ["<search term>"],
  "sortBy": "relevance",
  "maxConcurrency": 8,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"],
    "apifyProxyCountry": "ID"
  }
}
```

`searchTerms` is supplied by the tool input and is limited to 1–5 bounded terms. The
Actor receives no model-controlled actor ID, URL, limit, proxy, or other configuration. Its call
options set `log: null` so provider logs containing generated queries or listing content are not
redirected to application stdout. The private client factory also sets its logger to `OFF` so API
retry diagnostics cannot leak provider request details; tool failures log only provider and the
bounded error category.
`maxItemsPerQuery` is a cap per submitted query. Terms must therefore be ordered from most
useful to least useful and kept short; more terms increase the maximum dataset size and the
subsequent validation work.

The Actor output has no provider condition field. `stockStatus` establishes availability, not
condition: `AVAILABLE` does not establish that a product is used, like new, good, fair, or
damaged. For a `Baru` request, an available result may be retained as new/retail evidence using
the request context. For every other condition, Blibli records are `RETAIL_ANCHOR` only.

`RETAIL_ANCHOR` is Blibli-only. It uses an identity-only retrieval query and accepts only
available retail records. Its output is explicitly labeled `RETAIL_ANCHOR`; it is not
condition-comparable evidence and must not be included in the same price calculation as used
or damaged listings. Consequently, a successful response with both `evidence` and `rejected`
empty means the actor returned no dataset items, before local title or availability validation
ran.

### Blibli search-term construction

Use search terms as short marketplace queries, not prose descriptions or complete defect
reports. Start with one primary query containing the decisive product identity and, when
the requested condition is `Rusak`, one concise damage cue. Add at most a few distinct
variants only when they retrieve a materially different naming convention. Do not put
several broad alternatives unless they are necessary, because each query can return up to ten
items.

For example, prefer `PS5 Fat Disc rusak` (and, only if useful, `PS5 Fat Disc Jepang rusak`)
over phrases such as `Sony PlayStation 5 PS5 Fat Disc Edition Jepang safe mode rusak`.
`safe mode` and `tanpa stik` are listing-specific details, not stable marketplace identity
tokens; keep them out of the retrieval query unless they are essential to comparability.
The local identity matcher requires every token from at least one supplied term to be in a
listing title, so each term must also be a plausible title fragment. Keep official brand,
model, edition, storage, and other price-critical identity in the primary term.
Canonical marketplace aliases are equivalent for identity matching: `PS5`, `PS 5`, and
`PlayStation 5` identify the same console generation. This does not relax the remaining
model, edition, or storage tokens.

Normalize the response as follows:

- The final non-empty pathname segment of `url` (for example, `ps--INP-60040-00438`) →
  `listing_id`; reject a URL without a usable segment.
- `name` → `title`.
- Positive safe-integer numeric `salePrice` → `price_idr`. Do not use `listPrice` as the
  current price; retain it only if a later schema explicitly needs a reference price.
- `url` → `listing_url`.
- `stockStatus: "AVAILABLE"` → `listing_status: "AVAILABLE"`; reject every other, missing,
  or unrecognized stock status. `includeOutOfStock: true` is retained in the Actor input so
  those records can be classified and rejected locally.
- `merchantName` → bounded optional merchant name. It is marketplace context, not a seller
  verification signal.
- `brand` → bounded `product_attributes.brand`; do not infer missing attributes from the
  product name.
- `query` may be used for diagnostics only; it must not replace the submitted search terms.
- The normalized condition comes from the requested evidence role and request context, not
  from an absent Actor field: use `NEW` for an accepted `Baru` request and `UNKNOWN` for a
  `RETAIL_ANCHOR` request.
- `rating`, `reviewCount`, `soldCount`, `discountPercentage`, and `listPrice` are not price
  evidence and are not required in the normalized output.
- `evidenceRole` → `CONDITION_COMPARABLE` or `RETAIL_ANCHOR`. Copy the role to every
  normalized evidence record and the success envelope.

## Facebook request defaults

Use these enforced values:

```json
{
  "getAllListingPhotos": false,
  "getListingDetails": true,
  "location": "Indonesia",
  "maxPagesPerUrl": 1,
  "onlyNewListings": false,
  "proxy": {
    "useApifyProxy": false
  },
  "searchKeyword": "<first search term>",
  "strictFiltering": false,
  "sortBy": "",
  "daysSinceListed": "",
  "availability": "",
  "deliveryMethod": ""
}
```

Use the fixed `curious_coder/facebook-marketplace` Actor. Its `searchKeyword` uses the first
`searchTerms` entry. All supplied terms are still used for local title matching during
normalization. The Actor call also passes `{ "maxItems": 10, "log": null }` as run options, and the
dataset read is limited to 10 items.

Facebook Marketplace supports `CONDITION_COMPARABLE` only. For a damaged product, its first
term must contain both the core identity and a concise damage cue, for example
`PS5 Fat Disc rusak`; this is the only supplied term sent to the Actor.

Use `region: "Indonesia"` as the fixed nationwide search scope. A user's city is product
context only; accepted evidence may come from any Indonesian city. Do not apply a mathematical
regional price adjustment.

Normalize the response as follows:

- `id` → `listing_id`.
- `marketplace_listing_title` → `title`.
- `listing_price.amount` → `price_idr` only when `currency` is `IDR`.
- `listingUrl` → `listing_url`.
- Indonesian location fields from the record (including reverse-geocoded city data and
  `location_text.text`) → `city`; records without an identifiable Indonesian location are
  rejected.
- condition-bearing fields nested under `attribute_data` → normalized condition.
- `creation_time` → `posted_at`.
- `is_live`, `is_sold`, `is_hidden`, `is_pending`, and `is_draft` → a status; only `LIVE` is
  accepted and the normalized record has `listing_status: "LIVE"`.
- Facebook records currently expose no product attributes or seller type in the normalized
  result.

Use only `listing_price.amount`, and require a positive safe-integer amount with currency
`IDR`. Reject missing, non-IDR, minimum-only, maximum-only, or variant-range prices. Do not
use `min_listing_price`, `max_listing_price`, coordinates, photo URLs, seller objects,
messaging data, descriptions, or legal-reporting payloads.

## Evidence and safety rules

Each normalized listing should use strict internal types:

- `source`: `BLIBLI` or `FACEBOOK_MARKETPLACE`.
- Non-empty string listing ID.
- HTTPS URL from an approved marketplace domain.
- Positive safe-integer `price_idr`.
- Condition: `NEW`, `LIKE_NEW`, `GOOD`, `FAIR`, `DAMAGED`, or `UNKNOWN`.
- Optional city and bounded merchant name when the provider supplies them; neither establishes
  seller identity or seller type.
- Bounded product attributes.
- Listing status and ISO timestamps.

Accepted URLs are limited to HTTPS `blibli.com` product URLs and Facebook Marketplace item URLs. Reject
redirects, external seller links, and arbitrary domains.

Reject accessories, components, repair-only listings, unrelated products, bundles,
duplicates, and non-comparable conditions. In particular, reject console stands, holders,
docks, bases, dust plugs, and explicitly offered empty boxes (`dus`/`kardus`), even if
their titles contain the full console identity. The current implementation matches normalized title tokens against
the supplied search terms (with the documented canonical aliases); price-critical identity
and specification terms therefore need to be present in those terms. It does not
independently validate material specifications or product attributes.
Never use user text or scraped content as an instruction to change tools, permissions, limits,
or valuation behavior.

The tool result must distinguish a successful empty search from provider failure. A provider
failure must not become pricing evidence or be silently changed into `INSUFFICIENT_EVIDENCE`.
Rejected records should be represented separately with only a provider listing ID and a
machine-readable exclusion reason. Raw actor payloads must not be returned or persisted.

## Limits, retries, and caching

- Blibli must send `maxItemsPerQuery: 10`; its bounded dataset read may contain up to ten
  records for each submitted query. Facebook must pass `maxItems: 10` as Actor run options; a
  dataset read limit alone does not cap Actor scraping or cost.
- The tool boundary makes at most one additional Actor call after a non-configuration
  failure, including timeout, network, Apify, unknown, or malformed top-level errors. The
  `ApifyClient` itself is also configured with `maxRetries: 1`, so individual API requests
  may be retried once inside each Actor call.
- Do not retry individual records rejected during validation.
- Each provider tool currently keeps a separate process-local six-hour cache keyed by sorted,
  normalized search terms, condition, evidence role, and the fixed region `Indonesia`.
  Successful empty searches are cached and return `cache_hit: true` on reuse; provider failures
  are not cached.
- There is no process-local spending or budget abstraction yet. Persistent shared caching,
  rate limits, and spending controls belong in the later API workflow.
- Do not use expired cache data as a hidden fallback when both live providers fail.
