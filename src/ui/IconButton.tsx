import React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  label,
  size = 'md',
  active = false,
  className = '',
  disabled,
  style,
  ...props
}) => {
  const dim = size === 'sm' ? 24 : size === 'lg' ? 36 : 30;

  return (
    <button
      title={label}
      aria-label={label}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${dim}px`,
        height: `${dim}px`,
        borderRadius: 'var(--r-6)',
        backgroundColor: active ? 'var(--bg-4)' : 'transparent',
        color: active ? 'var(--text-1)' : 'var(--text-2)',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background-color 120ms ease, color 120ms ease',
        ...style,
      }}
      className={`tracel-icon-btn ${className}`}
      {...props}
    >
      {icon}
    </button>
  );
};

