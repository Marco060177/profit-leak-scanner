import { AmazonConnectorError, type AmazonApplicationConfig } from "./amazon-types";

function required(value: string | undefined) {
  if (!value?.trim()) throw new AmazonConnectorError("CONFIGURATION");
  return value.trim();
}

/** The only E1-B process.env boundary. Prefer injecting config in workers and tests. */
export function resolveAmazonApplicationConfig(env: NodeJS.ProcessEnv = process.env): AmazonApplicationConfig {
  const timeout = Number(env.AMAZON_SP_API_TIMEOUT_MS ?? "10000");
  const attempts = Number(env.AMAZON_SP_API_MAX_ATTEMPTS ?? "3");
  if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > 60_000 ||
      !Number.isSafeInteger(attempts) || attempts < 1 || attempts > 5)
    throw new AmazonConnectorError("CONFIGURATION");
  return { lwaClientId: required(env.AMAZON_LWA_CLIENT_ID),
    lwaClientSecret: required(env.AMAZON_LWA_CLIENT_SECRET),
    userAgent: required(env.AMAZON_SP_API_USER_AGENT), timeoutMs: timeout, maxAttempts: attempts };
}

