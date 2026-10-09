import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

// Share links carry the program in the URL hash (#code=...), compressed with
// lz-string. Nothing is uploaded; the hash never even reaches a server.

export interface SharedProgram {
  language: 'python' | 'c' | 'cpp';
  code: string;
  stdin: string;
}

export function shareUrl(program: SharedProgram): string {
  const payload = compressToEncodedURIComponent(JSON.stringify({ l: program.language, c: program.code, i: program.stdin }));
  return `${location.origin}${location.pathname}#code=${payload}`;
}

export function readSharedProgram(hash: string): SharedProgram | null {
  const match = hash.match(/(?:^#|&)code=([^&]+)/);
  if (!match) return null;
  try {
    const data = JSON.parse(decompressFromEncodedURIComponent(match[1]!) ?? '') as { l?: string; c?: unknown; i?: unknown };
    if ((data.l === 'python' || data.l === 'c' || data.l === 'cpp') && typeof data.c === 'string') {
      return { language: data.l, code: data.c, stdin: typeof data.i === 'string' ? data.i : '' };
    }
  } catch {
    // Corrupt or truncated link.
  }
  return null;
}
