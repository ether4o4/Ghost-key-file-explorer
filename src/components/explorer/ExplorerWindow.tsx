import React from 'react';
import { useExplorer } from '../../store/explorerStore';
import type { WindowState } from '../../store/explorerStore';
import { ExplorerPane } from './ExplorerPane';
import { Icon } from './Icons';

const TASKBAR_H = 48;
const MIN_W = 360;
const MIN_H = 420;

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
    st.setSplitter(g.winId, (e.clientY - g.bodyTop) / g.bodyH);
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
    beginGesture({ mode: 'split', winId: win.id, bodyTop: rect.top, bodyH: rect.height }, 'row-resize');
  };

  const frameStyle: React.CSSProperties = win.maximized
    ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };

  const topPct = `${(win.splitter * 100).toFixed(2)}%`;

  return (
    <div
      className="absolute flex flex-col rounded-lg overflow-hidden aero-glass"
      style={{ ...frameStyle, boxShadow: '0 24px 70px rgba(0,0,0,0.55)' }}
      onMouseDown={() => store().focusWindow(win.id)}
    >
      {/* Title bar — Aero glass with top-down reflection */}
      <div
        onPointerDown={startMove}
        onDoubleClick={() => store().toggleMax(win.id)}
        className="aero-reflect flex items-center gap-2 h-9 px-3 shrink-0 bg-white/10 border-b border-white/30 cursor-default select-none"
      >
        <Icon name="folderOpen" size={15} className="text-white/90 drop-shadow" />
        <span className="text-[12px] font-medium text-white tracking-wide ml-1 [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">{win.title}</span>
        <span className="text-[10px] text-white/75 ml-1 hidden sm:inline [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">— NeverSoft Services</span>
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

      {/* Dual-pane body — stacked top/bottom */}
      <div className="flex-1 flex flex-col min-h-0 bg-ghost-bg/90">
        <div style={{ height: topPct }} className="min-h-0 border-b border-ghost-border">
          <ExplorerPane winId={win.id} side="left" />
        </div>
        {/* Splitter */}
        <div
          onPointerDown={startSplit}
          className="h-1.5 w-full shrink-0 cursor-row-resize bg-white/20 hover:bg-white/45 transition-colors duration-hover"
          title="Drag to resize panes"
        />
        <div style={{ height: `calc(100% - ${topPct} - 6px)` }} className="min-h-0">
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
    className={`w-7 h-7 flex items-center justify-center rounded-md text-white/80 transition-colors duration-hover active:duration-press ${
      danger ? 'hover:bg-[#e81123] hover:text-white' : 'hover:bg-white/25 hover:text-white'
    }`}
  >
    {children}
  </button>
);
