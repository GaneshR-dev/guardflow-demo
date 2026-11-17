import { Skeleton } from '@/components/ui/skeleton';

const WIDTHS = [120, 96, 132, 84, 110, 100, 126];

// Loader for a list. Show it at once when a request starts, with a short status text.
export function LoadingRows({ label, rows = 5 }: { label: string; rows?: number }) {
  return (
    <div>
      <p role="status" className="my-3 text-sm text-muted-foreground">
        {label}
      </p>
      <div aria-hidden="true" className="overflow-hidden rounded-2xl border bg-card">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b px-3.5 py-3 last:border-b-0">
            <Skeleton className="size-10 rounded-full bg-[#e6edf6]" />
            <span className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3 bg-[#e6edf6]" style={{ width: WIDTHS[i % WIDTHS.length] }} />
              <Skeleton className="h-2.5 w-16 bg-[#e6edf6]" />
            </span>
            <span className="flex flex-col items-end gap-1.5">
              <Skeleton className="h-3 w-[66px] bg-[#e6edf6]" />
              <Skeleton className="h-[18px] w-[52px] rounded-full bg-[#e6edf6]" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
