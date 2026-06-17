import { useEffect, useRef } from 'react';
import { useExplorer } from '../../store/explorerStore';
import { StagedFilesPane } from './StagedFilesPane';
import { FolderStagingPane } from './FolderStagingPane';

/**
 * Ghost Key is a file explorer, not a launcher. Opening the app drops you
 * straight into this single full-screen view — no desktop, no windows, no
 * taskbar. It's two stacked decks (files on top, folder staging below) with a
 * draggable divider between them.
 */

// The divider drag is the only gesture, so it lives at module scope.
let splitDrag: { top: number; height: number } | null = null;

function onSplitMove(e: PointerEvent) {
  if (!splitDrag) return;
  const win = useExplorer.getState().windows[0];
  if (win) useExplorer.getState().setSplitter(win.id, (e.clientY - splitDrag.top) / splitDrag.height);
}

function endSplit() {
  splitDrag = null;
  window.removeEventListener('pointermove', onSplitMove);
  window.removeEventListener('pointerup', endSplit);
  window.removeEventListener('pointercancel', endSplit);
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
}

export const Explorer: React.FC = () => {
  const win = useExplorer((s) => s.windows[0]);
  const toast = useExplorer((s) => s.toast);
  const init = useExplorer((s) => s.init);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    init();
  }, [init]);

  const startSplit = (e: React.PointerEvent) => {
    e.preventDefault();
    const body = bodyRef.current;
    if (!body || !win) return;
    const rect = body.getBoundingClientRect();
    splitDrag = { top: rect.top, height: rect.height };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
    window.addEventListener('pointermove', onSplitMove);
    window.addEventListener('pointerup', endSplit);
    window.addEventListener('pointercancel', endSplit);
  };

  const topPct = win ? `${(win.splitter * 100).toFixed(2)}%` : '50%';

  return (
    <div className="fixed inset-0 bg-ghost-bg flex flex-col overflow-hidden select-none">
      {!win ? (
        <div className="flex-1 flex items-center justify-center text-ghost-muted text-sm">Loading…</div>
      ) : (
        <div ref={bodyRef} className="flex-1 flex flex-col min-h-0">
          <div style={{ flexBasis: topPct }} className="min-h-0 overflow-hidden shrink-0 grow-0">
            <StagedFilesPane winId={win.id} />
          </div>
          <div
            onPointerDown={startSplit}
            onDoubleClick={() => useExplorer.getState().setSplitter(win.id, 0.5)}
            title="Drag to resize · double-tap to even out"
            className="group shrink-0 h-2.5 w-full cursor-row-resize flex items-center justify-center bg-ghost-border hover:bg-ghost-accent/60 transition-colors"
          >
            <span className="rounded-full bg-ghost-dim group-hover:bg-ghost-text h-[3px] w-10 transition-colors" />
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <FolderStagingPane winId={win.id} />
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 bottom-4 z-[100] px-4 py-2 rounded-lg text-[12px] font-medium shadow-xl glass animate-fade-in border ${
            toast.kind === 'error'
              ? 'border-ghost-red/50 text-ghost-red'
              : toast.kind === 'success'
                ? 'border-ghost-green/50 text-ghost-green'
                : 'border-ghost-border text-ghost-text'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
};
