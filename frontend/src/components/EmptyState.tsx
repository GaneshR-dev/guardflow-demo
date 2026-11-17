import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  icon: ReactNode;
  title: string;
  text: string;
  // 'error' adds role="alert" and the red icon.
  tone?: 'default' | 'error';
  children?: ReactNode;
}

// Empty, error and "not found" states. Tell why the view is empty and give a next step.
export function EmptyState({ icon, title, text, tone = 'default', children }: Props) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className="flex flex-col items-center gap-3 px-5 pt-14 pb-6 text-center"
    >
      <span
        className={cn(
          'grid size-16 place-items-center rounded-full [&_svg]:size-[30px]',
          tone === 'error' ? 'bg-red-soft text-red-text' : 'bg-soft text-blue-text',
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <h2 className="text-base font-bold text-text">{title}</h2>
      <p className="max-w-[300px] text-sm text-muted-foreground">{text}</p>
      {children && <div className="mt-2 flex flex-col items-center gap-2">{children}</div>}
    </div>
  );
}
