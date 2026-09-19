-- CreateEnum
CREATE TYPE "ProductCondition" AS ENUM ('LIKE_NEW', 'GOOD', 'FAIR', 'DAMAGED');

-- CreateEnum
CREATE TYPE "ValuationStatus" AS ENUM ('QUEUED', 'PROCESSING', 'VALUATED', 'UNSUPPORTED_CATEGORY', 'MORE_INFORMATION_REQUIRED', 'INSUFFICIENT_EVIDENCE', 'SERVICE_FAILURE');

-- CreateEnum
CREATE TYPE "ValuationConfidence" AS ENUM ('HIGH', 'MEDIUM');

-- CreateTable
CREATE TABLE "Valuation" (
    "id" TEXT NOT NULL,
    "ownerId" VARCHAR(64) NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "productName" VARCHAR(160) NOT NULL,
    "productCondition" "ProductCondition" NOT NULL,
    "productDescription" VARCHAR(2000),
    "status" "ValuationStatus" NOT NULL DEFAULT 'QUEUED',
    "suggestedListingPriceIdr" BIGINT,
    "marketRangeMinimumIdr" BIGINT,
    "marketRangeMaximumIdr" BIGINT,
    "confidence" "ValuationConfidence",
    "explanation" VARCHAR(2000),
    "pros" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "missingFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Valuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValuationEvidence" (
    "id" TEXT NOT NULL,
    "valuationId" TEXT NOT NULL,
    "productName" VARCHAR(500) NOT NULL,
    "productPrice" BIGINT NOT NULL,
    "productLink" VARCHAR(2048) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValuationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Valuation_ownerId_createdAt_idx" ON "Valuation"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Valuation_status_idx" ON "Valuation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Valuation_ownerId_idempotencyKey_key" ON "Valuation"("ownerId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ValuationEvidence_valuationId_idx" ON "ValuationEvidence"("valuationId");

-- AddForeignKey
ALTER TABLE "ValuationEvidence" ADD CONSTRAINT "ValuationEvidence_valuationId_fkey" FOREIGN KEY ("valuationId") REFERENCES "Valuation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
