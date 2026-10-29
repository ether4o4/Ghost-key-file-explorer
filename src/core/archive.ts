/**
 * Ghost Key — Limbo Archive Engine
 *
 * Real ZIP extraction into an isolated staging workspace, with the safety rails
 * the spec requires: path-traversal protection, ZIP-bomb (ratio + absolute size)
 * detection, entry-count limits, and verified repackaging before placement.
 *
 * This never extracts an unknown archive directly into the user's library. The
 * caller extracts into `adapter.stagingDir(...)`, inspects, then repackages and
 * places the verified archive into a user-selected destination.
 */
import { unzipSync, zipSync, type Unzipped } from 'fflate';
import type { DirEntry, DirRef, FsAdapter } from './fs';
import { safeSegments } from './pathutil';

export interface ArchiveEntryInfo {
  path: string;
  size: number;
  isDir: boolean;
}

export interface ExtractResult {
  workspace: DirRef;
  workspaceId: string;
  entries: ArchiveEntryInfo[];
  totalBytes: number;
  fileCount: number;
}

export interface ExtractLimits {
  maxEntries: number;
  maxTotalBytes: number;
  maxRatio: number; // uncompressed / compressed
}

export const DEFAULT_LIMITS: ExtractLimits = {
  maxEntries: 20_000,
  maxTotalBytes: 2 * 1024 * 1024 * 1024, // 2 GiB
  maxRatio: 200,
};

/** A simple, dependency-free hash for integrity verification (FNV-1a 64-bit). */
export function hashBytes(bytes: Uint8Array): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < bytes.length; i++) {
    h = (h ^ BigInt(bytes[i])) & mask;
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}

function isUnsafe(path: string): boolean {
  if (path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path)) return true; // absolute
  return path.split(/[\\/]+/).some((s) => s === '..');
}

/**
 * Extract an archive entry's bytes into an isolated staging workspace.
 * Returns the workspace ref plus the inspected entry list.
 */
export async function extractToLimbo(
  adapter: FsAdapter,
  archive: DirEntry,
  limits: ExtractLimits = DEFAULT_LIMITS,
): Promise<ExtractResult> {
  const raw = await adapter.readBytes(archive);
  const compressedSize = raw.length || 1;

  let unzipped: Unzipped;
  try {
    unzipped = unzipSync(raw);
  } catch (e) {
    throw new Error(
      `Not a readable ZIP archive: ${e instanceof Error ? e.message : 'parse error'}`,
      { cause: e },
    );
  }

  const names = Object.keys(unzipped);
  if (names.length > limits.maxEntries) {
    throw new Error(`Archive rejected: ${names.length} entries exceeds limit (${limits.maxEntries}).`);
  }

  // Pre-flight the safety checks before writing anything to disk.
  let totalBytes = 0;
  for (const name of names) {
    if (isUnsafe(name)) {
      throw new Error(`Archive rejected: unsafe path "${name}" (traversal/absolute).`);
    }
    totalBytes += unzipped[name].length;
  }
  if (totalBytes > limits.maxTotalBytes) {
    throw new Error(
      `Archive rejected: uncompressed size ${(totalBytes / 1048576).toFixed(0)} MiB exceeds limit.`,
    );
  }
  const ratio = totalBytes / compressedSize;
  if (ratio > limits.maxRatio && totalBytes > 50 * 1024 * 1024) {
    throw new Error(
      `Archive rejected: suspicious compression ratio ${ratio.toFixed(0)}x (possible ZIP bomb).`,
    );
  }

  const workspaceId = `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const workspace = await adapter.stagingDir(workspaceId);

  const entries: ArchiveEntryInfo[] = [];
  let fileCount = 0;
  for (const name of names) {
    const bytes = unzipped[name];
    const isDir = name.endsWith('/');
    // Re-validate each segment through the shared guard before writing.
    const segs = safeSegments(name);
    if (isDir) {
      if (segs.length) await adapter.ensureDir(workspace, segs.join('/'));
      entries.push({ path: segs.join('/') + '/', size: 0, isDir: true });
    } else {
      await adapter.writeBytes(workspace, segs.join('/'), bytes);
      entries.push({ path: segs.join('/'), size: bytes.length, isDir: false });
      fileCount++;
    }
  }

  return { workspace, workspaceId, entries, totalBytes, fileCount };
}

export interface RepackageResult {
  bytes: Uint8Array;
  checksum: string;
  entryCount: number;
  verified: boolean;
}

/**
 * Rebuild a ZIP from a set of staged files, verify it re-parses, and return the
 * verified bytes + checksum. The caller writes the bytes to the chosen
 * destination ONLY after this resolves successfully.
 */
export function repackage(files: Record<string, Uint8Array>): RepackageResult {
  const names = Object.keys(files);
  if (names.length === 0) throw new Error('Nothing staged to repackage.');
  for (const name of names) {
    if (isUnsafe(name)) throw new Error(`Refusing to pack unsafe path "${name}".`);
  }
  const zipped = zipSync(files, { level: 6 });

  // Verify the produced archive re-parses and round-trips every entry.
  let verified: boolean;
  try {
    const back = unzipSync(zipped);
    verified =
      Object.keys(back).length === names.length &&
      names.every((n) => back[n] && back[n].length === files[n].length);
  } catch {
    verified = false;
  }
  if (!verified) throw new Error('Repackage verification failed — archive not placed.');

  return { bytes: zipped, checksum: hashBytes(zipped), entryCount: names.length, verified };
}
