import React from 'react';
import clsx from 'clsx';

interface BadgeProps {
  color?: string;
  children: React.ReactNode;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  glow?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({ color = '#6c63ff', children, size = 'sm', className, glow }) => {
  const sizes = { xs: 'text-[9px] px-1 py-0.5', sm: 'text-[10px] px-1.5 py-0.5', md: 'text-xs px-2 py-1' };
  return (
    <span
      className={clsx('inline-flex items-center rounded font-medium uppercase tracking-wide', sizes[size], className)}
      style={{
        background: `${color}22`,
        color,
        border: `1px solid ${color}44`,
        boxShadow: glow ? `0 0 6px ${color}44` : undefined,
      }}
    >
      {children}
    </span>
  );
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary', size = 'sm', icon, children, className, ...props
}) => {
  const base = 'inline-flex items-center gap-1.5 rounded font-medium transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-ghost-accent/50 disabled:opacity-40';
  const variants = {
    primary: 'bg-ghost-accent hover:bg-ghost-accentDim text-white',
    secondary: 'bg-ghost-card hover:bg-ghost-border text-ghost-text border border-ghost-border',
    ghost: 'hover:bg-ghost-card text-ghost-muted hover:text-ghost-text',
    danger: 'bg-ghost-red/10 hover:bg-ghost-red/20 text-ghost-red border border-ghost-red/30',
  };
  const sizes = {
    xs: 'text-xs px-1.5 py-0.5',
    sm: 'text-xs px-2.5 py-1.5',
    md: 'text-sm px-3 py-2',
    lg: 'text-sm px-4 py-2.5',
  };
  return (
    <button className={clsx(base, variants[variant], sizes[size], className)} {...props}>
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
};

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className, onClick, selected, hoverable = true }) => (
  <div
    className={clsx(
      'rounded-lg border bg-ghost-card transition-all duration-150',
      selected ? 'border-ghost-accent glow-accent' : 'border-ghost-border',
      hoverable && 'hover:border-ghost-accent/50 cursor-pointer',
      className
    )}
    onClick={onClick}
  >
    {children}
  </div>
);

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export const Modal: React.FC<ModalProps> = ({ open, onClose, title, children, width = 'max-w-lg' }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx('relative w-full bg-ghost-surface border border-ghost-border rounded-xl shadow-2xl', width)}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ghost-border">
          <h3 className="text-sm font-semibold text-ghost-text">{title}</h3>
          <button
            onClick={onClose}
            className="text-ghost-muted hover:text-ghost-text transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className, ...props }) => (
  <div className="flex flex-col gap-1">
    {label && <label className="text-xs text-ghost-muted font-medium">{label}</label>}
    <input
      className={clsx(
        'w-full bg-ghost-bg border rounded px-3 py-2 text-sm text-ghost-text placeholder-ghost-muted/50',
        'focus:outline-none focus:border-ghost-accent/60 focus:ring-1 focus:ring-ghost-accent/20',
        error ? 'border-ghost-red/60' : 'border-ghost-border',
        className
      )}
      {...props}
    />
    {error && <span className="text-xs text-ghost-red">{error}</span>}
  </div>
);

export const Divider: React.FC<{ className?: string }> = ({ className }) => (
  <div className={clsx('border-t border-ghost-border', className)} />
);

export const Spinner: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg className="animate-spin text-ghost-accent" width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }> = ({
  icon, title, description, action
}) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    {icon && <div className="text-ghost-muted mb-3 opacity-40">{icon}</div>}
    <p className="text-sm font-medium text-ghost-muted">{title}</p>
    {description && <p className="text-xs text-ghost-dim mt-1">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
