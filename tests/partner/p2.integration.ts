import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-partner-p2-"));
const databasePath = path.join(directory, "partner.sqlite");
const setup = new DatabaseSync(databasePath);
setup.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((entry) => /^\d{14}_/.test(entry)).sort()) {
  setup.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
}
setup.close();
process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
process.env.NODE_ENV = "test";
process.env.SHOPIFY_APP_URL = "https://app.marginlab.test";
process.env.SHOPIFY_APP_HANDLE = "marginlab";

const SECRET = "p2-test-cookie-secret";
const now = new Date("2026-10-01T12:00:00Z");
const cookieHeader = (setCookie: string) => setCookie.split(";", 1)[0];

try {
  const [{ PrismaClient }, p1, flow, authenticatedShopify, authStub, appDb, referralRoute] = await Promise.all([
    import("@prisma/client"),
    import("../../app/services/partner-program.server"),
    import("../../app/services/partner-referral-flow.server"),
    import("../../app/services/authenticated-shopify-context.server"),
    import("../tenancy/authenticate.stub"),
    import("../../app/db.server"),
    import("../../app/routes/r.$code"),
  ]);
  const db = new PrismaClient();
  try {
    const partnerA = await p1.registerPartner(db, { displayName: "Creator A", referralCode: "creator-a" });
    const partnerB = await p1.registerPartner(db, { displayName: "Creator B", referralCode: "creator-b" });
    await p1.registerPartner(db, { displayName: "Paused", referralCode: "paused", status: "PAUSED" });

    process.env.SHOPIFY_API_SECRET = SECRET;
    const captureResponse = await referralRoute.loader({
      request: new Request("https://app.marginlab.test/r/creator-a"), params: { code: "creator-a" },
    } as never);
    assert.equal(captureResponse.status, 302);
    assert.equal(captureResponse.headers.get("Location"), "https://apps.shopify.com/marginlab");
    const validCookie = captureResponse.headers.get("Set-Cookie")!;
    assert.match(validCookie, /HttpOnly/);
    assert.match(validCookie, /SameSite=Lax/);
    assert.match(validCookie, new RegExp(`Max-Age=${flow.PARTNER_REFERRAL_TTL_SECONDS}`));
    assert.doesNotMatch(validCookie, /account/i);
    const cookieA = cookieHeader(validCookie);

    assert.equal((await flow.capturePartnerReferral(db,
      new Request("https://marginlab.test/?ref=missing"), SECRET, now)).captured, false);
    assert.equal((await flow.capturePartnerReferral(db,
      new Request("https://marginlab.test/?ref=%20bad!"), SECRET, now)).captured, false);
    assert.equal((await flow.capturePartnerReferral(db,
      new Request("https://marginlab.test/?ref=paused"), SECRET, now)).captured, false);

    const invalidCapture = await referralRoute.loader({
      request: new Request("https://app.marginlab.test/r/missing"), params: { code: "missing" },
    } as never);
    assert.equal(invalidCapture.status, 302);
    assert.equal(invalidCapture.headers.get("Set-Cookie"), null);

    const secondTouch = await flow.capturePartnerReferral(db, new Request("https://marginlab.test/?ref=creator-b", {
      headers: { Cookie: cookieA },
    }), SECRET, new Date(now.getTime() + 1_000));
    assert.equal("reason" in secondTouch ? secondTouch.reason : null, "FIRST_TOUCH_PRESERVED");
    assert.equal(secondTouch.setCookie, null);
    const routeSecondTouch = await referralRoute.loader({
      request: new Request("https://app.marginlab.test/r/creator-b", { headers: { Cookie: cookieA } }),
      params: { code: "creator-b" },
    } as never);
    assert.equal(routeSecondTouch.headers.get("Set-Cookie"), null);

    const expiredClaim = await flow.claimPartnerReferral(db,
      { accountId: "not-authority", channelConnectionId: "none", channel: "SHOPIFY" }, cookieA, SECRET,
      new Date(now.getTime() + (flow.PARTNER_REFERRAL_TTL_SECONDS + 1) * 1_000));
    assert.equal(expiredClaim.status, "INVALID_OR_EXPIRED");

    const accountA = await db.account.create({ data: {} });
    const channelA = await db.channelConnection.create({ data: {
      accountId: accountA.id, channel: "SHOPIFY", externalAccountId: "p2-a.myshopify.com",
    } });
    await db.legacyShopMapping.create({ data: {
      shopDomain: "p2-a.myshopify.com", accountId: accountA.id, channelConnectionId: channelA.id,
    } });
    const request = new Request(`https://app.marginlab.test/app?accountId=attacker&ref=${partnerB.referralCode}`);
    authStub.registerVerifiedSession(request, "p2-a.myshopify.com");
    authStub.authenticationEvents.length = 0;
    const authenticated = await authenticatedShopify.authenticateShopifyTenant(request);
    assert.deepEqual(authStub.authenticationEvents, ["authenticate.admin", "resolveShopifyTenantContext"]);
    assert.equal(authenticated.tenant.accountId, accountA.id);
    assert.equal(request.headers.get("Cookie"), null, "embedded authentication does not depend on referral cookie");
    const returnUrl = flow.buildEmbeddedPartnerReturnUrl("p2-a.myshopify.com", "marginlab");
    const token = flow.createPartnerClaimToken(authenticated.tenant, returnUrl, SECRET, now);
    assert.equal(token.includes(accountA.id), false);
    assert.match(flow.buildPartnerClaimBridgeUrl("https://app.marginlab.test", token),
      /^https:\/\/app\.marginlab\.test\/partner\/claim\?token=/);
    const tampered = await flow.consumePartnerClaimBridge(db, `${token}tampered`, cookieA, SECRET, now);
    assert.equal(tampered.status, "INVALID_TOKEN");
    assert.equal(tampered.setCookie, null, "forged bridge cannot clear first-touch evidence");
    assert.equal((await flow.consumePartnerClaimBridge(db, token, cookieA, SECRET,
      new Date(now.getTime() + (flow.PARTNER_CLAIM_TOKEN_TTL_SECONDS + 1) * 1_000))).status, "INVALID_TOKEN");
    const claim = await flow.consumePartnerClaimBridge(db, token, cookieA, SECRET, now);
    assert.equal(claim.status, "ATTRIBUTED");
    assert.equal(claim.returnUrl, returnUrl);
    assert.match(claim.setCookie!, /Max-Age=0/);
    const referralA = await p1.getAttributionByAccount(db, accountA.id);
    assert.equal(referralA?.partnerId, partnerA.id);
    assert.equal(await db.partnerMilestoneEvent.count({ where: {
      accountId: accountA.id, referralId: referralA!.id, eventType: "ATTRIBUTED",
    } }), 1);

    const replay = await flow.consumePartnerClaimBridge(db, token, cookieA, SECRET, now);
    assert.equal(replay.status, "ALREADY_ATTRIBUTED");
    assert.equal(await db.partnerReferral.count({ where: { accountId: accountA.id } }), 1);
    assert.equal(await db.partnerMilestoneEvent.count({ where: { referralId: referralA!.id } }), 1);

    const cookieB = cookieHeader((await flow.capturePartnerReferral(db,
      new Request("https://marginlab.test/?ref=creator-b"), SECRET, now)).setCookie!);
    const conflict = await flow.consumePartnerClaimBridge(db, token, cookieB, SECRET, now);
    assert.equal(conflict.status, "CONFLICT_PRESERVED");
    assert.match(conflict.setCookie!, /Max-Age=0/);
    assert.equal((await p1.getAttributionByAccount(db, accountA.id))?.partnerId, partnerA.id);

    const accountB = await db.account.create({ data: {} });
    const channelB = await db.channelConnection.create({ data: {
      accountId: accountB.id, channel: "SHOPIFY", externalAccountId: "p2-b.myshopify.com",
    } });
    await db.legacyShopMapping.create({ data: {
      shopDomain: "p2-b.myshopify.com", accountId: accountB.id, channelConnectionId: channelB.id,
    } });
    const noReferralRequest = new Request("https://marginlab.test/app?accountId=attacker");
    authStub.registerVerifiedSession(noReferralRequest, "p2-b.myshopify.com");
    const noReferralAuthenticated = await authenticatedShopify.authenticateShopifyTenant(noReferralRequest);
    const noReferralToken = flow.createPartnerClaimToken(noReferralAuthenticated.tenant,
      flow.buildEmbeddedPartnerReturnUrl("p2-b.myshopify.com", "marginlab"), SECRET, now);
    const noReferral = await flow.consumePartnerClaimBridge(db, noReferralToken, null, SECRET, now);
    assert.equal(noReferral.status, "NO_REFERRAL");
    assert.equal(await p1.getAttributionByAccount(db, accountB.id), null);
    assert.equal(flow.shouldInitiatePartnerClaimBridge(false, "https://app.marginlab.test/app"), true);
    assert.equal(flow.shouldInitiatePartnerClaimBridge(false,
      "https://app.marginlab.test/app?partner_claim=done"), false);
    assert.equal(flow.shouldInitiatePartnerClaimBridge(true, "https://app.marginlab.test/app"), false);

    await db.legacyShopMapping.delete({ where: { shopDomain: "p2-a.myshopify.com" } });
    await db.channelConnection.delete({ where: { id: channelA.id } });
    assert.equal((await p1.getAttributionByAccount(db, accountA.id))?.partnerId, partnerA.id);
    const publicPartner = await p1.resolvePartnerByReferralCode(db, partnerA.referralCode);
    assert.deepEqual(Object.keys(publicPartner!).sort(),
      ["createdAt", "displayName", "id", "referralCode", "status", "updatedAt"].sort());
    console.log("Partner P2 referral capture and authenticated claim integration checks passed.");
  } finally {
    await Promise.all([db.$disconnect(), appDb.default.$disconnect()]);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
