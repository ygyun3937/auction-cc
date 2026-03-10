-- CreateTable
CREATE TABLE "variety_daily_prices" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "priceDate" DATE NOT NULL,
    "varietyCode" TEXT NOT NULL,
    "varietyName" TEXT NOT NULL,
    "avgPrice" DECIMAL(12,2) NOT NULL,
    "minPrice" DECIMAL(12,2) NOT NULL,
    "maxPrice" DECIMAL(12,2) NOT NULL,
    "totalVolume" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variety_daily_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "variety_daily_prices_productId_priceDate_idx" ON "variety_daily_prices"("productId", "priceDate");

-- CreateIndex
CREATE UNIQUE INDEX "variety_daily_prices_productId_priceDate_varietyCode_key" ON "variety_daily_prices"("productId", "priceDate", "varietyCode");

-- AddForeignKey
ALTER TABLE "variety_daily_prices" ADD CONSTRAINT "variety_daily_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
