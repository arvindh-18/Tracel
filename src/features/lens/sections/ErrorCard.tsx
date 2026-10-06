import React, { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { TraceError } from '../../../trace/schema';

export interface ErrorCardProps {
  error: TraceError;
}

export const ErrorCard: React.FC<ErrorCardProps> = ({ error }) => {
  const [showRawDetails, setShowRawDetails] = useState(false);

  return (
    <div
      role="alert"
      style={{
        backgroundColor: 'var(--sem-remove-soft)',
        border: '1px solid var(--sem-remove-line)',
        borderRadius: 'var(--r-8)',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        color: 'var(--text-1)',
      }}
    >
      {/* Top Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertCircle size={16} color="var(--sem-remove)" />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--sem-remove)',
            }}
          >
            Execution Stopped
          </span>
        </div>
        <span
          style={{
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-3)',
          }}
        >
          Line {error.line}
        </span>
      </div>

      {/* Title & Plain-Language Explanation */}
      <div>
        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
          {error.title || error.kind}
        </div>
        <div
          style={{
            fontSize: '12.5px',
            color: 'var(--text-2)',
            lineHeight: '1.5',
          }}
        >
          {error.explanation}
        </div>
      </div>

      {/* State Note */}
      {error.stateNote && (
        <div
          style={{
            fontSize: '11.5px',
            color: 'var(--text-3)',
            fontStyle: 'italic',
          }}
        >
          {error.stateNote}
        </div>
      )}

      {/* Raw Error Details Accordion */}
      <div style={{ marginTop: '4px' }}>
        <button
          onClick={() => setShowRawDetails(!showRawDetails)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11.5px',
            color: 'var(--text-3)',
            cursor: 'pointer',
          }}
        >
          {showRawDetails ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span>Raw runtime details</span>
        </button>

        {showRawDetails && (
          <pre
            style={{
              marginTop: '6px',
              padding: '6px 8px',
              backgroundColor: 'var(--bg-1)',
              borderRadius: 'var(--r-4)',
              border: '1px solid var(--line-1)',
              fontSize: '11.5px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-2)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {error.kind}: {error.message}
          </pre>
        )}
      </div>
    </div>
  );
};

