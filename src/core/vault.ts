/**
 * Ghost Key — Vault System
 * Encrypted containers using Web Crypto AES-GCM.
 * Types: standard | forensic | ephemeral (auto-wipe)
 */
import { db } from './db';
import type { GKVault, VaultType } from './db';
import { recordEvent } from './timeline';

const PBKDF2_ITERATIONS = 200_000;
const KEY_LENGTH = 256;

// ─── Crypto Helpers ───────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(key: CryptoKey, iv: Uint8Array, data: string): Promise<string> {
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

async function decryptData(key: CryptoKey, iv: Uint8Array, ciphertext: string): Promise<string> {
  const bytes = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, bytes);
  return new TextDecoder().decode(decrypted);
}

// ─── Vault API ────────────────────────────────────────────────────────────────

/** Create a new vault */
export async function createVault(
  name: string,
  type: VaultType,
  password: string,
  fileIds: number[] = []
): Promise<GKVault> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  // Encrypt an empty payload to verify the vault
  const payload = JSON.stringify({ fileIds, createdAt: Date.now(), type });
  const encryptedData = await encryptData(key, iv, payload);

  const ephemeralWipeAt = type === 'ephemeral'
    ? Date.now() + 24 * 60 * 60 * 1000 // 24h
    : undefined;

  const vault: GKVault = {
    name,
    type,
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    encryptedData,
    fileIds,
    createdAt: Date.now(),
    ephemeralWipeAt,
    isLocked: false,
  };

  const id = await db.vaults.add(vault);
  const created = { ...vault, id };

  await recordEvent('vault_created', `Vault "${name}" created (${type})`, { vaultId: id as number });
  return created;
}

/** Lock a vault */
export async function lockVault(vaultId: number): Promise<void> {
  await db.vaults.update(vaultId, { isLocked: true, lockedAt: Date.now() });
  await recordEvent('vault_locked', `Vault locked`, { vaultId });
}

/** Unlock a vault — returns true if password is correct */
export async function unlockVault(vaultId: number, password: string): Promise<boolean> {
  const vault = await db.vaults.get(vaultId);
  if (!vault) return false;

  // Check ephemeral wipe
  if (vault.type === 'ephemeral' && vault.ephemeralWipeAt && Date.now() > vault.ephemeralWipeAt) {
    await wipeVault(vaultId);
    return false;
  }

  try {
    const salt = hexToBytes(vault.salt);
    const iv = hexToBytes(vault.iv);
    const key = await deriveKey(password, salt);

    if (!vault.encryptedData) return false;
    await decryptData(key, iv, vault.encryptedData);

    await db.vaults.update(vaultId, { isLocked: false });
    return true;
  } catch {
    return false;
  }
}

/** Add files to a vault */
export async function addFilesToVault(vaultId: number, fileIds: number[], password: string): Promise<boolean> {
  const vault = await db.vaults.get(vaultId);
  if (!vault || vault.isLocked) return false;

  try {
    const salt = hexToBytes(vault.salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);

    const updatedFileIds = Array.from(new Set([...vault.fileIds, ...fileIds]));
    const payload = JSON.stringify({ fileIds: updatedFileIds, updatedAt: Date.now(), type: vault.type });
    const encryptedData = await encryptData(key, iv, payload);

    await db.vaults.update(vaultId, {
      fileIds: updatedFileIds,
      iv: bytesToHex(iv),
      encryptedData,
    });

    await db.files.bulkUpdate(fileIds.map(id => ({ key: id, changes: { vaultId } })));
    return true;
  } catch {
    return false;
  }
}

/** Wipe a vault entirely */
export async function wipeVault(vaultId: number): Promise<void> {
  const vault = await db.vaults.get(vaultId);
  if (!vault) return;

  // Remove vault reference from files
  if (vault.fileIds.length) {
    await db.files.bulkUpdate(
      vault.fileIds.map(id => ({ key: id, changes: { vaultId: undefined } }))
    );
  }

  await db.vaults.delete(vaultId);
}

/** Check and auto-wipe expired ephemeral vaults */
export async function checkEphemeralExpiry(): Promise<void> {
  const now = Date.now();
  const expired = await db.vaults
    .filter(v => v.type === 'ephemeral' && !!v.ephemeralWipeAt && v.ephemeralWipeAt < now)
    .toArray();

  for (const vault of expired) {
    if (vault.id) await wipeVault(vault.id);
  }
}

/** Get all vaults */
export async function getAllVaults(): Promise<GKVault[]> {
  return db.vaults.orderBy('createdAt').reverse().toArray();
}

/** Get vault type badge color */
export function vaultTypeColor(type: VaultType): string {
  return { standard: '#6c63ff', forensic: '#ffd700', ephemeral: '#ff3355' }[type];
}

/**
 * Encryption Utilities (AES-GCM)
 */
async function deriveKey(password: string, salt: Uint8Array) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptContent(content: string, password: string): Promise<{ encrypted: string; iv: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(content)
  );
  
  const combined = new Uint8Array(salt.length + encrypted.byteLength);
  combined.set(salt);
  combined.set(new Uint8Array(encrypted), salt.length);
  
  return {
    encrypted: btoa(String.fromCharCode(...combined)),
    iv: btoa(String.fromCharCode(...iv))
  };
}

export async function decryptContent(encryptedB64: string, ivB64: string, password: string): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const salt = combined.slice(0, 16);
  const data = combined.slice(16);
  
  const key = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return new TextDecoder().decode(decrypted);
}
