/** ZIP inspection and repackaging in an isolated, bounded Limbo workspace. */
import { inflateSync, strFromU8, zipSync } from 'fflate';
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
  maxRatio: number;
}

// The synchronous engine retains the ZIP and decoded files in memory. Keep the
// mobile default conservative; this is a budget, not an OOM or runtime guarantee.
export const DEFAULT_LIMITS: ExtractLimits = {
  maxEntries: 20_000,
  maxTotalBytes: 64 * 1024 * 1024,
  maxRatio: 200,
};
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

/** A dependency-free checksum, not a cryptographic authenticity signature. */
export function hashBytes(bytes: Uint8Array): string {
  let h = 0xcbf29ce484222325n;
  for (const byte of bytes) h = ((h ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn;
  return h.toString(16).padStart(16, '0');
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function validatePaths(entries: ArchiveEntryInfo[]): void {
  const paths = new Map<string, boolean>();
  for (const entry of entries) {
    const canonical = safeSegments(entry.path).join('/');
    if (!canonical || canonical === '__proto__') throw new Error('Archive rejected: unsafe path.');
    if (paths.has(canonical)) throw new Error(`Archive rejected: colliding path "${entry.path}".`);
    paths.set(canonical, entry.isDir);
    entry.path = canonical + (entry.isDir ? '/' : '');
  }
  for (const path of paths.keys()) {
    const parts = path.split('/');
    while (parts.length > 1) {
      parts.pop();
      if (paths.get(parts.join('/')) === false) {
        throw new Error(`Archive rejected: file/directory collision at "${path}".`);
      }
    }
  }
}

interface ZipMember extends ArchiveEntryInfo {
  method: number;
  compressedSize: number;
  checksum: number;
  dataStart: number;
}

/** Parse ZIP32 metadata completely before allocating any decompressed output.
 * Encrypted, split and ZIP64 archives are explicitly unsupported. Local headers
 * must agree with the central directory; data descriptors are allowed.
 */
function inspectZip(raw: Uint8Array, limits: ExtractLimits): ZipMember[] {
  if (![limits.maxEntries, limits.maxTotalBytes, limits.maxRatio].every(n => Number.isFinite(n) && n > 0)) {
    throw new Error('Invalid archive limits.');
  }
  if (raw.length > MAX_ARCHIVE_BYTES) throw new Error('Archive rejected: compressed ZIP exceeds 64 MiB limit.');
  const data = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const within = (offset: number, size: number) => {
    if (offset < 0 || size < 0 || offset + size > raw.length) throw new Error('Invalid ZIP bounds.');
  };
  const u16 = (offset: number) => { within(offset, 2); return data.getUint16(offset, true); };
  const u32 = (offset: number) => { within(offset, 4); return data.getUint32(offset, true); };
  let end = raw.length - 22;
  for (; end >= Math.max(0, raw.length - 65557); end--) {
    if (u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === raw.length) break;
  }
  if (end < Math.max(0, raw.length - 65557)) throw new Error('Not a readable ZIP archive.');
  const count = u16(end + 10), centralSize = u32(end + 12), centralStart = u32(end + 16);
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== count) throw new Error('Split ZIP archives are unsupported.');
  if (count === 0xffff || centralSize === 0xffffffff || centralStart === 0xffffffff) throw new Error('ZIP64 archives are unsupported.');
  if (count > limits.maxEntries) throw new Error(`Archive rejected: entry count exceeds limit (${limits.maxEntries}).`);
  if (centralStart + centralSize !== end) throw new Error('Invalid ZIP central directory bounds.');
  const entries: ZipMember[] = [];
  const ranges: Array<[number, number]> = [];
  let cursor = centralStart, total = 0;
  for (let i = 0; i < count; i++) {
    within(cursor, 46);
    if (u32(cursor) !== 0x02014b50) throw new Error('Invalid ZIP central directory.');
    const flags = u16(cursor + 8), method = u16(cursor + 10), checksum = u32(cursor + 16);
    const compressedSize = u32(cursor + 20), size = u32(cursor + 24);
    const nameLength = u16(cursor + 28), extraLength = u16(cursor + 30), commentLength = u16(cursor + 32);
    const offset = u32(cursor + 42);
    if ([compressedSize, size, offset].includes(0xffffffff)) throw new Error('ZIP64 archives are unsupported.');
    if (u16(cursor + 34) || flags & 0x41 || ![0, 8].includes(method)) throw new Error('Unsupported split/encrypted ZIP or compression method.');
    if ((u32(cursor + 38) >>> 16 & 0xf000) === 0xa000) throw new Error('ZIP symlinks are unsupported.');
    const nameStart = cursor + 46;
    within(nameStart, nameLength + extraLength + commentLength);
    const nameBytes = raw.subarray(nameStart, nameStart + nameLength);
    const path = strFromU8(nameBytes, !(flags & 0x800));
    const isDir = path.endsWith('/');
    if (isDir && size !== 0) throw new Error('Archive rejected: directory contains file data.');
    total += size;
    if (total > limits.maxTotalBytes) throw new Error('Archive rejected: uncompressed size exceeds limit.');
    if (method === 0 && compressedSize !== size) throw new Error('ZIP stored-file size mismatch.');
    within(offset, 30);
    if (u32(offset) !== 0x04034b50 || u16(offset + 8) !== method || u16(offset + 6) !== flags) throw new Error('ZIP local header mismatch.');
    const localNameLength = u16(offset + 26), localExtraLength = u16(offset + 28);
    const dataStart = offset + 30 + localNameLength + localExtraLength;
    within(offset + 30, localNameLength + localExtraLength + compressedSize);
    if (localNameLength !== nameLength || nameBytes.some((byte, n) => byte !== raw[offset + 30 + n])) throw new Error('ZIP local filename mismatch.');
    if (!(flags & 8) && (u32(offset + 14) !== checksum || u32(offset + 18) !== compressedSize || u32(offset + 22) !== size)) throw new Error('ZIP local size/checksum mismatch.');
    if (dataStart + compressedSize > centralStart) throw new Error('ZIP data overlaps central directory.');
    ranges.push([offset, dataStart + compressedSize]);
    entries.push({ path, size, isDir, method, checksum, compressedSize, dataStart });
    cursor = nameStart + nameLength + extraLength + commentLength;
  }
  if (cursor !== centralStart + centralSize) throw new Error('ZIP entry count/size mismatch.');
  if (total / Math.max(raw.length, 1) > limits.maxRatio && total > 50 * 1024 * 1024) {
    throw new Error('Archive rejected: suspicious compression ratio (possible ZIP bomb).');
  }
  ranges.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i][0] < ranges[i - 1][1]) throw new Error('ZIP member ranges overlap.');
  }
  validatePaths(entries);
  return entries;
}

