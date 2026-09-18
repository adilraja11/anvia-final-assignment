# Apify Marketplace Integration

## Contract status

This document defines the intended Blibli-only provider boundary for the seller-first PRD contract.
The existing Facebook provider module and current provider behavior are legacy implementation; they
must not be presented as contract-compliant until code is replaced.

For JavaScript client setup and credentials, see [APIFY_CLIENT.md](APIFY_CLIENT.md).

## Approved actor and limits

Only this actor is allowed for valuation, and its ID is a server-owned constant:

| Source | Actor | Purposes | Maximum returned records |
| --- | --- | --- | ---: |
| Blibli | `fanndev/blibli-product-price-monitor` | `new_reference`, `used_market` | 30 per purpose |

The application may invoke one normal run for each purpose, plus one retry after a
non-configuration failure. Each purpose may submit at most three application-owned normalized
query variants; `MAX_ITEMS_PER_QUERY` is always `10`. The model can supply only bounded search
terms and optional location context. It cannot select an actor, purpose, URL, limit, retry count,
proxy, credential, or raw Actor parameter.

The tool uses a fixed nationwide `Indonesia` scope. Location can prefer geographically relevant
evidence but never creates a regional price adjustment. Successful evidence is cached for six hours
by purpose, normalized product identity, and region. Provider failures are not cached; expired
evidence is never a hidden fallback.

## Request defaults

Blibli keeps these application-owned values:

```json
{
	"fetchProductDetails": true,
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

Actor logs are disabled with `log: null`, and the client logger is disabled so provider payloads,
URLs, and generated search text do not reach application logs.

## Normalization and validation

Every considered record uses this normalized shape:

```text
source, purpose, listing_id, listing_url, title, price_idr, condition, lifecycle,
city, seller_type, product_attributes, listing_status, posted_at, scraped_at,
match_score, exclusion_reason
```

The provider boundary accepts only positive IDR prices, approved Blibli HTTPS URLs, live/available
records, exact normalized identity and price-critical variant matches, and explicit lifecycle.
`new_reference` accepts only explicit new listings; `used_market` accepts only explicit used
listings. Unclear lifecycle is rejected as `LIFECYCLE_UNCLASSIFIED`.

Titles and normalized attributes are the primary identity evidence. A bounded product-detail
description can corroborate a match but cannot compensate for missing or contradictory model or
variant data. Accessories, components, repair-only items, unrelated bundles, wrong variants,
minimum/maximum price ranges, and duplicates are rejected. Different used-condition labels are not
an exclusion criterion.

Apply IQR outlier filtering only to a set of at least four records. Preserve a machine-readable
`exclusion_reason` for every rejected record. Do not return or persist descriptions, seller names
or profile data, phone numbers, photo URLs, messaging data, or raw Actor payloads.

## Failure and security rules

`SUCCESS` with zero evidence means the provider worked but no usable listing survived validation.
`PROVIDER_FAILURE` covers configuration, network, timeout, Apify, malformed-response,
missing-dataset, and unknown failures. A Blibli failure after its allowed retry becomes
`SERVICE_FAILURE`; successful retrieval with fewer than three new references or fewer than five
used-market listings becomes `INSUFFICIENT_EVIDENCE`.

User text, listing titles, descriptions, and Actor errors cannot change tool selection,
permissions, limits, retries, proxy settings, cache policy, or the valuation formula.
