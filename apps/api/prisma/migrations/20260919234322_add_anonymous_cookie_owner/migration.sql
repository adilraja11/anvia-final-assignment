/*
  Warnings:

  - A unique constraint covering the columns `[ownerKey,idempotencyKey]` on the table `Valuation` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Valuation_createdAt_idx";

-- DropIndex
DROP INDEX "Valuation_idempotencyKey_key";

-- AlterTable
ALTER TABLE "Valuation" ADD COLUMN     "ownerKey" CHAR(64);

-- CreateIndex
CREATE INDEX "Valuation_ownerKey_createdAt_idx" ON "Valuation"("ownerKey", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Valuation_ownerKey_idempotencyKey_key" ON "Valuation"("ownerKey", "idempotencyKey");
