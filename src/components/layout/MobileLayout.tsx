import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useGKStore } from '../../store';
import { LeftPane } from './LeftPane';
import { FilePane } from '../files/FilePane';
import { TimelinePanel } from '../timeline/TimelinePanel';
import { AnalysisPanel } from '../analysis/AnalysisPanel';
import { LimboPanel } from '../limbo/LimboPanel';
import { Homescreen } from '../homescreen/Homescreen';
import { VaultModal } from '../vault/VaultModal';
import { NotificationToast } from '../common/Toast';

// ─── Mobile Tab Bar ───────────────────────────────────────────────────────────

const PANEL_TABS = [
  { id: 'files' as const, label: 'Files' },
  { id: 'timeline' as const, label: 'Timeline' },
  { id: 'analysis' as const, label: 'Analysis' },
  { id: 'limbo' as const, label: '⚗ Limbo' },
] as const;

const MobileTabBar: React.FC = () => {
  const { activePanel, setActivePanel } = useGKStore();

  return (
    <div className="flex items-center border-b border-ghost-border bg-ghost-surface overflow-x-auto shrink-0">
      {PANEL_TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActivePanel(tab.id)}
          className={`relative px-4 py-3 text-xs font-medium whitespace-nowrap transition-colors ${
            activePanel === tab.id
              ? 'text-ghost-text'
              : 'text-ghost-muted hover:text-ghost-text'
          }`}
        >
          {tab.label}
          {activePanel === tab.id && (
            <motion.div
              layoutId="mobile-tab-indicator"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-ghost-accent"
            />
          )}
        </button>
      ))}
    </div>
  );
};

// ─── Mobile Drawer ────────────────────────────────────────────────────────────

const MobileDrawer: React.FC = () => {
  const { showMobileDrawer, setShowMobileDrawer } = useGKStore();

  return (
    <AnimatePresence>
      {showMobileDrawer && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setShowMobileDrawer(false)}
          />
          {/* Drawer */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-0 top-0 bottom-0 z-50 shadow-2xl"
          >
            <div className="relative h-full">
              <LeftPane />
              <button
                onClick={() => setShowMobileDrawer(false)}
                className="absolute top-4 -right-10 w-8 h-8 flex items-center justify-center bg-ghost-surface rounded-r-lg border border-ghost-border border-l-0"
              >
                <X size={16} className="text-ghost-muted" />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ─── Mobile Content ───────────────────────────────────────────────────────────

const MobileContent: React.FC = () => {
  const { activePanel } = useGKStore();

  if (activePanel === 'homescreen') {
    return <Homescreen />;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activePanel}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -16 }}
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

// ─── Main Mobile Layout ───────────────────────────────────────────────────────

export const MobileLayout: React.FC = () => {
  const { showMobileDrawer, setShowMobileDrawer, activePanel } = useGKStore();

  return (
    <div className="flex flex-col h-full bg-ghost-bg">
      {/* Top header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-ghost-surface border-b border-ghost-border shrink-0">
        <button
          onClick={() => setShowMobileDrawer(true)}
          className="flex items-center gap-2 text-ghost-text hover:text-ghost-accent transition-colors"
        >
          <Menu size={20} />
          <span className="text-sm font-bold">Ghost Key</span>
        </button>
      </div>

      {/* Tab bar (hidden on homescreen) */}
      {activePanel !== 'homescreen' && <MobileTabBar />}

      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        <MobileContent />
      </div>

      {/* Modals & Overlays */}
      <MobileDrawer />
      <VaultModal />
      <NotificationToast />
    </div>
  );
};
