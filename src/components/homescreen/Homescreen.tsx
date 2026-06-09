import React from 'react';
import { motion } from 'framer-motion';
import {
  FolderOpen, Clock, Search, Link, Lock, Brain,
  Pin, X, LayoutGrid, Plus, Zap
} from 'lucide-react';
import { useGKStore } from '../../store';
import type { GKWidget, GKBundle } from '../../core/db';
import { Badge, Button } from '../common/UI';
import { formatDate } from '../../utils/format';

// ─── Widget Icons ─────────────────────────────────────────────────────────────

const WIDGET_ICONS: Record<GKWidget['type'], React.ReactNode> = {
  bundle: <FolderOpen size={18} />,
  timeline: <Clock size={18} />,
  search: <Search size={18} />,
  sku: <Link size={18} />,
  vault: <Lock size={18} />,
  analysis: <Brain size={18} />,
};

// ─── Widget Card ──────────────────────────────────────────────────────────────

const WidgetCard: React.FC<{ widget: GKWidget; onRemove: () => void; onClick: () => void }> = ({
  widget, onRemove, onClick
}) => {
  const { bundles, vaults, files, clusters, timeline } = useGKStore();

  // Get live data preview
  const liveData = React.useMemo(() => {
    switch (widget.type) {
      case 'bundle': {
        const bundle = bundles.find(b => b.id === widget.config.bundleId);
        return bundle ? `${bundle.fileIds.length} files` : 'Bundle';
      }
      case 'timeline':
        return `${timeline.slice(0, 3).map(e => e.description.slice(0, 30)).join(' · ')}`;
      case 'search':
        return `Query: ${widget.config.query ?? '—'}`;
      case 'sku':
        return `${clusters.length} cluster${clusters.length !== 1 ? 's' : ''}`;
      case 'vault':
        return `${vaults.length} vault${vaults.length !== 1 ? 's' : ''}`;
      case 'analysis':
        return `${files.filter(f => f.analysisResult).length} analyzed`;
      default:
        return '';
    }
  }, [widget, bundles, vaults, files, clusters, timeline]);

  const sizeClasses = {
    sm: 'col-span-1 row-span-1',
    md: 'col-span-1 row-span-1',
    lg: 'col-span-2 row-span-1',
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className={`widget-card relative group cursor-pointer ${sizeClasses[widget.size]}`}
      onClick={onClick}
    >
      <div
        className="h-full rounded-xl border bg-ghost-card p-4 transition-all duration-200 hover:border-opacity-80"
        style={{
          borderColor: `${widget.color}40`,
          background: `linear-gradient(135deg, ${widget.color}08 0%, ${widget.color}04 100%)`,
        }}
      >
        {/* Remove button */}
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-ghost-border text-ghost-muted hover:text-ghost-red transition-all"
        >
          <X size={10} />
        </button>

        {/* Icon */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
          style={{ background: `${widget.color}20`, color: widget.color }}
        >
          {WIDGET_ICONS[widget.type]}
        </div>

        {/* Label */}
        <div className="text-xs font-semibold text-ghost-text mb-1 truncate">{widget.label}</div>

        {/* Live data preview */}
        <div className="text-[9px] text-ghost-muted leading-relaxed line-clamp-2">{liveData}</div>

        {/* Type badge */}
        <div className="mt-2">
          <Badge color={widget.color} size="xs">{widget.type}</Badge>
        </div>
      </div>
    </motion.div>
  );
};

// ─── Pinned Bundle Card ───────────────────────────────────────────────────────

const PinnedBundleCard: React.FC<{ bundle: GKBundle; onClick: () => void; onUnpin: () => void }> = ({
  bundle, onClick, onUnpin
}) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    className="widget-card relative group cursor-pointer"
    onClick={onClick}
  >
    <div
      className="rounded-xl border p-4 bg-ghost-card transition-all duration-200 hover:brightness-110"
      style={{ borderColor: `${bundle.color}40` }}
    >
      <button
        onClick={e => { e.stopPropagation(); onUnpin(); }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-ghost-border text-ghost-muted transition-all"
      >
        <X size={10} />
      </button>
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
        style={{ background: `${bundle.color}20`, color: bundle.color }}
      >
        <FolderOpen size={18} />
      </div>
      <div className="text-xs font-semibold text-ghost-text mb-1 truncate">{bundle.name}</div>
      <div className="text-[9px] text-ghost-muted">{bundle.fileIds.length} files</div>
      <div className="text-[8px] text-ghost-dim mt-1">{formatDate(bundle.updatedAt)}</div>
    </div>
  </motion.div>
);

// ─── Quick Action Card ────────────────────────────────────────────────────────

const QuickAction: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  color: string;
}> = ({ icon, label, onClick, color }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-ghost-border hover:border-opacity-60 bg-ghost-card transition-all duration-150 hover:-translate-y-0.5"
    style={{ borderColor: `${color}30` }}
  >
    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}18`, color }}>
      {icon}
    </div>
    <span className="text-[10px] text-ghost-muted">{label}</span>
  </button>
);

// ─── Homescreen ───────────────────────────────────────────────────────────────

export const Homescreen: React.FC = () => {
  const {
    widgets, bundles, removeWidget, pinBundle,
    setActivePanel, setLeftSection, setActiveBundle,
    setShowVaultModal, setShowAnalysisPanel,
    timeline, files, vaults,
  } = useGKStore();

  const pinnedBundles = bundles.filter(b => b.isPinned);
  const recentEvents = timeline.slice(0, 5);

  return (
    <div className="h-full overflow-y-auto px-6 py-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-ghost-text flex items-center gap-2">
            <span className="text-ghost-accent">👻</span> Ghost Key
          </h1>
          <p className="text-xs text-ghost-muted mt-0.5">
            {files.length} file{files.length !== 1 ? 's' : ''} indexed · {timeline.length} event{timeline.length !== 1 ? 's' : ''} tracked
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge color="#6c63ff" glow>Local-First</Badge>
          <Badge color="#00ff88">Encrypted</Badge>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Files', value: files.length, color: '#6c63ff', icon: '📁' },
          { label: 'Events', value: timeline.length, color: '#00d4ff', icon: '⚡' },
          { label: 'Bundles', value: bundles.length, color: '#00ff88', icon: '📦' },
          { label: 'Vaults', value: vaults.length, color: '#ffd700', icon: '🔒' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-ghost-border bg-ghost-card p-3">
            <div className="text-lg font-bold font-mono" style={{ color: stat.color }}>
              {stat.icon} {stat.value}
            </div>
            <div className="text-[9px] text-ghost-muted uppercase tracking-wide mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <div className="text-xs text-ghost-muted uppercase tracking-wider mb-3">Quick Actions</div>
        <div className="grid grid-cols-4 gap-3">
          <QuickAction
            icon={<Plus size={16} />}
            label="Import Files"
            onClick={() => { setActivePanel('files'); setLeftSection('all'); }}
            color="#6c63ff"
          />
          <QuickAction
            icon={<Lock size={16} />}
            label="Vaults"
            onClick={() => setShowVaultModal(true)}
            color="#ffd700"
          />
          <QuickAction
            icon={<Zap size={16} />}
            label="Limbo"
            onClick={() => { setActivePanel('limbo'); }}
            color="#ff6b35"
          />
          <QuickAction
            icon={<Brain size={16} />}
            label="Analyze"
            onClick={() => { setActivePanel('analysis'); setShowAnalysisPanel(true); }}
            color="#ff3355"
          />
        </div>
      </div>

      {/* Pinned Bundles */}
      {pinnedBundles.length > 0 && (
        <div>
          <div className="text-xs text-ghost-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <Pin size={10} />
            Pinned Bundles
          </div>
          <div className="grid grid-cols-2 gap-3">
            {pinnedBundles.map(b => (
              <PinnedBundleCard
                key={b.id}
                bundle={b}
                onClick={() => {
                  setActivePanel('files');
                  setActiveBundle(b.id!);
                  setLeftSection('bundles');
                }}
                onUnpin={() => pinBundle(b.id!, false)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Custom Widgets */}
      {widgets.length > 0 && (
        <div>
          <div className="text-xs text-ghost-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <LayoutGrid size={10} />
            Pinned Widgets
          </div>
          <div className="grid grid-cols-2 gap-3">
            {widgets.map(w => (
              <WidgetCard
                key={w.id}
                widget={w}
                onRemove={() => removeWidget(w.id!)}
                onClick={() => {
                  if (w.type === 'timeline') setActivePanel('timeline');
                  else if (w.type === 'vault') setShowVaultModal(true);
                  else if (w.type === 'analysis') setActivePanel('analysis');
                  else if (w.type === 'bundle') setActivePanel('files');
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {recentEvents.length > 0 && (
        <div>
          <div className="text-xs text-ghost-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock size={10} />
            Recent Activity
          </div>
          <div className="space-y-1.5">
            {recentEvents.map((e, i) => (
              <div key={e.id ?? i} className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-ghost-card/50 border border-ghost-border/50">
                <span className="w-1.5 h-1.5 rounded-full bg-ghost-accent shrink-0" />
                <span className="text-xs text-ghost-text flex-1 truncate">{e.description}</span>
                <span className="text-[9px] text-ghost-muted shrink-0">{formatDate(e.timestamp)}</span>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="xs"
            className="mt-2"
            onClick={() => setActivePanel('timeline')}
          >
            View full timeline →
          </Button>
        </div>
      )}

      {/* Empty state */}
      {files.length === 0 && (
        <div className="text-center py-8 border-2 border-dashed border-ghost-border rounded-xl">
          <div className="text-3xl mb-3">💠</div>
          <p className="text-sm font-medium text-ghost-text">Welcome to NeverSoft Services</p>
          <p className="text-xs text-ghost-muted mt-1 mb-4">
            Import files to start building your intelligence system
          </p>
          <Button
            variant="primary"
            onClick={() => { setActivePanel('files'); setLeftSection('all'); }}
            icon={<Plus size={14} />}
          >
            Import First Files
          </Button>
        </div>
      )}
    </div>
  );
};
