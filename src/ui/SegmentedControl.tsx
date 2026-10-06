import React from 'react';

export interface SegmentOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
}

export interface SegmentedControlProps<T extends string | number> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
}: SegmentedControlProps<T>) {
  const isSm = size === 'sm';

  return (
    <div
      role="radiogroup"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px',
        backgroundColor: 'var(--bg-3)',
        borderRadius: 'var(--r-6)',
        border: '1px solid var(--line-1)',
      }}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            style={{
              padding: isSm ? '2px 8px' : '4px 10px',
              fontSize: isSm ? '11px' : '12px',
              fontWeight: selected ? 600 : 400,
              color: selected ? 'var(--text-1)' : 'var(--text-2)',
              backgroundColor: selected ? 'var(--bg-1)' : 'transparent',
              borderRadius: 'var(--r-4)',
              border: 'none',
              cursor: 'pointer',
              boxShadow: selected ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
              transition: 'background-color 140ms ease, color 140ms ease',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

