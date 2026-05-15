/**
 * Ghost Key — Limbo Sandbox
 * Isolated inspection environment. Files analyzed without touching real system.
 */
import { db } from './db';
import type { GKLimboSession, LimboStatus, ExtractedEntities } from './db';
import { recordEvent } from './timeline';
import { extractFromContent } from './tagger';

/** Open a new Limbo session for risky/unknown files */
export async function openLimboSession(
  name: string,
  fileIds: number[]
): Promise<GKLimboSession> {
  const session: GKLimboSession = {
    name,
    status: 'pending',
    fileIds,
    analysisLog: [`[${new Date().toISOString()}] Limbo session opened: ${name}`],
    openedAt: Date.now(),
  };

  const id = await db.limboSessions.add(session);

  // Mark files as in limbo
  await db.files.bulkUpdate(fileIds.map(fid => ({ key: fid, changes: { limboId: id as number } })));

  await recordEvent('limbo_opened', `Limbo session "${name}" opened with ${fileIds.length} file(s)`, {
    metadata: { fileIds },
  });

  return { ...session, id };
}

/** Run analysis on files in a Limbo session */
export async function analyzeLimboSession(sessionId: number): Promise<ExtractedEntities> {
  const session = await db.limboSessions.get(sessionId);
  if (!session) throw new Error('Session not found');

  const log = [...session.analysisLog];
  log.push(`[${new Date().toISOString()}] Starting analysis...`);

  await db.limboSessions.update(sessionId, { status: 'analyzing', analysisLog: log });

  const files = await db.files.bulkGet(session.fileIds);
  const entities: ExtractedEntities = {
    names: [], phones: [], emails: [], domains: [], urls: [], dates: [], keywords: [],
  };

  for (const file of files) {
    if (!file) continue;
    log.push(`[${new Date().toISOString()}] Analyzing: ${file.name}`);

    if (file.content) {
      const extracted = extractFromContent(file.content);
      entities.phones.push(...extracted.phones);
      entities.emails.push(...extracted.emails);
      entities.urls.push(...extracted.urls);
      entities.domains.push(...extracted.domains);
      entities.dates.push(...extracted.dates);

      // Extract keywords from content (simple frequency)
      const words = file.content
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 4);

      const freq = new Map<string, number>();
      for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
      const topWords = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([w]) => w);
      entities.keywords.push(...topWords);
    }

    // Tag-based names
    const whoTags = file.tags.filter(t => t.dimension === 'who').map(t => t.value);
    entities.names.push(...whoTags);
  }

  // Deduplicate
  for (const key of Object.keys(entities) as Array<keyof ExtractedEntities>) {
    entities[key] = Array.from(new Set(entities[key]));
  }

  // Risk scoring
  const hasRiskyContent = entities.phones.length > 0 || entities.emails.length > 0;
  const status: LimboStatus = hasRiskyContent ? 'flagged' : 'clean';

  log.push(`[${new Date().toISOString()}] Analysis complete. Status: ${status}`);
  log.push(`  → Found: ${entities.names.length} names, ${entities.phones.length} phones, ${entities.emails.length} emails`);
  log.push(`  → Domains: ${entities.domains.join(', ') || 'none'}`);

  await db.limboSessions.update(sessionId, {
    status,
    analysisLog: log,
    extractedEntities: entities,
  });

  return entities;
}

/** Release files from Limbo back to main library */
export async function releaseLimboSession(sessionId: number): Promise<void> {
  const session = await db.limboSessions.get(sessionId);
  if (!session) return;

  // Remove limboId from files
  await db.files.bulkUpdate(
    session.fileIds.map(fid => ({ key: fid, changes: { limboId: undefined } }))
  );

  await db.limboSessions.update(sessionId, {
    status: 'clean',
    closedAt: Date.now(),
    analysisLog: [
      ...session.analysisLog,
      `[${new Date().toISOString()}] Session released. Files returned to library.`,
    ],
  });

  await recordEvent('limbo_released', `Limbo session "${session.name}" released`, {
    metadata: { fileIds: session.fileIds },
  });
}

/** Quarantine (keep in limbo, flag) */
export async function quarantineLimboSession(sessionId: number): Promise<void> {
  const session = await db.limboSessions.get(sessionId);
  if (!session) return;

  await db.limboSessions.update(sessionId, { status: 'flagged' });

  // Flag files
  await db.files.bulkUpdate(
    session.fileIds.map(fid => ({ key: fid, changes: { isFlagged: true } }))
  );
}

/** Get all limbo sessions */
export async function getAllLimboSessions(): Promise<GKLimboSession[]> {
  return db.limboSessions.orderBy('openedAt').reverse().toArray();
}

/** Get status color */
export function limboStatusColor(status: LimboStatus): string {
  return {
    pending: '#64748b',
    analyzing: '#ffd700',
    clean: '#00ff88',
    flagged: '#ff3355',
  }[status];
}

/** Parse archive file structure (simulated for browser env) */
export function parseArchiveStructure(_filename: string, content?: string): Array<{
  name: string; size?: number; type: string;
}> {
  // In a real app, this would use a WASM zip/tar parser
  // For now we simulate based on filename patterns
  if (!content) return [];

  const lines = content.split('\n').slice(0, 50);
  return lines
    .filter(l => l.trim())
    .map(l => ({
      name: l.trim(),
      size: Math.floor(Math.random() * 10000),
      type: l.includes('.') ? l.split('.').pop() ?? 'unknown' : 'directory',
    }));
}
