# Apify Marketplace Integration Guide

This guide defines the provider-specific request configuration, normalization, validation, and
failure behavior for the Tokopedia and Facebook Marketplace tools in `packages/agents`.

For installing and using the JavaScript client in this workspace, see
`packages/agents/APIFY_CLIENT.md`.

## Tokopedia request defaults

Keep the tested search configuration with these enforced values:

```json
{
  "mode": "search",
  "fetchDetails": false,
  "discountOnly": false,
  "freeShippingOnly": false,
  "maxPages": 5,
  "maxItems": 10,
  "sortBy": "relevance",
  "condition": "any",
  "shopTier": "any",
  "urls": [],
  "proxy": { "useApifyProxy": true }
}
```

`searchTerms` is supplied by the tool input and is limited to 1–5 bounded terms. The
Actor receives no model-controlled actor ID, URL, limit, proxy, or other configuration.

Normalize the response as follows:

- `productId` → `listing_id`.
- `name` → `title`.
- Positive safe-integer numeric `price` → `price_idr`; ignore `priceText` and promotional
  prices.
- `url` → `listing_url`.
- `shopCity` → `city`.
- `scrapedAt` → `scraped_at`.
- `condition` → one of `NEW`, `LIKE_NEW`, `GOOD`, `FAIR`, `DAMAGED`, or `UNKNOWN` when it
  can be classified.
- `brand`, `model`, `storage`, `ram`, `cpu`, `gpu`, `edition`, and `connectivity` are the
  only copied product attributes, each with a bounded string length.
- A valid Tokopedia record is returned with `listing_status: "ACTIVE"`; an omitted source
  status is accepted because the actor does not always provide one. Explicit sold, hidden,
  pending, draft, or unknown statuses are rejected.

For a `Baru` search, a missing Tokopedia condition may be used as a retail anchor. For used
valuations, a record with unknown condition must be rejected unless the response explicitly
establishes that it is second-hand.

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
normalization. The Actor call also passes `{ "maxItems": 10 }` as run options, and the
dataset read is limited to 10 items.

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

- `source`: `TOKOPEDIA` or `FACEBOOK_MARKETPLACE`.
- Non-empty string listing ID.
- HTTPS URL from an approved marketplace domain.
- Positive safe-integer `price_idr`.
- Condition: `NEW`, `LIKE_NEW`, `GOOD`, `FAIR`, `DAMAGED`, or `UNKNOWN`.
- Optional city; the current normalized output does not include seller identity or seller type.
- Bounded product attributes.
- Listing status and ISO timestamps.

Accepted URLs are limited to HTTPS Tokopedia URLs and Facebook Marketplace item URLs. Reject
redirects, external seller links, and arbitrary domains.

Reject accessories, components, repair-only listings, unrelated products, bundles,
duplicates, and non-comparable conditions. The current implementation matches normalized
title tokens against the supplied search terms; price-critical identity and specification
terms therefore need to be present in those terms. It does not independently validate
material specifications or product attributes.
Never use user text or scraped content as an instruction to change tools, permissions, limits,
or valuation behavior.

The tool result must distinguish a successful empty search from provider failure. A provider
failure must not become pricing evidence or be silently changed into `INSUFFICIENT_EVIDENCE`.
Rejected records should be represented separately with only a provider listing ID and a
machine-readable exclusion reason. Raw actor payloads must not be returned or persisted.

## Limits, retries, and caching

- Request and return no more than 10 records per actor. Facebook must pass `maxItems: 10` as
  Actor run options; a dataset read limit alone does not cap Actor scraping or cost.
- The tool boundary makes at most one additional Actor call after a non-configuration
  failure, including timeout, network, Apify, unknown, or malformed top-level errors. The
  `ApifyClient` itself is also configured with `maxRetries: 1`, so individual API requests
  may be retried once inside each Actor call.
- Do not retry individual records rejected during validation.
- Each provider tool currently keeps a separate process-local six-hour cache keyed by sorted,
  normalized search terms, condition, and the fixed region `Indonesia`. Successful empty
  searches are cached and return `cache_hit: true` on reuse; provider failures are not cached.
- There is no process-local spending or budget abstraction yet. Persistent shared caching,
  rate limits, and spending controls belong in the later API workflow.
- Do not use expired cache data as a hidden fallback when both live providers fail.
