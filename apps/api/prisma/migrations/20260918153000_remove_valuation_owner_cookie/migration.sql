-- DropIndex
DROP INDEX "Valuation_ownerId_createdAt_idx";

-- DropIndex
DROP INDEX "Valuation_ownerId_idempotencyKey_key";

-- AlterTable
ALTER TABLE "Valuation" DROP COLUMN "ownerId";

-- CreateIndex
CREATE UNIQUE INDEX "Valuation_idempotencyKey_key" ON "Valuation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Valuation_createdAt_idx" ON "Valuation"("createdAt");
