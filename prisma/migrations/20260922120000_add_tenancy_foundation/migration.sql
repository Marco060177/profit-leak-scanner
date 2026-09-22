-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChannelConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChannelConnection_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LegacyShopMapping" (
    "shopDomain" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegacyShopMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LegacyShopMapping_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId", "accountId") REFERENCES "ChannelConnection" ("id", "accountId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ChannelConnection_accountId_idx" ON "ChannelConnection"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConnection_channel_externalAccountId_key" ON "ChannelConnection"("channel", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConnection_id_accountId_key" ON "ChannelConnection"("id", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyShopMapping_channelConnectionId_key" ON "LegacyShopMapping"("channelConnectionId");

-- CreateIndex
CREATE INDEX "LegacyShopMapping_accountId_idx" ON "LegacyShopMapping"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyShopMapping_channelConnectionId_accountId_key" ON "LegacyShopMapping"("channelConnectionId", "accountId");
