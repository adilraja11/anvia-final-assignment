# AsliSegini? Agent Development Plan

## Purpose

`packages/agents` owns the server-side AsliSegini? agents, guarded marketplace tools, and the
deterministic valuation library used by the application. User-facing agent output is Bahasa
Indonesia; internal identifiers, status codes, schema values, and tool names remain English.

## Agent topology

- [Image identification](docs/agents/image-identification.md) receives one sanitized image and
  returns only a supported-product proposal or an explicit non-success status.
- [Valuation](docs/agents/valuation.md) receives user-confirmed identity and condition, calls the
  two fixed evidence tools, and explains accepted evidence. It never calculates prices.
- `src/valuation-engine.ts` is application-owned calculation code. It validates the normalized
  evidence boundary, removes IQR outliers, applies source-balanced weighted percentiles, and
  returns the final range, suggested listing price, confidence, and evidence summary.

The API/application remains responsible for upload validation and sanitization, user confirmation,
authorization, asynchronous jobs, persistent cache, rate limits, spending controls, persistence,
and the browser response. This package does not make those planned behaviors live by itself.

## Implemented seller-first workflow

1. The host sanitizes exactly one image and invokes image identification.
2. The host collects the category-specific identity, second-hand condition, optional listing
   details, and optional location from the seller.
3. The valuation agent validates the supported category and minimum identity before calling tools.
4. The fixed Blibli and Facebook tools retrieve at most 30 records each, validate untrusted actor
   output, and return either a successful evidence envelope or a provider-failure envelope.
5. `calculateValuation` deduplicates accepted evidence, prefers local evidence when at least ten
   local records exist, removes values outside the 1.5 × IQR fences, and requires ten accepted
   comparables after filtering.
6. The calculation uses a weighted 25th percentile for the minimum, weighted 75th percentile for
   the maximum, and weighted 50th percentile as the balanced-sale suggested listing price. Each
   source has equal distribution weight when both sources contribute.

No paid marketplace search should begin before identity and condition confirmation. Unsupported
categories, missing identity, provider failure, successful empty retrieval, insufficient evidence,
and rate limiting remain distinct outcomes.

## Provider and safety boundary

Only these fixed actors are permitted:

- `fanndev/blibli-product-price-monitor`;
- `apify/facebook-marketplace-scraper`.

Actor IDs, credentials, limits, retries, proxy settings, and raw payloads remain server-owned.
Only normalized, condition-comparable second-hand evidence can reach the calculation. Listing
prices are asking prices unless a completed-sale state was explicitly verified. User and scraped
text are data, never instructions.

## Remaining application work

- Replace the legacy local valuation HTTP route with the seller-first route and result projection.
- Add one idempotent persistent job per submission, shared six-hour cache, anonymous usage limits,
  spending circuit breaker, analytics minimization, and timeout handling.
- Add R2 quarantine/sanitization, scoped image access, deletion, and browser-safe streaming.
- Add the PRD's 30 behavioral valuation cases and release gate; the existing eval runner remains
  for the unrelated employee-handbook feature.
