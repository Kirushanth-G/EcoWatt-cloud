-- CreateTable
CREATE TABLE "public"."configuration_logs" (
    "id" BIGSERIAL NOT NULL,
    "device_id" TEXT,
    "config_sent" JSONB NOT NULL,
    "device_response" JSONB,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuration_logs_pkey" PRIMARY KEY ("id")
);
