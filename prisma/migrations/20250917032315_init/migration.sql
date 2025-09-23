-- CreateTable
CREATE TABLE "public"."EcoData" (
    "id" SERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "compressedPayload" JSONB NOT NULL,
    "originalSize" INTEGER,
    "compressedSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcoData_pkey" PRIMARY KEY ("id")
);
