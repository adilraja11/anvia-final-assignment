# AsliSegini? platform

This package is the React, Vite, TanStack Router, and Tailwind user interface for AsliSegini?. The
product is intended for people in Indonesia who want to list second-hand electronics that they own
on an online marketplace.

## Current implementation boundary

The interface is a Bahasa Indonesia prototype with two explicit modes. It defaults to visibly
labelled deterministic mock data. During local Vite development only, it can call the synchronous
agent-stage API through a same-origin proxy. It does not write browser storage, and it never uses
mock evidence as a fallback when the local provider fails.

The intended flow lets a seller confirm a product's identity, second-hand condition, details, and
optional listing location. It does not ask for an asking or original price. A completed live result
will show a server-calculated median-based suggested price and separately labeled **"Rentang harga
pasar saat ini di Blibli"**, with confidence and Blibli evidence disclosure.

The browser never calculates or invents the market range, suggested listing price, confidence, or
marketplace evidence. The current API agent-stage routes are local-only endpoints; they are not the
public product API for this flow. Local results expose evidence IDs and summary metadata only, so
the interface does not add representative listing details to those results.

## Commands

Run commands from the repository root:

```sh
pnpm dev:platform
pnpm --filter @repo/platform typecheck
pnpm --filter @repo/platform build
```

## Development

Mock mode needs no configuration. To exercise the local adapter, set this in the root `.env` and
run `pnpm dev` so both the API and platform are available:

```sh
VITE_VALUATION_MODE=local-api
```

The local adapter always uses relative `/api/agents/*` paths. It cannot be selected by a production
build and does not accept a configurable public API base URL.

Read [DEVELOPMENT.md](DEVELOPMENT.md) before changing the journey, integration state, or
user-facing copy. It defines the mock-data boundary, required outcome states, and live-integration
guardrails. Route files live in `src/routes/`; generate the TanStack Router tree after adding or
renaming a route:

```sh
pnpm --filter @repo/platform generate-routes
```
