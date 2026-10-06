import React, { useState } from 'react';
import { Play, Square, HelpCircle, Settings, Info, ChevronDown } from 'lucide-react';
import { useSessionStore, SupportedLanguage } from '../../store/session';
import { usePlaybackStore } from '../../store/playback';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { EXAMPLES, Example } from '../examples/registry';

export interface TopBarProps {
  onRun: () => void;
  onStop: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onRun,
  onStop,
  onOpenShortcuts,
  onOpenSettings,
}) => {
  const language = useSessionStore((s) => s.language);
  const setLanguage = useSessionStore((s) => s.setLanguage);
  const setCode = useSessionStore((s) => s.setCode);
  const isRunning = useSessionStore((s) => s.isRunning);
  const runProgress = useSessionStore((s) => s.runProgress);
  const runtimeLoading = useSessionStore((s) => s.runtimeLoading);
  const runtimeLoadProgress = useSessionStore((s) => s.runtimeLoadProgress);

  const [examplesOpen, setExamplesOpen] = useState(false);
  const [supportInfoOpen, setSupportInfoOpen] = useState(false);

  const languageOptions = [
    { value: 'python' as SupportedLanguage, label: 'Python' },
    { value: 'c' as SupportedLanguage, label: 'C' },
    { value: 'cpp' as SupportedLanguage, label: 'C++' },
  ];

  const filteredExamples = EXAMPLES.filter((e) => e.language === language);
  const categories = Array.from(new Set(filteredExamples.map((e) => e.category)));

  const handleSelectExample = (ex: Example) => {
    setCode(ex.code);
    setExamplesOpen(false);
  };

  const getEngineLabel = () => {
    switch (language) {
      case 'python':
        return 'CPython 3.12 (Pyodide)';
      case 'c':
        return 'Tracel C interpreter (subset)';
      case 'cpp':
        return 'Tracel C++ interpreter (subset)';
    }
  };

  return (
    <header
      style={{
        height: '44px',
        backgroundColor: 'var(--bg-2)',
        borderBottom: '1px solid var(--line-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        userSelect: 'none',
        zIndex: 50,
      }}
    >
      {/* Left: Brand + Language + Examples */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 17L10 7L15 14L20 9"
              stroke="var(--text-2)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="15" cy="14" r="3" fill="var(--exec)" />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
              fontSize: '15px',
              letterSpacing: '-0.01em',
              color: 'var(--text-1)',
            }}
          >
            tracel
          </span>
        </div>

        {/* Language Switch */}
        <SegmentedControl
          size="sm"
          options={languageOptions}
          value={language}
          onChange={(newLang) => setLanguage(newLang)}
        />

        {/* Examples Picker Dropdown */}
        <div style={{ position: 'relative' }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setExamplesOpen(!examplesOpen)}
            style={{ fontSize: '12px' }}
          >
            Examples <ChevronDown size={14} style={{ marginLeft: '4px' }} />
          </Button>

          {examplesOpen && (
            <div
              style={{
                position: 'absolute',
                top: '32px',
                left: 0,
                width: '260px',
                backgroundColor: 'var(--bg-2)',
                border: '1px solid var(--line-2)',
                borderRadius: 'var(--r-8)',
                boxShadow: 'var(--shadow-popover)',
                padding: '6px',
                zIndex: 100,
                maxHeight: '400px',
                overflowY: 'auto',
              }}
            >
              {categories.map((cat) => (
                <div key={cat} style={{ marginBottom: '8px' }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--text-3)',
                      padding: '4px 8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    {cat}
                  </div>
                  {filteredExamples
                    .filter((e) => e.category === cat)
                    .map((ex) => (
                      <button
                        key={ex.id}
                        onClick={() => handleSelectExample(ex)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '6px 8px',
                          borderRadius: 'var(--r-4)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          color: 'var(--text-1)',
                          transition: 'background-color 100ms ease',
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = 'var(--bg-3)')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = 'transparent')
                        }
                      >
                        <span style={{ fontSize: '12.5px', fontWeight: 500 }}>
                          {ex.title}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                          {ex.description}
                        </span>
                      </button>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Engine Info + Shortcuts + Settings + Run Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Engine Label + Popover */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setSupportInfoOpen(!supportInfoOpen)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11.5px',
              color: 'var(--text-3)',
              padding: '2px 6px',
              borderRadius: 'var(--r-4)',
              cursor: 'pointer',
            }}
          >
            <span className="desktop-only" style={{ display: 'none' }}>{getEngineLabel()}</span>
            <Info size={14} />
          </button>

          {supportInfoOpen && (
            <div
              style={{
                position: 'absolute',
                top: '30px',
                right: 0,
                width: '320px',
                backgroundColor: 'var(--bg-2)',
                border: '1px solid var(--line-2)',
                borderRadius: 'var(--r-8)',
                boxShadow: 'var(--shadow-popover)',
                padding: '12px',
                zIndex: 100,
                fontSize: '12px',
                color: 'var(--text-2)',
                lineHeight: '1.5',
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  color: 'var(--text-1)',
                  marginBottom: '6px',
                }}
              >
                {language === 'python' ? 'Python Sandbox & Limits' : 'C/C++ Interpreter Subset'}
              </div>
              {language === 'python' ? (
                <>
                  <p style={{ marginBottom: '6px' }}>
                    Runs real CPython in Pyodide. Imports allowlisted: math, collections, heapq, itertools, bisect, etc.
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                    Network and disk I/O are disabled. Max 5,000 steps per run. Random seed is 0.
                  </p>
                </>
              ) : (
                <>
                  <p style={{ marginBottom: '6px' }}>
                    Evaluates C/C++ AST with real pointer arithmetic, typed memory blocks, and safety checks.
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                    Supported: arrays, pointers, structs, classes, STL vector/stack/queue, printf/scanf, std::cout/cin. Undefined behavior triggers exact stop messages.
                  </p>
                </>
              )}
              <div style={{ marginTop: '8px', textAlign: 'right' }}>
                <button
                  onClick={() => setSupportInfoOpen(false)}
                  style={{
                    color: 'var(--exec)',
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Shortcuts Button */}
        <IconButton
          icon={<HelpCircle size={16} />}
          label="Keyboard shortcuts (?)"
          onClick={onOpenShortcuts}
        />

        {/* Settings Button */}
        <IconButton
          icon={<Settings size={16} />}
          label="Settings"
          onClick={onOpenSettings}
        />

        {/* Run / Stop Button */}
        {isRunning ? (
          <Button
            variant="danger"
            size="sm"
            icon={<Square size={14} fill="currentColor" />}
            onClick={onStop}
          >
            Stop {runProgress > 0 ? `(${runProgress})` : ''}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            icon={<Play size={14} fill="#1A1206" />}
            onClick={onRun}
            loading={runtimeLoading}
          >
            {runtimeLoading
              ? runtimeLoadProgress || 'Preparing runtime…'
              : 'Run'}
          </Button>
        )}
      </div>
    </header>
  );
};
