import type { RawSourceEncryptionContext } from "~/core/data-core-d1.server";
import {
  Aes256GcmEncryptionCore,
  loadAes256GcmKeyringFromEnvironment,
} from "~/services/aes-256-gcm-encryption.server";

function requireD1Context(context?: RawSourceEncryptionContext): RawSourceEncryptionContext {
  if (!context || context.dataClass !== "D1") throw new Error("D1 encryption context unavailable");
  return context;
}

export class EbayD1Aes256GcmEncryptionProvider {
  readonly #core: Aes256GcmEncryptionCore;

  constructor(core: Aes256GcmEncryptionCore) {
    this.#core = core;
  }

  encryptChunk(plain: Uint8Array, chunkIndex: number, context?: RawSourceEncryptionContext): Uint8Array {
    return this.#core.encrypt(plain, { ...requireD1Context(context), chunkIndex });
  }

  decryptChunk(encrypted: Uint8Array, chunkIndex: number, context?: RawSourceEncryptionContext): Uint8Array {
    return this.#core.decrypt(encrypted, { ...requireD1Context(context), chunkIndex });
  }
}

export function createEbayD1EncryptionProvider(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): EbayD1Aes256GcmEncryptionProvider {
  return new EbayD1Aes256GcmEncryptionProvider(
    new Aes256GcmEncryptionCore(loadAes256GcmKeyringFromEnvironment(environment)),
  );
}
