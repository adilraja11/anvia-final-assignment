# Apify Marketplace Integration

This document defines the current provider boundary for the seller-first AsliSegini? workflow.
The application may invoke at most one bounded run for each provider, plus one retry after a
non-configuration failure. Provider output is untrusted and is never returned or persisted as a
raw Actor response.

For JavaScript client setup and credentials, see [APIFY_CLIENT.md](APIFY_CLIENT.md).

## Approved actors and limits

Only these actor IDs are allowed, and the IDs are constants in the tool implementations:

| Source | Actor | Maximum returned records |
| --- | --- | ---: |
| Blibli | `fanndev/blibli-product-price-monitor` | 30 |
| Facebook Marketplace | `apify/facebook-marketplace-scraper` | 30 |

The model supplies only bounded search terms, the confirmed second-hand condition, and optional
location context. It cannot select an actor, URL, limit, retry count, proxy, credential, or raw
Actor parameter. The tools use a fixed nationwide `Indonesia` scope. Location helps the application
prefer local evidence; it never creates a regional price adjustment.

Blibli submits at most three search terms at ten items per term. Facebook submits the first term
with a 30-item run limit. Both clients use one API retry and both tool boundaries permit one
additional Actor call after a non-configuration failure. Successful empty retrieval is cached for
six hours; provider failures are not cached and expired evidence is never a hidden fallback.

## Request defaults

Blibli keeps these application-owned values:

```json
{
	"fetchProductDetails": false,
	"includeOutOfStock": true,
	"maxItemsPerQuery": 10,
	"sortBy": "relevance",
	"maxConcurrency": 8,
	"proxyConfiguration": {
		"useApifyProxy": true,
		"apifyProxyGroups": ["RESIDENTIAL"],
		"apifyProxyCountry": "ID"
	}
}
```

Facebook uses the fixed `Indonesia` location, details enabled, photos disabled, one page, and no
Apify proxy. Actor logs are disabled with `log: null`, and the client logger is disabled so
provider payloads, URLs, and generated search text do not reach application logs.

## Normalization and validation

Every accepted comparable uses:

```text
source, listing_id, listing_url, title, price_idr, condition, city,
seller_type, product_attributes, listing_status, posted_at, scraped_at,
match_score
```

The implementation accepts only positive IDR item prices, HTTPS URLs on the approved marketplace
domains, live/available listings, exact or condition-compatible second-hand evidence, and titles
that match the normalized identity terms. Accessories, components, repair-only items, bundles,
wrong variants, minimum/maximum price ranges, duplicate listings, and non-Indonesian Facebook
locations are rejected. Every rejected record has only a provider listing ID when available and a
machine-readable `exclusion_reason`.

Blibli does not expose a reliable condition field, so its title must explicitly identify a used
condition. A listing that only looks like an available retail product is rejected. Facebook uses
condition fields under `attribute_data`, with a title fallback only when the title itself clearly
states a second-hand condition. `Tidak diketahui` accepts multiple explicit used-condition labels
but never new or unclassified retail evidence.

The normalized result distinguishes:

- `SUCCESS` with zero evidence: the provider worked but no usable listing survived validation;
- `SUCCESS` with accepted and rejected records; and
- `PROVIDER_FAILURE`: configuration, network, timeout, Apify, malformed-response, missing-dataset,
  or unknown failure.

No result may contain credentials, seller names or profile data, phone numbers, photo URLs,
messaging data, descriptions, or raw Actor payloads.

## Failure and security rules

Provider failures remain separate from insufficient evidence. If both providers fail, application
orchestration returns `SERVICE_FAILURE`; if providers work but fewer than ten comparables survive,
the calculation returns `INSUFFICIENT_EVIDENCE`. A single provider failure may still produce a
`MEDIUM` result when the other provider supplies at least ten accepted comparables.

User text, listing titles, descriptions, and Actor errors cannot change tool selection, permissions,
limits, retries, proxy settings, cache policy, or the valuation formula.
