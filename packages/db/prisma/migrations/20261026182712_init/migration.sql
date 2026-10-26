-- pgvector for Evidence.embedding
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "VisaStatus" AS ENUM ('H1B', 'OPT', 'STEM_OPT', 'L1', 'GC_PENDING', 'CITIZEN_OR_GC', 'OTHER');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SkillStatus" AS ENUM ('CONFIRMED', 'DENIED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('BULLET', 'PROJECT', 'ACHIEVEMENT', 'CERT', 'EDUCATION');

-- CreateEnum
CREATE TYPE "AppStatus" AS ENUM ('DRAFT', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'NO_RESPONSE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DraftKind" AS ENUM ('APPLICATION_ANSWERS', 'COVER_LETTER', 'RECRUITER_NOTE', 'REFERRAL_ASK', 'INTERVIEW_PREP');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "visaStatus" "VisaStatus",
    "authEndDate" TIMESTAMP(3),
    "bannedWords" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" "Role" NOT NULL DEFAULT 'USER',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentGap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3),

    CONSTRAINT "EmploymentGap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SkillStatus" NOT NULL,
    "context" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "company" TEXT,
    "project" TEXT,
    "text" TEXT NOT NULL,
    "tags" TEXT[],
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "embedding" vector(384),

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPosting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT,
    "company" TEXT,
    "title" TEXT,
    "rawText" TEXT NOT NULL,
    "parsed" JSONB,
    "screening" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobPostingId" TEXT,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" "AppStatus" NOT NULL DEFAULT 'DRAFT',
    "callback" BOOLEAN NOT NULL DEFAULT false,
    "matchScore" INTEGER,
    "resumeVersionId" TEXT,
    "notes" TEXT,
    "appliedAt" TIMESTAMP(3),
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeVersion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT,
    "content" JSONB NOT NULL,
    "docxKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT,
    "kind" "DraftKind" NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "meta" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestEvent" (
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestEvent_pkey" PRIMARY KEY ("idempotencyKey")
);

-- CreateTable
CREATE TABLE "Employer" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "normalizedName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "aliases" TEXT[],
    "naics" TEXT,
    "capExemptHint" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Employer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployerYearStats" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "employerId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "lcaCertified" INTEGER NOT NULL,
    "lcaTotal" INTEGER NOT NULL,
    "changeEmployer" INTEGER NOT NULL,
    "newEmployment" INTEGER NOT NULL,
    "h1bDependent" BOOLEAN NOT NULL,
    "willfulViolator" BOOLEAN NOT NULL,
    "uscisInitialApprovals" INTEGER,
    "uscisInitialDenials" INTEGER,
    "uscisContinuingApprovals" INTEGER,
    "uscisContinuingDenials" INTEGER,
    "permTotal" INTEGER,
    "permCertified" INTEGER,

    CONSTRAINT "EmployerYearStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WageBand" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "employerId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "socCode" TEXT NOT NULL,
    "titleBucket" TEXT NOT NULL,
    "worksiteState" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "changeEmployer" INTEGER NOT NULL,
    "p25" INTEGER,
    "median" INTEGER,
    "p75" INTEGER,

    CONSTRAINT "WageBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetVersion" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "source" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "loadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "EmploymentGap_userId_idx" ON "EmploymentGap"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_userId_name_key" ON "Skill"("userId", "name");

-- CreateIndex
CREATE INDEX "Evidence_userId_idx" ON "Evidence"("userId");

-- CreateIndex
CREATE INDEX "JobPosting_userId_idx" ON "JobPosting"("userId");

-- CreateIndex
CREATE INDEX "Application_userId_nextActionAt_idx" ON "Application"("userId", "nextActionAt");

-- CreateIndex
CREATE INDEX "ResumeVersion_userId_idx" ON "ResumeVersion"("userId");

-- CreateIndex
CREATE INDEX "Draft_userId_idx" ON "Draft"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Employer_normalizedName_key" ON "Employer"("normalizedName");

-- CreateIndex
CREATE INDEX "Employer_displayName_idx" ON "Employer"("displayName");

-- CreateIndex
CREATE UNIQUE INDEX "EmployerYearStats_employerId_fiscalYear_key" ON "EmployerYearStats"("employerId", "fiscalYear");

-- CreateIndex
CREATE INDEX "WageBand_titleBucket_worksiteState_fiscalYear_idx" ON "WageBand"("titleBucket", "worksiteState", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "WageBand_employerId_fiscalYear_socCode_titleBucket_worksite_key" ON "WageBand"("employerId", "fiscalYear", "socCode", "titleBucket", "worksiteState");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetVersion_source_fiscalYear_key" ON "DatasetVersion"("source", "fiscalYear");

-- AddForeignKey
ALTER TABLE "EmploymentGap" ADD CONSTRAINT "EmploymentGap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployerYearStats" ADD CONSTRAINT "EmployerYearStats_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WageBand" ADD CONSTRAINT "WageBand_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

