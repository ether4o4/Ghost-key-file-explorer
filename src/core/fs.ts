/**
 * Ghost Key — Real Filesystem Layer
 *
 * One backend-agnostic interface, two implementations:
 *   • web    — File System Access API (Chrome/Edge desktop, dev preview)
 *   • native — Capacitor Filesystem plugin (the Android APK, real device storage)
 *
 * No server, no daemon, no root. On web the browser grants per-folder read+write
 * when the user picks a directory. Android uses the existing Capacitor file-path
 * backend; every operation is subject to current scoped-storage permissions.
 * Its permission alias does not establish all-files or SAF-provider access.
 *
 * Listings read ONE LEVEL, ON DEMAND. Selected directory transfers recurse;
 * there is no background scanning or indexing.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { safeSegments } from './pathutil';

// ─── Shared types ───────────────────────────────────────────────────────────────

export type EntryKind = 'file' | 'directory';
export type Backend = 'web' | 'native';
export type TransferMode = 'move' | 'copy';

/** A single listing row. Metadata only — file contents are never read here. */
export interface DirEntry {
  name: string;
  kind: EntryKind;
  size: number;
  mtime: number;
  ext: string;
  handle?: FSHandle; // web backend
  uri?: string; // native backend
  nativeId?: string; // transient device/inode identity, never persisted
  unsupportedNativeLink?: boolean;
}

/** A pointer to a directory the user is browsing. */
export interface DirRef {
  backend: Backend;
  name: string;
  handle?: FSDirHandle; // web backend
  uri?: string; // native backend
  canonicalUri?: string; // transient native identity after validated listing
}

/** A quick-access location shown on the pane's start screen. */
export interface RootShortcut extends DirRef {
  label: string;
  icon: string;
}

