import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { compressToEncodedURIComponent } from 'lz-string';
import { readSharedProgram } from '../../src/features/share/share';
import { EXAMPLES } from '../../src/features/examples/registry';
import { PREBUILT_FORMAT, PrebuiltExample } from '../../src/features/examples/prebuilt';

describe('share links', () => {
  it('round-trips language, code and stdin through the hash', () => {
    vi.stubGlobal('location', { origin: 'https://example.org', pathname: '/Tracel/' });
    return import('../../src/features/share/share').then(({ shareUrl }) => {
      const program = { language: 'cpp' as const, code: 'int main() { return 0; } // ✓ unicode', stdin: '3 4' };
      const url = shareUrl(program);
      expect(url.startsWith('https://example.org/Tracel/#code=')).toBe(true);
      expect(readSharedProgram(url.slice(url.indexOf('#')))).toEqual(program);
    });
  });

  it('ignores corrupt or foreign hashes', () => {
    expect(readSharedProgram('#code=garbage!!')).toBeNull();
    expect(readSharedProgram('#other=1')).toBeNull();
    expect(readSharedProgram('#code=' + compressToEncodedURIComponent(JSON.stringify({ l: 'rust', c: 'x' })))).toBeNull();
  });
});

describe('prebuilt examples', () => {
  it('exist for every built-in example and match its source', () => {
    const files = new Set(readdirSync('public/examples'));
    for (const ex of EXAMPLES) {
      expect(files.has(`${ex.id}.json`), `${ex.id} is missing: run npm run gen:examples`).toBe(true);
      const file = JSON.parse(readFileSync(`public/examples/${ex.id}.json`, 'utf8')) as PrebuiltExample;
      expect(file.format).toBe(PREBUILT_FORMAT);
      expect(file.source, `${ex.id} is stale: run npm run gen:examples`).toBe(ex.code);
      expect(file.trace.steps.length).toBeGreaterThan(0);
    }
  });
});
