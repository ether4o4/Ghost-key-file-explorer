import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, AlertTriangle, Info, X, XCircle } from 'lucide-react';
import { useGKStore } from '../../store';

const ICONS = {
  success: <CheckCircle size={14} />,
  error: <XCircle size={14} />,
  warn: <AlertTriangle size={14} />,
  info: <Info size={14} />,
};

const COLORS = {
  success: { bg: 'rgba(0,255,136,0.12)', border: 'rgba(0,255,136,0.3)', text: '#00ff88' },
  error: { bg: 'rgba(255,51,85,0.12)', border: 'rgba(255,51,85,0.3)', text: '#ff3355' },
  warn: { bg: 'rgba(255,215,0,0.12)', border: 'rgba(255,215,0,0.3)', text: '#ffd700' },
  info: { bg: 'rgba(108,99,255,0.12)', border: 'rgba(108,99,255,0.3)', text: '#6c63ff' },
};

export const NotificationToast: React.FC = () => {
  const { notification, clearNotification } = useGKStore();

  return (
    <div className="fixed bottom-4 right-4 z-[100]">
      <AnimatePresence>
        {notification && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl max-w-xs"
            style={{
              background: COLORS[notification.type].bg,
              borderColor: COLORS[notification.type].border,
              backdropFilter: 'blur(12px)',
            }}
          >
            <span style={{ color: COLORS[notification.type].text }}>
              {ICONS[notification.type]}
            </span>
            <span className="text-xs text-ghost-text flex-1">{notification.message}</span>
            <button
              onClick={clearNotification}
              className="text-ghost-muted hover:text-ghost-text shrink-0"
            >
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
