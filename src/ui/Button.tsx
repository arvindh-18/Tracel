import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  children,
  className = '',
  disabled,
  style,
  ...props
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: 'var(--exec)',
          color: '#1A1206',
          fontWeight: 600,
          border: '1px solid transparent',
        };
      case 'danger':
        return {
          backgroundColor: 'var(--sem-remove-soft)',
          color: 'var(--sem-remove)',
          border: '1px solid var(--sem-remove-line)',
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          color: 'var(--text-2)',
          border: '1px solid transparent',
        };
      case 'secondary':
      default:
        return {
          backgroundColor: 'var(--bg-2)',
          color: 'var(--text-1)',
          border: '1px solid var(--line-2)',
        };
    }
  };

  const getSizeStyles = (): React.CSSProperties => {
    switch (size) {
      case 'sm':
        return { height: '26px', padding: '0 8px', fontSize: '12px', gap: '5px' };
      case 'lg':
        return { height: '36px', padding: '0 16px', fontSize: '14px', gap: '8px' };
      case 'md':
      default:
        return { height: '30px', padding: '0 12px', fontSize: '13px', gap: '6px' };
    }
  };

  return (
    <button
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--r-6)',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'background-color 120ms ease, transform 80ms ease, opacity 120ms ease',
        position: 'relative',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        ...getVariantStyles(),
        ...getSizeStyles(),
        ...style,
      }}
      className={`tracel-btn ${className}`}
      {...props}
    >
      {loading && (
        <span
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: '2px',
            width: '100%',
            background: 'rgba(255, 255, 255, 0.4)',
            animation: 'sweep 1.2s infinite ease-in-out',
          }}
        />
      )}
      {icon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
      {children}
    </button>
  );
};

