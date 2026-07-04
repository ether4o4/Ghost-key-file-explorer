import React, { useState } from 'react';
import { useExplorer } from '../../store/explorerStore';
import { magnetize, replaceOriginal, deleteSandbox } from '../../core/archive';
import type { SandboxSession, MagnetizeResult } from '../../core/archive';
import { Icon } from './Icons';

/**
 * Shown at the top of the contents view whenever you're browsing inside an
 * archive sandbox. "Magnetize" re-zips the sandbox and compares it to the
 * manifest recorded at extraction: identical → replace the original in place;
 * different → prompt to replace or discard.
 */
export const SandboxBar: React.FC<{ winId: number; currentUri?: string }> = ({ winId, currentUri }) => {
  const sessions = useExplorer((s) => s.sandboxSessions);
  const s = useExplorer.getState;
  const [busy, setBusy] = useState(false);
  const [diff, setDiff] = useState<MagnetizeResult | null>(null);

  const session = currentUri
    ? sessions.find((se) => currentUri === se.sandboxUri || currentUri.startsWith(`${se.sandboxUri}/`))
    : undefined;
  if (!session) return null;

  // Return the top deck to its blank state (the sandbox folder is gone/handled).
  const clearTop = () =>
    useExplorer.setState((st) => ({
      windows: st.windows.map((w) =>
        w.id === winId
          ? {
              ...w,
              panes: { ...w.panes, left: { ...w.panes.left, stack: [], entries: [], selected: [], error: null } },
              topHistory: [],
              topIndex: -1,
              preview: null,
            }
          : w,
      ),
    }));

  const finish = async (ses: SandboxSession, zipBytes: Uint8Array, backup: boolean, msg: string) => {
    await replaceOriginal(ses, zipBytes, backup);
    await deleteSandbox(ses);
    s().removeSandbox(ses.id);
    clearTop();
    s().notify(msg, 'success');
  };

  const onMagnetize = async () => {
    setBusy(true);
    try {
      const result = await magnetize(session);
      if (result.identical) {
        await finish(session, result.zipBytes, false, `Restored "${session.archiveName}" — unchanged`);
      } else {
        setDiff(result); // ask replace / discard
      }
    } catch (e) {
      s().notify(e instanceof Error ? e.message : 'Magnetize failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onDiscardSandbox = async () => {
    if (!window.confirm(`Delete the sandbox for "${session.archiveName}"? The original archive is untouched.`)) return;
    setBusy(true);
    try {
      await deleteSandbox(session);
      s().removeSandbox(session.id);
      clearTop();
      s().notify('Sandbox deleted', 'info');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-ghost-accent/40 bg-ghost-accent/10 shrink-0">
      <Icon name="archive" size={14} className="text-ghost-accent shrink-0" />
      <span className="text-[11px] text-ghost-text min-w-0 flex-1 truncate">
        Sandbox of <span className="font-medium">{session.archiveName}</span> · {session.entries.length} original file
        {session.entries.length === 1 ? '' : 's'}
      </span>
      <button
        onClick={onDiscardSandbox}
        disabled={busy}
        className="shrink-0 px-2 py-1 rounded-md text-[11px] text-ghost-muted hover:text-ghost-red disabled:opacity-50"
      >
        Discard
      </button>
      <button
        onClick={onMagnetize}
        disabled={busy}
        title="Re-zip and restore to the original"
        className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md bg-ghost-accent/25 border border-ghost-accent/50 text-[11px] text-ghost-text hover:bg-ghost-accent/35 disabled:opacity-50 transition-colors"
      >
        <Icon name="magnet" size={13} />
        {busy ? 'Working…' : 'Magnetize'}
      </button>

      {diff && (
        <DiffModal
          session={session}
          result={diff}
          onReplace={async () => {
            setBusy(true);
            setDiff(null);
            try {
              await finish(session, diff.zipBytes, true, `Replaced "${session.archiveName}" (backup kept)`);
            } catch (e) {
              s().notify(e instanceof Error ? e.message : 'Replace failed', 'error');
            } finally {
              setBusy(false);
            }
          }}
          onDiscard={() => setDiff(null)}
        />
      )}
    </div>
  );
};

const DiffModal: React.FC<{
  session: SandboxSession;
  result: MagnetizeResult;
  onReplace: () => void;
  onDiscard: () => void;
}> = ({ session, result, onReplace, onDiscard }) => {
  const { added, removed, modified } = result.diff;
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" onClick={onDiscard}>
      <div className="absolute inset-0 bg-black/55" />
      <div className="relative w-full max-w-[380px] rounded-2xl border border-ghost-border bg-ghost-surface shadow-2xl glass animate-fade-in flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-ghost-border">
          <Icon name="magnet" size={16} className="text-ghost-accent shrink-0" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ghost-text truncate">Contents differ from the original</div>
            <div className="text-[11px] text-ghost-muted truncate">{session.archiveName}</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2 text-[12px]">
          <DiffRow label="Changed" names={modified} color="#ffd700" />
          <DiffRow label="Added" names={added} color="#00ff88" />
          <DiffRow label="Removed" names={removed} color="#ff3355" />
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-ghost-border">
          <button onClick={onDiscard} className="px-3 py-1.5 rounded-lg text-[12px] text-ghost-muted hover:text-ghost-text hover:bg-ghost-card transition-colors">
            Discard re-zip
          </button>
          <button onClick={onReplace} className="px-4 py-1.5 rounded-lg text-[12px] font-medium bg-ghost-accent/25 border border-ghost-accent/50 text-ghost-text hover:bg-ghost-accent/35 transition-colors">
            Replace original
          </button>
        </div>
      </div>
    </div>
  );
};

const DiffRow: React.FC<{ label: string; names: string[]; color: string }> = ({ label, names, color }) => {
  if (names.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-[11px] font-medium text-ghost-text">
          {label} ({names.length})
        </span>
      </div>
      <div className="text-[11px] text-ghost-muted pl-3.5 flex flex-col gap-0.5">
        {names.slice(0, 12).map((n) => (
          <span key={n} className="truncate">{n}</span>
        ))}
        {names.length > 12 && <span>…and {names.length - 12} more</span>}
      </div>
    </div>
  );
};
