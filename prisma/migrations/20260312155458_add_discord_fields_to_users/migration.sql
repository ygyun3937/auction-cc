-- AlterTable
ALTER TABLE "users" ADD COLUMN     "discordLastNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "discordWebhookUrl" TEXT;
