/**
 * AES-256-GCM for secrets this app has no choice but to hold.
 *
 * Restored from the module 3ebbb40 deleted. That commit was right for its
 * case: Composio brokers OAuth tokens, so storing them here was work for
 * nothing. Nylas is different — it has no broker in front of it, and an agent
 * that gets its own Nylas application needs those credentials kept somewhere.
 * Env cannot express "per agent", so they live encrypted in the database.
 *
 * Restored rather than rewritten so it stays the same primitive the team
 * already reviewed: random IV per value, authentication tag checked on read,
 * and a lazily-loaded key so importing this never throws at build time.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function loadEncryptionKey(): Buffer {
  const raw = (process.env.ENCRYPTION_KEY || "").trim();
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must be a base64-encoded 32-byte key (got ${key.length} bytes). Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  return key;
}

let cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  cachedKey = loadEncryptionKey();
  return cachedKey;
}

export function encrypt(value: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decrypt(value: string): string {
  const key = getEncryptionKey();
  const packed = Buffer.from(value, "base64");
  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Encrypted value is malformed");
  }
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Failed to decrypt: authentication failed (tampered data or wrong ENCRYPTION_KEY)");
  }
}