export interface FsAdapter {
  backend: Backend;
  /** Whether this backend exposes a native "pick a folder" dialog. */
  canPick: boolean;
  supported(): boolean;
  /** Request backend permission. Individual operations remain capability checked. */
  ensureAccess(): Promise<boolean>;
  roots(): Promise<RootShortcut[]>;
  pickRoot(): Promise<DirRef | null>;
  list(dir: DirRef): Promise<DirEntry[]>;
  enter(entry: DirEntry): DirRef;
  mkdir(dir: DirRef, name: string): Promise<void>;
  touch(dir: DirRef, name: string): Promise<void>;
  remove(dir: DirRef, entry: DirEntry): Promise<void>;
  rename(dir: DirRef, entry: DirEntry, newName: string): Promise<void>;
  transfer(srcDir: DirRef, entry: DirEntry, destDir: DirRef, mode: TransferMode): Promise<void>;
  importFiles(files: File[], destDir: DirRef): Promise<number>;
  importDrop(dt: DataTransfer, destDir: DirRef): Promise<number>;
  resolveUrl(entry: DirEntry): Promise<{ url: string; revoke?: () => void }>;
  /** Read a file entry's raw bytes (used by the Limbo archive engine). */
  readBytes(entry: DirEntry): Promise<Uint8Array>;
  /**
   * Create or return an isolated, app-private staging directory that is NOT part
   * of the user's managed library (used by Limbo). `sub` is a workspace id.
   */
  stagingDir(sub: string): Promise<DirRef>;
  /** Write a new file inside `dir`; reject occupied destinations. */
  writeBytes(dir: DirRef, relPath: string, bytes: Uint8Array): Promise<void>;
  /** Ensure a (possibly nested) sub-directory exists under `dir`; returns it. */
  ensureDir(dir: DirRef, relPath: string): Promise<DirRef>;
  /** Recursively delete a staging directory created by `stagingDir`. */
  removeDir(dir: DirRef): Promise<void>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

export function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function splitName(name: string): { base: string; tail: string } {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? { base: name.slice(0, dot), tail: name.slice(dot) } : { base: name, tail: '' };
}

/** Generate the next non-colliding name given an existence probe. */
async function uniqueName(name: string, exists: (n: string) => Promise<boolean>): Promise<string> {
  if (!(await exists(name))) return name;
  const { base, tail } = splitName(name);
  for (let i = 1; ; i++) {
    const candidate = i === 1 ? `${base} (copy)${tail}` : `${base} (copy ${i})${tail}`;
    if (!(await exists(candidate))) return candidate;
  }
}

function base64FromBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function bufferFromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export { safeSegments };

// ═══════════════════════════════════════════════════════════════════════════════
//  WEB — File System Access API
// ═══════════════════════════════════════════════════════════════════════════════

export type FSPermission = 'granted' | 'denied' | 'prompt';

export interface FSHandle {
  readonly kind: EntryKind;
  readonly name: string;
  isSameEntry?(other: FSHandle): Promise<boolean>;
  queryPermission?(d: { mode: 'read' | 'readwrite' }): Promise<FSPermission>;
  requestPermission?(d: { mode: 'read' | 'readwrite' }): Promise<FSPermission>;
}

export interface FSWritable {
  write(data: BufferSource | Blob | string): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

export interface FSFileHandle extends FSHandle {
  readonly kind: 'file';
  getFile(): Promise<File>;
  createWritable(opts?: { keepExistingData?: boolean }): Promise<FSWritable>;
  move?(dest: FSDirHandle | string, name?: string): Promise<void>;
}

export interface FSDirHandle extends FSHandle {
  readonly kind: 'directory';
  values(): AsyncIterableIterator<FSHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FSFileHandle>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FSDirHandle>;
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>;
  resolve?(possibleDescendant: FSHandle): Promise<string[] | null>;
}

interface PickerWindow {
  showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FSDirHandle>;
}

async function webChildExists(dir: FSDirHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch (e) {
    if (!hasErrorName(e, 'NotFoundError', 'TypeMismatchError')) throw e;
  }
  try {
    await dir.getDirectoryHandle(name);
    return true;
  } catch (e) {
    if (!hasErrorName(e, 'NotFoundError', 'TypeMismatchError')) throw e;
    return false;
  }
}

function hasErrorName(error: unknown, ...names: string[]): boolean {
  return !!error && typeof error === 'object' && 'name' in error && names.includes(String(error.name));
}

function validateName(name: string): void {
  if (!name.trim() || name === '.' || name === '..' || /[/\\\0]/.test(name)) {
    throw new Error('Use a non-empty file name without path separators.');
  }
}

async function requireVacant(name: string, exists: (name: string) => Promise<boolean>): Promise<void> {
  validateName(name);
  if (await exists(name)) throw new Error(`"${name}" already exists.`);
}

async function webWrite(handle: FSFileHandle, data: Blob | string): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
    await writable.close();
  } catch (e) {
    // Closing after a failed write may commit partial bytes. Never report that as success.
    await writable.abort?.().catch(() => undefined);
    throw e;
  }
}

async function webSource(dir: FSDirHandle, entry: DirEntry): Promise<FSHandle> {
  validateName(entry.name);
  const current = entry.kind === 'file'
    ? await dir.getFileHandle(entry.name)
    : await dir.getDirectoryHandle(entry.name);
  if (!entry.handle?.isSameEntry || !(await entry.handle.isSameEntry(current))) {
    throw new Error('The source changed. Refresh the folder and retry.');
  }
  return current;
}

async function webCheckDestination(handle: FSHandle, dest: FSDirHandle): Promise<void> {
  if (handle.kind !== 'directory') return;
  const source = handle as FSDirHandle;
  // FSA identity, not display names: separately picked handles may represent the same folder.
  if (!source.resolve) throw new Error('This provider cannot safely check folder ancestry.');
  if (await source.resolve(dest) !== null) {
    throw new Error('Cannot copy or move a folder into itself or a descendant.');
  }
}

