import { useEffect, useState } from 'react';
import { useExplorer } from '../../store/explorerStore';
import { ExplorerWindow } from './ExplorerWindow';
import { Icon } from './Icons';

export const Desktop: React.FC = () => {
  const windows = useExplorer((s) => s.windows);
  const toast = useExplorer((s) => s.toast);
  const init = useExplorer((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="fixed inset-0 ns-desktop overflow-hidden select-none">
      {/* Brand watermark */}
      <div className="absolute top-6 left-6 pointer-events-none">
        <div className="text-2xl font-bold tracking-tight text-white/95 [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]">
          NeverSoft <span className="text-sky-200">Services</span>
        </div>
        <div className="text-[11px] text-white/70 mt-0.5 [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">File Explorer</div>
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
              className="aero-glass aero-reflect animate-aero-pulse flex items-center gap-2 px-5 py-3 rounded-xl text-white hover:bg-white/25 transition-colors duration-hover [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]"
            >
              <Icon name="folderOpen" size={20} className="text-white" />
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
    <div className="aero-glass aero-reflect absolute bottom-0 inset-x-0 h-12 flex items-center gap-2 px-2 border-t border-white/35 z-50">
      <button
        onClick={() => useExplorer.getState().newWindow()}
        title="New window"
        className="animate-aero-pulse flex items-center gap-1.5 px-3 h-9 rounded-full bg-white/15 border border-white/40 text-white hover:bg-white/30 transition-colors duration-hover active:duration-press shrink-0 [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]"
      >
        <Icon name="plus" size={15} className="text-white" />
        <span className="text-[12px] font-medium hidden sm:inline">New Window</span>
      </button>

      <div className="w-px h-6 bg-white/30" />

      <div className="flex items-center gap-1.5 flex-1 overflow-x-auto no-scrollbar">
        {windows.map((w) => {
          const focused = w.z === zTop && !w.minimized;
          return (
            <button
              key={w.id}
              onClick={() => onTaskClick(w.id, w.minimized, focused)}
              title={w.title}
              className={`flex items-center gap-2 px-3 h-9 rounded-lg border transition-colors duration-hover shrink-0 max-w-[200px] [text-shadow:0_1px_2px_rgba(0,0,0,0.4)] ${
                focused
                  ? 'bg-white/30 border-white/55 text-white'
                  : w.minimized
                    ? 'bg-transparent border-white/20 text-white/55'
                    : 'bg-white/10 border-white/30 text-white/90 hover:bg-white/20'
              }`}
            >
              <Icon name="folderOpen" size={14} className={focused ? 'text-white' : 'text-white/65'} />
              <span className="text-[12px] truncate">{w.title}</span>
            </button>
          );
        })}
      </div>

      <div className="text-[11px] text-white/85 font-mono px-2 shrink-0 [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">
        {clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
};
