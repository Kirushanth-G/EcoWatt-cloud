/*
  Warnings:

  - You are about to drop the column `compressed_payload` on the `eco_data` table. All the data in the column will be lost.
  - You are about to drop the column `compressed_size` on the `eco_data` table. All the data in the column will be lost.
  - You are about to drop the column `original_size` on the `eco_data` table. All the data in the column will be lost.
  - Added the required column `export_power` to the `eco_data` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fac1` to the `eco_data` table without a default value. This is not possible if the table is not empty.
  - Added the required column `iac1` to the `eco_data` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ipv1` to the `eco_data` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ipv2` to the `eco_data` table without a default value. This is not possible if the table is not empty.
  - Added the required column `output_power` to the `eco_data` table without a default value. This is not possible if the table is not empty.
  - Added the required column `temperature` to the `eco_data` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vac1` to the `eco_data` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vpv1` to the `eco_data` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vpv2` to the `eco_data` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."eco_data" DROP COLUMN "compressed_payload",
DROP COLUMN "compressed_size",
DROP COLUMN "original_size",
ADD COLUMN     "export_power" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "fac1" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "iac1" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "ipv1" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "ipv2" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "output_power" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "temperature" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "vac1" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "vpv1" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "vpv2" DOUBLE PRECISION NOT NULL;
