-- AlterTable
ALTER TABLE "auction_prices" ADD COLUMN     "outlierCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "daily_prices" ADD COLUMN     "excludedMarkets" INTEGER NOT NULL DEFAULT 0;
