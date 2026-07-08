import JSZip from 'jszip';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

/**
 * Ghost Key — Limbo sandbox for archives.
 *
 * Extract a .zip into a browsable sandbox folder, inspect/triage its files,
 * then "magnetize" it back: re-zip and compare against the manifest recorded at
 * extraction (content hashes, order-independent). If every original file is
 * still present and byte-identical (nothing added/removed/changed) the original
 * is replaced silently; otherwise the caller shows a replace/discard prompt.
 *
 * Native-only (Capacitor Filesystem). Sandboxes live under App Documents so
 * they can be browsed in the explorer.
 */
export interface SandboxEntry {
  path: string; // path within the archive, '/'-separated
  hash: string; // sha-256 of the original bytes
  size: number;
}

export interface SandboxSession {
  id: string;
  archiveName: string;
  originalUri: string;
  sandboxUri: string;
  entries: SandboxEntry[];
  createdAt: number;
}

export interface DiffResult {
  added: string[];
  removed: string[];
  modified: string[];
}

export interface MagnetizeResult {
  identical: boolean;
  diff: DiffResult;
  zipBytes: Uint8Array;
  fileCount: number;
}

const SANDBOX_ROOT = 'GhostKeySandbox';

export const archiveAvailable = (): boolean => Capacitor.isNativePlatform();

export function isArchive(ext: string): boolean {
  return ext.toLowerCase() === 'zip';
}

function joinUri(dirUri: string, name: string): string {
  return `${dirUri.replace(/\/+$/, '')}/${name}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Extract an archive at `archiveUri` into a fresh sandbox folder. */
export async function extractToSandbox(archiveUri: string, archiveName: string): Promise<SandboxSession> {
  const read = await Filesystem.readFile({ path: archiveUri });
  const zip = await JSZip.loadAsync(read.data as string, { base64: true });

  const base = archiveName.replace(/\.[^.]+$/, '') || 'archive';
  const safe = base.replace(/[^a-zA-Z0-9._ -]/g, '_');
  const id = `${safe}-${Date.now().toString(36)}`;
  const { uri: sandboxUri } = await Filesystem.getUri({ directory: Directory.Documents, path: `${SANDBOX_ROOT}/${id}` });
  await Filesystem.mkdir({ path: sandboxUri, recursive: true });

  const entries: SandboxEntry[] = [];
  const files = Object.values(zip.files).filter((f) => !f.dir);
  for (const f of files) {
    const bytes = await f.async('uint8array');
    const hash = await sha256Hex(bytes);
    await Filesystem.writeFile({ path: joinUri(sandboxUri, f.name), data: bytesToBase64(bytes), recursive: true });
    entries.push({ path: f.name, hash, size: bytes.length });
  }

  return { id, archiveName, originalUri: archiveUri, sandboxUri, entries, createdAt: Date.now() };
}

/** Recursively collect every file under the sandbox, with archive-relative paths. */
async function walkSandbox(rootUri: string, dirUri: string, prefix: string): Promise<{ relPath: string; uri: string }[]> {
  const out: { relPath: string; uri: string }[] = [];
  const res = await Filesystem.readdir({ path: dirUri });
  for (const f of res.files) {
    const rel = prefix ? `${prefix}/${f.name}` : f.name;
    const uri = f.uri ?? joinUri(dirUri, f.name);
    if (f.type === 'directory') {
      out.push(...(await walkSandbox(rootUri, uri, rel)));
    } else {
      out.push({ relPath: rel, uri });
    }
  }
  return out;
}

/** Re-zip the sandbox and diff it against the recorded manifest. */
export async function magnetize(session: SandboxSession): Promise<MagnetizeResult> {
  const zip = new JSZip();
  const currentHashes = new Map<string, string>();

  const files = await walkSandbox(session.sandboxUri, session.sandboxUri, '');
  for (const { relPath, uri } of files) {
    const read = await Filesystem.readFile({ path: uri });
    const bytes = base64ToBytes(read.data as string);
    zip.file(relPath, bytes);
    currentHashes.set(relPath, await sha256Hex(bytes));
  }

  const original = new Map(session.entries.map((e) => [e.path, e.hash]));
  const added = [...currentHashes.keys()].filter((p) => !original.has(p)).sort();
  const removed = [...original.keys()].filter((p) => !currentHashes.has(p)).sort();
  const modified = [...currentHashes.keys()]
    .filter((p) => original.has(p) && original.get(p) !== currentHashes.get(p))
    .sort();
  const identical = added.length === 0 && removed.length === 0 && modified.length === 0;

  const zipBytes = await zip.generateAsync({ type: 'uint8array' });
  return { identical, diff: { added, removed, modified }, zipBytes, fileCount: files.length };
}

/** Overwrite the original archive with the re-zipped bytes (optionally backing it up first). */
export async function replaceOriginal(session: SandboxSession, zipBytes: Uint8Array, backup: boolean): Promise<void> {
  if (backup) {
    try {
      await Filesystem.copy({ from: session.originalUri, to: `${session.originalUri}.bak` });
    } catch {
      /* backup best-effort */
    }
  }
  await Filesystem.writeFile({ path: session.originalUri, data: bytesToBase64(zipBytes) });
}

/** Remove the sandbox folder from disk. */
export async function deleteSandbox(session: SandboxSession): Promise<void> {
  try {
    await Filesystem.rmdir({ path: session.sandboxUri, recursive: true });
  } catch {
    /* already gone */
  }
}
