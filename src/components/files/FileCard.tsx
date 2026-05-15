import React from 'react';
import clsx from 'clsx';
import {
  FileImage, FileText, FileArchive, FileCode, FileAudio, FileVideo,
  File, Database, Sheet, FileJson, AlertTriangle, Pin, Eye
} from 'lucide-react';
import type { GKFile } from '../../core/db';
import { TagGroup } from '../tags/Tags';
import { SKUBadge } from '../sku/SKU';
import { formatBytes, formatDate } from '../../utils/format';

// ─── File Icon ────────────────────────────────────────────────────────────────

export function getFileIcon(ext: string, mimeType: string, size = 20) {
  const e = ext.toLowerCase();
  if (['jpg','jpeg','png','gif','webp','heic','svg'].includes(e)) return <FileImage size={size} />;
  if (['mp4','mov','avi','mkv','webm'].includes(e)) return <FileVideo size={size} />;
  if (['mp3','wav','flac','m4a','aac'].includes(e)) return <FileAudio size={size} />;
  if (['zip','tar','gz','rar','7z'].includes(e)) return <FileArchive size={size} />;
  if (['js','ts','py','java','cpp','go','rs','html','css'].includes(e)) return <FileCode size={size} />;
  if (['pdf','doc','docx','txt','md'].includes(e)) return <FileText size={size} />;
  if (['xls','xlsx','csv'].includes(e)) return <Sheet size={size} />;
  if (['json','xml'].includes(e)) return <FileJson size={size} />;
  if (['sqlite','db','sql'].includes(e)) return <Database size={size} />;
  if (mimeType.startsWith('image/')) return <FileImage size={size} />;
  if (mimeType.startsWith('video/')) return <FileVideo size={size} />;
  if (mimeType.startsWith('audio/')) return <FileAudio size={size} />;
  return <File size={size} />;
}

function getFileColor(ext: string): string {
  const e = ext.toLowerCase();
  if (['jpg','jpeg','png','gif','webp','heic','svg'].includes(e)) return '#00d4ff';
  if (['mp4','mov','avi','mkv','webm'].includes(e)) return '#ff6b35';
  if (['mp3','wav','flac','m4a','aac'].includes(e)) return '#ffd700';
  if (['zip','tar','gz','rar','7z'].includes(e)) return '#ff3355';
  if (['js','ts','py','java','cpp'].includes(e)) return '#00ff88';
  if (['pdf','doc','docx'].includes(e)) return '#6c63ff';
  return '#64748b';
}

// ─── File Card (Grid) ─────────────────────────────────────────────────────────

interface FileCardProps {
  file: GKFile;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  dragging?: boolean;
}

export const FileCard: React.FC<FileCardProps> = ({ file, selected, onSelect, onOpen, dragging }) => {
  const color = getFileColor(file.ext);
  const hasPreview = !!file.dataUrl;

  return (
    <div
      className={clsx(
        'relative rounded-lg border bg-ghost-card cursor-pointer transition-all duration-150 group',
        'hover:border-ghost-accent/50 hover:-translate-y-0.5',
        selected ? 'border-ghost-accent ring-1 ring-ghost-accent/30' : 'border-ghost-border',
        dragging && 'opacity-40',
        file.isFlagged && 'border-ghost-red/40',
      )}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      {/* Thumbnail / Icon area */}
      <div
        className="relative h-24 rounded-t-lg flex items-center justify-center overflow-hidden"
        style={{ background: `${color}0a` }}
      >
        {hasPreview ? (
          <img src={file.dataUrl} alt={file.name} className="w-full h-full object-cover" />
        ) : (
          <div style={{ color }} className="opacity-60">
            {getFileIcon(file.ext, file.mimeType, 32)}
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-1.5 right-1.5 flex gap-1">
          {file.isFlagged && (
            <span className="p-0.5 rounded bg-ghost-red/20 text-ghost-red">
              <AlertTriangle size={10} />
            </span>
          )}
          {file.isPinned && (
            <span className="p-0.5 rounded bg-ghost-accent/20 text-ghost-accent">
              <Pin size={10} />
            </span>
          )}
          {file.vaultId && (
            <span className="p-0.5 rounded bg-ghost-yellow/20 text-ghost-yellow text-[8px] font-mono">🔒</span>
          )}
          {file.limboId && (
            <span className="p-0.5 rounded bg-ghost-orange/20 text-ghost-orange text-[8px]">⚗</span>
          )}
        </div>

        {/* Hover actions */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            className="p-1.5 rounded-full bg-ghost-accent/30 hover:bg-ghost-accent/50 text-ghost-accent"
          >
            <Eye size={14} />
          </button>
        </div>
      </div>

      {/* Info area */}
      <div className="p-2">
        <div className="text-xs font-medium text-ghost-text truncate mb-1" title={file.name}>
          {file.name}
        </div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] text-ghost-muted">{formatBytes(file.size)}</span>
          <SKUBadge sku={file.sku} size="xs" />
        </div>
        <TagGroup tags={file.tags} max={3} size="xs" />
      </div>

      {/* Selection indicator */}
      {selected && (
        <div className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full bg-ghost-accent flex items-center justify-center">
          <span className="text-white text-[8px]">✓</span>
        </div>
      )}
    </div>
  );
};

// ─── File Row (List) ──────────────────────────────────────────────────────────

interface FileRowProps {
  file: GKFile;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}

export const FileRow: React.FC<FileRowProps> = ({ file, selected, onSelect, onOpen }) => {
  const color = getFileColor(file.ext);

  return (
    <div
      className={clsx(
        'flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-all duration-100 group',
        'hover:bg-ghost-card/60',
        selected ? 'bg-ghost-card border border-ghost-accent/30' : 'border border-transparent',
      )}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <div style={{ color }} className="shrink-0 opacity-70">
        {getFileIcon(file.ext, file.mimeType, 16)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-ghost-text truncate">{file.name}</span>
          {file.isFlagged && <AlertTriangle size={10} className="text-ghost-red shrink-0" />}
          {file.isPinned && <Pin size={10} className="text-ghost-accent shrink-0" />}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] text-ghost-muted">{file.source}</span>
          <span className="text-[9px] text-ghost-dim">·</span>
          <span className="text-[9px] text-ghost-muted">{formatDate(file.importedAt)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <TagGroup tags={file.tags.filter(t => t.dimension === 'who')} max={2} size="xs" />
        <SKUBadge sku={file.sku} size="xs" />
        <span className="text-[9px] text-ghost-muted w-14 text-right">{formatBytes(file.size)}</span>
      </div>
    </div>
  );
};
