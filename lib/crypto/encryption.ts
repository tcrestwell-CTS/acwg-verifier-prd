/**
 * Field-Level Encryption Utility
 *
 * AES-256-GCM authenticated encryption for PII fields.
 * Supports key versioning for rotation without re-encrypting all data.
 *
 * Key format in env: ENCRYPTION_KEY_v1=<32-byte hex>, ENCRYPTION_KEY_v2=...
 * Current key version: ENCRYPTION_KEY_VERSION=1 (default)
 *
 * Encrypted value format: v{version}:{iv_hex}:{authTag_hex}:{ciphertext_hex}
 * This allows decryption to locate the correct key by version prefix.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;

function getKey(version: number): Buffer {
  const envKey = process.env[`ENCRYPTION_KEY_v${version}`];
  if (!envKey) {
    throw new Error(
      `Encryption key v${version} not found. Set ENCRYPTION_KEY_v${version} in environment.`
    );
  }
  const key = Buffer.from(envKey, "hex");
  if (key.length !== 32) {
    throw new Error(`ENCRYPTION_KEY_v${version} must be 32 bytes (64 hex chars)`);
  }
  return key;
}

function getCurrentVersion(): number {
  return parseInt(process.env.ENCRYPTION_KEY_VERSION ?? "1", 10);
}

/**
 * Encrypt a plaintext string.
 * Returns an opaque string that includes the key version, IV, auth tag, and ciphertext.
 */
export function encrypt(plaintext: string): string {
  const version = getCurrentVersion();
  const key = getKey(version);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `v${version}:${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * Decrypt a value produced by encrypt().
 * Automatically selects the correct key based on the version prefix.
 */
export function decrypt(encryptedValue: string): string {
  const parts = encryptedValue.split(":");
  if (parts.length !== 4 || !parts[0].startsWith("v")) {
    throw new Error("Invalid encrypted value format");
  }

  const version = parseInt(parts[0].slice(1), 10);
  const iv = Buffer.from(parts[1], "hex");
  const authTag = Buffer.from(parts[2], "hex");
  const ciphertext = Buffer.from(parts[3], "hex");

  const key = getKey(version);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

/**
 * Check if a value is already encrypted (starts with version prefix).
 */
export function isEncrypted(value: string): boolean {
  return /^v\d+:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/.test(value);
}

/**
 * Re-encrypt a value with the current key version (for rotation).
 */
export function rotate(encryptedValue: string): string {
  const plain = decrypt(encryptedValue);
  return encrypt(plain);
}

/**
 * Safe encrypt — only encrypts if encryption keys are configured.
 * Falls back to plaintext in development without keys (with a warning).
 */
export function safeEncrypt(value: string): string {
  if (!process.env[`ENCRYPTION_KEY_v${getCurrentVersion()}`]) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY_v1 must be set in production");
    }
    // Development fallback — log warning but don't crash
    console.warn("[crypto] Encryption key not configured — storing plaintext (dev only)");
    return value;
  }
  return encrypt(value);
}

/**
 * Safe decrypt — handles both encrypted and plaintext values.
 * Allows gradual migration of existing plaintext records.
 */
export function safeDecrypt(value: string): string {
  if (!isEncrypted(value)) return value; // plaintext pass-through
  return decrypt(value);
}

/**
 * Generate a new encryption key for use in env vars.
 * Run: npx ts-node -e "require('./lib/crypto/encryption').generateKey()"
 */
export function generateKey(): string {
  return randomBytes(32).toString("hex");
}
