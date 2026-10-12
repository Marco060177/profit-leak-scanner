import type { PrismaClient } from "@prisma/client";
import type { VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import {
  Aes256GcmEncryptionCore,
  loadAes256GcmKeyringFromEnvironment,
} from "~/services/aes-256-gcm-encryption.server";
import {
  exchangeEbayAuthorizationCode,
  executeEbayApiRequest,
  refreshEbaySellerAccessToken,
} from "./ebay-api-client.server";
import { persistEbaySellerAuthorization } from "./ebay-authorization.server";
import { resolveEbayApplicationConfig } from "./ebay-config.server";
import { EbayAes256GcmCredentialEncryptionProvider } from "./ebay-credential-encryption.server";
import { EbayD1Aes256GcmEncryptionProvider } from "./ebay-d1-encryption.server";
import { ingestEbayFinancesToD1 } from "./ebay-finances-d1.server";
import { ingestEbayFinancesD1ToD2B } from "./ebay-finances-d2b.server";
import { normalizeEbayOrdersFromD1 } from "./ebay-orders-d2a.server";
import { ingestEbayOrdersToD1 } from "./ebay-orders-d1.server";
import { createEnvironmentEbaySigningKeyProvider } from "./ebay-signing-key-provider.server";
import { EbayConnectorError, type EbayHttpTransport } from "./ebay-types";

const ACTIVATION_ENV = "EBAY_PRODUCTION_CONNECTOR_ENABLED";

type AuthorizationGrant = Parameters<typeof persistEbaySellerAuthorization>[2];
type OrdersD1Input = Omit<Parameters<typeof ingestEbayOrdersToD1>[0],
  "db" | "config" | "transport" | "credentialEncryptionProvider" | "signingKeyProvider" | "rawEncryption">;
type OrdersD2AInput = Omit<Parameters<typeof normalizeEbayOrdersFromD1>[0], "db" | "rawDecryption">;
type FinancesD1Input = Omit<Parameters<typeof ingestEbayFinancesToD1>[0],
  "db" | "config" | "transport" | "credentialEncryptionProvider" | "signingKeyProvider" | "rawEncryption">;
type FinancesD2BInput = Omit<Parameters<typeof ingestEbayFinancesD1ToD2B>[0], "db" | "rawDecryption">;
type ApiRequestInput = Omit<Parameters<typeof executeEbayApiRequest>[0],
  "config" | "transport" | "signingKeyProvider">;

function rejectConfiguration(): never {
  throw new EbayConnectorError("CONFIGURATION");
}

/**
 * Builds the complete production dependency graph without installing globals or
 * starting network/database work. The explicit gate prevents accidental partial
 * activation; callers must still invoke an operation deliberately.
 */
export function createEbayProductionConnectorComposition(input: {
  db: PrismaClient;
  transport: EbayHttpTransport;
  environment?: Readonly<Record<string, string | undefined>>;
}) {
  const environment = input.environment ?? process.env;
  if (environment[ACTIVATION_ENV] !== "true") rejectConfiguration();
  if (!input.db || !input.transport?.request) rejectConfiguration();

  const config = resolveEbayApplicationConfig(environment as NodeJS.ProcessEnv);
  if (config.environment !== "PRODUCTION") rejectConfiguration();

  // Validate every secret before exposing any usable operation. Both encryption
  // providers share the same immutable keyring snapshot for this composition.
  const encryptionCore = new Aes256GcmEncryptionCore(loadAes256GcmKeyringFromEnvironment(environment));
  const credentialEncryptionProvider = new EbayAes256GcmCredentialEncryptionProvider(encryptionCore);
  const d1EncryptionProvider = new EbayD1Aes256GcmEncryptionProvider(encryptionCore);
  const signingKeyProvider = createEnvironmentEbaySigningKeyProvider(environment);

  return Object.freeze({
    readiness: Object.freeze({ environment: config.environment, activationEnabled: true as const }),
    providers: Object.freeze({ credentialEncryptionProvider, d1EncryptionProvider, signingKeyProvider }),

    executeApiRequest: (operation: ApiRequestInput) => executeEbayApiRequest({
      ...operation, config, transport: input.transport, signingKeyProvider,
    }),

    exchangeAuthorizationCode: (authorizationCode: string) => exchangeEbayAuthorizationCode({
      authorizationCode, config, transport: input.transport,
    }),

    persistSellerAuthorization: (tenant: VerifiedCoreTenant, grant: AuthorizationGrant) =>
      persistEbaySellerAuthorization(input.db, tenant, grant, credentialEncryptionProvider),

    refreshSellerAccessToken: (tenant: VerifiedCoreTenant, now?: Date) => refreshEbaySellerAccessToken({
      db: input.db, tenant, config, transport: input.transport, encryptionProvider: credentialEncryptionProvider, now,
    }),

    ingestOrdersToD1: (operation: OrdersD1Input) => ingestEbayOrdersToD1({
      ...operation, db: input.db, config, transport: input.transport,
      credentialEncryptionProvider, signingKeyProvider, rawEncryption: d1EncryptionProvider,
    }),

    normalizeOrdersFromD1: (operation: OrdersD2AInput) => normalizeEbayOrdersFromD1({
      ...operation, db: input.db, rawDecryption: d1EncryptionProvider,
    }),

    ingestFinancesToD1: (operation: FinancesD1Input) => ingestEbayFinancesToD1({
      ...operation, db: input.db, config, transport: input.transport,
      credentialEncryptionProvider, signingKeyProvider, rawEncryption: d1EncryptionProvider,
    }),

    ingestFinancesD1ToD2B: (operation: FinancesD2BInput) => ingestEbayFinancesD1ToD2B({
      ...operation, db: input.db, rawDecryption: d1EncryptionProvider,
    }),
  });
}

export const EBAY_PRODUCTION_COMPOSITION_ENVIRONMENT_VARIABLES = Object.freeze({
  activationEnabled: ACTIVATION_ENV,
  ebayEnvironment: "EBAY_ENVIRONMENT",
  clientId: "EBAY_CLIENT_ID",
  clientSecret: "EBAY_CLIENT_SECRET",
  ruName: "EBAY_RUNAME",
  encryptionKeyring: "MARGINLAB_ENCRYPTION_KEYRING",
  encryptionCurrentKeyVersion: "MARGINLAB_ENCRYPTION_CURRENT_KEY_VERSION",
  signingPrivateKeyPem: "EBAY_ED25519_PRIVATE_KEY_PEM",
  signingPublicKeyJwe: "EBAY_ED25519_PUBLIC_KEY_JWE",
  signingKeyVersion: "EBAY_ED25519_KEY_VERSION",
});
