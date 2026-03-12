-- CreateTable
CREATE TABLE "origin_daily_prices" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "priceDate" DATE NOT NULL,
    "originName" TEXT NOT NULL,
    "avgPrice" DECIMAL(12,2) NOT NULL,
    "minPrice" DECIMAL(12,2) NOT NULL,
    "maxPrice" DECIMAL(12,2) NOT NULL,
    "totalVolume" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "origin_daily_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "origin_daily_prices_productId_priceDate_idx" ON "origin_daily_prices"("productId", "priceDate");

-- CreateIndex
CREATE UNIQUE INDEX "origin_daily_prices_productId_priceDate_originName_key" ON "origin_daily_prices"("productId", "priceDate", "originName");

-- AddForeignKey
ALTER TABLE "origin_daily_prices" ADD CONSTRAINT "origin_daily_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
