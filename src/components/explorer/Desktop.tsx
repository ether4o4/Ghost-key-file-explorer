import { useEffect, useState } from 'react';
import { useExplorer } from '../../store/explorerStore';
import { ExplorerWindow } from './ExplorerWindow';
import { PreviewOverlay } from './PreviewOverlay';
import { Icon } from './Icons';

export const Desktop: React.FC = () => {
  const windows = useExplorer((s) => s.windows);
  const toast = useExplorer((s) => s.toast);
  const init = useExplorer((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="fixed inset-0 gk-desktop overflow-hidden select-none">
      <div className="absolute inset-0 gk-grid-overlay pointer-events-none opacity-60" />

      {/* Brand watermark */}
      <div className="absolute top-6 left-6 pointer-events-none">
        <div className="text-2xl font-bold tracking-tight text-ghost-text/90">
          👻 Ghost <span className="text-ghost-accent">Explorer</span>
        </div>
        <div className="text-[11px] text-ghost-muted mt-0.5 font-mono">dual-pane · drag &amp; drop · no indexing</div>
      </div>

      {/* Windows layer (above wallpaper, below taskbar) */}
      <div className="absolute inset-x-0 top-0" style={{ bottom: 48 }}>
        {windows.map((w) => (
          <ExplorerWindow key={w.id} win={w} />
        ))}
        {windows.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={() => useExplorer.getState().newWindow()}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-ghost-accent/15 border border-ghost-accent/40 text-ghost-text hover:bg-ghost-accent/25 transition-colors"
            >
              <Icon name="folderOpen" size={20} className="text-ghost-accent" />
              Open Explorer Window
            </button>
          </div>
        )}
      </div>

      <Taskbar />

      {toast && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 bottom-14 z-[100] px-4 py-2 rounded-lg text-[12px] font-medium shadow-xl glass animate-fade-in border ${
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

      <PreviewOverlay />
    </div>
  );
};

const Taskbar: React.FC = () => {
  const windows = useExplorer((s) => s.windows);
  const zTop = useExplorer((s) => s.zTop);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000 * 30);
    return () => window.clearInterval(t);
  }, []);

  const onTaskClick = (id: number, minimized: boolean, focused: boolean) => {
    const st = useExplorer.getState();
    if (minimized) st.unminimize(id);
    else if (focused) st.minimize(id);
    else st.focusWindow(id);
  };

  return (
    <div className="absolute bottom-0 inset-x-0 h-12 flex items-center gap-2 px-2 bg-ghost-surface/85 backdrop-blur border-t border-ghost-border z-50">
      <button
        onClick={() => useExplorer.getState().newWindow()}
        title="New window"
        className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-ghost-accent/20 border border-ghost-accent/40 text-ghost-text hover:bg-ghost-accent/30 transition-colors shrink-0"
      >
        <Icon name="plus" size={15} className="text-ghost-accent" />
        <span className="text-[12px] font-medium hidden sm:inline">New Window</span>
      </button>

      <div className="w-px h-6 bg-ghost-border" />

      <div className="flex items-center gap-1.5 flex-1 overflow-x-auto no-scrollbar">
        {windows.map((w) => {
          const focused = w.z === zTop && !w.minimized;
          return (
            <button
              key={w.id}
              onClick={() => onTaskClick(w.id, w.minimized, focused)}
              title={w.title}
              className={`flex items-center gap-2 px-3 h-9 rounded-lg border transition-colors shrink-0 max-w-[200px] ${
                focused
                  ? 'bg-ghost-card border-ghost-accent/50 text-ghost-text'
                  : w.minimized
                    ? 'bg-transparent border-ghost-border/60 text-ghost-muted'
                    : 'bg-ghost-card/50 border-ghost-border text-ghost-text/90 hover:bg-ghost-card'
              }`}
            >
              <Icon name="folderOpen" size={14} className={focused ? 'text-ghost-accent' : 'text-ghost-muted'} />
              <span className="text-[12px] truncate">{w.title}</span>
            </button>
          );
        })}
      </div>

      <div className="text-[11px] text-ghost-muted font-mono px-2 shrink-0">
        {clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
};
