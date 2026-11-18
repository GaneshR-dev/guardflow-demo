// Status colours (docs/GLOSSARY.md): green = Checked in, grey = Checked out, amber = Not checked in.
export type Tone = 'green' | 'grey' | 'amber';

export const TONE_TEXT: Record<Tone, string> = {
  green: 'text-green-text',
  grey: 'text-muted-foreground',
  amber: 'text-amber-text',
};
