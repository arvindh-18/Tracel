import React from 'react';
import { X } from 'lucide-react';
import { usePrefsStore } from '../../store/prefs';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const fontSize = usePrefsStore((s) => s.fontSize);
  const setFontSize = usePrefsStore((s) => s.setFontSize);
  const reducedMotion = usePrefsStore((s) => s.reducedMotion);
  const setReducedMotion = usePrefsStore((s) => s.setReducedMotion);
  const showAddresses = usePrefsStore((s) => s.showAddresses);
  const setShowAddresses = usePrefsStore((s) => s.setShowAddresses);
  const stepLimit = usePrefsStore((s) => s.stepLimit);
  const setStepLimit = usePrefsStore((s) => s.setStepLimit);

  if (!isOpen) return null;

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
          maxWidth: '400px',
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
            Settings
          </span>
          <button
            onClick={onClose}
            style={{ color: 'var(--text-3)', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Step Limit */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-1)' }}>Step limit</div>
              <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                Max execution steps per run
              </div>
            </div>
            <select
              value={stepLimit}
              onChange={(e) => setStepLimit(Number(e.target.value))}
              style={{
                backgroundColor: 'var(--bg-1)',
                border: '1px solid var(--line-2)',
                borderRadius: 'var(--r-4)',
                color: 'var(--text-1)',
                padding: '4px 8px',
                fontSize: '12px',
              }}
            >
              <option value={2000}>2,000 steps</option>
              <option value={5000}>5,000 steps (default)</option>
              <option value={10000}>10,000 steps</option>
              <option value={20000}>20,000 steps</option>
            </select>
          </div>

          {/* Show Addresses for C/C++ */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-1)' }}>C/C++ Pointer Addresses</div>
              <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                Display memory address tags
              </div>
            </div>
            <input
              type="checkbox"
              checked={showAddresses}
              onChange={(e) => setShowAddresses(e.target.checked)}
              style={{ cursor: 'pointer', accentColor: 'var(--exec)' }}
            />
          </div>

          {/* Reduced Motion Override */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-1)' }}>Reduced motion</div>
              <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                Use crossfades and tints instead of sliding
              </div>
            </div>
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
              style={{ cursor: 'pointer', accentColor: 'var(--exec)' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

