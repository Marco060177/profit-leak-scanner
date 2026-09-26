import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { CredentialEncryptionProvider } from "../../app/services/credential-encryption.server";

const key = createHash("sha256").update("marginlab-e1a-test-key-only").digest();

/** Test-only authenticated encryption adapter. Never imported by application code. */
export const testCredentialEncryptionProvider: CredentialEncryptionProvider = {
  async encrypt(plaintext) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { ciphertext: Buffer.concat([nonce, tag, encrypted]), provider: "TEST_AES_GCM",
      keyVersion: "test-v1", credentialFingerprint: createHash("sha256").update(plaintext).digest("hex") };
  },
  async decrypt(credential) {
    if (credential.provider !== "TEST_AES_GCM" || credential.keyVersion !== "test-v1")
      throw new Error("Test credential metadata invalid");
    const bytes = Buffer.from(credential.ciphertext);
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
  },
};
