import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// A password field with a 44 px show/hide button.
export function PasswordInput({ className, ...props }: Omit<ComponentProps<typeof Input>, 'type'>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? 'text' : 'password'} className={cn(className, 'pr-14')} />
      <button
        type="button"
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        onClick={() => setShown((v) => !v)}
        className="absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:text-text focus-visible:outline-2 focus-visible:outline-blue"
      >
        {shown ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}
