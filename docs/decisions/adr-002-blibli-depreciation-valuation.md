# ADR 002: Single-run Blibli median valuation

## Status

Accepted

## Context

ADR 001 established a seller-first second-hand electronics MVP. The product now uses one Blibli
provider run rather than separate lifecycle-specific evidence sets. The actor cannot reliably
classify a listing's lifecycle, so lifecycle and listing condition must not become an acceptance
gate or a source of synthetic certainty.

Blibli listings are advertised asking prices. They cannot be represented as official prices,
historical original prices, completed sales, or direct proof of demand.

## Decision

Use only `fanndev/blibli-product-price-monitor` for one application-owned run per valuation. The
run may submit at most three normalized identity queries and return at most 30 records before
validation. The application accepts only available, exact-identity, positive-IDR listings on
approved Blibli HTTPS URLs, then removes duplicates and IQR outliers when at least four records
exist. Lifecycle and listing condition are not required, inferred, or used to filter evidence.

Require at least five accepted listings. The application calculates the suggested listing price as
their median advertised price and the observed market range as their unweighted P25–P75 range.
Displayed prices use deterministic half-up rounding to the nearest Rp1.000. The language model may
identify, normalize, match, and explain but may not choose calculation inputs, alter the formula,
or calculate the final price.

## Consequences

There is no `new_reference`, `used_market`, `P₀`, depreciation rate, age input, condition
multiplier, market adjustment, or liquidity factor in the valuation calculation. The seller's
condition remains required product context and can be explained, but does not alter the median of
mixed or unknown-condition marketplace evidence.

Facebook Marketplace is not a valuation evidence provider. A Blibli failure after retry yields
`SERVICE_FAILURE`; successful retrieval with fewer than five accepted listings yields
`INSUFFICIENT_EVIDENCE`. `HIGH` confidence requires at least 15 accepted listings; five through
14 is `MEDIUM`.

The contract supports computers, handphones, tablets, gaming consoles, and cameras. It does not
claim that the current client mock or legacy API route implements the full asynchronous public
workflow.
