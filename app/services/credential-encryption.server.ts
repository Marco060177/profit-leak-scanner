export type EncryptedCredential = Readonly<{
  ciphertext: Uint8Array;
  provider: string;
  keyVersion: string;
  credentialFingerprint: string;
}>;

export type StoredEncryptedCredential = Readonly<{
  ciphertext: Uint8Array;
  provider: string;
  keyVersion: string;
}>;

export type CredentialEncryptionContext = Readonly<{
  dataClass: "CREDENTIAL";
  accountId: string;
  channelConnectionId: string;
  recordIdentity: string;
}>;

/** Implementations must use reviewed authenticated encryption or an external KMS/envelope provider. */
export interface CredentialEncryptionProvider {
  encrypt(plaintext: Uint8Array, context?: CredentialEncryptionContext): Promise<EncryptedCredential>;
  decrypt(credential: StoredEncryptedCredential, context?: CredentialEncryptionContext): Promise<Uint8Array>;
}

/** E1-A intentionally has no production cipher. Production use fails closed. */
export function requireCredentialEncryptionProvider(
  provider?: CredentialEncryptionProvider,
): CredentialEncryptionProvider {
  if (!provider) throw new Error("Credential encryption provider unavailable");
  return provider;
}
