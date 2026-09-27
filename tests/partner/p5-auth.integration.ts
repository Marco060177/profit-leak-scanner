import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "marginlab-partner-p5-auth-"));
const databasePath = path.join(temporaryDirectory, "auth.sqlite");
const setup = new DatabaseSync(databasePath);
setup.exec("PRAGMA foreign_keys = ON");
for (const name of readdirSync("prisma/migrations").filter((entry) => /^\d{14}_/.test(entry)).sort()) setup.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
setup.close();
process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
process.env.NODE_ENV = "production";

const now = new Date();
const cookieHeader = (setCookie: string) => setCookie.split(";")[0];

try {
  const [{ PrismaClient }, program, auth, dashboard, accessRoute, { default: routeDb }] = await Promise.all([
    import("@prisma/client"), import("../../app/services/partner-program.server"),
    import("../../app/services/partner-auth.server"), import("../../app/services/partner-dashboard.server"),
    import("../../app/routes/partner.access.$token"), import("../../app/db.server"),
  ]);
  const db = new PrismaClient();
  try {
    const partnerA = await program.registerPartner(db, { displayName: "Partner A", referralCode: "AUTH_A" });
    const partnerB = await program.registerPartner(db, { displayName: "Partner B", referralCode: "AUTH_B" });
    const issued = await auth.issuePartnerAccessToken(db, partnerA.id, now);
    assert.match(issued.rawToken, /^[A-Za-z0-9_-]{43}$/);
    const stored = await db.partnerAccessToken.findFirstOrThrow({ where: { partnerId: partnerA.id } });
    assert.notEqual(stored.tokenHash, issued.rawToken);
    assert.equal(JSON.stringify(stored).includes(issued.rawToken), false); // raw token is never persisted

    let redirectResponse: Response | null = null;
    try { await accessRoute.loader({ params: { token: issued.rawToken } } as never); }
    catch (error) { redirectResponse = error as Response; }
    assert.equal(redirectResponse?.status, 302);
    assert.equal(redirectResponse?.headers.get("location"), "/partner");
    const setCookie = redirectResponse!.headers.get("set-cookie")!;
    assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /Secure/); assert.match(setCookie, /SameSite=Lax/); assert.match(setCookie, /Path=\/partner/);

    const authenticatedRequest = new Request("https://app.marginlab.test/partner?partnerId=" + partnerB.id, { headers: { Cookie: cookieHeader(setCookie) } });
    const identity = await auth.authenticatePartner(db, authenticatedRequest, new Date(now.getTime() + 1000));
    assert.deepEqual(identity, { partnerId: partnerA.id });
    const view = await dashboard.getPartnerDashboard(db, identity!);
    assert.equal(view.partner.referralCode, "AUTH_A");
    assert.notEqual(view.partner.referralCode, "AUTH_B"); // URL manipulation cannot select B
    const privateTerms = ["accountId", "referralId", "shopDomain", "billingEvent", "revenue", "orders", "products"];
    for (const term of privateTerms) assert.equal(JSON.stringify(view).toLowerCase().includes(term.toLowerCase()), false);

    assert.equal(await auth.consumePartnerAccessToken(db, issued.rawToken, new Date(now.getTime() + 2000)), null); // single use
    assert.equal(await auth.consumePartnerAccessToken(db, "invalid", now), null);
    assert.equal(await auth.authenticatePartner(db, new Request("https://app.marginlab.test/partner"), now), null);
    const tampered = cookieHeader(setCookie).slice(0, -1) + "X";
    assert.equal(await auth.authenticatePartner(db, new Request("https://app.marginlab.test/partner", { headers: { Cookie: tampered } }), now), null);

    const expired = await auth.issuePartnerAccessToken(db, partnerB.id, new Date(now.getTime() - auth.PARTNER_ACCESS_TOKEN_TTL_MS - 1000));
    assert.equal(await auth.consumePartnerAccessToken(db, expired.rawToken, now), null);
    const revoked = await auth.issuePartnerAccessToken(db, partnerB.id, now);
    await db.partnerAccessToken.updateMany({ where: { partnerId: partnerB.id, consumedAt: null }, data: { revokedAt: now } });
    assert.equal(await auth.consumePartnerAccessToken(db, revoked.rawToken, now), null);

    await db.partner.update({ where: { id: partnerA.id }, data: { status: "INACTIVE" } });
    assert.equal(await auth.authenticatePartner(db, authenticatedRequest, new Date(now.getTime() + 3000)), null);
    const inactiveToken = await auth.issuePartnerAccessToken(db, partnerB.id, now);
    await db.partner.update({ where: { id: partnerB.id }, data: { status: "INACTIVE" } });
    assert.equal(await auth.consumePartnerAccessToken(db, inactiveToken.rawToken, now), null);
    await assert.rejects(auth.issuePartnerAccessToken(db, partnerA.id, now), /Active Partner not found/);

    await db.partner.update({ where: { id: partnerA.id }, data: { status: "ACTIVE" } });
    const logoutIssued = await auth.issuePartnerAccessToken(db, partnerA.id, now);
    const logoutSession = await auth.consumePartnerAccessToken(db, logoutIssued.rawToken, now);
    const logoutRequest = new Request("https://app.marginlab.test/partner/logout", { method: "POST", headers: { Cookie: cookieHeader(logoutSession!.setCookie), Origin: "https://app.marginlab.test" } });
    const logout = await auth.logoutPartner(db, logoutRequest, now);
    assert.match(logout.setCookie, /Max-Age=0/);
    assert.equal(await auth.authenticatePartner(db, new Request("https://app.marginlab.test/partner", { headers: { Cookie: cookieHeader(logoutSession!.setCookie) } }), now), null);
    await assert.rejects(auth.logoutPartner(db, new Request("https://app.marginlab.test/partner/logout", { method: "POST", headers: { Origin: "https://evil.test" } }), now), (error: unknown) => error instanceof Response && error.status === 403);

    const invalidResponse = await accessRoute.loader({ params: { token: "invalid" } } as never) as Response;
    assert.equal(invalidResponse.status, 400);
    assert.equal(await invalidResponse.text(), "This access link is invalid or unavailable.");
    const persisted = JSON.stringify(await db.partnerAccessToken.findMany());
    assert.equal(persisted.includes(issued.rawToken), false);
    console.log("Partner P5.1 secure invitation, session, isolation, inactivity and logout checks passed.");
  } finally { await db.$disconnect(); await routeDb.$disconnect(); }
} finally { rmSync(temporaryDirectory, { recursive: true, force: true }); }
