-- CreateEnum
CREATE TYPE "BlastJobStatus" AS ENUM ('in_progress', 'completed', 'failed', 'paused');

-- CreateEnum
CREATE TYPE "BlastCategory" AS ENUM ('reminder', 'promo', 'announcement', 'custom');

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "payment_method" DROP DEFAULT;

-- CreateTable
CREATE TABLE "blast_jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "category" "BlastCategory" NOT NULL,
    "inactivity_period" TEXT,
    "message" TEXT NOT NULL,
    "status" "BlastJobStatus" NOT NULL DEFAULT 'in_progress',
    "total_recipients" INTEGER NOT NULL,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "last_sent_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "blast_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blast_job_failures" (
    "id" TEXT NOT NULL,
    "blast_job_id" TEXT NOT NULL,
    "member_name" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "failed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blast_job_failures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blast_jobs_tenant_id_created_at_idx" ON "blast_jobs"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "blast_jobs" ADD CONSTRAINT "blast_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_job_failures" ADD CONSTRAINT "blast_job_failures_blast_job_id_fkey" FOREIGN KEY ("blast_job_id") REFERENCES "blast_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
