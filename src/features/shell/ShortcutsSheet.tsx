import React from 'react';
import { X } from 'lucide-react';
import { Kbd } from '../../ui/Kbd';

export interface ShortcutsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsSheet: React.FC<ShortcutsSheetProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const shortcuts = [
    { label: 'Run / Retrace', keys: ['⌘ / Ctrl', 'Enter'] },
    { label: 'Play / Pause', keys: ['Space'] },
    { label: 'Step Forward', keys: ['→', 'or', 'F10'] },
    { label: 'Step Backward', keys: ['←', 'or', 'Shift+F10'] },
    { label: 'First / Last Step', keys: ['Home', 'End'] },
    { label: 'Restart Trace', keys: ['R'] },
    { label: 'Toggle Breakpoint', keys: ['F9'] },
    { label: 'Exit to Editor', keys: ['Esc'] },
    { label: 'Keyboard Shortcuts', keys: ['?'] },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: 'var(--bg-2)',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-12)',
          boxShadow: 'var(--shadow-popover)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--line-1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-1)' }}>
            Keyboard Shortcuts
          </span>
          <button
            onClick={onClose}
            style={{ color: 'var(--text-3)', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {shortcuts.map((s, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 0',
                fontSize: '12.5px',
              }}
            >
              <span style={{ color: 'var(--text-2)' }}>{s.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {s.keys.map((k, i) =>
                  k === 'or' ? (
                    <span key={i} style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                      or
                    </span>
                  ) : (
                    <Kbd key={i}>{k}</Kbd>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

