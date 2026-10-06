import React from 'react';

export interface KbdProps {
  children: React.ReactNode;
}

export const Kbd: React.FC<KbdProps> = ({ children }) => {
  return (
    <kbd
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1px 5px',
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        fontWeight: 500,
        color: 'var(--text-3)',
        backgroundColor: 'var(--bg-3)',
        border: '1px solid var(--line-2)',
        borderRadius: 'var(--r-4)',
        lineHeight: '1.2',
      }}
    >
      {children}
    </kbd>
  );
};