async function webCopyFile(src: FSFileHandle, destDir: FSDirHandle, name: string): Promise<void> {
  const file = await src.getFile();
  await requireVacant(name, (n) => webChildExists(destDir, n));
  const dst = await destDir.getFileHandle(name, { create: true });
  await webWrite(dst, file);
}

async function webCopyDir(
  src: FSDirHandle,
  destDir: FSDirHandle,
  name: string,
): Promise<void> {
  await requireVacant(name, (n) => webChildExists(destDir, n));
  const dst = await destDir.getDirectoryHandle(name, { create: true });
  for await (const child of src.values()) {
    if (child.kind === 'file') {
      await webCopyFile(child as FSFileHandle, dst, child.name);
    } else {
      await webCopyDir(child as FSDirHandle, dst, child.name);
    }
  }
}

async function webCopyHandle(handle: FSHandle, destDir: FSDirHandle): Promise<string> {
  validateName(handle.name);
  await webCheckDestination(handle, destDir);
  const name = await uniqueName(handle.name, (n) => webChildExists(destDir, n));
  if (handle.kind === 'file') await webCopyFile(handle as FSFileHandle, destDir, name);
  else await webCopyDir(handle as FSDirHandle, destDir, name);
  return name;
}

type DropHandleResult = { handle: FSHandle | null; error?: unknown };
interface CapturedDrop {
  files: File[];
  items: Array<{ file: File | null; handle: Promise<DropHandleResult> }>;
}

function captureDrop(dt: DataTransfer, useHandles: boolean): CapturedDrop {
  // The event's data store becomes protected after the drop callback returns.
  // Capture every File and initiate every handle request before any await/queue.
  const files = Array.from(dt.files ?? []);
  const items = Array.from(dt.items ?? []).filter((item) => item.kind === 'file').map((item) => {
    const file = item.getAsFile?.() ?? null;
    const candidate = item as unknown as { getAsFileSystemHandle?: () => Promise<FSHandle | null> };
    let handle: Promise<DropHandleResult> = Promise.resolve({ handle: null });
    if (useHandles && candidate.getAsFileSystemHandle) {
      try {
        handle = Promise.resolve(candidate.getAsFileSystemHandle()).then(
          (value) => ({ handle: value }), (error: unknown) => ({ handle: null, error }),
        );
      } catch (error) { handle = Promise.resolve({ handle: null, error }); }
    }
    return { file, handle };
  });
  return { files, items };
}

async function importCapturedDrop(adapter: FsAdapter, drop: CapturedDrop, dest: DirRef): Promise<number> {
  let count = 0;
  for (const item of drop.items) {
    const result = await item.handle;
    if (result.error !== undefined) throw result.error;
    if (result.handle) {
      await webCopyHandle(result.handle, dest.handle!);
      count++;
    } else if (item.file) {
      count += await adapter.importFiles([item.file], dest);
    }
  }
  if (count === 0 && drop.files.length) count += await adapter.importFiles(drop.files, dest);
  return count;
}

