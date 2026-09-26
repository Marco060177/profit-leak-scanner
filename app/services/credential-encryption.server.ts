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

/** Implementations must use a reviewed external KMS or envelope-encryption provider. */
export interface CredentialEncryptionProvider {
  encrypt(plaintext: Uint8Array): Promise<EncryptedCredential>;
  decrypt(credential: StoredEncryptedCredential): Promise<Uint8Array>;
}

/** E1-A intentionally has no production cipher. Production use fails closed. */
export function requireCredentialEncryptionProvider(
  provider?: CredentialEncryptionProvider,
): CredentialEncryptionProvider {
  if (!provider) throw new Error("Credential encryption provider unavailable");
  return provider;
}
