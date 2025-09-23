/*
  Warnings:

  - You are about to drop the `EcoData` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "public"."EcoData";

-- CreateTable
CREATE TABLE "public"."eco_data" (
    "id" BIGSERIAL NOT NULL,
    "device_id" TEXT NOT NULL,
    "compressed_payload" JSONB NOT NULL,
    "original_size" INTEGER,
    "compressed_size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eco_data_pkey" PRIMARY KEY ("id")
);
