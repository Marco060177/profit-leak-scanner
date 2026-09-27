import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "marginlab-partner-p1-"));
const databasePath = path.join(temporaryDirectory, "partner.sqlite");
const setup = new DatabaseSync(databasePath);
setup.exec("PRAGMA foreign_keys = ON");
for (const name of readdirSync("prisma/migrations").filter((entry) => /^\d{14}_/.test(entry)).sort()) {
  setup.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
}
setup.close();
process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;

try {
  const [{ PrismaClient }, service] = await Promise.all([
    import("@prisma/client"),
    import("../../app/services/partner-program.server"),
  ]);
  const db = new PrismaClient();
  const databaseInvariantRejected = (error: unknown) =>
    typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
  try {
    const first = await service.registerPartner(db, { displayName: "Agency One", referralCode: " agency-one " });
    assert.equal(first.referralCode, "AGENCY-ONE");
    assert.equal((await service.resolvePartnerByReferralCode(db, "agency-one"))?.id, first.id);
    await assert.rejects(service.registerPartner(db, { displayName: "Duplicate", referralCode: "AGENCY-ONE" }), /Unique constraint/);
    const second = await service.registerPartner(db, { displayName: "Creator Two", referralCode: "creator_2" });

    const accountA = await db.account.create({ data: {} });
    const accountB = await db.account.create({ data: {} });
    const connection = await db.channelConnection.create({ data: {
      accountId: accountA.id, channel: "SHOPIFY", externalAccountId: "partner-test.myshopify.com",
    } });
    await db.legacyShopMapping.create({ data: {
      shopDomain: "partner-test.myshopify.com", accountId: accountA.id, channelConnectionId: connection.id,
    } });

    const attributed = await service.attributeAccountToPartner(db, {
      accountId: accountA.id, partnerId: first.id, attributionSource: "REFERRAL_LINK",
      sourceMetadata: { platform: "SHOPIFY", shopDomain: "partner-test.myshopify.com" },
    });
    assert.equal(attributed.accountId, accountA.id);
    assert.equal(attributed.partnerId, first.id);
    assert.equal("channelConnectionId" in attributed, false);
    const replay = await service.attributeAccountToPartner(db, {
      accountId: accountA.id, partnerId: first.id, attributionSource: "REPLAYED_CALLBACK",
    });
    assert.equal(replay.id, attributed.id);
    assert.equal(replay.attributionSource, "REFERRAL_LINK");
    await assert.rejects(service.attributeAccountToPartner(db, {
      accountId: accountA.id, partnerId: second.id, attributionSource: "REFERRAL_LINK",
    }), service.PartnerAttributionConflictError);
    assert.equal((await service.getAttributionByAccount(db, accountA.id))?.partnerId, first.id);

    await assert.rejects(
      db.partnerReferral.delete({ where: { id: attributed.id } }),
      databaseInvariantRejected,
    );
    assert.deepEqual(await service.getAttributionByAccount(db, accountA.id), attributed);
    await assert.rejects(service.attributeAccountToPartner(db, {
      accountId: accountA.id, partnerId: second.id, attributionSource: "REFERRAL_LINK",
    }), service.PartnerAttributionConflictError);

    const immutableMutations = [
      { id: `${attributed.id}-changed` },
      { attributionSource: "MANUAL_REWRITE" },
      { sourceMetadataJson: JSON.stringify({ rewritten: true }) },
      { createdAt: new Date(attributed.createdAt.getTime() + 1_000) },
    ];
    for (const data of immutableMutations) {
      await assert.rejects(
        db.partnerReferral.update({ where: { id: attributed.id }, data }),
        databaseInvariantRejected,
      );
    }
    assert.deepEqual(await service.getAttributionByAccount(db, accountA.id), attributed);
    const qualifiedAt = new Date("2026-11-01T00:00:00Z");
    const qualified = await db.partnerReferral.update({
      where: { id: attributed.id }, data: { status: "QUALIFIED", qualifiedAt },
    });
    assert.equal(qualified.status, "QUALIFIED");
    assert.equal(qualified.qualifiedAt?.getTime(), qualifiedAt.getTime());

    const otherAttribution = await service.attributeAccountToPartner(db, {
      accountId: accountB.id, partnerId: first.id, attributionSource: "MANUAL_APPROVED",
    });
    assert.equal(otherAttribution.partnerId, first.id);

    const occurredAt = new Date("2026-09-27T12:00:00Z");
    const milestone = await service.appendMilestoneEvent(db, {
      accountId: accountA.id, referralId: attributed.id, eventType: "FIRST_PAYMENT_SUCCEEDED",
      idempotencyKey: "billing-period-1", occurredAt, metadata: { providerEventId: "evt-1" },
    });
    const milestoneReplay = await service.appendMilestoneEvent(db, {
      accountId: accountA.id, referralId: attributed.id, eventType: "FIRST_PAYMENT_SUCCEEDED",
      idempotencyKey: "billing-period-1", occurredAt, metadata: { providerEventId: "evt-1" },
    });
    assert.equal(milestoneReplay.id, milestone.id);
    assert.equal(await db.partnerMilestoneEvent.count(), 1);
    await assert.rejects(service.appendMilestoneEvent(db, {
      accountId: accountA.id, referralId: attributed.id, eventType: "SECOND_PAYMENT_SUCCEEDED",
      idempotencyKey: "billing-period-1", occurredAt,
    }), service.PartnerMilestoneReplayConflictError);
    assert.deepEqual((await service.readMilestoneEvents(db, accountA.id, attributed.id)).map((event) => event.id), [milestone.id]);
    assert.deepEqual(await service.readMilestoneEvents(db, accountB.id, attributed.id), []);

    await db.legacyShopMapping.delete({ where: { shopDomain: "partner-test.myshopify.com" } });
    await db.channelConnection.delete({ where: { id: connection.id } });
    const retained = await service.getAttributionByAccount(db, accountA.id);
    assert.equal(retained?.id, attributed.id);
    assert.equal(retained?.status, "QUALIFIED");
    assert.equal(await db.partnerReferral.count({ where: { partnerId: first.id } }), 2);
    console.log("Partner P1 foundation integration checks passed.");
  } finally {
    await db.$disconnect();
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
