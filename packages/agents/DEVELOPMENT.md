# AsliSegini? Agent Development Plan

## Purpose

`packages/agents` owns the server-side agents used by AsliSegini?, an Indonesian marketplace
listing-price recommendation product for individual sellers of second-hand electronics. User-facing
agent output is Bahasa Indonesia; internal identifiers, status codes, schema values, and tool names
may remain English.

## Agent topology

The agents have separate interfaces and responsibilities:

- [Image identification](docs/agents/image-identification.md) receives one sanitized image,
  validates MVP category support, and proposes only an identifiable supported product name.
- [Valuation](docs/agents/valuation.md) receives user-confirmed identity, retrieves guarded
  marketplace evidence, and explains accepted evidence. It does not calculate a price.

The application owns upload validation, image sanitization, user confirmation, authorization,
job orchestration, evidence validation, filtering, deterministic valuation, persistence, and
the browser response. Agents may identify, normalize, match, and explain; they are never the
authority for final numeric results.

## Workflow

1. Application code sanitizes one product image and invokes the image-identification agent.
2. The user confirms the proposed identity and supplies the required second-hand condition and any
   relevant listing details.
3. Guarded application/tool code retrieves, validates, filters, and deduplicates evidence.
4. Application code calculates the frozen listing-price range and suggested listing price.
5. The valuation agent explains that calculation and its accepted evidence.

No paid marketplace search begins until the user confirms the minimum price-critical identity.
`UNSUPPORTED_CATEGORY`, `MORE_INFORMATION_REQUIRED`, provider failure, successful empty
retrieval, and insufficient evidence remain distinct outcomes.

## Documentation routing

Read the focused agent document before changing its agent or its prompt-level contract. For
provider request configuration, normalization, validation, retry, or caching, also read
[APIFY_INTEGRATION.md](APIFY_INTEGRATION.md). Read [APIFY_CLIENT.md](APIFY_CLIENT.md) only when
changing client setup or credential handling.

## Current implementation state

The valuation agent, its two marketplace tools, and Studio registration are implemented, but their
legacy input and provider contract does not yet comply with the seller-first PRD. In particular, it
still accepts an asking price, uses the Blibli actor in a legacy retail-anchor configuration, and
uses a different Facebook actor. Do not represent that stage as the product workflow or as
PRD-compliant evidence retrieval. The image-identification agent
factory, image-only prompt helper, and result schema are implemented.
Studio registers an image-agent preview that returns the same JSON as text because Studio accepts
string-output agents only; application integration uses the schema-validated structured mode.
Image upload, API transport, storage, user confirmation, and UI integration are not live. Do not
represent those planned behaviors as implemented.

## Deferred work

- Seller-first user confirmation workflow between identification and valuation, without an asking-price field.
- Deterministic listing-price engine and final numeric result schema: a weighted 25th–75th percentile
  range and a weighted-median suggested price for a balanced sale.
- Replacement of the legacy Blibli configuration and Facebook integration with PRD-compliant
  second-hand evidence retrieval.
- Asynchronous idempotent jobs, persistent cache, rate limits, and spending circuit breaker.
- R2 image upload/sanitization and application UI integration.
- Automated behavioral eval expansion and release gates.
