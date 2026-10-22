import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { I18nProvider } from "~/components/i18n/I18nProvider";
import { loadLocaleMessages } from "~/utils/i18n-catalogs.server";
import { getRequestLanguage } from "~/utils/i18n.server";
import prisma from "~/db.server";
import { authenticateShopifyTenant } from "~/services/authenticated-shopify-context.server";
import { getAttributionByAccount } from "~/services/partner-program.server";
import {
  hasValidPendingPartnerReferral,
  loadPendingPartnerAttribution,
  redirectPendingPartnerReferral,
} from "~/services/partner-referral-flow.server";
import { createServerPerformanceTrace } from "~/utils/server-performance.server";
import visualSystemStylesUrl from "~/styles/visual-system-v2.css?url";

export const links = () => [{ rel: "stylesheet", href: visualSystemStylesUrl }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const performanceTrace = createServerPerformanceTrace("app-shell-loader");
  let outcome: "ok" | "error" = "error";
  try {
    const authenticated = await authenticateShopifyTenant(request, performanceTrace);
    const secret = process.env.SHOPIFY_API_SECRET ?? "";
    const hasPendingReferral = hasValidPendingPartnerReferral(
      request.headers.get("Cookie"),
      secret,
    );
    const attribution = await loadPendingPartnerAttribution(
      hasPendingReferral,
      () => performanceTrace.measure("partnerAttribution", () =>
        getAttributionByAccount(prisma, authenticated.tenant.accountId)),
    );
    const partnerRedirect = redirectPendingPartnerReferral({
      request,
      hasAttribution: Boolean(attribution),
      tenant: authenticated.tenant,
      shopDomain: authenticated.session.shop,
      appHandle: process.env.SHOPIFY_APP_HANDLE ?? "",
      appUrl: process.env.SHOPIFY_APP_URL || new URL(request.url).origin,
      secret,
      redirect: authenticated.redirect,
    });
    if (partnerRedirect) {
      outcome = "ok";
      return partnerRedirect;
    }
    const language = getRequestLanguage(request);
    const messages = await performanceTrace.measure("localeMessages", () =>
      loadLocaleMessages(language));

    outcome = "ok";
    // eslint-disable-next-line no-undef
    return data({
      apiKey: process.env.SHOPIFY_API_KEY || "",
      language,
      messages,
    });
  } finally {
    performanceTrace.finish(outcome);
  }
};

export default function App() {
  const { apiKey, language, messages } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <I18nProvider
        initialLanguage={language}
        initialMessages={messages}
      >
        <div className="ml-app-shell">
          <div className="ml-app-ambient" aria-hidden="true" />
          <Outlet />
        </div>
      </I18nProvider>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
