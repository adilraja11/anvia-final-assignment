# ADR 002: Blibli depreciation-based valuation

## Status

Accepted

## Context

ADR 001 established a seller-first second-hand electronics MVP using a source-balanced comparable-price distribution from Blibli and Facebook Marketplace. The product contract now needs one Blibli provider, a condition-adjusted suggestion, and a transparent distinction between a current mixed-condition market range and the submitted item's condition.

Blibli listings are advertised asking prices. They cannot be represented as official prices, historical original prices, completed sales, or direct proof of demand. Using the same advertised-price sample for both the formula's base price and market adjustment would algebraically cancel depreciation and condition adjustments.

## Decision

Use only `fanndev/blibli-product-price-monitor` for two fixed, application-owned retrieval purposes:

1. `new_reference` retrieves explicitly new, exact-identity listings. The median of at least three accepted records is `P₀`, displayed as **"harga referensi barang baru dari Blibli"**.
2. `used_market` retrieves explicitly used, exact-identity listings. The median supplies the bounded market adjustment `M`, while its unweighted P25–P75 range is displayed separately as a mixed-condition current market range.

The application calculates `Price_suggested = P₀ × (1 − d)^t × C × M × L`. `L` is fixed at `1.0`; category depreciation rates and condition multipliers are versioned application configuration. Age comes from an optional purchase month/year or age band, otherwise a disclosed category default. The language model may identify, normalize, match, classify, and explain but may not choose calculation inputs, alter the formula, or calculate the final price.

Used listings remain subject to exact identity, explicit lifecycle, price, currency, duplication, and outlier validation. They are not rejected solely because their used-condition category differs from the seller-confirmed condition.

## Consequences

Facebook Marketplace is not a valuation evidence provider in the intended contract. A Blibli failure after retry yields `SERVICE_FAILURE`; a successful Blibli retrieval with fewer than three new references or five used-market listings yields `INSUFFICIENT_EVIDENCE`. `HIGH` confidence requires at least 15 used-market listings; five through 14 is `MEDIUM`, and a default-age valuation is capped at `MEDIUM`.

The contract now supports computers, handphones, tablets, gaming consoles, and cameras. It does not claim that the current client mock, legacy API route, or existing agent/provider implementation has yet adopted this contract.
