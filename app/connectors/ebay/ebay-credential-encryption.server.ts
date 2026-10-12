import {
  Aes256GcmEncryptionCore,
  loadAes256GcmKeyringFromEnvironment,
} from "~/services/aes-256-gcm-encryption.server";
import type {
  CredentialEncryptionContext,
  CredentialEncryptionProvider,
  StoredEncryptedCredential,
} from "~/services/credential-encryption.server";

export const EBAY_CREDENTIAL_ENCRYPTION_PROVIDER = "MARGINLAB_AES_256_GCM_V1";

function requireCredentialContext(context?: CredentialEncryptionContext): CredentialEncryptionContext {
  if (!context || context.dataClass !== "CREDENTIAL")
    throw new Error("Credential encryption context unavailable");
  return context;
}

export class EbayAes256GcmCredentialEncryptionProvider implements CredentialEncryptionProvider {
  readonly #core: Aes256GcmEncryptionCore;

  constructor(core: Aes256GcmEncryptionCore) {
    this.#core = core;
  }

  async encrypt(plaintext: Uint8Array, context?: CredentialEncryptionContext) {
    const requiredContext = requireCredentialContext(context);
    return {
      ciphertext: this.#core.encrypt(plaintext, requiredContext),
      provider: EBAY_CREDENTIAL_ENCRYPTION_PROVIDER,
      keyVersion: this.#core.currentKeyVersion,
      credentialFingerprint: this.#core.credentialFingerprint(plaintext, requiredContext),
    };
  }

  async decrypt(credential: StoredEncryptedCredential, context?: CredentialEncryptionContext) {
    if (credential.provider !== EBAY_CREDENTIAL_ENCRYPTION_PROVIDER)
      throw new Error("Credential encryption provider rejected");
    return this.#core.decrypt(
      credential.ciphertext,
      requireCredentialContext(context),
      credential.keyVersion,
    );
  }
}

export function createEbayCredentialEncryptionProvider(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): CredentialEncryptionProvider {
  return new EbayAes256GcmCredentialEncryptionProvider(
    new Aes256GcmEncryptionCore(loadAes256GcmKeyringFromEnvironment(environment)),
  );
}
