/**
 * NeverSoft Services — Real Filesystem Layer
 *
 * One backend-agnostic interface, two implementations:
 *   • web    — File System Access API (Chrome/Edge desktop, dev preview)
 *   • native — Capacitor Filesystem plugin (the Android APK, real device storage)
 *
 * No server, no daemon, no root. On web the browser grants per-folder read+write
 * when the user picks a directory; on Android the app holds All-Files-Access so it
 * can read/move/copy/delete anywhere the user has rights to — full permissions,
 * zero elevation.
 *
 * Hard rule: directories are read ONE LEVEL, ON DEMAND. No recursive walking, no
 * background scanning, no indexing.
 */

import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

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
}

/** A pointer to a directory the user is browsing. */
export interface DirRef {
  backend: Backend;
  name: string;
  handle?: FSDirHandle; // web backend
  uri?: string; // native backend
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
  /** Request whatever OS permission is needed. Returns true if usable. */
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
}

interface PickerWindow {
  showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FSDirHandle>;
}

async function webChildExists(dir: FSDirHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    /* not a file */
  }
  try {
    await dir.getDirectoryHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function webCopyFile(src: FSFileHandle, destDir: FSDirHandle, name: string): Promise<void> {
  const file = await src.getFile();
  const dst = await destDir.getFileHandle(name, { create: true });
  const w = await dst.createWritable();
  try {
    await w.write(file);
  } finally {
    await w.close();
  }
}

async function webCopyDir(
  src: FSDirHandle,
  destDir: FSDirHandle,
  name: string,
  guard?: FSDirHandle,
): Promise<void> {
  const dst = await destDir.getDirectoryHandle(name, { create: true });
  for await (const child of src.values()) {
    if (child.kind === 'file') {
      await webCopyFile(child as FSFileHandle, dst, child.name);
    } else {
      // Never recurse into the copy's own destination — prevents a runaway loop
      // when a folder is dropped into one of its descendants.
      if (guard && (await (child as FSDirHandle).isSameEntry?.(guard))) continue;
      await webCopyDir(child as FSDirHandle, dst, child.name, guard);
    }
  }
}

async function webCopyHandle(handle: FSHandle, destDir: FSDirHandle): Promise<string> {
  const name = await uniqueName(handle.name, (n) => webChildExists(destDir, n));
  if (handle.kind === 'file') await webCopyFile(handle as FSFileHandle, destDir, name);
  else await webCopyDir(handle as FSDirHandle, destDir, name, destDir);
  return name;
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
        await handle.requestPermission({ mode: 'readwrite' });
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
    await dir.handle!.getDirectoryHandle(name, { create: true });
  },

  async touch(dir, name) {
    const fh = await dir.handle!.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.close();
  },

  async remove(dir, entry) {
    await dir.handle!.removeEntry(entry.name, { recursive: true });
  },

  async rename(dir, entry, newName) {
    if (!newName.trim() || newName === entry.name) return;
    const h = entry.handle as FSFileHandle;
    if (entry.kind === 'file' && typeof h.move === 'function') {
      try {
        await h.move(newName);
        return;
      } catch {
        /* fall through to copy+delete */
      }
    }
    if (entry.kind === 'file') await webCopyFile(h, dir.handle!, newName);
    else await webCopyDir(entry.handle as FSDirHandle, dir.handle!, newName, dir.handle!);
    await dir.handle!.removeEntry(entry.name, { recursive: true });
  },

  async transfer(srcDir, entry, destDir, mode) {
    const dest = destDir.handle!;
    const src = srcDir.handle!;
    // No-op if dropping into the same directory on a move.
    if (mode === 'move' && src.isSameEntry && (await src.isSameEntry(dest))) return;

    if (mode === 'move' && entry.kind === 'file' && typeof (entry.handle as FSFileHandle).move === 'function') {
      const name = await uniqueName(entry.name, (n) => webChildExists(dest, n));
      try {
        await (entry.handle as FSFileHandle).move!(dest, name);
        return;
      } catch {
        /* fall through to copy+delete */
      }
    }
    await webCopyHandle(entry.handle!, dest);
    if (mode === 'move') await src.removeEntry(entry.name, { recursive: true });
  },

  async importFiles(files, destDir) {
    const dest = destDir.handle!;
    let n = 0;
    for (const file of files) {
      const name = await uniqueName(file.name, (nm) => webChildExists(dest, nm));
      const fh = await dest.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      try {
        await w.write(file);
        n++;
      } finally {
        await w.close();
      }
    }
    return n;
  },

  async importDrop(dt, destDir) {
    const dest = destDir.handle!;
    const items = Array.from(dt.items ?? []);
    let n = 0;
    let usedHandles = false;
    for (const item of items) {
      const anyItem = item as unknown as { getAsFileSystemHandle?: () => Promise<FSHandle | null> };
      if (item.kind === 'file' && anyItem.getAsFileSystemHandle) {
        try {
          const h = await anyItem.getAsFileSystemHandle();
          if (h) {
            await webCopyHandle(h, dest);
            n++;
            usedHandles = true;
          }
        } catch {
          /* ignore this item */
        }
      }
    }
    if (!usedHandles && dt.files?.length) {
      n += await this.importFiles(Array.from(dt.files), destDir);
    }
    return n;
  },

  async resolveUrl(entry) {
    const file = await (entry.handle as FSFileHandle).getFile();
    const url = URL.createObjectURL(file);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  NATIVE — Capacitor Filesystem
// ═══════════════════════════════════════════════════════════════════════════════

function joinUri(dirUri: string, name: string): string {
  return `${dirUri.replace(/\/+$/, '')}/${name}`;
}

async function nativeExists(uri: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path: uri });
    return true;
  } catch {
    return false;
  }
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
      // On platforms where the permission model differs, assume usable.
      return true;
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
    const res = await Filesystem.readdir({ path: dir.uri! });
    return res.files.map((f) => ({
      name: f.name,
      kind: (f.type === 'directory' ? 'directory' : 'file') as EntryKind,
      size: f.size ?? 0,
      mtime: f.mtime ?? 0,
      ext: f.type === 'directory' ? '' : extOf(f.name),
      uri: f.uri,
    }));
  },

  enter(entry) {
    return { backend: 'native', name: entry.name, uri: entry.uri! };
  },

  async mkdir(dir, name) {
    await Filesystem.mkdir({ path: joinUri(dir.uri!, name), recursive: true });
  },

  async touch(dir, name) {
    await Filesystem.writeFile({ path: joinUri(dir.uri!, name), data: '' });
  },

  async remove(dir, entry) {
    void dir;
    if (entry.kind === 'directory') await Filesystem.rmdir({ path: entry.uri!, recursive: true });
    else await Filesystem.deleteFile({ path: entry.uri! });
  },

  async rename(dir, entry, newName) {
    if (!newName.trim() || newName === entry.name) return;
    await Filesystem.rename({ from: entry.uri!, to: joinUri(dir.uri!, newName) });
  },

  async transfer(srcDir, entry, destDir, mode) {
    void srcDir;
    const name = await uniqueName(entry.name, (n) => nativeExists(joinUri(destDir.uri!, n)));
    const to = joinUri(destDir.uri!, name);
    if (mode === 'move') await Filesystem.rename({ from: entry.uri!, to });
    else await Filesystem.copy({ from: entry.uri!, to });
  },

  async importFiles(files, destDir) {
    let n = 0;
    for (const file of files) {
      const name = await uniqueName(file.name, (nm) => nativeExists(joinUri(destDir.uri!, nm)));
      const data = base64FromBuffer(await file.arrayBuffer());
      await Filesystem.writeFile({ path: joinUri(destDir.uri!, name), data });
      n++;
    }
    return n;
  },

  async importDrop(dt, destDir) {
    if (dt.files?.length) return this.importFiles(Array.from(dt.files), destDir);
    return 0;
  },

  async resolveUrl(entry) {
    return { url: Capacitor.convertFileSrc(entry.uri!) };
  },
};

// ─── Selection ──────────────────────────────────────────────────────────────────

let cached: FsAdapter | null = null;

export function getAdapter(): FsAdapter {
  if (cached) return cached;
  cached = Capacitor.isNativePlatform() ? nativeAdapter : webAdapter;
  return cached;
}
