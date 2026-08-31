import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type {
  BillingPlan,
  BillingStatus,
} from "~/utils/margin";

type GraphqlError = {
  message?: string;
};

type PartnersSubscriptionResponse = {
  data?: {
    activeSubscription?: {
      items?: Array<{ handle?: string | null } | null> | null;
    } | null;
  };
  errors?: GraphqlError[];
};

const STARTER_HANDLES = new Set([
  "starter",
  "starter-annual",
]);

const GROWTH_HANDLES = new Set([
  "growth",
]);

type BillingIdentity = {
  appId: string | null;
  shopId: string | null;
  legacySubscriptions: Array<{
    id: string;
    name: string;
    status: string;
  }>;
};

function normalizeHandle(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function getPlanFromHandle(
  handle: string | null | undefined,
): BillingPlan {
  const normalized = normalizeHandle(handle);

  if (GROWTH_HANDLES.has(normalized)) {
    return "GROWTH";
  }

  if (STARTER_HANDLES.has(normalized)) {
    return "STARTER";
  }

  return "NONE";
}

export function hasStarterAccess(
  billing: BillingStatus,
) {
  return (
    billing.active &&
    (billing.plan === "STARTER" ||
      billing.plan === "GROWTH")
  );
}

export function hasGrowthAccess(
  billing: BillingStatus,
) {
  return (
    billing.active &&
    billing.plan === "GROWTH"
  );
}

async function getBillingIdentity(
  admin: AdminApiContext,
): Promise<BillingIdentity> {
  const response = await admin.graphql(`
    #graphql
    query MarginLabBillingIdentity {
      shop {
        id
      }

      currentAppInstallation {
        app {
          id
        }

        activeSubscriptions {
          id
          name
          status
        }
      }
    }
  `);

  const json: Awaited<ReturnType<typeof response.json>> & {
    errors?: GraphqlError[];
  } = await response.json();

  if (json?.errors?.length) {
    throw new Error(
      json.errors
        .map(
          (error: GraphqlError) =>
            error?.message ??
            "Unknown Shopify billing error",
        )
        .join("; "),
    );
  }

  return {
    appId:
      json?.data?.currentAppInstallation?.app?.id ??
      null,

    shopId:
      json?.data?.shop?.id ??
      null,

    legacySubscriptions:
      json?.data?.currentAppInstallation
        ?.activeSubscriptions ?? [],
  };
}

function getLegacyBillingStatus(
  subscriptions: BillingIdentity["legacySubscriptions"],
): BillingStatus {
  const activeSubscriptions =
    subscriptions.filter((subscription) => {
      const status = String(
        subscription?.status ?? "",
      ).toUpperCase();

      return status === "ACTIVE";
    });

  if (activeSubscriptions.length === 0) {
    return {
      active: false,
      plan: "NONE",
      subscriptionName: null,
    };
  }

  /*
   * Compatibility fallback only.
   *
   * Shopify App Pricing must use the Partner API.
   * This fallback exists so old Billing API
   * subscriptions are not immediately treated
   * as unpaid during the migration period.
   */

  const subscription = activeSubscriptions[0];

  const name = String(
    subscription?.name ?? "",
  );

  const normalizedName =
    name.toLowerCase();

  if (normalizedName.includes("growth")) {
    return {
      active: true,
      plan: "GROWTH",
      subscriptionName: name,
    };
  }

  /*
   * Existing MarginLab subscriptions were
   * Starter subscriptions before Growth existed.
   */
  return {
    active: true,
    plan: "STARTER",
    subscriptionName: name || "Starter",
  };
}

async function getShopifyAppPricingStatus({
  appId,
  shopId,
}: {
  appId: string;
  shopId: string;
}): Promise<BillingStatus | null> {
  const organizationId =
    process.env.SHOPIFY_PARTNER_ORG_ID;

  const accessToken =
    process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;

  /*
   * Until the Partner API credentials are
   * configured, return null and allow the
   * legacy compatibility check below.
   */
  if (!organizationId || !accessToken) {
    return null;
  }

  const response = await fetch(
    `https://partners.shopify.com/${organizationId}/api/2026-07/graphql.json`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },

      body: JSON.stringify({
        query: `
          query MarginLabActiveSubscription(
            $appId: ID!
            $shopId: ID!
          ) {
            activeSubscription(
              appId: $appId
              shopId: $shopId
            ) {
              billingPeriod

              items {
                handle
              }
            }
          }
        `,

        variables: {
          appId,
          shopId,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Partner API billing request failed: ${response.status}`,
    );
  }

  const json: PartnersSubscriptionResponse = await response.json();

  if (json?.errors?.length) {
    throw new Error(
      json.errors
        .map(
          (error: GraphqlError) =>
            error?.message ??
            "Unknown Partner API error",
        )
        .join("; "),
    );
  }

  const subscription =
    json?.data?.activeSubscription;

  if (!subscription) {
    return {
      active: false,
      plan: "NONE",
      subscriptionName: null,
    };
  }

  const handles: string[] =
    subscription?.items
      ?.map((item) =>
        normalizeHandle(item?.handle),
      )
      .filter(Boolean) ?? [];

  /*
   * Growth takes priority in case Shopify ever
   * returns multiple subscription items.
   */
  const growthHandle = handles.find((handle) =>
    GROWTH_HANDLES.has(handle),
  );

  if (growthHandle) {
    return {
      active: true,
      plan: "GROWTH",
      subscriptionName: growthHandle,
    };
  }

  const starterHandle = handles.find((handle) =>
    STARTER_HANDLES.has(handle),
  );

  if (starterHandle) {
    return {
      active: true,
      plan: "STARTER",
      subscriptionName: starterHandle,
    };
  }

  /*
   * A Shopify App Pricing subscription exists,
   * but MarginLab doesn't recognize its handle.
   * Do not accidentally grant paid access.
   */
  return {
    active: false,
    plan: "NONE",
    subscriptionName:
      handles[0] ?? null,
  };
}

export async function getBillingStatus(
  admin: AdminApiContext,
): Promise<BillingStatus> {
  const identity =
    await getBillingIdentity(admin);

  /*
   * Shopify App Pricing — canonical check.
   */
  if (identity.appId && identity.shopId) {
    try {
      const appPricingStatus =
        await getShopifyAppPricingStatus({
          appId: identity.appId,
          shopId: identity.shopId,
        });

      if (appPricingStatus) {
        /*
         * If Partner API confirms an active
         * subscription, trust it immediately.
         */
        if (appPricingStatus.active) {
          return appPricingStatus;
        }

        /*
         * If Partner API says NONE, still check
         * legacy Billing API subscriptions.
         *
         * Shopify explicitly requires this while
         * old subscriptions may still exist.
         */
        const legacyStatus =
          getLegacyBillingStatus(
            identity.legacySubscriptions,
          );

        if (legacyStatus.active) {
          return legacyStatus;
        }

        return appPricingStatus;
      }
    } catch (error) {
      console.error(
        "MarginLab Partner API billing check failed:",
        error,
      );
    }
  }

  /*
   * Temporary compatibility fallback until
   * Partner API credentials are configured.
   */
  return getLegacyBillingStatus(
    identity.legacySubscriptions,
  );
}
