/**
 * Ghost Key — Zustand Store
 * Central state management connecting all core engine modules.
 */
import { create } from 'zustand';
import { db } from '../core/db';
import type {
  GKFile, GKBundle, GKVault, GKLimboSession, GKWidget, GKTimelineEvent,
  GKTag, GKSKUCluster, AnalysisResult, SearchFilters,
} from '../core/db';
import { generateSKU, linkSKUs, autoMagnetize } from '../core/sku';
import { autoTag } from '../core/tagger';
import { recordEvent, getTimeline } from '../core/timeline';
import { createVault, lockVault, unlockVault, addFilesToVault, getAllVaults } from '../core/vault';
import { openLimboSession, analyzeLimboSession, releaseLimboSession, getAllLimboSessions } from '../core/limbo';
import { analyzeFile } from '../core/analyzer';

// ─── UI State Types ───────────────────────────────────────────────────────────

export type ActivePanel = 'files' | 'timeline' | 'analysis' | 'vault' | 'limbo' | 'homescreen';
export type ViewMode = 'grid' | 'list';
export type LeftPaneSection = 'all' | 'sources' | 'bundles' | 'vaults' | 'limbo' | 'clusters';

// ─── Store Interface ──────────────────────────────────────────────────────────

interface GKStore {
  // ── Data ──
  files: GKFile[];
  bundles: GKBundle[];
  vaults: GKVault[];
  limboSessions: GKLimboSession[];
  widgets: GKWidget[];
  timeline: GKTimelineEvent[];
  clusters: GKSKUCluster[];

  // ── UI State ──
  activePanel: ActivePanel;
  leftSection: LeftPaneSection;
  selectedFileIds: number[];
  viewMode: ViewMode;
  searchQuery: string;
  searchFilters: SearchFilters;
  searchResults: GKFile[];
  isSearching: boolean;
  activeVaultId: number | null;
  activeLimboId: number | null;
  activeBundleId: number | null;
  activeSKU: string | null;
  showVaultModal: boolean;
  showLimboModal: boolean;
  showAnalysisPanel: boolean;
  isDragging: boolean;
  notification: { message: string; type: 'info' | 'success' | 'error' | 'warn' } | null;

  // ── Actions: Data Loading ──
  loadAll: () => Promise<void>;
  loadFiles: () => Promise<void>;
  loadBundles: () => Promise<void>;
  loadVaults: () => Promise<void>;
  loadLimbo: () => Promise<void>;
  loadTimeline: () => Promise<void>;
  loadWidgets: () => Promise<void>;
  loadClusters: () => Promise<void>;

  // ── Actions: Files ──
  importFile: (file: File, source?: string) => Promise<GKFile>;
  importFiles: (files: FileList | File[], source?: string) => Promise<void>;
  updateFileTags: (fileId: number, tags: GKTag[]) => Promise<void>;
  deleteFile: (fileId: number) => Promise<void>;
  pinFile: (fileId: number, pinned: boolean) => Promise<void>;
  flagFile: (fileId: number, flagged: boolean) => Promise<void>;
  openFile: (fileId: number) => Promise<void>;

  // ── Actions: Bundles ──
  createBundle: (name: string, fileIds: number[]) => Promise<GKBundle>;
  addToBundle: (bundleId: number, fileIds: number[]) => Promise<void>;
  pinBundle: (bundleId: number, pinned: boolean) => Promise<void>;
  deleteBundle: (bundleId: number) => Promise<void>;

  // ── Actions: Vault ──
  createVaultAction: (name: string, type: import('../core/db').VaultType, password: string) => Promise<void>;
  lockVaultAction: (vaultId: number) => Promise<void>;
  unlockVaultAction: (vaultId: number, password: string) => Promise<boolean>;
  addFilesToVaultAction: (vaultId: number, fileIds: number[], password: string) => Promise<boolean>;

  // ── Actions: Limbo ──
  openLimbo: (name: string, fileIds: number[]) => Promise<void>;
  analyzeLimbo: (sessionId: number) => Promise<void>;
  releaseLimbo: (sessionId: number) => Promise<void>;

