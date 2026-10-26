-- CreateTable
CREATE TABLE "ParsedJdCache" (
    "hash" TEXT NOT NULL,
    "parsed" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParsedJdCache_pkey" PRIMARY KEY ("hash")
);

