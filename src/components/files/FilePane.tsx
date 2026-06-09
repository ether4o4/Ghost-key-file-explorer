import React, { useMemo, useRef } from 'react';
import clsx from 'clsx';
import {
  ArrowLeftRight, ArrowUp, Brain, CheckSquare, Copy, Download, FilePlus2,
  Folder, FolderInput, FolderPlus, Grid3X3, HardDrive, Home, Inbox, KeyRound,
  List, Lock, MoreHorizontal, PanelRightClose, RefreshCw, Search, Shield,
  Trash2, Upload, X
} from 'lucide-react';
import { db, type GKFile } from '../../core/db';
import { useGKStore } from '../../store';
import { Button, Spinner } from '../common/UI';
import { SKUBadge } from '../sku/SKU';
import { TagGroup } from '../tags/Tags';
import { getFileIcon } from './FileCard';
import { formatBytes, formatDate } from '../../utils/format';
import { listNativeDocuments, requestNativeFileAccess } from '../../utils/nativeFiles';

type ExplorerSide = 'left' | 'right';
type LocationKind = 'all' | 'source' | 'category' | 'vault' | 'limbo';

interface ExplorerLocation {
  id: string;
  label: string;
  path: string;
  icon: React.ReactNode;
  kind: LocationKind;
  source?: string;
  exts?: string[];
}

