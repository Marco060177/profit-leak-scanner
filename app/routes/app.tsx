import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { I18nProvider } from "~/components/i18n/I18nProvider";
import { getRequestLanguage } from "~/utils/i18n.server";
import { authenticate } from "../shopify.server";
import visualSystemStylesUrl from "~/styles/visual-system-v2.css?url";

export const links = () => [{ rel: "stylesheet", href: visualSystemStylesUrl }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    language: getRequestLanguage(request),
  };
};

export default function App() {
  const { apiKey, language } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <I18nProvider initialLanguage={language}>
        <Outlet />
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
