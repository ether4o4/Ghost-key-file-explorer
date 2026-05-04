import React from 'react';
import { FlaskConical, Play, CheckCircle, AlertTriangle, X, ChevronRight } from 'lucide-react';
import { useGKStore } from '../../store';
import { Button, Badge } from '../common/UI';
import { limboStatusColor } from '../../core/limbo';
import { formatDate } from '../../utils/format';

const StatusBadge: React.FC<{ status: import('../../core/db').LimboStatus }> = ({ status }) => {
  const color = limboStatusColor(status);
  const labels = { pending: 'Pending', analyzing: 'Analyzing…', clean: 'Clean', flagged: '⚠ Flagged' };
  return <Badge color={color} size="xs">{labels[status]}</Badge>;
};

// ─── Limbo Session Detail ─────────────────────────────────────────────────────

const LimboSessionDetail: React.FC<{
  session: import('../../core/db').GKLimboSession;
  onClose: () => void;
}> = ({ session, onClose }) => {
  const { analyzeLimbo, releaseLimbo } = useGKStore();
  const [loading, setLoading] = React.useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    await analyzeLimbo(session.id!);
    setLoading(false);
  };

  const handleRelease = async () => {
    setLoading(true);
    await releaseLimbo(session.id!);
    setLoading(false);
    onClose();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical size={14} className="text-ghost-orange" />
          <span className="text-sm font-medium text-ghost-text">{session.name}</span>
        </div>
        <StatusBadge status={session.status} />
      </div>

      <div className="text-xs text-ghost-muted">
        {session.fileIds.length} file{session.fileIds.length !== 1 ? 's' : ''} · Opened {formatDate(session.openedAt)}
      </div>

      {/* Analysis log */}
      <div className="relative rounded-lg bg-ghost-bg border border-ghost-border overflow-hidden">
        <div className="scanline" />
        <div className="p-3 max-h-48 overflow-y-auto font-mono text-[10px] text-ghost-green/80 space-y-0.5">
          {session.analysisLog.map((line, i) => (
            <div key={i} className={line.includes('⚠') || line.includes('flag') ? 'text-ghost-red' : ''}>
              {line}
            </div>
          ))}
          {loading && (
            <div className="animate-pulse text-ghost-yellow">⟳ Running analysis...</div>
          )}
        </div>
      </div>

      {/* Extracted entities */}
      {session.extractedEntities && (
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          {Object.entries(session.extractedEntities).map(([key, values]) =>
            (values as string[]).length > 0 ? (
              <div key={key} className="bg-ghost-card rounded-lg border border-ghost-border p-2">
                <div className="text-ghost-muted uppercase tracking-wider text-[8px] mb-1">{key}</div>
                <div className="space-y-0.5">
                  {(values as string[]).slice(0, 3).map((v, i) => (
                    <div key={i} className="text-ghost-text truncate">{v}</div>
                  ))}
                  {(values as string[]).length > 3 && (
                    <div className="text-ghost-muted">+{(values as string[]).length - 3} more</div>
                  )}
                </div>
              </div>
            ) : null
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {session.status === 'pending' && (
          <Button
            variant="primary"
            onClick={handleAnalyze}
            disabled={loading}
            icon={<Play size={12} />}
            className="flex-1 justify-center"
          >
            Run Analysis
          </Button>
        )}
        {(session.status === 'clean' || session.status === 'flagged') && (
          <Button
            variant={session.status === 'clean' ? 'primary' : 'danger'}
            onClick={handleRelease}
            disabled={loading}
            icon={session.status === 'clean' ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
            className="flex-1 justify-center"
          >
            {session.status === 'clean' ? 'Release to Library' : 'Release (Flagged)'}
          </Button>
        )}
        <Button variant="ghost" onClick={onClose} icon={<X size={12} />}>Close</Button>
      </div>
    </div>
  );
};

// ─── Limbo Panel (sidebar version) ───────────────────────────────────────────

export const LimboPanel: React.FC = () => {
  const { limboSessions, activeLimboId, setActiveLimbo } = useGKStore();
  const activeSession = limboSessions.find(s => s.id === activeLimboId);

  if (activeSession) {
    return (
      <div className="p-4">
        <LimboSessionDetail session={activeSession} onClose={() => setActiveLimbo(null)} />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <FlaskConical size={14} className="text-ghost-orange" />
        <span className="text-xs font-medium text-ghost-text">Limbo Sandbox</span>
        <span className="text-[9px] text-ghost-muted ml-auto">{limboSessions.length} session{limboSessions.length !== 1 ? 's' : ''}</span>
      </div>

      {limboSessions.length === 0 ? (
        <div className="text-center py-8 text-ghost-muted text-xs">
          <FlaskConical size={24} className="mx-auto mb-2 opacity-30" />
          No Limbo sessions<br />
          <span className="text-[9px]">Drag suspicious files here to inspect safely</span>
        </div>
      ) : (
        <div className="space-y-2">
          {limboSessions.map(session => (
            <button
              key={session.id}
              onClick={() => setActiveLimbo(session.id!)}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-ghost-border hover:border-ghost-accent/40 bg-ghost-card text-left transition-colors"
            >
              <FlaskConical size={14} className="text-ghost-orange shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-ghost-text truncate">{session.name}</div>
                <div className="text-[9px] text-ghost-muted">{session.fileIds.length} file{session.fileIds.length !== 1 ? 's' : ''}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <StatusBadge status={session.status} />
                <ChevronRight size={12} className="text-ghost-muted" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