const webAdapter: FsAdapter = {
  backend: 'web',
  canPick: true,

  supported() {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  },

  async ensureAccess() {
    return this.supported();
  },

  async roots() {
    return [];
  },

  async pickRoot() {
    const w = window as unknown as PickerWindow;
    if (!w.showDirectoryPicker) throw new Error('Folder access is not supported in this browser.');
    try {
      const handle = await w.showDirectoryPicker({ mode: 'readwrite' });
      return { backend: 'web', name: handle.name, handle };
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null;
      throw e;
    }
  },

  async list(dir) {
    const handle = dir.handle!;
    if (handle.queryPermission) {
      const p = await handle.queryPermission({ mode: 'readwrite' });
      if (p !== 'granted' && handle.requestPermission) {
        const granted = await handle.requestPermission({ mode: 'readwrite' });
        if (granted !== 'granted') throw new Error('Folder permission denied. Regrant access and retry.');
      } else if (p !== 'granted') {
        throw new Error('Folder permission denied. Reopen the folder to regrant access.');
      }
    }
    const out: DirEntry[] = [];
    for await (const h of handle.values()) {
      let size = 0;
      let mtime = 0;
      if (h.kind === 'file') {
        try {
          const f = await (h as FSFileHandle).getFile();
          size = f.size;
          mtime = f.lastModified;
        } catch {
          /* listable but unreadable */
        }
      }
      out.push({
        name: h.name,
        kind: h.kind,
        handle: h,
        size,
        mtime,
        ext: h.kind === 'file' ? extOf(h.name) : '',
      });
    }
    return out;
  },

  enter(entry) {
    return { backend: 'web', name: entry.name, handle: entry.handle as FSDirHandle };
  },

  async mkdir(dir, name) {
    await requireVacant(name, (n) => webChildExists(dir.handle!, n));
    await dir.handle!.getDirectoryHandle(name, { create: true });
  },

  async touch(dir, name) {
    await requireVacant(name, (n) => webChildExists(dir.handle!, n));
    const fh = await dir.handle!.getFileHandle(name, { create: true });
    await webWrite(fh, '');
  },

  async remove(dir, entry) {
    await webSource(dir.handle!, entry);
    await dir.handle!.removeEntry(entry.name, { recursive: true });
  },

  async rename(dir, entry, newName) {
    validateName(newName);
    if (newName === entry.name) return;
    const current = await webSource(dir.handle!, entry);
    await requireVacant(newName, (n) => webChildExists(dir.handle!, n));
    const h = current as FSFileHandle;
    if (entry.kind === 'file' && typeof h.move === 'function') {
      try {
        await h.move(newName);
        return;
      } catch (e) {
        if (!hasErrorName(e, 'NotSupportedError')) throw e;
      }
    }
    if (entry.kind === 'file') await webCopyFile(h, dir.handle!, newName);
    else await webCopyDir(current as FSDirHandle, dir.handle!, newName);
    await webSource(dir.handle!, entry);
    await dir.handle!.removeEntry(entry.name, { recursive: true });
  },

  async transfer(srcDir, entry, destDir, mode) {
    const dest = destDir.handle!;
    const src = srcDir.handle!;
    const current = await webSource(src, entry);
    // No-op if dropping into the same directory on a move.
    if (mode === 'move' && src.isSameEntry && (await src.isSameEntry(dest))) return;
    await webCheckDestination(current, dest);

    if (mode === 'move' && entry.kind === 'file' && typeof (current as FSFileHandle).move === 'function') {
      const name = await uniqueName(entry.name, (n) => webChildExists(dest, n));
      try {
        await (current as FSFileHandle).move!(dest, name);
        return;
      } catch (e) {
        if (!hasErrorName(e, 'NotSupportedError')) throw e;
      }
    }
    await webCopyHandle(current, dest);
    if (mode === 'move') {
      await webSource(src, entry);
      await src.removeEntry(entry.name, { recursive: true });
    }
  },

  async importFiles(files, destDir) {
    const dest = destDir.handle!;
    let n = 0;
    for (const file of files) {
      validateName(file.name);
      const name = await uniqueName(file.name, (nm) => webChildExists(dest, nm));
      await requireVacant(name, (nm) => webChildExists(dest, nm));
      const fh = await dest.getFileHandle(name, { create: true });
      await webWrite(fh, file);
      n++;
    }
    return n;
  },

  importDrop(dt, destDir) {
    return importCapturedDrop(this, captureDrop(dt, true), destDir);
  },

  async resolveUrl(entry) {
    const file = await (entry.handle as FSFileHandle).getFile();
    const url = URL.createObjectURL(file);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  },

  async readBytes(entry) {
    const file = await (entry.handle as FSFileHandle).getFile();
    return new Uint8Array(await file.arrayBuffer());
  },

  // Web has no app-private storage root, so Limbo stages inside an OPFS-backed
  // directory when available; otherwise it falls back to an in-memory handle via
  // the origin-private file system. The user's picked folders are never touched.
  async stagingDir(sub) {
    validateName(sub);
    const navAny = navigator as unknown as {
      storage?: { getDirectory?: () => Promise<FSDirHandle> };
    };
    if (!navAny.storage?.getDirectory) {
      throw new Error('Isolated staging is unavailable in this browser.');
    }
    const root = await navAny.storage.getDirectory();
    const limbo = await root.getDirectoryHandle('gk-limbo', { create: true });
    const ws = await limbo.getDirectoryHandle(sub, { create: true });
    return { backend: 'web', name: sub, handle: ws };
  },

  async ensureDir(dir, relPath) {
    let handle = dir.handle!;
    for (const seg of safeSegments(relPath)) {
      handle = await handle.getDirectoryHandle(seg, { create: true });
    }
    return { backend: 'web', name: handle.name, handle };
  },

  async writeBytes(dir, relPath, bytes) {
    const segs = safeSegments(relPath);
    const fileName = segs.pop();
    if (!fileName) throw new Error('Empty file path');
    let handle = dir.handle!;
    for (const seg of segs) handle = await handle.getDirectoryHandle(seg, { create: true });
    await requireVacant(fileName, (name) => webChildExists(handle, name));
    const fh = await handle.getFileHandle(fileName, { create: true });
    await webWrite(fh, new Blob([
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    ]));
  },

  async removeDir(dir) {
    // Remove the workspace directory from its OPFS parent.
    const navAny = navigator as unknown as {
      storage?: { getDirectory?: () => Promise<FSDirHandle> };
    };
    validateName(dir.name);
    if (!navAny.storage?.getDirectory) throw new Error('Isolated staging is unavailable in this browser.');
    try {
      const root = await navAny.storage.getDirectory();
      const limbo = await root.getDirectoryHandle('gk-limbo');
      const current = await limbo.getDirectoryHandle(dir.name);
      if (!dir.handle?.isSameEntry || !(await dir.handle.isSameEntry(current))) {
        throw new Error('The staging workspace changed; refusing to remove it.');
      }
      await limbo.removeEntry(dir.name, { recursive: true });
    } catch (error) {
      if (!hasErrorName(error, 'NotFoundError')) throw error;
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  NATIVE — Capacitor Filesystem
// ═══════════════════════════════════════════════════════════════════════════════

function joinUri(dirUri: string, name: string): string {
  if (dirUri.startsWith('/')) {
    return `file://${dirUri.replace(/\/+$/, '').split('/').map(encodeURIComponent).join('/')}/${encodeURIComponent(name)}`;
  }
  return `${dirUri.replace(/\/+$/, '')}/${dirUri.startsWith('file://') ? encodeURIComponent(name) : name}`;
}

function nativePath(uri: string): string {
  // Capacitor 6 mutations use java.io.File, not DocumentFile/SAF tree providers.
  // Refuse unsupported content URIs rather than pretending they are writable paths.
  const path = uri.startsWith('file://') ? decodeURIComponent(new URL(uri).pathname) : uri;
  if (!path.startsWith('/')) throw new Error('This provider does not support file-path operations.');
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return `/${parts.join('/')}`;
}

interface NativeInspection {
  canonicalUri: string;
  files: Array<{ name: string; type: EntryKind; uri: string; nativeId: string; size: number; mtime: number; unsupportedSymlink?: boolean }>;
}
const nativeGuard = registerPlugin<{
  inspectDirectory(options: { path: string }): Promise<NativeInspection>;
  verifyCopy(options: { from: string; to: string }): Promise<void>;
  verifyTree(options: { path: string }): Promise<void>;
}>('GhostKeyFsGuard');

async function nativeChildExists(dirUri: string, name: string): Promise<boolean> {
  // Plugin stat rejects "File does not exist" for inaccessible paths too.
  // A readable parent listing is required; permission/provider errors must propagate.
  const { files } = await nativeGuard.inspectDirectory({ path: dirUri });
  return files.some((file) => file.name === name);
}

async function nativeSource(dir: DirRef, entry: DirEntry): Promise<void> {
  validateName(entry.name);
  const { files, canonicalUri } = await nativeGuard.inspectDirectory({ path: dir.uri! });
  if (nativePath(entry.uri!) !== nativePath(joinUri(canonicalUri, entry.name))) {
    throw new Error('The source does not belong to this folder. Refresh and retry.');
  }
  const current = files.find((file) => file.name === entry.name);
  if (current?.unsupportedSymlink) throw new Error('Symbolic-link mutations are unsupported by this file-path backend.');
  if (!entry.nativeId || !current || current.type !== entry.kind || current.nativeId !== entry.nativeId) {
    throw new Error('The source changed. Refresh and retry.');
  }
}

async function nativeVerifyMove(src: DirRef, entry: DirEntry, destination: DirRef, name: string): Promise<void> {
  const target = await nativeGuard.inspectDirectory({ path: destination.uri! });
  const moved = target.files.find(file => file.name === name);
  if (!moved || moved.nativeId !== entry.nativeId) throw new Error('Move verification failed. Inspect source and destination before retrying.');
  const remaining = await nativeGuard.inspectDirectory({ path: src.uri! });
  if (remaining.files.some(file => file.name === entry.name)) throw new Error('Move verification failed: source still exists.');
}

const nativeAdapter: FsAdapter = {
  backend: 'native',
  canPick: false,

  supported() {
    return Capacitor.isNativePlatform();
  },

  async ensureAccess() {
    try {
      const status = await Filesystem.checkPermissions();
      if (status.publicStorage === 'granted') return true;
      const req = await Filesystem.requestPermissions();
      return req.publicStorage === 'granted';
    } catch {
      return false;
    }
  },

  async roots() {
    const shortcuts: RootShortcut[] = [];
    try {
      const { uri } = await Filesystem.getUri({ directory: Directory.ExternalStorage, path: '' });
      const root = uri.replace(/\/+$/, '');
      shortcuts.push({ backend: 'native', name: 'Internal Storage', label: 'Internal Storage', icon: 'drive', uri: root });
      const subs: Array<[string, string]> = [
        ['Download', 'download'],
        ['Documents', 'documents'],
        ['DCIM', 'image'],
        ['Pictures', 'image'],
        ['Movies', 'video'],
        ['Music', 'audio'],
      ];
      for (const [folder, icon] of subs) {
        shortcuts.push({ backend: 'native', name: folder, label: folder, icon, uri: joinUri(root, folder) });
      }
    } catch {
      /* external storage unavailable */
    }
    try {
      const { uri } = await Filesystem.getUri({ directory: Directory.Documents, path: '' });
      shortcuts.push({ backend: 'native', name: 'App Documents', label: 'App Documents', icon: 'documents', uri: uri.replace(/\/+$/, '') });
    } catch {
      /* ignore */
    }
    return shortcuts;
  },

  async pickRoot() {
    return null; // native uses the shortcut list
  },

  async list(dir) {
    const res = await nativeGuard.inspectDirectory({ path: dir.uri! });
    dir.canonicalUri = res.canonicalUri;
    return res.files.map((f) => ({
      name: f.name,
      kind: (f.type === 'directory' ? 'directory' : 'file') as EntryKind,
      size: f.size ?? 0,
      mtime: f.mtime ?? 0,
      ext: f.type === 'directory' ? '' : extOf(f.name),
      uri: f.uri,
      nativeId: f.nativeId,
      unsupportedNativeLink: f.unsupportedSymlink,
    }));
  },

  enter(entry) {
    return { backend: 'native', name: entry.name, uri: entry.uri! };
  },

  async mkdir(dir, name) {
    nativePath(dir.uri!);
    await requireVacant(name, (n) => nativeChildExists(dir.uri!, n));
    await Filesystem.mkdir({ path: joinUri(dir.uri!, name), recursive: false });
  },

  async touch(dir, name) {
    nativePath(dir.uri!);
    await requireVacant(name, (n) => nativeChildExists(dir.uri!, n));
    await Filesystem.writeFile({ path: joinUri(dir.uri!, name), data: '' });
  },

  async remove(dir, entry) {
    await nativeSource(dir, entry);
    if (entry.kind === 'directory') {
      await nativeGuard.verifyTree({ path: entry.uri! });
      await Filesystem.rmdir({ path: entry.uri!, recursive: true });
    }
    else await Filesystem.deleteFile({ path: entry.uri! });
    if (await nativeChildExists(dir.uri!, entry.name)) {
      throw new Error('Delete verification failed: item still exists. Some children may have been removed.');
    }
  },

  async rename(dir, entry, newName) {
    validateName(newName);
    if (newName === entry.name) return;
    await nativeSource(dir, entry);
    await requireVacant(newName, (n) => nativeChildExists(dir.uri!, n));
    await Filesystem.rename({ from: entry.uri!, to: joinUri(dir.uri!, newName) });
    await nativeVerifyMove(dir, entry, dir, newName);
  },

  async transfer(srcDir, entry, destDir, mode) {
    await nativeSource(srcDir, entry);
    const dest = await nativeGuard.inspectDirectory({ path: destDir.uri! });
    const source = await nativeGuard.inspectDirectory({ path: srcDir.uri! });
    const destPath = nativePath(dest.canonicalUri);
    if (mode === 'move' && nativePath(source.canonicalUri) === destPath) return;
    const sourcePath = nativePath(entry.uri!);
    if (entry.kind === 'directory' && (sourcePath === destPath || destPath.startsWith(`${sourcePath}/`))) {
      throw new Error('Cannot copy or move a folder into itself or a descendant.');
    }
    const name = await uniqueName(entry.name, (n) => nativeChildExists(destDir.uri!, n));
    await requireVacant(name, (n) => nativeChildExists(destDir.uri!, n));
    const to = joinUri(destDir.uri!, name);
    if (mode === 'move') {
      await Filesystem.rename({ from: entry.uri!, to });
      await nativeVerifyMove(srcDir, entry, destDir, name);
    } else {
      if (entry.kind === 'directory') await nativeGuard.verifyTree({ path: entry.uri! });
      await Filesystem.copy({ from: entry.uri!, to });
      await nativeGuard.verifyCopy({ from: entry.uri!, to });
    }
  },

  async importFiles(files, destDir) {
    nativePath(destDir.uri!);
    let n = 0;
    for (const file of files) {
      validateName(file.name);
      const name = await uniqueName(file.name, (nm) => nativeChildExists(destDir.uri!, nm));
      const data = base64FromBuffer(await file.arrayBuffer());
      await requireVacant(name, (nm) => nativeChildExists(destDir.uri!, nm));
      await Filesystem.writeFile({ path: joinUri(destDir.uri!, name), data });
      n++;
    }
    return n;
  },

  importDrop(dt, destDir) {
    return importCapturedDrop(this, captureDrop(dt, false), destDir);
  },

  async resolveUrl(entry) {
    return { url: Capacitor.convertFileSrc(entry.uri!) };
  },

  async readBytes(entry) {
    nativePath(entry.uri!);
    if (entry.unsupportedNativeLink) throw new Error('Reading symbolic links is unsupported.');
    const res = await Filesystem.readFile({ path: entry.uri! });
    // Native returns base64 string; web (rare) could return a Blob.
    if (typeof res.data === 'string') return bufferFromBase64(res.data);
    return new Uint8Array(await (res.data as Blob).arrayBuffer());
  },

  // Limbo stages in app-private Cache storage — isolated from the user's library
  // and auto-evictable by the OS. We return the resolved absolute uri.
  async stagingDir(sub) {
    validateName(sub);
    await Filesystem.mkdir({ directory: Directory.Cache, path: 'gk-limbo', recursive: true }).catch(async (error) => {
      const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: 'gk-limbo' });
      try { await nativeGuard.inspectDirectory({ path: uri }); } catch { throw error; }
    });
    await Filesystem.mkdir({ directory: Directory.Cache, path: `gk-limbo/${sub}` });
    const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: `gk-limbo/${sub}` });
    return { backend: 'native', name: sub, uri: uri.replace(/\/+$/, '') };
  },

  async ensureDir(dir, relPath) {
    const segs = safeSegments(relPath);
    nativePath(dir.uri!);
    const uri = segs.reduce((parent, segment) => joinUri(parent, segment), dir.uri!);
    if (segs.length) {
      await Filesystem.mkdir({ path: uri, recursive: true }).catch(async (error) => {
        try { await nativeGuard.inspectDirectory({ path: uri }); } catch { throw error; }
      });
    }
    await nativeGuard.inspectDirectory({ path: uri });
    return { backend: 'native', name: segs[segs.length - 1] ?? dir.name, uri };
  },

  async writeBytes(dir, relPath, bytes) {
    const segs = safeSegments(relPath);
    const fileName = segs.pop();
    if (!fileName) throw new Error('Empty file path');
    const parent = segs.length ? await nativeAdapter.ensureDir(dir, segs.join('/')) : dir;
    const parentUri = parent.uri!;
    nativePath(parentUri);
    await requireVacant(fileName, (name) => nativeChildExists(parentUri, name));
    await Filesystem.writeFile({
      path: joinUri(parentUri, fileName),
      data: base64FromBuffer(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      ),
    });
  },

  async removeDir(dir) {
    validateName(dir.name);
    const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: 'gk-limbo' });
    const expected = joinUri(uri, dir.name);
    if (nativePath(dir.uri!) !== nativePath(expected)) throw new Error('Refusing to remove a non-staging directory.');
    const parent = await nativeGuard.inspectDirectory({ path: uri });
    const child = parent.files.find((file) => file.name === dir.name);
    if (!child) return;
    if (child.type !== 'directory' || child.unsupportedSymlink) throw new Error('Invalid staging workspace.');
    await nativeGuard.verifyTree({ path: expected });
    await Filesystem.rmdir({ path: expected, recursive: true });
    if (await nativeChildExists(uri, dir.name)) throw new Error('Staging cleanup failed; directory still exists.');
  },
};

