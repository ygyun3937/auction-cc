-- AlterTable
ALTER TABLE "users" ADD COLUMN     "discordNotifyDays" TEXT,
ADD COLUMN     "discordNotifyHour" INTEGER,
ADD COLUMN     "discordNotifyMinute" INTEGER;
