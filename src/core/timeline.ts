/**
 * Ghost Key — Timeline Engine
 * Records every action as an immutable event. Enables behavior reconstruction.
 */
import { db } from './db';
import type { GKTimelineEvent, TimelineEventType } from './db';

/** Record a timeline event */
export async function recordEvent(
  type: TimelineEventType,
  description: string,
  meta?: {
    fileId?: number;
    fileSku?: string;
    bundleId?: number;
    vaultId?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<number> {
  return db.timeline.add({
    type,
    description,
    fileId: meta?.fileId,
    fileSku: meta?.fileSku,
    bundleId: meta?.bundleId,
    vaultId: meta?.vaultId,
    metadata: meta?.metadata,
    timestamp: Date.now(),
  }) as Promise<number>;
}

/** Query timeline events, newest first */
export async function getTimeline(options?: {
  limit?: number;
  offset?: number;
  fileId?: number;
  bundleId?: number;
  vaultId?: number;
  types?: TimelineEventType[];
  since?: number;
  until?: number;
}): Promise<GKTimelineEvent[]> {
  let query = db.timeline.orderBy('timestamp').reverse();

  if (options?.since || options?.until) {
    const since = options.since ?? 0;
    const until = options.until ?? Infinity;
    query = db.timeline
      .where('timestamp')
      .between(since, until)
      .reverse() as typeof query;
  }

  let results = await query.toArray();

  if (options?.fileId !== undefined) {
    results = results.filter(e => e.fileId === options.fileId);
  }
  if (options?.bundleId !== undefined) {
    results = results.filter(e => e.bundleId === options.bundleId);
  }
  if (options?.vaultId !== undefined) {
    results = results.filter(e => e.vaultId === options.vaultId);
  }
  if (options?.types?.length) {
    results = results.filter(e => options.types!.includes(e.type));
  }

  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 100;
  return results.slice(offset, offset + limit);
}

/** Get timeline grouped by day */
export async function getTimelineByDay(limit = 30): Promise<Map<string, GKTimelineEvent[]>> {
  const events = await getTimeline({ limit: limit * 20 });
  const grouped = new Map<string, GKTimelineEvent[]>();

  for (const event of events) {
    const d = new Date(event.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(event);
  }

  return grouped;
}

/** Get event counts by type for analysis */
export async function getEventStats(): Promise<Record<TimelineEventType, number>> {
  const events = await db.timeline.toArray();
  const stats = {} as Record<TimelineEventType, number>;

  for (const event of events) {
    stats[event.type] = (stats[event.type] ?? 0) + 1;
  }

  return stats;
}

/** Get activity spikes (days with unusually high activity) */
export async function getActivitySpikes(threshold = 5): Promise<Array<{ date: string; count: number; events: GKTimelineEvent[] }>> {
  const grouped = await getTimelineByDay(60);
  const spikes: Array<{ date: string; count: number; events: GKTimelineEvent[] }> = [];

  for (const [date, events] of grouped.entries()) {
    if (events.length >= threshold) {
      spikes.push({ date, count: events.length, events });
    }
  }

  return spikes.sort((a, b) => b.count - a.count);
}

/** Format event for display */
export function formatEventDescription(event: GKTimelineEvent): string {
  return event.description;
}

/** Get human-readable relative time */
export function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
}

/** Color code for event type */
export function eventTypeColor(type: TimelineEventType): string {
  const map: Record<TimelineEventType, string> = {
    file_imported: '#6c63ff',
    file_opened: '#00d4ff',
    file_tagged: '#00ff88',
    file_analyzed: '#ffd700',
    sku_linked: '#ff6b35',
    vault_created: '#ff3355',
    vault_locked: '#ff3355',
    limbo_opened: '#ff6b35',
    limbo_released: '#00ff88',
    bundle_created: '#6c63ff',
    widget_pinned: '#00d4ff',
    search_performed: '#64748b',
  };
  return map[type] ?? '#64748b';
}

/** Icon name for event type */
export function eventTypeIcon(type: TimelineEventType): string {
  const map: Record<TimelineEventType, string> = {
    file_imported: 'Upload',
    file_opened: 'Eye',
    file_tagged: 'Tag',
    file_analyzed: 'Brain',
    sku_linked: 'Link',
    vault_created: 'Lock',
    vault_locked: 'Lock',
    limbo_opened: 'FlaskConical',
    limbo_released: 'CheckCircle',
    bundle_created: 'FolderPlus',
    widget_pinned: 'Pin',
    search_performed: 'Search',
  };
  return map[type] ?? 'Activity';
}
