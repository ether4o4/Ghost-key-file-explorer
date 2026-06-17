import React, { useMemo, useState } from 'react';
import { useExplorer } from '../../store/explorerStore';
import type { SortKey } from '../../store/explorerStore';
import type { DirEntry } from '../../core/fs';
import { formatBytes, formatDate } from '../../utils/format';
import { Icon, entryIcon } from './Icons';
import type { IconName } from './Icons';

/**
 * Top deck of the staging window: the files of whichever staged folder is
 * active. Starts blank until a folder is picked in the deck below. Files are
 * tap-to-(multi)select; the selection bar moves/copies them into any of the
 * OTHER staged folders — the whole point of staging a working set.
 */
function sortFiles(files: DirEntry[], key: SortKey, asc: boolean): DirEntry[] {
  const dir = asc ? 1 : -1;
  return [...files].sort((a, b) => {
    let cmp: number;
    if (key === 'size') cmp = a.size - b.size;
    else if (key === 'mtime') cmp = a.mtime - b.mtime;
    else if (key === 'kind') cmp = a.ext.localeCompare(b.ext);
    else cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
    if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
    return cmp * dir;
  });
}

const StagedFilesPaneInner: React.FC<{ winId: number }> = ({ winId }) => {
  const win = useExplorer((s) => s.windows.find((w) => w.id === winId));
  const s = useExplorer.getState;
  const [copyMode, setCopyMode] = useState(false);

  const pane = win?.panes.left;
  const files = useMemo(
    () => (pane ? sortFiles(pane.entries.filter((e) => e.kind === 'file'), pane.sortKey, pane.sortAsc) : []),
    [pane],
  );

  if (!win || !pane) return null;

  const active = win.activeStaged;
  const activeRef = active !== null ? win.staged[active] : null;
  const selected = pane.selected;
  const targets = win.staged.map((ref, idx) => ({ ref, idx })).filter(({ idx }) => idx !== active);

  const toggle = (name: string) => {
    const cur = new Set(selected);
    if (cur.has(name)) cur.delete(name);
    else cur.add(name);
    s().setSelected(winId, 'left', [...cur]);
  };

  const openOne = (entry: DirEntry) => s().openFile(winId, 'left', entry);

  // ── Blank state: nothing picked yet ──
  if (!activeRef) {
    return (
      <div className="flex flex-col h-full bg-ghost-bg">
        <PaneHeader title="Files" subtitle="No folder selected" />
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 px-6 text-ghost-muted">
          <Icon name="folderOpen" size={34} className="opacity-40" />
          <div className="text-sm text-ghost-text">Pick a folder below</div>
          <div className="text-xs max-w-[260px]">
            Tap a folder in the staging deck and its files load up here. Stage up to five to move files between them.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-ghost-bg">
      <PaneHeader
        title={activeRef.name || 'Files'}
        subtitle={`${files.length} file${files.length === 1 ? '' : 's'}`}
        right={
          <>
            <select
              value={pane.sortKey}
              onChange={(e) => s().setSort(winId, 'left', e.target.value as SortKey)}
              title="Sort by"
              className="bg-ghost-card border border-ghost-border rounded text-[11px] text-ghost-text px-1 py-1 outline-none focus:border-ghost-accent"
            >
              <option value="name">Name</option>
              <option value="size">Size</option>
              <option value="mtime">Modified</option>
              <option value="kind">Type</option>
            </select>
            <IconBtn
              name="arrowUp"
              className={pane.sortAsc ? '' : 'rotate-180'}
              title={pane.sortAsc ? 'Ascending' : 'Descending'}
              onClick={() => s().setSort(winId, 'left', pane.sortKey)}
            />
            <IconBtn name="refresh" title="Refresh" onClick={() => s().refresh(winId, 'left')} />
          </>
        }
      />

      <div className="flex-1 overflow-auto" onClick={() => s().setSelected(winId, 'left', [])}>
        {pane.loading && (
          <div className="p-4 text-center text-ghost-muted text-xs">Loading…</div>
        )}
        {pane.error && (
          <div className="m-3 text-xs text-ghost-red bg-ghost-red/10 border border-ghost-red/30 rounded-lg p-3">
            {pane.error}
          </div>
        )}
        {!pane.loading && !pane.error && files.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1 py-10 text-ghost-muted text-xs">
            <Icon name="fileText" size={26} className="opacity-40" />
            <span>No files in this folder</span>
          </div>
        )}

        <ul>
          {files.map((entry) => {
            const ic = entryIcon('file', entry.ext);
            const isSel = selected.includes(entry.name);
            return (
              <li
                key={entry.name}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(entry.name);
                }}
                onDoubleClick={() => openOne(entry)}
                title={entry.name}
                className={`flex items-center gap-2.5 px-3 py-2 cursor-default select-none border-b border-ghost-border/40 transition-colors ${
                  isSel ? 'bg-ghost-accent/20' : 'hover:bg-ghost-card'
                }`}
              >
                <span
                  className={`grid place-items-center w-4 h-4 rounded border shrink-0 ${
                    isSel ? 'bg-ghost-accent border-ghost-accent' : 'border-ghost-dim'
                  }`}
                />
                <span style={{ color: ic.color }} className="shrink-0">
                  <Icon name={ic.name} size={17} />
                </span>
                <span className="flex-1 min-w-0 truncate text-[13px] text-ghost-text">{entry.name}</span>
                <span className="shrink-0 text-[11px] text-ghost-muted tabular-nums">{formatBytes(entry.size)}</span>
                <span className="shrink-0 w-24 text-right text-[11px] text-ghost-muted tabular-nums hidden sm:inline">
                  {entry.mtime ? formatDate(entry.mtime) : '—'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openOne(entry);
                  }}
                  title="Open file"
                  className="shrink-0 p-1 rounded text-ghost-muted hover:text-ghost-text hover:bg-ghost-surface"
                >
                  <Icon name="open" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Selection action bar — move/copy the picked files into a staged folder */}
      {selected.length > 0 && (
        <div className="border-t border-ghost-border bg-ghost-surface/70 px-2 py-2 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="font-medium text-ghost-text">{selected.length} selected</span>
            {selected.length === 1 && (
              <button
                onClick={() => {
                  const entry = files.find((f) => f.name === selected[0]);
                  if (entry) openOne(entry);
                }}
                className="px-2 py-1 rounded-md bg-ghost-card border border-ghost-border text-ghost-text hover:border-ghost-accent/50"
              >
                Open
              </button>
            )}
            <button
              onClick={() => s().deleteSelected(winId, 'left')}
              className="px-2 py-1 rounded-md border border-ghost-red/40 text-ghost-red hover:bg-ghost-red/10"
            >
              Delete
            </button>
            <div className="flex-1" />
            <button
              onClick={() => s().setSelected(winId, 'left', [])}
              className="px-2 py-1 rounded-md text-ghost-muted hover:text-ghost-text"
            >
              Clear
            </button>
          </div>

          {targets.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="inline-flex rounded-md overflow-hidden border border-ghost-border text-[11px] shrink-0">
                <button
                  onClick={() => setCopyMode(false)}
                  className={`px-2 py-1 ${!copyMode ? 'bg-ghost-accent/30 text-ghost-text' : 'text-ghost-muted hover:bg-ghost-card'}`}
                >
                  Move
                </button>
                <button
                  onClick={() => setCopyMode(true)}
                  className={`px-2 py-1 border-l border-ghost-border ${copyMode ? 'bg-ghost-accent/30 text-ghost-text' : 'text-ghost-muted hover:bg-ghost-card'}`}
                >
                  Copy
                </button>
              </div>
              <span className="text-[11px] text-ghost-muted shrink-0">to</span>
              {targets.map(({ ref, idx }) => (
                <button
                  key={idx}
                  onClick={() => s().moveTopSelectionTo(winId, idx, copyMode)}
                  title={`${copyMode ? 'Copy' : 'Move'} selection into ${ref.name}`}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-ghost-card border border-ghost-border text-[11px] text-ghost-text hover:border-ghost-accent/50 active:bg-ghost-surface transition-colors max-w-[160px]"
                >
                  <Icon name="folder" size={12} className="text-ghost-cyan shrink-0" />
                  <span className="truncate">{ref.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-ghost-muted">Stage another folder below to move these files into it.</div>
          )}
        </div>
      )}
    </div>
  );
};

export const StagedFilesPane = React.memo(StagedFilesPaneInner);

// ── Small helpers ──

const PaneHeader: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode }> = ({
  title,
  subtitle,
  right,
}) => (
  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-ghost-border bg-ghost-surface/60 shrink-0">
    <Icon name="fileText" size={15} className="text-ghost-accent shrink-0" />
    <div className="min-w-0">
      <div className="text-[12px] font-medium text-ghost-text truncate leading-tight">{title}</div>
      {subtitle && <div className="text-[10px] text-ghost-muted leading-tight">{subtitle}</div>}
    </div>
    <div className="flex-1" />
    {right}
  </div>
);

const IconBtn: React.FC<{
  name: IconName;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}> = ({ name, title, onClick, disabled, className }) => (
  <button
    title={title}
    disabled={disabled}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={`shrink-0 p-1.5 rounded transition-colors ${
      disabled ? 'text-ghost-dim cursor-not-allowed' : 'text-ghost-muted hover:text-ghost-text hover:bg-ghost-card'
    }`}
  >
    <Icon name={name} size={15} className={className} />
  </button>
);
