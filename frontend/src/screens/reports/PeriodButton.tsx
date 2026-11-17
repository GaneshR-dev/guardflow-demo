import { Calendar, ChevronDown } from 'lucide-react';

interface Props {
  type: 'date' | 'month';
  value: string;
  label: string;
  onChange: (value: string) => void;
}

// A select-style button for a date or a month. The real native input lies over the button
// (transparent), so a tap opens the phone's own picker. A hidden input with showPicker() does
// not work on many phones.
export function PeriodButton({ type, value, label, onChange }: Props) {
  return (
    <label className="relative flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-card px-3 text-[15px] font-semibold text-text has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue">
      <Calendar className="size-[18px] shrink-0 text-blue" aria-hidden="true" />
      <span className="truncate">{label}</span>
      <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        type={type}
        value={value}
        required
        aria-label={type === 'date' ? `Change date, now ${label}` : `Change month, now ${label}`}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="absolute -inset-px cursor-pointer opacity-0"
      />
    </label>
  );
}
