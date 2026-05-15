import React, { useRef } from 'react';
import {
  Grid3X3, List, Upload, Trash2, FolderPlus,
  Lock, FlaskConical, Pin, X, RefreshCw, Link, Brain
} from 'lucide-react';
import { useGKStore } from '../../store';
import { FileCard, FileRow } from './FileCard';
import { Button, EmptyState, Spinner } from '../common/UI';
import { SearchBar } from '../search/SearchBar';
import type { GKFile } from '../../core/db';

// ─── Drop Zone ────────────────────────────────────────────────────────────────

const DropZone: React.FC<{ onFiles: (files: FileList) => void }> = ({ onFiles }) => {
  const [dragging, setDragging] = React.useState(false);
  const counterRef = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    counterRef.current++;
    setDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    counterRef.current--;
    if (counterRef.current === 0) setDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    counterRef.current = 0;
    setDragging(false);
    if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-150 ${
        dragging ? 'drop-zone-active' : 'border-ghost-border/50'
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Upload size={32} className={`mx-auto mb-3 ${dragging ? 'text-ghost-accent' : 'text-ghost-muted opacity-40'}`} />
      <p className={`text-sm font-medium ${dragging ? 'text-ghost-accent' : 'text-ghost-muted'}`}>
        {dragging ? 'Drop to import' : 'Drop files here or click to browse'}
      </p>
      <p className="text-[10px] text-ghost-dim mt-1">
        Auto-tagged with who / what / when / where
      </p>
    </div>
  );
};

// ─── Action Toolbar ───────────────────────────────────────────────────────────

const ActionToolbar: React.FC<{
  selectedCount: number;
  onDeselect: () => void;
  onCreateBundle: () => void;
  onSendToLimbo: () => void;
  onSendToVault: () => void;
  onPin: () => void;
  onAnalyze: () => void;
  onDelete: () => void;
  onMagnetize: () => void;
}> = ({ selectedCount, onDeselect, onCreateBundle, onSendToLimbo, onSendToVault, onPin, onAnalyze, onDelete, onMagnetize }) => (
  <div className="flex items-center gap-2 px-3 py-2 bg-ghost-accent/10 border border-ghost-accent/20 rounded-lg">
    <span className="text-xs font-medium text-ghost-accent">{selectedCount} selected</span>
    <div className="flex items-center gap-1 ml-auto">
      <Button size="xs" variant="ghost" icon={<FolderPlus size={11} />} onClick={onCreateBundle} title="Create Bundle">Bundle</Button>
      <Button size="xs" variant="ghost" icon={<FlaskConical size={11} />} onClick={onSendToLimbo} title="Send to Limbo">Limbo</Button>
      <Button size="xs" variant="ghost" icon={<Lock size={11} />} onClick={onSendToVault} title="Add to Vault">Vault</Button>
      <Button size="xs" variant="ghost" icon={<Pin size={11} />} onClick={onPin} title="Pin">Pin</Button>
      <Button size="xs" variant="ghost" icon={<Brain size={11} />} onClick={onAnalyze} title="Analyze">Analyze</Button>
      <Button size="xs" variant="ghost" icon={<Link size={11} />} onClick={onMagnetize} title="Auto-link">Magnetize</Button>
      <Button size="xs" variant="danger" icon={<Trash2 size={11} />} onClick={onDelete}>Delete</Button>
      <button onClick={onDeselect} className="text-ghost-muted hover:text-ghost-text ml-1"><X size={14} /></button>
    </div>
  </div>
);

// ─── File Detail Panel ────────────────────────────────────────────────────────

