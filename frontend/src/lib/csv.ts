// Read a CSV text into rows of cells. Handles quoted cells, "" inside quotes, CRLF line ends and a
// byte order mark. Empty lines are removed. The same rules as parseCSV() in the old app.
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Turn a CSV with a header row into objects, one for each row. The keys are the trimmed header
// names and the values are trimmed. Returns null when there is no header or no data row.
export function csvRecords(text: string): Record<string, string>[] | null {
  const rows = parseCSV(text);
  if (rows.length < 2) return null;
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((cells) => Object.fromEntries(head.map((h, i) => [h, (cells[i] || '').trim()])));
}

// Read a picked file as text. FileReader works in all browsers (and in the tests).
export const readFileText = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsText(file);
  });
