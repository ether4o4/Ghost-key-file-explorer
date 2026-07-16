import React from 'react';
import { useExplorer } from '../../store/explorerStore';
import type { WindowState } from '../../store/explorerStore';
import { ExplorerPane } from './ExplorerPane';
import { Icon } from './Icons';

const TASKBAR_H = 48;
const MIN_W = 420;
const MIN_H = 280;

// Only one window gesture (drag/resize/splitter) can be active at a time, so it
// lives at module scope. This keeps the gesture handlers off React refs entirely.
type Gesture =
  | { mode: 'move'; winId: number; winW: number; startX: number; startY: number; ox: number; oy: number }
  | {
      mode: 'resize';
      winId: number;
      dir: string;
      startX: number;
      startY: number;
      ox: number;
      oy: number;
      ow: number;
      oh: number;
    }
  | { mode: 'split'; winId: number; bodyLeft: number; bodyW: number };

let active: Gesture | null = null;

function onMove(e: PointerEvent) {
  const g = active;
  if (!g) return;
  const st = useExplorer.getState();
  if (g.mode === 'move') {
    const maxX = window.innerWidth;
    const maxY = window.innerHeight - TASKBAR_H;
    const x = Math.min(Math.max(g.ox + (e.clientX - g.startX), -(g.winW - 120)), maxX - 80);
    const y = Math.min(Math.max(g.oy + (e.clientY - g.startY), 0), maxY - 36);
    st.setBounds(g.winId, { x, y });
  } else if (g.mode === 'resize') {
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    let x = g.ox;
    let y = g.oy;
    let w = g.ow;
    let h = g.oh;
    if (g.dir.includes('e')) w = Math.max(MIN_W, g.ow + dx);
    if (g.dir.includes('s')) h = Math.max(MIN_H, g.oh + dy);
    if (g.dir.includes('w')) {
      w = Math.max(MIN_W, g.ow - dx);
      x = g.ox + (g.ow - w);
    }
    if (g.dir.includes('n')) {
      h = Math.max(MIN_H, g.oh - dy);
      y = g.oy + (g.oh - h);
    }
    st.setBounds(g.winId, { x, y, w, h });
  } else {
    st.setSplitter(g.winId, (e.clientX - g.bodyLeft) / g.bodyW);
  }
}

function endGesture() {
  active = null;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', endGesture);
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
}

function beginGesture(g: Gesture, cursor?: string) {
  active = g;
  document.body.style.userSelect = 'none';
  if (cursor) document.body.style.cursor = cursor;
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', endGesture);
}

export const ExplorerWindow: React.FC<{ win: WindowState }> = ({ win }) => {
  const store = useExplorer.getState;

  if (win.minimized) return null;

  const startMove = (e: React.PointerEvent) => {
    store().focusWindow(win.id);
    if (win.maximized) return;
    beginGesture({ mode: 'move', winId: win.id, winW: win.w, startX: e.clientX, startY: e.clientY, ox: win.x, oy: win.y });
  };

  const startResize = (dir: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    store().focusWindow(win.id);
    if (win.maximized) return;
    beginGesture(
      { mode: 'resize', winId: win.id, dir, startX: e.clientX, startY: e.clientY, ox: win.x, oy: win.y, ow: win.w, oh: win.h },
      'default',
    );
  };

  const startSplit = (e: React.PointerEvent) => {
    e.stopPropagation();
    const body = e.currentTarget.parentElement;
    if (!body) return;
    const rect = body.getBoundingClientRect();
    beginGesture({ mode: 'split', winId: win.id, bodyLeft: rect.left, bodyW: rect.width }, 'col-resize');
  };

  const frameStyle: React.CSSProperties = win.maximized
    ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };

  // Left pane gets a fraction of the space left over after the 56px centre dock.
  const leftPct = `calc((100% - 56px) * ${win.splitter.toFixed(3)})`;

  return (
    <div
      className="absolute flex flex-col rounded-xl overflow-hidden border border-ghost-border bg-ghost-bg"
      style={{ ...frameStyle, boxShadow: '0 24px 70px rgba(0,0,0,0.55)' }}
      onMouseDown={() => store().focusWindow(win.id)}
    >
      {/* Title bar */}
      <div
        onPointerDown={startMove}
        onDoubleClick={() => store().toggleMax(win.id)}
        className="flex items-center gap-2 h-9 px-3 shrink-0 bg-ghost-surface border-b border-ghost-border cursor-default select-none"
      >
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-ghost-accent" />
          <span className="w-2.5 h-2.5 rounded-full bg-ghost-cyan/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-ghost-green/60" />
        </div>
        <span className="text-[12px] font-medium text-ghost-text tracking-wide ml-1">{win.title}</span>
        <span className="text-[10px] text-ghost-muted ml-1 hidden sm:inline">— Ghost Key</span>
        <div className="flex-1" />
        <WinBtn title="Minimize" onClick={() => store().minimize(win.id)}>
          <Icon name="minus" size={14} />
        </WinBtn>
        <WinBtn title={win.maximized ? 'Restore' : 'Maximize'} onClick={() => store().toggleMax(win.id)}>
          <Icon name={win.maximized ? 'restore' : 'square'} size={13} />
        </WinBtn>
        <WinBtn title="Close" danger onClick={() => store().closeWindow(win.id)}>
          <Icon name="x" size={14} />
        </WinBtn>
      </div>

      {/* Dual-pane body: left = FROM, centre dock = transfer/resize, right = TO */}
      <div className="flex-1 flex min-h-0">
        <div style={{ width: leftPct }} className="min-w-0">
          <ExplorerPane winId={win.id} side="left" />
        </div>
        <TransferDock win={win} onResizeDown={startSplit} />
        <div className="flex-1 min-w-0">
          <ExplorerPane winId={win.id} side="right" />
        </div>
      </div>

      {/* Resize handles (hidden when maximized) */}
      {!win.maximized && (
        <>
          <div onPointerDown={startResize('e')} className="absolute top-9 right-0 w-1.5 h-[calc(100%-2.25rem)] cursor-e-resize" />
          <div onPointerDown={startResize('s')} className="absolute bottom-0 left-0 w-full h-1.5 cursor-s-resize" />
          <div onPointerDown={startResize('w')} className="absolute top-9 left-0 w-1.5 h-[calc(100%-2.25rem)] cursor-w-resize" />
          <div onPointerDown={startResize('se')} className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-se-resize" />
          <div onPointerDown={startResize('sw')} className="absolute bottom-0 left-0 w-3.5 h-3.5 cursor-sw-resize" />
        </>
      )}
    </div>
  );
};

