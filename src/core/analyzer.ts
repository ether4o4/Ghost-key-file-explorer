/**
 * NeverSoft Services — Analysis Engine
 * Extracts entities, generates summaries, detects patterns.
 * Zero AI required — pure pattern matching + heuristics.
 */
import type { GKFile, AnalysisResult, ExtractedEntities } from './db';
import { extractFromContent } from './tagger';

// ─── Pattern Detection ────────────────────────────────────────────────────────

const RISK_INDICATORS = [
  'password', 'passwd', 'secret', 'private key', 'api_key', 'token', 'credential',
  'ssn', 'social security', 'credit card', 'bank account', 'routing number',
  'dob', 'date of birth', 'passport', 'driver license',
];

const PLATFORM_PATTERNS: Record<string, RegExp> = {
  Snapchat: /snapchat|snap|\.snap/i,
  Instagram: /instagram|\.ig\.|insta/i,
  iCloud: /icloud|\.icloud\.|apple/i,
  WhatsApp: /whatsapp|\.whatsapp/i,
  Telegram: /telegram|\.tg\./i,
  Discord: /discord|\.discord/i,
  Facebook: /facebook|fb\./i,
  TikTok: /tiktok|\.tiktok/i,
};

// ─── Analyzer Functions ───────────────────────────────────────────────────────

/** Calculate risk score 0-10 */
function calcRiskScore(content: string, entities: ExtractedEntities): number {
  let score = 0;
  const lower = content.toLowerCase();

  // Sensitive keywords
  for (const indicator of RISK_INDICATORS) {
    if (lower.includes(indicator)) score += 1.5;
  }

  // Personal identifiers
  if (entities.phones.length > 0) score += entities.phones.length * 0.5;
  if (entities.emails.length > 0) score += entities.emails.length * 0.3;

  return Math.min(10, score);
}

/** Detect what platforms are referenced */
function detectPlatforms(filename: string, content?: string): string[] {
  const text = `${filename} ${content ?? ''}`;
  const found: string[] = [];
  for (const [platform, pattern] of Object.entries(PLATFORM_PATTERNS)) {
    if (pattern.test(text)) found.push(platform);
  }
  return found;
}

/** Generate a human-readable summary */
function generateSummary(file: GKFile, entities: ExtractedEntities, platforms: string[]): string {
  const parts: string[] = [];

  const what = file.tags.find(t => t.dimension === 'what')?.value ?? 'File';
  const who = file.tags.filter(t => t.dimension === 'who').map(t => t.value);
  const when = file.tags.find(t => t.dimension === 'when')?.value;
  const where = file.tags.find(t => t.dimension === 'where')?.value;

  parts.push(`${what} imported from ${where ?? 'unknown source'}`);
  if (when) parts.push(`around ${when}`);
  if (who.length) parts.push(`linked to ${who.join(', ')}`);
  if (platforms.length) parts.push(`referencing ${platforms.join(' & ')}`);
  if (entities.phones.length) parts.push(`contains ${entities.phones.length} phone number(s)`);
  if (entities.emails.length) parts.push(`and ${entities.emails.length} email address(es)`);

  return parts.join(', ') + '.';
}

/** Detect behavioral patterns across file content */
function detectPatterns(content: string, entities: ExtractedEntities): string[] {
  const patterns: string[] = [];

  if (entities.phones.length > 2) patterns.push('Multiple phone numbers — possible contact list');
  if (entities.emails.length > 2) patterns.push('Multiple email addresses — possible data export');
  if (entities.domains.length > 1) patterns.push(`Multi-platform activity: ${entities.domains.join(', ')}`);
  if (entities.urls.length > 3) patterns.push('High URL density — possible web activity log');

  const lc = content.toLowerCase();
  if (lc.includes('backup') || lc.includes('.bak')) patterns.push('Backup file detected');
  if (lc.includes('export') || lc.includes('dump')) patterns.push('Data export/dump detected');
  if (lc.includes('chat') || lc.includes('message') || lc.includes('conversation')) {
    patterns.push('Communication content detected');
  }

  return patterns;
}

/** Full analysis of a single file */
export async function analyzeFile(file: GKFile): Promise<AnalysisResult> {
  const content = file.content ?? '';
  const extracted = content ? extractFromContent(content) : {
    phones: [], emails: [], urls: [], domains: [], dates: [],
  };

  const entities: ExtractedEntities = {
    names: file.tags.filter(t => t.dimension === 'who').map(t => t.value),
    phones: extracted.phones,
    emails: extracted.emails,
    domains: extracted.domains,
    urls: extracted.urls,
    dates: extracted.dates,
    keywords: [],
  };

  const platforms = detectPlatforms(file.name, content);
  // Add platform sources to domains if not already there
  for (const p of platforms) {
    if (!entities.domains.includes(p)) entities.domains.push(p);
  }

  const riskScore = calcRiskScore(content, entities);
  const summary = generateSummary(file, entities, platforms);
  const patterns = detectPatterns(content, entities);

  return {
    summary,
    entities,
    patterns,
    riskScore,
    analyzedAt: Date.now(),
  };
}

/** Analyze multiple files and aggregate */
export async function analyzeBatch(files: GKFile[]): Promise<{
  summary: string;
  entities: ExtractedEntities;
  patterns: string[];
  avgRiskScore: number;
  topPlatforms: string[];
}> {
  const results = await Promise.all(files.map(f => analyzeFile(f)));

  const combined: ExtractedEntities = {
    names: [], phones: [], emails: [], domains: [], urls: [], dates: [], keywords: [],
  };

  for (const r of results) {
    for (const k of Object.keys(combined) as Array<keyof ExtractedEntities>) {
      combined[k].push(...r.entities[k]);
    }
  }

  // Deduplicate
  for (const k of Object.keys(combined) as Array<keyof ExtractedEntities>) {
    combined[k] = Array.from(new Set(combined[k]));
  }

  const allPatterns = Array.from(new Set(results.flatMap(r => r.patterns)));
  const avgRiskScore = results.reduce((s, r) => s + r.riskScore, 0) / (results.length || 1);
  const platformFreq = new Map<string, number>();
  for (const d of combined.domains) platformFreq.set(d, (platformFreq.get(d) ?? 0) + 1);
  const topPlatforms = [...platformFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([p]) => p);

  const summary = `Analyzed ${files.length} file(s). `
    + `Found ${combined.names.length} person(s), ${combined.phones.length} phone(s), `
    + `${combined.emails.length} email(s). `
    + (topPlatforms.length ? `Platforms: ${topPlatforms.join(', ')}.` : '');

  return { summary, entities: combined, patterns: allPatterns, avgRiskScore, topPlatforms };
}

/** Risk score color */
export function riskScoreColor(score: number): string {
  if (score >= 7) return '#ff3355';
  if (score >= 4) return '#ffd700';
  return '#00ff88';
}

/** Risk label */
export function riskLabel(score: number): string {
  if (score >= 7) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  return 'LOW';
}
