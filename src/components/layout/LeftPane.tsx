import React from 'react';
import {
  Home, Files, Clock, Brain, Lock, FlaskConical,
  FolderOpen, Link, ChevronRight, Tag,
  AlertTriangle, Pin
} from 'lucide-react';
import { useGKStore } from '../../store';
import { vaultTypeColor } from '../../core/vault';
import { limboStatusColor } from '../../core/limbo';

// ─── Nav Item ─────────────────────────────────────────────────────────────────

const NavItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
  color?: string;
  indent?: boolean;
}> = ({ icon, label, active, onClick, count, color, indent }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left transition-all duration-100 ${
      active
        ? 'bg-ghost-accent/15 text-ghost-text'
        : 'text-ghost-muted hover:text-ghost-text hover:bg-ghost-card/60'
    } ${indent ? 'ml-3 w-[calc(100%-0.75rem)]' : ''}`}
  >
    <span className={`shrink-0 ${active ? 'text-ghost-accent' : ''}`} style={color ? { color } : undefined}>
      {icon}
    </span>
    <span className="flex-1 text-xs truncate">{label}</span>
    {count !== undefined && (
      <span className={`text-[9px] px-1 rounded ${active ? 'bg-ghost-accent/20 text-ghost-accent' : 'text-ghost-dim'}`}>
        {count}
      </span>
    )}
  </button>
);

// ─── Sources Section ──────────────────────────────────────────────────────────

const SOURCES = [
  { id: 'Downloads', icon: '⬇', color: '#6c63ff' },
  { id: 'Desktop', icon: '🖥', color: '#00d4ff' },
  { id: 'iCloud', icon: '☁', color: '#00d4ff' },
  { id: 'Snapchat', icon: '👻', color: '#ffd700' },
  { id: 'Instagram', icon: '📸', color: '#ff6b35' },
  { id: 'WhatsApp', icon: '💬', color: '#00ff88' },
  { id: 'Telegram', icon: '✈', color: '#00d4ff' },
  { id: 'Email', icon: '📧', color: '#6c63ff' },
];

const SourcesSection: React.FC = () => {
  const { files, setSearch, performSearch } = useGKStore();

  const sourceCounts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const f of files) {
      const src = f.source;
      for (const s of SOURCES) {
        if (src.toLowerCase().includes(s.id.toLowerCase())) {
          map.set(s.id, (map.get(s.id) ?? 0) + 1);
        }
      }
    }
    return map;
  }, [files]);

  const handleSourceClick = (source: string) => {
    setSearch('', { where: [source] });
    performSearch();
  };

  return (
    <div className="space-y-0.5">
      {SOURCES.map(s => {
        const count = sourceCounts.get(s.id) ?? 0;
        if (count === 0) return null;
        return (
          <button
            key={s.id}
            onClick={() => handleSourceClick(s.id)}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-ghost-muted hover:text-ghost-text hover:bg-ghost-card/60 transition-all text-xs"
          >
            <span>{s.icon}</span>
            <span className="flex-1 truncate">{s.id}</span>
            <span className="text-[9px] text-ghost-dim">{count}</span>
          </button>
        );
      })}
    </div>
  );
};

// ─── Left Pane ────────────────────────────────────────────────────────────────

export const LeftPane: React.FC = () => {
  const {
    activePanel, leftSection, setActivePanel, setLeftSection,
    files, bundles, vaults, limboSessions, clusters,
    setActiveBundle, activeBundleId,
    setActiveVault, setShowVaultModal, setActiveLimbo,
    setActiveSKU, activeSKU,
    timeline,
  } = useGKStore();

  const flaggedCount = files.filter(f => f.isFlagged).length;
  const pinnedCount = files.filter(f => f.isPinned).length;

  return (
    <div className="flex flex-col h-full bg-ghost-surface border-r border-ghost-border w-52 shrink-0">
      {/* App header */}
      <div className="px-4 py-4 border-b border-ghost-border">
        <div className="flex items-center gap-2">
          <span className="text-xl">👻</span>
          <div>
            <div className="text-sm font-bold text-ghost-text">Ghost Key</div>
            <div className="text-[9px] text-ghost-muted">File Intelligence</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {/* Main nav */}
        <div className="space-y-0.5">
          <NavItem
            icon={<Home size={14} />}
            label="Homescreen"
            active={activePanel === 'homescreen'}
            onClick={() => setActivePanel('homescreen')}
          />
          <NavItem
            icon={<Files size={14} />}
            label="All Files"
            active={activePanel === 'files' && leftSection === 'all'}
            onClick={() => { setActivePanel('files'); setLeftSection('all'); setActiveBundle(null); }}
            count={files.length}
          />
          <NavItem
            icon={<Clock size={14} />}
            label="Timeline"
            active={activePanel === 'timeline'}
            onClick={() => setActivePanel('timeline')}
            count={timeline.length}
          />
          <NavItem
            icon={<Brain size={14} />}
            label="Analysis"
            active={activePanel === 'analysis'}
            onClick={() => setActivePanel('analysis')}
          />
        </div>

        {/* Filters */}
        <div>
          <div className="px-3 mb-1 text-[9px] text-ghost-dim uppercase tracking-wider">Filters</div>
          <div className="space-y-0.5">
            {flaggedCount > 0 && (
              <NavItem
                icon={<AlertTriangle size={13} />}
                label="Flagged"
                active={false}
                onClick={() => { setActivePanel('files'); setLeftSection('all'); useGKStore.getState().setSearch('', {}); }}
                count={flaggedCount}
                color="#ff3355"
              />
            )}
            {pinnedCount > 0 && (
              <NavItem
                icon={<Pin size={13} />}
                label="Pinned"
                active={false}
                onClick={() => {}}
                count={pinnedCount}
                color="#6c63ff"
              />
            )}
          </div>
        </div>

        {/* Sources */}
        <div>
          <button
            className="w-full flex items-center gap-1.5 px-3 mb-1 text-[9px] text-ghost-dim uppercase tracking-wider hover:text-ghost-muted"
            onClick={() => setLeftSection(leftSection === 'sources' ? 'all' : 'sources')}
          >
            <Tag size={9} />
            Sources
            <ChevronRight size={9} className={`ml-auto transition-transform ${leftSection === 'sources' ? 'rotate-90' : ''}`} />
          </button>
          <SourcesSection />
        </div>

        {/* Bundles */}
        <div>
          <button
            className="w-full flex items-center gap-1.5 px-3 mb-1 text-[9px] text-ghost-dim uppercase tracking-wider hover:text-ghost-muted"
            onClick={() => setLeftSection(leftSection === 'bundles' ? 'all' : 'bundles')}
          >
            <FolderOpen size={9} />
            Bundles
            <span className="ml-auto text-ghost-dim">{bundles.length}</span>
          </button>
          {bundles.slice(0, 8).map(bundle => (
            <NavItem
              key={bundle.id}
              icon={<FolderOpen size={13} />}
              label={bundle.name}
              active={activeBundleId === bundle.id}
              onClick={() => {
                setActiveBundle(bundle.id!);
                setActivePanel('files');
                setLeftSection('bundles');
              }}
              count={bundle.fileIds.length}
              color={bundle.color}
              indent
            />
          ))}
        </div>

        {/* Vaults */}
        <div>
          <button
            className="w-full flex items-center gap-1.5 px-3 mb-1 text-[9px] text-ghost-dim uppercase tracking-wider hover:text-ghost-muted"
            onClick={() => setShowVaultModal(true)}
          >
            <Lock size={9} />
            Vaults
            <span className="ml-auto text-ghost-dim">{vaults.length}</span>
          </button>
          {vaults.slice(0, 4).map(vault => (
            <NavItem
              key={vault.id}
              icon={<Lock size={13} />}
              label={vault.name}
              active={false}
              onClick={() => {
                setActiveVault(vault.id!);
                setShowVaultModal(true);
              }}
              count={vault.fileIds.length}
              color={vaultTypeColor(vault.type)}
              indent
            />
          ))}
        </div>

        {/* Limbo */}
        <div>
          <button
            className="w-full flex items-center gap-1.5 px-3 mb-1 text-[9px] text-ghost-dim uppercase tracking-wider hover:text-ghost-muted"
            onClick={() => setActivePanel('limbo')}
          >
            <FlaskConical size={9} />
            Limbo
            <span className="ml-auto text-ghost-dim">{limboSessions.length}</span>
          </button>
          {limboSessions.slice(0, 3).map(session => (
            <NavItem
              key={session.id}
              icon={<FlaskConical size={13} />}
              label={session.name}
              active={false}
              onClick={() => {
                setActiveLimbo(session.id!);
                setActivePanel('limbo');
              }}
              color={limboStatusColor(session.status)}
              indent
            />
          ))}
        </div>

        {/* SKU Clusters */}
        {clusters.length > 0 && (
          <div>
            <div className="px-3 mb-1 text-[9px] text-ghost-dim uppercase tracking-wider flex items-center gap-1">
              <Link size={9} />
              SKU Clusters
              <span className="ml-auto">{clusters.length}</span>
            </div>
            {clusters.slice(0, 5).map(cluster => (
              <button
                key={cluster.id}
                onClick={() => setActiveSKU(cluster.rootSku)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 ml-3 rounded-lg text-xs transition-all ${
                  activeSKU === cluster.rootSku
                    ? 'bg-ghost-accent/15 text-ghost-accent'
                    : 'text-ghost-muted hover:text-ghost-text hover:bg-ghost-card/60'
                }`}
              >
                <Link size={11} className="shrink-0" />
                <span className="flex-1 truncate font-mono text-[9px]">{cluster.rootSku}</span>
                <span className="text-[8px] text-ghost-dim">{cluster.memberSkus.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-ghost-border">
        <div className="text-[9px] text-ghost-dim">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-ghost-green" />
            Local-first · No cloud
          </div>
          <div>{files.length} files indexed</div>
        </div>
      </div>
    </div>
  );
};
