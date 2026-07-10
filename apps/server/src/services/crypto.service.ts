import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * Encrypts/decrypts secrets (Schwab access/refresh tokens) at rest.
 * SCHWAB_TOKEN_ENCRYPTION_KEY must be set to a long random string in .env —
 * never commit a real value. Derives a 32-byte key via scrypt so any length
 * of input secret works.
 */
function getKey(): Buffer {
  const secret = process.env.SCHWAB_TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("SCHWAB_TOKEN_ENCRYPTION_KEY is not set — required to store Schwab tokens.");
  }
  return scryptSync(secret, "spy-copilot-schwab-tokens", 32);
}

export function encrypt(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decrypt(payload: string): string {
  const [ivHex, authTagHex, dataHex] = payload.split(":");
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error("Malformed encrypted token payload.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}
