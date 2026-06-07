import React, { useEffect, useRef, useState } from 'react';
import { useExplorer } from '../../store/explorerStore';
import type { DialogEntry } from '../../store/explorerStore';

/**
 * Renders the active in-app dialog (prompt / confirm). Replaces window.prompt and
 * window.confirm, which render inconsistent native popups in the Android WebView.
 */
export const DialogHost: React.FC = () => {
  const dialog = useExplorer((s) => s.dialog);
  const resolve = useExplorer((s) => s.resolveDialog);
  if (!dialog) return null;
  // Keyed so the input resets for each new request.
  return <DialogView key={dialog.title + (dialog.defaultValue ?? '')} dialog={dialog} resolve={resolve} />;
};

const DialogView: React.FC<{ dialog: DialogEntry; resolve: (v: string | boolean | null) => void }> = ({
  dialog,
  resolve,
}) => {
  const [value, setValue] = useState(dialog.defaultValue ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(t);
  }, []);

  const cancel = () => resolve(dialog.kind === 'prompt' ? null : false);
  const confirm = () => resolve(dialog.kind === 'prompt' ? value : true);

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4 animate-fade-in" onClick={cancel}>
      <div
        className="w-full max-w-xs rounded-xl border border-ghost-border bg-ghost-surface p-4 shadow-2xl glass"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[14px] font-semibold text-ghost-text mb-1">{dialog.title}</div>
        {dialog.message && <div className="text-[12px] text-ghost-muted mb-3">{dialog.message}</div>}
        {dialog.kind === 'prompt' && (
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirm();
              else if (e.key === 'Escape') cancel();
            }}
            className="w-full mb-3 px-2.5 py-2 rounded-lg bg-ghost-bg border border-ghost-border text-[13px] text-ghost-text outline-none focus:border-ghost-accent"
          />
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={cancel}
            className="px-3 py-1.5 rounded-lg text-[12px] text-ghost-muted hover:bg-ghost-card transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            className={`px-3 py-1.5 rounded-lg text-[12px] border transition-colors ${
              dialog.danger
                ? 'bg-ghost-red/20 border-ghost-red/50 text-ghost-red hover:bg-ghost-red/30'
                : 'bg-ghost-accent/20 border-ghost-accent/40 text-ghost-text hover:bg-ghost-accent/30'
            }`}
          >
            {dialog.confirmText ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};