/**
 * Centre dock between the panes. Its background is the pane-resize handle; the
 * buttons move/copy the *selection* from one pane into the other pane's folder.
 * Primary flow (per the From → To model): left selection → right folder.
 */
const DockBtn: React.FC<{
  title: string;
  label: string;
  icon: 'move' | 'copy';
  dir: 'right' | 'left';
  primary?: boolean;
  enabled: boolean;
  onClick: () => void;
}> = ({ title, label, icon, dir, primary, enabled, onClick }) => (
  <button
    title={title}
    disabled={!enabled}
    onPointerDown={(e) => e.stopPropagation()}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={`w-full flex flex-col items-center gap-0.5 py-2 rounded-lg border transition-colors ${
      !enabled
        ? 'border-transparent text-ghost-dim cursor-not-allowed'
        : primary
          ? 'border-ghost-accent/40 bg-ghost-accent/15 text-ghost-text hover:bg-ghost-accent/30'
          : 'border-ghost-border text-ghost-muted hover:text-ghost-text hover:bg-ghost-card'
    }`}
  >
    <span className="flex items-center gap-0.5">
      {dir === 'left' && <Icon name="chevronRight" size={12} className="rotate-180" />}
      <Icon name={icon} size={15} />
      {dir === 'right' && <Icon name="chevronRight" size={12} />}
    </span>
    <span className="text-[9px] font-medium leading-none">{label}</span>
  </button>
);

const TransferDock: React.FC<{ win: WindowState; onResizeDown: (e: React.PointerEvent) => void }> = ({
  win,
  onResizeDown,
}) => {
  const xfer = useExplorer.getState().transferSelection;
  const leftSel = win.panes.left.selected.length;
  const rightSel = win.panes.right.selected.length;
  const rightOpen = win.panes.right.stack.length > 0;
  const leftOpen = win.panes.left.stack.length > 0;

  return (
    <div
      onPointerDown={onResizeDown}
      title="Drag to resize panes"
      className="w-14 shrink-0 flex flex-col items-center justify-center gap-1.5 px-1.5 bg-ghost-surface border-x border-ghost-border cursor-col-resize select-none"
    >
      <DockBtn title="Move selection from left → right" label="Move" icon="move" dir="right" primary enabled={leftSel > 0 && rightOpen} onClick={() => xfer(win.id, 'left', false)} />
      <DockBtn title="Copy selection from left → right" label="Copy" icon="copy" dir="right" primary enabled={leftSel > 0 && rightOpen} onClick={() => xfer(win.id, 'left', true)} />
      <div className="w-6 h-px bg-ghost-border my-0.5" />
      <DockBtn title="Move selection from right → left" label="Move" icon="move" dir="left" enabled={rightSel > 0 && leftOpen} onClick={() => xfer(win.id, 'right', false)} />
      <DockBtn title="Copy selection from right → left" label="Copy" icon="copy" dir="left" enabled={rightSel > 0 && leftOpen} onClick={() => xfer(win.id, 'right', true)} />
    </div>
  );
};

const WinBtn: React.FC<{
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ title, onClick, danger, children }) => (
  <button
    title={title}
    onPointerDown={(e) => e.stopPropagation()}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={`w-7 h-7 flex items-center justify-center rounded-md text-ghost-muted transition-colors ${
      danger ? 'hover:bg-ghost-red hover:text-white' : 'hover:bg-ghost-card hover:text-ghost-text'
    }`}
  >
    {children}
  </button>
);
