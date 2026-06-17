import React, { useMemo, useState } from 'react';
import {
  useExplorer,
  MAX_STAGED,
  TAG_AXES,
  emptyTags,
  tagsAreEmpty,
  folderKey,
} from '../../store/explorerStore';
import type { DirEntry } from '../../core/fs';
import type { FolderTags, TagAxis } from '../../store/explorerStore';
import { Icon } from './Icons';
import type { IconName } from './Icons';
import { TagPrompt } from './TagPrompt';
import { AXIS_META } from './tagMeta';

/**
 * Bottom deck: a folders-ONLY browser plus the staged-folders tray. Staging a
 * folder is how you FILE it — tapping a folder opens the who/what/when/where
 * prompt (skippable), then loads its files up top. Folders carry their tags
 * independently of their name; the filter bar and name search separate them.
 */

type PromptState = { entry: DirEntry; key: string; mode: 'stage' | 'edit' };
type MenuState = { entry: DirEntry; x: number; y: number };

const FolderStagingPaneInner: React.FC<{ winId: number }> = ({ winId }) => {
  const win = useExplorer((s) => s.windows.find((w) => w.id === winId));
  const roots = useExplorer((s) => s.roots);
  const adapter = useExplorer((s) => s.adapter);
  const folderTags = useExplorer((s) => s.folderTags);
  const s = useExplorer.getState;

  const pane = win?.panes.right;
  const stackNames = useMemo(() => (pane ? pane.stack.map((r) => r.name) : []), [pane]);
  const folders = useMemo(
    () =>
      pane
        ? pane.entries
            .filter((e) => e.kind === 'directory')
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        : [],
    [pane],
  );

  const vocab = useMemo(() => {
    const v = emptyTags();
    for (const t of Object.values(folderTags)) {
      for (const axis of TAG_AXES) {
        for (const val of t[axis]) {
          if (!v[axis].some((x) => x.toLowerCase() === val.toLowerCase())) v[axis].push(val);
        }
      }
    }
    for (const axis of TAG_AXES) v[axis].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return v;
  }, [folderTags]);

  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<FolderTags>(emptyTags);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  if (!win || !pane) return null;

  const staged = win.staged;
  const active = win.activeStaged;
  const hasFolder = pane.stack.length > 0;
  const hiddenFiles = pane.entries.length - folders.length;
  const filterActive = !tagsAreEmpty(filter);
  const nameQ = search.trim().toLowerCase();

  const tagKeyOf = (entry: DirEntry) => entry.uri ?? folderKey(stackNames, entry.name);
  const tagsOf = (entry: DirEntry): FolderTags | undefined => folderTags[tagKeyOf(entry)];

  const stagedIdxOf = (entry: DirEntry): number =>
    staged.findIndex((r) =>
      r.uri && entry.uri ? r.uri === entry.uri : r.handle && entry.handle ? r.handle === entry.handle : false,
    );

  const matchesFilter = (entry: DirEntry): boolean => {
    if (!filterActive) return true;
    const t = tagsOf(entry);
    return TAG_AXES.every((axis) => {
      if (filter[axis].length === 0) return true;
      if (!t) return false;
      return filter[axis].some((fv) => t[axis].some((tv) => tv.toLowerCase() === fv.toLowerCase()));
    });
  };
  const visibleFolders = folders.filter((e) => matchesFilter(e) && (!nameQ || e.name.toLowerCase().includes(nameQ)));
  const narrowed = filterActive || !!nameQ;

  const toggleFilter = (axis: TagAxis, value: string) =>
    setFilter((f) => ({
      ...f,
      [axis]: f[axis].includes(value) ? f[axis].filter((v) => v !== value) : [...f[axis], value],
    }));

  const loadHome = () =>
    useExplorer.setState((st) => ({
      windows: st.windows.map((w) =>
        w.id === winId
          ? { ...w, panes: { ...w.panes, right: { ...w.panes.right, stack: [], entries: [], error: null, selected: [] } } }
          : w,
      ),
    }));

  const openStagePrompt = (entry: DirEntry) => setPrompt({ entry, key: tagKeyOf(entry), mode: 'stage' });
  const openEditPrompt = (entry: DirEntry) => setPrompt({ entry, key: tagKeyOf(entry), mode: 'edit' });

  const handleSave = (tags: FolderTags) => {
    if (!prompt) return;
    s().setFolderTags(prompt.key, tags);
    if (prompt.mode === 'stage') s().stageFolder(winId, prompt.entry);
    setPrompt(null);
  };
  const handleSkip = () => {
    if (!prompt) return;
    if (prompt.mode === 'stage') s().stageFolder(winId, prompt.entry);
    setPrompt(null);
  };

  const renameFolder = (entry: DirEntry) => {
    const nn = window.prompt('Rename folder', entry.name);
    if (nn && nn.trim() && nn.trim() !== entry.name) s().renameEntry(winId, 'right', entry, nn.trim());
  };

  return (
    <div className="flex flex-col h-full bg-ghost-bg border-t border-ghost-border">
      {/* Staged tray */}
      <div className="flex items-center gap-1.5 px-2 py-2 border-b border-ghost-border bg-ghost-surface/50 overflow-x-auto no-scrollbar shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-ghost-muted shrink-0 mr-0.5">Staged</span>
        {staged.length === 0 && (
          <span className="text-[11px] text-ghost-dim shrink-0">Tap a folder below to file &amp; stage it (up to {MAX_STAGED})</span>
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
        <button
          onClick={() => {
            setSearchOpen((o) => !o);
            if (searchOpen) setSearch('');
          }}
          title="Search folders"
          className={`shrink-0 p-1.5 rounded transition-colors ${
            searchOpen || nameQ ? 'text-ghost-accent bg-ghost-accent/15' : 'text-ghost-muted hover:text-ghost-text hover:bg-ghost-card'
          }`}
        >
          <Icon name="search" size={15} />
        </button>
        <button
          onClick={() => setFilterOpen((o) => !o)}
          title="Filter by tags"
          className={`shrink-0 p-1.5 rounded transition-colors ${
            filterActive || filterOpen ? 'text-ghost-accent bg-ghost-accent/15' : 'text-ghost-muted hover:text-ghost-text hover:bg-ghost-card'
          }`}
        >
          <Icon name="filter" size={15} />
        </button>
        <IconBtn name="folderPlus" title="New folder" disabled={!hasFolder} onClick={() => s().newFolder(winId, 'right')} />
        <IconBtn name="refresh" title="Refresh" disabled={!hasFolder} onClick={() => s().refresh(winId, 'right')} />
      </div>

      {searchOpen && (
        <div className="px-2 py-1.5 border-b border-ghost-border bg-ghost-surface/30 shrink-0">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search folders by name…"
            className="w-full bg-ghost-card border border-ghost-border rounded-lg px-2.5 py-1.5 text-[12px] text-ghost-text outline-none focus:border-ghost-accent"
          />
        </div>
      )}

      {/* Filter bar */}
      {filterOpen && (
        <div className="px-2 py-2 border-b border-ghost-border bg-ghost-bg/70 flex flex-col gap-1.5 shrink-0 max-h-[40%] overflow-y-auto">
          {TAG_AXES.every((axis) => vocab[axis].length === 0) ? (
            <div className="text-[11px] text-ghost-muted px-1">No tags yet — stage a folder to start filing.</div>
          ) : (
            TAG_AXES.map((axis) =>
              vocab[axis].length === 0 ? null : (
                <div key={axis} className="flex items-start gap-2">
                  <span className="text-[10px] uppercase tracking-wide mt-1 w-9 shrink-0" style={{ color: AXIS_META[axis].color }}>
                    {AXIS_META[axis].label}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {vocab[axis].map((v) => {
                      const on = filter[axis].includes(v);
                      return (
                        <button
                          key={v}
                          onClick={() => toggleFilter(axis, v)}
                          className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                            on ? 'text-ghost-text' : 'border-ghost-border text-ghost-muted hover:text-ghost-text'
                          }`}
                          style={on ? { borderColor: AXIS_META[axis].color, background: `${AXIS_META[axis].color}22` } : undefined}
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ),
            )
          )}
          {filterActive && (
            <button onClick={() => setFilter(emptyTags())} className="self-start text-[11px] text-ghost-muted hover:text-ghost-text mt-0.5">
              Clear filters
            </button>
          )}
        </div>
      )}

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
              <div className="mb-3 text-xs text-ghost-red bg-ghost-red/10 border border-ghost-red/30 rounded-lg p-3">{pane.error}</div>
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
            {!pane.loading && folders.length > 0 && visibleFolders.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-1 py-10 text-ghost-muted text-xs">
                <Icon name={nameQ ? 'search' : 'filter'} size={24} className="opacity-40" />
                <span>No folders match</span>
              </div>
            )}
            <ul>
              {visibleFolders.map((entry) => {
                const sIdx = stagedIdxOf(entry);
                const isStaged = sIdx >= 0;
                const tags = tagsOf(entry);
                return (
                  <li
                    key={entry.name}
                    className={`flex items-start gap-1 px-3 py-2 border-b border-ghost-border/40 cursor-default select-none transition-colors ${
                      isStaged && sIdx === active ? 'bg-ghost-accent/15' : 'hover:bg-ghost-card'
                    }`}
                  >
                    <button
                      onClick={() => openStagePrompt(entry)}
                      title={isStaged ? `${entry.name} (staged) — tap to view its files` : `File & stage ${entry.name}`}
                      className="flex flex-col gap-1 flex-1 min-w-0 text-left pt-0.5"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Icon name="folder" size={18} className="text-ghost-cyan shrink-0" />
                        <span className="truncate text-[13px] text-ghost-text">{entry.name}</span>
                        {isStaged && (
                          <span className="shrink-0 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-ghost-accent/25 text-ghost-accent border border-ghost-accent/40">
                            staged
                          </span>
                        )}
                      </span>
                      {tags && !tagsAreEmpty(tags) && <TagChips tags={tags} />}
                    </button>
                    <button
                      onClick={() => openEditPrompt(entry)}
                      title="Edit tags"
                      className={`shrink-0 p-1.5 rounded hover:bg-ghost-surface ${
                        tags && !tagsAreEmpty(tags) ? 'text-ghost-accent' : 'text-ghost-muted hover:text-ghost-text'
                      }`}
                    >
                      <Icon name="tag" size={15} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenu({ entry, x: e.clientX, y: e.clientY });
                      }}
                      title="More"
                      className="shrink-0 p-1.5 rounded text-ghost-muted hover:text-ghost-text hover:bg-ghost-surface"
                    >
                      <Icon name="more" size={15} />
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
          {narrowed ? `${visibleFolders.length} of ${folders.length}` : folders.length} folder
          {folders.length === 1 ? '' : 's'}
          {hiddenFiles > 0 ? ` · ${hiddenFiles} file${hiddenFiles === 1 ? '' : 's'} hidden` : ''}
        </div>
      )}

      {/* Per-folder action menu */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div
            className="fixed z-50 min-w-[170px] py-1 rounded-lg border border-ghost-border bg-ghost-surface shadow-2xl glass animate-fade-in"
            style={{ left: Math.min(menu.x, window.innerWidth - 190), top: Math.min(menu.y, window.innerHeight - 170) }}
          >
            <MenuItem icon="folderOpen" label="Open / stage" onClick={() => { openStagePrompt(menu.entry); setMenu(null); }} />
            <MenuItem icon="chevronRight" label="Browse inside" onClick={() => { s().enterDir(winId, 'right', menu.entry); setMenu(null); }} />
            <MenuItem icon="tag" label="Edit tags" onClick={() => { openEditPrompt(menu.entry); setMenu(null); }} />
            <MenuItem icon="pencil" label="Rename" onClick={() => { const en = menu.entry; setMenu(null); renameFolder(en); }} />
            <div className="my-1 h-px bg-ghost-border" />
            <MenuItem icon="trash" label="Delete" danger onClick={() => { const en = menu.entry; setMenu(null); s().deleteEntry(winId, 'right', en); }} />
          </div>
        </>
      )}

      {prompt && (
        <TagPrompt
          title={prompt.entry.name}
          initial={folderTags[prompt.key] ?? emptyTags()}
          vocab={vocab}
          saveLabel={prompt.mode === 'stage' ? 'Save & open' : 'Save'}
          skipLabel={prompt.mode === 'stage' ? 'Skip' : 'Cancel'}
          onSave={handleSave}
          onSkip={handleSkip}
        />
      )}
    </div>
  );
};

export const FolderStagingPane = React.memo(FolderStagingPaneInner);

/** Compact, colour-coded row of a folder's who/what/when/where tags. */
const TagChips: React.FC<{ tags: FolderTags }> = ({ tags }) => (
  <span className="flex flex-wrap gap-1">
    {TAG_AXES.flatMap((axis) =>
      tags[axis].map((v) => (
        <span
          key={`${axis}:${v}`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] leading-none text-ghost-muted bg-ghost-card/70"
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: AXIS_META[axis].color }} />
          {v}
        </span>
      )),
    )}
  </span>
);

const MenuItem: React.FC<{ icon: IconName; label: string; onClick: () => void; danger?: boolean }> = ({ icon, label, onClick, danger }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 w-full px-3 py-2 text-[12px] text-left hover:bg-ghost-card transition-colors ${
      danger ? 'text-ghost-red' : 'text-ghost-text'
    }`}
  >
    <Icon name={icon} size={14} />
    {label}
  </button>
);

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
