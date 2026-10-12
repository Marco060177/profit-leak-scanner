import { createHash } from "node:crypto";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,80}$/;
const MAX_CHALLENGE_CODE_LENGTH = 4_096;

export type EbayMarketplaceAccountDeletionChallengeConfig = Readonly<{
  verificationToken: string;
  canonicalEndpointUrl: string;
}>;

export class EbayMarketplaceAccountDeletionChallengeError extends Error {
  readonly code: "CONFIGURATION" | "CHALLENGE";

  constructor(code: "CONFIGURATION" | "CHALLENGE") {
    super(`eBay marketplace account deletion ${code.toLowerCase()} invalid`);
    this.name = "EbayMarketplaceAccountDeletionChallengeError";
    this.code = code;
  }
}

export function resolveEbayMarketplaceAccountDeletionChallengeConfig(
  env: NodeJS.ProcessEnv = process.env,
): EbayMarketplaceAccountDeletionChallengeConfig {
  const verificationToken = env.EBAY_MARKETPLACE_ACCOUNT_DELETION_VERIFICATION_TOKEN;
  const canonicalEndpointUrl = env.EBAY_MARKETPLACE_ACCOUNT_DELETION_ENDPOINT_URL;
  if (!verificationToken || !TOKEN_PATTERN.test(verificationToken) || !canonicalEndpointUrl) {
    throw new EbayMarketplaceAccountDeletionChallengeError("CONFIGURATION");
  }

  let endpoint: URL;
  try {
    endpoint = new URL(canonicalEndpointUrl);
  } catch {
    throw new EbayMarketplaceAccountDeletionChallengeError("CONFIGURATION");
  }
  if (
    endpoint.protocol !== "https:" ||
    !endpoint.hostname ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash ||
    endpoint.toString() !== canonicalEndpointUrl
  ) {
    throw new EbayMarketplaceAccountDeletionChallengeError("CONFIGURATION");
  }

  return { verificationToken, canonicalEndpointUrl };
}

export function ebayMarketplaceAccountDeletionChallengeResponse(
  challengeCode: string,
  config: EbayMarketplaceAccountDeletionChallengeConfig,
) {
  if (
    !challengeCode ||
    challengeCode.length > MAX_CHALLENGE_CODE_LENGTH ||
    Array.from(challengeCode).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    throw new EbayMarketplaceAccountDeletionChallengeError("CHALLENGE");
  }
  return createHash("sha256")
    .update(challengeCode, "utf8")
    .update(config.verificationToken, "utf8")
    .update(config.canonicalEndpointUrl, "utf8")
    .digest("hex");
}
