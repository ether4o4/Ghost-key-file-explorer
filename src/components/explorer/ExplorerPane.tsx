import React, { useMemo, useRef, useState } from 'react';
import { useExplorer, setDrag, getDrag, folderKey } from '../../store/explorerStore';
import type { Side, SortKey } from '../../store/explorerStore';
import type { DirEntry } from '../../core/fs';
import { formatBytes, formatDate } from '../../utils/format';
import { Icon, entryIcon } from './Icons';
import type { IconName } from './Icons';
import { IS_TOUCH } from '../../utils/touch';

interface Props {
  winId: number;
  side: Side;
}

interface MenuState {
  x: number;
  y: number;
  entry: DirEntry | null;
}

interface CustomizeState {
  key: string;
  entry: DirEntry;
}

// Palette + icon choices offered in the folder customization popover.
const SWATCHES = ['#6c63ff', '#00d4ff', '#00ff88', '#ffd700', '#ff6b35', '#ff3355', '#e2e8f0', '#64748b'];
const FOLDER_ICONS: IconName[] = ['folder', 'folderOpen', 'drive', 'documents', 'archive', 'image', 'audio', 'video', 'code', 'home'];

function sortEntries(entries: DirEntry[], key: SortKey, asc: boolean): DirEntry[] {
  const dir = asc ? 1 : -1;
  return [...entries].sort((a, b) => {
    // Directories always float to the top regardless of sort direction.
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    let cmp: number;
    if (key === 'size') cmp = a.size - b.size;
    else if (key === 'mtime') cmp = a.mtime - b.mtime;
    else if (key === 'kind') cmp = a.ext.localeCompare(b.ext);
    else cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
    if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
    return cmp * dir;
  });
}

