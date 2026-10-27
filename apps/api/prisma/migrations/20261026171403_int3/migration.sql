-- AlterTable
ALTER TABLE "Asset" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ActivityEvent_userId_receivedAt_idx" ON "ActivityEvent"("userId", "receivedAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_userId_occurredAt_idx" ON "ActivityEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "Enrollment_workspaceId_courseId_createdAt_id_idx" ON "Enrollment"("workspaceId", "courseId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Payment_workspaceId_status_paidAt_idx" ON "Payment"("workspaceId", "status", "paidAt");

-- CreateIndex
CREATE INDEX "Refund_workspaceId_status_completedAt_idx" ON "Refund"("workspaceId", "status", "completedAt");

-- CreateIndex
CREATE INDEX "ReportExport_status_lockedUntil_createdAt_idx" ON "ReportExport"("status", "lockedUntil", "createdAt");
