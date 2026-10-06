import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'exec' | 'create' | 'update' | 'remove' | 'ref' | 'call' | 'info';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'sm',
}) => {
  const getStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'exec':
        return {
          backgroundColor: 'var(--exec-dim)',
          color: 'var(--exec)',
          border: '1px solid var(--exec-line)',
        };
      case 'create':
        return {
          backgroundColor: 'var(--sem-create-soft)',
          color: 'var(--sem-create)',
          border: '1px solid var(--sem-create-line)',
        };
      case 'update':
        return {
          backgroundColor: 'var(--sem-update-soft)',
          color: 'var(--sem-update)',
          border: '1px solid var(--sem-update-line)',
        };
      case 'remove':
        return {
          backgroundColor: 'var(--sem-remove-soft)',
          color: 'var(--sem-remove)',
          border: '1px solid var(--sem-remove-line)',
        };
      case 'ref':
        return {
          backgroundColor: 'var(--sem-ref-soft)',
          color: 'var(--sem-ref)',
          border: '1px solid var(--sem-ref-line)',
        };
      case 'call':
        return {
          backgroundColor: 'var(--sem-call-soft)',
          color: 'var(--sem-call)',
          border: '1px solid var(--sem-call-line)',
        };
      case 'info':
        return {
          backgroundColor: 'var(--sem-info-soft)',
          color: 'var(--sem-info)',
          border: '1px solid var(--line-2)',
        };
      case 'default':
      default:
        return {
          backgroundColor: 'var(--bg-3)',
          color: 'var(--text-2)',
          border: '1px solid var(--line-1)',
        };
    }
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: size === 'sm' ? '1px 6px' : '2px 8px',
        fontSize: size === 'sm' ? '11px' : '12px',
        fontWeight: 500,
        borderRadius: 'var(--r-4)',
        whiteSpace: 'nowrap',
        ...getStyles(),
      }}
    >
      {children}
    </span>
  );
};

