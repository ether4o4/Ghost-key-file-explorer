/**
 * Ghost Key — Explorer Store
 *
 * Drives a Windows-style desktop: draggable / minimizeable / resizable windows,
 * each hosting a dual-pane file explorer. All filesystem work goes through the
 * backend-agnostic adapter in core/fs.ts (web FSA or native Capacitor).
 */
import { create } from 'zustand';
import { getAdapter } from '../core/fs';
import type { DirEntry, DirRef, FsAdapter, RootShortcut } from '../core/fs';
import { extractToLimbo, repackage } from '../core/archive';
import { fitWindowBounds, sanitizeWindowPrefs } from '../core/windowLayout';

export type Side = 'left' | 'right';
export type ViewMode = 'list' | 'grid';
export type LayoutMode = 'single' | 'dual';
export type SortKey = 'name' | 'size' | 'mtime' | 'kind';
export type ToastKind = 'info' | 'success' | 'error';

export interface PaneState {
  stack: DirRef[]; // root → current; empty = nothing opened yet
  entries: DirEntry[];
  loading: boolean;
  error: string | null;
  selected: string[];
  view: ViewMode;
  sortKey: SortKey;
  sortAsc: boolean;
}

export interface WindowState {
  id: number;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  layout: LayoutMode;
  splitter: number; // left-pane fraction (0..1)
  panes: Record<Side, PaneState>;
  restore?: { x: number; y: number; w: number; h: number };
}

// Active internal drag payload (set on dragstart). Module-level for reliability —
// DataTransfer string access is restricted during dragover in some browsers.
interface DragPayload {
  winId: number;
  side: Side;
  name: string;
}
let dragPayload: DragPayload | null = null;
export const setDrag = (p: DragPayload | null) => {
  dragPayload = p;
};
export const getDrag = () => dragPayload;

function emptyPane(): PaneState {
  return {
    stack: [],
    entries: [],
    loading: false,
    error: null,
    selected: [],
    view: 'list',
    sortKey: 'name',
    sortAsc: true,
  };
}

async function sameDir(a: DirRef | undefined, b: DirRef | undefined): Promise<boolean> {
  if (!a || !b || a.backend !== b.backend) return false;
  if (a.backend === 'native') return !!a.uri && !!b.uri && (a.canonicalUri ?? a.uri).replace(/\/+$/, '') === (b.canonicalUri ?? b.uri).replace(/\/+$/, '');
  return a.handle === b.handle || !!(await a.handle?.isSameEntry?.(b.handle!));
}

// ── Per-folder customization (color + icon), persisted locally ──
// Metadata only lives in the browser/app — we never write marker files into the
// user's folders, and there's still no scanning/indexing.
export interface FolderPref {
  color?: string;
  icon?: string;
}

/** An active Limbo staging workspace produced by extracting an archive. */
export interface LimboWorkspace {
  id: string;
  archiveName: string;
  workspace: DirRef;
  entries: Array<{ path: string; size: number; isDir: boolean }>;
  totalBytes: number;
  fileCount: number;
  sourceWinId: number;
  sourceSide: Side;
}
const PREFS_KEY = 'gk:folderPrefs';
const LAYOUT_KEY = 'gk:layoutMode';
const WINDOW_KEY = 'gk:windowBounds';

interface WindowPrefs {
  x: number;
  y: number;
  w: number;
  h: number;
  maximized: boolean;
}

function loadLayoutMode(): LayoutMode {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'single' ? 'single' : 'dual';
  } catch {
    return 'dual';
  }
}

function saveLayoutMode(mode: LayoutMode): void {
  try {
    localStorage.setItem(LAYOUT_KEY, mode);
  } catch {
    /* storage unavailable / full — keep the in-memory preference */
  }
}

