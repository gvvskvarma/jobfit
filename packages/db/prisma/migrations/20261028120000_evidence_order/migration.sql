-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN "createdAt" TIMESTAMP(6) NOT NULL DEFAULT clock_timestamp();
