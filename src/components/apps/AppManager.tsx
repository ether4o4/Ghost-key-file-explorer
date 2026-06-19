import React, { useEffect, useMemo, useState } from 'react';
import { AppManager as Native, appManagerAvailable } from '../../core/appManager';
import type { AppEntry } from '../../core/appManager';
import { formatBytes, formatDate } from '../../utils/format';
import { Icon } from './../explorer/Icons';
import type { IconName } from './../explorer/Icons';

type SortKey = 'installed' | 'updated' | 'leastUsed' | 'mostUsed' | 'size' | 'name';

const SORTS: { key: SortKey; label: string; needsUsage?: boolean }[] = [
  { key: 'installed', label: 'Recently installed' },
  { key: 'updated', label: 'Recently updated' },
  { key: 'leastUsed', label: 'Least used', needsUsage: true },
  { key: 'mostUsed', label: 'Most used', needsUsage: true },
  { key: 'size', label: 'Largest', needsUsage: true },
  { key: 'name', label: 'Name (A–Z)' },
];

const DAY = 86_400_000;

function timeAgo(ms: number): string {
  if (!ms) return 'never';
  const diff = Date.now() - ms;
  if (diff < 0) return 'just now';
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
  if (diff < DAY) return `${Math.round(diff / 3_600_000)}h ago`;
  const days = Math.round(diff / DAY);
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

export const AppManager: React.FC = () => {
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usageAccess, setUsageAccess] = useState(false);
  const [sort, setSort] = useState<SortKey>('installed');
  const [query, setQuery] = useState('');
  const [includeSystem, setIncludeSystem] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // packageName mid-action
  const [loadedAt, setLoadedAt] = useState(0); // wall-clock at last successful load

  const load = React.useCallback(async () => {
    if (!appManagerAvailable()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await Native.listApps({ includeSystem, icons: true });
      setApps(res.apps);
      setUsageAccess(res.usageAccess);
      setLoadedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read installed apps');
    } finally {
      setLoading(false);
    }
  }, [includeSystem]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState happens via the async load
    load();
  }, [load]);

  // Refresh when returning from the system uninstall / settings screens.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = apps.filter(
      (a) => !q || a.appName.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q),
    );
    const by: Record<SortKey, (a: AppEntry, b: AppEntry) => number> = {
      installed: (a, b) => b.firstInstallTime - a.firstInstallTime,
      updated: (a, b) => b.lastUpdateTime - a.lastUpdateTime,
      leastUsed: (a, b) => a.lastTimeUsed - b.lastTimeUsed, // never-used (0) first
      mostUsed: (a, b) => b.totalTimeForeground - a.totalTimeForeground,
      size: (a, b) => b.sizeBytes - a.sizeBytes,
      name: (a, b) => a.appName.localeCompare(b.appName, undefined, { sensitivity: 'base' }),
    };
    return [...list].sort(by[sort]);
  }, [apps, query, sort]);

  const totalSize = useMemo(() => apps.reduce((n, a) => (a.sizeBytes > 0 ? n + a.sizeBytes : n), 0), [apps]);

  const act = async (pkg: string, fn: () => Promise<void>) => {
    setBusy(pkg);
    try {
      await fn();
    } catch {
      /* the native side rejects are non-fatal here */
    } finally {
      setBusy(null);
    }
  };

  if (!appManagerAvailable()) {
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 px-6 text-ghost-muted">
          <Icon name="grid" size={32} className="opacity-40" />
          <div className="text-sm text-ghost-text">App management is Android-only</div>
          <div className="text-xs max-w-[280px]">Install the APK to list, sort and uninstall your apps. The browser build can't see installed apps.</div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-ghost-border bg-ghost-surface/40 shrink-0 flex-wrap">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          title="Sort apps"
          className="bg-ghost-card border border-ghost-border rounded text-[11px] text-ghost-text px-1.5 py-1 outline-none focus:border-ghost-accent"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key} disabled={s.needsUsage && !usageAccess}>
              {s.label}
              {s.needsUsage && !usageAccess ? ' (needs access)' : ''}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-[11px] text-ghost-muted px-1">
          <input type="checkbox" checked={includeSystem} onChange={(e) => setIncludeSystem(e.target.checked)} />
          System
        </label>
        <div className="flex-1 min-w-[120px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps…"
            className="w-full bg-ghost-card border border-ghost-border rounded-lg px-2.5 py-1 text-[12px] text-ghost-text outline-none focus:border-ghost-accent"
          />
        </div>
        <IconBtn name="refresh" title="Refresh" onClick={load} />
      </div>

      {/* Usage-access banner */}
      {!usageAccess && (
        <div className="mx-2 mt-2 text-[11px] text-ghost-text bg-ghost-accent/10 border border-ghost-accent/30 rounded-lg p-2.5 flex items-center gap-2 shrink-0">
          <Icon name="info" size={15} className="text-ghost-accent shrink-0" />
          <span className="flex-1">Grant <b>Usage access</b> to see last-used times and app sizes.</span>
          <button
            onClick={() => Native.openUsageAccessSettings()}
            className="shrink-0 px-2 py-1 rounded-md bg-ghost-accent/25 border border-ghost-accent/50 text-ghost-text hover:bg-ghost-accent/35"
          >
            Grant
          </button>
        </div>
      )}

      {/* Summary */}
      {!loading && !error && (
        <div className="px-3 py-1 text-[10px] text-ghost-muted shrink-0">
          {sorted.length} app{sorted.length === 1 ? '' : 's'}
          {totalSize > 0 ? ` · ${formatBytes(totalSize)} total` : ''}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-auto">
        {loading && <div className="p-6 text-center text-ghost-muted text-xs">Reading installed apps…</div>}
        {error && <div className="m-3 text-xs text-ghost-red bg-ghost-red/10 border border-ghost-red/30 rounded-lg p-3">{error}</div>}
        {!loading && !error && sorted.length === 0 && (
          <div className="p-6 text-center text-ghost-muted text-xs">No apps match.</div>
        )}
        <ul>
          {sorted.map((a) => {
            const unused = usageAccess && (!a.lastTimeUsed || loadedAt - a.lastTimeUsed > 30 * DAY);
            return (
              <li
                key={a.packageName}
                className={`flex items-center gap-2.5 px-3 py-2 border-b border-ghost-border/40 ${busy === a.packageName ? 'opacity-50' : ''}`}
              >
                {a.icon ? (
                  <img src={a.icon} alt="" className="w-9 h-9 rounded-lg shrink-0" />
                ) : (
                  <span className="w-9 h-9 rounded-lg shrink-0 grid place-items-center bg-ghost-card text-ghost-muted text-sm font-semibold">
                    {a.appName.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] text-ghost-text truncate">{a.appName}</span>
                    {a.system && <Pill>system</Pill>}
                    {!a.enabled && <Pill>disabled</Pill>}
                    {unused && <Pill tone="warn">{a.lastTimeUsed ? 'unused' : 'never opened'}</Pill>}
                  </div>
                  <div className="text-[10px] text-ghost-muted truncate">
                    {sort === 'updated' ? `Updated ${formatDate(a.lastUpdateTime)}` : `Installed ${formatDate(a.firstInstallTime)}`}
                    {usageAccess && ` · used ${timeAgo(a.lastTimeUsed)}`}
                    {a.sizeBytes > 0 ? ` · ${formatBytes(a.sizeBytes)}` : ''}
                  </div>
                </div>
                {a.launchable && (
                  <IconBtn name="open" title="Open app" onClick={() => act(a.packageName, () => Native.launchApp({ packageName: a.packageName }))} />
                )}
                <IconBtn name="info" title="App info" onClick={() => act(a.packageName, () => Native.openAppInfo({ packageName: a.packageName }))} />
                <IconBtn
                  name="trash"
                  title="Uninstall"
                  danger
                  onClick={() => act(a.packageName, () => Native.uninstall({ packageName: a.packageName }))}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </Shell>
  );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-col h-full bg-ghost-bg">
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-ghost-border bg-ghost-surface/60 shrink-0">
      <Icon name="grid" size={15} className="text-ghost-accent shrink-0" />
      <span className="text-[12px] font-semibold text-ghost-text">App Manager</span>
    </div>
    {children}
  </div>
);

const Pill: React.FC<{ children: React.ReactNode; tone?: 'warn' }> = ({ children, tone }) => (
  <span
    className={`shrink-0 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${
      tone === 'warn' ? 'bg-ghost-orange/15 text-ghost-orange border-ghost-orange/40' : 'bg-ghost-card text-ghost-muted border-ghost-border'
    }`}
  >
    {children}
  </span>
);

const IconBtn: React.FC<{ name: IconName; title: string; onClick: () => void; danger?: boolean }> = ({ name, title, onClick, danger }) => (
  <button
    title={title}
    onClick={onClick}
    className={`shrink-0 p-1.5 rounded transition-colors ${
      danger ? 'text-ghost-muted hover:text-white hover:bg-ghost-red' : 'text-ghost-muted hover:text-ghost-text hover:bg-ghost-card'
    }`}
  >
    <Icon name={name} size={15} />
  </button>
);