const FileDetail: React.FC<{ file: GKFile; onClose: () => void }> = ({ file, onClose }) => {
  const { updateFileTags, analyzeFileAction, files: _files, magnetizeFile, setActivePanel } = useGKStore();
  const [tags, setTags] = React.useState(file.tags);
  const [analyzing, setAnalyzing] = React.useState(false);

  React.useEffect(() => { setTags(file.tags); }, [file]);

  const handleSaveTags = async () => {
    await updateFileTags(file.id!, tags);
  };
  void handleSaveTags; // available for future use

  const handleAnalyze = async () => {
    setAnalyzing(true);
    await analyzeFileAction(file.id!);
    setAnalyzing(false);
    setActivePanel('analysis');
  };

  return (
    <div className="border-l border-ghost-border bg-ghost-surface h-full overflow-y-auto w-64 shrink-0">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-ghost-border">
        <span className="text-xs font-medium text-ghost-text truncate">{file.name}</span>
        <button onClick={onClose} className="text-ghost-muted hover:text-ghost-text shrink-0"><X size={14} /></button>
      </div>
      <div className="p-3 space-y-4">
        {/* Preview */}
        {file.dataUrl && (
          <img src={file.dataUrl} alt={file.name} className="w-full rounded-lg object-cover max-h-32" />
        )}

        {/* Meta */}
        <div className="space-y-1 text-[10px]">
          {[
            ['SKU', file.sku],
            ['Source', file.source],
            ['Size', `${(file.size / 1024).toFixed(1)} KB`],
            ['Type', file.mimeType || file.ext],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-ghost-muted w-12 shrink-0">{k}</span>
              <span className="text-ghost-text font-mono text-[9px] truncate">{v}</span>
            </div>
          ))}
        </div>

        {/* Tags */}
        <div>
          <div className="text-[9px] text-ghost-muted uppercase tracking-wider mb-2">Tags</div>
          <div className="space-y-2">
            {(['who', 'what', 'when', 'where'] as const).map(dim => {
              const dimTags = tags.filter(t => t.dimension === dim);
              return (
                <div key={dim} className="text-[9px]">
                  <span className="text-ghost-muted capitalize">{dim}: </span>
                  <span className="text-ghost-text">{dimTags.map(t => t.value).join(', ') || '—'}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-1.5">
          <Button size="xs" variant="primary" className="w-full justify-center" icon={<Brain size={11} />} onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? 'Analyzing…' : 'Analyze'}
          </Button>
          <Button size="xs" variant="secondary" className="w-full justify-center" icon={<Link size={11} />} onClick={() => magnetizeFile(file.id!)}>
            Magnetize
          </Button>
        </div>

        {/* Content preview */}
        {file.content && (
          <div>
            <div className="text-[9px] text-ghost-muted uppercase tracking-wider mb-1.5">Content Preview</div>
            <div className="bg-ghost-bg border border-ghost-border rounded p-2 text-[9px] font-mono text-ghost-green/80 max-h-32 overflow-y-auto whitespace-pre-wrap">
              {file.content.slice(0, 500)}
              {file.content.length > 500 && '…'}
            </div>
          </div>
        )}

        {/* Linked SKUs */}
        {file.skuLinks.length > 0 && (
          <div>
            <div className="text-[9px] text-ghost-muted uppercase tracking-wider mb-1.5">Linked SKUs</div>
            <div className="flex flex-wrap gap-1">
              {file.skuLinks.map(s => (
                <span key={s} className="sku-badge text-[8px] px-1 py-0.5 rounded" style={{ background: 'rgba(108,99,255,0.12)', color: '#6c63ff', border: '1px solid rgba(108,99,255,0.3)' }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── File Pane (Right Pane) ───────────────────────────────────────────────────

export const FilePane: React.FC = () => {
  const {
    files, searchQuery, searchResults, isSearching,
    selectedFileIds, viewMode, activeBundleId, bundles,
    toggleFileSelection, clearSelection,
    setViewMode, openFile, importFiles,
    createBundle, openLimbo, setShowVaultModal,
    pinFile, setShowAnalysisPanel, deleteFile, magnetizeFile,
    setActivePanel, notify,
  } = useGKStore();

  const [activeFile, setActiveFile] = React.useState<GKFile | null>(null);
  const [importing, setImporting] = React.useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine which files to show
  const displayFiles = React.useMemo(() => {
    let result = searchQuery.trim() ? searchResults : files;
    if (activeBundleId) {
      const bundle = bundles.find(b => b.id === activeBundleId);
      if (bundle) result = result.filter(f => bundle.fileIds.includes(f.id!));
    }
    return result;
  }, [files, searchResults, searchQuery, activeBundleId, bundles]);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setImporting(true);
    await importFiles(e.target.files, 'Manual Import');
    setImporting(false);
    e.target.value = '';
  };

  const handleDrop = async (files: FileList) => {
    setImporting(true);
    await importFiles(files, 'Drag & Drop');
    setImporting(false);
  };

  const handleCreateBundle = async () => {
    if (!selectedFileIds.length) return;
    const name = prompt('Bundle name:') ?? 'New Bundle';
    await createBundle(name, selectedFileIds);
    clearSelection();
  };

  const handleSendToLimbo = async () => {
    if (!selectedFileIds.length) return;
    const name = prompt('Limbo session name:') ?? 'Inspection Session';
    await openLimbo(name, selectedFileIds);
    clearSelection();
    setActivePanel('limbo');
  };

  const handleSendToVault = () => {
    if (!selectedFileIds.length) return;
    setShowVaultModal(true);
  };

  const handlePinSelected = async () => {
    for (const id of selectedFileIds) await pinFile(id, true);
    clearSelection();
    notify(`${selectedFileIds.length} file(s) pinned`, 'success');
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`Delete ${selectedFileIds.length} file(s)?`)) return;
    for (const id of selectedFileIds) await deleteFile(id);
    clearSelection();
  };

  const handleMagnetizeSelected = async () => {
    for (const id of selectedFileIds) await magnetizeFile(id);
    clearSelection();
  };

  const handleFileOpen = (file: GKFile) => {
    openFile(file.id!);
    setActiveFile(file);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top toolbar */}
      <div className="px-4 py-3 border-b border-ghost-border shrink-0 space-y-2">
        <SearchBar />
        <div className="flex items-center gap-2">
          <div className="text-xs text-ghost-muted">
            {displayFiles.length} file{displayFiles.length !== 1 ? 's' : ''}
            {activeBundleId && <span className="text-ghost-accent ml-1">· Bundle filtered</span>}
          </div>
          <div className="ml-auto flex items-center gap-1">
            {importing && <Spinner size={12} />}
            <Button
              size="xs"
              variant="ghost"
              icon={<RefreshCw size={11} />}
              onClick={() => useGKStore.getState().loadFiles()}
            />
            <Button
              size="xs"
              variant={viewMode === 'grid' ? 'primary' : 'ghost'}
              icon={<Grid3X3 size={11} />}
              onClick={() => setViewMode('grid')}
            />
            <Button
              size="xs"
              variant={viewMode === 'list' ? 'primary' : 'ghost'}
              icon={<List size={11} />}
              onClick={() => setViewMode('list')}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileInput}
            />
            <Button
              size="xs"
              variant="primary"
              icon={<Upload size={11} />}
              onClick={() => fileInputRef.current?.click()}
            >
              Import
            </Button>
          </div>
        </div>

        {/* Selection action bar */}
        {selectedFileIds.length > 0 && (
          <ActionToolbar
            selectedCount={selectedFileIds.length}
            onDeselect={clearSelection}
            onCreateBundle={handleCreateBundle}
            onSendToLimbo={handleSendToLimbo}
            onSendToVault={handleSendToVault}
            onPin={handlePinSelected}
            onAnalyze={() => { setActivePanel('analysis'); setShowAnalysisPanel(true); }}
            onDelete={handleDeleteSelected}
            onMagnetize={handleMagnetizeSelected}
          />
        )}
      </div>

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          {isSearching ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size={24} />
            </div>
          ) : displayFiles.length === 0 ? (
            <div className="space-y-4">
              <DropZone onFiles={handleDrop} />
              <EmptyState
                title={searchQuery ? 'No results found' : 'No files imported yet'}
                description={searchQuery ? 'Try different search terms' : 'Drop files above or click Import'}
              />
            </div>
          ) : (
            <div>
              {/* Drop zone always visible at top */}
              {!searchQuery && displayFiles.length < 5 && (
                <div className="mb-4">
                  <DropZone onFiles={handleDrop} />
                </div>
              )}

              {viewMode === 'grid' ? (
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-4">
                  {displayFiles.map(file => (
                    <FileCard
                      key={file.id}
                      file={file}
                      selected={selectedFileIds.includes(file.id!)}
                      onSelect={() => toggleFileSelection(file.id!)}
                      onOpen={() => handleFileOpen(file)}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-3 px-3 py-1.5 text-[9px] text-ghost-muted uppercase tracking-wider border-b border-ghost-border mb-1">
                    <span className="w-5" />
                    <span className="flex-1">Name</span>
                    <span>Tags</span>
                    <span className="w-28 text-right">SKU · Size</span>
                  </div>
                  {displayFiles.map(file => (
                    <FileRow
                      key={file.id}
                      file={file}
                      selected={selectedFileIds.includes(file.id!)}
                      onSelect={() => toggleFileSelection(file.id!)}
                      onOpen={() => handleFileOpen(file)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* File detail panel */}
        {activeFile && (
          <FileDetail
            file={displayFiles.find(f => f.id === activeFile.id) ?? activeFile}
            onClose={() => setActiveFile(null)}
          />
        )}
      </div>
    </div>
  );
};
