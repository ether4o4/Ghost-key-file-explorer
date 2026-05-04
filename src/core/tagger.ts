/**
 * Ghost Key — Auto-Tagger
 * Extracts who/what/when/where from file metadata and content.
 */
import type { GKTag } from './db';

// ─── Pattern Libraries ────────────────────────────────────────────────────────

const PERSON_PATTERNS = [
  /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g,
  /\bfrom[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/g,
  /\bcontact[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/g,
];

const PHONE_PATTERNS = [
  /\b(\+?1?\s?[\-(]?\d{3}[\-\s\)]+\d{3}[\-\s]+\d{4})\b/g,
  /\b(\d{3}[-\.\s]\d{3}[-\.\s]\d{4})\b/g,
];

const EMAIL_PATTERNS = [
  /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
];

const URL_PATTERNS = [
  /https?:\/\/[^\s<>"{}|\\^`[\]]+/g,
];

const DOMAIN_PATTERNS = [
  /\b(snapchat|instagram|facebook|twitter|icloud|google|whatsapp|telegram|discord|tiktok|youtube)\b/gi,
];

const DATE_PATTERNS = [
  /\b(\d{4}[-\/]\d{2}[-\/]\d{2})\b/g,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi,
  /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b/gi,
];




// ─── Extension → "what" mapping ───────────────────────────────────────────────

const EXT_WHAT: Record<string, string> = {
  // Images
  jpg: 'Image', jpeg: 'Image', png: 'Image', gif: 'Image', webp: 'Image',
  heic: 'Image', heif: 'Image', raw: 'RAW Photo', cr2: 'RAW Photo',
  // Video
  mp4: 'Video', mov: 'Video', avi: 'Video', mkv: 'Video', webm: 'Video',
  // Audio
  mp3: 'Audio', wav: 'Audio', flac: 'Audio', m4a: 'Audio', aac: 'Audio',
  // Documents
  pdf: 'Document', doc: 'Document', docx: 'Document', txt: 'Text',
  md: 'Markdown', csv: 'Spreadsheet', xls: 'Spreadsheet', xlsx: 'Spreadsheet',
  // Archives
  zip: 'Archive', tar: 'Archive', gz: 'Archive', rar: 'Archive', '7z': 'Archive',
  // Code
  js: 'Code', ts: 'Code', py: 'Code', java: 'Code', cpp: 'Code',
  // Data
  json: 'Data', xml: 'Data', sql: 'Database', db: 'Database', sqlite: 'Database',
  // Logs
  log: 'Log', 'log.txt': 'Log',
};

// ─── Source → "where" mapping ─────────────────────────────────────────────────

const SOURCE_WHERE: Record<string, string> = {
  snapchat: 'Snapchat',
  instagram: 'Instagram',
  facebook: 'Facebook',
  icloud: 'iCloud',
  google: 'Google Drive',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  discord: 'Discord',
  downloads: 'Downloads',
  desktop: 'Desktop',
  backup: 'Backup',
  email: 'Email',
};

// ─── Auto-Tag Functions ───────────────────────────────────────────────────────

/** Extract "what" tag from file extension */
export function tagWhat(ext: string, mimeType?: string): GKTag {
  const normalized = ext.toLowerCase().replace(/^\./, '');
  const value = EXT_WHAT[normalized] ?? (mimeType?.split('/')[0] ?? 'File');
  return { dimension: 'what', value, confidence: 1.0 };
}

/** Extract "when" tag from timestamps */
export function tagWhen(timestamp: number): GKTag {
  const d = new Date(timestamp);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const value = `${months[d.getMonth()]} ${d.getFullYear()}`;
  return { dimension: 'when', value, confidence: 1.0 };
}

/** Extract "where" tag from source label */
export function tagWhere(source: string): GKTag {
  const normalized = source.toLowerCase();
  for (const [key, label] of Object.entries(SOURCE_WHERE)) {
    if (normalized.includes(key)) {
      return { dimension: 'where', value: label, confidence: 1.0 };
    }
  }
  return { dimension: 'where', value: source || 'Unknown', confidence: 0.8 };
}

/** Extract "who" tags from filename and content */
export function tagWho(filename: string, content?: string): GKTag[] {
  const tags: GKTag[] = [];
  const seen = new Set<string>();

  // Try filename first
  const namePatterns = [
    /^([A-Z][a-z]+)[-_\s]/,
    /[-_\s]([A-Z][a-z]+)\./,
  ];
  for (const p of namePatterns) {
    const m = filename.match(p);
    if (m?.[1] && m[1].length > 2) {
      const name = m[1];
      if (!seen.has(name)) {
        seen.add(name);
        tags.push({ dimension: 'who', value: name, confidence: 0.7 });
      }
    }
  }

  // Try content
  if (content) {
    for (const pattern of PERSON_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1].trim();
        if (!seen.has(name) && name.length > 3) {
          seen.add(name);
          tags.push({ dimension: 'who', value: name, confidence: 0.85 });
          if (tags.length >= 5) break;
        }
      }
    }
  }

  return tags;
}

/** Full auto-tag a file */
export function autoTag(params: {
  name: string;
  ext: string;
  mimeType?: string;
  source: string;
  createdAt: number;
  content?: string;
}): GKTag[] {
  const tags: GKTag[] = [];

  // What (always)
  tags.push(tagWhat(params.ext, params.mimeType));

  // When (always)
  tags.push(tagWhen(params.createdAt));

  // Where
  tags.push(tagWhere(params.source));

  // Who (from filename + content)
  const whoTags = tagWho(params.name, params.content);
  tags.push(...whoTags);

  return tags;
}

/** Extract all patterns from text content */
export function extractFromContent(content: string) {
  const extract = (patterns: RegExp[]) => {
    const results: string[] = [];
    const seen = new Set<string>();
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(content)) !== null) {
        const val = (m[1] || m[0]).trim();
        if (!seen.has(val)) { seen.add(val); results.push(val); }
        if (results.length >= 20) break;
      }
    }
    return results;
  };

  return {
    phones: extract(PHONE_PATTERNS),
    emails: extract(EMAIL_PATTERNS),
    urls: extract(URL_PATTERNS),
    domains: extract(DOMAIN_PATTERNS),
    dates: extract(DATE_PATTERNS),
  };
}

/** Suggest tags from content for AI-like hints */
export function suggestTags(content: string, filename: string): GKTag[] {
  const suggestions: GKTag[] = [];

  // Domain-based where tags
  for (const [domain, label] of Object.entries(SOURCE_WHERE)) {
    if (content.toLowerCase().includes(domain)) {
      suggestions.push({ dimension: 'where', value: label, confidence: 0.75 });
    }
  }

  // Who from content
  const whoTags = tagWho(filename, content);
  suggestions.push(...whoTags);

  return suggestions;
}
