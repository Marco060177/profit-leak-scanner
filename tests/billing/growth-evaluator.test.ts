import assert from "node:assert/strict";
import test from "node:test";

import {
  getBillingStatus,
  getPlanFromHandle,
  hasGrowthAccess,
} from "../../app/utils/billing.server";

type ActiveSubscription =
  | { items: Array<{ handle: string | null } | null> }
  | null;

function adminWithBillingIdentity({
  legacySubscriptions = [],
}: {
  legacySubscriptions?: Array<{
    id: string;
    name: string;
    status: string;
  }>;
} = {}) {
  return {
    graphql: async () =>
      Response.json({
        data: {
          shop: { id: "gid://shopify/Shop/1" },
          currentAppInstallation: {
            app: { id: "gid://shopify/App/1" },
            activeSubscriptions: legacySubscriptions,
          },
        },
      }),
  } as Parameters<typeof getBillingStatus>[0];
}

async function withPartnerApiSubscription(
  activeSubscription: ActiveSubscription,
  run: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const originalOrganizationId = process.env.SHOPIFY_PARTNER_ORG_ID;
  const originalAccessToken = process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;

  process.env.SHOPIFY_PARTNER_ORG_ID = "test-organization";
  process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = "test-token";
  globalThis.fetch = async () =>
    Response.json({ data: { activeSubscription } });

  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;

    if (originalOrganizationId === undefined) {
      delete process.env.SHOPIFY_PARTNER_ORG_ID;
    } else {
      process.env.SHOPIFY_PARTNER_ORG_ID = originalOrganizationId;
    }

    if (originalAccessToken === undefined) {
      delete process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;
    } else {
      process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = originalAccessToken;
    }
  }
}

test("recognizes only the exact Growth evaluator plan handle", () => {
  assert.equal(getPlanFromHandle("growth-evaluator"), "GROWTH");
  assert.equal(getPlanFromHandle(" GROWTH-EVALUATOR "), "GROWTH");
  assert.equal(getPlanFromHandle("growth"), "GROWTH");
  assert.equal(getPlanFromHandle("starter"), "STARTER");
  assert.equal(getPlanFromHandle("starter-annual"), "STARTER");
  assert.equal(getPlanFromHandle("growth-evaluator-preview"), "NONE");
  assert.equal(getPlanFromHandle("3mhqky-ba.myshopify.com"), "NONE");
  assert.equal(getPlanFromHandle(null), "NONE");
});

test("grants Growth when Shopify reports an active growth-evaluator subscription", async () => {
  await withPartnerApiSubscription(
    { items: [{ handle: "growth-evaluator" }] },
    async () => {
      const billing = await getBillingStatus(adminWithBillingIdentity());

      assert.deepEqual(billing, {
        active: true,
        plan: "GROWTH",
        subscriptionName: "growth-evaluator",
      });
      assert.equal(hasGrowthAccess(billing), true);
    },
  );
});

test("fails closed when Shopify reports no active subscription", async () => {
  await withPartnerApiSubscription(null, async () => {
    const billing = await getBillingStatus(adminWithBillingIdentity());

    assert.deepEqual(billing, {
      active: false,
      plan: "NONE",
      subscriptionName: null,
    });
    assert.equal(hasGrowthAccess(billing), false);
  });
});

test("fails closed for an unknown active Shopify App Pricing handle", async () => {
  await withPartnerApiSubscription(
    { items: [{ handle: "growth-evaluator-preview" }] },
    async () => {
      const billing = await getBillingStatus(adminWithBillingIdentity());

      assert.deepEqual(billing, {
        active: false,
        plan: "NONE",
        subscriptionName: "growth-evaluator-preview",
      });
      assert.equal(hasGrowthAccess(billing), false);
    },
  );
});

test("keeps inactive legacy subscriptions closed", async () => {
  const originalOrganizationId = process.env.SHOPIFY_PARTNER_ORG_ID;
  const originalAccessToken = process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;
  delete process.env.SHOPIFY_PARTNER_ORG_ID;
  delete process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;

  try {
    const billing = await getBillingStatus(
      adminWithBillingIdentity({
        legacySubscriptions: [
          {
            id: "gid://shopify/AppSubscription/1",
            name: "Growth",
            status: "CANCELLED",
          },
        ],
      }),
    );

    assert.deepEqual(billing, {
      active: false,
      plan: "NONE",
      subscriptionName: null,
    });
    assert.equal(hasGrowthAccess(billing), false);
  } finally {
    if (originalOrganizationId === undefined) {
      delete process.env.SHOPIFY_PARTNER_ORG_ID;
    } else {
      process.env.SHOPIFY_PARTNER_ORG_ID = originalOrganizationId;
    }

    if (originalAccessToken === undefined) {
      delete process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;
    } else {
      process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = originalAccessToken;
    }
  }
});