  // ── Actions: SKU ──
  linkSKUsAction: (skuA: string, skuB: string) => Promise<void>;
  magnetizeFile: (fileId: number) => Promise<void>;

  // ── Actions: Analysis ──
  analyzeFileAction: (fileId: number) => Promise<AnalysisResult | null>;

  // ── Actions: Widgets ──
  pinWidget: (widget: Omit<GKWidget, 'id' | 'createdAt'>) => Promise<void>;
  removeWidget: (widgetId: number) => Promise<void>;
  updateWidgetPosition: (widgetId: number, position: { x: number; y: number }) => Promise<void>;

  // ── Actions: Search ──
  setSearch: (query: string, filters?: SearchFilters) => void;
  performSearch: () => Promise<void>;
  clearSearch: () => void;

  // ── Actions: UI ──
  setActivePanel: (panel: ActivePanel) => void;
  setLeftSection: (section: LeftPaneSection) => void;
  toggleFileSelection: (fileId: number) => void;
  selectAllFiles: () => void;
  clearSelection: () => void;
  setViewMode: (mode: ViewMode) => void;
  setActiveVault: (id: number | null) => void;
  setActiveLimbo: (id: number | null) => void;
  setActiveBundle: (id: number | null) => void;
  setActiveSKU: (sku: string | null) => void;
  setShowVaultModal: (show: boolean) => void;
  setShowLimboModal: (show: boolean) => void;
  setShowAnalysisPanel: (show: boolean) => void;
  setIsDragging: (d: boolean) => void;
  notify: (message: string, type?: 'info' | 'success' | 'error' | 'warn') => void;
  clearNotification: () => void;
}

// ─── Store Implementation ─────────────────────────────────────────────────────

