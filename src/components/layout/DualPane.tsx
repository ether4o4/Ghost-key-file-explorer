import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGKStore } from '../../store';
import { LeftPane } from './LeftPane';
import { FilePane } from '../files/FilePane';
import { TimelinePanel } from '../timeline/TimelinePanel';
import { AnalysisPanel } from '../analysis/AnalysisPanel';
import { LimboPanel } from '../limbo/LimboPanel';
import { Homescreen } from '../homescreen/Homescreen';
import { VaultModal } from '../vault/VaultModal';
import { NotificationToast } from '../common/Toast';

// ─── Right Panel Tab Bar ──────────────────────────────────────────────────────

const PANEL_TABS = [
  { id: 'files' as const, label: 'Files' },
  { id: 'timeline' as const, label: 'Timeline' },
  { id: 'analysis' as const, label: 'Analysis' },
  { id: 'limbo' as const, label: '⚗ Limbo' },
] as const;

const RightPanelTabs: React.FC = () => {
  const { activePanel, setActivePanel } = useGKStore();

  return (
    <div className="flex items-center border-b border-ghost-border px-3 shrink-0">
      {PANEL_TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActivePanel(tab.id)}
          className={`relative px-3 py-2.5 text-xs font-medium transition-colors ${
            activePanel === tab.id
              ? 'text-ghost-text'
              : 'text-ghost-muted hover:text-ghost-text'
          }`}
        >
          {tab.label}
          {activePanel === tab.id && (
            <motion.div
              layoutId="tab-indicator"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-ghost-accent"
            />
          )}
        </button>
      ))}
    </div>
  );
};

// ─── Right Panel Content ──────────────────────────────────────────────────────

const RightPanelContent: React.FC = () => {
  const { activePanel } = useGKStore();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activePanel}
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -8 }}
        transition={{ duration: 0.15 }}
        className="flex-1 overflow-hidden"
      >
        {activePanel === 'files' && <FilePane />}
        {activePanel === 'timeline' && <TimelinePanel />}
        {activePanel === 'analysis' && <AnalysisPanel />}
        {activePanel === 'limbo' && <LimboPanel />}
      </motion.div>
    </AnimatePresence>
  );
};

// ─── Main Dual Pane Layout ────────────────────────────────────────────────────

export const DualPane: React.FC = () => {
  const { activePanel } = useGKStore();

  if (activePanel === 'homescreen') {
    return (
      <div className="flex h-full bg-ghost-bg">
        <LeftPane />
        <div className="flex-1 overflow-hidden bg-ghost-bg">
          <Homescreen />
        </div>
        <VaultModal />
        <NotificationToast />
      </div>
    );
  }

  return (
    <div className="flex h-full bg-ghost-bg">
      {/* Left pane */}
      <LeftPane />

      {/* Right pane */}
      <div className="flex-1 flex flex-col overflow-hidden bg-ghost-bg">
        <RightPanelTabs />
        <div className="flex-1 overflow-hidden">
          <RightPanelContent />
        </div>
      </div>

      {/* Modals */}
      <VaultModal />
      <NotificationToast />
    </div>
  );
};
