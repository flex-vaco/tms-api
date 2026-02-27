/*
  Warnings:

  - You are about to drop the column `description` on the `TimeEntry` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `TimeEntry` DROP COLUMN `description`,
    ADD COLUMN `friDesc` TEXT NULL,
    ADD COLUMN `monDesc` TEXT NULL,
    ADD COLUMN `satDesc` TEXT NULL,
    ADD COLUMN `sunDesc` TEXT NULL,
    ADD COLUMN `thuDesc` TEXT NULL,
    ADD COLUMN `tueDesc` TEXT NULL,
    ADD COLUMN `wedDesc` TEXT NULL;
