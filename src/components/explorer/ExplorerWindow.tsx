import React, { useEffect, useRef, useState } from 'react';
import { useExplorer, getDrag } from '../../store/explorerStore';
import type { Side, WindowState } from '../../store/explorerStore';
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
  | { mode: 'split'; winId: number; vertical: boolean; bodyStart: number; bodySize: number };

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
    // Splitter — measure along the active axis (vertical = stacked top/bottom).
    const pos = g.vertical ? e.clientY - g.bodyStart : e.clientX - g.bodyStart;
    st.setSplitter(g.winId, pos / g.bodySize);
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
  const bodyRef = useRef<HTMLDivElement>(null);
  // Orientation follows the window body's shape: taller than wide → stack the
  // panes top/bottom (portrait), otherwise side-by-side. Measured live so it
  // adapts to phone rotation, maximize and manual resize alike.
  const [vertical, setVertical] = useState(
    () => (typeof window !== 'undefined' ? window.innerHeight >= window.innerWidth : false),
  );

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setVertical(r.height >= r.width);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [win.minimized, win.maximized]);

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
    beginGesture(
      {
        mode: 'split',
        winId: win.id,
        vertical,
        bodyStart: vertical ? rect.top : rect.left,
        bodySize: vertical ? rect.height : rect.width,
      },
      vertical ? 'row-resize' : 'col-resize',
    );
  };

  const frameStyle: React.CSSProperties = win.maximized
    ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };

  const firstPct = `${(win.splitter * 100).toFixed(2)}%`;
  const collapsed = win.collapsed;

  const paneBox = (side: Side, fill: boolean) => (
    <div
      style={fill ? undefined : { flexBasis: firstPct }}
      className={`min-w-0 min-h-0 overflow-hidden ${fill ? 'flex-1' : 'shrink-0 grow-0'}`}
    >
      <ExplorerPane winId={win.id} side={side} />
    </div>
  );

  let body: React.ReactNode;
  if (collapsed === 'left') {
    body = (
      <>
        <PaneRail win={win} side="left" vertical={vertical} />
        {paneBox('right', true)}
      </>
    );
  } else if (collapsed === 'right') {
    body = (
      <>
        {paneBox('left', true)}
        <PaneRail win={win} side="right" vertical={vertical} />
      </>
    );
  } else {
    body = (
      <>
        {paneBox('left', false)}
        <div
          onPointerDown={startSplit}
          onDoubleClick={() => store().setSplitter(win.id, 0.5)}
          title="Drag to resize · double-click to even out"
          className={`group shrink-0 flex items-center justify-center bg-ghost-border hover:bg-ghost-accent/60 transition-colors ${
            vertical ? 'h-2 w-full cursor-row-resize' : 'w-2 h-full cursor-col-resize'
          }`}
        >
          <span
            className={`rounded-full bg-ghost-dim group-hover:bg-ghost-text transition-colors ${
              vertical ? 'h-[3px] w-9' : 'w-[3px] h-9'
            }`}
          />
        </div>
        {paneBox('right', true)}
      </>
    );
  }

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

      {/* Dual-pane body — stacks top/bottom in portrait, side-by-side when wide */}
      <div ref={bodyRef} className={`flex-1 flex min-h-0 ${vertical ? 'flex-col' : 'flex-row'}`}>
        {body}
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

/**
 * A minimized pane, shown as a slim rail. It still names the folder that pane is
 * parked in, and stays a live drop target: dragging entries from the other pane
 * (or files from the OS) onto the rail moves/copies them into that folder — so
 * the drag-and-drop workflow survives even when you're down to a single pane.
 */
const PaneRail: React.FC<{ win: WindowState; side: Side; vertical: boolean }> = ({ win, side, vertical }) => {
  const [over, setOver] = useState(false);
  const pane = win.panes[side];
  const folderName = pane.stack.length ? pane.stack[pane.stack.length - 1].name || '/' : 'No folder open';
  const itemCount = pane.entries.length;

  const expand = () => useExplorer.getState().expandPanes(win.id);

  const allowDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
    if (!over) setOver(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const st = useExplorer.getState();
    const copy = e.ctrlKey || e.metaKey;
    if (getDrag()) {
      st.internalDrop(win.id, side, null, copy);
    } else if (e.dataTransfer.files?.length || e.dataTransfer.items?.length) {
      st.externalDrop(win.id, side, e.dataTransfer);
    }
  };

  return (
    <button
      type="button"
      onClick={expand}
      onDragOver={allowDrop}
      onDragEnter={allowDrop}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      title={`${folderName} — click to expand · drop here to add to this pane`}
      className={`group shrink-0 flex items-center gap-2 bg-ghost-surface/70 text-ghost-muted hover:text-ghost-text transition-colors ${
        vertical
          ? 'w-full h-[46px] px-3 border-y border-ghost-border flex-row'
          : 'h-full w-[46px] py-3 border-x border-ghost-border flex-col'
      } ${over ? 'bg-ghost-accent/15 text-ghost-accent ring-1 ring-inset ring-ghost-accent' : ''}`}
    >
      <span className="grid place-items-center w-7 h-7 rounded-lg bg-ghost-card/80 text-ghost-accent shrink-0 group-hover:bg-ghost-accent/20">
        <Icon name="expand" size={15} />
      </span>
      <span className={`flex min-w-0 min-h-0 flex-1 items-center gap-2 ${vertical ? 'flex-row' : 'flex-col'}`}>
        <Icon name="folder" size={14} className="text-ghost-cyan shrink-0" />
        <span
          className="font-medium text-ghost-text overflow-hidden whitespace-nowrap text-ellipsis text-[12px]"
          style={vertical ? { maxWidth: '100%' } : { writingMode: 'vertical-rl', maxHeight: '100%' }}
        >
          {folderName}
        </span>
        <span className="text-[10px] text-ghost-muted shrink-0">
          {itemCount} item{itemCount === 1 ? '' : 's'}
        </span>
      </span>
      {vertical && (
        <span className="text-[10px] uppercase tracking-wider text-ghost-dim shrink-0 hidden sm:inline">tap to open</span>
      )}
    </button>
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
