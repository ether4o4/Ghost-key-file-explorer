import React, { useEffect } from 'react';
import { useExplorer } from '../../store/explorerStore';
import type { WindowState } from '../../store/explorerStore';
import { ExplorerPane } from './ExplorerPane';
import { Icon } from './Icons';

/**
 * Phone / portrait layout.
 *
 * The desktop shell (floating, draggable, resizable windows with two panes
 * side-by-side) is unusable on a narrow screen: each pane shrinks below the
 * width of its own toolbar, so the buttons scroll off-screen, and the window
 * drag/resize gestures fight touch scrolling. Here the same two panes are
 * stacked vertically — FROM on top, TO on bottom — and fill the screen, with a
 * full-width transfer bar between them. No window chrome, no pointer gestures.
 *
 * It reuses the exact same store window (windows[0]) and ExplorerPane as the
 * desktop, so navigation, selection and file operations are identical.
 */
export const MobileExplorer: React.FC = () => {
  const win = useExplorer((s) => s.windows[0]);
  const toast = useExplorer((s) => s.toast);
  const init = useExplorer((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="fixed inset-0 flex flex-col bg-ghost-bg overflow-hidden select-none">
      {/* Slim brand header */}
      <div className="shrink-0 flex items-center gap-2 h-10 px-3 bg-ghost-surface/90 border-b border-ghost-border">
        <span className="text-[15px] font-bold tracking-tight text-ghost-text">
          👻 Ghost <span className="text-ghost-accent">Explorer</span>
        </span>
        <div className="flex-1" />
        {win && (
          <button
            onClick={() => useExplorer.getState().newWindow()}
            title="Reset both panes"
            className="text-[11px] text-ghost-muted hover:text-ghost-text px-2 py-1 rounded hover:bg-ghost-card transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {win ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* FROM pane (top) */}
          <div className="flex-1 min-h-0">
            <ExplorerPane winId={win.id} side="left" />
          </div>

          <TransferBar win={win} />

          {/* TO pane (bottom) */}
          <div className="flex-1 min-h-0">
            <ExplorerPane winId={win.id} side="right" />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={() => useExplorer.getState().newWindow()}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-ghost-accent/15 border border-ghost-accent/40 text-ghost-text"
          >
            <Icon name="folderOpen" size={20} className="text-ghost-accent" />
            Open Explorer
          </button>
        </div>
      )}

      {toast && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 bottom-4 z-[100] px-4 py-2 rounded-lg text-[12px] font-medium shadow-xl glass border ${
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

/**
 * Full-width transfer controls between the stacked panes. "Down" moves/copies the
 * top (FROM) pane's selection into the bottom (TO) pane's folder; "up" goes the
 * other way. Buttons are disabled until there's a selection and an open
 * destination, mirroring the desktop centre dock.
 */
const TransferBar: React.FC<{ win: WindowState }> = ({ win }) => {
  const xfer = useExplorer.getState().transferSelection;
  const leftSel = win.panes.left.selected.length;
  const rightSel = win.panes.right.selected.length;
  const leftOpen = win.panes.left.stack.length > 0;
  const rightOpen = win.panes.right.stack.length > 0;
  const downOn = leftSel > 0 && rightOpen;
  const upOn = rightSel > 0 && leftOpen;

  return (
    <div className="shrink-0 flex items-stretch gap-1.5 px-2 py-1.5 bg-ghost-surface border-y border-ghost-border">
      <XferBtn icon="move" label="Move" dir="down" primary enabled={downOn} count={leftSel} onClick={() => xfer(win.id, 'left', false)} />
      <XferBtn icon="copy" label="Copy" dir="down" primary enabled={downOn} onClick={() => xfer(win.id, 'left', true)} />
      <div className="w-px bg-ghost-border mx-0.5" />
      <XferBtn icon="move" label="Move" dir="up" enabled={upOn} count={rightSel} onClick={() => xfer(win.id, 'right', false)} />
      <XferBtn icon="copy" label="Copy" dir="up" enabled={upOn} onClick={() => xfer(win.id, 'right', true)} />
    </div>
  );
};

const XferBtn: React.FC<{
  icon: 'move' | 'copy';
  label: string;
  dir: 'up' | 'down';
  primary?: boolean;
  enabled: boolean;
  count?: number;
  onClick: () => void;
}> = ({ icon, label, dir, primary, enabled, count, onClick }) => (
  <button
    disabled={!enabled}
    onClick={onClick}
    className={`flex-1 flex items-center justify-center gap-1.5 h-11 rounded-lg border text-[12px] font-semibold transition-colors ${
      !enabled
        ? 'border-transparent text-ghost-dim'
        : primary
          ? 'border-ghost-accent/50 bg-ghost-accent/20 text-ghost-text active:bg-ghost-accent/35'
          : 'border-ghost-border text-ghost-text/90 active:bg-ghost-card'
    }`}
  >
    <Icon name={icon} size={16} />
    <span>{label}</span>
    <Icon name="chevronRight" size={14} className={dir === 'down' ? 'rotate-90' : '-rotate-90'} />
    {!!count && count > 0 && (
      <span className="text-[10px] leading-none px-1 py-0.5 rounded bg-ghost-accent/30 text-ghost-text">{count}</span>
    )}
  </button>
);
