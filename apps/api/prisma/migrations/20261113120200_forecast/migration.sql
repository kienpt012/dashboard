CREATE TABLE "ForecastModel" (
  "id" TEXT NOT NULL, "featureVersion" TEXT NOT NULL, "trained" BOOLEAN NOT NULL,
  "coefficients" JSONB NOT NULL, "means" JSONB NOT NULL, "scales" JSONB NOT NULL,
  "intercept" DOUBLE PRECISION NOT NULL, "sampleCount" INTEGER NOT NULL, "targetCount" INTEGER NOT NULL,
  "trainSamples" INTEGER NOT NULL, "testSamples" INTEGER NOT NULL, "simulatedSamples" INTEGER NOT NULL DEFAULT 0,
  "metrics" JSONB, "fallbackReason" TEXT, "trainedById" TEXT, "trainedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForecastModel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ForecastModel_trainedAt_idx" ON "ForecastModel"("trainedAt" DESC);
CREATE TABLE "ForecastHistory" (
  "id" TEXT NOT NULL, "seriesKey" TEXT NOT NULL, "year" INTEGER NOT NULL, "title" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL, "value" DOUBLE PRECISION NOT NULL, "targetValue" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL DEFAULT '', "direction" "TargetDirection" NOT NULL DEFAULT 'HIGHER_IS_BETTER',
  "kind" "FrameworkKind" NOT NULL DEFAULT 'PLAN', "frequency" "TargetFrequency" NOT NULL DEFAULT 'MONTHLY',
  "reportedAt" TIMESTAMP(3) NOT NULL, "dueDate" TIMESTAMP(3) NOT NULL, "simulated" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT NOT NULL, "importedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForecastHistory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ForecastHistory_seriesKey_year_periodKey_simulated_key" ON "ForecastHistory"("seriesKey", "year", "periodKey", "simulated");
CREATE INDEX "ForecastHistory_year_simulated_idx" ON "ForecastHistory"("year", "simulated");