export const useGKStore = create<GKStore>((set, get) => ({
  // Initial state
  files: [],
  bundles: [],
  vaults: [],
  limboSessions: [],
  widgets: [],
  timeline: [],
  clusters: [],
  activePanel: 'homescreen',
  leftSection: 'all',
  selectedFileIds: [],
  viewMode: 'grid',
  searchQuery: '',
  searchFilters: {},
  searchResults: [],
  isSearching: false,
  activeVaultId: null,
  activeLimboId: null,
  activeBundleId: null,
  activeSKU: null,
  showVaultModal: false,
  showLimboModal: false,
  showAnalysisPanel: false,
  isDragging: false,
  notification: null,

  // ── Load all data ──
  loadAll: async () => {
    // Load each independently so one failure doesn't block others
    await Promise.allSettled([
      get().loadFiles(),
      get().loadBundles(),
      get().loadVaults(),
      get().loadLimbo(),
      get().loadTimeline(),
      get().loadWidgets(),
      get().loadClusters(),
    ]);
  },

  loadFiles: async () => {
    const files = await db.files.orderBy('importedAt').reverse().toArray();
    set({ files });
  },

  loadBundles: async () => {
    const bundles = await db.bundles.orderBy('createdAt').reverse().toArray();
    set({ bundles });
  },

  loadVaults: async () => {
    const vaults = await getAllVaults();
    set({ vaults });
  },

  loadLimbo: async () => {
    const limboSessions = await getAllLimboSessions();
    set({ limboSessions });
  },

  loadTimeline: async () => {
    const timeline = await getTimeline({ limit: 200 });
    set({ timeline });
  },

  loadWidgets: async () => {
    const widgets = await db.widgets.orderBy('createdAt').toArray();
    set({ widgets });
  },

  loadClusters: async () => {
    const clusters = await db.skuClusters.orderBy('createdAt').reverse().toArray();
    set({ clusters });
  },

  // ── File Actions ──
  importFile: async (file: File, source = 'Manual Import') => {
    const ext = file.name.split('.').pop() ?? '';
    const sku = generateSKU();

    // Read content for text files
    let content: string | undefined;
    let dataUrl: string | undefined;

    if (file.type.startsWith('text/') || ['json', 'csv', 'log', 'md', 'xml'].includes(ext)) {
      content = await file.text().catch(() => undefined);
    }
    if (file.type.startsWith('image/') && file.size < 5_000_000) {
      dataUrl = await new Promise<string>(res => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.readAsDataURL(file);
      });
    }

    const tags = autoTag({
      name: file.name,
      ext,
      mimeType: file.type,
      source,
      createdAt: file.lastModified || Date.now(),
      content,
    });

    const gkFile: GKFile = {
      sku,
      name: file.name,
      ext,
      size: file.size,
      mimeType: file.type,
      tags,
      skuLinks: [],
      bundleIds: [],
      source,
      content,
      dataUrl,
      createdAt: file.lastModified || Date.now(),
      modifiedAt: file.lastModified || Date.now(),
      importedAt: Date.now(),
      isFlagged: false,
      isPinned: false,
    };

    const id = await db.files.add(gkFile);
    const created = { ...gkFile, id: id as number };

    await recordEvent('file_imported', `"${file.name}" imported from ${source}`, {
      fileId: id as number,
      fileSku: sku,
    });

    // Auto-magnetize in background
    autoMagnetize(id as number).catch(() => {});

    await get().loadFiles();
    await get().loadTimeline();
    return created;
  },

  importFiles: async (files, source = 'Manual Import') => {
    const arr = files instanceof FileList ? Array.from(files) : files;
    for (const f of arr) {
      await get().importFile(f, source);
    }
  },

  updateFileTags: async (fileId, tags) => {
    await db.files.update(fileId, { tags });
    await recordEvent('file_tagged', `Tags updated`, { fileId });
    await get().loadFiles();
    await get().loadTimeline();
  },

  deleteFile: async (fileId) => {
    await db.files.delete(fileId);
    await get().loadFiles();
    get().notify('File removed', 'info');
  },

  pinFile: async (fileId, pinned) => {
    await db.files.update(fileId, { isPinned: pinned });
    await get().loadFiles();
  },

  flagFile: async (fileId, flagged) => {
    await db.files.update(fileId, { isFlagged: flagged });
    await get().loadFiles();
  },

  openFile: async (fileId) => {
    const file = await db.files.get(fileId);
    if (!file) return;
    await db.files.update(fileId, { lastOpenedAt: Date.now() });
    await recordEvent('file_opened', `"${file.name}" opened`, { fileId, fileSku: file.sku });
    await get().loadTimeline();
  },

  // ── Bundle Actions ──
  createBundle: async (name, fileIds) => {
    const bundle: GKBundle = {
      name,
      fileIds,
      skus: [],
      tags: [],
      color: '#6c63ff',
      isPinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const id = await db.bundles.add(bundle);
    await db.files.bulkUpdate(fileIds.map(fid => ({
      key: fid,
      changes: { bundleIds: [] }, // will be updated below
    })));
    // Update each file's bundleIds
    for (const fid of fileIds) {
      const f = await db.files.get(fid);
      if (f) await db.files.update(fid, { bundleIds: [...(f.bundleIds ?? []), id as number] });
    }
    const created = { ...bundle, id: id as number };
    await recordEvent('bundle_created', `Bundle "${name}" created with ${fileIds.length} file(s)`, {
      bundleId: id as number,
    });
    await get().loadBundles();
    await get().loadTimeline();
    get().notify(`Bundle "${name}" created`, 'success');
    return created;
  },

  addToBundle: async (bundleId, fileIds) => {
    const bundle = await db.bundles.get(bundleId);
    if (!bundle) return;
    const updated = Array.from(new Set([...bundle.fileIds, ...fileIds]));
    await db.bundles.update(bundleId, { fileIds: updated, updatedAt: Date.now() });
    for (const fid of fileIds) {
      const f = await db.files.get(fid);
      if (f) await db.files.update(fid, { bundleIds: Array.from(new Set([...f.bundleIds, bundleId])) });
    }
    await get().loadBundles();
    await get().loadFiles();
  },

  pinBundle: async (bundleId, pinned) => {
    await db.bundles.update(bundleId, { isPinned: pinned });
    if (pinned) {
      await recordEvent('widget_pinned', `Bundle pinned to homescreen`, { bundleId });
    }
    await get().loadBundles();
    await get().loadTimeline();
    get().notify(pinned ? 'Pinned to homescreen' : 'Unpinned', 'info');
  },

  deleteBundle: async (bundleId) => {
    await db.bundles.delete(bundleId);
    await get().loadBundles();
  },

  // ── Vault Actions ──
  createVaultAction: async (name, type, password) => {
    await createVault(name, type, password);
    await get().loadVaults();
    await get().loadTimeline();
    get().notify(`Vault "${name}" created`, 'success');
  },

  lockVaultAction: async (vaultId) => {
    await lockVault(vaultId);
    await get().loadVaults();
    get().notify('Vault locked', 'info');
  },

  unlockVaultAction: async (vaultId, password) => {
    const ok = await unlockVault(vaultId, password);
    if (ok) {
      await get().loadVaults();
      get().notify('Vault unlocked', 'success');
    } else {
      get().notify('Incorrect password', 'error');
    }
    return ok;
  },

  addFilesToVaultAction: async (vaultId, fileIds, password) => {
    const ok = await addFilesToVault(vaultId, fileIds, password);
    if (ok) {
      await get().loadVaults();
      await get().loadFiles();
      get().notify('Files added to vault', 'success');
    }
    return ok;
  },

  // ── Limbo Actions ──
  openLimbo: async (name, fileIds) => {
    await openLimboSession(name, fileIds);
    await get().loadLimbo();
    await get().loadFiles();
    await get().loadTimeline();
    get().notify(`Limbo session "${name}" opened`, 'info');
  },

  analyzeLimbo: async (sessionId) => {
    await analyzeLimboSession(sessionId);
    await get().loadLimbo();
    get().notify('Limbo analysis complete', 'success');
  },

  releaseLimbo: async (sessionId) => {
    await releaseLimboSession(sessionId);
    await get().loadLimbo();
    await get().loadFiles();
    await get().loadTimeline();
    get().notify('Files released from Limbo', 'success');
  },

  // ── SKU Actions ──
  linkSKUsAction: async (skuA, skuB) => {
    await linkSKUs(skuA, skuB);
    await recordEvent('sku_linked', `SKU ${skuA} linked to ${skuB}`);
    await get().loadClusters();
    await get().loadFiles();
    await get().loadTimeline();
    get().notify(`SKUs linked`, 'success');
  },

  magnetizeFile: async (fileId) => {
    const linked = await autoMagnetize(fileId);
    await get().loadClusters();
    await get().loadFiles();
    if (linked.length > 0) {
      get().notify(`Magnetized: linked to ${linked.length} file(s)`, 'success');
    }
  },

  // ── Analysis ──
  analyzeFileAction: async (fileId) => {
    const file = await db.files.get(fileId);
    if (!file) return null;
    const result = await analyzeFile(file);
    await db.files.update(fileId, { analysisResult: result });
    await recordEvent('file_analyzed', `"${file.name}" analyzed — risk ${result.riskScore.toFixed(1)}/10`, {
      fileId,
      fileSku: file.sku,
    });
    await get().loadFiles();
    await get().loadTimeline();
    get().notify('Analysis complete', 'success');
    return result;
  },

  // ── Widget Actions ──
  pinWidget: async (widget) => {
    const id = await db.widgets.add({ ...widget, createdAt: Date.now() });
    await get().loadWidgets();
    await recordEvent('widget_pinned', `Widget "${widget.label}" pinned`, {
      metadata: { widgetId: id },
    });
    await get().loadTimeline();
    get().notify(`"${widget.label}" pinned to homescreen`, 'success');
  },

  removeWidget: async (widgetId) => {
    await db.widgets.delete(widgetId);
    await get().loadWidgets();
  },

  updateWidgetPosition: async (widgetId, position) => {
    await db.widgets.update(widgetId, { position });
    await get().loadWidgets();
  },

  // ── Search ──
  setSearch: (query, filters) => {
    set({ searchQuery: query, searchFilters: filters ?? get().searchFilters });
  },

  performSearch: async () => {
    const { searchQuery, searchFilters } = get();
    if (!searchQuery.trim() && Object.keys(searchFilters).length === 0) {
      set({ searchResults: [], isSearching: false });
      return;
    }

    set({ isSearching: true });
    await recordEvent('search_performed', `Search: "${searchQuery}"`, {
      metadata: { query: searchQuery, filters: searchFilters },
    });

    const q = searchQuery.toLowerCase();
    const terms = q.split(/\s*\+\s*|\s+/).filter(Boolean);

    let results = await db.files.toArray();

    // Filter by search terms (semantic: matches name, tags, content, source, SKU)
    results = results.filter(file => {
      if (terms.length === 0) return true;
      return terms.every(term => {
        return (
          file.name.toLowerCase().includes(term) ||
          file.sku.toLowerCase().includes(term) ||
          file.source.toLowerCase().includes(term) ||
          file.tags.some(t => t.value.toLowerCase().includes(term)) ||
          file.content?.toLowerCase().includes(term)
        );
      });
    });

    // Apply filters
    if (searchFilters.who?.length) {
      results = results.filter(f =>
        searchFilters.who!.some(w =>
          f.tags.some(t => t.dimension === 'who' && t.value.toLowerCase().includes(w.toLowerCase()))
        )
      );
    }
    if (searchFilters.what?.length) {
      results = results.filter(f =>
        searchFilters.what!.some(w =>
          f.tags.some(t => t.dimension === 'what' && t.value.toLowerCase().includes(w.toLowerCase()))
        )
      );
    }
    if (searchFilters.where?.length) {
      results = results.filter(f =>
        searchFilters.where!.some(w =>
          f.tags.some(t => t.dimension === 'where' && t.value.toLowerCase().includes(w.toLowerCase()))
        )
      );
    }
    if (searchFilters.ext?.length) {
      results = results.filter(f => searchFilters.ext!.includes(f.ext.toLowerCase()));
    }
    if (searchFilters.when?.from || searchFilters.when?.to) {
      const from = searchFilters.when.from ?? 0;
      const to = searchFilters.when.to ?? Infinity;
      results = results.filter(f => f.createdAt >= from && f.createdAt <= to);
    }

    set({ searchResults: results, isSearching: false });
    await get().loadTimeline();
  },

  clearSearch: () => {
    set({ searchQuery: '', searchFilters: {}, searchResults: [], isSearching: false });
  },

  // ── UI Actions ──
  setActivePanel: (panel) => set({ activePanel: panel }),
  setLeftSection: (section) => set({ leftSection: section }),
  toggleFileSelection: (fileId) => {
    const { selectedFileIds } = get();
    set({
      selectedFileIds: selectedFileIds.includes(fileId)
        ? selectedFileIds.filter(id => id !== fileId)
        : [...selectedFileIds, fileId],
    });
  },
  selectAllFiles: () => {
    const { files } = get();
    set({ selectedFileIds: files.map(f => f.id!).filter(Boolean) });
  },
  clearSelection: () => set({ selectedFileIds: [] }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setActiveVault: (id) => set({ activeVaultId: id }),
  setActiveLimbo: (id) => set({ activeLimboId: id }),
  setActiveBundle: (id) => set({ activeBundleId: id }),
  setActiveSKU: (sku) => set({ activeSKU: sku }),
  setShowVaultModal: (show) => set({ showVaultModal: show }),
  setShowLimboModal: (show) => set({ showLimboModal: show }),
  setShowAnalysisPanel: (show) => set({ showAnalysisPanel: show }),
  setIsDragging: (d) => set({ isDragging: d }),
  notify: (message, type = 'info') => {
    set({ notification: { message, type } });
    setTimeout(() => set({ notification: null }), 3500);
  },
  clearNotification: () => set({ notification: null }),
}));
