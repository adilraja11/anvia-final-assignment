# AGENTS.md

## Scope

This is the React 19, Vite, TanStack Router, and Tailwind interface for AsliSegini?. Routes live in `src/routes/`; the valuation UI currently lives in `src/modules/valuation/valuation-experience.tsx`.

Read [DEVELOPMENT.md](DEVELOPMENT.md) before changing the valuation journey, integration state, or user-facing copy. It records the current boundary: this is a Bahasa Indonesia, client-only prototype using local state and deterministic mock data—no API calls, uploads, browser storage, or marketplace requests are live.

Before creating or changing the platform-to-agent integration, read the
[valuation integration contract](docs/contract/valuation-integration.md). Before sequencing that
integration work, read the [valuation integration plan](docs/plans/valuation-integration.md).
Those documents distinguish the current local-only API stage from the browser-ready workflow and
must not be used to present either as already live.

Before connecting a platform route or data module to `POST /api/agents/image-identification` or an
implemented `/api/valuations*` endpoint, or changing `src/utils/api.ts` for those routes, read the
[implemented API route contract](docs/contract/api-routes.md). Before sequencing work across that
focused endpoint set, also read the [API route integration plan](docs/plans/api-route-integration.md).
These references describe current source behavior and its local-demo security gaps; they do not
make the routes public-safe.

Before adding or changing the valuation-scoped chat on `/result/$valuationId`, its stream
transport, session restoration, result grounding, or user-facing chat states, read the
[valuation chat integration contract](docs/contract/valuation-chat-integration.md). Before
sequencing that work, also read the
[valuation chat integration plan](docs/plans/valuation-chat-integration.md). The documents describe
a proposed integration and do not make chat live.

Before adding or changing anonymous browser-cookie transport, temporary per-browser history,
cookie bootstrap/retry behavior, or owner-scoped valuation/chat UI states, read the
[anonymous cookie ownership contract](docs/contract/anonymous-cookie-ownership.md). Before
sequencing that work, also read the
[anonymous cookie ownership platform plan](docs/plans/anonymous-cookie-ownership.md).

## Markdown naming and routing

Follow the repository [Markdown naming and routing policy](../../AGENTS.md#markdown-naming-and-routing). `DEVELOPMENT.md` is this package's governing UI contract; name any focused UI reference in lowercase kebab-case and link it here with the exact UI change that requires it.

## UI contract

- Keep mock data and simulated progress visibly labeled until a live, typed API contract replaces them. Do not use mock evidence as a fallback for live-provider failure.
- Keep user-facing text in Bahasa Indonesia and retain the successful-result limitations required by the development plan: the listing-price recommendation covers item price only, and authenticity, ownership, transaction safety, and hidden physical condition are not verified.
- The browser renders the server-calculated median-based suggestion, separately labeled Blibli market range, confidence, and evidence; it does not calculate or invent any of them.
- Use native labels and keyboard-accessible controls, and preserve focus/error behavior when editing the multi-step flow.

## Routes and verification

TanStack Router generates `src/routeTree.gen.ts`. Add or rename route files under `src/routes/`, run `pnpm --filter @repo/platform generate-routes`, and do not manually edit the generated tree.

Run `pnpm --filter @repo/platform typecheck` after TypeScript or TSX changes. Run `pnpm --filter @repo/platform build` when changing routing or Vite integration, and `pnpm dev:platform` for a manual browser check.
