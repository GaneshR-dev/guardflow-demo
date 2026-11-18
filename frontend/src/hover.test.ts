/// <reference types="node" />
// Checks that each clickable item in the React screens has a hover state (docs/UI-GUIDE.md,
// "Hover and press states"). It reads the source files and finds each opening tag of a <button>,
// <Link>, <a>, a <label> that holds an input, and a raw <input> or <textarea>. A tag with a
// className must have a hover class (`hover:` or a `tap-` utility). shadcn parts (components/ui)
// have their own hover.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const SRC = path.resolve(import.meta.dirname);
const FOLDERS = ['screens', 'components', 'layout'];

function files(p: string): string[] {
  if (statSync(p).isFile()) return /\.tsx$/.test(p) && !/\.test\.tsx$/.test(p) ? [p] : [];
  return readdirSync(p)
    .filter((n: string) => n !== 'ui')
    .flatMap((n: string) => files(path.join(p, n)));
}

// The text of the opening tag that starts at `start`: up to the first ">" outside braces and quotes.
function openingTag(src: string, start: number) {
  let depth = 0;
  let quote = '';
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

const HOVER = /hover:|\btap-(card|icon|tab)\b/;
// An invisible input: the label or button around it shows the hover.
const HIDDEN = /sr-only|opacity-0|type="hidden"/;

export function problems(src: string, file: string) {
  const out: string[] = [];
  for (const m of src.matchAll(/<(button|Link|a|label|input|textarea)\b/g)) {
    const tag = openingTag(src, m.index);
    const line = src.slice(0, m.index).split('\n').length;
    const where = `${file}:${line} <${m[1]}>`;
    if (m[1] === 'label') {
      const body = src.slice(m.index, src.indexOf('</label>', m.index));
      if (!/<input\b/.test(body)) continue;
    }
    if ((m[1] === 'input' || m[1] === 'textarea') && HIDDEN.test(tag)) continue;
    if (!tag.includes('className')) {
      // <Button asChild><a …> gets the style and the hover of the Button.
      if (/asChild[^<]*>\s*$/.test(src.slice(Math.max(0, m.index - 120), m.index))) continue;
      out.push(`${where} has no className and no hover state`);
    } else if (!HOVER.test(tag)) out.push(`${where} has no hover state. Use tap-card, tap-icon or tap-tab.`);
  }
  return out;
}

describe('hover states', () => {
  test('the check finds an item with no hover', () => {
    expect(problems('<button className="rounded-xl border">x</button>', 'a.tsx')).toHaveLength(1);
    expect(problems('<button className="tap-card rounded-xl">x</button>', 'a.tsx')).toEqual([]);
    expect(problems('<Button asChild>\n  <a href="/x">x</a>\n</Button>', 'a.tsx')).toEqual([]);
    expect(problems('<label className="flex"><input className="sr-only" /></label>', 'a.tsx')).toHaveLength(1);
    expect(problems('<label htmlFor="x">Name</label>', 'a.tsx')).toEqual([]);
  });

  test('each button, link, clickable label and input in the screens has a hover state', () => {
    const all = FOLDERS.flatMap((f) => files(path.join(SRC, f))).flatMap((f) =>
      problems(readFileSync(f, 'utf8'), path.relative(SRC, f)),
    );
    expect(all).toEqual([]);
  });
});
