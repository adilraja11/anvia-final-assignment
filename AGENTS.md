# AGENTS.md

## Repository map

pnpm 11 workspace for the AsliSegini? demo:

- `packages/agents` owns server-side agent, provider, retrieval, and evaluation code.
- `apps/api` owns the Hono API and Prisma-backed chat memory.
- `apps/platform` is the React/Vite user interface.

Run workspace commands from this directory. The root `.env` is the single local configuration source; use `.env.example` for variable names and keep secret values out of source, fixtures, logs, and documentation.

## Markdown naming and routing

- Reserve `AGENTS.md` for scoped instructions that an agent must follow while changing files in that directory or its descendants. Reserve `README.md` for orienting readers to a directory.
- Name repository- or package-wide governing documents in uppercase words joined by underscores, such as `PRD_TECHNICAL.md` and `APIFY_INTEGRATION.md`.
- Name focused reference documents in lowercase kebab-case and group them by topic, for example `docs/agents/image-identification.md` and `docs/contracts/product-identity.md`.
- Give each document one concern. Split by the work branch that needs different rules, rather than by a line-count threshold; keep cross-cutting rules in the nearest `AGENTS.md` and link to focused documents.
- When a focused document is required for a kind of change, add a relative link and its exact trigger to the nearest `AGENTS.md`. Do not rely on its filename alone for discovery.

## Product and implementation context

For a change to the intended valuation workflow, read [PRD.md](PRD.md) and [PRD_TECHNICAL.md](PRD_TECHNICAL.md) first. They define the product contract: application code validates evidence and calculates prices; AI can identify, normalize, match, and explain but never supplies the final calculation.

The platform is currently a labeled, client-only mock and the API currently exposes chat/memory routes. Treat that implemented boundary as real: keep mock data visibly mock, and do not represent planned upload, job, valuation, storage, or marketplace behavior as live until its server contract exists.

For an Anvia runtime, streaming, evaluation, or retrieval change, read only the matching guide before changing code:

- Agent, tool, MCP, or memory work: [ANVIA_AGENTS.md](ANVIA_AGENTS.md).
- Browser/server streaming work: [ANVIA_APPS.md](ANVIA_APPS.md).
- Evaluation or tracing work: [ANVIA_EVALS.md](ANVIA_EVALS.md).
- RAG or handbook retrieval work: [ANVIA_RAG.md](ANVIA_RAG.md).

## Working conventions

- Use `pnpm`; workspace package names are `@repo/agents`, `@repo/api`, and `@repo/platform`.
- Use tabs and let Biome format TypeScript, TSX, JSON, and Markdown. Run `pnpm check` for repository-wide formatting/linting; use `pnpm check:fix` only when formatting edits are intended.
- Verify the affected package with its `typecheck` script. Run `pnpm build` when changing package exports, build configuration, or cross-workspace contracts.
- Prefer the root scripts for local services: `pnpm dev`, `pnpm dev:platform`, `pnpm dev:api`, `pnpm db:generate`, and `pnpm db:migrate`.
- Do not hand-edit generated output: `apps/platform/src/routeTree.gen.ts` comes from TanStack Router, and `apps/api/src/generated/prisma/` comes from Prisma. Change their inputs, then regenerate.

Each subproject has additional instructions in its own `AGENTS.md`; read the nearest one before editing that subproject.
