/// <reference types="node" />
// Checks the text that users see in the React screens against docs/GLOSSARY.md.
// It reads the source files, removes comments, and looks at JSX text and string literals
// that read like app text (they have a space or start with a capital letter). Code names,
// import paths and URL paths are not checked.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// The "Do not use" words of docs/GLOSSARY.md. Change both files at the same time.
const BANNED: [RegExp, string][] = [
  [/\bemployees?\b/i, 'guard'],
  [/\bstaff\b/i, 'guard'],
  [/\bworkers?\b/i, 'guard'],
  [/\blocations?\b/i, 'site'],
  [/\bbranch(es)?\b/i, 'site'],
  [/\babsent\b/i, 'not checked in'],
  [/\bnot in\b/i, 'not checked in'],
  [/\bon duty\b/i, 'checked in'],
  [/\blog ?(in|out)\b/i, 'sign in / sign out'],
  [/\bclock (in|out)\b/i, 'check in / check out'],
];

const SRC = path.resolve(import.meta.dirname);
const FOLDERS = ['screens', 'components', 'layout', 'routes.tsx'];

function files(p: string): string[] {
  if (statSync(p).isFile()) return /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
  return readdirSync(p)
    .filter((n: string) => n !== 'ui') // shadcn/ui parts have no app text
    .flatMap((n: string) => files(path.join(p, n)));
}

// Text that a user can see: JSX text and string literals that read like words.
export function appText(source: string): string[] {
  const code = source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const out: string[] = [];
  for (const m of code.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) {
    // A match after "=>" is code, not JSX text.
    if (!/[=;()]/.test(m[1])) out.push(m[1].trim());
  }
  for (const m of code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
    const s = m[2];
    if (s.startsWith('/') || s.startsWith('@') || s.startsWith('.') || s.includes('://')) continue;
    // A Tailwind class list is not app text.
    if (/^[a-z0-9\s\-:[\]/.()%#_,&>=!*'"]+$/.test(s) && s.includes('-')) continue;
    if (/\s/.test(s) || /^[A-Z]/.test(s)) out.push(s);
  }
  return out;
}

describe('app text uses the words in docs/GLOSSARY.md', () => {
  const all = FOLDERS.flatMap((f) => files(path.join(SRC, f)));

  test('the check finds the source files', () => {
    expect(all.length).toBeGreaterThan(5);
  });

  test.each(all.map((f) => [path.relative(SRC, f), f]))('%s', (_name, file) => {
    const found = appText(readFileSync(file, 'utf8')).flatMap((text) =>
      BANNED.filter(([re]) => re.test(text)).map(([re, use]) => `"${text}" has ${re} — use "${use}"`),
    );
    expect(found).toEqual([]);
  });

  test('the check sees a banned word in JSX text and in a string', () => {
    expect(
      appText('<p>2 employees</p>; const t = "No locations yet"; // locations\nconst c = "bg-login-bg px-4";'),
    ).toEqual(['2 employees', 'No locations yet']);
  });
});
