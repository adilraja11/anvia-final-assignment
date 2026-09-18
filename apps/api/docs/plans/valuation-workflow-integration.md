# Valuation workflow integration plan

Status: proposed MVP; not implemented.

## Goal and references

Turn [brainstorming-idea.md](../brainstorming-idea.md) into one idempotent background valuation,
persist its deterministic result and accepted Blibli evidence, and recover the result by ID after
navigation or refresh. The browser contract is in
[valuation-workflow-api.md](../contracts/valuation-workflow-api.md); the two-model Prisma design is
in [valuation-data-model.md](../contracts/valuation-data-model.md).

## Current state

- `/api/agents/image-identification` and `/api/agents/valuation` are synchronous local-only routes.
- `src/config/queue-connection.ts` already defines the shared queue name and local Redis connection.
- `src/config/queue.ts` already creates the BullMQ producer queue.
- `src/worker.ts` already provides the separate worker-process pattern; its copied example processor
  still needs to be replaced with valuation work.
- Prisma stores Anvia memory but no valuation/evidence data.
- Platform uses labelled mock mode or the local synchronous adapter.

Keep the local routes unchanged. Add the asynchronous MVP under `/api/valuations`.

## Boundaries

- Accept no asking, target, or original price.
- Start paid retrieval only after identity and second-hand condition confirmation.
- Use only `fanndev/blibli-product-price-monitor`; perform at most one live run per MVP valuation.
- AI may identify, normalize, match, and explain. Application code validates evidence and computes
  price, range, count, and confidence.
- Provider failure and insufficient evidence remain distinct; never return fabricated or expired
  evidence as fallback.
- Queue payloads contain only valuation ID and contract version. User/scraped content is data, not
  instructions or authority.
- Local in-memory image transport remains development-only; public use requires the PRD's R2 flow.

## Target flow

1. Identify one sanitized image and let the user confirm product name, condition, and optional
   description.
2. `POST /api/valuations` validates owner, idempotency, and Redis usage controls, then creates
   `Valuation(status=QUEUED)`.
3. Enqueue BullMQ with valuation ID as stable `jobId`; change enqueue failure to `SERVICE_FAILURE`.
4. Worker atomically claims `QUEUED` as `PROCESSING`, validates identity, uses a valid cache hit or
   runs Blibli once, calculates deterministically, obtains a grounded explanation, and commits the
   terminal result plus accepted evidence.
5. Browser polls the valuation, navigates to the ID-based result route, then reads its evidence.

## Storage and runtime design

- `Valuation`: owner/idempotency, confirmed input, coarse status, price/range/confidence,
  explanation/pros/cons/missing fields, timestamps.
- `ValuationEvidence`: accepted listing title, positive IDR price, validated Blibli URL, relation.
- BullMQ: queue state and active stages; Redis: six-hour normalized cache and atomic daily/global
  usage counters; PostgreSQL: coarse status and terminal snapshot.
- Do not add product, attempt, rejected-evidence, cache, usage, upload, or outbox tables in this MVP.
- A bounded timeout task changes stale `PROCESSING` rows to `SERVICE_FAILURE`; it does not repeat
  possibly paid work.

Suggested API layout:

```text
src/config/
├── queue-connection.ts    # shared queue name and Redis connection options
└── queue.ts               # shared Queue producer instance
src/worker.ts              # Worker instance and valuation job processor
src/modules/valuations/
├── router.ts              # POST and scoped GET routes
├── schema.ts              # strict public schemas
├── valuation-service.ts   # owner, idempotency, persistence
├── evidence-service.ts    # cache, validation, accepted evidence
└── runner.ts              # bounded orchestration and calculation called by worker.ts
```

Keep agent/provider construction in `@repo/agents`; authorization, Redis controls, Prisma,
orchestration, and response projection stay in `apps/api`.

### Existing queue pattern

- Keep `ASLI_SEGINI_AGENT_QUEUE_NAME` and `connection` in `config/queue-connection.ts` so producer
  and worker cannot drift to different queues or Redis instances.
- Keep the single `new Queue(...)` producer in `config/queue.ts`. Rename the copied
  `jobApplicationTrackerQueue` export to a valuation-specific name when implementing the workflow.
- Import that queue into the valuation creation service and call `add` only after the `Valuation`
  row commits. Use valuation ID as BullMQ `jobId` and payload `{ valuationId, contractVersion: 1 }`.
- Put `new Worker(...)`, job-data validation, progress updates, and the call to the valuation runner
  in `src/worker.ts`. Do not start the worker from `src/index.ts`.
