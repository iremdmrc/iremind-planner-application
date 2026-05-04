/*
  Warnings:

  - You are about to drop the column `summary` on the `Note` table. All the data in the column will be lost.
  - You are about to drop the column `topics` on the `Note` table. All the data in the column will be lost.
  - The `status` column on the `Task` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `timezone` on the `User` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `Notebook` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'WORKING', 'STUCK', 'DONE');

-- DropIndex
DROP INDEX "public"."Task_dueDate_idx";

-- DropIndex
DROP INDEX "public"."Task_userId_idx";

-- AlterTable
ALTER TABLE "Note" DROP COLUMN "summary",
DROP COLUMN "topics";

-- AlterTable
ALTER TABLE "Notebook" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "TaskStatus" NOT NULL DEFAULT 'TODO';

-- AlterTable
ALTER TABLE "User" DROP COLUMN "timezone",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
