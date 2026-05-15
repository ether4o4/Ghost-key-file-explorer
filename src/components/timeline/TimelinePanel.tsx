import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Eye, Tag, Brain, Link, Lock, FlaskConical,
  CheckCircle, FolderPlus, Pin, Search, Activity, Zap
} from 'lucide-react';
import { useGKStore } from '../../store';
import type { GKTimelineEvent, TimelineEventType } from '../../core/db';
import { relativeTime, eventTypeColor, eventTypeIcon } from '../../core/timeline';
import { EmptyState } from '../common/UI';

const ICON_MAP: Record<string, React.ReactNode> = {
  Upload: <Upload size={12} />,
  Eye: <Eye size={12} />,
  Tag: <Tag size={12} />,
  Brain: <Brain size={12} />,
  Link: <Link size={12} />,
  Lock: <Lock size={12} />,
  FlaskConical: <FlaskConical size={12} />,
  CheckCircle: <CheckCircle size={12} />,
  FolderPlus: <FolderPlus size={12} />,
  Pin: <Pin size={12} />,
  Search: <Search size={12} />,
  Activity: <Activity size={12} />,
};

const EventIcon: React.FC<{ type: TimelineEventType }> = ({ type }) => {
  const iconName = eventTypeIcon(type);
  const color = eventTypeColor(type);
  return (
    <span
      className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
      style={{ background: `${color}20`, color, border: `1px solid ${color}30` }}
    >
      {ICON_MAP[iconName] ?? <Activity size={12} />}
    </span>
  );
};

const TimelineEventRow: React.FC<{ event: GKTimelineEvent; index: number }> = ({ event, index }) => {
  const color = eventTypeColor(event.type);

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      className="flex items-start gap-3 group"
    >
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <EventIcon type={event.type} />
        <div className="w-px flex-1 mt-1 min-h-[16px]" style={{ background: `${color}20` }} />
      </div>

      {/* Content */}
      <div className="flex-1 pb-4 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-ghost-text leading-relaxed">{event.description}</p>
          <span className="text-[9px] text-ghost-muted shrink-0 mt-0.5 whitespace-nowrap">
            {relativeTime(event.timestamp)}
          </span>
        </div>
        {event.fileSku && (
          <span
            className="text-[9px] font-mono mt-0.5 inline-block px-1 py-0.5 rounded"
            style={{ background: `${color}15`, color }}
          >
            {event.fileSku}
          </span>
        )}
      </div>
    </motion.div>
  );
};

// ─── Activity Spike Banner ────────────────────────────────────────────────────

const ActivitySpike: React.FC<{ date: string; count: number }> = ({ date, count }) => (
  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ghost-yellow/10 border border-ghost-yellow/20 mb-3">
    <Zap size={12} className="text-ghost-yellow" />
    <span className="text-[10px] text-ghost-yellow">
      Activity spike: <strong>{count} events</strong> on {date}
    </span>
  </div>
);

// ─── Timeline Panel ───────────────────────────────────────────────────────────

type TimelineFilter = 'all' | 'files' | 'tags' | 'vaults' | 'search';

const FILTER_OPTIONS: Array<{ id: TimelineFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'files', label: 'Files' },
  { id: 'tags', label: 'Tags' },
  { id: 'vaults', label: 'Vaults' },
  { id: 'search', label: 'Search' },
];

const FILTER_TYPES: Record<TimelineFilter, TimelineEventType[]> = {
  all: [],
  files: ['file_imported', 'file_opened', 'file_analyzed'],
  tags: ['file_tagged', 'sku_linked'],
  vaults: ['vault_created', 'vault_locked'],
  search: ['search_performed'],
};

export const TimelinePanel: React.FC = () => {
  const { timeline } = useGKStore();
  const [filter, setFilter] = React.useState<TimelineFilter>('all');

  const filtered = filter === 'all'
    ? timeline
    : timeline.filter(e => FILTER_TYPES[filter].includes(e.type));

  // Group by day
  const grouped = React.useMemo(() => {
    const map = new Map<string, GKTimelineEvent[]>();
    for (const event of filtered) {
      const d = new Date(event.timestamp);
      const key = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    }
    return map;
  }, [filtered]);

  // Detect spikes (days with 5+ events)
  const spikes = [...grouped.entries()].filter(([, evts]) => evts.length >= 5);

  return (
    <div className="flex flex-col h-full">
      {/* Filter tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-ghost-border shrink-0">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.id}
            onClick={() => setFilter(opt.id)}
            className={`text-[10px] px-2 py-1 rounded transition-colors ${
              filter === opt.id
                ? 'bg-ghost-accent/20 text-ghost-accent border border-ghost-accent/30'
                : 'text-ghost-muted hover:text-ghost-text'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="ml-auto text-[9px] text-ghost-muted self-center">
          {filtered.length} events
        </span>
      </div>

      {/* Timeline feed */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Activity size={32} />}
            title="No events yet"
            description="Import files to start tracking activity"
          />
        ) : (
          <AnimatePresence>
            {spikes.length > 0 && (
              <ActivitySpike date={spikes[0][0]} count={spikes[0][1].length} />
            )}
            {[...grouped.entries()].map(([date, events]) => (
              <div key={date} className="mb-2">
                <div className="text-[9px] text-ghost-muted uppercase tracking-wider mb-2 flex items-center gap-2">
                  <span className="flex-1 border-t border-ghost-border" />
                  {date}
                  <span className="flex-1 border-t border-ghost-border" />
                </div>
                {events.map((event, i) => (
                  <TimelineEventRow key={event.id ?? i} event={event} index={i} />
                ))}
              </div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};