const ExplorerPaneInner: React.FC<Props> = ({ winId, side }) => {
  const pane = useExplorer((s) => s.windows.find((w) => w.id === winId)?.panes[side]);
  const roots = useExplorer((s) => s.roots);
  const adapter = useExplorer((s) => s.adapter);
  const folderPrefs = useExplorer((s) => s.folderPrefs);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [customize, setCustomize] = useState<CustomizeState | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null); // entry name or '#pane'
  const anchorRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const longPress = useRef<{ timer: number; fired: boolean }>({ timer: 0, fired: false });

  const sorted = useMemo(
    () => (pane ? sortEntries(pane.entries, pane.sortKey, pane.sortAsc) : []),
    [pane],
  );

  if (!pane) return null;
  const s = useExplorer.getState;
  const hasFolder = pane.stack.length > 0;
  const otherSide: Side = side === 'left' ? 'right' : 'left';
  const stackNames = pane.stack.map((r) => r.name);

  // Stable per-folder key: native URI when available, else the name-path.
  const keyFor = (entry: DirEntry) => entry.uri ?? folderKey(stackNames, entry.name);

  // Effective icon for an entry, honouring per-folder customization.
  const iconFor = (entry: DirEntry): { name: IconName; color: string } => {
    if (entry.kind === 'directory') {
      const pref = folderPrefs[keyFor(entry)];
      if (pref) return { name: (pref.icon as IconName) ?? 'folder', color: pref.color ?? '#6c63ff' };
    }
    return entryIcon(entry.kind, entry.ext);
  };

  const openCustomize = (entry: DirEntry) => setCustomize({ key: keyFor(entry), entry });

  // ── Selection ──
  const selectAt = (index: number, e: React.MouseEvent) => {
    const names = sorted.map((x) => x.name);
    const name = names[index];
    if (e.shiftKey && anchorRef.current !== null) {
      const [a, b] = [anchorRef.current, index].sort((x, y) => x - y);
      s().setSelected(winId, side, names.slice(a, b + 1));
    } else if (e.ctrlKey || e.metaKey) {
      const cur = new Set(pane.selected);
      if (cur.has(name)) cur.delete(name);
      else cur.add(name);
      s().setSelected(winId, side, [...cur]);
      anchorRef.current = index;
    } else {
      s().setSelected(winId, side, [name]);
      anchorRef.current = index;
    }
  };

  const activate = (entry: DirEntry) => {
    if (entry.kind === 'directory') s().enterDir(winId, side, entry);
    else s().openFile(winId, side, entry);
  };

  // ── Touch interaction (phones / tablets) ──
  // On touch there's no hover, double-click or right-click, so: a tap opens a
  // folder or previews a file; once something is selected (selection mode) a tap
  // instead toggles selection; long-press opens the context menu (which can start
  // a selection). HTML5 drag is off on touch — it doesn't work in the Android
  // WebView and its pointer capture fights scrolling (the old "frozen" feel).
  const toggleSelect = (entry: DirEntry, index: number) => {
    const cur = new Set(pane.selected);
    if (cur.has(entry.name)) cur.delete(entry.name);
    else cur.add(entry.name);
    s().setSelected(winId, side, [...cur]);
    anchorRef.current = index;
  };

  const startLongPress = (entry: DirEntry, e: React.PointerEvent) => {
    if (!IS_TOUCH) return;
    longPress.current.fired = false;
    const x = e.clientX;
    const y = e.clientY;
    longPress.current.timer = window.setTimeout(() => {
      longPress.current.fired = true;
      if (!pane.selected.includes(entry.name)) s().setSelected(winId, side, [entry.name]);
      setMenu({ x, y, entry });
      navigator.vibrate?.(10);
    }, 480);
  };

  const cancelLongPress = () => {
    if (longPress.current.timer) {
      window.clearTimeout(longPress.current.timer);
      longPress.current.timer = 0;
    }
  };

  // Unified entry click. On touch we tap-to-open (and ignore the click that
  // follows a long-press); with a mouse we keep the desktop shift/ctrl select.
  const onEntryClick = (entry: DirEntry, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (IS_TOUCH) {
      if (longPress.current.fired) {
        longPress.current.fired = false;
        return;
      }
      if (pane.selected.length > 0) toggleSelect(entry, index);
      else activate(entry);
      return;
    }
    selectAt(index, e);
  };

  // ── Drag & drop ──
  const onEntryDragStart = (entry: DirEntry, e: React.DragEvent) => {
    setDrag({ winId, side, name: entry.name });
    e.dataTransfer.effectAllowed = 'copyMove';
    try {
      e.dataTransfer.setData('text/plain', entry.name);
    } catch {
      /* some browsers restrict */
    }
  };

  const allowDrop = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
    if (dragOver !== key) setDragOver(key);
  };

  const handleDrop = (e: React.DragEvent, destEntry: DirEntry | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const copy = e.ctrlKey || e.metaKey;
    if (getDrag()) {
      s().internalDrop(winId, side, destEntry, copy);
    } else if (e.dataTransfer.files?.length || e.dataTransfer.items?.length) {
      // External (OS / browser) drop — if onto a folder, dive in first conceptually;
      // for simplicity external imports always land in the current directory.
      s().externalDrop(winId, side, e.dataTransfer);
    }
  };

  // ── Keyboard ──
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Delete' && pane.selected.length) {
      e.preventDefault();
      s().deleteSelected(winId, side);
    } else if (e.key === 'F2' && pane.selected.length === 1) {
      e.preventDefault();
      const entry = sorted.find((x) => x.name === pane.selected[0]);
      if (entry) doRename(entry);
    } else if (e.key === 'Enter' && pane.selected.length === 1) {
      const entry = sorted.find((x) => x.name === pane.selected[0]);
      if (entry) activate(entry);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      s().goUp(winId, side);
    }
  };

  const doRename = async (entry: DirEntry) => {
    const nn = await s().askPrompt({ title: 'Rename', defaultValue: entry.name, confirmText: 'Rename' });
    if (nn && nn.trim()) s().renameEntry(winId, side, entry, nn.trim());
  };

  const transferTo = (entry: DirEntry, mode: 'move' | 'copy') => {
    // Send a specific entry to the other pane's current directory.
    setDrag({ winId, side, name: entry.name });
    s().internalDrop(winId, otherSide, null, mode === 'copy');
  };

  // Role chip — makes the From → To direction obvious at a glance.
  const role =
    side === 'left'
      ? { label: 'FROM', cls: 'text-ghost-cyan border-ghost-cyan/40 bg-ghost-cyan/10' }
      : { label: 'TO', cls: 'text-ghost-green border-ghost-green/40 bg-ghost-green/10' };

  // ── Toolbar ── (rendered via function call, not <Toolbar/>, to avoid remounts)
  const renderToolbar = () => (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-ghost-border bg-ghost-surface/60">
      <span className={`shrink-0 text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded border ${role.cls}`}>
        {role.label}
      </span>
      <IconBtn name="arrowUp" title="Up (Backspace)" disabled={pane.stack.length <= 1} onClick={() => s().goUp(winId, side)} />
      <IconBtn name="refresh" title="Refresh" disabled={!hasFolder} onClick={() => s().refresh(winId, side)} />
      <IconBtn name="home" title="Locations" onClick={loadHome} />
      <div className="flex-1 min-w-0">{renderBreadcrumb()}</div>
      <IconBtn name="folderPlus" title="New folder" disabled={!hasFolder} onClick={() => s().newFolder(winId, side)} />
      <IconBtn name="list" title="List view" active={pane.view === 'list'} onClick={() => s().setView(winId, side, 'list')} />
      <IconBtn name="grid" title="Grid view" active={pane.view === 'grid'} onClick={() => s().setView(winId, side, 'grid')} />
    </div>
  );

  const loadHome = () => {
    // Return the pane to the start (locations) screen.
    s().setSelected(winId, side, []);
    useExplorer.setState((st) => ({
      windows: st.windows.map((w) =>
        w.id === winId
          ? { ...w, panes: { ...w.panes, [side]: { ...w.panes[side], stack: [], entries: [], error: null } } }
          : w,
      ),
    }));
  };

  const renderBreadcrumb = () => {
    if (!hasFolder) return <span className="text-[11px] text-ghost-muted px-1">No folder open</span>;
    return (
      <div className="flex items-center gap-0.5 overflow-x-auto whitespace-nowrap no-scrollbar text-[11px]">
        {pane.stack.map((ref, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Icon name="chevronRight" size={11} className="text-ghost-dim shrink-0" />}
            <button
              onClick={() => s().breadcrumbTo(winId, side, i)}
              onDragOver={(e) => allowDrop(e, `#crumb${i}`)}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                // Drop onto a breadcrumb = move/copy into that ancestor.
                e.preventDefault();
                setDragOver(null);
                const copy = e.ctrlKey || e.metaKey;
                const payload = getDrag();
                if (!payload) return;
                const target = pane.stack[i];
                // Reuse internalDrop by temporarily making target the dest via a synthetic entry.
                const synthetic: DirEntry = {
                  name: target.name,
                  kind: 'directory',
                  size: 0,
                  mtime: 0,
                  ext: '',
                  handle: target.handle,
                  uri: target.uri,
                };
                s().internalDrop(winId, side, synthetic, copy);
              }}
              className={`px-1.5 py-0.5 rounded hover:bg-ghost-card transition-colors shrink-0 ${
                i === pane.stack.length - 1 ? 'text-ghost-text font-medium' : 'text-ghost-muted'
              } ${dragOver === `#crumb${i}` ? 'bg-ghost-accent/20 text-ghost-accent' : ''}`}
            >
              {ref.name || '/'}
            </button>
          </React.Fragment>
        ))}
      </div>
    );
  };

  // ── Start screen (locations) ──
  if (!hasFolder) {
    return (
      <div className="flex flex-col h-full bg-ghost-bg" onContextMenu={(e) => e.preventDefault()}>
        {renderToolbar()}
        <div className="flex-1 overflow-auto p-4">
          {!adapter.supported() && adapter.backend === 'web' && (
            <div className="mb-4 text-xs text-ghost-orange bg-ghost-orange/10 border border-ghost-orange/30 rounded-lg p-3">
              Direct folder access needs a Chromium browser (Chrome / Edge) — or install the Android app.
            </div>
          )}
          {pane.error && (
            <div className="mb-4 text-xs text-ghost-red bg-ghost-red/10 border border-ghost-red/30 rounded-lg p-3">
              {pane.error}
            </div>
          )}
          <div className="text-[11px] uppercase tracking-wider text-ghost-muted mb-2 px-1">Locations</div>
          <div className="grid grid-cols-2 gap-2">
            {adapter.canPick && (
              <button
                onClick={() => s().openPicker(winId, side)}
                className="flex items-center gap-2 p-3 rounded-lg bg-ghost-accent/15 border border-ghost-accent/40 text-ghost-text hover:bg-ghost-accent/25 transition-colors"
              >
                <Icon name="folderOpen" size={20} className="text-ghost-accent" />
                <span className="text-sm font-medium">Open Folder…</span>
              </button>
            )}
            {roots.map((r) => (
              <button
                key={r.uri ?? r.name}
                onClick={() => s().openLocation(winId, side, r)}
                className="flex items-center gap-2 p-3 rounded-lg bg-ghost-card border border-ghost-border text-ghost-text hover:border-ghost-accent/50 hover:bg-ghost-surface transition-colors"
              >
                <Icon name={(r.icon as IconName) || 'folder'} size={20} className="text-ghost-cyan" />
                <span className="text-sm truncate">{r.label}</span>
              </button>
            ))}
          </div>
          {roots.length === 0 && !adapter.canPick && (
            <div className="text-xs text-ghost-muted mt-4 px-1">
              No locations available. Grant storage access and reopen.
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── File listing ──
  const isGrid = pane.view === 'grid';

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex flex-col h-full bg-ghost-bg outline-none"
      onClick={() => s().setSelected(winId, side, [])}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, entry: null });
      }}
    >
      {renderToolbar()}

      <div
        className={`flex-1 overflow-auto relative ${dragOver === '#pane' ? 'drop-zone-active' : ''}`}
        onDragOver={(e) => allowDrop(e, '#pane')}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragOver(null);
        }}
        onDrop={(e) => handleDrop(e, null)}
        style={dragOver === '#pane' ? { outline: '2px dashed #6c63ff', outlineOffset: '-6px' } : undefined}
      >
        {pane.loading && (
          <div className="absolute inset-0 flex items-center justify-center text-ghost-muted text-xs">Loading…</div>
        )}
        {!pane.loading && sorted.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-ghost-muted text-xs gap-1">
            <Icon name="folderOpen" size={28} className="opacity-40" />
            <span>Empty folder</span>
            <span className="opacity-60">Drop files here to add them</span>
          </div>
        )}

        {isGrid ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-1 p-2">
            {sorted.map((entry, i) => {
              const ic = iconFor(entry);
              const selected = pane.selected.includes(entry.name);
              return (
                <div
                  key={entry.name}
                  draggable={!IS_TOUCH}
                  onDragStart={(e) => onEntryDragStart(entry, e)}
                  onDragEnd={() => setDrag(null)}
                  onDragOver={(e) => entry.kind === 'directory' && allowDrop(e, entry.name)}
                  onDragLeave={() => entry.kind === 'directory' && dragOver === entry.name && setDragOver(null)}
                  onDrop={(e) => entry.kind === 'directory' && handleDrop(e, entry)}
                  onPointerDown={(e) => startLongPress(entry, e)}
                  onPointerUp={cancelLongPress}
                  onPointerMove={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onClick={(e) => onEntryClick(entry, i, e)}
                  onDoubleClick={() => activate(entry)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!selected) s().setSelected(winId, side, [entry.name]);
                    setMenu({ x: e.clientX, y: e.clientY, entry });
                  }}
                  title={entry.name}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg cursor-default select-none transition-colors ${
                    selected ? 'bg-ghost-accent/25 ring-1 ring-ghost-accent/50' : 'hover:bg-ghost-card'
                  } ${dragOver === entry.name ? 'bg-ghost-accent/20 ring-1 ring-ghost-accent' : ''}`}
                >
                  {entry.kind === 'file' && adapter.thumb(entry) ? (
                    <img
                      src={adapter.thumb(entry)!}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-9 h-9 object-cover rounded shrink-0 bg-ghost-card"
                      onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
                    />
                  ) : (
                    <span style={{ color: ic.color }} className="shrink-0">
                      <Icon name={ic.name} size={34} />
                    </span>
                  )}
                  <span className="text-[11px] text-center leading-tight text-ghost-text line-clamp-2 break-all w-full">
                    {entry.name}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <table className="w-full table-fixed text-[12px] border-collapse">
            <colgroup>
              <col />
              <col className="w-16" />
              <col className="w-24" />
            </colgroup>
            <thead className="sticky top-0 bg-ghost-surface/95 backdrop-blur z-10">
              <tr className="text-ghost-muted text-[10px] uppercase tracking-wider">
                <Th onClick={() => s().setSort(winId, side, 'name')} active={pane.sortKey === 'name'} asc={pane.sortAsc}>Name</Th>
                <Th onClick={() => s().setSort(winId, side, 'size')} active={pane.sortKey === 'size'} asc={pane.sortAsc} className="text-right">Size</Th>
                <Th onClick={() => s().setSort(winId, side, 'mtime')} active={pane.sortKey === 'mtime'} asc={pane.sortAsc} className="text-right pr-3">Modified</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry, i) => {
                const ic = iconFor(entry);
                const selected = pane.selected.includes(entry.name);
                return (
                  <tr
                    key={entry.name}
                    draggable={!IS_TOUCH}
                    onDragStart={(e) => onEntryDragStart(entry, e)}
                    onDragEnd={() => setDrag(null)}
                    onDragOver={(e) => entry.kind === 'directory' && allowDrop(e, entry.name)}
                    onDragLeave={() => entry.kind === 'directory' && dragOver === entry.name && setDragOver(null)}
                    onDrop={(e) => entry.kind === 'directory' && handleDrop(e, entry)}
                    onPointerDown={(e) => startLongPress(entry, e)}
                    onPointerUp={cancelLongPress}
                    onPointerMove={cancelLongPress}
                    onPointerCancel={cancelLongPress}
                    onClick={(e) => onEntryClick(entry, i, e)}
                    onDoubleClick={() => activate(entry)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!selected) s().setSelected(winId, side, [entry.name]);
                      setMenu({ x: e.clientX, y: e.clientY, entry });
                    }}
                    className={`cursor-default select-none transition-colors ${
                      selected ? 'bg-ghost-accent/25' : 'hover:bg-ghost-card'
                    } ${dragOver === entry.name ? 'bg-ghost-accent/20 ring-1 ring-ghost-accent ring-inset' : ''}`}
                  >
                    <td className="py-1 pl-2 pr-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {entry.kind === 'file' && adapter.thumb(entry) ? (
                          <img
                            src={adapter.thumb(entry)!}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="w-5 h-5 object-cover rounded shrink-0 bg-ghost-card"
                            onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
                          />
                        ) : (
                          <span style={{ color: ic.color }} className="shrink-0">
                            <Icon name={ic.name} size={16} />
                          </span>
                        )}
                        <span className="truncate text-ghost-text">{entry.name}</span>
                      </div>
                    </td>
                    <td className="py-1 text-right text-ghost-muted tabular-nums">
                      {entry.kind === 'file' ? formatBytes(entry.size) : '—'}
                    </td>
                    <td className="py-1 text-right pr-3 text-ghost-muted tabular-nums">
                      {entry.mtime ? formatDate(entry.mtime) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Status bar (also home of the sort control, to keep the toolbar uncluttered) */}
      <div className="flex items-center gap-2 px-2 py-1 border-t border-ghost-border bg-ghost-surface/60 text-[10px] text-ghost-muted">
        <span className="shrink-0">{sorted.length} item{sorted.length === 1 ? '' : 's'}</span>
        {pane.selected.length > 0 && <span className="shrink-0 text-ghost-accent">{pane.selected.length} selected</span>}
        <span className="flex-1" />
        <span className="shrink-0">Sort</span>
        <select
          value={pane.sortKey}
          onChange={(e) => s().setSort(winId, side, e.target.value as SortKey)}
          title="Sort by"
          className="shrink-0 bg-ghost-card border border-ghost-border rounded text-[10px] text-ghost-text px-1 py-0.5 outline-none focus:border-ghost-accent"
        >
          <option value="name">Name</option>
          <option value="size">Size</option>
          <option value="mtime">Modified</option>
          <option value="kind">Type</option>
        </select>
        <button
          title={pane.sortAsc ? 'Ascending' : 'Descending'}
          onClick={(e) => {
            e.stopPropagation();
            s().setSort(winId, side, pane.sortKey);
          }}
          className="shrink-0 px-1 py-0.5 rounded hover:bg-ghost-card text-ghost-muted hover:text-ghost-text transition-colors"
        >
          {pane.sortAsc ? '↑' : '↓'}
        </button>
      </div>

      {/* Context menu */}
      {menu && (
        <ContextMenu
          menu={menu}
          close={() => setMenu(null)}
          onOpen={() => menu.entry && activate(menu.entry)}
          onRename={() => menu.entry && doRename(menu.entry)}
          onDelete={() => s().deleteSelected(winId, side)}
          onNewFolder={() => s().newFolder(winId, side)}
          onRefresh={() => s().refresh(winId, side)}
          onCopyOther={() => menu.entry && transferTo(menu.entry, 'copy')}
          onMoveOther={() => menu.entry && transferTo(menu.entry, 'move')}
          onCustomize={menu.entry && menu.entry.kind === 'directory' ? () => openCustomize(menu.entry!) : undefined}
        />
      )}

      {/* Folder customization popover */}
      {customize && (
        <CustomizePopover
          state={customize}
          pref={folderPrefs[customize.key] ?? {}}
          close={() => setCustomize(null)}
          onColor={(color) => s().setFolderPref(customize.key, { color })}
          onIcon={(icon) => s().setFolderPref(customize.key, { icon })}
          onReset={() => {
            s().resetFolderPref(customize.key);
            setCustomize(null);
          }}
        />
      )}
    </div>
  );
};

/** Memoized so window drag/resize (which re-renders the window shell) doesn't
 *  re-render the panes — they only update when their own slice changes. */
export const ExplorerPane = React.memo(ExplorerPaneInner);

// ── Small helpers ──

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

const Th: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  asc: boolean;
  className?: string;
}> = ({ children, onClick, active, asc, className }) => (
  <th
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={`text-left font-medium py-1.5 px-2 cursor-pointer hover:text-ghost-text ${className ?? ''} ${
      active ? 'text-ghost-accent' : ''
    }`}
  >
    {children}
    {active && <span className="ml-1">{asc ? '↑' : '↓'}</span>}
  </th>
);

const ContextMenu: React.FC<{
  menu: MenuState;
  close: () => void;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onNewFolder: () => void;
  onRefresh: () => void;
  onCopyOther: () => void;
  onMoveOther: () => void;
  onCustomize?: () => void;
}> = ({ menu, close, onOpen, onRename, onDelete, onNewFolder, onRefresh, onCopyOther, onMoveOther, onCustomize }) => {
  const hasEntry = !!menu.entry;
  const item = (label: string, icon: IconName, fn: () => void, danger?: boolean) => (
    <button
      onClick={() => {
        fn();
        close();
      }}
      className={`flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left hover:bg-ghost-card transition-colors ${
        danger ? 'text-ghost-red' : 'text-ghost-text'
      }`}
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  );
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
      <div
        className="fixed z-50 min-w-[180px] py-1 rounded-lg border border-ghost-border bg-ghost-surface shadow-2xl glass animate-fade-in"
        style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 300) }}
      >
        {hasEntry && item('Open', 'open', onOpen)}
        {hasEntry && item('Rename', 'pencil', onRename)}
        {onCustomize && item('Customize…', 'grid', onCustomize)}
        {hasEntry && item('Copy → other pane', 'copy', onCopyOther)}
        {hasEntry && item('Move → other pane', 'move', onMoveOther)}
        {hasEntry && <div className="my-1 h-px bg-ghost-border" />}
        {item('New folder', 'folderPlus', onNewFolder)}
        {item('Refresh', 'refresh', onRefresh)}
        {hasEntry && <div className="my-1 h-px bg-ghost-border" />}
        {hasEntry && item('Delete', 'trash', onDelete, true)}
      </div>
    </>
  );
};

const CustomizePopover: React.FC<{
  state: CustomizeState;
  pref: { color?: string; icon?: string };
  close: () => void;
  onColor: (color: string) => void;
  onIcon: (icon: string) => void;
  onReset: () => void;
}> = ({ state, pref, close, onColor, onIcon, onReset }) => {
  const activeColor = pref.color ?? '#6c63ff';
  const activeIcon = (pref.icon as IconName) ?? 'folder';
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[280px] rounded-xl border border-ghost-border bg-ghost-surface shadow-2xl glass animate-fade-in p-4">
        <div className="flex items-center gap-2 mb-3">
          <span style={{ color: activeColor }}>
            <Icon name={activeIcon} size={22} />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-ghost-text truncate">{state.entry.name}</div>
            <div className="text-[10px] text-ghost-muted">Customize folder</div>
          </div>
        </div>

        <div className="text-[10px] uppercase tracking-wider text-ghost-muted mb-1.5">Color</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {SWATCHES.map((c) => (
            <button
              key={c}
              onClick={() => onColor(c)}
              title={c}
              style={{ background: c }}
              className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
                activeColor === c ? 'ring-2 ring-offset-2 ring-offset-ghost-surface ring-white' : ''
              }`}
            />
          ))}
        </div>

        <div className="text-[10px] uppercase tracking-wider text-ghost-muted mb-1.5">Icon</div>
        <div className="grid grid-cols-5 gap-1.5 mb-3">
          {FOLDER_ICONS.map((name) => (
            <button
              key={name}
              onClick={() => onIcon(name)}
              title={name}
              style={{ color: activeColor }}
              className={`flex items-center justify-center h-9 rounded-lg border transition-colors ${
                activeIcon === name ? 'border-ghost-accent bg-ghost-accent/15' : 'border-ghost-border hover:bg-ghost-card'
              }`}
            >
              <Icon name={name} size={18} />
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between pt-1">
          <button onClick={onReset} className="text-[12px] text-ghost-muted hover:text-ghost-red transition-colors">
            Reset
          </button>
          <button
            onClick={close}
            className="px-3 py-1.5 rounded-lg bg-ghost-accent/20 border border-ghost-accent/40 text-[12px] text-ghost-text hover:bg-ghost-accent/30 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
};
