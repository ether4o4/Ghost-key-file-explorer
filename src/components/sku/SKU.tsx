import React from 'react';
import clsx from 'clsx';
import { parseSKU } from '../../core/sku';

interface SKUBadgeProps {
  sku: string;
  className?: string;
  onClick?: () => void;
  size?: 'xs' | 'sm' | 'md';
  glow?: boolean;
}

export const SKUBadge: React.FC<SKUBadgeProps> = ({ sku, className, onClick, size = 'sm', glow }) => {
  const parsed = parseSKU(sku);
  const sizes = {
    xs: 'text-[8px] px-1 py-0.5',
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
  };

  return (
    <span
      className={clsx(
        'sku-badge inline-flex items-center rounded border font-medium',
        sizes[size],
        onClick && 'cursor-pointer hover:brightness-125',
        className
      )}
      onClick={onClick}
      style={{
        background: 'rgba(108,99,255,0.12)',
        color: '#6c63ff',
        border: '1px solid rgba(108,99,255,0.3)',
        boxShadow: glow ? '0 0 8px rgba(108,99,255,0.3)' : undefined,
      }}
      title={sku}
    >
      {parsed ? (
        <>
          <span className="opacity-60">GK-{parsed.year}-{parsed.month}-</span>
          <span>{parsed.seq}</span>
        </>
      ) : sku}
    </span>
  );
};

interface SKULinkerProps {
  currentSku: string;
  linkedSkus: string[];
  allSkus: string[];
  onLink: (sku: string) => void;
  onUnlink?: (sku: string) => void;
}

export const SKULinker: React.FC<SKULinkerProps> = ({ currentSku, linkedSkus, allSkus, onLink, onUnlink }) => {
  const [input, setInput] = React.useState('');
  const available = allSkus.filter(s => s !== currentSku && !linkedSkus.includes(s));

  const handleLink = () => {
    const target = input.trim();
    if (target && available.includes(target)) {
      onLink(target);
      setInput('');
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-ghost-muted mb-1">Linked SKUs ({linkedSkus.length})</div>
      {linkedSkus.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {linkedSkus.map(s => (
            <SKUBadge
              key={s}
              sku={s}
              onClick={onUnlink ? () => onUnlink(s) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="text-xs text-ghost-dim">No links yet</div>
      )}
      <div className="flex gap-1.5 mt-2">
        <input
          list="sku-options"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLink()}
          placeholder="Link to SKU..."
          className="flex-1 bg-ghost-bg border border-ghost-border rounded px-2 py-1 text-xs text-ghost-text placeholder-ghost-muted/50 focus:outline-none focus:border-ghost-accent/60"
        />
        <datalist id="sku-options">
          {available.map(s => <option key={s} value={s} />)}
        </datalist>
        <button
          onClick={handleLink}
          className="bg-ghost-accent/20 hover:bg-ghost-accent/30 border border-ghost-accent/40 text-ghost-accent rounded px-2 py-1 text-xs"
        >
          Link
        </button>
      </div>
    </div>
  );
};
