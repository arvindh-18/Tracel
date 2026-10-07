import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type RGBA = [number, number, number, number];

const css = readFileSync(resolve(import.meta.dirname, '../src/styles/tokens.css'), 'utf8');

function themeBlock(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No block for ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]!] = m[2]!.trim();
  return vars;
}

function parse(color: string): RGBA {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = color.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const [r, g, b, a = 1] = rgba[1]!.split(',').map(Number);
    return [r!, g!, b!, a];
  }
  throw new Error(`Unsupported color: ${color}`);
}

function over(fg: RGBA, bg: RGBA): RGBA {
  const a = fg[3];
  return [0, 1, 2].map((i) => fg[i]! * a + bg[i]! * (1 - a)).concat(1) as RGBA;
}

function luminance([r, g, b]: RGBA): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a: RGBA, b: RGBA): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const themes = {
  light: themeBlock(':root,\n:root[data-theme="light"]'),
  dark: themeBlock(':root[data-theme="dark"]'),
};

let failures = 0;

for (const [name, vars] of Object.entries(themes)) {
  const get = (token: string): RGBA => {
    const v = vars[token];
    if (!v) throw new Error(`${name}: missing --${token}`);
    return parse(v);
  };
  const surface = get('bg-surface');
  const raised = get('bg-raised');

  const check = (fg: string, bgName: string, bg: RGBA, min: number) => {
    const r = ratio(over(get(fg), bg), bg);
    const ok = r >= min;
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(5)} --${fg.padEnd(14)} on ${bgName.padEnd(26)} ${r.toFixed(2)} (min ${min})`);
  };

  for (const t of ['text-1', 'text-2', 'text-3']) {
    check(t, 'bg-surface', surface, 4.5);
    check(t, 'bg-raised', raised, 4.5);
  }
  for (const t of Object.keys(vars).filter((k) => /^(sem|syn)-/.test(k))) {
    check(t, 'bg-surface', surface, 4.5);
  }
  check('exec-on', 'exec', get('exec'), 4.5);
  check('text-1', 'exec-line-bg over bg-surface', over(get('exec-line-bg'), surface), 7);
}

if (failures > 0) {
  console.error(`\n${failures} contrast check(s) failed.`);
  process.exit(1);
}
console.log('\nAll contrast checks passed.');
