import { Download } from 'lucide-react';

interface Props {
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}

// The "Excel" button in the title row. Same height, corners and white background as the date and
// site buttons on the page.
export function ExcelButton({ disabled, busy, onClick }: Props) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={onClick}
      className="tap-card flex h-10 shrink-0 items-center gap-1.5 rounded-xl border bg-card px-3.5 text-[15px] font-semibold text-blue focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-50"
    >
      <Download className="size-[18px]" aria-hidden="true" />
      Excel
    </button>
  );
}
