import assert from "node:assert/strict";
import {
  EbayMarketplaceAccountDeletionChallengeError,
  ebayMarketplaceAccountDeletionChallengeResponse,
  resolveEbayMarketplaceAccountDeletionChallengeConfig,
} from "../../app/connectors/ebay/ebay-marketplace-account-deletion-challenge.server";
import { loader } from "../../app/routes/ebay.marketplace-account-deletion";

const verificationToken = "A_Valid-Verification-Token_123456";
const endpoint = "https://marginlab.example/ebay/marketplace-account-deletion";
const env = {
  EBAY_MARKETPLACE_ACCOUNT_DELETION_VERIFICATION_TOKEN: verificationToken,
  EBAY_MARKETPLACE_ACCOUNT_DELETION_ENDPOINT_URL: endpoint,
};

const config = resolveEbayMarketplaceAccountDeletionChallengeConfig(env);
assert.equal(ebayMarketplaceAccountDeletionChallengeResponse("challenge-123", config),
  "6e31b72f4a047e90305aacf9c97aff1d8c0cb9dee1dabc244554ddbf700cdb4f");

const trailingSlashConfig = resolveEbayMarketplaceAccountDeletionChallengeConfig({
  ...env,
  EBAY_MARKETPLACE_ACCOUNT_DELETION_ENDPOINT_URL: `${endpoint}/`,
});
assert.equal(ebayMarketplaceAccountDeletionChallengeResponse("challenge-123", trailingSlashConfig),
  "8d53f0344b4aa835aa8c60016674f78cce6944db8ea45f3212f5712d864c92a8");
assert.notEqual(
  ebayMarketplaceAccountDeletionChallengeResponse("challenge-123", config),
  ebayMarketplaceAccountDeletionChallengeResponse("challenge-123", trailingSlashConfig),
);

for (const invalidEnv of [
  {},
  { ...env, EBAY_MARKETPLACE_ACCOUNT_DELETION_VERIFICATION_TOKEN: "short" },
  { ...env, EBAY_MARKETPLACE_ACCOUNT_DELETION_VERIFICATION_TOKEN: `${"a".repeat(31)}!` },
  { ...env, EBAY_MARKETPLACE_ACCOUNT_DELETION_VERIFICATION_TOKEN: "a".repeat(81) },
  { ...env, EBAY_MARKETPLACE_ACCOUNT_DELETION_ENDPOINT_URL: "http://marginlab.example/ebay/marketplace-account-deletion" },
  { ...env, EBAY_MARKETPLACE_ACCOUNT_DELETION_ENDPOINT_URL: "not-a-url" },
]) assert.throws(
  () => resolveEbayMarketplaceAccountDeletionChallengeConfig(invalidEnv),
  (error) => error instanceof EbayMarketplaceAccountDeletionChallengeError && error.code === "CONFIGURATION",
);

for (const invalidChallenge of ["", "bad\nchallenge", "x".repeat(4_097)]) assert.throws(
  () => ebayMarketplaceAccountDeletionChallengeResponse(invalidChallenge, config),
  (error) => error instanceof EbayMarketplaceAccountDeletionChallengeError && error.code === "CHALLENGE",
);

const originalToken = process.env.EBAY_MARKETPLACE_ACCOUNT_DELETION_VERIFICATION_TOKEN;
const originalEndpoint = process.env.EBAY_MARKETPLACE_ACCOUNT_DELETION_ENDPOINT_URL;
const restoreEnvironment = () => {
  if (originalToken === undefined) delete process.env.EBAY_MARKETPLACE_ACCOUNT_DELETION_VERIFICATION_TOKEN;
  else process.env.EBAY_MARKETPLACE_ACCOUNT_DELETION_VERIFICATION_TOKEN = originalToken;
  if (originalEndpoint === undefined) delete process.env.EBAY_MARKETPLACE_ACCOUNT_DELETION_ENDPOINT_URL;
  else process.env.EBAY_MARKETPLACE_ACCOUNT_DELETION_ENDPOINT_URL = originalEndpoint;
};

try {
  process.env.EBAY_MARKETPLACE_ACCOUNT_DELETION_VERIFICATION_TOKEN = verificationToken;
  process.env.EBAY_MARKETPLACE_ACCOUNT_DELETION_ENDPOINT_URL = endpoint;
  const request = new Request(
    "https://attacker.example/ebay/marketplace-account-deletion?challenge_code=challenge-123",
    { headers: { host: "attacker.example", "x-forwarded-host": "forwarded-attacker.example" } },
  );
  const response = await loader({ request, params: {}, context: {},
    unstable_pattern: "/ebay/marketplace-account-deletion" });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
  assert.deepEqual(await response.json(), {
    challengeResponse: "6e31b72f4a047e90305aacf9c97aff1d8c0cb9dee1dabc244554ddbf700cdb4f",
  });

  for (const requestUrl of [
    "https://marginlab.example/ebay/marketplace-account-deletion",
    "https://marginlab.example/ebay/marketplace-account-deletion?challenge_code=",
    "https://marginlab.example/ebay/marketplace-account-deletion?challenge_code=one&challenge_code=two",
    "https://marginlab.example/ebay/marketplace-account-deletion?challenge_code=bad%0Avalue",
  ]) {
    const rejected = await loader({ request: new Request(requestUrl), params: {}, context: {},
      unstable_pattern: "/ebay/marketplace-account-deletion" });
    assert.equal(rejected.status, 400);
    assert.deepEqual(await rejected.json(), { error: "Request rejected" });
  }

  delete process.env.EBAY_MARKETPLACE_ACCOUNT_DELETION_VERIFICATION_TOKEN;
  const unavailable = await loader({ request: new Request(
    "https://marginlab.example/ebay/marketplace-account-deletion?challenge_code=challenge-123",
  ), params: {}, context: {}, unstable_pattern: "/ebay/marketplace-account-deletion" });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "Request rejected" });
} finally {
  restoreEnvironment();
}

console.log("ED3-A eBay Marketplace Account Deletion GET challenge tests passed");
