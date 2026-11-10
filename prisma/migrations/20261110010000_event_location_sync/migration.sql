ALTER TABLE "Event" ADD COLUMN "location" TEXT;
CREATE TABLE "OrderSyncState" (
  "shop" TEXT NOT NULL PRIMARY KEY,
  "lastSuccessAt" DATETIME NOT NULL,
  "fullHistory" BOOLEAN NOT NULL DEFAULT false
);
