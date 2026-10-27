-- Atomic baseline for an empty PostgreSQL 16 database.
BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'INSTRUCTOR', 'TEACHING_ASSISTANT', 'STUDENT');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ANONYMIZED');

-- CreateEnum
CREATE TYPE "WorkspaceKind" AS ENUM ('PERSONAL', 'ACADEMY');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'LEFT');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'UNLISTED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('SELF_PACED', 'COHORT');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('INSTRUCTOR', 'TEACHING_ASSISTANT');

-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('VIDEO', 'DOCUMENT', 'TEXT', 'INTERACTIVE', 'QUIZ', 'ASSIGNMENT', 'EXAM', 'LIVE_SESSION');

-- CreateEnum
CREATE TYPE "ReleaseType" AS ENUM ('IMMEDIATE', 'ABSOLUTE', 'ENROLLMENT_OFFSET', 'COHORT_OFFSET');

-- CreateEnum
CREATE TYPE "CompletionRule" AS ENUM ('VIEW', 'ACKNOWLEDGE', 'WATCH_PERCENT', 'ASSESSMENT_PASS', 'ATTENDANCE');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PENDING_UPLOAD', 'SCANNING', 'READY', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "AssetVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "AssessmentKind" AS ENUM ('QUIZ', 'ASSIGNMENT', 'EXAM');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'NUMERIC', 'ESSAY', 'FILE_UPLOAD', 'MATCHING', 'ORDERING');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "GradePolicy" AS ENUM ('HIGHEST', 'LATEST', 'FIRST');

-- CreateEnum
CREATE TYPE "FeedbackPolicy" AS ENUM ('IMMEDIATE', 'AFTER_DUE', 'AFTER_GRADING', 'NEVER');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADING', 'GRADED', 'VOID');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "GrantSource" AS ENUM ('FREE', 'MANUAL', 'ORDER_ITEM', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('COURSE', 'BUNDLE', 'SUBSCRIPTION_PLAN');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "CouponKind" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED', 'EXPIRED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'UNPAID', 'PAUSED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'DEAD');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('VALID', 'REVOKED');

