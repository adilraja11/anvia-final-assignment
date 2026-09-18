# ADR 001: Seller-first second-hand MVP

## Status

Accepted

## Context

The original MVP was framed around buyers evaluating another seller's asking price. The product's intended users are instead individuals in Indonesia listing second-hand electronics that they own on online marketplaces.

## Decision

The MVP recommends a listing price for a balanced sale. It supports only second-hand smartphones, laptops, tablets, and gaming consoles. The weighted 25th through 75th percentiles of accepted comparable evidence form the recommended listing-price range, and the weighted median is the suggested listing price.

The seller does not provide an asking or target price. Buyer-oriented verdicts and negotiation targets are not part of the MVP. Blibli and Facebook Marketplace provide evidence only; the product neither publishes listings nor limits where a recommendation can be used.

The intended audience is individual sellers, not stores, resellers, or professional refurbishers. The product does not verify ownership, authenticity, or physical condition.

## Consequences

The condition selector excludes `Baru`. New products and non-supported electronics are outside MVP scope. Deterministic calculation, evidence requirements, confidence rules, privacy controls, and marketplace-source restrictions remain in force.
