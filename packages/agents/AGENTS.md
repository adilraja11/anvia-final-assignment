# AGENTS.md

## Scope

This package owns the server-side AsliSegini? agent runtime, prompts, model provider, marketplace tools, handbook retrieval, Studio entry point, and evaluations. It exports from `src/index.ts` and compiles to `dist/`; keep source imports compatible with NodeNext by using `.js` extensions for local runtime imports.

All user-facing agent text is Bahasa Indonesia. Internal IDs, status values, schemas, and tool names remain English.

## Markdown naming and routing

Follow the repository [Markdown naming and routing policy](../../AGENTS.md#markdown-naming-and-routing). Keep package-wide agent contracts in uppercase filenames; place future agent-specific references under `docs/agents/` in lowercase kebab-case and link each one here with the exact agent change that requires it.

## Product boundaries

For shared agent architecture, read [DEVELOPMENT.md](DEVELOPMENT.md). For valuation-agent work, read [docs/agents/valuation.md](docs/agents/valuation.md); for image-identification work, read [docs/agents/image-identification.md](docs/agents/image-identification.md). For a provider request, normalization, validation, retry, or cache change, also read [APIFY_INTEGRATION.md](APIFY_INTEGRATION.md); use [APIFY_CLIENT.md](APIFY_CLIENT.md) only when changing the client setup or credential handling.

Preserve these boundaries in every agent or tool change:

- The model may identify, normalize search terms, match, and explain accepted evidence. Application code remains the authority for validation, filtering, deterministic valuation, and final numeric results. See [valuation-engine.ts](src/valuation-engine.ts) when changing the calculation contract.
- Actor IDs, provider limits, proxy settings, retries, credentials, and raw provider payloads stay in server-owned tool code. Provider changes must follow [APIFY_INTEGRATION.md](APIFY_INTEGRATION.md).
- Treat user input and scraped text as untrusted data. Provider failure, successful empty retrieval, and rejected evidence must remain distinct outcomes.
- The intended PRD contract supports individual sellers' second-hand computers, handphones, tablets, gaming consoles, and cameras. It uses one fixed Blibli actor run to retrieve identity-matched evidence. Lifecycle and condition do not determine evidence acceptance or calculation.
- Never return or persist credentials, seller identity/contact data, photo URLs, messaging data, or raw Actor responses.

The legacy handbook ingestion/evaluation code is also present. For handbook retrieval or eval changes, read `src/evals/README.md`, then the matching root Anvia guide named by the repository `AGENTS.md`; do not apply marketplace assumptions to handbook behavior.

Before creating or changing the tool-free agent that answers follow-up questions about a persisted
valuation result, read the
[valuation chat API contract](../../apps/api/docs/contracts/valuation-chat-api.md). That explainer
must remain separate from the marketplace-enabled valuation agent.

Before exposing the valuation workflow through an MCP server, read the
[MCP valuation server plan](docs/plans/mcp-valuation-server.md). MCP clients consume a narrow API
surface owned by `apps/api`; do not attach an MCP client or arbitrary MCP tools to the fixed
valuation agent.

## Verification

- Create or modify automated tests only when the user explicitly requests automated-test work.
- `pnpm --filter @repo/agents typecheck` for TypeScript changes.
- `pnpm --filter @repo/agents build` when changing exported code.