function loadWindowPrefs(): Partial<WindowPrefs> {
  try {
    const raw = localStorage.getItem(WINDOW_KEY);
    return raw ? sanitizeWindowPrefs(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function saveWindowPrefs(win: Pick<WindowState, 'x' | 'y' | 'w' | 'h' | 'maximized'>): void {
  try {
    localStorage.setItem(
      WINDOW_KEY,
      JSON.stringify({ x: win.x, y: win.y, w: win.w, h: win.h, maximized: win.maximized }),
    );
  } catch {
    /* storage unavailable / full — keep the in-memory window state */
  }
}

function loadPrefs(): Record<string, FolderPref> {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, FolderPref>) : {};
  } catch {
    return {};
  }
}

function savePrefs(prefs: Record<string, FolderPref>): boolean {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

/** Stable key for a folder: its native URI, or its name-path on the web. */
export function folderKey(stackNames: string[], name: string): string {
  return [...stackNames, name].join('/');
}

interface ExplorerStore {
  adapter: FsAdapter;
  roots: RootShortcut[];
  windows: WindowState[];
  zTop: number;
  nextId: number;
  toast: { msg: string; kind: ToastKind } | null;
  folderPrefs: Record<string, FolderPref>;
  limbo: LimboWorkspace | null;

  init: () => Promise<void>;
  notify: (msg: string, kind?: ToastKind) => void;

  // ── Folder customization ──
  setFolderPref: (key: string, pref: FolderPref) => void;
  resetFolderPref: (key: string) => void;

  // ── Window lifecycle ──
  newWindow: () => void;
  closeWindow: (id: number) => void;
  focusWindow: (id: number) => void;
  setBounds: (id: number, b: Partial<Pick<WindowState, 'x' | 'y' | 'w' | 'h'>>) => void;
  minimize: (id: number) => void;
  unminimize: (id: number) => void;
  toggleMax: (id: number) => void;
  toggleLayout: (id: number) => void;
  setLayout: (id: number, mode: LayoutMode) => void;
  setSplitter: (id: number, frac: number) => void;
  resetSplitter: (id: number) => void;

  // ── Pane navigation ──
  openPicker: (id: number, side: Side) => Promise<void>;
  openLocation: (id: number, side: Side, ref: DirRef) => Promise<void>;
  refresh: (id: number, side: Side) => Promise<void>;
  enterDir: (id: number, side: Side, entry: DirEntry) => Promise<void>;
  breadcrumbTo: (id: number, side: Side, index: number) => Promise<void>;
  goUp: (id: number, side: Side) => Promise<void>;

  // ── Pane view/selection ──
  setView: (id: number, side: Side, view: ViewMode) => void;
  setSort: (id: number, side: Side, key: SortKey) => void;
  setSelected: (id: number, side: Side, names: string[]) => void;

  // ── File operations ──
  newFolder: (id: number, side: Side) => Promise<void>;
  renameEntry: (id: number, side: Side, entry: DirEntry, newName: string) => Promise<void>;
  deleteSelected: (id: number, side: Side) => Promise<void>;
  openFile: (id: number, side: Side, entry: DirEntry) => Promise<void>;

  // ── Drag & drop ──
  internalDrop: (id: number, side: Side, destEntry: DirEntry | null, copy: boolean) => Promise<void>;
  externalDrop: (id: number, side: Side, dt: DataTransfer, destEntry?: DirEntry | null) => Promise<void>;

  // ── Limbo archive workflow ──
  limboOpen: (id: number, side: Side, entry: DirEntry) => Promise<void>;
  limboRepackagePlace: (id: number, side: Side, destEntry?: DirEntry | null) => Promise<void>;
  limboDiscard: () => Promise<void>;
}

export const useExplorer = create<ExplorerStore>((set, get) => {
  // ── internal helpers ──
  const patchWindow = (id: number, fn: (w: WindowState) => WindowState) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? fn(w) : w)) }));

  const patchPane = (id: number, side: Side, patch: Partial<PaneState>) =>
    patchWindow(id, (w) => ({
      ...w,
      panes: { ...w.panes, [side]: { ...w.panes[side], ...patch } },
    }));

  const getPane = (id: number, side: Side): PaneState | undefined =>
    get().windows.find((w) => w.id === id)?.panes[side];

  const currentDir = (id: number, side: Side): DirRef | undefined => {
    const p = getPane(id, side);
    return p && p.stack.length ? p.stack[p.stack.length - 1] : undefined;
  };

  const loads = new Map<string, number>();
  const loadInto = async (id: number, side: Side, stack: DirRef[]) => {
    const key = `${id}:${side}`;
    const generation = (loads.get(key) ?? 0) + 1;
    loads.set(key, generation);
    const dir = stack[stack.length - 1];
    patchPane(id, side, { loading: true, error: null, stack, selected: [] });
    try {
      const entries = await get().adapter.list(dir);
      if (loads.get(key) !== generation || getPane(id, side)?.stack !== stack) return;
      patchPane(id, side, { entries, loading: false });
    } catch (e) {
      if (loads.get(key) !== generation || getPane(id, side)?.stack !== stack) return;
      const msg = e instanceof Error ? e.message : 'Could not read folder';
      patchPane(id, side, { loading: false, error: msg, entries: [] });
      get().notify(msg, 'error');
    }
  };

  const refreshDirs = async (...dirs: DirRef[]) => {
    for (const win of get().windows) {
      for (const side of ['left', 'right'] as const) {
        const current = currentDir(win.id, side);
        for (const dir of dirs) {
          if (await sameDir(current, dir).catch(() => false)) {
            await get().refresh(win.id, side);
            break;
          }
        }
      }
    }
  };

  const carryFolderPrefs = (oldKey: string, newKey: string): boolean => {
    const prefs = get().folderPrefs;
    const next = { ...prefs };
    let changed = false;
    for (const [key, pref] of Object.entries(prefs)) {
      if (key !== oldKey && !key.startsWith(`${oldKey}/`)) continue;
      const destination = newKey + key.slice(oldKey.length);
      // Retain legacy keys and never overwrite existing destination metadata.
      // Existing formats stay readable; no user preference is discarded.
      if (!next[destination]) {
        next[destination] = { ...pref };
        changed = true;
      }
    }
    if (!changed) return true;
    const saved = savePrefs(next);
    set({ folderPrefs: next });
    return saved;
  };

  let limboBusy = false;
  const withLimbo = async (operation: () => Promise<void>): Promise<void> => {
    if (limboBusy) {
      get().notify('Wait for the current Limbo operation to finish.', 'info');
      return;
    }
    limboBusy = true;
    try { await operation(); }
    finally { limboBusy = false; }
  };

  return {
    adapter: getAdapter(),
    roots: [],
    windows: [],
    zTop: 1,
    nextId: 1,
    toast: null,
    folderPrefs: {},
    limbo: null,

    init: async () => {
      const adapter = getAdapter();
      set({ folderPrefs: loadPrefs() });
      const access = await adapter.ensureAccess().catch(() => false);
      const roots = await adapter.roots().catch(() => []);
      set({ adapter, roots });
      if (get().windows.length === 0) get().newWindow();
      if (adapter.backend === 'native' && !access) {
        get().notify('Storage permission is unavailable. Regrant access to an allowed location and retry.', 'error');
      }
    },

    notify: (msg, kind = 'info') => {
      set({ toast: { msg, kind } });
      window.setTimeout(() => {
        if (get().toast?.msg === msg) set({ toast: null });
      }, 3200);
    },

    setFolderPref: (key, pref) => {
      const current = get().folderPrefs[key] ?? {};
      const merged = { ...current, ...pref };
      // Drop empty values so a fully-cleared pref disappears.
      if (!merged.color) delete merged.color;
      if (!merged.icon) delete merged.icon;
      const next = { ...get().folderPrefs };
      if (Object.keys(merged).length === 0) delete next[key];
      else next[key] = merged;
      const saved = savePrefs(next);
      set({ folderPrefs: next });
      if (!saved) get().notify('Folder settings could not be saved; changes are in-memory only.', 'error');
    },

    resetFolderPref: (key) => {
      const next = { ...get().folderPrefs };
      delete next[key];
      const saved = savePrefs(next);
      set({ folderPrefs: next });
      if (!saved) get().notify('Folder settings could not be saved; changes are in-memory only.', 'error');
    },

    // ── Window lifecycle ──
    newWindow: () => {
      const { nextId, zTop, windows } = get();
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const w = Math.min(1100, Math.max(720, Math.round(vw * 0.78)));
      const h = Math.min(720, Math.max(440, Math.round(vh * 0.74)));
      const offset = (windows.length % 6) * 28;
      const saved = loadWindowPrefs();
      const bounds = fitWindowBounds({
        x: saved.x ?? Math.round((vw - w) / 2) + offset,
        y: saved.y ?? Math.round((vh - h) / 2) - 16 + offset,
        w: saved.w ?? w,
        h: saved.h ?? h,
      }, vw, vh - 48);
      const win: WindowState = {
        id: nextId,
        title: 'Ghost Explorer',
        ...bounds,
        z: zTop + 1,
        minimized: false,
        maximized: saved.maximized ?? vw < 760, // phones: start maximized
        layout: loadLayoutMode(),
        splitter: 0.5,
        panes: { left: emptyPane(), right: emptyPane() },
      };
      set({ windows: [...windows, win], nextId: nextId + 1, zTop: zTop + 1 });
    },

    closeWindow: (id) => {
      loads.delete(`${id}:left`);
      loads.delete(`${id}:right`);
      set((s) => ({ windows: s.windows.filter((w) => w.id !== id) }));
    },

    focusWindow: (id) => {
      const zTop = get().zTop + 1;
      set({ zTop });
      patchWindow(id, (w) => ({ ...w, z: zTop }));
    },

    setBounds: (id, b) => {
      patchWindow(id, (w) => {
        const next = { ...w, ...b };
        saveWindowPrefs(next);
        return next;
      });
    },

    minimize: (id) => patchWindow(id, (w) => ({ ...w, minimized: true })),

    unminimize: (id) => {
      get().focusWindow(id);
      patchWindow(id, (w) => ({ ...w, minimized: false }));
    },

    toggleMax: (id) =>
      patchWindow(id, (w) => {
        if (w.maximized) {
          const r = w.restore ?? { x: w.x, y: w.y, w: w.w, h: w.h };
          const next = { ...w, maximized: false, ...r, restore: undefined };
          saveWindowPrefs(next);
          return next;
        }
        const next = { ...w, maximized: true, restore: { x: w.x, y: w.y, w: w.w, h: w.h } };
        saveWindowPrefs(next);
        return next;
      }),

    toggleLayout: (id) => {
      const current = get().windows.find((w) => w.id === id)?.layout ?? 'dual';
      const layout: LayoutMode = current === 'dual' ? 'single' : 'dual';
      saveLayoutMode(layout);
      patchWindow(id, (w) => ({ ...w, layout }));
    },

    setLayout: (id, layout) => {
      saveLayoutMode(layout);
      patchWindow(id, (w) => ({ ...w, layout }));
    },

    setSplitter: (id, frac) =>
      patchWindow(id, (w) => ({ ...w, splitter: Math.min(0.85, Math.max(0.15, frac)) })),

    resetSplitter: (id) => patchWindow(id, (w) => ({ ...w, splitter: 0.5 })),

    // ── Navigation ──
    openPicker: async (id, side) => {
      const adapter = get().adapter;
      if (!adapter.canPick) {
        get().notify('Pick a location from the list', 'info');
        return;
      }
      try {
        const ref = await adapter.pickRoot();
        if (ref) await loadInto(id, side, [ref]);
      } catch (e) {
        get().notify(e instanceof Error ? e.message : 'Could not open folder', 'error');
      }
    },

    openLocation: async (id, side, ref) => {
      await loadInto(id, side, [ref]);
    },

    refresh: async (id, side) => {
      const p = getPane(id, side);
      if (!p || p.stack.length === 0) return;
      await loadInto(id, side, p.stack);
    },

    enterDir: async (id, side, entry) => {
      if (entry.kind !== 'directory') return;
      const p = getPane(id, side);
      if (!p) return;
      const ref = get().adapter.enter(entry);
      await loadInto(id, side, [...p.stack, ref]);
    },

    breadcrumbTo: async (id, side, index) => {
      const p = getPane(id, side);
      if (!p || index < 0 || index >= p.stack.length) return;
      await loadInto(id, side, p.stack.slice(0, index + 1));
    },

    goUp: async (id, side) => {
      const p = getPane(id, side);
      if (!p || p.stack.length <= 1) return;
      await loadInto(id, side, p.stack.slice(0, -1));
    },

    // ── View / selection ──
    setView: (id, side, view) => patchPane(id, side, { view }),

    setSort: (id, side, key) => {
      const p = getPane(id, side);
      if (!p) return;
      const sortAsc = p.sortKey === key ? !p.sortAsc : true;
      patchPane(id, side, { sortKey: key, sortAsc });
    },

    setSelected: (id, side, names) => patchPane(id, side, { selected: names }),

    // ── File ops ──
    newFolder: async (id, side) => {
      const dir = currentDir(id, side);
      if (!dir) return;
      const name = window.prompt('New folder name', 'New folder');
      if (!name || !name.trim()) return;
      try {
        await get().adapter.mkdir(dir, name.trim());
        await refreshDirs(dir);
        get().notify(`Created "${name.trim()}"`, 'success');
      } catch (e) {
        await refreshDirs(dir);
        get().notify(e instanceof Error ? e.message : 'Could not create folder', 'error');
      }
    },

    renameEntry: async (id, side, entry, newName) => {
      const dir = currentDir(id, side);
      const pane = getPane(id, side);
      if (!dir || !newName.trim() || newName.trim() === entry.name) return;
      try {
        await get().adapter.rename(dir, entry, newName.trim());
        let prefsSaved = true;
        if (entry.kind === 'directory' && pane) {
          const oldKey = entry.uri ?? folderKey(pane.stack.map(ref => ref.name), entry.name);
          const newKey = entry.uri
            ? entry.uri.slice(0, entry.uri.lastIndexOf('/') + 1) + (entry.uri.startsWith('file://') ? encodeURIComponent(newName.trim()) : newName.trim())
            : folderKey(pane.stack.map(ref => ref.name), newName.trim());
          prefsSaved = carryFolderPrefs(oldKey, newKey);
        }
        await refreshDirs(dir);
        if (prefsSaved) get().notify('Renamed', 'success');
        else get().notify('Renamed, but folder settings could not be saved; changes are in-memory only.', 'error');
      } catch (e) {
        await refreshDirs(dir);
        get().notify(e instanceof Error ? e.message : 'Rename failed', 'error');
      }
    },

    deleteSelected: async (id, side) => {
      const dir = currentDir(id, side);
      const p = getPane(id, side);
      if (!dir || !p || p.selected.length === 0) return;
      const targets = p.entries.filter((e) => p.selected.includes(e.name));
      if (targets.length === 0) return;
      const label = targets.length === 1 ? `"${targets[0].name}"` : `${targets.length} items`;
      if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
      try {
        for (const entry of targets) await get().adapter.remove(dir, entry);
        await refreshDirs(dir);
        get().notify(`Deleted ${label}`, 'success');
      } catch (e) {
        await refreshDirs(dir);
        get().notify(e instanceof Error ? e.message : 'Delete failed', 'error');
      }
    },

    openFile: async (_id, _side, entry) => {
      if (entry.kind !== 'file') return;
      try {
        const { url, revoke } = await get().adapter.resolveUrl(entry);
        const win = window.open(url, '_blank');
        if (!win) {
          // Popup blocked — force a download instead.
          const a = document.createElement('a');
          a.href = url;
          a.download = entry.name;
          a.click();
        }
        if (revoke) window.setTimeout(revoke, 60_000);
      } catch (e) {
        get().notify(e instanceof Error ? e.message : 'Could not open file', 'error');
      }
    },

    // ── Drag & drop ──
    internalDrop: async (id, side, destEntry, copy) => {
      const payload = getDrag();
      setDrag(null);
      if (!payload) return;

      const srcDir = currentDir(payload.winId, payload.side);
      const srcPane = getPane(payload.winId, payload.side);
      if (!srcDir || !srcPane) return;
      const entry = srcPane.entries.find((e) => e.name === payload.name);
      if (!entry) return;

      // Dropping a folder onto itself is meaningless.
      const destDir =
        destEntry && destEntry.kind === 'directory'
          ? get().adapter.enter(destEntry)
          : currentDir(id, side);
      if (!destDir) {
        get().notify('Open a folder in the target pane first', 'info');
        return;
      }

      const mode = copy ? 'copy' : 'move';
      try {
        if (!copy && await sameDir(srcDir, destDir)) return;
        // Ancestry and source identity are checked by the adapter before any write.
        await get().adapter.transfer(srcDir, entry, destDir, mode);
        await refreshDirs(srcDir, destDir);
        get().notify(`${copy ? 'Copied' : 'Moved'} "${entry.name}"`, 'success');
      } catch (e) {
        await refreshDirs(srcDir, destDir);
        get().notify(e instanceof Error ? e.message : 'Transfer failed', 'error');
      }
    },

    externalDrop: async (id, side, dt, destEntry) => {
      const dir = destEntry?.kind === 'directory' ? get().adapter.enter(destEntry) : currentDir(id, side);
      if (!dir) return;
      try {
        const n = await get().adapter.importDrop(dt, dir);
        if (n > 0) {
          await refreshDirs(dir);
          get().notify(`Imported ${n} item${n === 1 ? '' : 's'}`, 'success');
        }
      } catch (e) {
        await refreshDirs(dir);
        get().notify(e instanceof Error ? e.message : 'Import failed', 'error');
      }
    },

    // ── Limbo archive workflow ──
    limboOpen: (id, side, entry) => withLimbo(async () => {
      if (entry.kind !== 'file' || entry.ext.toLowerCase() !== 'zip') {
        get().notify('Limbo inspection is for .zip archives', 'info');
        return;
      }
      // A failed replacement must leave the current workspace available.
      const prev = get().limbo;
      get().notify(`Extracting "${entry.name}" into Limbo…`, 'info');
      try {
        const res = await extractToLimbo(get().adapter, entry);
        set({
          limbo: {
            id: res.workspaceId,
            archiveName: entry.name,
            workspace: res.workspace,
            entries: res.entries,
            totalBytes: res.totalBytes,
            fileCount: res.fileCount,
            sourceWinId: id,
            sourceSide: side,
          },
        });
        if (prev) {
          try { await get().adapter.removeDir(prev.workspace); }
          catch {
            get().notify('New Limbo workspace is ready; previous cache cleanup failed.', 'error');
            return;
          }
        }
        get().notify(
          `Limbo ready: ${res.fileCount} file(s), ${(res.totalBytes / 1048576).toFixed(1)} MiB staged`,
          'success',
        );
      } catch (e) {
        get().notify(e instanceof Error ? e.message : 'Limbo extraction failed', 'error');
      }
    }),

    limboRepackagePlace: (id, side, destEntry) => withLimbo(async () => {
      const ws = get().limbo;
      if (!ws) {
        get().notify('No Limbo workspace is open', 'info');
        return;
      }
      const dir = destEntry?.kind === 'directory' ? get().adapter.enter(destEntry) : currentDir(id, side);
      if (!dir) {
        get().notify('Open a destination folder in this pane first', 'info');
        return;
      }
      const archiveName =
        window.prompt('Save repackaged archive as', ws.archiveName) ?? '';
      if (!archiveName.trim()) return;
      try {
        // Read every staged file back from the isolated workspace.
        const files: Record<string, Uint8Array> = Object.create(null);
        const found = new Set<string>();
        const walk = async (sub: DirRef, relBase: string) => {
          const listed = await get().adapter.list(sub);
          for (const e of listed) {
            const rel = relBase ? `${relBase}/${e.name}` : e.name;
            found.add(rel);
            if (e.kind === 'directory') {
              files[`${rel}/`] = new Uint8Array();
              await walk(get().adapter.enter(e), rel);
            }
            else files[rel] = await get().adapter.readBytes(e);
          }
        };
        await walk(ws.workspace, '');
        if (ws.entries.some((entry) => !found.has(entry.path.replace(/\/+$/, '')))) {
          throw new Error('Staged archive contents are missing. Reopen the original archive before placing it.');
        }

        const result = repackage(files);
        if (!result.verified) throw new Error('Verification failed');

        // Only now, after a verified rebuild, write into the chosen destination.
        const finalName = archiveName.trim().toLowerCase().endsWith('.zip')
          ? archiveName.trim()
          : `${archiveName.trim()}.zip`;
        if (/[/\\\0]/.test(finalName)) throw new Error('Use an archive filename without path separators.');
        await get().adapter.writeBytes(dir, finalName, result.bytes);
        await refreshDirs(dir);
        get().notify(
          `Placed "${finalName}" (${result.entryCount} entries, checksum ${result.checksum.slice(0, 8)})`,
          'success',
        );
      } catch (e) {
        await refreshDirs(dir);
        get().notify(
          e instanceof Error ? e.message : 'Repackage & Place failed — archive not placed',
          'error',
        );
      }
    }),

    limboDiscard: () => withLimbo(async () => {
      const ws = get().limbo;
      if (!ws) return;
      try {
        await get().adapter.removeDir(ws.workspace);
        set({ limbo: null });
        get().notify('Limbo workspace discarded', 'info');
      } catch (error) {
        get().notify(error instanceof Error ? error.message : 'Could not discard Limbo workspace', 'error');
      }
    }),
  };
});
