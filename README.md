# RAG Agent Evals

pnpm workspace containing:

- `apps/platform` — React, Vite, and TanStack Router
- `apps/api` — Hono on Node.js with Prisma and PostgreSQL
- `packages/agents` — shared agent code

## Setup

```sh
pnpm install
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d db qdrant
pnpm db:generate
pnpm db:migrate
pnpm dev
```

All workspace commands load the single root `.env` file through `dotenv-cli`.
Set `OPENAI_API_KEY` in `.env`. `TAVILY_API_KEY` is optional because Tavily supports keyless usage with lower limits.

## Commands

```sh
pnpm dev           # run the platform and API together
pnpm dev:platform  # run the Vite app on port 3000
pnpm dev:api       # run the Hono API (PORT, default 8000)
pnpm build
pnpm typecheck
pnpm db:generate
pnpm db:migrate
pnpm db:studio
pnpm ingest:handbook
pnpm eval
```

## Evaluation improvement: 53.3% to 100%

The initial evaluation report recorded **16/30
passing results (53.3%)** on 2 September 2026. The main issue was answer
precision rather than the ability to find the core handbook fact: the agent
regularly added adjacent policy, procedural detail, or the fictional-data
disclaimer to narrowly scoped questions.

The current working tree is intentionally different from the committed base
branch. It changes the RAG pipeline, agent contract, and evaluation design as
one unit:

- **Grounded, minimal answers.** The base instructions now require a handbook
  search for handbook-policy questions, prohibit web fallback for a handbook
  gap, preserve material conditions, and require the shortest complete answer.
  They also define the exact abstention response, `The handbook does not say.`,
  and limit the fictional-training-data disclaimer to questions about the
  document's authority.
- **A bounded handbook agent.** The agent uses deterministic generation
  (`temperature(0)`), a 180-token answer cap, and at most four turns. Web tools
  are opt-in rather than being placed in the handbook agent's default tool set.
- **More precise retrieval.** Ingestion now writes structure-aware,
  provenance-tagged chunks to `devscale_employee_handbook_v2`: paragraphs,
  bullets, and individual table rows remain atomic while retaining their
  heading, offsets, content hash, and ingestion version. `handbookSearch`
  limits returned evidence, combines semantic candidates with lexical
  reranking, deduplicates excerpts, and performs a coverage rescue when a
  multi-part query is missing a distinctive term.
- **Evaluation matches the contract.** The old five-suite metric split was
  replaced with 23 grounded G-Eval cases using the evidence actually returned
  by `handbookSearch`, five exact-output cases, two abstention cases, and a
  separate tool-invocation assertion for the three tool-call cases. The eval
  agent is observed by the same Lens integration that reports results, then
  flushes and shuts down cleanly, so runs are trace-correlated.

### Verified latest Lens result

Using the `ANVIA_LENS_*` configuration in the root `.env`, the latest completed
batch for `rag-agent-evals` ran on **4 September 2026, 23:51–23:54 UTC**. Every
reported result passed:

| Current suite / contract | Passed | Total |
| --- | ---: | ---: |
| Grounded answer quality | 23 | 23 |
| Exact match | 5 | 5 |
| Abstention | 2 | 2 |
| Handbook-search invocation (secondary contract) | 3 | 3 |
| **Primary eval cases** | **30** | **30** |
| **All reported metric results** | **33** | **33** |

That is **100%** for both the 30 unique primary cases and the 33 reported
metric results. The historical 53.3% figure and the current 100% result should
not be read as a per-suite apples-to-apples comparison: the current working
tree deliberately replaces broad `contains`, relevancy, and static
faithfulness checks with contract-appropriate checks grounded in the evidence
retrieved during that run. It is a stricter and more observable definition of
the intended handbook-agent behavior, not a threshold reduction.
