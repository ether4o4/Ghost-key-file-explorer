import React, { useEffect, useState } from 'react';
import { useExplorer } from '../../store/explorerStore';
import type { DirEntry } from '../../core/fs';
import { formatBytes } from '../../utils/format';
import { Icon, entryIcon } from './Icons';

/**
 * In-place file viewer — renders inside the top deck (the same box you clicked
 * the file in) instead of launching an external app. Back returns to the file
 * list; the expand button makes the top deck fill the whole window. Images,
 * video, audio and text render inline; anything else offers "Open externally".
 */
const IMAGE = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'];
const VIDEO = ['mp4', 'webm', 'mov', 'm4v', 'ogv', '3gp'];
const AUDIO = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'];
const TEXT = [
  'txt', 'md', 'markdown', 'log', 'csv', 'tsv', 'json', 'xml', 'yml', 'yaml', 'js', 'jsx', 'ts', 'tsx',
  'css', 'scss', 'html', 'htm', 'sh', 'bash', 'py', 'java', 'kt', 'c', 'h', 'cpp', 'go', 'rs', 'rb',
  'php', 'ini', 'conf', 'cfg', 'toml', 'sql', 'gradle', 'properties', 'env', 'gitignore',
];

type Kind = 'image' | 'video' | 'audio' | 'text' | 'other';
function kindOf(ext: string): Kind {
  const e = ext.toLowerCase();
  if (IMAGE.includes(e)) return 'image';
  if (VIDEO.includes(e)) return 'video';
  if (AUDIO.includes(e)) return 'audio';
  if (TEXT.includes(e)) return 'text';
  return 'other';
}

const TEXT_LIMIT = 2 * 1024 * 1024; // 2 MB

export const FileViewer: React.FC<{ winId: number; entry: DirEntry }> = ({ winId, entry }) => {
  const s = useExplorer.getState;
  const topFull = useExplorer((st) => st.windows.find((w) => w.id === winId)?.topFull ?? false);

  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const kind = kindOf(entry.ext);

  useEffect(() => {
    let alive = true;
    let revoke: (() => void) | undefined;
    (async () => {
      try {
        const res = await s().adapter.resolveUrl(entry);
        if (!alive) {
          res.revoke?.();
          return;
        }
        revoke = res.revoke;
        setUrl(res.url);
        if (kind === 'text') {
          if (entry.size > TEXT_LIMIT) {
            setErr('File is too large to preview here.');
          } else {
            const r = await fetch(res.url);
            const t = await r.text();
            if (alive) setText(t);
          }
        }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : 'Could not open this file.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      revoke?.();
    };
  }, [entry, kind, s]);

  const ic = entryIcon('file', entry.ext);
  const close = () => s().closePreview(winId);
  const openExternal = () => s().openFile(winId, 'left', entry);

  return (
    <div className="flex flex-col h-full bg-ghost-bg">
      {/* Viewer header */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-ghost-border bg-ghost-surface/60 shrink-0">
        <button
          onClick={close}
          title="Back to files"
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-ghost-muted hover:text-ghost-text hover:bg-ghost-card transition-colors shrink-0"
        >
          <Icon name="chevronLeft" size={16} />
          <span className="hidden sm:inline">Back</span>
        </button>
        <span style={{ color: ic.color }} className="shrink-0">
          <Icon name={ic.name} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-ghost-text truncate leading-tight">{entry.name}</div>
          <div className="text-[10px] text-ghost-muted leading-tight">{formatBytes(entry.size)}</div>
        </div>
        <button
          onClick={openExternal}
          title="Open in another app"
          className="shrink-0 p-1.5 rounded text-ghost-muted hover:text-ghost-text hover:bg-ghost-card transition-colors"
        >
          <Icon name="open" size={15} />
        </button>
        <button
          onClick={() => s().setTopFull(winId, !topFull)}
          title={topFull ? 'Restore' : 'Fullscreen'}
          className="shrink-0 p-1.5 rounded text-ghost-muted hover:text-ghost-text hover:bg-ghost-card transition-colors"
        >
          <Icon name={topFull ? 'collapse' : 'expand'} size={15} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto bg-black/20">
        {loading && <div className="h-full flex items-center justify-center text-ghost-muted text-xs">Loading…</div>}

        {!loading && err && <Fallback entry={entry} message={err} onExternal={openExternal} />}

        {!loading && !err && url && kind === 'image' && (
          <div className="min-h-full flex items-center justify-center p-2">
            <img src={url} alt={entry.name} className="max-w-full max-h-full object-contain" onError={() => setErr('Can’t display this image.')} />
          </div>
        )}

        {!loading && !err && url && kind === 'video' && (
          <div className="min-h-full flex items-center justify-center p-2">
            <video src={url} controls className="max-w-full max-h-full" onError={() => setErr('Can’t play this video here.')} />
          </div>
        )}

        {!loading && !err && url && kind === 'audio' && (
          <div className="min-h-full flex flex-col items-center justify-center gap-3 p-4">
            <span style={{ color: ic.color }}>
              <Icon name="audio" size={48} />
            </span>
            <audio src={url} controls className="w-full max-w-md" onError={() => setErr('Can’t play this audio here.')} />
          </div>
        )}

        {!loading && !err && kind === 'text' && text !== null && (
          <pre className="text-[12px] leading-relaxed p-3 whitespace-pre-wrap break-words font-mono text-ghost-text">{text}</pre>
        )}

        {!loading && !err && kind === 'other' && <Fallback entry={entry} message={`No preview for .${entry.ext || 'file'} files.`} onExternal={openExternal} />}
      </div>
    </div>
  );
};

const Fallback: React.FC<{ entry: DirEntry; message: string; onExternal: () => void }> = ({ entry, message, onExternal }) => {
  const ic = entryIcon('file', entry.ext);
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-6 text-ghost-muted">
      <span style={{ color: ic.color }}>
        <Icon name={ic.name} size={40} />
      </span>
      <div className="text-sm text-ghost-text">{message}</div>
      <button
        onClick={onExternal}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ghost-accent/20 border border-ghost-accent/40 text-[12px] text-ghost-text hover:bg-ghost-accent/30 transition-colors"
      >
        <Icon name="open" size={14} /> Open externally
      </button>
    </div>
  );
};
