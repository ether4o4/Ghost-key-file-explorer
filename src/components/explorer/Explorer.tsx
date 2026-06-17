import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useExplorer } from '../../store/explorerStore';
import { StagedFilesPane } from './StagedFilesPane';
import { FolderStagingPane } from './FolderStagingPane';
import { Icon } from './Icons';

/**
 * Ghost Key — a single floating file-explorer window. It sits over the device's
 * home-screen wallpaper (the app background is transparent), can be dragged by
 * its title bar, minimized to a pill, maximized to full screen, and resized
 * from the bottom-left corner (opposite the min/max buttons). Inside is the
 * staging view: files on top, folder picker below, with a draggable divider.
 */

const MIN_W = 260;
const MIN_H = 340;
const IS_NATIVE = Capacitor.isNativePlatform();

// One window, one gesture at a time → module scope keeps it off React state.
type Gesture =
  | { mode: 'move'; sx: number; sy: number; ox: number; oy: number; ow: number }
  | { mode: 'resize'; sx: number; sy: number; ox: number; ow: number; oh: number }
  | { mode: 'split'; top: number; height: number };

let active: Gesture | null = null;

function winId(): number | null {
  return useExplorer.getState().windows[0]?.id ?? null;
}

function onMove(e: PointerEvent) {
  const g = active;
  const id = winId();
  if (!g || id === null) return;
  const st = useExplorer.getState();
  if (g.mode === 'move') {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = Math.min(Math.max(g.ox + (e.clientX - g.sx), -(g.ow - 120)), vw - 80);
    const y = Math.min(Math.max(g.oy + (e.clientY - g.sy), 0), vh - 44);
    st.setBounds(id, { x, y });
  } else if (g.mode === 'resize') {
    // Bottom-left corner: left edge tracks the pointer, bottom edge grows down.
    const w = Math.max(MIN_W, g.ow - (e.clientX - g.sx));
    const x = g.ox + (g.ow - w);
    const h = Math.max(MIN_H, g.oh + (e.clientY - g.sy));
    st.setBounds(id, { x, w, h });
  } else {
    st.setSplitter(id, (e.clientY - g.top) / g.height);
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

function beginGesture(g: Gesture, cursor: string) {
  active = g;
  document.body.style.userSelect = 'none';
  document.body.style.cursor = cursor;
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', endGesture);
  window.addEventListener('pointercancel', endGesture);
}

export const Explorer: React.FC = () => {
  const win = useExplorer((s) => s.windows[0]);
  const toast = useExplorer((s) => s.toast);
  const init = useExplorer((s) => s.init);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    init();
  }, [init]);

  const store = useExplorer.getState;

  const startMove = (e: React.PointerEvent) => {
    if (!win || win.maximized) return;
    beginGesture({ mode: 'move', sx: e.clientX, sy: e.clientY, ox: win.x, oy: win.y, ow: win.w }, 'default');
  };
  const startResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!win || win.maximized) return;
    beginGesture({ mode: 'resize', sx: e.clientX, sy: e.clientY, ox: win.x, ow: win.w, oh: win.h }, 'sw-resize');
  };
  const startSplit = (e: React.PointerEvent) => {
    e.stopPropagation();
    const body = bodyRef.current;
    if (!body || !win) return;
    const r = body.getBoundingClientRect();
    beginGesture({ mode: 'split', top: r.top, height: r.height }, 'row-resize');
  };

  // Background: transparent on device (wallpaper shows), painted backdrop on web.
  const bgClass = IS_NATIVE ? 'bg-transparent' : 'gk-desktop';

  if (!win) {
    return <div className={`fixed inset-0 ${bgClass} flex items-center justify-center text-ghost-muted text-sm`}>Loading…</div>;
  }

  // Minimized → a small pill floating over the wallpaper.
  if (win.minimized) {
    return (
      <div className={`fixed inset-0 ${bgClass}`}>
        <button
          onClick={() => store().unminimize(win.id)}
          className="absolute left-1/2 -translate-x-1/2 bottom-6 flex items-center gap-2 px-4 py-2.5 rounded-full bg-ghost-surface/90 backdrop-blur border border-ghost-border shadow-2xl text-ghost-text hover:bg-ghost-card transition-colors"
        >
          <span className="text-base leading-none">👻</span>
          <span className="text-[13px] font-medium">Ghost Key</span>
          <Icon name="expand" size={14} className="text-ghost-accent" />
        </button>
        {toast && <Toast toast={toast} />}
      </div>
    );
  }

  const frameStyle: React.CSSProperties = win.maximized
    ? { left: 0, top: 0, width: '100%', height: '100%' }
    : { left: win.x, top: win.y, width: win.w, height: win.h };

  const topPct = `${(win.splitter * 100).toFixed(2)}%`;

  return (
    <div className={`fixed inset-0 ${bgClass} overflow-hidden`}>
      <div
        className={`absolute flex flex-col overflow-hidden border border-ghost-border bg-ghost-bg/95 backdrop-blur-xl ${
          win.maximized ? 'rounded-none' : 'rounded-2xl'
        }`}
        style={{ ...frameStyle, boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}
      >
        {/* Title bar */}
        <div
          onPointerDown={startMove}
          onDoubleClick={() => store().toggleMax(win.id)}
          className={`flex items-center gap-2 h-10 px-3 shrink-0 bg-ghost-surface/80 border-b border-ghost-border select-none ${
            win.maximized ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
          }`}
        >
          <span className="text-base leading-none">👻</span>
          <span className="text-[12px] font-semibold text-ghost-text tracking-wide truncate">Ghost Key</span>
          <span className="text-[10px] text-ghost-muted ml-0.5 hidden sm:inline">File Explorer</span>
          <div className="flex-1" />
          <WinBtn title="Minimize" onClick={() => store().minimize(win.id)}>
            <Icon name="minus" size={15} />
          </WinBtn>
          <WinBtn title={win.maximized ? 'Restore' : 'Maximize'} onClick={() => store().toggleMax(win.id)}>
            <Icon name={win.maximized ? 'restore' : 'square'} size={13} />
          </WinBtn>
        </div>

        {/* Body: files on top, folder picker below */}
        <div ref={bodyRef} className="flex-1 flex flex-col min-h-0">
          <div style={{ flexBasis: topPct }} className="min-h-0 overflow-hidden shrink-0 grow-0">
            <StagedFilesPane winId={win.id} />
          </div>
          <div
            onPointerDown={startSplit}
            onDoubleClick={() => store().setSplitter(win.id, 0.5)}
            title="Drag to resize · double-tap to even out"
            className="group shrink-0 h-2.5 w-full cursor-row-resize flex items-center justify-center bg-ghost-border hover:bg-ghost-accent/60 transition-colors"
          >
            <span className="rounded-full bg-ghost-dim group-hover:bg-ghost-text h-[3px] w-10 transition-colors" />
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <FolderStagingPane winId={win.id} />
          </div>
        </div>

        {/* Resize handle — bottom-left, opposite the min/max buttons */}
        {!win.maximized && (
          <div
            onPointerDown={startResize}
            title="Drag to resize"
            className="absolute bottom-0 left-0 w-6 h-6 cursor-sw-resize flex items-end justify-start p-1 group"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" className="text-ghost-dim group-hover:text-ghost-accent transition-colors">
              <path d="M11 1 1 11M11 6 6 11M11 11H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
          </div>
        )}
      </div>

      {toast && <Toast toast={toast} />}
    </div>
  );
};

const WinBtn: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({ title, onClick, children }) => (
  <button
    title={title}
    onPointerDown={(e) => e.stopPropagation()}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className="w-8 h-8 flex items-center justify-center rounded-lg text-ghost-muted hover:bg-ghost-card hover:text-ghost-text transition-colors"
  >
    {children}
  </button>
);

const Toast: React.FC<{ toast: { msg: string; kind: 'info' | 'success' | 'error' } }> = ({ toast }) => (
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
);
