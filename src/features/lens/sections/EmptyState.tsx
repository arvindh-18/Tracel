import React from 'react';
import { Play } from 'lucide-react';
import { Button } from '../../../ui/Button';
import { EXAMPLES, Example } from '../../examples/registry';
import { useSessionStore } from '../../../store/session';

export interface EmptyStateProps {
  onRun: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onRun }) => {
  const language = useSessionStore((s) => s.language);
  const setCode = useSessionStore((s) => s.setCode);

  const availableExamples = EXAMPLES.filter((e) => e.language === language);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '32px 24px',
        textAlign: 'center',
        userSelect: 'none',
      }}
    >
      {/* Product Illustration made from its own visual language */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '24px',
          padding: '12px 18px',
          backgroundColor: 'var(--bg-2)',
          border: '1px solid var(--line-1)',
          borderRadius: 'var(--r-8)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
            numbers = [10, 20, 30]
          </span>
          <div style={{ display: 'flex', gap: '3px' }}>
            <div
              style={{
                width: '32px',
                height: '24px',
                backgroundColor: 'var(--bg-3)',
                border: '1px solid var(--line-2)',
                borderRadius: 'var(--r-4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-1)',
              }}
            >
              10
            </div>
            <div
              style={{
                width: '32px',
                height: '24px',
                backgroundColor: 'var(--exec-soft)',
                border: '1px solid var(--exec)',
                borderRadius: 'var(--r-4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-1)',
              }}
            >
              40
            </div>
            <div
              style={{
                width: '32px',
                height: '24px',
                backgroundColor: 'var(--bg-3)',
                border: '1px solid var(--line-2)',
                borderRadius: 'var(--r-4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-1)',
              }}
            >
              30
            </div>
          </div>
        </div>
      </div>

      {/* Tagline & Wordmark */}
      <h1
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: '28px',
          fontWeight: 600,
          color: 'var(--text-1)',
          letterSpacing: '-0.02em',
          marginBottom: '6px',
        }}
      >
        tracel
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: '16px',
          fontStyle: 'italic',
          color: 'var(--exec)',
          marginBottom: '16px',
        }}
      >
        See your code come alive.
      </p>

      <p
        style={{
          fontSize: '13px',
          color: 'var(--text-2)',
          maxWidth: '380px',
          lineHeight: '1.5',
          marginBottom: '20px',
        }}
      >
        Write a program, run it, and watch every line execute and every value change.
      </p>

      {/* Primary Action Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
        <Button
          variant="primary"
          size="lg"
          icon={<Play size={15} fill="#1A1206" />}
          onClick={onRun}
        >
          Run this example
        </Button>
        <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>
          or press ⌘↵ / Ctrl+Enter
        </span>
      </div>

      {/* Examples Chips Row */}
      <div style={{ maxWidth: '500px' }}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-3)',
            marginBottom: '8px',
          }}
        >
          Or start from an example
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          {availableExamples.slice(0, 8).map((ex) => (
            <button
              key={ex.id}
              onClick={() => setCode(ex.code)}
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                backgroundColor: 'var(--bg-2)',
                border: '1px solid var(--line-1)',
                borderRadius: 'var(--r-6)',
                color: 'var(--text-2)',
                cursor: 'pointer',
                transition: 'all 120ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-3)';
                e.currentTarget.style.color = 'var(--text-1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-2)';
                e.currentTarget.style.color = 'var(--text-2)';
              }}
            >
              {ex.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

