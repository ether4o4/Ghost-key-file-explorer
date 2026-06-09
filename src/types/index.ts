export interface NeverSoftFile {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  modifiedAt: string;
  isDirectory: boolean;
}

export interface Entity {
  id: string;
  fileId: string;
  type: 'person' | 'place' | 'email' | 'phone' | 'url' | 'sku' | 'date' | 'organization' | 'custom';
  value: string;
  context: string;
  confidence: number;
  createdAt: string;
}

export interface VaultItem {
  id: string;
  type: 'credential' | 'note' | 'key' | 'secret' | 'file';
  label: string;
  encryptedData: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEntry {
  id: string;
  fileId: string;
  fileName: string;
  action: 'created' | 'modified' | 'analyzed' | 'tagged' | 'vaulted' | 'deleted';
  detail: string;
  timestamp: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  count: number;
}

export interface AnalysisResult {
  id: string;
  fileId: string;
  fileName: string;
  summary: string;
  entities: Entity[];
  tags: string[];
  sentiment?: string;
  categories: string[];
  analyzedAt: string;
}

export interface DeepSeekMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
