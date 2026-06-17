import React, { useRef } from 'react';
import { useExplorer } from '../../store/explorerStore';
import type { WindowState } from '../../store/explorerStore';
import { StagedFilesPane } from './StagedFilesPane';
import { FolderStagingPane } from './FolderStagingPane';
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
  | { mode: 'split'; winId: number; bodyTop: number; bodyH: number };

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
    // Splitter — the decks always stack top/bottom, so measure vertically.
    st.setSplitter(g.winId, (e.clientY - g.bodyTop) / g.bodyH);
  }
}

function endGesture() {
  active = null;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', endGesture);
  window.removeEventListener('pointercancel', endGesture);
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
}

function beginGesture(g: Gesture, cursor?: string) {
  active = g;
  document.body.style.userSelect = 'none';
  if (cursor) document.body.style.cursor = cursor;
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', endGesture);
  window.addEventListener('pointercancel', endGesture);
}

export const ExplorerWindow: React.FC<{ win: WindowState }> = ({ win }) => {
  const store = useExplorer.getState;
  const bodyRef = useRef<HTMLDivElement>(null);

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
    const body = bodyRef.current;
    if (!body) return;
    const rect = body.getBoundingClientRect();
    beginGesture({ mode: 'split', winId: win.id, bodyTop: rect.top, bodyH: rect.height }, 'row-resize');
  };

  const frameStyle: React.CSSProperties = win.maximized
    ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };

  const topPct = `${(win.splitter * 100).toFixed(2)}%`;

  return (
    <div
      className={`absolute flex flex-col overflow-hidden border border-ghost-border bg-ghost-bg ${
        win.maximized ? 'rounded-none' : 'rounded-2xl'
      }`}
      style={{ ...frameStyle, boxShadow: '0 24px 70px rgba(0,0,0,0.55)' }}
      onMouseDown={() => store().focusWindow(win.id)}
    >
      {/* Title bar */}
      <div
        onPointerDown={startMove}
        onDoubleClick={() => store().toggleMax(win.id)}
        className="flex items-center gap-2 h-10 px-3 shrink-0 bg-ghost-surface/90 border-b border-ghost-border cursor-default select-none"
      >
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-ghost-accent" />
          <span className="w-3 h-3 rounded-full bg-ghost-cyan/70" />
          <span className="w-3 h-3 rounded-full bg-ghost-green/60" />
        </div>
        <span className="text-[12px] font-medium text-ghost-text tracking-wide ml-1.5 truncate">{win.title}</span>
        <span className="text-[10px] text-ghost-muted ml-1 hidden sm:inline">— Ghost Key</span>
        <div className="flex-1" />
        <WinBtn title="Minimize window" onClick={() => store().minimize(win.id)}>
          <Icon name="minus" size={15} />
        </WinBtn>
        <WinBtn title={win.maximized ? 'Restore' : 'Maximize'} onClick={() => store().toggleMax(win.id)}>
          <Icon name={win.maximized ? 'restore' : 'square'} size={13} />
        </WinBtn>
        <WinBtn title="Close window" danger onClick={() => store().closeWindow(win.id)}>
          <Icon name="x" size={15} />
        </WinBtn>
      </div>

      {/* Staging body — files up top, folder picker on the bottom */}
      <div ref={bodyRef} className="flex-1 flex flex-col min-h-0">
        <div style={{ flexBasis: topPct }} className="min-h-0 overflow-hidden shrink-0 grow-0">
          <StagedFilesPane winId={win.id} />
        </div>
        <div
          onPointerDown={startSplit}
          onDoubleClick={() => store().setSplitter(win.id, 0.5)}
          title="Drag to resize · double-click to even out"
          className="group shrink-0 h-2 w-full cursor-row-resize flex items-center justify-center bg-ghost-border hover:bg-ghost-accent/60 transition-colors"
        >
          <span className="rounded-full bg-ghost-dim group-hover:bg-ghost-text h-[3px] w-9 transition-colors" />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <FolderStagingPane winId={win.id} />
        </div>
      </div>

      {/* Resize handles (hidden when maximized) */}
      {!win.maximized && (
        <>
          <div onPointerDown={startResize('e')} className="absolute top-10 right-0 w-1.5 h-[calc(100%-2.5rem)] cursor-e-resize" />
          <div onPointerDown={startResize('s')} className="absolute bottom-0 left-0 w-full h-1.5 cursor-s-resize" />
          <div onPointerDown={startResize('w')} className="absolute top-10 left-0 w-1.5 h-[calc(100%-2.5rem)] cursor-w-resize" />
          <div onPointerDown={startResize('se')} className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-se-resize" />
          <div onPointerDown={startResize('sw')} className="absolute bottom-0 left-0 w-3.5 h-3.5 cursor-sw-resize" />
        </>
      )}
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
    className={`w-8 h-8 flex items-center justify-center rounded-lg text-ghost-muted transition-colors ${
      danger ? 'hover:bg-ghost-red hover:text-white' : 'hover:bg-ghost-card hover:text-ghost-text'
    }`}
  >
    {children}
  </button>
);
