/**
 * Ghost Key — Local-First IndexedDB Schema (Dexie)
 * All data stays on device. No cloud required.
 */
import Dexie, { type EntityTable } from 'dexie';

// ─── Entity Types ────────────────────────────────────────────────────────────

export type TagDimension = 'who' | 'what' | 'when' | 'where';

export interface GKTag {
  dimension: TagDimension;
  value: string;
  confidence?: number; // 0-1, auto-tag confidence
}

export type VaultType = 'standard' | 'forensic' | 'ephemeral';
export type LimboStatus = 'pending' | 'analyzing' | 'clean' | 'flagged';
export type TimelineEventType =
  | 'file_imported'
  | 'file_opened'
  | 'file_tagged'
  | 'file_analyzed'
  | 'sku_linked'
  | 'vault_created'
  | 'vault_locked'
  | 'limbo_opened'
  | 'limbo_released'
  | 'bundle_created'
  | 'widget_pinned'
  | 'search_performed';

// ─── Tables ──────────────────────────────────────────────────────────────────

export interface GKFile {
  id?: number;
  sku: string;           // GK-YYYY-MM-XXXX
  name: string;
  ext: string;
  size: number;          // bytes
  mimeType: string;
  tags: GKTag[];
  skuLinks: string[];    // linked SKUs
  vaultId?: number;
  limboId?: number;
  bundleIds: number[];
  source: string;        // origin label (Downloads, Desktop, iCloud, Snapchat…)
  path?: string;         // filesystem path if available
  content?: string;      // text content for analysis
  dataUrl?: string;      // base64 data URL for preview
  createdAt: number;     // epoch ms
  modifiedAt: number;
  importedAt: number;
  lastOpenedAt?: number;
  analysisResult?: AnalysisResult;
  isFlagged: boolean;
  isPinned: boolean;
}

export interface GKSKUCluster {
  id?: number;
  rootSku: string;
  memberSkus: string[];
  label: string;
  createdAt: number;
}

export interface GKTimelineEvent {
  id?: number;
  type: TimelineEventType;
  fileId?: number;
  fileSku?: string;
  bundleId?: number;
  vaultId?: number;
  description: string;
  metadata?: Record<string, unknown>;
  timestamp: number;    // epoch ms
}

export interface GKVault {
  id?: number;
  name: string;
  type: VaultType;
  salt: string;         // hex-encoded salt for key derivation
  iv: string;           // hex-encoded IV
  encryptedData?: string; // base64 encrypted payload
  fileIds: number[];
  createdAt: number;
  lockedAt?: number;
  ephemeralWipeAt?: number; // for ephemeral vaults
  isLocked: boolean;
}

export interface GKLimboSession {
  id?: number;
  name: string;
  status: LimboStatus;
  fileIds: number[];
  analysisLog: string[];
  extractedEntities?: ExtractedEntities;
  openedAt: number;
  closedAt?: number;
}

export interface GKBundle {
  id?: number;
  name: string;
  description?: string;
  fileIds: number[];
  skus: string[];
  tags: GKTag[];
  color: string;       // hex color for UI
  isPinned: boolean;   // pinned to homescreen
  createdAt: number;
  updatedAt: number;
}

export interface GKWidget {
  id?: number;
  type: 'bundle' | 'timeline' | 'search' | 'sku' | 'vault' | 'analysis';
  label: string;
  config: Record<string, unknown>; // widget-specific config
  position: { x: number; y: number };
  size: 'sm' | 'md' | 'lg';
  color: string;
  isPinned: boolean;
  createdAt: number;
}

export interface GKSearchSave {
  id?: number;
  query: string;
  filters: SearchFilters;
  label?: string;
  isPinned: boolean;
  lastUsedAt: number;
  hitCount: number;
}

// ─── Analysis Types ───────────────────────────────────────────────────────────

export interface ExtractedEntities {
  names: string[];
  phones: string[];
  emails: string[];
  domains: string[];
  urls: string[];
  dates: string[];
  keywords: string[];
}

export interface AnalysisResult {
  summary: string;
  entities: ExtractedEntities;
  patterns: string[];
  riskScore: number; // 0-10
  analyzedAt: number;
}

export interface SearchFilters {
  who?: string[];
  what?: string[];
  when?: { from?: number; to?: number };
  where?: string[];
  source?: string[];
  ext?: string[];
  skuPrefix?: string;
}

// ─── Database ────────────────────────────────────────────────────────────────

export class GhostKeyDB extends Dexie {
  files!: EntityTable<GKFile, 'id'>;
  skuClusters!: EntityTable<GKSKUCluster, 'id'>;
  timeline!: EntityTable<GKTimelineEvent, 'id'>;
  vaults!: EntityTable<GKVault, 'id'>;
  limboSessions!: EntityTable<GKLimboSession, 'id'>;
  bundles!: EntityTable<GKBundle, 'id'>;
  widgets!: EntityTable<GKWidget, 'id'>;
  savedSearches!: EntityTable<GKSearchSave, 'id'>;

  constructor() {
    super('GhostKeyDB');

    this.version(1).stores({
      files: '++id, sku, name, ext, mimeType, source, createdAt, importedAt, isFlagged, isPinned, *bundleIds, *skuLinks',
      skuClusters: '++id, rootSku, *memberSkus',
      timeline: '++id, type, fileId, fileSku, bundleId, vaultId, timestamp',
      vaults: '++id, name, type, isLocked, createdAt',
      limboSessions: '++id, name, status, openedAt',
      bundles: '++id, name, isPinned, createdAt, *fileIds',
      widgets: '++id, type, isPinned, createdAt',
      savedSearches: '++id, isPinned, lastUsedAt',
    });
  }
}

export const db = new GhostKeyDB();
