import React, { useEffect, useState } from 'react';
import { useExplorer } from '../../store/explorerStore';
import type { PreviewState } from '../../store/explorerStore';
import { Icon } from './Icons';

/**
 * In-app file preview. Renders the selected file inline (image / video / audio /
 * text) over a dark backdrop, instead of handing the URL to window.open — which,
 * on Android, spawns a blank WebView and crashes the app.
 */
export const PreviewOverlay: React.FC = () => {
  const preview = useExplorer((s) => s.preview);
  const close = useExplorer((s) => s.closePreview);

  // Close on Escape.
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, close]);

  if (!preview) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black/90 backdrop-blur-sm animate-fade-in" onClick={close}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 h-12 px-3 text-ghost-text" onClick={(e) => e.stopPropagation()}>
        <Icon name="file" size={16} className="text-ghost-accent shrink-0" />
        <span className="text-[13px] font-medium truncate">{preview.name}</span>
        <div className="flex-1" />
        <a
          href={preview.url}
          download={preview.name}
          onClick={(e) => e.stopPropagation()}
          title="Save a copy"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-ghost-muted hover:text-ghost-text hover:bg-white/10 transition-colors"
        >
          <Icon name="download" size={18} />
        </a>
        <button
          onClick={close}
          title="Close (Esc)"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-ghost-muted hover:text-ghost-text hover:bg-white/10 transition-colors"
        >
          <Icon name="x" size={20} />
        </button>
      </div>

      {/* Body — keyed by URL so its state resets cleanly when the file changes */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-3" onClick={(e) => e.stopPropagation()}>
        <PreviewBody key={preview.url} preview={preview} />
      </div>
    </div>
  );
};

const PreviewBody: React.FC<{ preview: PreviewState }> = ({ preview }) => {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Text is fetched lazily; state is only set from the async callback, and the
  // component is remounted per file (keyed), so no synchronous reset is needed.
  useEffect(() => {
    if (preview.kind !== 'text') return;
    let cancelled = false;
    fetch(preview.url)
      .then((r) => r.text())
      .then((t) => {
        if (!cancelled) setText(t.length > 200_000 ? t.slice(0, 200_000) + '\n\n… (truncated)' : t);
      })
      .catch(() => !cancelled && setError('Could not read file'));
    return () => {
      cancelled = true;
    };
  }, [preview]);

  if (error) return <div className="text-ghost-red text-sm">{error}</div>;

  if (preview.kind === 'image') {
    return (
      <img
        src={preview.url}
        alt={preview.name}
        className="max-w-full max-h-full object-contain rounded-lg"
        onError={() => setError('Could not display image')}
      />
    );
  }
  if (preview.kind === 'video') {
    return <video src={preview.url} controls autoPlay className="max-w-full max-h-full rounded-lg" />;
  }
  if (preview.kind === 'audio') {
    return (
      <div className="w-full max-w-md flex flex-col items-center gap-4">
        <Icon name="audio" size={64} className="text-ghost-accent" />
        <audio src={preview.url} controls autoPlay className="w-full" />
      </div>
    );
  }
  return (
    <pre className="w-full h-full overflow-auto text-[12px] leading-relaxed text-ghost-text bg-ghost-bg/60 rounded-lg p-3 whitespace-pre-wrap break-words font-mono">
      {text ?? 'Loading…'}
    </pre>
  );
};
