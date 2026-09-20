# Apify Marketplace Integration

## Contract status

This document defines the Blibli-only provider boundary for the seller-first PRD contract.

For JavaScript client setup and credentials, see [APIFY_CLIENT.md](APIFY_CLIENT.md).

## Approved actor and limits

Only this actor is allowed for valuation, and its ID is a server-owned constant:

| Source | Actor | Maximum returned records |
| --- | --- | ---: |
| Blibli | `fanndev/blibli-product-price-monitor` | 30 per run |

The application may invoke one normal run, plus one retry after a non-configuration failure. A run
may submit at most three application-owned normalized query variants; `MAX_ITEMS_PER_QUERY` is
always `10`. The model can supply only bounded search terms. The host supplies confirmed identity
and optional location context when it constructs the fixed tool. The model cannot select an actor,
URL, limit, retry count, proxy, credential, raw Actor parameter, identity, or location.

The tool uses a fixed nationwide `Indonesia` scope. Location can prefer geographically relevant
evidence from the retrieved set but never creates a regional price adjustment. Successful evidence
is cached for six hours by normalized confirmed product identity and region through a host-owned
cache. Provider failures are not cached; expired evidence is never a hidden fallback.

## Request defaults

Blibli keeps these application-owned values:

```json
{
	"fetchProductDetails": true,
	"includeOutOfStock": false,
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

Actor logs are disabled with `log: null`, and the client logger is disabled so provider payloads,
URLs, and generated search text do not reach application logs. Each actor attempt is bounded to 60
seconds, matching the target valuation completion time. A retry is attempted only after a
non-configuration failure; the job-level deadline remains the final bound.

## Normalization and validation

Every considered record uses this normalized shape:

```text
source, listing_id, listing_url, title, price_idr, condition, city, seller_type,
product_attributes, listing_status, posted_at, scraped_at, match_score, exclusion_reason
```

The provider boundary accepts only positive IDR prices, approved Blibli HTTPS URLs, live/available
records, and exact normalized identity and price-critical variant matches. Lifecycle and condition
are not required for acceptance and must not be inferred or used to filter evidence.

Titles and normalized attributes are the primary identity evidence. The tool checks every available
confirmed text identity field against that evidence; a missing or contradictory field rejects the
record. A bounded product-detail description can corroborate a match but cannot compensate for a
missing or contradictory model or variant. Accessories, components, repair-only items, unrelated
bundles, wrong variants, minimum/maximum price ranges, and duplicates are rejected. Different
used-condition labels are not an exclusion criterion.

Apply IQR outlier filtering only to a set of at least four records. Preserve a machine-readable
`exclusion_reason` for every rejected record. Do not return or persist descriptions, seller names
or profile data, phone numbers, photo URLs, messaging data, or raw Actor payloads.

## Failure and security rules

`SUCCESS` with zero evidence means the provider worked but no usable listing survived validation.
`PROVIDER_FAILURE` covers configuration, network, timeout, Apify, malformed-response,
missing-dataset, and unknown failures. A Blibli failure after its allowed retry becomes
`SERVICE_FAILURE`; successful retrieval with fewer than three accepted listings becomes
`INSUFFICIENT_EVIDENCE`.

User text, listing titles, descriptions, and Actor errors cannot change tool selection,
permissions, limits, retries, proxy settings, cache policy, or the valuation formula.
