-- AlterTable
ALTER TABLE "AgentMemorySession" ADD COLUMN     "acceptedUserTurns" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "activeTurnAt" TIMESTAMP(3),
ADD COLUMN     "activeTurnId" TEXT,
ADD COLUMN     "valuationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AgentMemorySession_valuationId_key" ON "AgentMemorySession"("valuationId");

-- CreateIndex
CREATE INDEX "AgentMemorySession_activeTurnAt_idx" ON "AgentMemorySession"("activeTurnAt");

-- AddForeignKey
ALTER TABLE "AgentMemorySession" ADD CONSTRAINT "AgentMemorySession_valuationId_fkey" FOREIGN KEY ("valuationId") REFERENCES "Valuation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
