// Thin progress bar. The number is in the text next to it, so the bar is hidden from screen readers.
export function ProgressBar({ value }: { value: number }) {
  return (
    <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-[#edf1f7]">
      <span className="block h-full rounded-full bg-blue" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
