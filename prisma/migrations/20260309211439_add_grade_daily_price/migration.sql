-- CreateTable
CREATE TABLE "grade_daily_prices" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "priceDate" DATE NOT NULL,
    "gradeCode" TEXT NOT NULL,
    "gradeName" TEXT NOT NULL,
    "avgPrice" DECIMAL(12,2) NOT NULL,
    "minPrice" DECIMAL(12,2) NOT NULL,
    "maxPrice" DECIMAL(12,2) NOT NULL,
    "totalVolume" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_daily_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grade_daily_prices_productId_priceDate_idx" ON "grade_daily_prices"("productId", "priceDate");

-- CreateIndex
CREATE UNIQUE INDEX "grade_daily_prices_productId_priceDate_gradeCode_key" ON "grade_daily_prices"("productId", "priceDate", "gradeCode");

-- AddForeignKey
ALTER TABLE "grade_daily_prices" ADD CONSTRAINT "grade_daily_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
