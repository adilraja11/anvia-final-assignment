# AsliSegini? platform

This package is the React, Vite, TanStack Router, and Tailwind user interface for AsliSegini?. The
product is intended for people in Indonesia who want to list second-hand electronics that they own
on an online marketplace.

## Current implementation boundary

The interface is a Bahasa Indonesia, client-only prototype. It uses local state and visibly labeled
deterministic mock data; it does not make API or marketplace requests, upload files to a server, or
write browser storage. It must not present mock evidence as live market data or as a fallback when a
live provider fails.

The intended flow lets a seller confirm a product's identity, second-hand condition, optional
details, and optional listing location. It does not ask for an asking price. A completed live result
will show a server-calculated 25th–75th percentile listing-price range and a weighted-median
suggested listing price for a balanced sale, with confidence and evidence disclosure.

The browser never calculates or invents the range, suggested listing price, confidence, or
marketplace evidence. The current API agent-stage routes are also legacy local-only endpoints; they
are not the product API for this flow.

## Commands

Run commands from the repository root:

```sh
pnpm dev:platform
pnpm --filter @repo/platform typecheck
pnpm --filter @repo/platform build
```

## Development

Read [DEVELOPMENT.md](DEVELOPMENT.md) before changing the journey, integration state, or
user-facing copy. It defines the mock-data boundary, required outcome states, and live-integration
guardrails. Route files live in `src/routes/`; generate the TanStack Router tree after adding or
renaming a route:

```sh
pnpm --filter @repo/platform generate-routes
```
