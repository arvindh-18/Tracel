import React from 'react';
import { Terminal } from 'lucide-react';

export interface OutputSectionProps {
  output: string;
}

export const OutputSection: React.FC<OutputSectionProps> = ({ output }) => {
  if (!output) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        backgroundColor: 'var(--bg-2)',
        border: '1px solid var(--line-1)',
        borderRadius: 'var(--r-6)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 10px',
          backgroundColor: 'var(--bg-3)',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        <Terminal size={12} />
        <span>Output (stdout)</span>
      </div>

      <pre
        style={{
          padding: '8px 10px',
          margin: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: '12.5px',
          lineHeight: '1.5',
          color: 'var(--text-1)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: '160px',
          overflowY: 'auto',
        }}
      >
        {output}
      </pre>
    </div>
  );
};

