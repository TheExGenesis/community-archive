-- Add username column to archive_upload table to store the handle at time of upload
-- This prevents issues when users change their handle after uploading archives

ALTER TABLE "public"."archive_upload" 
ADD COLUMN "username" text;

-- Add a comment to explain the purpose
COMMENT ON COLUMN "public"."archive_upload"."username" IS 'Username/handle at the time of archive upload - used to locate archive files in storage';

-- Populate username column in existing archive_upload records
-- This migration updates existing records to have the username from all_account table

UPDATE "public"."archive_upload" 
SET "username" = "all_account"."username"
FROM "public"."all_account"
WHERE "archive_upload"."account_id" = "all_account"."account_id"
  AND "archive_upload"."username" IS NULL;