import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { createServerPerformanceTrace } from "../utils/server-performance.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const performanceTrace = createServerPerformanceTrace("shopify-auth-callback");
  let outcome: "ok" | "error" = "ok";
  try {
    await performanceTrace.measure("authentication", () =>
      authenticate.admin(request),
    );
    return null;
  } catch (error) {
    outcome = "error";
    throw error;
  } finally {
    performanceTrace.finish(outcome);
  }
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
