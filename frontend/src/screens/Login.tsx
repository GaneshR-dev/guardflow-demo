import { Navigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ErrorBanner';
import { useSession } from '@/auth/session';

// Placeholder until the sign-in screen moves (Phase 2). The old app and this app use the same
// saved session, so a sign-in in the current app also works here.
export function Login() {
  const session = useSession();
  if (session.token) return <Navigate to="/" replace />;
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[430px] flex-col p-[22px] max-[379px]:p-4">
      <div
        className="mt-10 grid size-14 place-items-center rounded-2xl bg-blue text-2xl font-extrabold text-white"
        aria-hidden="true"
      >
        G
      </div>
      <h1 className="mt-5 text-[28px] font-bold text-text">Guardian</h1>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">Sign in to manage today's attendance</p>
      <ErrorBanner message={session.endedMessage} />
      <p className="text-sm text-text">
        Sign-in is not in the new app yet. Sign in in the current app, then open this page again.
      </p>
      <Button asChild size="lg" className="mt-4 h-11 w-full">
        <a href="/app#login">Sign in in the current app</a>
      </Button>
    </main>
  );
}
