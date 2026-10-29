/**
 * Ghost Key — pure path helpers (no platform imports).
 *
 * Kept dependency-free so both the filesystem layer and the Limbo archive engine
 * can share the same traversal guard, and so it can be unit-tested under Node.
 */

/** Split a relative path into clean segments, rejecting traversal/absolute paths. */
export function safeSegments(relPath: string): string[] {
  if (/^[\\/]/.test(relPath) || /^[a-zA-Z]:/.test(relPath) || relPath.includes('\0')) {
    throw new Error(`Unsafe path rejected: ${relPath}`);
  }
  const segs = relPath.split(/[\\/]+/).filter((s) => s && s !== '.');
  if (segs.some((s) => s === '..')) {
    throw new Error(`Unsafe path rejected: ${relPath}`);
  }
  return segs;
}
