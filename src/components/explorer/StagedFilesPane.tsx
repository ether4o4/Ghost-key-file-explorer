import React, { useMemo, useState } from 'react';
import { useExplorer } from '../../store/explorerStore';
import type { SortKey } from '../../store/explorerStore';
import type { DirEntry } from '../../core/fs';
import { formatBytes, formatDate } from '../../utils/format';
import { Icon, entryIcon } from './Icons';
import type { IconName } from './Icons';

/**
 * Top deck = the CONTENTS view. It stays blank until you click a folder below,
 * then shows whatever's in that folder — files AND subfolders. Tap a subfolder
 * to drill in; Back/Forward/Up walk the navigation history. Files are
 * tap-to-(multi)select with rename / delete / open / move-copy to a staged folder.
 */
function sortEntries(entries: DirEntry[], key: SortKey, asc: boolean): DirEntry[] {
  const dir = asc ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1; // folders first
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
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const pane = win?.panes.left;
  const entries = useMemo(
    () => (pane ? sortEntries(pane.entries, pane.sortKey, pane.sortAsc) : []),
    [pane],
  );

  if (!win || !pane) return null;

  const hasFolder = pane.stack.length > 0;
  const selected = pane.selected;
  const curRef = hasFolder ? pane.stack[pane.stack.length - 1] : undefined;
  const canBack = win.topIndex > 0;
  const canForward = win.topIndex < win.topHistory.length - 1;

  const isCur = (ref: { uri?: string; handle?: unknown }) =>
    !!curRef && (ref.uri && curRef.uri ? ref.uri === curRef.uri : ref.handle && curRef.handle ? ref.handle === curRef.handle : false);
  const targets = win.staged.map((ref, idx) => ({ ref, idx })).filter(({ ref }) => !isCur(ref));

  const q = search.trim().toLowerCase();
  const shown = q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries;
  const shownFiles = shown.filter((e) => e.kind === 'file');

  const toggle = (name: string) => {
    const cur = new Set(selected);
    if (cur.has(name)) cur.delete(name);
    else cur.add(name);
    s().setSelected(winId, 'left', [...cur]);
  };

  const openFile = (entry: DirEntry) => s().openFile(winId, 'left', entry);

  const renameOne = () => {
    const entry = entries.find((f) => f.name === selected[0]);
    if (!entry) return;
    const nn = window.prompt('Rename', entry.name);
    if (nn && nn.trim() && nn.trim() !== entry.name) s().renameEntry(winId, 'left', entry, nn.trim());
  };

  // ── Blank state: nothing opened yet ──
  if (!hasFolder) {
    return (
      <div className="flex flex-col h-full bg-ghost-bg">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-ghost-border bg-ghost-surface/60 shrink-0">
          <Icon name="fileText" size={15} className="text-ghost-accent shrink-0" />
          <span className="text-[12px] font-medium text-ghost-text">Contents</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 px-6 text-ghost-muted">
          <Icon name="folderOpen" size={34} className="opacity-40" />
          <div className="text-sm text-ghost-text">Click a folder below</div>
          <div className="text-xs max-w-[260px]">Its contents — files and subfolders — show up here. Tap a subfolder to drill in.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-ghost-bg">
      {/* Header: nav + breadcrumb + tools */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-ghost-border bg-ghost-surface/60 shrink-0">
        <IconBtn name="chevronLeft" title="Back" disabled={!canBack} onClick={() => s().topBack(winId)} />
        <IconBtn name="chevronRight" title="Forward" disabled={!canForward} onClick={() => s().topForward(winId)} />
        <IconBtn name="arrowUp" title="Up" disabled={pane.stack.length <= 1} onClick={() => s().topUp(winId)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar text-[11px]">
            {pane.stack.map((ref, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Icon name="chevronRight" size={11} className="text-ghost-dim shrink-0" />}
                <button
                  onClick={() => s().topBreadcrumb(winId, i)}
                  className={`px-1.5 py-0.5 rounded hover:bg-ghost-card shrink-0 ${
                    i === pane.stack.length - 1 ? 'text-ghost-text font-medium' : 'text-ghost-muted'
                  }`}
                >
                  {ref.name || '/'}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>
        <IconBtn name="search" title="Search" active={searchOpen || !!q} onClick={() => { setSearchOpen((o) => !o); if (searchOpen) setSearch(''); }} />
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
        <IconBtn name="refresh" title="Refresh" onClick={() => s().refresh(winId, 'left')} />
      </div>

      {searchOpen && (
        <div className="px-2 py-1.5 border-b border-ghost-border bg-ghost-surface/40 shrink-0">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this folder…"
            className="w-full bg-ghost-card border border-ghost-border rounded-lg px-2.5 py-1.5 text-[12px] text-ghost-text outline-none focus:border-ghost-accent"
          />
        </div>
      )}

      <div className="flex-1 overflow-auto" onClick={() => s().setSelected(winId, 'left', [])}>
        {pane.loading && <div className="p-4 text-center text-ghost-muted text-xs">Loading…</div>}
        {pane.error && (
          <div className="m-3 text-xs text-ghost-red bg-ghost-red/10 border border-ghost-red/30 rounded-lg p-3">{pane.error}</div>
        )}
        {!pane.loading && !pane.error && shown.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1 py-10 text-ghost-muted text-xs">
            <Icon name={q ? 'search' : 'folderOpen'} size={26} className="opacity-40" />
            <span>{q ? 'Nothing matches' : 'Empty folder'}</span>
          </div>
        )}

        <ul>
          {shown.map((entry) => {
            if (entry.kind === 'directory') {
              return (
                <li
                  key={entry.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    s().drillTop(winId, entry);
                  }}
                  title={`Open ${entry.name}`}
                  className="flex items-center gap-2.5 px-3 py-2 cursor-default select-none border-b border-ghost-border/40 hover:bg-ghost-card transition-colors"
                >
                  <span className="w-4 shrink-0" />
                  <Icon name="folder" size={17} className="text-ghost-cyan shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-[13px] text-ghost-text">{entry.name}</span>
                  <Icon name="chevronRight" size={15} className="text-ghost-dim shrink-0" />
                </li>
              );
            }
            const ic = entryIcon('file', entry.ext);
            const isSel = selected.includes(entry.name);
            return (
              <li
                key={entry.name}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(entry.name);
                }}
                onDoubleClick={() => openFile(entry)}
                title={entry.name}
                className={`flex items-center gap-2.5 px-3 py-2 cursor-default select-none border-b border-ghost-border/40 transition-colors ${
                  isSel ? 'bg-ghost-accent/20' : 'hover:bg-ghost-card'
                }`}
              >
                <span className={`grid place-items-center w-4 h-4 rounded border shrink-0 ${isSel ? 'bg-ghost-accent border-ghost-accent' : 'border-ghost-dim'}`} />
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
                    openFile(entry);
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

      {/* Selection action bar (files) */}
      {selected.length > 0 && (
        <div className="border-t border-ghost-border bg-ghost-surface/70 px-2 py-2 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
            <span className="font-medium text-ghost-text">{selected.length} selected</span>
            <button
              onClick={() => s().setSelected(winId, 'left', shownFiles.map((f) => f.name))}
              className="px-2 py-1 rounded-md bg-ghost-card border border-ghost-border text-ghost-text hover:border-ghost-accent/50"
            >
              All
            </button>
            {selected.length === 1 && (
              <>
                <button
                  onClick={() => {
                    const entry = entries.find((f) => f.name === selected[0]);
                    if (entry) openFile(entry);
                  }}
                  className="px-2 py-1 rounded-md bg-ghost-card border border-ghost-border text-ghost-text hover:border-ghost-accent/50"
                >
                  Open
                </button>
                <button onClick={renameOne} className="px-2 py-1 rounded-md bg-ghost-card border border-ghost-border text-ghost-text hover:border-ghost-accent/50">
                  Rename
                </button>
              </>
            )}
            <button
              onClick={() => s().deleteSelected(winId, 'left')}
              className="px-2 py-1 rounded-md border border-ghost-red/40 text-ghost-red hover:bg-ghost-red/10"
            >
              Delete
            </button>
            <div className="flex-1" />
            <button onClick={() => s().setSelected(winId, 'left', [])} className="px-2 py-1 rounded-md text-ghost-muted hover:text-ghost-text">
              Clear
            </button>
          </div>

          {targets.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="inline-flex rounded-md overflow-hidden border border-ghost-border text-[11px] shrink-0">
                <button onClick={() => setCopyMode(false)} className={`px-2 py-1 ${!copyMode ? 'bg-ghost-accent/30 text-ghost-text' : 'text-ghost-muted hover:bg-ghost-card'}`}>
                  Move
                </button>
                <button onClick={() => setCopyMode(true)} className={`px-2 py-1 border-l border-ghost-border ${copyMode ? 'bg-ghost-accent/30 text-ghost-text' : 'text-ghost-muted hover:bg-ghost-card'}`}>
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
          )}
        </div>
      )}
    </div>
  );
};

export const StagedFilesPane = React.memo(StagedFilesPaneInner);

const IconBtn: React.FC<{
  name: IconName;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}> = ({ name, title, onClick, disabled, active, className }) => (
  <button
    title={title}
    disabled={disabled}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={`shrink-0 p-1.5 rounded transition-colors ${
      disabled
        ? 'text-ghost-dim cursor-not-allowed'
        : active
          ? 'text-ghost-accent bg-ghost-accent/15'
          : 'text-ghost-muted hover:text-ghost-text hover:bg-ghost-card'
    }`}
  >
    <Icon name={name} size={15} className={className} />
  </button>
);
