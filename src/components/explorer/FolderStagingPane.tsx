import React, { useMemo } from 'react';
import { useExplorer, MAX_STAGED } from '../../store/explorerStore';
import type { DirEntry } from '../../core/fs';
import { Icon } from './Icons';
import type { IconName } from './Icons';

/**
 * Bottom deck of the staging window: a folders-ONLY browser plus a tray of the
 * folders you've staged to work in. Files at the current location are hidden on
 * purpose — this deck is for choosing folders. Tapping a folder stages it (adds
 * it to the tray and loads its files into the top deck); the chevron drills in
 * to browse subfolders.
 */
const FolderStagingPaneInner: React.FC<{ winId: number }> = ({ winId }) => {
  const win = useExplorer((s) => s.windows.find((w) => w.id === winId));
  const roots = useExplorer((s) => s.roots);
  const adapter = useExplorer((s) => s.adapter);
  const s = useExplorer.getState;

  const pane = win?.panes.right;
  const folders = useMemo(
    () =>
      pane
        ? pane.entries
            .filter((e) => e.kind === 'directory')
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        : [],
    [pane],
  );

  if (!win || !pane) return null;

  const staged = win.staged;
  const active = win.activeStaged;
  const hasFolder = pane.stack.length > 0;
  const hiddenFiles = pane.entries.length - folders.length;

  const stagedIdxOf = (entry: DirEntry): number =>
    staged.findIndex((r) =>
      r.uri && entry.uri ? r.uri === entry.uri : r.handle && entry.handle ? r.handle === entry.handle : false,
    );

  const loadHome = () =>
    useExplorer.setState((st) => ({
      windows: st.windows.map((w) =>
        w.id === winId
          ? { ...w, panes: { ...w.panes, right: { ...w.panes.right, stack: [], entries: [], error: null, selected: [] } } }
          : w,
      ),
    }));

  return (
    <div className="flex flex-col h-full bg-ghost-bg border-t border-ghost-border">
      {/* Staged tray */}
      <div className="flex items-center gap-1.5 px-2 py-2 border-b border-ghost-border bg-ghost-surface/50 overflow-x-auto no-scrollbar shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-ghost-muted shrink-0 mr-0.5">Staged</span>
        {staged.length === 0 && (
          <span className="text-[11px] text-ghost-dim shrink-0">Tap a folder below to stage it (up to {MAX_STAGED})</span>
        )}
        {staged.map((ref, idx) => (
          <div
            key={ref.uri ?? ref.name + idx}
            className={`group flex items-center gap-1 pl-2 pr-1 py-1 rounded-full border text-[11px] shrink-0 transition-colors ${
              idx === active
                ? 'bg-ghost-accent/25 border-ghost-accent/60 text-ghost-text'
                : 'bg-ghost-card border-ghost-border text-ghost-muted hover:text-ghost-text'
            }`}
          >
            <button onClick={() => s().activateStaged(winId, idx)} className="flex items-center gap-1 min-w-0">
              <Icon name="folder" size={12} className={idx === active ? 'text-ghost-accent' : 'text-ghost-cyan'} />
              <span className="max-w-[120px] truncate">{ref.name}</span>
            </button>
            <button
              onClick={() => s().unstageFolder(winId, idx)}
              title={`Remove ${ref.name}`}
              className="w-4 h-4 grid place-items-center rounded-full text-ghost-dim hover:bg-ghost-red/70 hover:text-white transition-colors"
            >
              <Icon name="x" size={10} />
            </button>
          </div>
        ))}
      </div>

      {/* Browser toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-ghost-border bg-ghost-surface/40 shrink-0">
        <IconBtn name="arrowUp" title="Up" disabled={pane.stack.length <= 1} onClick={() => s().goUp(winId, 'right')} />
        <IconBtn name="home" title="Locations" onClick={loadHome} />
        <div className="flex-1 min-w-0">
          {hasFolder ? (
            <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar text-[11px]">
              {pane.stack.map((ref, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <Icon name="chevronRight" size={11} className="text-ghost-dim shrink-0" />}
                  <button
                    onClick={() => s().breadcrumbTo(winId, 'right', i)}
                    className={`px-1.5 py-0.5 rounded hover:bg-ghost-card shrink-0 ${
                      i === pane.stack.length - 1 ? 'text-ghost-text font-medium' : 'text-ghost-muted'
                    }`}
                  >
                    {ref.name || '/'}
                  </button>
                </React.Fragment>
              ))}
            </div>
          ) : (
            <span className="text-[11px] text-ghost-muted px-1">Pick a location to browse →</span>
          )}
        </div>
        <IconBtn name="folderPlus" title="New folder" disabled={!hasFolder} onClick={() => s().newFolder(winId, 'right')} />
        <IconBtn name="refresh" title="Refresh" disabled={!hasFolder} onClick={() => s().refresh(winId, 'right')} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {!hasFolder ? (
          <div className="p-3">
            {!adapter.supported() && adapter.backend === 'web' && (
              <div className="mb-3 text-xs text-ghost-orange bg-ghost-orange/10 border border-ghost-orange/30 rounded-lg p-3">
                Direct folder access needs a Chromium browser (Chrome / Edge) — or install the Android app.
              </div>
            )}
            {pane.error && (
              <div className="mb-3 text-xs text-ghost-red bg-ghost-red/10 border border-ghost-red/30 rounded-lg p-3">
                {pane.error}
              </div>
            )}
            <div className="text-[11px] uppercase tracking-wider text-ghost-muted mb-2 px-1">Locations</div>
            <div className="grid grid-cols-2 gap-2">
              {adapter.canPick && (
                <button
                  onClick={() => s().openPicker(winId, 'right')}
                  className="flex items-center gap-2 p-3 rounded-lg bg-ghost-accent/15 border border-ghost-accent/40 text-ghost-text hover:bg-ghost-accent/25 transition-colors"
                >
                  <Icon name="folderOpen" size={20} className="text-ghost-accent" />
                  <span className="text-sm font-medium">Open Folder…</span>
                </button>
              )}
              {roots.map((r) => (
                <button
                  key={r.uri ?? r.name}
                  onClick={() => s().openLocation(winId, 'right', r)}
                  className="flex items-center gap-2 p-3 rounded-lg bg-ghost-card border border-ghost-border text-ghost-text hover:border-ghost-accent/50 hover:bg-ghost-surface transition-colors"
                >
                  <Icon name={(r.icon as IconName) || 'folder'} size={20} className="text-ghost-cyan" />
                  <span className="text-sm truncate">{r.label}</span>
                </button>
              ))}
            </div>
            {roots.length === 0 && !adapter.canPick && (
              <div className="text-xs text-ghost-muted mt-4 px-1">No locations available. Grant storage access and reopen.</div>
            )}
          </div>
        ) : (
          <>
            {pane.loading && <div className="p-4 text-center text-ghost-muted text-xs">Loading…</div>}
            {!pane.loading && folders.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-1 py-10 text-ghost-muted text-xs">
                <Icon name="folder" size={26} className="opacity-40" />
                <span>No subfolders here</span>
                <span className="opacity-70">Use ↑ Up or pick another location</span>
              </div>
            )}
            <ul>
              {folders.map((entry) => {
                const sIdx = stagedIdxOf(entry);
                const isStaged = sIdx >= 0;
                return (
                  <li
                    key={entry.name}
                    className={`flex items-center gap-2 px-3 py-2 border-b border-ghost-border/40 cursor-default select-none transition-colors ${
                      isStaged && sIdx === active ? 'bg-ghost-accent/15' : 'hover:bg-ghost-card'
                    }`}
                  >
                    <button
                      onClick={() => s().stageFolder(winId, entry)}
                      title={isStaged ? `${entry.name} (staged) — tap to view its files` : `Stage ${entry.name}`}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      <Icon name="folder" size={18} className="text-ghost-cyan shrink-0" />
                      <span className="truncate text-[13px] text-ghost-text">{entry.name}</span>
                      {isStaged && (
                        <span className="shrink-0 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-ghost-accent/25 text-ghost-accent border border-ghost-accent/40">
                          staged
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => s().enterDir(winId, 'right', entry)}
                      title="Browse inside"
                      className="shrink-0 p-1.5 rounded text-ghost-muted hover:text-ghost-text hover:bg-ghost-surface"
                    >
                      <Icon name="chevronRight" size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* Status */}
      {hasFolder && (
        <div className="px-3 py-1 border-t border-ghost-border bg-ghost-surface/50 text-[10px] text-ghost-muted shrink-0">
          {folders.length} folder{folders.length === 1 ? '' : 's'}
          {hiddenFiles > 0 ? ` · ${hiddenFiles} file${hiddenFiles === 1 ? '' : 's'} hidden` : ''}
        </div>
      )}
    </div>
  );
};

export const FolderStagingPane = React.memo(FolderStagingPaneInner);

const IconBtn: React.FC<{
  name: IconName;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}> = ({ name, title, onClick, disabled }) => (
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
    <Icon name={name} size={15} />
  </button>
);
