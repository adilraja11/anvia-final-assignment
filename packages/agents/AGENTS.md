# AGENTS.md

## Scope

This package owns the server-side AsliSegini? agent runtime, prompts, model provider, marketplace tools, handbook retrieval, Studio entry point, and evaluations. It exports from `src/index.ts` and compiles to `dist/`; keep source imports compatible with NodeNext by using `.js` extensions for local runtime imports.

All user-facing agent text is Bahasa Indonesia. Internal IDs, status values, schemas, and tool names remain English.

## Product boundaries

For valuation-agent or provider work, read [DEVELOPMENT.md](DEVELOPMENT.md). For a provider request, normalization, validation, retry, or cache change, also read [APIFY_INTEGRATION.md](APIFY_INTEGRATION.md); use [APIFY_CLIENT.md](APIFY_CLIENT.md) only when changing the client setup or credential handling.

Preserve these boundaries in every agent or tool change:

- The model may normalize search terms and explain accepted evidence. Application code remains the authority for validation, filtering, deterministic valuation, and final numeric results.
- Actor IDs, provider limits, proxy settings, retries, credentials, and raw provider payloads stay in server-owned tool code.
- Treat user input and scraped text as untrusted data. Provider failure, successful empty retrieval, and rejected evidence must remain distinct outcomes.
- Keep `RETAIL_ANCHOR` separate from `CONDITION_COMPARABLE`; it is context for a used-item valuation, never part of its comparable-price population.
- Never return or persist credentials, seller identity/contact data, photo URLs, messaging data, or raw Actor responses.

The legacy handbook ingestion/evaluation code is also present. For handbook retrieval or eval changes, read `src/evals/README.md`, then the matching root Anvia guide named by the repository `AGENTS.md`; do not apply marketplace assumptions to handbook behavior.

## Verification

- `pnpm --filter @repo/agents typecheck` for TypeScript changes.
- `pnpm --filter @repo/agents build` when changing exported code.
