import assert from "node:assert/strict";
import test from "node:test";

import type { BillingStatus } from "../../app/utils/margin";
import {
  getBillingStatus,
  getTenantBillingStatus,
} from "../../app/utils/billing.server";
import { createServerPerformanceTrace } from "../../app/utils/server-performance.server";

const growth: BillingStatus = {
  active: true,
  plan: "GROWTH",
  subscriptionName: "Growth",
};

const tenant = (accountId: string, channelConnectionId: string) => ({
  accountId,
  channelConnectionId,
  channel: "SHOPIFY" as const,
  legacyShopDomain: `${accountId}.myshopify.com`,
});
const identityResponse = (
  legacySubscriptions: Array<{ id: string; name: string; status: string }> = [],
) => Response.json({
  data: {
    shop: { id: "gid://shopify/Shop/1" },
    currentAppInstallation: {
      app: { id: "gid://shopify/App/1" },
      activeSubscriptions: legacySubscriptions,
    },
  },
});

async function withoutPartnerCredentials(run: () => Promise<void>) {
  const organizationId = process.env.SHOPIFY_PARTNER_ORG_ID;
  const token = process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;
  delete process.env.SHOPIFY_PARTNER_ORG_ID;
  delete process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;
  try {
    await run();
  } finally {
    if (organizationId === undefined) delete process.env.SHOPIFY_PARTNER_ORG_ID;
    else process.env.SHOPIFY_PARTNER_ORG_ID = organizationId;
    if (token === undefined) delete process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;
    else process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = token;
  }
}

test("deduplicates simultaneous checks for one authenticated tenant", async () => {
  await withoutPartnerCredentials(async () => {
    let graphqlCalls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const admin = {
      graphql: async () => {
        graphqlCalls += 1;
        await gate;
        return identityResponse([{ id: "legacy", name: "Growth", status: "ACTIVE" }]);
      },
    } as never;
    const trustedTenant = tenant("account-a", "connection-a");

    const first = getTenantBillingStatus({ admin, tenant: trustedTenant });
    const second = getTenantBillingStatus({ admin, tenant: trustedTenant });
    await Promise.resolve();
    assert.equal(graphqlCalls, 1);
    release();
    assert.deepEqual(await Promise.all([first, second]), [growth, growth]);
  });
});

test("never shares an in-flight check across tenants", async () => {
  await withoutPartnerCredentials(async () => {
    let graphqlCalls = 0;
    const admin = {
      graphql: async () => {
        graphqlCalls += 1;
        return identityResponse([{ id: "legacy", name: "Growth", status: "ACTIVE" }]);
      },
    } as never;

    await Promise.all([
      getTenantBillingStatus({ admin, tenant: tenant("account-a", "connection-a") }),
      getTenantBillingStatus({ admin, tenant: tenant("account-b", "connection-b") }),
    ]);
    assert.equal(graphqlCalls, 2);
  });
});

test("does not cache completed billing results", async () => {
  await withoutPartnerCredentials(async () => {
    let graphqlCalls = 0;
    const admin = {
      graphql: async () => {
        graphqlCalls += 1;
        return identityResponse();
      },
    } as never;
    const trustedTenant = tenant("account-fresh", "connection-fresh");

    await getTenantBillingStatus({ admin, tenant: trustedTenant });
    await getTenantBillingStatus({ admin, tenant: trustedTenant });
    assert.equal(graphqlCalls, 2, "completed results must never be retained");
  });
});

test("removes failed promises so a later request can retry", async () => {
  await withoutPartnerCredentials(async () => {
    let graphqlCalls = 0;
    let shouldFail = true;
    const admin = {
      graphql: async () => {
        graphqlCalls += 1;
        if (shouldFail) throw new Error("synthetic Shopify failure");
        return identityResponse();
      },
    } as never;
    const trustedTenant = tenant("account-error", "connection-error");

    const failed = await Promise.allSettled([
      getTenantBillingStatus({ admin, tenant: trustedTenant }),
      getTenantBillingStatus({ admin, tenant: trustedTenant }),
    ]);
    assert.deepEqual(failed.map((result) => result.status), ["rejected", "rejected"]);
    assert.equal(graphqlCalls, 1);

    shouldFail = false;
    assert.deepEqual(
      await getTenantBillingStatus({ admin, tenant: trustedTenant }),
      { active: false, plan: "NONE", subscriptionName: null },
    );
    assert.equal(graphqlCalls, 2);
  });
});

test("records separate Admin, Partner, legacy and waiter timings", async () => {
  const originalFetch = globalThis.fetch;
  const organizationId = process.env.SHOPIFY_PARTNER_ORG_ID;
  const token = process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;
  process.env.SHOPIFY_PARTNER_ORG_ID = "test-org";
  process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = "test-token";
  globalThis.fetch = async () => Response.json({ data: { activeSubscription: null } });
  const events: Array<Record<string, unknown>> = [];
  const trace = createServerPerformanceTrace("dashboard-loader", {
    log: (event) => events.push(event),
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const admin = {
    graphql: async () => {
      await gate;
      return identityResponse();
    },
  } as never;
  const trustedTenant = tenant("account-timing", "connection-timing");

  try {
    const owner = getTenantBillingStatus({ admin, tenant: trustedTenant, performanceTrace: trace });
    const waiter = getTenantBillingStatus({ admin, tenant: trustedTenant, performanceTrace: trace });
    release();
    await Promise.all([owner, waiter]);
    trace.finish("ok");
    const phases = events[0]?.phases as Record<string, { count: number }>;
    assert.equal(phases.billingAdminGraphql.count, 1);
    assert.equal(phases.billingPartnerApi.count, 1);
    assert.equal(phases.billingLegacyEvaluation.count, 1);
    assert.equal(phases.billingSingleFlightWait.count, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (organizationId === undefined) delete process.env.SHOPIFY_PARTNER_ORG_ID;
    else process.env.SHOPIFY_PARTNER_ORG_ID = organizationId;
    if (token === undefined) delete process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;
    else process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = token;
  }
});
test("keeps Partner API failure fallback and fail-closed NONE behavior", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const organizationId = process.env.SHOPIFY_PARTNER_ORG_ID;
  const token = process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;
  process.env.SHOPIFY_PARTNER_ORG_ID = "test-org";
  process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = "test-token";
  globalThis.fetch = async () => new Response(null, { status: 503 });
  console.error = () => undefined;
  try {
    const none = await getBillingStatus({ graphql: async () => identityResponse() } as never);
    assert.deepEqual(none, { active: false, plan: "NONE", subscriptionName: null });
    const starter = await getBillingStatus({
      graphql: async () => identityResponse([
        { id: "legacy", name: "Starter", status: "ACTIVE" },
      ]),
    } as never);
    assert.deepEqual(starter, { active: true, plan: "STARTER", subscriptionName: "Starter" });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    if (organizationId === undefined) delete process.env.SHOPIFY_PARTNER_ORG_ID;
    else process.env.SHOPIFY_PARTNER_ORG_ID = organizationId;
    if (token === undefined) delete process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;
    else process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = token;
  }
});