function decodeZip(raw: Uint8Array, limits: ExtractLimits): Array<{ entry: ZipMember; bytes: Uint8Array }> {
  return inspectZip(raw, limits).map(entry => {
    const compressed = raw.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
    // The extra byte detects under-declared deflate output without allowing the
    // inflater to grow an unbounded output buffer. Verify CRC as well as length.
    const bytes = entry.method === 0 ? compressed : inflateSync(compressed, { out: new Uint8Array(entry.size + 1) });
    if (bytes.length !== entry.size || crc32(bytes) !== entry.checksum) throw new Error(`ZIP size/checksum mismatch: ${entry.path}`);
    return { entry, bytes };
  });
}

export async function extractToLimbo(adapter: FsAdapter, archive: DirEntry, limits: ExtractLimits = DEFAULT_LIMITS): Promise<ExtractResult> {
  if (archive.size > MAX_ARCHIVE_BYTES) throw new Error('Archive rejected: compressed ZIP exceeds 64 MiB limit.');
  const decoded = decodeZip(await adapter.readBytes(archive), limits);
  const workspaceId = `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const workspace = await adapter.stagingDir(workspaceId);
  const entries: ArchiveEntryInfo[] = [];
  try {
    for (const { entry, bytes } of decoded) {
      if (entry.isDir) await adapter.ensureDir(workspace, entry.path);
      else await adapter.writeBytes(workspace, entry.path, bytes);
      entries.push({ path: entry.path, size: bytes.length, isDir: entry.isDir });
    }
  } catch (error) {
    await adapter.removeDir(workspace).catch(() => {});
    throw error;
  }
  return { workspace, workspaceId, entries, totalBytes: entries.reduce((total, e) => total + e.size, 0), fileCount: entries.filter(e => !e.isDir).length };
}

export interface RepackageResult {
  bytes: Uint8Array;
  checksum: string;
  entryCount: number;
  verified: boolean;
}

export function repackage(files: Record<string, Uint8Array>): RepackageResult {
  const names = Object.keys(files);
  if (!names.length) throw new Error('Nothing staged to repackage.');
  if (names.length > DEFAULT_LIMITS.maxEntries) throw new Error('Archive rejected: entry count exceeds limit.');
  const entries = names.map(path => ({ path, size: files[path].length, isDir: path.endsWith('/') }));
  validatePaths(entries);
  if (entries.reduce((total, entry) => total + entry.size, 0) > DEFAULT_LIMITS.maxTotalBytes) {
    throw new Error('Archive rejected: uncompressed size exceeds limit.');
  }
  if (entries.some(entry => entry.isDir && entry.size !== 0)) throw new Error('Archive rejected: directory contains file data.');
  const normalized: Record<string, Uint8Array> = Object.create(null);
  entries.forEach((entry, i) => { normalized[entry.path] = files[names[i]]; });
  const zipped = zipSync(normalized, { level: 6 });
  const decoded = decodeZip(zipped, DEFAULT_LIMITS);
  if (decoded.length !== names.length || decoded.some(({ entry, bytes }) => {
    const original = normalized[entry.path];
    return !original || bytes.length !== original.length || bytes.some((byte, i) => byte !== original[i]);
  })) throw new Error('Repackage verification failed — archive not placed.');
  return { bytes: zipped, checksum: hashBytes(zipped), entryCount: names.length, verified: true };
}
