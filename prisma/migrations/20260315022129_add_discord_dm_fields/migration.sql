-- AlterTable
ALTER TABLE "users" ADD COLUMN "discordUserId" TEXT,
ADD COLUMN "discordUsername" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_discordUserId_key" ON "users"("discordUserId");
