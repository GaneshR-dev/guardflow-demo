import { useRef } from 'react';

// Run an action one time for each tap. A fast double tap comes before React disables the button,
// so this flag blocks the second tap until the action ends.
// Use: const once = useSingleSubmit(); … once(() => save.mutateAsync());
export function useSingleSubmit() {
  const busy = useRef(false);
  return (run: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true;
    run()
      .catch(() => {
        // The mutation shows its own error (useMutation keeps it in `error`), so nothing to do here.
      })
      .finally(() => {
        busy.current = false;
      });
  };
}
