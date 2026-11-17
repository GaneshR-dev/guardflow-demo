import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from './ErrorBanner';

export interface ConfirmLine {
  label: string;
  value: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  lines?: ConfirmLine[];
  description?: string;
  okLabel?: string;
  danger?: boolean;
  // The action runs. The OK button is disabled, so a second tap does not submit again.
  pending?: boolean;
  // The server message when the action failed. The dialog stays open.
  error?: string | null;
  onConfirm: () => void;
}

// Shared yes/no dialog. onConfirm runs when the user confirms. Cancel only closes it.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  lines = [],
  description,
  okLabel = 'Confirm',
  danger,
  pending,
  error,
  onConfirm,
}: Props) {
  // A fast double tap comes before React disables the button. This flag blocks the second tap.
  // It resets when the action ends, when the dialog shows a new question (title), or when an
  // error shows, so the user can try again.
  const fired = useRef(false);
  useEffect(() => {
    if (!pending) fired.current = false;
  }, [pending, open, title, error]);
  // A new question (for example "Second shift today") ignores taps for 400 ms, so the second tap
  // of a double tap cannot confirm it by accident.
  const lockedUntil = useRef(0);
  const firstTitle = useRef(title);
  useEffect(() => {
    if (title !== firstTitle.current) lockedUntil.current = performance.now() + 400;
    firstTitle.current = title;
  }, [title]);
  const confirm = () => {
    if (fired.current || pending || performance.now() < lockedUntil.current) return;
    fired.current = true;
    onConfirm();
  };
  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent className="max-w-[340px] rounded-2xl p-5 sm:max-w-[340px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-bold text-text">{title}</AlertDialogTitle>
          <AlertDialogDescription className={description ? '' : 'sr-only'}>
            {description || 'Check the details, then confirm.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {lines.length > 0 && (
          <dl className="flex flex-col gap-2">
            {lines.map((l) => (
              <div key={l.label} className="flex justify-between gap-3 text-sm">
                <dt className="text-muted-foreground">{l.label}</dt>
                <dd className="text-right font-semibold">{l.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <ErrorBanner message={error} />
        <AlertDialogFooter className="mx-0 mb-0 grid grid-cols-2 gap-2 rounded-none border-0 bg-transparent p-0 sm:grid">
          <AlertDialogCancel className="h-11" disabled={pending}>
            Cancel
          </AlertDialogCancel>
          {/* A plain button, not AlertDialogAction: the dialog must stay open while the action runs. */}
          <Button
            className="h-11"
            variant={danger ? 'destructive' : 'default'}
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={confirm}
          >
            {okLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
