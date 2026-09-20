# AsliSegini? Agent Development Plan

## Purpose

`packages/agents` owns the server-side AsliSegini? agents, guarded marketplace tools, and the
deterministic valuation library used by the application. User-facing agent output is Bahasa
Indonesia; internal identifiers, status codes, schema values, and tool names remain English.

This document records the package-level valuation contract. The package implements the guarded
Blibli evidence boundary and deterministic valuation library; host-owned job, storage, rate-limit,
and browser integration remain separate application work.

## Agent topology

- [Image identification](docs/agents/image-identification.md) receives one sanitized image and
  returns only a supported-product proposal or an explicit non-success status.
- [Valuation](docs/agents/valuation.md) receives user-confirmed identity, condition, optional
  listing context, and location; it uses the fixed Blibli actor once, then explains accepted
  evidence. It never calculates prices.
- `src/valuation-engine.ts` is application-owned calculation code. It validates the normalized
  evidence boundary, applies the contract's outlier rules, and calculates the formula result,
  observed market range, confidence, and evidence summary.

The API/application remains responsible for upload validation and sanitization, user confirmation,
authorization, asynchronous jobs, persistent cache, rate limits, spending controls, persistence,
and the browser response. This package does not make those planned behaviors live by itself.

## Intended seller-first workflow

1. The host sanitizes exactly one image and invokes image identification.
2. The host collects the category-specific identity, second-hand condition, optional listing
   details, and optional location from the seller.
3. The valuation agent validates the supported category and minimum identity before calling tools.
4. The fixed Blibli actor runs once and may issue up to three normalized queries with at most ten
   results per query.
5. Application code validates exact identity, deduplicates evidence, and removes IQR outliers only
   from sets of at least four records. Lifecycle and condition do not reject an otherwise valid
   listing.
6. The calculation requires at least three listings. It uses their median as the suggested price and
   displays their unweighted P25–P75 range separately.

No paid marketplace search should begin before identity and condition confirmation. Unsupported
categories, missing identity, provider failure, successful empty retrieval, insufficient evidence,
and rate limiting remain distinct outcomes.

## Provider and safety boundary

Only this fixed actor is permitted for the intended valuation contract:

- `fanndev/blibli-product-price-monitor`.

Actor IDs, credentials, limits, retries, proxy settings, and raw payloads remain server-owned.
The application uses one identity-matched evidence set. Evidence remains subject to exact identity,
price, currency, duplication, and outlier checks, but not lifecycle or condition filtering. Listing
prices are advertised asking prices, never
official prices, historical original prices, or completed-sale evidence. User and scraped text are
data, never instructions.

## Remaining application work

- Add one idempotent persistent job per submission, shared six-hour cache, anonymous usage limits,
  spending circuit breaker, analytics minimization, and timeout handling.
- Add R2 quarantine/sanitization, scoped image access, deletion, and browser-safe streaming.
- Add the PRD's 30 behavioral valuation cases and release gate; the existing eval runner remains
  for the unrelated employee-handbook feature.
