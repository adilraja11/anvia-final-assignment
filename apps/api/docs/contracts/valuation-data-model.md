# Valuation data-model contract

Status: proposed MVP; not implemented.

This is the smallest useful Prisma model for the
[valuation API](valuation-workflow-api.md). See the
[integration plan](../plans/valuation-workflow-integration.md) for delivery order. These definitions
are additions to `apps/api/prisma/schema.prisma`; existing Anvia memory models remain unchanged.

## Scope

Add only:

1. `Valuation` for confirmed input, coarse job status, and the final summary.
2. `ValuationEvidence` for accepted Blibli listings used by the result.

Do not add separate product, job, attempt, cache, usage, upload, or outbox tables for this MVP.
BullMQ holds active progress; Redis holds the six-hour cache and temporary usage counters; Prisma
holds only data required after processing.

## Proposed Prisma schema

```prisma
enum ProductCondition {
  LIKE_NEW
  GOOD
  FAIR
  DAMAGED
}

enum ValuationStatus {
  QUEUED
  PROCESSING
  VALUATED
  UNSUPPORTED_CATEGORY
  MORE_INFORMATION_REQUIRED
  INSUFFICIENT_EVIDENCE
  SERVICE_FAILURE
}

enum ValuationConfidence {
  HIGH
  MEDIUM
}

model Valuation {
  id             String @id @default(cuid())
  idempotencyKey String @unique @db.VarChar(128)

  productName        String           @db.VarChar(160)
  productCondition   ProductCondition
  productDescription String?          @db.VarChar(2000)
  status             ValuationStatus  @default(QUEUED)

  suggestedListingPriceIdr BigInt?
  marketRangeMinimumIdr    BigInt?
  marketRangeMaximumIdr    BigInt?
  confidence               ValuationConfidence?
  explanation              String?              @db.VarChar(2000)
  pros                     String[]             @default([])
  cons                     String[]             @default([])
  missingFields            String[]             @default([])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  evidence  ValuationEvidence[]

  @@index([createdAt])
  @@index([status])
}

model ValuationEvidence {
  id           String   @id @default(cuid())
  valuationId  String
  productName  String   @db.VarChar(500)
  productPrice BigInt
  productLink  String   @db.VarChar(2048)
  createdAt    DateTime @default(now())

  valuation Valuation @relation(fields: [valuationId], references: [id], onDelete: Cascade)

  @@index([valuationId])
}
```

## Rules and mappings

- The unauthenticated demo lists non-expired valuation summaries through `GET /api/valuations` and
  reads a valuation by its opaque ID for detail. IDs remain short-lived read capabilities, and
  rows older than 24 hours are excluded.
- `idempotencyKey` prevents duplicate submissions when the client supplies the optional
  header. On conflict, compare the three stored product fields: return the existing row when equal,
  otherwise `IDEMPOTENCY_CONFLICT`. The server generates an internal key when the header is absent.
- Conditions map as follows: `Seperti baru` → `LIKE_NEW`, `Baik` → `GOOD`, `Cukup` → `FAIR`, and
  `Rusak` → `DAMAGED`.
- The list response projects the stored `productName`, public `productCondition`, and
  `productDescription` (`null` when absent). The description remains untrusted user-provided data.
- `QUEUED` maps to public state `QUEUED`; `PROCESSING` maps to `RUNNING`; terminal statuses map to
  `COMPLETED` plus the corresponding result status.
- The evidence relation count supplies `acceptedComparableCount`; coverage is always `NATIONAL` in
  this no-location MVP; evidence `createdAt` supplies retrieval time.
- Confidence reason is stable copy selected from `confidence`; terminal `updatedAt` supplies
  completion time; API expiry is `createdAt` plus 24 hours.
- `BigInt` prices must be positive JavaScript-safe integers before explicit conversion to JSON
  numbers. Never serialize Prisma rows directly.
- Store only accepted, deduplicated, schema-validated Blibli links. Do not store seller data,
  photos, descriptions, rejected listings, or raw provider responses.

Add migration `CHECK` constraints requiring positive prices, complete numeric fields for
`VALUATED`, no price/confidence for other statuses, and
`minimum <= suggestedListingPriceIdr <= maximum`.

## Worker and retention behavior

1. Create `QUEUED`, then use the producer from `src/config/queue.ts` to enqueue the valuation ID as
   stable BullMQ `jobId`.
2. `src/worker.ts` validates the job payload and atomically changes `QUEUED` to `PROCESSING`; failure
   to claim exits before paid work.
3. `src/worker.ts` reports detailed BullMQ progress and calls the valuation runner. Perform at most
   one live Blibli run.
4. The worker completes by inserting accepted evidence and updating the terminal result in one
   transaction.
5. Mark enqueue failure or stale `PROCESSING` work as `SERVICE_FAILURE`; do not retry possibly paid
   work in this MVP.
6. Delete valuations older than 24 hours; evidence is removed by cascade.

## Deferred

Rejected/outlier history, location coverage, provider-run history, durable retry/outbox recovery,
cache and cost history, upload metadata, and analytics persistence are outside this schema. Do not
claim production-grade auditability or recovery.

## Verification

Run `pnpm db:generate`, create a new migration with `pnpm db:migrate`, then verify opaque-ID and
all-valuation reads, idempotent creation, queue failure, terminal outcomes, BigInt conversion, URL
validation, and cascade deletion. Use explicit Prisma `select` objects and response mappers.
