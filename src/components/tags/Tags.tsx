import React from 'react';
import clsx from 'clsx';
import type { GKTag } from '../../core/db';

const DIMENSION_COLORS: Record<string, string> = {
  who: '#00d4ff',
  what: '#6c63ff',
  when: '#ffd700',
  where: '#00ff88',
};

const DIMENSION_PREFIX: Record<string, string> = {
  who: '👤',
  what: '📦',
  when: '🕐',
  where: '📍',
};

interface TagBadgeProps {
  tag: GKTag;
  onRemove?: () => void;
  size?: 'xs' | 'sm';
}

export const TagBadge: React.FC<TagBadgeProps> = ({ tag, onRemove, size = 'sm' }) => {
  const color = DIMENSION_COLORS[tag.dimension] ?? '#64748b';
  const prefix = DIMENSION_PREFIX[tag.dimension] ?? '';
  const sizeClass = size === 'xs' ? 'text-[9px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5';

  return (
    <span
      className={clsx('inline-flex items-center gap-1 rounded font-medium max-w-[120px]', sizeClass)}
      style={{
        background: `${color}18`,
        color,
        border: `1px solid ${color}40`,
      }}
      title={`${tag.dimension}: ${tag.value}${tag.confidence !== undefined ? ` (${Math.round(tag.confidence * 100)}%)` : ''}`}
    >
      <span>{prefix}</span>
      <span className="truncate">{tag.value}</span>
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 hover:opacity-70 shrink-0 leading-none"
        >
          ×
        </button>
      )}
    </span>
  );
};

interface TagGroupProps {
  tags: GKTag[];
  onRemove?: (index: number) => void;
  max?: number;
  size?: 'xs' | 'sm';
}

export const TagGroup: React.FC<TagGroupProps> = ({ tags, onRemove, max = 6, size = 'sm' }) => {
  const shown = tags.slice(0, max);
  const overflow = tags.length - max;

  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((tag, i) => (
        <TagBadge
          key={`${tag.dimension}-${tag.value}-${i}`}
          tag={tag}
          onRemove={onRemove ? () => onRemove(i) : undefined}
          size={size}
        />
      ))}
      {overflow > 0 && (
        <span className="text-[9px] text-ghost-muted px-1 py-0.5">+{overflow}</span>
      )}
    </div>
  );
};

interface TagEditorProps {
  tags: GKTag[];
  onChange: (tags: GKTag[]) => void;
}

export const TagEditor: React.FC<TagEditorProps> = ({ tags, onChange }) => {
  const [dimension, setDimension] = React.useState<GKTag['dimension']>('who');
  const [value, setValue] = React.useState('');

  const addTag = () => {
    if (!value.trim()) return;
    onChange([...tags, { dimension, value: value.trim() }]);
    setValue('');
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <TagGroup tags={tags} onRemove={removeTag} />
      <div className="flex gap-1.5">
        <select
          value={dimension}
          onChange={e => setDimension(e.target.value as GKTag['dimension'])}
          className="bg-ghost-bg border border-ghost-border rounded px-2 py-1 text-xs text-ghost-text focus:outline-none focus:border-ghost-accent/60"
        >
          <option value="who">Who</option>
          <option value="what">What</option>
          <option value="when">When</option>
          <option value="where">Where</option>
        </select>
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTag()}
          placeholder="Tag value..."
          className="flex-1 bg-ghost-bg border border-ghost-border rounded px-2 py-1 text-xs text-ghost-text placeholder-ghost-muted/50 focus:outline-none focus:border-ghost-accent/60"
        />
        <button
          onClick={addTag}
          className="bg-ghost-accent/20 hover:bg-ghost-accent/30 border border-ghost-accent/40 text-ghost-accent rounded px-2 py-1 text-xs"
        >
          +
        </button>
      </div>
    </div>
  );
};
