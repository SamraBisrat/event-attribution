import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const prefix = "enc:v1:";
export function dataCipher(encodedKey: string | undefined) {
  if (!encodedKey || !/^[A-Za-z0-9+/]{43}=$/.test(encodedKey)) throw new Error("APP_DATA_KEY must be a base64-encoded 32-byte key. Follow SECURITY.md.");
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) throw new Error("Invalid encryption key length.");
  const keyId = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return {
    encrypt(value: string, context: string) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(Buffer.from(`${prefix}${keyId}:${context}`));
      const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return `${prefix}${keyId}:${nonce.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ciphertext.toString("base64")}`;
    },
    decrypt(value: string, context: string) {
      try {
        const parts = value.split(":");
        if (parts.length !== 6 || !value.startsWith(prefix) || parts[2] !== keyId) throw new Error();
        const nonce = Buffer.from(parts[3], "base64");
        const tag = Buffer.from(parts[4], "base64");
        if (nonce.length !== 12 || tag.length !== 16) throw new Error();
        const decipher = createDecipheriv("aes-256-gcm", key, nonce);
        decipher.setAAD(Buffer.from(`${prefix}${keyId}:${context}`));
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(Buffer.from(parts[5], "base64")), decipher.final()]).toString("utf8");
      } catch {
        throw new Error("Encrypted data could not be verified. Check the encryption key and migration status.");
      }
    },
  };
}

export const protectedFields: Record<string, string[]> = {
  Customer: ["email"],
  Session: ["firstName", "lastName", "email", "accessToken", "refreshToken"],
};
