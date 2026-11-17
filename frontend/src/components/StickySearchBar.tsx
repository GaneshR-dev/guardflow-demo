import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  // True when the content above scrolled away: the bar gets a line and a shadow.
  stuck: boolean;
  // For example a one-line copy of the filters.
  children?: ReactNode;
}

// A search box that stays at the top of the screen while a long list scrolls.
export function StickySearchBar({ value, onChange, label, placeholder, stuck, children }: Props) {
  return (
    <div
      className={cn(
        'sticky top-0 z-10 -mx-[22px] mt-3 bg-app px-[22px] py-2 max-[379px]:-mx-4 max-[379px]:px-4',
        stuck && 'border-b shadow-[0_6px_12px_-10px_rgba(20,45,90,0.35)]',
      )}
    >
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label={label}
          placeholder={placeholder}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 rounded-xl border-line bg-field pl-10 text-base"
        />
      </div>
      {children}
    </div>
  );
}
