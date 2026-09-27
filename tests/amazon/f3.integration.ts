import assert from "node:assert/strict";
import { formatExactMoney, presentAmazonProfit } from "../../app/connectors/amazon/amazon-profit-presentation";
import { loadAmazonProfitDiagnostic } from "../../app/connectors/amazon/amazon-profit-ui.server";

const connection = { id: "amazon-a", accountId: "account-a", channel: "AMAZON", status: "ACTIVE" };
const order = { id: "order-a", accountId: "account-a", channelConnectionId: "amazon-a",
  sourceSystem: "AMAZON", sourceOrderKey: "AMZ-100", marketplaceId: "market-a",
  marketplace: { externalMarketplaceId: "A1PA6795UKMFR9" } };
const latest = { id: "revision-a", accountId: "account-a", channelConnectionId: "amazon-a",
  occurredAt: new Date("2026-09-15T10:00:00Z"), createdAt: new Date("2026-09-15T10:00:00Z"), order };
const policy = { id: "policy-a", activatedAt: new Date("2026-01-01T00:00:00Z") };
const exact = (amountAtoms: bigint, amountScale = 2, currencyCode = "EUR") =>
  ({ amountAtoms, amountScale, currencyCode });

function fakeDb(options: { hasConnection?: boolean; hasOrder?: boolean; hasPolicy?: boolean } = {}) {
  const reads: string[] = [];
  const db = {
    channelConnection: { findFirst: async ({ where }: { where: { accountId: string } }) => {
      reads.push(`connection:${where.accountId}`); return options.hasConnection === false || where.accountId !== "account-a" ? null : connection;
    } },
    normalizedOrderRevision: { findFirst: async ({ where }: { where: { accountId: string; channelConnectionId: string } }) => {
      reads.push(`order:${where.accountId}:${where.channelConnectionId}`);
      return options.hasOrder === false || where.accountId !== "account-a" ? null : latest;
    } },
    currencyPolicyVersion: { findFirst: async () => { reads.push("policy"); return options.hasPolicy === false ? null : policy; } },
    $transaction: async (callback: (tx: object) => unknown) => { reads.push("transaction-read"); return callback({}); },
  };
  return { db: db as never, reads };
}

assert.equal(formatExactMoney(exact(10000n)), "€100.00");
assert.equal(formatExactMoney(exact(-1800n)), "-€18.00");
assert.equal(formatExactMoney(exact(0n)), "€0.00");
assert.equal(formatExactMoney(exact(10n, 2)), "€0.10");
assert.equal(formatExactMoney(exact(20n, 2)), "€0.20");
assert.equal(formatExactMoney(exact(123456789n, 6, "XYZ")), "XYZ 123.456789");

const none = fakeDb({ hasConnection: false });
assert.deepEqual(await loadAmazonProfitDiagnostic({ db: none.db, accountId: "account-a" }), { state: "NO_CONNECTION" });
const empty = fakeDb({ hasOrder: false });
assert.deepEqual(await loadAmazonProfitDiagnostic({ db: empty.db, accountId: "account-a" }), { state: "NO_ORDERS" });

const readyDb = fakeDb();
const ready = await loadAmazonProfitDiagnostic({ db: readyDb.db, accountId: "account-a", now: new Date("2026-09-20T00:00:00Z"),
  readProfit: (async (_tx: unknown, input: { tenant: { accountId: string; channelConnectionId: string };
    orderId: string; startInclusive: Date; endExclusive: Date }) => {
    assert.equal(input.tenant.accountId, "account-a"); assert.equal(input.tenant.channelConnectionId, "amazon-a");
    assert.equal(input.orderId, "order-a"); assert.equal(input.startInclusive.toISOString(), "2026-09-01T00:00:00.000Z");
    assert.equal(input.endExclusive.toISOString(), "2026-10-01T00:00:00.000Z");
    return { status: "READY", orderId: "order-a", sourceOrderId: "AMZ-100", marketplaceId: "market-a",
      reasonCodes: [], revenue: exact(10000n), amazonFees: exact(-1800n), cogs: exact(3500n), tax: exact(0n),
      otherContribution: exact(0n), profit: exact(4700n), currencyCode: "EUR" };
  }) as never });
assert.equal(ready.state, "RESULT"); if (ready.state !== "RESULT" || ready.result.status !== "READY") throw new Error("READY expected");
assert.deepEqual([ready.result.revenue, ready.result.amazonFees, ready.result.cogs, ready.result.tax, ready.result.profit],
  ["€100.00", "-€18.00", "-€35.00", "€0.00", "€47.00"]);
assert.deepEqual(readyDb.reads, ["connection:account-a", "order:account-a:amazon-a", "policy", "transaction-read"]);

for (const [code, reasonKey] of [["UNKNOWN_COST", "costRequired"], ["MIXED_CURRENCY_WITHOUT_FX", "fxRequired"]] as const) {
  const blocked = presentAmazonProfit({ status: "BLOCKED", orderId: "order-a", sourceOrderId: "AMZ-100",
    marketplaceId: "market-a", reasonCodes: [code] });
  assert.equal(blocked.status, "BLOCKED"); assert.equal(blocked.reasonKey, reasonKey);
  assert.equal("profit" in blocked, false);
}

const foreign = fakeDb();
assert.deepEqual(await loadAmazonProfitDiagnostic({ db: foreign.db, accountId: "account-b" }), { state: "NO_CONNECTION" });
assert.deepEqual(foreign.reads, ["connection:account-b"]);
console.log("Amazon F3 profit UI boundary and presentation: PASS");