// ─── Selection ──────────────────────────────────────────────────────────────────

let cached: FsAdapter | null = null;

export function getAdapter(): FsAdapter {
  if (cached) return cached;
  const base = Capacitor.isNativePlatform() ? nativeAdapter : webAdapter;
  // Serialize this app's mutations so two panes cannot both select the same vacant
  // collision name. This cannot lock out other apps or external provider changes.
  let pending: Promise<unknown> = Promise.resolve();
  const exclusive = <T,>(operation: () => Promise<T>): Promise<T> => {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  };
  cached = {
    ...base,
    mkdir: (dir, name) => exclusive(() => base.mkdir(dir, name)),
    touch: (dir, name) => exclusive(() => base.touch(dir, name)),
    remove: (dir, entry) => exclusive(() => base.remove(dir, entry)),
    rename: (dir, entry, name) => exclusive(() => base.rename(dir, entry, name)),
    transfer: (src, entry, dest, mode) => exclusive(() => base.transfer(src, entry, dest, mode)),
    importFiles: (files, dest) => exclusive(() => base.importFiles(files, dest)),
    importDrop: (dt, dest) => {
      const captured = captureDrop(dt, base.backend === 'web');
      return exclusive(() => importCapturedDrop(base, captured, dest));
    },
    stagingDir: (sub) => exclusive(() => base.stagingDir(sub)),
    ensureDir: (dir, path) => exclusive(() => base.ensureDir(dir, path)),
    writeBytes: (dir, path, bytes) => exclusive(() => base.writeBytes(dir, path, bytes)),
    removeDir: (dir) => exclusive(() => base.removeDir(dir)),
  };
  return cached;
}
