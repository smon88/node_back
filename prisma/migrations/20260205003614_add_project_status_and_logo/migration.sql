/*
  Warnings:

  - You are about to drop the column `isActive` on the `Project` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');

-- DropIndex
DROP INDEX "Project_isActive_idx";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "isActive",
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");
