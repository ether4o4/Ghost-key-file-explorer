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

export type Side = 'left' | 'right';
export type ViewMode = 'list' | 'grid';
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

function sameDir(a: DirRef | undefined, b: DirRef | undefined): boolean {
  if (!a || !b) return false;
  if (a.backend === 'native') return a.uri === b.uri;
  return a.handle === b.handle;
}

// ── Per-folder customization (color + icon), persisted locally ──
// Metadata only lives in the browser/app — we never write marker files into the
// user's folders, and there's still no scanning/indexing.
export interface FolderPref {
  color?: string;
  icon?: string;
}
const PREFS_KEY = 'gk:folderPrefs';

function loadPrefs(): Record<string, FolderPref> {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, FolderPref>) : {};
  } catch {
    return {};
  }
}

function savePrefs(prefs: Record<string, FolderPref>): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable / full — keep in-memory only */
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
  setSplitter: (id: number, frac: number) => void;

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
  externalDrop: (id: number, side: Side, dt: DataTransfer) => Promise<void>;
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

  const loadInto = async (id: number, side: Side, stack: DirRef[]) => {
    const dir = stack[stack.length - 1];
    patchPane(id, side, { loading: true, error: null, stack, selected: [] });
    try {
      const entries = await get().adapter.list(dir);
      patchPane(id, side, { entries, loading: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not read folder';
      patchPane(id, side, { loading: false, error: msg, entries: [] });
      get().notify(msg, 'error');
    }
  };

  return {
    adapter: getAdapter(),
    roots: [],
    windows: [],
    zTop: 1,
    nextId: 1,
    toast: null,
    folderPrefs: {},

    init: async () => {
      const adapter = getAdapter();
      set({ folderPrefs: loadPrefs() });
      await adapter.ensureAccess().catch(() => false);
      const roots = await adapter.roots().catch(() => []);
      set({ adapter, roots });
      if (get().windows.length === 0) get().newWindow();
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
      savePrefs(next);
      set({ folderPrefs: next });
    },

    resetFolderPref: (key) => {
      const next = { ...get().folderPrefs };
      delete next[key];
      savePrefs(next);
      set({ folderPrefs: next });
    },

    // ── Window lifecycle ──
    newWindow: () => {
      const { nextId, zTop, windows } = get();
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const w = Math.min(1100, Math.max(720, Math.round(vw * 0.78)));
      const h = Math.min(720, Math.max(440, Math.round(vh * 0.74)));
      const offset = (windows.length % 6) * 28;
      const win: WindowState = {
        id: nextId,
        title: 'Ghost Explorer',
        x: Math.max(12, Math.round((vw - w) / 2) + offset),
        y: Math.max(12, Math.round((vh - h) / 2) - 16 + offset),
        w,
        h,
        z: zTop + 1,
        minimized: false,
        maximized: vw < 760, // phones: start maximized
        splitter: 0.5,
        panes: { left: emptyPane(), right: emptyPane() },
      };
      set({ windows: [...windows, win], nextId: nextId + 1, zTop: zTop + 1 });
    },

    closeWindow: (id) => set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),

    focusWindow: (id) => {
      const zTop = get().zTop + 1;
      set({ zTop });
      patchWindow(id, (w) => ({ ...w, z: zTop }));
    },

    setBounds: (id, b) => patchWindow(id, (w) => ({ ...w, ...b })),

    minimize: (id) => patchWindow(id, (w) => ({ ...w, minimized: true })),

    unminimize: (id) => {
      get().focusWindow(id);
      patchWindow(id, (w) => ({ ...w, minimized: false }));
    },

    toggleMax: (id) =>
      patchWindow(id, (w) => {
        if (w.maximized) {
          const r = w.restore ?? { x: w.x, y: w.y, w: w.w, h: w.h };
          return { ...w, maximized: false, ...r, restore: undefined };
        }
        return { ...w, maximized: true, restore: { x: w.x, y: w.y, w: w.w, h: w.h } };
      }),

    setSplitter: (id, frac) =>
      patchWindow(id, (w) => ({ ...w, splitter: Math.min(0.85, Math.max(0.15, frac)) })),

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
        await get().refresh(id, side);
        get().notify(`Created "${name.trim()}"`, 'success');
      } catch (e) {
        get().notify(e instanceof Error ? e.message : 'Could not create folder', 'error');
      }
    },

    renameEntry: async (id, side, entry, newName) => {
      const dir = currentDir(id, side);
      if (!dir || !newName.trim() || newName === entry.name) return;
      try {
        await get().adapter.rename(dir, entry, newName.trim());
        await get().refresh(id, side);
        get().notify('Renamed', 'success');
      } catch (e) {
        get().notify(e instanceof Error ? e.message : 'Rename failed', 'error');
      }
    },

    deleteSelected: async (id, side) => {
      const dir = currentDir(id, side);
      const p = getPane(id, side);
      if (!dir || !p || p.selected.length === 0) return;
      const targets = p.entries.filter((e) => p.selected.includes(e.name));
      const label = targets.length === 1 ? `"${targets[0].name}"` : `${targets.length} items`;
      if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
      try {
        for (const entry of targets) await get().adapter.remove(dir, entry);
        await get().refresh(id, side);
        get().notify(`Deleted ${label}`, 'success');
      } catch (e) {
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

      const droppingOnSelf =
        destEntry && destEntry.name === entry.name && sameDir(srcDir, currentDir(id, side));
      if (droppingOnSelf) return;
      if (!copy && !destEntry && sameDir(srcDir, destDir)) return; // move into same dir

      // Block moving/copying a folder into itself or one of its descendants.
      if (entry.kind === 'directory') {
        let intoSelf = false;
        if (entry.uri && destDir.uri) {
          intoSelf = destDir.uri === entry.uri || destDir.uri.startsWith(`${entry.uri}/`);
        } else if (entry.handle && destDir.handle && entry.handle.isSameEntry) {
          intoSelf = await entry.handle.isSameEntry(destDir.handle);
        }
        if (intoSelf) {
          get().notify('Cannot move a folder into itself', 'error');
          return;
        }
      }

      const mode = copy ? 'copy' : 'move';
      try {
        await get().adapter.transfer(srcDir, entry, destDir, mode);
        get().notify(`${copy ? 'Copied' : 'Moved'} "${entry.name}"`, 'success');
        await get().refresh(id, side);
        if (payload.winId !== id || payload.side !== side) {
          await get().refresh(payload.winId, payload.side);
        } else {
          await get().refresh(id, side);
        }
      } catch (e) {
        get().notify(e instanceof Error ? e.message : 'Transfer failed', 'error');
      }
    },

    externalDrop: async (id, side, dt) => {
      const dir = currentDir(id, side);
      if (!dir) return;
      try {
        const n = await get().adapter.importDrop(dt, dir);
        if (n > 0) {
          await get().refresh(id, side);
          get().notify(`Imported ${n} item${n === 1 ? '' : 's'}`, 'success');
        }
      } catch (e) {
        get().notify(e instanceof Error ? e.message : 'Import failed', 'error');
      }
    },
  };
});
