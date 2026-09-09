CREATE TABLE "AgentMemorySession" (
    "id" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMemorySession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentMemoryMessage" (
    "id" TEXT NOT NULL,
    "memorySessionId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "turn" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "message" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMemoryMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentMemoryError" (
    "id" TEXT NOT NULL,
    "memorySessionId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "error" JSONB NOT NULL,
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMemoryError_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentMemorySession_scopeKey_key" ON "AgentMemorySession"("scopeKey");
CREATE INDEX "AgentMemorySession_sessionId_userId_idx" ON "AgentMemorySession"("sessionId", "userId");
CREATE INDEX "AgentMemoryMessage_runId_idx" ON "AgentMemoryMessage"("runId");
CREATE UNIQUE INDEX "AgentMemoryMessage_memorySessionId_position_key" ON "AgentMemoryMessage"("memorySessionId", "position");
CREATE INDEX "AgentMemoryError_runId_idx" ON "AgentMemoryError"("runId");

ALTER TABLE "AgentMemoryMessage"
ADD CONSTRAINT "AgentMemoryMessage_memorySessionId_fkey"
FOREIGN KEY ("memorySessionId") REFERENCES "AgentMemorySession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentMemoryError"
ADD CONSTRAINT "AgentMemoryError_memorySessionId_fkey"
FOREIGN KEY ("memorySessionId") REFERENCES "AgentMemorySession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
