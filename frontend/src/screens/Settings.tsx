import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { signOut } from '@/auth/signOut';
import { NotMovedYet } from './NotMovedYet';

// Placeholder until Settings moves (Phase 2). Sign-out is here so that the new app can end a session.
export function Settings() {
  const [pending, setPending] = useState(false);
  return (
    <NotMovedYet title="Settings" oldScreen="settings">
      <Button
        variant="outline"
        className="h-12 px-[22px]"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await signOut();
        }}
      >
        Sign out
      </Button>
    </NotMovedYet>
  );
}