const LOCATIONS: ExplorerLocation[] = [
  { id: 'all', label: 'All Files', path: 'NeverSoft:/', icon: <HardDrive size={14} />, kind: 'all' },
  { id: 'inbox', label: 'Inbox', path: 'NeverSoft:/Inbox', icon: <Inbox size={14} />, kind: 'source', source: 'Inbox' },
  { id: 'downloads', label: 'Downloads', path: 'NeverSoft:/Downloads', icon: <Download size={14} />, kind: 'source', source: 'Downloads' },
  { id: 'desktop', label: 'Desktop', path: 'NeverSoft:/Desktop', icon: <Home size={14} />, kind: 'source', source: 'Desktop' },
  { id: 'android-docs', label: 'Android Docs', path: 'Android:/Documents', icon: <FolderInput size={14} />, kind: 'source', source: 'Android Documents' },
  { id: 'images', label: 'Images', path: 'NeverSoft:/Media/Images', icon: <Folder size={14} />, kind: 'category', exts: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic'] },
  { id: 'documents', label: 'Documents', path: 'NeverSoft:/Documents', icon: <Folder size={14} />, kind: 'category', exts: ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf'] },
  { id: 'code', label: 'Code', path: 'NeverSoft:/Code', icon: <Folder size={14} />, kind: 'category', exts: ['js', 'ts', 'tsx', 'jsx', 'py', 'json', 'html', 'css'] },
  { id: 'vault', label: 'Vault', path: 'NeverSoft:/Vault', icon: <Lock size={14} />, kind: 'vault' },
  { id: 'limbo', label: 'Limbo', path: 'NeverSoft:/Limbo', icon: <Shield size={14} />, kind: 'limbo' },
];

const SORTERS = [
  { id: 'name', label: 'Name' },
  { id: 'modified', label: 'Modified' },
  { id: 'size', label: 'Size' },
] as const;

type SortKey = typeof SORTERS[number]['id'];

function locationFor(id: string) {
  return LOCATIONS.find(location => location.id === id) ?? LOCATIONS[0];
}

function fileBelongsTo(file: GKFile, location: ExplorerLocation) {
  if (location.kind === 'all') return true;
  if (location.kind === 'source') {
    return file.source.toLowerCase().includes((location.source ?? location.label).toLowerCase());
  }
  if (location.kind === 'category') return location.exts?.includes(file.ext.toLowerCase()) ?? false;
  if (location.kind === 'vault') return Boolean(file.vaultId || file.isEncrypted);
  if (location.kind === 'limbo') return Boolean(file.limboId);
  return true;
}

function sortFiles(files: GKFile[], sortKey: SortKey) {
  const list = [...files];
  if (sortKey === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
  if (sortKey === 'modified') list.sort((a, b) => b.modifiedAt - a.modifiedAt);
  if (sortKey === 'size') list.sort((a, b) => b.size - a.size);
  return list;
}

const ExplorerButton: React.FC<{
  title: string;
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}> = ({ title, active, children, onClick }) => (
  <button
    title={title}
    onClick={onClick}
    className={clsx(
      'grid h-7 w-7 place-items-center rounded-md border text-[12px] transition-colors',
      active
        ? 'border-ghost-cyan/50 bg-ghost-cyan/15 text-ghost-cyan'
        : 'border-ghost-border bg-ghost-surface text-ghost-muted hover:border-ghost-accent/50 hover:text-ghost-text'
    )}
  >
    {children}
  </button>
);

const LocationList: React.FC<{
  currentId: string;
  onChoose: (id: string) => void;
  files: GKFile[];
}> = ({ currentId, onChoose, files }) => (
  <div className="w-48 shrink-0 border-r border-ghost-border bg-[#0c0e12]">
    <div className="flex h-10 items-center gap-2 border-b border-ghost-border px-3">
      <KeyRound size={15} className="text-ghost-cyan" />
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-ghost-text">Ghost Key</div>
        <div className="text-[9px] text-ghost-muted">local file space</div>
      </div>
    </div>
    <div className="p-2">
      {LOCATIONS.map(location => {
        const count = files.filter(file => fileBelongsTo(file, location)).length;
        return (
          <button
            key={location.id}
            onClick={() => onChoose(location.id)}
            className={clsx(
              'mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
              currentId === location.id
                ? 'bg-ghost-accent/15 text-ghost-text'
                : 'text-ghost-muted hover:bg-ghost-card hover:text-ghost-text'
            )}
          >
            <span className={currentId === location.id ? 'text-ghost-accent' : 'text-ghost-dim'}>{location.icon}</span>
            <span className="flex-1 truncate">{location.label}</span>
            <span className="font-mono text-[9px] text-ghost-dim">{count}</span>
          </button>
        );
      })}
    </div>
  </div>
);

const PathBar: React.FC<{
  location: ExplorerLocation;
  side: ExplorerSide;
  active: boolean;
  onFocus: () => void;
}> = ({ location, side, active, onFocus }) => (
  <button
    onClick={onFocus}
    className={clsx(
      'flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border px-2 text-left font-mono text-[11px]',
      active ? 'border-ghost-cyan/50 bg-ghost-cyan/10 text-ghost-text' : 'border-ghost-border bg-ghost-bg text-ghost-muted'
    )}
  >
    <span className="text-ghost-dim">{side.toUpperCase()}</span>
    <span className="truncate">{location.path}</span>
  </button>
);

const FileTable: React.FC<{
  files: GKFile[];
  activeFileId: number | null;
  selectedIds: number[];
  activeDragIds: number[];
  onSelect: (file: GKFile, additive: boolean) => void;
  onOpen: (file: GKFile) => void;
  onDragStart: (file: GKFile) => void;
}> = ({ files, activeFileId, selectedIds, activeDragIds, onSelect, onOpen, onDragStart }) => (
  <div className="min-w-[440px]">
    <div className="grid grid-cols-[26px_minmax(160px,1fr)_64px_58px_76px_86px] items-center border-b border-ghost-border bg-[#0d1015] px-2 py-1.5 text-[9px] uppercase tracking-wide text-ghost-dim">
      <span />
      <span>Name</span>
      <span>Size</span>
      <span>Type</span>
      <span>Modified</span>
      <span>Smart Tags</span>
    </div>
    {files.map(file => {
      const id = file.id!;
      const selected = selectedIds.includes(id);
      const active = activeFileId === id;
      return (
        <div
          key={id}
          draggable
          onDragStart={() => onDragStart(file)}
          onClick={(event) => onSelect(file, event.ctrlKey || event.metaKey || event.shiftKey)}
          onDoubleClick={() => onOpen(file)}
          className={clsx(
            'grid grid-cols-[26px_minmax(160px,1fr)_64px_58px_76px_86px] items-center px-2 py-1.5 text-xs outline-none transition-colors',
            'border-b border-transparent hover:bg-ghost-card/70',
            selected && 'bg-ghost-accent/12 text-ghost-text',
            active && 'ring-1 ring-inset ring-ghost-cyan/40',
            activeDragIds.includes(id) && 'opacity-45'
          )}
        >
          <span className="text-ghost-muted">{getFileIcon(file.ext, file.mimeType, 15)}</span>
          <span className="min-w-0">
            <span className="block truncate text-ghost-text">{file.name}</span>
            <span className="block truncate font-mono text-[9px] text-ghost-dim">{file.sku}</span>
          </span>
          <span className="truncate font-mono text-[10px] text-ghost-muted">{formatBytes(file.size)}</span>
          <span className="truncate text-[10px] uppercase text-ghost-muted">{file.ext || 'file'}</span>
          <span className="text-[10px] text-ghost-muted">{formatDate(file.modifiedAt)}</span>
          <span className="min-w-0 overflow-hidden">
            <TagGroup tags={file.tags.slice(0, 2)} max={2} size="xs" />
          </span>
        </div>
      );
    })}
  </div>
);

const ExplorerPane: React.FC<{
  side: ExplorerSide;
  files: GKFile[];
  locationId: string;
  activeSide: ExplorerSide;
  activeFileId: number | null;
  selectedIds: number[];
  sortKey: SortKey;
  query: string;
  activeDragIds: number[];
  draggingOver: boolean;
  onLocationChange: (id: string) => void;
  onFocus: () => void;
  onSortChange: (key: SortKey) => void;
  onQueryChange: (query: string) => void;
  onSelect: (file: GKFile, additive: boolean) => void;
  onOpen: (file: GKFile) => void;
  onDragStart: (file: GKFile) => void;
  onDrop: () => void;
  onDragOver: (active: boolean) => void;
}> = ({
  side, files, locationId, activeSide, activeFileId, selectedIds, sortKey, query,
  activeDragIds, draggingOver, onLocationChange, onFocus, onSortChange, onQueryChange,
  onSelect, onOpen, onDragStart, onDrop, onDragOver
}) => {
  const location = locationFor(locationId);
  const shownFiles = useMemo(() => {
    const filtered = files.filter(file => {
      if (!fileBelongsTo(file, location)) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        file.name.toLowerCase().includes(q) ||
        file.source.toLowerCase().includes(q) ||
        file.sku.toLowerCase().includes(q) ||
        file.tags.some(tag => tag.value.toLowerCase().includes(q))
      );
    });
    return sortFiles(filtered, sortKey);
  }, [files, location, query, sortKey]);

  return (
    <section
      onClick={onFocus}
      onDragEnter={(event) => { event.preventDefault(); onDragOver(true); }}
      onDragOver={(event) => { event.preventDefault(); onDragOver(true); }}
      onDragLeave={() => onDragOver(false)}
      onDrop={(event) => { event.preventDefault(); onDrop(); }}
      className={clsx(
        'flex min-w-0 flex-1 flex-col border bg-[#0f1218]',
        activeSide === side ? 'border-ghost-cyan/40' : 'border-ghost-border',
        draggingOver && 'border-ghost-green bg-ghost-green/5'
      )}
    >
      <div className="flex items-center gap-1 border-b border-ghost-border p-2">
        <ExplorerButton title="Back"><ArrowLeftRight size={13} /></ExplorerButton>
        <ExplorerButton title="Parent folder"><ArrowUp size={13} /></ExplorerButton>
        <ExplorerButton title="Refresh"><RefreshCw size={13} /></ExplorerButton>
        <PathBar location={location} side={side} active={activeSide === side} onFocus={onFocus} />
        <select
          value={locationId}
          onChange={(event) => onLocationChange(event.target.value)}
          className="h-8 rounded-md border border-ghost-border bg-ghost-bg px-2 text-xs text-ghost-text outline-none"
        >
          {LOCATIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-2 border-b border-ghost-border bg-[#0c0e12] px-2 py-1.5">
        <div className="flex h-7 flex-1 items-center gap-2 rounded-md border border-ghost-border bg-ghost-bg px-2">
          <Search size={13} className="text-ghost-dim" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Filter this pane"
            className="min-w-0 flex-1 bg-transparent text-xs text-ghost-text outline-none placeholder:text-ghost-dim"
          />
        </div>
        {SORTERS.map(sorter => (
          <button
            key={sorter.id}
            onClick={() => onSortChange(sorter.id)}
            className={clsx(
              'h-7 rounded-md px-2 text-[10px] transition-colors',
              sortKey === sorter.id ? 'bg-ghost-accent/20 text-ghost-accent' : 'text-ghost-muted hover:bg-ghost-card hover:text-ghost-text'
            )}
          >
            {sorter.label}
          </button>
        ))}
      </div>

      <div className="relative flex-1 overflow-auto">
        {shownFiles.length > 0 ? (
          <FileTable
            files={shownFiles}
            activeFileId={activeFileId}
            selectedIds={selectedIds}
            activeDragIds={activeDragIds}
            onSelect={onSelect}
            onOpen={onOpen}
            onDragStart={onDragStart}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <FolderInput size={34} className={draggingOver ? 'text-ghost-green' : 'text-ghost-dim'} />
            <div className="text-sm font-medium text-ghost-muted">
              {draggingOver ? 'Release files into this pane' : 'No files in this location'}
            </div>
            <div className="text-[10px] text-ghost-dim">Drop desktop files here or switch folder</div>
          </div>
        )}
        {draggingOver && (
          <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-md border border-dashed border-ghost-green bg-ghost-green/10">
            <div className="rounded-md bg-[#07110d] px-4 py-2 text-xs font-semibold text-ghost-green shadow-xl">
              Release to {location.label}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

const FileDetail: React.FC<{ file: GKFile | null; onClose: () => void }> = ({ file, onClose }) => {
  if (!file) return null;

  return (
    <aside className="w-72 shrink-0 border-l border-ghost-border bg-[#0c0e12]">
      <div className="flex h-10 items-center justify-between border-b border-ghost-border px-3">
        <span className="truncate text-xs font-semibold text-ghost-text">Properties</span>
        <button onClick={onClose} className="text-ghost-muted hover:text-ghost-text"><PanelRightClose size={15} /></button>
      </div>
      <div className="space-y-4 p-3">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-md border border-ghost-border bg-ghost-card text-ghost-cyan">
            {getFileIcon(file.ext, file.mimeType, 24)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ghost-text">{file.name}</div>
            <div className="mt-1"><SKUBadge sku={file.sku} size="xs" /></div>
          </div>
        </div>
        {file.dataUrl && <img src={file.dataUrl} alt={file.name} className="max-h-36 w-full rounded-md object-cover" />}
        <div className="space-y-1.5 text-[11px]">
          {[
            ['Source', file.source],
            ['Size', formatBytes(file.size)],
            ['Type', file.mimeType || file.ext || 'file'],
            ['Modified', formatDate(file.modifiedAt)],
            ['Imported', formatDate(file.importedAt)],
          ].map(([label, value]) => (
            <div key={label} className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
              <span className="text-ghost-muted">{label}</span>
              <span className="truncate text-ghost-text">{value}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-2 text-[9px] uppercase tracking-wide text-ghost-dim">Tags</div>
          <TagGroup tags={file.tags} max={10} size="xs" />
        </div>
        {file.content && (
          <div>
            <div className="mb-2 text-[9px] uppercase tracking-wide text-ghost-dim">Preview</div>
            <pre className="max-h-40 overflow-auto rounded-md border border-ghost-border bg-ghost-bg p-2 text-[10px] text-ghost-green/80">
              {file.content.slice(0, 700)}
            </pre>
          </div>
        )}
      </div>
    </aside>
  );
};

export const FilePane: React.FC = () => {
  const {
    files, selectedFileIds, viewMode, toggleFileSelection, clearSelection, selectAllFiles,
    setViewMode, importFiles, openFile, createBundle, openLimbo, setActivePanel,
    setShowVaultModal, pinFile, deleteFile, magnetizeFile, analyzeFileAction, loadFiles, notify,
  } = useGKStore();

  const [leftLocation, setLeftLocation] = React.useState('all');
  const [rightLocation, setRightLocation] = React.useState('desktop');
  const [activeSide, setActiveSide] = React.useState<ExplorerSide>('left');
  const [activeFile, setActiveFile] = React.useState<GKFile | null>(null);
  const [leftQuery, setLeftQuery] = React.useState('');
  const [rightQuery, setRightQuery] = React.useState('');
  const [leftSort, setLeftSort] = React.useState<SortKey>('modified');
  const [rightSort, setRightSort] = React.useState<SortKey>('name');
  const [dragIds, setDragIds] = React.useState<number[]>([]);
  const [dropSide, setDropSide] = React.useState<ExplorerSide | null>(null);
  const [operation, setOperation] = React.useState('Ready');
  const [importing, setImporting] = React.useState(false);
  const [nativePermission, setNativePermission] = React.useState('not requested');
  const [nativeFiles, setNativeFiles] = React.useState<GKFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allFiles = useMemo(() => [...files, ...nativeFiles], [files, nativeFiles]);

  const selectedFiles = useMemo(
    () => allFiles.filter(file => file.id && selectedFileIds.includes(file.id)),
    [allFiles, selectedFileIds]
  );

  const activeLocationId = activeSide === 'left' ? leftLocation : rightLocation;
  const activeLocation = locationFor(activeLocationId);

  const handleSelect = (file: GKFile, additive: boolean) => {
    setActiveFile(file);
    if (!file.id) return;
    if (file.id < 0) return;
    if (additive) toggleFileSelection(file.id);
    else {
      clearSelection();
      setTimeout(() => toggleFileSelection(file.id!), 0);
    }
  };

  const handleOpen = async (file: GKFile) => {
    setActiveFile(file);
    if (file.id && file.id < 0) {
      setOperation(`Native file selected: ${file.name}`);
      return;
    }
    await openFile(file.id!);
  };

  const refreshNativeFiles = async () => {
    const access = await requestNativeFileAccess();
    setNativePermission(access.publicStorage ?? (access.available ? 'granted' : 'denied'));
    if (!access.available) {
      setOperation('Android file permission was not granted');
      return;
    }

    const entries = await listNativeDocuments();
    const mapped: GKFile[] = entries.map((entry, index) => {
      const ext = entry.name.includes('.') ? entry.name.split('.').pop() ?? '' : '';
      return {
        id: -1 - index,
        sku: `ANDROID-${String(index + 1).padStart(4, '0')}`,
        name: entry.name,
        ext,
        size: entry.size,
        mimeType: entry.type === 'directory' ? 'inode/directory' : '',
        tags: [{ dimension: 'where', value: 'Android Documents', confidence: 1 }],
        skuLinks: [],
        bundleIds: [],
        source: 'Android Documents',
        path: entry.uri,
        createdAt: entry.mtime,
        modifiedAt: entry.mtime,
        importedAt: Date.now(),
        isFlagged: false,
        isPinned: false,
      };
    });
    setNativeFiles(mapped);
    setOperation(`Android Documents refreshed: ${mapped.length} item(s)`);
  };

  const handleFileInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;
    setImporting(true);
    await importFiles(event.target.files, activeLocation.kind === 'source' ? activeLocation.label : 'Inbox');
    setImporting(false);
    setOperation(`Imported ${event.target.files.length} item(s)`);
    event.target.value = '';
  };

  const handleDesktopDrop = async (event: React.DragEvent) => {
    if (!event.dataTransfer.files.length) return false;
    const target = dropSide === 'right' ? locationFor(rightLocation) : locationFor(leftLocation);
    setImporting(true);
    await importFiles(event.dataTransfer.files, target.kind === 'source' ? target.label : 'Inbox');
    setImporting(false);
    setOperation(`Imported ${event.dataTransfer.files.length} item(s) to ${target.label}`);
    return true;
  };

  const handlePaneDrop = async (side: ExplorerSide, event?: React.DragEvent) => {
    if (event && await handleDesktopDrop(event)) {
      setDropSide(null);
      return;
    }

    const target = locationFor(side === 'left' ? leftLocation : rightLocation);
    if (!dragIds.length) {
      setDropSide(null);
      return;
    }

    if (target.kind === 'source') {
      await Promise.all(dragIds.map(id => db.files.update(id, { source: target.label, modifiedAt: Date.now() })));
      await loadFiles();
      setOperation(`Released ${dragIds.length} item(s) to ${target.path}`);
      notify(`Released to ${target.label}`, 'success');
    } else {
      setOperation(`Selected ${dragIds.length} item(s) for ${target.label}`);
      notify(`${target.label} is a smart view; files were selected there`, 'info');
    }

    setDropSide(null);
    setDragIds([]);
  };

  const handleDragStart = (file: GKFile) => {
    const id = file.id!;
    setDragIds(selectedFileIds.includes(id) ? selectedFileIds : [id]);
    setActiveFile(file);
  };

  const handleBundle = async () => {
    if (!selectedFileIds.length) return;
    const name = prompt('Bundle name:', `Bundle ${new Date().toLocaleDateString()}`) ?? 'New Bundle';
    await createBundle(name, selectedFileIds);
    setOperation(`Bundled ${selectedFileIds.length} item(s)`);
    clearSelection();
  };

  const handleLimbo = async () => {
    if (!selectedFileIds.length) return;
    const name = prompt('Limbo session name:', 'Inspection Session') ?? 'Inspection Session';
    await openLimbo(name, selectedFileIds);
    setActivePanel('limbo');
    setOperation(`Opened Limbo with ${selectedFileIds.length} item(s)`);
    clearSelection();
  };

  const handleDelete = async () => {
    if (!selectedFileIds.length || !confirm(`Delete ${selectedFileIds.length} item(s)?`)) return;
    for (const id of selectedFileIds) await deleteFile(id);
    setOperation(`Deleted ${selectedFileIds.length} item(s)`);
    clearSelection();
  };

  const handleAnalyze = async () => {
    if (!selectedFileIds.length) return;
    for (const id of selectedFileIds.slice(0, 5)) await analyzeFileAction(id);
    setOperation(`Analyzed ${Math.min(selectedFileIds.length, 5)} item(s)`);
  };

  const handlePin = async () => {
    for (const id of selectedFileIds) await pinFile(id, true);
    setOperation(`Pinned ${selectedFileIds.length} item(s)`);
    clearSelection();
  };

  const handleMagnetize = async () => {
    for (const id of selectedFileIds) await magnetizeFile(id);
    setOperation(`Magnetized ${selectedFileIds.length} item(s)`);
    clearSelection();
  };

  return (
    <div className="flex h-full min-w-[1180px] flex-col bg-ghost-bg text-ghost-text">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-ghost-border bg-[#090b0f] px-3">
        <div className="flex items-center gap-2 pr-2">
          <div className="grid h-8 w-8 place-items-center rounded-md border border-ghost-cyan/30 bg-ghost-cyan/10 text-ghost-cyan">
            <KeyRound size={17} />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">NeverSoft Services File Explorer</div>
            <div className="text-[9px] text-ghost-muted">dual-pane release workspace</div>
          </div>
        </div>

        <div className="mx-2 hidden h-7 flex-1 items-center gap-2 rounded-md border border-ghost-border bg-ghost-bg px-2 lg:flex">
          <Search size={13} className="text-ghost-dim" />
          <input
            value={activeSide === 'left' ? leftQuery : rightQuery}
            onChange={(event) => activeSide === 'left' ? setLeftQuery(event.target.value) : setRightQuery(event.target.value)}
            placeholder={`Search ${activeLocation.path}`}
            className="min-w-0 flex-1 bg-transparent text-xs text-ghost-text outline-none placeholder:text-ghost-dim"
          />
        </div>

        <div className="ml-auto flex items-center gap-1">
          {importing && <Spinner size={14} />}
          <ExplorerButton title="List view" active={viewMode === 'list'} onClick={() => setViewMode('list')}><List size={13} /></ExplorerButton>
          <ExplorerButton title="Grid view" active={viewMode === 'grid'} onClick={() => setViewMode('grid')}><Grid3X3 size={13} /></ExplorerButton>
          <ExplorerButton title="Select all" onClick={selectAllFiles}><CheckSquare size={13} /></ExplorerButton>
          <ExplorerButton title="Refresh" onClick={() => loadFiles()}><RefreshCw size={13} /></ExplorerButton>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileInput} />
          <Button size="xs" variant="primary" icon={<Upload size={12} />} onClick={() => fileInputRef.current?.click()}>Import</Button>
          <Button size="xs" variant="secondary" icon={<FolderInput size={12} />} onClick={refreshNativeFiles}>Android Files</Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <LocationList
          currentId={activeSide === 'left' ? leftLocation : rightLocation}
          onChoose={(id) => activeSide === 'left' ? setLeftLocation(id) : setRightLocation(id)}
          files={allFiles}
        />

        <main className="flex min-w-0 flex-1 flex-col p-2">
          <div className="mb-2 flex items-center gap-1 overflow-x-auto">
            <Button size="xs" variant="secondary" icon={<Copy size={11} />} disabled={!selectedFileIds.length} onClick={() => setOperation(`Copied ${selectedFileIds.length} item(s)`)}>
              Copy
            </Button>
            <Button size="xs" variant="secondary" icon={<ArrowLeftRight size={11} />} disabled={!selectedFileIds.length} onClick={() => setOperation(`Queued ${selectedFileIds.length} item(s) for release`)}>
              Release
            </Button>
            <Button size="xs" variant="secondary" icon={<FolderPlus size={11} />} disabled={!selectedFileIds.length} onClick={handleBundle}>
              Bundle
            </Button>
            <Button size="xs" variant="secondary" icon={<Lock size={11} />} disabled={!selectedFileIds.length} onClick={() => setShowVaultModal(true)}>
              Vault
            </Button>
            <Button size="xs" variant="secondary" icon={<Brain size={11} />} disabled={!selectedFileIds.length} onClick={handleAnalyze}>
              Analyze
            </Button>
            <Button size="xs" variant="secondary" icon={<FilePlus2 size={11} />} disabled={!selectedFileIds.length} onClick={handleLimbo}>
              Limbo
            </Button>
            <Button size="xs" variant="ghost" icon={<Folder size={11} />} disabled={!selectedFileIds.length} onClick={handlePin}>
              Pin
            </Button>
            <Button size="xs" variant="ghost" icon={<MoreHorizontal size={11} />} disabled={!selectedFileIds.length} onClick={handleMagnetize}>
              Magnetize
            </Button>
            <Button size="xs" variant="danger" icon={<Trash2 size={11} />} disabled={!selectedFileIds.length} onClick={handleDelete}>
              Delete
            </Button>
            {selectedFileIds.length > 0 && (
              <button onClick={clearSelection} className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ghost-muted hover:bg-ghost-card hover:text-ghost-text">
                <X size={12} /> Clear {selectedFileIds.length}
              </button>
            )}
          </div>

          <div className="flex min-h-0 flex-1 gap-2">
            <ExplorerPane
              side="left"
              files={allFiles}
              locationId={leftLocation}
              activeSide={activeSide}
              activeFileId={activeFile?.id ?? null}
              selectedIds={selectedFileIds}
              sortKey={leftSort}
              query={leftQuery}
              activeDragIds={dragIds}
              draggingOver={dropSide === 'left'}
              onLocationChange={setLeftLocation}
              onFocus={() => setActiveSide('left')}
              onSortChange={setLeftSort}
              onQueryChange={setLeftQuery}
              onSelect={handleSelect}
              onOpen={handleOpen}
              onDragStart={handleDragStart}
              onDragOver={(active) => setDropSide(active ? 'left' : null)}
              onDrop={() => handlePaneDrop('left')}
            />

            <div className="flex w-10 shrink-0 flex-col items-center justify-center gap-2 border-y border-ghost-border bg-[#0b0d11]">
              <ExplorerButton title="Release left to right" onClick={() => setDropSide('right')}><ArrowLeftRight size={15} /></ExplorerButton>
              <div className="h-24 border-l border-dashed border-ghost-border" />
              <div className="rotate-90 whitespace-nowrap font-mono text-[9px] uppercase tracking-wider text-ghost-dim">drag release</div>
            </div>

            <ExplorerPane
              side="right"
              files={allFiles}
              locationId={rightLocation}
              activeSide={activeSide}
              activeFileId={activeFile?.id ?? null}
              selectedIds={selectedFileIds}
              sortKey={rightSort}
              query={rightQuery}
              activeDragIds={dragIds}
              draggingOver={dropSide === 'right'}
              onLocationChange={setRightLocation}
              onFocus={() => setActiveSide('right')}
              onSortChange={setRightSort}
              onQueryChange={setRightQuery}
              onSelect={handleSelect}
              onOpen={handleOpen}
              onDragStart={handleDragStart}
              onDragOver={(active) => setDropSide(active ? 'right' : null)}
              onDrop={() => handlePaneDrop('right')}
            />
          </div>
        </main>

        <FileDetail file={activeFile} onClose={() => setActiveFile(null)} />
      </div>

      <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-ghost-border bg-[#090b0f] px-3 font-mono text-[10px] text-ghost-muted">
        <span>{files.length} files indexed</span>
        <span>{selectedFiles.length} selected</span>
        <span>android permission: {nativePermission}</span>
        <span className="text-ghost-dim">active: {activeLocation.path}</span>
        <span className="ml-auto text-ghost-green">{operation}</span>
      </footer>
    </div>
  );
};
