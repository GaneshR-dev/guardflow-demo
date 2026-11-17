import { TONE_TEXT, type Tone } from '@/lib/tone';
import { cn } from '@/lib/utils';

interface Props {
  value: number | string;
  label: string;
  // Status colours (docs/GLOSSARY.md): green = Checked in, grey = Checked out, amber = Not checked in.
  tone?: Tone;
  // With onClick, the tile is a filter button (Attendance). Without it, it only shows a number (Home).
  onClick?: () => void;
  pressed?: boolean;
  disabled?: boolean;
}

// One big number with its label. Each number shows one time only on the screen.
export function StatTile({ value, label, tone, onClick, pressed, disabled }: Props) {
  const body = (
    <>
      <strong className={cn('block text-[26px] leading-tight font-bold tabular-nums', tone && TONE_TEXT[tone])}>
        {value}
      </strong>{' '}
      <span
        className={cn('mt-0.5 block text-[13px]', pressed ? 'font-semibold text-blue-text' : 'text-muted-foreground')}
      >
        {label}
      </span>
    </>
  );
  if (!onClick) return <div className="rounded-xl border bg-card px-3.5 py-3">{body}</div>;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-xl border bg-card px-3.5 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:opacity-60',
        pressed && 'border-blue bg-blue-tint ring-1 ring-blue',
      )}
    >
      {body}
    </button>
  );
}