- Both queue and worker use the same `connection` export. Keep `localhost:16379` for the current
  Docker development setup; validate server-only environment values before deployment.
- Run the API with `pnpm dev:api` and the separate worker with `pnpm worker:dev` from the repository
  root. Add graceful queue/worker shutdown handlers before deployment.

## Delivery sequence

### 1. Contract and Prisma

1. Add strict Zod request/result/evidence/error schemas.
2. Add only `Valuation`, `ValuationEvidence`, three enums, a new migration, and generated client.
3. Implement server-issued owner cookie, owner-scoped reads, `(ownerId, idempotencyKey)` replay, and
   conflict detection by comparing stored request fields.
4. Add explicit response mappers, BigInt conversion, and 24-hour cleanup.

Exit: services represent every terminal outcome without model/provider calls.

### 2. Queue and worker

1. Keep the existing three-file pattern: connection/name in `config/queue-connection.ts`, producer
   in `config/queue.ts`, and processor in `worker.ts`.
2. Replace copied job-application names and sample code with valuation-specific names and job data.
3. Add stable BullMQ job IDs, bounded concurrency, 90-second timeout, graceful shutdown, and atomic
   `QUEUED` → `PROCESSING` claim.
4. Report progress through BullMQ: `VALIDATING_IDENTITY`, `FINDING_COMPARABLES`,
   `CALCULATING_PRICE`, and `PREPARING_EXPLANATION`.
5. Add stale-processing timeout handling; do not automatically retry after paid work may begin.

Exit: duplicate delivery cannot duplicate work; queue/crash outcomes finish safely.

### 3. Valuation orchestration

1. Reject unsupported or incomplete identity before paid retrieval.
2. Add schema-validated Redis cache with six-hour TTL; malformed/expired data is a miss.
3. Run Blibli at most once, validate/deduplicate evidence, and keep accepted rows only.
4. Call `calculateValuation` for median, P25–P75 range, rounding, and confidence.
5. Ask AI only for grounded explanation fields, then transactionally persist evidence and result.

Exit: every outcome is recoverable from PostgreSQL and completed rows are immutable.

### 4. Routes and platform

1. Mount `POST /api/valuations` plus scoped result/evidence `GET` routes without changing chat or
   local agent routes.
2. Enforce request size, allowed origin, five-per-day principal limit, global spending breaker,
   queue health, `Cache-Control: no-store`, and safe errors.
3. Add platform creation/polling/evidence gateway; retain one idempotency key per submission.
4. Route results by opaque valuation ID, render only server fields/progress, and never silently
   replace live failures with mock values.
5. Show required item-only, Blibli advertised-price, and authenticity/ownership/condition notices.

Exit: create → poll → result survives refresh and handles every business outcome intentionally.

### 5. Public image transport

Add private R2 quarantine presigning, signature/size/dimension/animation validation, metadata-
stripping re-encode, scoped sanitized access, immediate original deletion, and 24-hour maximum
sanitized retention. Keep the local multipart adapter development-only.

## Failure rules

- Invalid, unauthorized, rate-limited, unsupported, or incomplete requests make no paid call.
- Enqueue failure, single provider failure, explanation failure, timeout, or stale processing becomes
  `SERVICE_FAILURE` without fabricated fallback.
- Successful retrieval below five accepted listings becomes `INSUFFICIENT_EVIDENCE`.
- A malformed cache entry is discarded; expired cache is never used after provider failure.
- Terminal writes are transactional; a terminal row cannot be overwritten by another worker.

## Verification

Cover strict schemas, owner isolation, replay/conflict/concurrent duplicate creation, duplicate queue
delivery, pre-provider rejection, cache hit/miss/malformed/expiry, single-run limit, provider failure
versus insufficient evidence, deterministic math, evidence URL filtering, timeout/shutdown/queue
failure, cascade deletion, and sensitive-data redaction.

Run:

```sh
pnpm db:generate
pnpm --filter @repo/agents typecheck
pnpm --filter @repo/api typecheck
pnpm --filter @repo/api build
pnpm --filter @repo/platform typecheck
pnpm check
```

Exercise PostgreSQL/Redis locally; run bounded provider/model smoke tests only with approved
credentials.

## MVP release gate

- Ownership, idempotency, usage controls, cleanup, refresh recovery, and double-submit protection
  work as documented.
- At most one paid run occurs per valuation; all numeric fields trace to deterministic code.
- Evidence is normalized/minimized and public responses expose only approved fields.
- R2 replaces local multipart transport before public exposure.
- Required valuation and safety evaluations pass.
- Routes, logs, traces, queue payloads, and analytics expose no secrets, raw images, free text, raw
  provider data, or seller information.
