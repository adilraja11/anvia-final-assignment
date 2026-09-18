# AGENTS.md

## Scope

This is the React 19, Vite, TanStack Router, and Tailwind interface for AsliSegini?. Routes live in `src/routes/`; the valuation UI currently lives in `src/modules/valuation/valuation-experience.tsx`.

Read [DEVELOPMENT.md](DEVELOPMENT.md) before changing the valuation journey, integration state, or user-facing copy. It records the current boundary: this is a Bahasa Indonesia, client-only prototype using local state and deterministic mock data—no API calls, uploads, browser storage, or marketplace requests are live.

## Markdown naming and routing

Follow the repository [Markdown naming and routing policy](../../AGENTS.md#markdown-naming-and-routing). `DEVELOPMENT.md` is this package's governing UI contract; name any focused UI reference in lowercase kebab-case and link it here with the exact UI change that requires it.

## UI contract

- Keep mock data and simulated progress visibly labeled until a live, typed API contract replaces them. Do not use mock evidence as a fallback for live-provider failure.
- Keep user-facing text in Bahasa Indonesia and retain the successful-result limitations required by the development plan: the listing-price recommendation covers item price only, and authenticity, ownership, transaction safety, and hidden physical condition are not verified.
- The browser renders the server-calculated condition-adjusted suggestion, separately labeled mixed-condition Blibli market range, confidence, and evidence; it does not calculate or invent any of them.
- Use native labels and keyboard-accessible controls, and preserve focus/error behavior when editing the multi-step flow.

## Routes and verification

TanStack Router generates `src/routeTree.gen.ts`. Add or rename route files under `src/routes/`, run `pnpm --filter @repo/platform generate-routes`, and do not manually edit the generated tree.

Run `pnpm --filter @repo/platform typecheck` after TypeScript or TSX changes. Run `pnpm --filter @repo/platform build` when changing routing or Vite integration, and `pnpm dev:platform` for a manual browser check.
