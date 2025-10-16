/*
  Warnings:

  - You are about to drop the column `firmware_type` on the `fota_updates` table. All the data in the column will be lost.
  - Added the required column `firmware_sha256` to the `fota_updates` table without a default value. This is not possible if the table is not empty.
  - Added the required column `firmware_size` to the `fota_updates` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."idx_fota_updates_created_at";

-- DropIndex
DROP INDEX "public"."idx_fota_updates_status";

-- DropIndex
DROP INDEX "public"."idx_write_commands_created_at";

-- DropIndex
DROP INDEX "public"."idx_write_commands_status";

-- AlterTable
ALTER TABLE "public"."fota_updates" DROP COLUMN "firmware_type",
ADD COLUMN     "firmware_sha256" TEXT NOT NULL,
ADD COLUMN     "firmware_size" INTEGER NOT NULL,
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."write_commands" ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."firmware_storage" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "firmware_storage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."fota_logs" (
    "id" BIGSERIAL NOT NULL,
    "fota_update_id" BIGINT,
    "firmware_sha256" TEXT NOT NULL,
    "download_success" BOOLEAN NOT NULL,
    "verification_success" BOOLEAN NOT NULL,
    "update_success" BOOLEAN NOT NULL,
    "overall_success" BOOLEAN NOT NULL,
    "error_stage" TEXT,
    "error_code" TEXT,
    "download_duration_ms" INTEGER,
    "total_duration_ms" INTEGER,
    "raw_log" TEXT NOT NULL,
    "log_file_path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fota_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."fota_logs" ADD CONSTRAINT "fota_logs_fota_update_id_fkey" FOREIGN KEY ("fota_update_id") REFERENCES "public"."fota_updates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
