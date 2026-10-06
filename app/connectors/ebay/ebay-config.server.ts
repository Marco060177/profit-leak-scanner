import { EbayConnectorError, type EbayApplicationConfig, type EbayEnvironment } from "./ebay-types";

function required(value: string | undefined) {
  if (!value?.trim() || value !== value.trim() || /[\r\n]/.test(value))
    throw new EbayConnectorError("CONFIGURATION");
  return value;
}

export function resolveEbayApplicationConfig(env: NodeJS.ProcessEnv = process.env): EbayApplicationConfig {
  const environment = required(env.EBAY_ENVIRONMENT).toUpperCase() as EbayEnvironment;
  if (environment !== "SANDBOX" && environment !== "PRODUCTION")
    throw new EbayConnectorError("CONFIGURATION");
  const timeoutMs = Number(env.EBAY_HTTP_TIMEOUT_MS ?? env.EBAY_OAUTH_TIMEOUT_MS ?? "10000");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000)
    throw new EbayConnectorError("CONFIGURATION");
  const maxAttempts = Number(env.EBAY_HTTP_MAX_ATTEMPTS ?? "3");
  const maxRetryAfterMs = Number(env.EBAY_HTTP_MAX_RETRY_AFTER_MS ?? "5000");
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5 ||
      !Number.isSafeInteger(maxRetryAfterMs) || maxRetryAfterMs < 0 || maxRetryAfterMs > 30_000)
    throw new EbayConnectorError("CONFIGURATION");
  const clientId = required(env.EBAY_CLIENT_ID);
  const clientSecret = required(env.EBAY_CLIENT_SECRET);
  const ruName = required(env.EBAY_RUNAME);
  if ([clientId, clientSecret].some((value) => value.includes(":")) ||
      [clientId, clientSecret, ruName].some((value) => value.length > 2048))
    throw new EbayConnectorError("CONFIGURATION");
  return { environment, clientId, clientSecret, ruName, timeoutMs, maxAttempts, maxRetryAfterMs };
}