-- CreateEnum
CREATE TYPE "LiveSessionStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('REGISTERED', 'ATTENDED', 'ABSENT');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "avatarKey" VARCHAR(512),
    "passwordHash" VARCHAR(255),
    "name" VARCHAR(160) NOT NULL,
    "platformRole" "Role" NOT NULL DEFAULT 'STUDENT',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "passwordChangedAt" TIMESTAMPTZ(3),
    "locale" VARCHAR(20) NOT NULL DEFAULT 'en',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" UUID NOT NULL,
    "kind" "WorkspaceKind" NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspendedAt" TIMESTAMPTZ(3),
    "suspensionReason" VARCHAR(1000),
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "defaultCurrency" CHAR(3) NOT NULL DEFAULT 'usd',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "ownerId" UUID NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "userId" UUID NOT NULL,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceInvitation" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "role" "Role" NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "invitedById" UUID NOT NULL,

    CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "parentId" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "userAgent" VARCHAR(512),
    "ipHash" CHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" UUID NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "summary" VARCHAR(1000) NOT NULL,
    "description" JSONB NOT NULL DEFAULT '{}',
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'SELF_PACED',
    "language" VARCHAR(20) NOT NULL DEFAULT 'en',
    "level" VARCHAR(40),
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdById" UUID NOT NULL,
    "coverId" UUID,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseStaff" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "role" "StaffRole" NOT NULL,
    "canEditContent" BOOLEAN NOT NULL DEFAULT false,
    "canGrade" BOOLEAN NOT NULL DEFAULT true,
    "canManageLearners" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "courseId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "CourseStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCategory" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "courseId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,

    CONSTRAINT "CourseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePrerequisite" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "minimumPercent" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "courseId" UUID NOT NULL,
    "requiredCourseId" UUID NOT NULL,

    CONSTRAINT "CoursePrerequisite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "courseId" UUID NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "type" "LessonType" NOT NULL,
    "position" INTEGER NOT NULL,
    "body" JSONB NOT NULL DEFAULT '{}',
    "embedUrl" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isPreview" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "completionRule" "CompletionRule" NOT NULL DEFAULT 'ACKNOWLEDGE',
    "requiredWatchPercent" INTEGER NOT NULL DEFAULT 90,
    "releaseType" "ReleaseType" NOT NULL DEFAULT 'IMMEDIATE',
    "releaseAt" TIMESTAMPTZ(3),
    "releaseOffsetDays" INTEGER,
    "availableUntil" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "courseId" UUID NOT NULL,
    "sectionId" UUID NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonPrerequisite" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "courseId" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "requiredLessonId" UUID NOT NULL,

    CONSTRAINT "LessonPrerequisite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "objectKey" VARCHAR(512) NOT NULL,
    "bucket" VARCHAR(100) NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(160) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" CHAR(64),
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "visibility" "AssetVisibility" NOT NULL DEFAULT 'PRIVATE',
    "uploadExpiresAt" TIMESTAMPTZ(3),
    "verifiedAt" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "uploadedById" UUID NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonAsset" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "purpose" VARCHAR(32) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "lessonId" UUID NOT NULL,
    "assetId" UUID NOT NULL,

    CONSTRAINT "LessonAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cohort" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),
    "enrollmentOpensAt" TIMESTAMPTZ(3),
    "enrollmentClosesAt" TIMESTAMPTZ(3),
    "capacity" INTEGER,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "courseId" UUID NOT NULL,

    CONSTRAINT "Cohort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CohortLessonRelease" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "releaseAt" TIMESTAMPTZ(3) NOT NULL,
    "availableUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "courseId" UUID NOT NULL,
    "cohortId" UUID NOT NULL,
    "lessonId" UUID NOT NULL,

    CONSTRAINT "CohortLessonRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "provider" VARCHAR(60) NOT NULL,
    "joinUrl" TEXT NOT NULL,
    "hostUrlEncrypted" TEXT,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "LiveSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "providerMeetingId" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "courseId" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "cohortId" UUID,
    "recordingAssetId" UUID,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "lastActivityAt" TIMESTAMPTZ(3),
    "completionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "policySnapshot" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "courseId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "cohortId" UUID,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentGrant" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "source" "GrantSource" NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "reason" VARCHAR(1000),
    "sourceKey" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "orderItemId" UUID,
    "subscriptionId" UUID,
    "grantedById" UUID,

    CONSTRAINT "EnrollmentGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "positionSeconds" INTEGER NOT NULL DEFAULT 0,
    "watchedSeconds" INTEGER NOT NULL DEFAULT 0,
    "completionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMPTZ(3),
    "lastViewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "courseId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "lessonId" UUID NOT NULL,

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'REGISTERED',
    "joinedAt" TIMESTAMPTZ(3),
    "leftAt" TIMESTAMPTZ(3),
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "courseId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBank" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdById" UUID NOT NULL,

    CONSTRAINT "QuestionBank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "bankId" UUID NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionVersion" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "prompt" JSONB NOT NULL,
    "answerKey" JSONB NOT NULL,
    "explanation" JSONB,
    "defaultPoints" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "gradingConfig" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "questionId" UUID NOT NULL,

    CONSTRAINT "QuestionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "content" JSONB NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "questionVersionId" UUID NOT NULL,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "kind" "AssessmentKind" NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "currentPublishedVersion" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "courseId" UUID NOT NULL,
    "lessonId" UUID NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentVersion" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "instructions" JSONB NOT NULL DEFAULT '{}',
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "timeLimitSeconds" INTEGER,
    "availableFrom" TIMESTAMPTZ(3),
    "dueAt" TIMESTAMPTZ(3),
    "availableUntil" TIMESTAMPTZ(3),
    "allowLateSubmission" BOOLEAN NOT NULL DEFAULT false,
    "latePenaltyPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "passPercent" DECIMAL(5,2) NOT NULL DEFAULT 60,
    "gradePolicy" "GradePolicy" NOT NULL DEFAULT 'HIGHEST',
    "feedbackPolicy" "FeedbackPolicy" NOT NULL DEFAULT 'AFTER_GRADING',
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
    "rubric" JSONB,
    "allowedFileTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxUploadBytes" BIGINT NOT NULL DEFAULT 10485760,
    "maxFiles" INTEGER NOT NULL DEFAULT 5,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "assessmentId" UUID NOT NULL,

    CONSTRAINT "AssessmentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestion" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "points" DECIMAL(10,3) NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessmentVersionId" UUID NOT NULL,
    "questionVersionId" UUID NOT NULL,

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentPool" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "pointsEach" DECIMAL(10,3) NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "questionType" "QuestionType",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessmentVersionId" UUID NOT NULL,
    "bankId" UUID NOT NULL,

    CONSTRAINT "AssessmentPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentPoolQuestion" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "poolId" UUID NOT NULL,
    "questionVersionId" UUID NOT NULL,

    CONSTRAINT "AssessmentPoolQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAccommodation" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "extraTimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "extraAttempts" INTEGER NOT NULL DEFAULT 0,
    "availableUntil" TIMESTAMPTZ(3),
    "reason" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "courseId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "grantedById" UUID NOT NULL,

    CONSTRAINT "AssessmentAccommodation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttempt" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "randomSeed" VARCHAR(128) NOT NULL,
    "deliverySnapshot" JSONB NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMPTZ(3),
    "submittedAt" TIMESTAMPTZ(3),
    "gradedAt" TIMESTAMPTZ(3),
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "totalPoints" DECIMAL(12,3) NOT NULL,
    "awardedPoints" DECIMAL(12,3),
    "percent" DECIMAL(5,2),
    "passed" BOOLEAN,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "courseId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "assessmentVersionId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptQuestion" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "points" DECIMAL(10,3) NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "questionSnapshot" JSONB NOT NULL,
    "optionOrder" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptId" UUID NOT NULL,
    "questionVersionId" UUID NOT NULL,

    CONSTRAINT "AttemptQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptAnswer" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "response" JSONB NOT NULL DEFAULT '{}',
    "awardedPoints" DECIMAL(10,3),
    "isCorrect" BOOLEAN,
    "requiresManualGrading" BOOLEAN NOT NULL DEFAULT false,
    "feedback" TEXT,
    "savedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "attemptId" UUID NOT NULL,
    "attemptQuestionId" UUID NOT NULL,

    CONSTRAINT "AttemptAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerAttachment" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "answerId" UUID NOT NULL,
    "assetId" UUID NOT NULL,

    CONSTRAINT "AnswerAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeEvent" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "previousPoints" DECIMAL(12,3),
    "awardedPoints" DECIMAL(12,3) NOT NULL,
    "rubricScores" JSONB,
    "feedback" TEXT,
    "reason" VARCHAR(1000) NOT NULL,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptId" UUID NOT NULL,
    "answerId" UUID,
    "gradedById" UUID,

    CONSTRAINT "GradeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "type" "ProductType" NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "slug" VARCHAR(140) NOT NULL,
    "name" VARCHAR(240) NOT NULL,
    "description" JSONB NOT NULL DEFAULT '{}',
    "accessDurationDays" INTEGER,
    "stripeProductId" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCourse" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "productId" UUID NOT NULL,
    "courseId" UUID NOT NULL,

    CONSTRAINT "ProductCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Price" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "interval" "BillingInterval",
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "stripePriceId" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "productId" UUID NOT NULL,

    CONSTRAINT "Price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "kind" "CouponKind" NOT NULL,
    "percentOff" DECIMAL(5,2),
    "amountOff" INTEGER,
    "currency" CHAR(3),
    "validFrom" TIMESTAMPTZ(3) NOT NULL,
    "validUntil" TIMESTAMPTZ(3),
    "maxRedemptions" INTEGER,
    "maxPerUser" INTEGER NOT NULL DEFAULT 1,
    "minimumOrderAmount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "stripeCouponId" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponProduct" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "couponId" UUID NOT NULL,
    "productId" UUID NOT NULL,

    CONSTRAINT "CouponProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingCustomer" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "stripeCustomerId" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "BillingCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "currency" CHAR(3) NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "discountTotal" INTEGER NOT NULL DEFAULT 0,
    "taxTotal" INTEGER NOT NULL DEFAULT 0,
    "grandTotal" INTEGER NOT NULL,
    "billingSnapshot" JSONB NOT NULL DEFAULT '{}',
    "stripeCheckoutSessionId" VARCHAR(255),
    "paidAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "userId" UUID NOT NULL,
    "couponId" UUID,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "productSnapshot" JSONB NOT NULL,
    "entitlementSnapshot" JSONB NOT NULL,
    "unitAmount" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL,
    "accessDurationDays" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "priceId" UUID NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemCourse" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "accessDurationDays" INTEGER,
    "releasePolicySnapshot" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderItemId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "cohortId" UUID,

    CONSTRAINT "OrderItemCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "reservedUntil" TIMESTAMPTZ(3),
    "redeemedAt" TIMESTAMPTZ(3),
    "releasedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "couponId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "currency" CHAR(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "stripePaymentIntentId" VARCHAR(255),
    "stripeInvoiceId" VARCHAR(255),
    "stripeChargeId" VARCHAR(255),
    "paidAt" TIMESTAMPTZ(3),
    "failureCode" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "orderId" UUID,
    "subscriptionId" UUID,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "stripeSubscriptionId" VARCHAR(255) NOT NULL,
    "currentPeriodStart" TIMESTAMPTZ(3),
    "currentPeriodEnd" TIMESTAMPTZ(3),
    "trialEndsAt" TIMESTAMPTZ(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "entitlementSnapshot" JSONB NOT NULL,
    "lastSyncedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "userId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "priceId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "initialOrderId" UUID,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "stripeRefundId" VARCHAR(255),
    "revokeAccess" BOOLEAN NOT NULL DEFAULT true,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "paymentId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundItem" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "revokeAccess" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refundId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,

    CONSTRAINT "RefundItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhook" (
    "id" UUID NOT NULL,
    "stripeEventId" VARCHAR(255) NOT NULL,
    "type" VARCHAR(160) NOT NULL,
    "stripeCreatedAt" TIMESTAMPTZ(3) NOT NULL,
    "apiVersion" VARCHAR(64),
    "livemode" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "lockedUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StripeWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateTemplate" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "layout" JSONB NOT NULL,
    "issuerName" VARCHAR(240) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "courseId" UUID NOT NULL,
    "backgroundAssetId" UUID,

    CONSTRAINT "CertificateTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "verificationCode" VARCHAR(80) NOT NULL,
    "status" "CertificateStatus" NOT NULL DEFAULT 'VALID',
    "recipientSnapshot" JSONB NOT NULL,
    "courseSnapshot" JSONB NOT NULL,
    "templateSnapshot" JSONB NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "revocationReason" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "documentAssetId" UUID,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "workspaceId" UUID,
    "type" VARCHAR(100) NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "dedupeKey" VARCHAR(255) NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "userId" UUID NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" UUID NOT NULL,
    "workspaceId" UUID,
    "type" VARCHAR(100) NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" UUID NOT NULL,
    "workspaceId" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "recipient" VARCHAR(254) NOT NULL,
    "providerMessageId" VARCHAR(255),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "notificationId" UUID NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "sessionKey" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID,
    "courseId" UUID,
    "lessonId" UUID,
    "enrollmentId" UUID,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCourseMetric" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "newEnrollments" INTEGER NOT NULL DEFAULT 0,
    "activeLearners" INTEGER NOT NULL DEFAULT 0,
    "completions" INTEGER NOT NULL DEFAULT 0,
    "learningSeconds" BIGINT NOT NULL DEFAULT 0,
    "assessmentSubmissions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "courseId" UUID NOT NULL,

    CONSTRAINT "DailyCourseMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportExport" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "kind" VARCHAR(100) NOT NULL,
    "parameters" JSONB NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "requestedById" UUID NOT NULL,
    "assetId" UUID,

    CONSTRAINT "ReportExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "workspaceId" UUID,
    "type" VARCHAR(100) NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "aggregateType" VARCHAR(100) NOT NULL,
    "aggregateId" VARCHAR(128) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "sequence" BIGSERIAL NOT NULL,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventReceipt" (
    "id" UUID NOT NULL,
    "workspaceId" UUID,
    "eventId" UUID NOT NULL,
    "consumer" VARCHAR(100) NOT NULL,
    "processedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "action" VARCHAR(120) NOT NULL,
    "resourceType" VARCHAR(100) NOT NULL,
    "resourceId" VARCHAR(128) NOT NULL,
    "requestId" VARCHAR(100) NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "ipHash" CHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" UUID,
    "actorId" UUID,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "route" VARCHAR(240) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "responseStatus" INTEGER,
    "response" JSONB,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_status_idx" ON "WorkspaceMember"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_id_key" ON "WorkspaceMember"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvitation_tokenHash_key" ON "WorkspaceInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "WorkspaceInvitation_invitedById_idx" ON "WorkspaceInvitation"("invitedById");

-- CreateIndex
CREATE INDEX "WorkspaceInvitation_workspaceId_email_idx" ON "WorkspaceInvitation"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvitation_workspaceId_id_key" ON "WorkspaceInvitation"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_parentId_key" ON "RefreshSession"("parentId");

-- CreateIndex
CREATE INDEX "RefreshSession_userId_idx" ON "RefreshSession"("userId");

-- CreateIndex
CREATE INDEX "RefreshSession_familyId_revokedAt_idx" ON "RefreshSession"("familyId", "revokedAt");

-- CreateIndex
CREATE INDEX "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_userId_idx" ON "AuthToken"("userId");

-- CreateIndex
CREATE INDEX "AuthToken_expiresAt_idx" ON "AuthToken"("expiresAt");

-- CreateIndex
CREATE INDEX "Course_createdById_idx" ON "Course"("createdById");

-- CreateIndex
CREATE INDEX "Course_workspaceId_coverId_idx" ON "Course"("workspaceId", "coverId");

-- CreateIndex
CREATE INDEX "Course_workspaceId_status_visibility_publishedAt_id_idx" ON "Course"("workspaceId", "status", "visibility", "publishedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Course_workspaceId_id_key" ON "Course"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Course_workspaceId_slug_key" ON "Course"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "CourseStaff_workspaceId_courseId_idx" ON "CourseStaff"("workspaceId", "courseId");

-- CreateIndex
CREATE INDEX "CourseStaff_workspaceId_userId_idx" ON "CourseStaff"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseStaff_workspaceId_id_key" ON "CourseStaff"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CourseStaff_courseId_userId_key" ON "CourseStaff"("courseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_workspaceId_id_key" ON "Category"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Category_workspaceId_slug_key" ON "Category"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "CourseCategory_workspaceId_courseId_idx" ON "CourseCategory"("workspaceId", "courseId");

-- CreateIndex
CREATE INDEX "CourseCategory_workspaceId_categoryId_idx" ON "CourseCategory"("workspaceId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCategory_workspaceId_id_key" ON "CourseCategory"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCategory_courseId_categoryId_key" ON "CourseCategory"("courseId", "categoryId");

-- CreateIndex
CREATE INDEX "CoursePrerequisite_workspaceId_courseId_idx" ON "CoursePrerequisite"("workspaceId", "courseId");

-- CreateIndex
CREATE INDEX "CoursePrerequisite_workspaceId_requiredCourseId_idx" ON "CoursePrerequisite"("workspaceId", "requiredCourseId");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePrerequisite_workspaceId_id_key" ON "CoursePrerequisite"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePrerequisite_courseId_requiredCourseId_key" ON "CoursePrerequisite"("courseId", "requiredCourseId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_workspaceId_id_key" ON "Section"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Section_courseId_position_key" ON "Section"("courseId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Section_workspaceId_courseId_id_key" ON "Section"("workspaceId", "courseId", "id");

-- CreateIndex
CREATE INDEX "Lesson_workspaceId_courseId_sectionId_idx" ON "Lesson"("workspaceId", "courseId", "sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_workspaceId_id_key" ON "Lesson"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_sectionId_position_key" ON "Lesson"("sectionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_workspaceId_courseId_id_key" ON "Lesson"("workspaceId", "courseId", "id");

-- CreateIndex
CREATE INDEX "LessonPrerequisite_workspaceId_courseId_lessonId_idx" ON "LessonPrerequisite"("workspaceId", "courseId", "lessonId");

-- CreateIndex
CREATE INDEX "LessonPrerequisite_workspaceId_courseId_requiredLessonId_idx" ON "LessonPrerequisite"("workspaceId", "courseId", "requiredLessonId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonPrerequisite_workspaceId_id_key" ON "LessonPrerequisite"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LessonPrerequisite_lessonId_requiredLessonId_key" ON "LessonPrerequisite"("lessonId", "requiredLessonId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_objectKey_key" ON "Asset"("objectKey");

-- CreateIndex
CREATE INDEX "Asset_uploadedById_idx" ON "Asset"("uploadedById");

-- CreateIndex
CREATE INDEX "Asset_workspaceId_status_createdAt_idx" ON "Asset"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_workspaceId_id_key" ON "Asset"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "LessonAsset_workspaceId_lessonId_idx" ON "LessonAsset"("workspaceId", "lessonId");

-- CreateIndex
CREATE INDEX "LessonAsset_workspaceId_assetId_idx" ON "LessonAsset"("workspaceId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonAsset_workspaceId_id_key" ON "LessonAsset"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LessonAsset_lessonId_assetId_key" ON "LessonAsset"("lessonId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "Cohort_workspaceId_id_key" ON "Cohort"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Cohort_workspaceId_courseId_id_key" ON "Cohort"("workspaceId", "courseId", "id");

-- CreateIndex
CREATE INDEX "CohortLessonRelease_workspaceId_courseId_cohortId_idx" ON "CohortLessonRelease"("workspaceId", "courseId", "cohortId");

-- CreateIndex
CREATE INDEX "CohortLessonRelease_workspaceId_courseId_lessonId_idx" ON "CohortLessonRelease"("workspaceId", "courseId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "CohortLessonRelease_workspaceId_id_key" ON "CohortLessonRelease"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CohortLessonRelease_cohortId_lessonId_key" ON "CohortLessonRelease"("cohortId", "lessonId");

-- CreateIndex
CREATE INDEX "LiveSession_workspaceId_courseId_lessonId_idx" ON "LiveSession"("workspaceId", "courseId", "lessonId");

-- CreateIndex
CREATE INDEX "LiveSession_workspaceId_courseId_cohortId_idx" ON "LiveSession"("workspaceId", "courseId", "cohortId");

-- CreateIndex
CREATE INDEX "LiveSession_workspaceId_recordingAssetId_idx" ON "LiveSession"("workspaceId", "recordingAssetId");

-- CreateIndex
CREATE INDEX "LiveSession_workspaceId_startsAt_idx" ON "LiveSession"("workspaceId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSession_workspaceId_id_key" ON "LiveSession"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSession_workspaceId_courseId_id_key" ON "LiveSession"("workspaceId", "courseId", "id");

-- CreateIndex
CREATE INDEX "Enrollment_workspaceId_courseId_cohortId_idx" ON "Enrollment"("workspaceId", "courseId", "cohortId");

-- CreateIndex
CREATE INDEX "Enrollment_userId_status_lastActivityAt_idx" ON "Enrollment"("userId", "status", "lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_workspaceId_id_key" ON "Enrollment"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_courseId_userId_key" ON "Enrollment"("courseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_workspaceId_courseId_id_key" ON "Enrollment"("workspaceId", "courseId", "id");

-- CreateIndex
CREATE INDEX "EnrollmentGrant_workspaceId_enrollmentId_idx" ON "EnrollmentGrant"("workspaceId", "enrollmentId");

-- CreateIndex
CREATE INDEX "EnrollmentGrant_workspaceId_orderItemId_idx" ON "EnrollmentGrant"("workspaceId", "orderItemId");

-- CreateIndex
CREATE INDEX "EnrollmentGrant_workspaceId_subscriptionId_idx" ON "EnrollmentGrant"("workspaceId", "subscriptionId");

-- CreateIndex
CREATE INDEX "EnrollmentGrant_grantedById_idx" ON "EnrollmentGrant"("grantedById");

-- CreateIndex
CREATE INDEX "EnrollmentGrant_workspaceId_expiresAt_revokedAt_idx" ON "EnrollmentGrant"("workspaceId", "expiresAt", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentGrant_workspaceId_id_key" ON "EnrollmentGrant"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentGrant_enrollmentId_sourceKey_key" ON "EnrollmentGrant"("enrollmentId", "sourceKey");

-- CreateIndex
CREATE INDEX "LessonProgress_workspaceId_courseId_enrollmentId_idx" ON "LessonProgress"("workspaceId", "courseId", "enrollmentId");

-- CreateIndex
CREATE INDEX "LessonProgress_workspaceId_courseId_lessonId_idx" ON "LessonProgress"("workspaceId", "courseId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_workspaceId_id_key" ON "LessonProgress"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_enrollmentId_lessonId_key" ON "LessonProgress"("enrollmentId", "lessonId");

-- CreateIndex
CREATE INDEX "Attendance_workspaceId_courseId_sessionId_idx" ON "Attendance"("workspaceId", "courseId", "sessionId");

-- CreateIndex
CREATE INDEX "Attendance_workspaceId_courseId_enrollmentId_idx" ON "Attendance"("workspaceId", "courseId", "enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_workspaceId_id_key" ON "Attendance"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_sessionId_enrollmentId_key" ON "Attendance"("sessionId", "enrollmentId");

-- CreateIndex
CREATE INDEX "QuestionBank_createdById_idx" ON "QuestionBank"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionBank_workspaceId_id_key" ON "QuestionBank"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "Question_workspaceId_bankId_idx" ON "Question"("workspaceId", "bankId");

-- CreateIndex
CREATE INDEX "Question_createdById_idx" ON "Question"("createdById");

-- CreateIndex
CREATE INDEX "Question_tags_idx" ON "Question" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "Question_workspaceId_id_key" ON "Question"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "QuestionVersion_workspaceId_questionId_idx" ON "QuestionVersion"("workspaceId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionVersion_workspaceId_id_key" ON "QuestionVersion"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionVersion_questionId_version_key" ON "QuestionVersion"("questionId", "version");

-- CreateIndex
CREATE INDEX "QuestionOption_workspaceId_questionVersionId_idx" ON "QuestionOption"("workspaceId", "questionVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOption_workspaceId_id_key" ON "QuestionOption"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOption_questionVersionId_key_key" ON "QuestionOption"("questionVersionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOption_questionVersionId_position_key" ON "QuestionOption"("questionVersionId", "position");

-- CreateIndex
CREATE INDEX "Assessment_workspaceId_courseId_lessonId_idx" ON "Assessment"("workspaceId", "courseId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_workspaceId_id_key" ON "Assessment"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_lessonId_key" ON "Assessment"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_workspaceId_courseId_id_key" ON "Assessment"("workspaceId", "courseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_workspaceId_courseId_lessonId_key" ON "Assessment"("workspaceId", "courseId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentVersion_workspaceId_id_key" ON "AssessmentVersion"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentVersion_assessmentId_version_key" ON "AssessmentVersion"("assessmentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentVersion_workspaceId_assessmentId_id_key" ON "AssessmentVersion"("workspaceId", "assessmentId", "id");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_workspaceId_assessmentVersionId_idx" ON "AssessmentQuestion"("workspaceId", "assessmentVersionId");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_workspaceId_questionVersionId_idx" ON "AssessmentQuestion"("workspaceId", "questionVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestion_workspaceId_id_key" ON "AssessmentQuestion"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestion_assessmentVersionId_questionVersionId_key" ON "AssessmentQuestion"("assessmentVersionId", "questionVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestion_assessmentVersionId_position_key" ON "AssessmentQuestion"("assessmentVersionId", "position");

-- CreateIndex
CREATE INDEX "AssessmentPool_workspaceId_assessmentVersionId_idx" ON "AssessmentPool"("workspaceId", "assessmentVersionId");

-- CreateIndex
CREATE INDEX "AssessmentPool_workspaceId_bankId_idx" ON "AssessmentPool"("workspaceId", "bankId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentPool_workspaceId_id_key" ON "AssessmentPool"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentPool_assessmentVersionId_position_key" ON "AssessmentPool"("assessmentVersionId", "position");

-- CreateIndex
CREATE INDEX "AssessmentPoolQuestion_workspaceId_poolId_idx" ON "AssessmentPoolQuestion"("workspaceId", "poolId");

-- CreateIndex
CREATE INDEX "AssessmentPoolQuestion_workspaceId_questionVersionId_idx" ON "AssessmentPoolQuestion"("workspaceId", "questionVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentPoolQuestion_workspaceId_id_key" ON "AssessmentPoolQuestion"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentPoolQuestion_poolId_questionVersionId_key" ON "AssessmentPoolQuestion"("poolId", "questionVersionId");

-- CreateIndex
CREATE INDEX "AssessmentAccommodation_workspaceId_courseId_assessmentId_idx" ON "AssessmentAccommodation"("workspaceId", "courseId", "assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentAccommodation_workspaceId_courseId_enrollmentId_idx" ON "AssessmentAccommodation"("workspaceId", "courseId", "enrollmentId");

-- CreateIndex
CREATE INDEX "AssessmentAccommodation_grantedById_idx" ON "AssessmentAccommodation"("grantedById");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAccommodation_workspaceId_id_key" ON "AssessmentAccommodation"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAccommodation_assessmentId_enrollmentId_key" ON "AssessmentAccommodation"("assessmentId", "enrollmentId");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_workspaceId_courseId_assessmentId_idx" ON "AssessmentAttempt"("workspaceId", "courseId", "assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_workspaceId_assessmentId_assessmentVersio_idx" ON "AssessmentAttempt"("workspaceId", "assessmentId", "assessmentVersionId");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_workspaceId_courseId_enrollmentId_idx" ON "AssessmentAttempt"("workspaceId", "courseId", "enrollmentId");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_workspaceId_status_deadlineAt_idx" ON "AssessmentAttempt"("workspaceId", "status", "deadlineAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttempt_workspaceId_id_key" ON "AssessmentAttempt"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttempt_assessmentId_enrollmentId_number_key" ON "AssessmentAttempt"("assessmentId", "enrollmentId", "number");

-- CreateIndex
CREATE INDEX "AttemptQuestion_workspaceId_questionVersionId_idx" ON "AttemptQuestion"("workspaceId", "questionVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptQuestion_workspaceId_id_key" ON "AttemptQuestion"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptQuestion_workspaceId_attemptId_id_key" ON "AttemptQuestion"("workspaceId", "attemptId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptQuestion_attemptId_position_key" ON "AttemptQuestion"("attemptId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptQuestion_attemptId_questionVersionId_key" ON "AttemptQuestion"("attemptId", "questionVersionId");

-- CreateIndex
CREATE INDEX "AttemptAnswer_workspaceId_attemptId_attemptQuestionId_idx" ON "AttemptAnswer"("workspaceId", "attemptId", "attemptQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptAnswer_workspaceId_id_key" ON "AttemptAnswer"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptAnswer_workspaceId_attemptId_id_key" ON "AttemptAnswer"("workspaceId", "attemptId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptAnswer_attemptQuestionId_key" ON "AttemptAnswer"("attemptQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptAnswer_workspaceId_attemptId_attemptQuestionId_key" ON "AttemptAnswer"("workspaceId", "attemptId", "attemptQuestionId");

-- CreateIndex
CREATE INDEX "AnswerAttachment_workspaceId_answerId_idx" ON "AnswerAttachment"("workspaceId", "answerId");

-- CreateIndex
CREATE INDEX "AnswerAttachment_workspaceId_assetId_idx" ON "AnswerAttachment"("workspaceId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerAttachment_workspaceId_id_key" ON "AnswerAttachment"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerAttachment_answerId_assetId_key" ON "AnswerAttachment"("answerId", "assetId");

-- CreateIndex
CREATE INDEX "GradeEvent_workspaceId_attemptId_answerId_idx" ON "GradeEvent"("workspaceId", "attemptId", "answerId");

-- CreateIndex
CREATE INDEX "GradeEvent_gradedById_idx" ON "GradeEvent"("gradedById");

-- CreateIndex
CREATE INDEX "GradeEvent_workspaceId_attemptId_createdAt_idx" ON "GradeEvent"("workspaceId", "attemptId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GradeEvent_workspaceId_id_key" ON "GradeEvent"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Product_stripeProductId_key" ON "Product"("stripeProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_workspaceId_id_key" ON "Product"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Product_workspaceId_slug_key" ON "Product"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "ProductCourse_workspaceId_productId_idx" ON "ProductCourse"("workspaceId", "productId");

-- CreateIndex
CREATE INDEX "ProductCourse_workspaceId_courseId_idx" ON "ProductCourse"("workspaceId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCourse_workspaceId_id_key" ON "ProductCourse"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCourse_productId_courseId_key" ON "ProductCourse"("productId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Price_stripePriceId_key" ON "Price"("stripePriceId");

-- CreateIndex
CREATE INDEX "Price_workspaceId_productId_isActive_idx" ON "Price"("workspaceId", "productId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Price_workspaceId_id_key" ON "Price"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_stripeCouponId_key" ON "Coupon"("stripeCouponId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_workspaceId_id_key" ON "Coupon"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_workspaceId_code_key" ON "Coupon"("workspaceId", "code");

-- CreateIndex
CREATE INDEX "CouponProduct_workspaceId_couponId_idx" ON "CouponProduct"("workspaceId", "couponId");

-- CreateIndex
CREATE INDEX "CouponProduct_workspaceId_productId_idx" ON "CouponProduct"("workspaceId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponProduct_workspaceId_id_key" ON "CouponProduct"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CouponProduct_couponId_productId_key" ON "CouponProduct"("couponId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCustomer_stripeCustomerId_key" ON "BillingCustomer"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "BillingCustomer_userId_idx" ON "BillingCustomer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCustomer_workspaceId_id_key" ON "BillingCustomer"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCustomer_workspaceId_userId_key" ON "BillingCustomer"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripeCheckoutSessionId_key" ON "Order"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "Order_workspaceId_couponId_idx" ON "Order"("workspaceId", "couponId");

-- CreateIndex
CREATE INDEX "Order_workspaceId_status_createdAt_id_idx" ON "Order"("workspaceId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_id_idx" ON "Order"("userId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Order_workspaceId_id_key" ON "Order"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "OrderItem_workspaceId_orderId_idx" ON "OrderItem"("workspaceId", "orderId");

-- CreateIndex
CREATE INDEX "OrderItem_workspaceId_productId_idx" ON "OrderItem"("workspaceId", "productId");

-- CreateIndex
CREATE INDEX "OrderItem_workspaceId_priceId_idx" ON "OrderItem"("workspaceId", "priceId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_workspaceId_id_key" ON "OrderItem"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "OrderItemCourse_workspaceId_orderItemId_idx" ON "OrderItemCourse"("workspaceId", "orderItemId");

-- CreateIndex
CREATE INDEX "OrderItemCourse_workspaceId_courseId_cohortId_idx" ON "OrderItemCourse"("workspaceId", "courseId", "cohortId");

-- CreateIndex
CREATE INDEX "OrderItemCourse_workspaceId_cohortId_idx" ON "OrderItemCourse"("workspaceId", "cohortId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItemCourse_workspaceId_id_key" ON "OrderItemCourse"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItemCourse_orderItemId_courseId_key" ON "OrderItemCourse"("orderItemId", "courseId");

-- CreateIndex
CREATE INDEX "CouponRedemption_workspaceId_orderId_idx" ON "CouponRedemption"("workspaceId", "orderId");

-- CreateIndex
CREATE INDEX "CouponRedemption_userId_idx" ON "CouponRedemption"("userId");

-- CreateIndex
CREATE INDEX "CouponRedemption_workspaceId_couponId_userId_idx" ON "CouponRedemption"("workspaceId", "couponId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_workspaceId_id_key" ON "CouponRedemption"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_orderId_key" ON "CouponRedemption"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_workspaceId_orderId_key" ON "CouponRedemption"("workspaceId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeInvoiceId_key" ON "Payment"("stripeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeChargeId_key" ON "Payment"("stripeChargeId");

-- CreateIndex
CREATE INDEX "Payment_workspaceId_orderId_idx" ON "Payment"("workspaceId", "orderId");

-- CreateIndex
CREATE INDEX "Payment_workspaceId_subscriptionId_idx" ON "Payment"("workspaceId", "subscriptionId");

-- CreateIndex
CREATE INDEX "Payment_workspaceId_status_createdAt_idx" ON "Payment"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_workspaceId_id_key" ON "Payment"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_workspaceId_productId_idx" ON "Subscription"("workspaceId", "productId");

-- CreateIndex
CREATE INDEX "Subscription_workspaceId_priceId_idx" ON "Subscription"("workspaceId", "priceId");

-- CreateIndex
CREATE INDEX "Subscription_workspaceId_customerId_idx" ON "Subscription"("workspaceId", "customerId");

-- CreateIndex
CREATE INDEX "Subscription_workspaceId_initialOrderId_idx" ON "Subscription"("workspaceId", "initialOrderId");

-- CreateIndex
CREATE INDEX "Subscription_workspaceId_userId_status_idx" ON "Subscription"("workspaceId", "userId", "status");

-- CreateIndex
CREATE INDEX "Subscription_workspaceId_currentPeriodEnd_idx" ON "Subscription"("workspaceId", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_workspaceId_id_key" ON "Subscription"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_stripeRefundId_key" ON "Refund"("stripeRefundId");

-- CreateIndex
CREATE INDEX "Refund_workspaceId_paymentId_idx" ON "Refund"("workspaceId", "paymentId");

-- CreateIndex
CREATE INDEX "Refund_requestedById_idx" ON "Refund"("requestedById");

-- CreateIndex
CREATE INDEX "Refund_workspaceId_status_createdAt_idx" ON "Refund"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_workspaceId_id_key" ON "Refund"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "RefundItem_workspaceId_refundId_idx" ON "RefundItem"("workspaceId", "refundId");

-- CreateIndex
CREATE INDEX "RefundItem_workspaceId_orderItemId_idx" ON "RefundItem"("workspaceId", "orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundItem_workspaceId_id_key" ON "RefundItem"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RefundItem_refundId_orderItemId_key" ON "RefundItem"("refundId", "orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeWebhook_stripeEventId_key" ON "StripeWebhook"("stripeEventId");

-- CreateIndex
CREATE INDEX "StripeWebhook_status_createdAt_idx" ON "StripeWebhook"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CertificateTemplate_workspaceId_courseId_idx" ON "CertificateTemplate"("workspaceId", "courseId");

-- CreateIndex
CREATE INDEX "CertificateTemplate_workspaceId_backgroundAssetId_idx" ON "CertificateTemplate"("workspaceId", "backgroundAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateTemplate_workspaceId_id_key" ON "CertificateTemplate"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateTemplate_courseId_version_key" ON "CertificateTemplate"("courseId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_verificationCode_key" ON "Certificate"("verificationCode");

-- CreateIndex
CREATE INDEX "Certificate_workspaceId_enrollmentId_idx" ON "Certificate"("workspaceId", "enrollmentId");

-- CreateIndex
CREATE INDEX "Certificate_workspaceId_templateId_idx" ON "Certificate"("workspaceId", "templateId");

-- CreateIndex
CREATE INDEX "Certificate_workspaceId_documentAssetId_idx" ON "Certificate"("workspaceId", "documentAssetId");

-- CreateIndex
CREATE INDEX "Certificate_workspaceId_issuedAt_idx" ON "Certificate"("workspaceId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_workspaceId_id_key" ON "Certificate"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_enrollmentId_key" ON "Certificate"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_workspaceId_enrollmentId_key" ON "Certificate"("workspaceId", "enrollmentId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_id_idx" ON "Notification"("userId", "readAt", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_workspaceId_id_key" ON "Notification"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_workspaceId_id_key" ON "NotificationPreference"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_workspaceId_userId_type_channel_key" ON "NotificationPreference"("workspaceId", "userId", "type", "channel");

-- CreateIndex
CREATE INDEX "NotificationDelivery_workspaceId_notificationId_idx" ON "NotificationDelivery"("workspaceId", "notificationId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_idx" ON "NotificationDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_workspaceId_id_key" ON "NotificationDelivery"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_channel_key" ON "NotificationDelivery"("notificationId", "channel");

-- CreateIndex
CREATE INDEX "ActivityEvent_userId_idx" ON "ActivityEvent"("userId");

-- CreateIndex
CREATE INDEX "ActivityEvent_workspaceId_lessonId_idx" ON "ActivityEvent"("workspaceId", "lessonId");

-- CreateIndex
CREATE INDEX "ActivityEvent_workspaceId_enrollmentId_idx" ON "ActivityEvent"("workspaceId", "enrollmentId");

-- CreateIndex
CREATE INDEX "ActivityEvent_workspaceId_courseId_occurredAt_id_idx" ON "ActivityEvent"("workspaceId", "courseId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "ActivityEvent_workspaceId_userId_occurredAt_idx" ON "ActivityEvent"("workspaceId", "userId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityEvent_workspaceId_id_key" ON "ActivityEvent"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityEvent_workspaceId_eventId_key" ON "ActivityEvent"("workspaceId", "eventId");

-- CreateIndex
CREATE INDEX "DailyCourseMetric_workspaceId_courseId_idx" ON "DailyCourseMetric"("workspaceId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCourseMetric_workspaceId_id_key" ON "DailyCourseMetric"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCourseMetric_courseId_day_key" ON "DailyCourseMetric"("courseId", "day");

-- CreateIndex
CREATE INDEX "ReportExport_requestedById_idx" ON "ReportExport"("requestedById");

-- CreateIndex
CREATE INDEX "ReportExport_workspaceId_assetId_idx" ON "ReportExport"("workspaceId", "assetId");

-- CreateIndex
CREATE INDEX "ReportExport_workspaceId_requestedById_createdAt_idx" ON "ReportExport"("workspaceId", "requestedById", "createdAt");

-- CreateIndex
CREATE INDEX "ReportExport_status_expiresAt_idx" ON "ReportExport"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportExport_workspaceId_id_key" ON "ReportExport"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_sequence_idx" ON "OutboxEvent"("status", "availableAt", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_workspaceId_id_key" ON "OutboxEvent"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_sequence_key" ON "OutboxEvent"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "EventReceipt_workspaceId_id_key" ON "EventReceipt"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EventReceipt_eventId_consumer_key" ON "EventReceipt"("eventId", "consumer");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_id_idx" ON "AuditLog"("workspaceId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_createdAt_idx" ON "AuditLog"("resourceType", "resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_userId_idx" ON "IdempotencyRecord"("userId");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_workspaceId_id_key" ON "IdempotencyRecord"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_workspaceId_userId_route_key_key" ON "IdempotencyRecord"("workspaceId", "userId", "route", "key");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "RefreshSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_workspaceId_coverId_fkey" FOREIGN KEY ("workspaceId", "coverId") REFERENCES "Asset"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseStaff" ADD CONSTRAINT "CourseStaff_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseStaff" ADD CONSTRAINT "CourseStaff_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseStaff" ADD CONSTRAINT "CourseStaff_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "WorkspaceMember"("workspaceId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCategory" ADD CONSTRAINT "CourseCategory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCategory" ADD CONSTRAINT "CourseCategory_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCategory" ADD CONSTRAINT "CourseCategory_workspaceId_categoryId_fkey" FOREIGN KEY ("workspaceId", "categoryId") REFERENCES "Category"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePrerequisite" ADD CONSTRAINT "CoursePrerequisite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePrerequisite" ADD CONSTRAINT "CoursePrerequisite_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePrerequisite" ADD CONSTRAINT "CoursePrerequisite_workspaceId_requiredCourseId_fkey" FOREIGN KEY ("workspaceId", "requiredCourseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_workspaceId_courseId_sectionId_fkey" FOREIGN KEY ("workspaceId", "courseId", "sectionId") REFERENCES "Section"("workspaceId", "courseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPrerequisite" ADD CONSTRAINT "LessonPrerequisite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPrerequisite" ADD CONSTRAINT "LessonPrerequisite_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPrerequisite" ADD CONSTRAINT "LessonPrerequisite_workspaceId_courseId_lessonId_fkey" FOREIGN KEY ("workspaceId", "courseId", "lessonId") REFERENCES "Lesson"("workspaceId", "courseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPrerequisite" ADD CONSTRAINT "LessonPrerequisite_workspaceId_courseId_requiredLessonId_fkey" FOREIGN KEY ("workspaceId", "courseId", "requiredLessonId") REFERENCES "Lesson"("workspaceId", "courseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonAsset" ADD CONSTRAINT "LessonAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonAsset" ADD CONSTRAINT "LessonAsset_workspaceId_lessonId_fkey" FOREIGN KEY ("workspaceId", "lessonId") REFERENCES "Lesson"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonAsset" ADD CONSTRAINT "LessonAsset_workspaceId_assetId_fkey" FOREIGN KEY ("workspaceId", "assetId") REFERENCES "Asset"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cohort" ADD CONSTRAINT "Cohort_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cohort" ADD CONSTRAINT "Cohort_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortLessonRelease" ADD CONSTRAINT "CohortLessonRelease_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortLessonRelease" ADD CONSTRAINT "CohortLessonRelease_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortLessonRelease" ADD CONSTRAINT "CohortLessonRelease_workspaceId_courseId_cohortId_fkey" FOREIGN KEY ("workspaceId", "courseId", "cohortId") REFERENCES "Cohort"("workspaceId", "courseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortLessonRelease" ADD CONSTRAINT "CohortLessonRelease_workspaceId_courseId_lessonId_fkey" FOREIGN KEY ("workspaceId", "courseId", "lessonId") REFERENCES "Lesson"("workspaceId", "courseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_workspaceId_courseId_lessonId_fkey" FOREIGN KEY ("workspaceId", "courseId", "lessonId") REFERENCES "Lesson"("workspaceId", "courseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_workspaceId_courseId_cohortId_fkey" FOREIGN KEY ("workspaceId", "courseId", "cohortId") REFERENCES "Cohort"("workspaceId", "courseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_workspaceId_recordingAssetId_fkey" FOREIGN KEY ("workspaceId", "recordingAssetId") REFERENCES "Asset"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_workspaceId_courseId_cohortId_fkey" FOREIGN KEY ("workspaceId", "courseId", "cohortId") REFERENCES "Cohort"("workspaceId", "courseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentGrant" ADD CONSTRAINT "EnrollmentGrant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentGrant" ADD CONSTRAINT "EnrollmentGrant_workspaceId_enrollmentId_fkey" FOREIGN KEY ("workspaceId", "enrollmentId") REFERENCES "Enrollment"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentGrant" ADD CONSTRAINT "EnrollmentGrant_workspaceId_orderItemId_fkey" FOREIGN KEY ("workspaceId", "orderItemId") REFERENCES "OrderItem"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentGrant" ADD CONSTRAINT "EnrollmentGrant_workspaceId_subscriptionId_fkey" FOREIGN KEY ("workspaceId", "subscriptionId") REFERENCES "Subscription"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentGrant" ADD CONSTRAINT "EnrollmentGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_workspaceId_courseId_enrollmentId_fkey" FOREIGN KEY ("workspaceId", "courseId", "enrollmentId") REFERENCES "Enrollment"("workspaceId", "courseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_workspaceId_courseId_lessonId_fkey" FOREIGN KEY ("workspaceId", "courseId", "lessonId") REFERENCES "Lesson"("workspaceId", "courseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_workspaceId_courseId_sessionId_fkey" FOREIGN KEY ("workspaceId", "courseId", "sessionId") REFERENCES "LiveSession"("workspaceId", "courseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_workspaceId_courseId_enrollmentId_fkey" FOREIGN KEY ("workspaceId", "courseId", "enrollmentId") REFERENCES "Enrollment"("workspaceId", "courseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_workspaceId_bankId_fkey" FOREIGN KEY ("workspaceId", "bankId") REFERENCES "QuestionBank"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionVersion" ADD CONSTRAINT "QuestionVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionVersion" ADD CONSTRAINT "QuestionVersion_workspaceId_questionId_fkey" FOREIGN KEY ("workspaceId", "questionId") REFERENCES "Question"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_workspaceId_questionVersionId_fkey" FOREIGN KEY ("workspaceId", "questionVersionId") REFERENCES "QuestionVersion"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_workspaceId_courseId_lessonId_fkey" FOREIGN KEY ("workspaceId", "courseId", "lessonId") REFERENCES "Lesson"("workspaceId", "courseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_workspaceId_assessmentId_fkey" FOREIGN KEY ("workspaceId", "assessmentId") REFERENCES "Assessment"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_workspaceId_assessmentVersionId_fkey" FOREIGN KEY ("workspaceId", "assessmentVersionId") REFERENCES "AssessmentVersion"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_workspaceId_questionVersionId_fkey" FOREIGN KEY ("workspaceId", "questionVersionId") REFERENCES "QuestionVersion"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentPool" ADD CONSTRAINT "AssessmentPool_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentPool" ADD CONSTRAINT "AssessmentPool_workspaceId_assessmentVersionId_fkey" FOREIGN KEY ("workspaceId", "assessmentVersionId") REFERENCES "AssessmentVersion"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentPool" ADD CONSTRAINT "AssessmentPool_workspaceId_bankId_fkey" FOREIGN KEY ("workspaceId", "bankId") REFERENCES "QuestionBank"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentPoolQuestion" ADD CONSTRAINT "AssessmentPoolQuestion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentPoolQuestion" ADD CONSTRAINT "AssessmentPoolQuestion_workspaceId_poolId_fkey" FOREIGN KEY ("workspaceId", "poolId") REFERENCES "AssessmentPool"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentPoolQuestion" ADD CONSTRAINT "AssessmentPoolQuestion_workspaceId_questionVersionId_fkey" FOREIGN KEY ("workspaceId", "questionVersionId") REFERENCES "QuestionVersion"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAccommodation" ADD CONSTRAINT "AssessmentAccommodation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAccommodation" ADD CONSTRAINT "AssessmentAccommodation_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAccommodation" ADD CONSTRAINT "AssessmentAccommodation_workspaceId_courseId_assessmentId_fkey" FOREIGN KEY ("workspaceId", "courseId", "assessmentId") REFERENCES "Assessment"("workspaceId", "courseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAccommodation" ADD CONSTRAINT "AssessmentAccommodation_workspaceId_courseId_enrollmentId_fkey" FOREIGN KEY ("workspaceId", "courseId", "enrollmentId") REFERENCES "Enrollment"("workspaceId", "courseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAccommodation" ADD CONSTRAINT "AssessmentAccommodation_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_workspaceId_courseId_assessmentId_fkey" FOREIGN KEY ("workspaceId", "courseId", "assessmentId") REFERENCES "Assessment"("workspaceId", "courseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_workspaceId_assessmentId_assessmentVersi_fkey" FOREIGN KEY ("workspaceId", "assessmentId", "assessmentVersionId") REFERENCES "AssessmentVersion"("workspaceId", "assessmentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_workspaceId_courseId_enrollmentId_fkey" FOREIGN KEY ("workspaceId", "courseId", "enrollmentId") REFERENCES "Enrollment"("workspaceId", "courseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptQuestion" ADD CONSTRAINT "AttemptQuestion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptQuestion" ADD CONSTRAINT "AttemptQuestion_workspaceId_attemptId_fkey" FOREIGN KEY ("workspaceId", "attemptId") REFERENCES "AssessmentAttempt"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptQuestion" ADD CONSTRAINT "AttemptQuestion_workspaceId_questionVersionId_fkey" FOREIGN KEY ("workspaceId", "questionVersionId") REFERENCES "QuestionVersion"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_workspaceId_attemptId_fkey" FOREIGN KEY ("workspaceId", "attemptId") REFERENCES "AssessmentAttempt"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_workspaceId_attemptId_attemptQuestionId_fkey" FOREIGN KEY ("workspaceId", "attemptId", "attemptQuestionId") REFERENCES "AttemptQuestion"("workspaceId", "attemptId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerAttachment" ADD CONSTRAINT "AnswerAttachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerAttachment" ADD CONSTRAINT "AnswerAttachment_workspaceId_answerId_fkey" FOREIGN KEY ("workspaceId", "answerId") REFERENCES "AttemptAnswer"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerAttachment" ADD CONSTRAINT "AnswerAttachment_workspaceId_assetId_fkey" FOREIGN KEY ("workspaceId", "assetId") REFERENCES "Asset"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeEvent" ADD CONSTRAINT "GradeEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeEvent" ADD CONSTRAINT "GradeEvent_workspaceId_attemptId_fkey" FOREIGN KEY ("workspaceId", "attemptId") REFERENCES "AssessmentAttempt"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeEvent" ADD CONSTRAINT "GradeEvent_workspaceId_attemptId_answerId_fkey" FOREIGN KEY ("workspaceId", "attemptId", "answerId") REFERENCES "AttemptAnswer"("workspaceId", "attemptId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeEvent" ADD CONSTRAINT "GradeEvent_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCourse" ADD CONSTRAINT "ProductCourse_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCourse" ADD CONSTRAINT "ProductCourse_workspaceId_productId_fkey" FOREIGN KEY ("workspaceId", "productId") REFERENCES "Product"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCourse" ADD CONSTRAINT "ProductCourse_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Price" ADD CONSTRAINT "Price_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Price" ADD CONSTRAINT "Price_workspaceId_productId_fkey" FOREIGN KEY ("workspaceId", "productId") REFERENCES "Product"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponProduct" ADD CONSTRAINT "CouponProduct_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponProduct" ADD CONSTRAINT "CouponProduct_workspaceId_couponId_fkey" FOREIGN KEY ("workspaceId", "couponId") REFERENCES "Coupon"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponProduct" ADD CONSTRAINT "CouponProduct_workspaceId_productId_fkey" FOREIGN KEY ("workspaceId", "productId") REFERENCES "Product"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCustomer" ADD CONSTRAINT "BillingCustomer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCustomer" ADD CONSTRAINT "BillingCustomer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_workspaceId_couponId_fkey" FOREIGN KEY ("workspaceId", "couponId") REFERENCES "Coupon"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_workspaceId_orderId_fkey" FOREIGN KEY ("workspaceId", "orderId") REFERENCES "Order"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_workspaceId_productId_fkey" FOREIGN KEY ("workspaceId", "productId") REFERENCES "Product"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_workspaceId_priceId_fkey" FOREIGN KEY ("workspaceId", "priceId") REFERENCES "Price"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemCourse" ADD CONSTRAINT "OrderItemCourse_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemCourse" ADD CONSTRAINT "OrderItemCourse_workspaceId_orderItemId_fkey" FOREIGN KEY ("workspaceId", "orderItemId") REFERENCES "OrderItem"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemCourse" ADD CONSTRAINT "OrderItemCourse_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemCourse" ADD CONSTRAINT "OrderItemCourse_workspaceId_courseId_cohortId_fkey" FOREIGN KEY ("workspaceId", "courseId", "cohortId") REFERENCES "Cohort"("workspaceId", "courseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_workspaceId_couponId_fkey" FOREIGN KEY ("workspaceId", "couponId") REFERENCES "Coupon"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_workspaceId_orderId_fkey" FOREIGN KEY ("workspaceId", "orderId") REFERENCES "Order"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_workspaceId_orderId_fkey" FOREIGN KEY ("workspaceId", "orderId") REFERENCES "Order"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_workspaceId_subscriptionId_fkey" FOREIGN KEY ("workspaceId", "subscriptionId") REFERENCES "Subscription"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_productId_fkey" FOREIGN KEY ("workspaceId", "productId") REFERENCES "Product"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_priceId_fkey" FOREIGN KEY ("workspaceId", "priceId") REFERENCES "Price"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_customerId_fkey" FOREIGN KEY ("workspaceId", "customerId") REFERENCES "BillingCustomer"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_initialOrderId_fkey" FOREIGN KEY ("workspaceId", "initialOrderId") REFERENCES "Order"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_workspaceId_paymentId_fkey" FOREIGN KEY ("workspaceId", "paymentId") REFERENCES "Payment"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundItem" ADD CONSTRAINT "RefundItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundItem" ADD CONSTRAINT "RefundItem_workspaceId_refundId_fkey" FOREIGN KEY ("workspaceId", "refundId") REFERENCES "Refund"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundItem" ADD CONSTRAINT "RefundItem_workspaceId_orderItemId_fkey" FOREIGN KEY ("workspaceId", "orderItemId") REFERENCES "OrderItem"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateTemplate" ADD CONSTRAINT "CertificateTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateTemplate" ADD CONSTRAINT "CertificateTemplate_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateTemplate" ADD CONSTRAINT "CertificateTemplate_workspaceId_backgroundAssetId_fkey" FOREIGN KEY ("workspaceId", "backgroundAssetId") REFERENCES "Asset"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_workspaceId_enrollmentId_fkey" FOREIGN KEY ("workspaceId", "enrollmentId") REFERENCES "Enrollment"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_workspaceId_templateId_fkey" FOREIGN KEY ("workspaceId", "templateId") REFERENCES "CertificateTemplate"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_workspaceId_documentAssetId_fkey" FOREIGN KEY ("workspaceId", "documentAssetId") REFERENCES "Asset"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_workspaceId_lessonId_fkey" FOREIGN KEY ("workspaceId", "lessonId") REFERENCES "Lesson"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_workspaceId_enrollmentId_fkey" FOREIGN KEY ("workspaceId", "enrollmentId") REFERENCES "Enrollment"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCourseMetric" ADD CONSTRAINT "DailyCourseMetric_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCourseMetric" ADD CONSTRAINT "DailyCourseMetric_workspaceId_courseId_fkey" FOREIGN KEY ("workspaceId", "courseId") REFERENCES "Course"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportExport" ADD CONSTRAINT "ReportExport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportExport" ADD CONSTRAINT "ReportExport_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportExport" ADD CONSTRAINT "ReportExport_workspaceId_assetId_fkey" FOREIGN KEY ("workspaceId", "assetId") REFERENCES "Asset"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReceipt" ADD CONSTRAINT "EventReceipt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReceipt" ADD CONSTRAINT "EventReceipt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Architecture section 8: reviewed SQL-only invariants. NULL optional ranges pass intentionally.
ALTER TABLE "User" ADD CONSTRAINT "user_platform_role" CHECK ("platformRole" IN ('STUDENT', 'SUPER_ADMIN'));
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_tenant_role" CHECK ("role" <> 'SUPER_ADMIN' );
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_tenant_role" CHECK ("role" <> 'SUPER_ADMIN' );
ALTER TABLE "User" ADD CONSTRAINT "User_email_normalized" CHECK ("email" = lower(btrim("email")) AND length("email") > 0);
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_email_normalized" CHECK ("email" = lower(btrim("email")) AND length("email") > 0);
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_slug_normalized" CHECK ("slug" = lower(btrim("slug")) AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "Course" ADD CONSTRAINT "Course_slug_normalized" CHECK ("slug" = lower(btrim("slug")) AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "Product" ADD CONSTRAINT "Product_slug_normalized" CHECK ("slug" = lower(btrim("slug")) AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "Category" ADD CONSTRAINT "Category_slug_normalized" CHECK ("slug" = lower(btrim("slug")) AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "Coupon" ADD CONSTRAINT "coupon_code_normalized" CHECK ("code" = upper(btrim("code")) AND length("code") > 0);
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_defaultCurrency_format" CHECK ("defaultCurrency" ~ '^[a-z]{3}$');
ALTER TABLE "Course" ADD CONSTRAINT "Course_estimatedMinutes_range" CHECK ("estimatedMinutes" >= 0);
ALTER TABLE "Course" ADD CONSTRAINT "Course_version_range" CHECK ("version" > 0);
ALTER TABLE "CoursePrerequisite" ADD CONSTRAINT "CoursePrerequisite_minimumPercent_range" CHECK ("minimumPercent" BETWEEN 0 AND 100 AND "minimumPercent"::text <> 'NaN');
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_estimatedMinutes_range" CHECK ("estimatedMinutes" >= 0);
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_requiredWatchPercent_range" CHECK ("requiredWatchPercent" BETWEEN 0 AND 100);
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_releaseOffsetDays_range" CHECK ("releaseOffsetDays" >= 0);
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_version_range" CHECK ("version" > 0);
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_sizeBytes_range" CHECK ("sizeBytes" > 0);
ALTER TABLE "Cohort" ADD CONSTRAINT "Cohort_capacity_range" CHECK ("capacity" > 0);
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_completionPercent_range" CHECK ("completionPercent" BETWEEN 0 AND 100 AND "completionPercent"::text <> 'NaN');
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_positionSeconds_range" CHECK ("positionSeconds" >= 0);
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_watchedSeconds_range" CHECK ("watchedSeconds" >= 0);
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_completionPercent_range" CHECK ("completionPercent" BETWEEN 0 AND 100 AND "completionPercent"::text <> 'NaN');
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_durationSeconds_range" CHECK ("durationSeconds" >= 0);
ALTER TABLE "QuestionVersion" ADD CONSTRAINT "QuestionVersion_version_range" CHECK ("version" > 0);
ALTER TABLE "QuestionVersion" ADD CONSTRAINT "QuestionVersion_defaultPoints_range" CHECK ("defaultPoints" >= 0 AND "defaultPoints"::text <> 'NaN');
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_currentPublishedVersion_range" CHECK ("currentPublishedVersion" > 0);
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_version_range" CHECK ("version" > 0);
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_maxAttempts_range" CHECK ("maxAttempts" > 0);
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_timeLimitSeconds_range" CHECK ("timeLimitSeconds" > 0);
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_latePenaltyPercent_range" CHECK ("latePenaltyPercent" BETWEEN 0 AND 100 AND "latePenaltyPercent"::text <> 'NaN');
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_passPercent_range" CHECK ("passPercent" BETWEEN 0 AND 100 AND "passPercent"::text <> 'NaN');
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_maxUploadBytes_range" CHECK ("maxUploadBytes" > 0);
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_maxFiles_range" CHECK ("maxFiles" > 0);
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_points_range" CHECK ("points" >= 0 AND "points"::text <> 'NaN');
ALTER TABLE "AssessmentPool" ADD CONSTRAINT "AssessmentPool_count_range" CHECK ("count" > 0);
ALTER TABLE "AssessmentPool" ADD CONSTRAINT "AssessmentPool_pointsEach_range" CHECK ("pointsEach" >= 0 AND "pointsEach"::text <> 'NaN');
ALTER TABLE "AssessmentAccommodation" ADD CONSTRAINT "AssessmentAccommodation_extraTimeSeconds_range" CHECK ("extraTimeSeconds" >= 0);
ALTER TABLE "AssessmentAccommodation" ADD CONSTRAINT "AssessmentAccommodation_extraAttempts_range" CHECK ("extraAttempts" >= 0);
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_number_range" CHECK ("number" > 0);
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_totalPoints_range" CHECK ("totalPoints" >= 0 AND "totalPoints"::text <> 'NaN');
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_awardedPoints_range" CHECK ("awardedPoints" >= 0 AND "awardedPoints"::text <> 'NaN');
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_percent_range" CHECK ("percent" BETWEEN 0 AND 100 AND "percent"::text <> 'NaN');
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_version_range" CHECK ("version" > 0);
ALTER TABLE "AttemptQuestion" ADD CONSTRAINT "AttemptQuestion_points_range" CHECK ("points" >= 0 AND "points"::text <> 'NaN');
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_awardedPoints_range" CHECK ("awardedPoints" >= 0 AND "awardedPoints"::text <> 'NaN');
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_version_range" CHECK ("version" > 0);
ALTER TABLE "GradeEvent" ADD CONSTRAINT "GradeEvent_previousPoints_range" CHECK ("previousPoints" >= 0 AND "previousPoints"::text <> 'NaN');
ALTER TABLE "GradeEvent" ADD CONSTRAINT "GradeEvent_awardedPoints_range" CHECK ("awardedPoints" >= 0 AND "awardedPoints"::text <> 'NaN');
ALTER TABLE "Product" ADD CONSTRAINT "Product_accessDurationDays_range" CHECK ("accessDurationDays" >= 0);
ALTER TABLE "Price" ADD CONSTRAINT "Price_amount_range" CHECK ("amount" >= 0);
ALTER TABLE "Price" ADD CONSTRAINT "Price_intervalCount_range" CHECK ("intervalCount" > 0);
ALTER TABLE "Price" ADD CONSTRAINT "Price_trialDays_range" CHECK ("trialDays" >= 0);
ALTER TABLE "Price" ADD CONSTRAINT "Price_currency_format" CHECK ("currency" ~ '^[a-z]{3}$');
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_percentOff_range" CHECK ("percentOff" BETWEEN 0 AND 100 AND "percentOff"::text <> 'NaN');
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_amountOff_range" CHECK ("amountOff" >= 0);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_maxRedemptions_range" CHECK ("maxRedemptions" > 0);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_maxPerUser_range" CHECK ("maxPerUser" > 0);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_minimumOrderAmount_range" CHECK ("minimumOrderAmount" >= 0);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_currency_format" CHECK ("currency" ~ '^[a-z]{3}$');
ALTER TABLE "Order" ADD CONSTRAINT "Order_subtotal_range" CHECK ("subtotal" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_discountTotal_range" CHECK ("discountTotal" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_taxTotal_range" CHECK ("taxTotal" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_grandTotal_range" CHECK ("grandTotal" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_currency_format" CHECK ("currency" ~ '^[a-z]{3}$');
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_unitAmount_range" CHECK ("unitAmount" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_discountAmount_range" CHECK ("discountAmount" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_taxAmount_range" CHECK ("taxAmount" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_totalAmount_range" CHECK ("totalAmount" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_accessDurationDays_range" CHECK ("accessDurationDays" >= 0);
ALTER TABLE "OrderItemCourse" ADD CONSTRAINT "OrderItemCourse_accessDurationDays_range" CHECK ("accessDurationDays" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_range" CHECK ("amount" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_currency_format" CHECK ("currency" ~ '^[a-z]{3}$');
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amount_range" CHECK ("amount" > 0);
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_currency_format" CHECK ("currency" ~ '^[a-z]{3}$');
ALTER TABLE "RefundItem" ADD CONSTRAINT "RefundItem_amount_range" CHECK ("amount" > 0);
ALTER TABLE "StripeWebhook" ADD CONSTRAINT "StripeWebhook_attempts_range" CHECK ("attempts" >= 0);
ALTER TABLE "CertificateTemplate" ADD CONSTRAINT "CertificateTemplate_version_range" CHECK ("version" > 0);
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_attempts_range" CHECK ("attempts" >= 0);
ALTER TABLE "DailyCourseMetric" ADD CONSTRAINT "DailyCourseMetric_newEnrollments_range" CHECK ("newEnrollments" >= 0);
ALTER TABLE "DailyCourseMetric" ADD CONSTRAINT "DailyCourseMetric_activeLearners_range" CHECK ("activeLearners" >= 0);
ALTER TABLE "DailyCourseMetric" ADD CONSTRAINT "DailyCourseMetric_completions_range" CHECK ("completions" >= 0);
ALTER TABLE "DailyCourseMetric" ADD CONSTRAINT "DailyCourseMetric_learningSeconds_range" CHECK ("learningSeconds" >= 0);
ALTER TABLE "DailyCourseMetric" ADD CONSTRAINT "DailyCourseMetric_assessmentSubmissions_range" CHECK ("assessmentSubmissions" >= 0);
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_schemaVersion_range" CHECK ("schemaVersion" > 0);
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_attempts_range" CHECK ("attempts" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "order_money_equation" CHECK ("discountTotal" <= "subtotal" AND "subtotal"::bigint - "discountTotal" + "taxTotal" = "grandTotal");
ALTER TABLE "OrderItem" ADD CONSTRAINT "order_item_money_equation" CHECK ("quantity" = 1 AND "discountAmount" <= "unitAmount"::bigint * "quantity" AND "unitAmount"::bigint * "quantity" - "discountAmount" + "taxAmount" = "totalAmount");
ALTER TABLE "Coupon" ADD CONSTRAINT "coupon_discount_shape" CHECK (("kind" = 'PERCENT' AND "percentOff" IS NOT NULL AND "amountOff" IS NULL AND "currency" IS NULL) OR ("kind" = 'FIXED' AND "percentOff" IS NULL AND "amountOff" IS NOT NULL AND "currency" IS NOT NULL));
ALTER TABLE "Price" ADD CONSTRAINT "price_one_time_configuration" CHECK ("interval" IS NOT NULL OR ("intervalCount" = 1 AND "trialDays" = 0));
ALTER TABLE "EnrollmentGrant" ADD CONSTRAINT "grant_source_shape" CHECK (("source" = 'ORDER_ITEM' AND "orderItemId" IS NOT NULL AND "subscriptionId" IS NULL) OR ("source" = 'SUBSCRIPTION' AND "subscriptionId" IS NOT NULL AND "orderItemId" IS NULL AND "expiresAt" IS NOT NULL AND isfinite("expiresAt")) OR ("source" = 'FREE' AND "orderItemId" IS NULL AND "subscriptionId" IS NULL) OR ("source" = 'MANUAL' AND "orderItemId" IS NULL AND "subscriptionId" IS NULL AND "grantedById" IS NOT NULL AND "reason" IS NOT NULL AND length(btrim("reason")) > 0));
ALTER TABLE "Lesson" ADD CONSTRAINT "lesson_release_shape" CHECK (("releaseType" = 'IMMEDIATE' AND "releaseAt" IS NULL AND "releaseOffsetDays" IS NULL) OR ("releaseType" = 'ABSOLUTE' AND "releaseAt" IS NOT NULL AND "releaseOffsetDays" IS NULL) OR ("releaseType" IN ('ENROLLMENT_OFFSET','COHORT_OFFSET') AND "releaseAt" IS NULL AND "releaseOffsetDays" IS NOT NULL));
ALTER TABLE "Payment" ADD CONSTRAINT "payment_source_present" CHECK ("orderId" IS NOT NULL OR "subscriptionId" IS NOT NULL);
ALTER TABLE "CoursePrerequisite" ADD CONSTRAINT "CoursePrerequisite_no_self_link" CHECK ("courseId" <> "requiredCourseId");
ALTER TABLE "LessonPrerequisite" ADD CONSTRAINT "LessonPrerequisite_no_self_link" CHECK ("lessonId" <> "requiredLessonId");
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_no_self_link" CHECK ("id" <> "parentId");
ALTER TABLE "Cohort" ADD CONSTRAINT "Cohort_startsAt_endsAt_ordered" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Cohort" ADD CONSTRAINT "Cohort_enrollmentOpensAt_enrollmentClosesAt_ordered" CHECK ("enrollmentClosesAt" > "enrollmentOpensAt");
ALTER TABLE "CohortLessonRelease" ADD CONSTRAINT "CohortLessonRelease_releaseAt_availableUntil_ordered" CHECK ("availableUntil" > "releaseAt");
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_releaseAt_availableUntil_ordered" CHECK ("availableUntil" > "releaseAt");
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_startsAt_endsAt_ordered" CHECK ("endsAt" > "startsAt");
ALTER TABLE "EnrollmentGrant" ADD CONSTRAINT "EnrollmentGrant_startsAt_expiresAt_ordered" CHECK ("expiresAt" > "startsAt");
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_validFrom_validUntil_ordered" CHECK ("validUntil" > "validFrom");
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_availableFrom_dueAt_ordered" CHECK ("dueAt" > "availableFrom");
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_availableFrom_availableUntil_ordered" CHECK ("availableUntil" > "availableFrom");
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_dueAt_availableUntil_ordered" CHECK ("availableUntil" >= "dueAt");
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_currentPeriodStart_currentPeriodEnd_ordered" CHECK ("currentPeriodEnd" > "currentPeriodStart");
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_createdAt_expiresAt_ordered" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_createdAt_expiresAt_ordered" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_createdAt_expiresAt_ordered" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdAt_expiresAt_ordered" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "ReportExport" ADD CONSTRAINT "ReportExport_createdAt_expiresAt_ordered" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_createdAt_expiresAt_ordered" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_startedAt_deadlineAt_ordered" CHECK ("deadlineAt" > "startedAt");
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_joinedAt_leftAt_ordered" CHECK ("leftAt" >= "joinedAt");
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "attempt_award_bounded" CHECK ("awardedPoints" <= "totalPoints");

ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_startedAt_ordered" CHECK ("startedAt" >= "enrolledAt");
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_completedAt_ordered" CHECK ("completedAt" >= "enrolledAt" AND "completedAt" >= "startedAt");

-- Do not constrain Section/Lesson positions: reorder uses temporary negative values.
CREATE UNIQUE INDEX "one_open_attempt_per_assessment_enrollment"
 ON "AssessmentAttempt" ("assessmentId", "enrollmentId") WHERE "status" = 'IN_PROGRESS';
CREATE UNIQUE INDEX "one_published_assessment_version"
 ON "AssessmentVersion" ("assessmentId") WHERE "status" = 'PUBLISHED';
CREATE UNIQUE INDEX "global_notification_preference_unique"
 ON "NotificationPreference" ("userId", "type", "channel") WHERE "workspaceId" IS NULL;
CREATE INDEX "pending_outbox_available" ON "OutboxEvent" ("availableAt", "sequence")
 WHERE "status" = 'PENDING';
CREATE INDEX "pending_stripe_webhook" ON "StripeWebhook" ("createdAt", "id")
 WHERE "status" = 'RECEIVED';

COMMIT;
