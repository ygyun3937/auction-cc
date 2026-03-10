-- CreateTable
CREATE TABLE "markets" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_prices" (
    "id" SERIAL NOT NULL,
    "marketId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "auctionDate" DATE NOT NULL,
    "grade" TEXT NOT NULL,
    "avgPrice" DECIMAL(12,2) NOT NULL,
    "minPrice" DECIMAL(12,2) NOT NULL,
    "maxPrice" DECIMAL(12,2) NOT NULL,
    "volume" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_prices" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "priceDate" DATE NOT NULL,
    "avgPrice" DECIMAL(12,2) NOT NULL,
    "minPrice" DECIMAL(12,2) NOT NULL,
    "maxPrice" DECIMAL(12,2) NOT NULL,
    "totalVolume" DECIMAL(12,2) NOT NULL,
    "changeRate" DECIMAL(6,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_logs" (
    "id" SERIAL NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "errorMsg" TEXT,
    "durationMs" INTEGER,

    CONSTRAINT "collection_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "markets_code_key" ON "markets"("code");

-- CreateIndex
CREATE INDEX "markets_region_idx" ON "markets"("region");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_code_key" ON "product_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "auction_prices_auctionDate_idx" ON "auction_prices"("auctionDate");

-- CreateIndex
CREATE INDEX "auction_prices_productId_auctionDate_idx" ON "auction_prices"("productId", "auctionDate");

-- CreateIndex
CREATE INDEX "auction_prices_marketId_auctionDate_idx" ON "auction_prices"("marketId", "auctionDate");

-- CreateIndex
CREATE UNIQUE INDEX "auction_prices_marketId_productId_auctionDate_grade_key" ON "auction_prices"("marketId", "productId", "auctionDate", "grade");

-- CreateIndex
CREATE INDEX "daily_prices_priceDate_idx" ON "daily_prices"("priceDate");

-- CreateIndex
CREATE INDEX "daily_prices_productId_priceDate_idx" ON "daily_prices"("productId", "priceDate");

-- CreateIndex
CREATE INDEX "daily_prices_changeRate_idx" ON "daily_prices"("changeRate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "daily_prices_productId_priceDate_key" ON "daily_prices"("productId", "priceDate");

-- CreateIndex
CREATE INDEX "collection_logs_collectedAt_idx" ON "collection_logs"("collectedAt");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_prices" ADD CONSTRAINT "auction_prices_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_prices" ADD CONSTRAINT "auction_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_prices" ADD CONSTRAINT "daily_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
