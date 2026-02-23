-- CreateTable
CREATE TABLE `ProjectEmployee` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `employeeId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProjectEmployee_projectId_idx`(`projectId`),
    INDEX `ProjectEmployee_employeeId_idx`(`employeeId`),
    UNIQUE INDEX `ProjectEmployee_projectId_employeeId_key`(`projectId`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProjectEmployee` ADD CONSTRAINT `ProjectEmployee_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectEmployee` ADD CONSTRAINT `ProjectEmployee_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
