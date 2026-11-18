import { useMutation, useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { startSession, useSession } from '@/auth/session';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { api, friendlyError, isApiError } from '@/lib/api';
import type { Health, LoginResponse } from '@/types/api';

// Demo accounts of the fictional sample data. They show only when the server is in demo mode.
const DEMO_ACCOUNTS = [
  { role: 'Admin', username: 'admin.demo', password: 'demo123' },
  { role: 'Supervisor', username: 'supervisor.demo', password: 'demo123' },
];

const FIELD =
  'h-[54px] rounded-xl border-line bg-field px-4 text-base text-text focus-visible:border-blue focus-visible:ring-2 focus-visible:ring-blue';

function errorText(error: unknown) {
  if (!error) return '';
  const status = isApiError(error) ? error.status : 0;
  return friendlyError(status, error instanceof Error ? error.message : 'Request failed');
}

export function Login() {
  const session = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  // A second tap in the same moment must not send a second request.
  const sending = useRef(false);

  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<Health>('/api/health'),
    retry: false,
    staleTime: Infinity,
  });
  // When the health check fails, the demo box stays hidden. The sign-in form still works.
  const demoMode = health.data?.demo_mode === true;

  const signIn = useMutation({
    mutationFn: (creds: { username: string; password: string }) =>
      api<LoginResponse>('/api/login', { method: 'POST', body: JSON.stringify(creds) }),
    onSuccess: (r) => startSession(r.token, r.user),
    onError: (err) => {
      // Wrong password: keep the user ID, clear the password and put the cursor there.
      if (isApiError(err) && err.status === 401) setPassword('');
    },
    onSettled: () => {
      sending.current = false;
    },
  });

  const wrongPassword = isApiError(signIn.error) && signIn.error.status === 401;
  useEffect(() => {
    if (wrongPassword) passwordRef.current?.focus();
  }, [wrongPassword, signIn.failureCount]);

  if (session.token) return <Navigate to={session.user?.role === 'owner' ? '/owner' : '/home'} replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (sending.current) return;
    sending.current = true;
    signIn.mutate({ username: username.trim(), password });
  };

  const pending = signIn.isPending;
  const message = errorText(signIn.error) || session.endedMessage;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[430px] flex-col bg-login-bg px-[22px] pt-[60px] pb-[18px] max-[379px]:px-4">
      <div
        aria-hidden="true"
        className="grid size-[58px] place-items-center rounded-2xl bg-[linear-gradient(145deg,#2475f0,#1452c8)] text-[28px] font-extrabold text-white"
      >
        G
      </div>
      <h1 className="mt-7 text-[28px] leading-tight font-bold tracking-[-0.5px] text-text">Guardian</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted-foreground">Sign in to manage today's attendance</p>

      <ErrorBanner message={message} />

      <form onSubmit={onSubmit} aria-busy={pending || undefined} className="mt-1">
        <fieldset disabled={pending} className="flex flex-col gap-4">
          <div className="flex flex-col gap-[7px]">
            <Label htmlFor="username" className="text-[13px] font-bold text-text">
              User ID
            </Label>
            <Input
              id="username"
              name="username"
              required
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Enter your user ID"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={FIELD}
            />
          </div>
          <div className="flex flex-col gap-[7px]">
            <Label htmlFor="password" className="text-[13px] font-bold text-text">
              Password
            </Label>
            <div className="relative">
              <Input
                ref={passwordRef}
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${FIELD} pr-14`}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center tap-icon rounded-lg text-muted-foreground focus-visible:outline-2 focus-visible:outline-blue"
              >
                {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
          </div>
          <div className="-mt-1 flex justify-end">
            <Button
              type="button"
              variant="link"
              className="h-11 px-0 text-[13px] font-bold text-blue"
              onClick={() => setHelpOpen(true)}
            >
              Forgot password?
            </Button>
          </div>
          <Button
            ref={submitRef}
            type="submit"
            aria-busy={pending || undefined}
            className="h-[54px] w-full rounded-xl text-[15px] font-extrabold shadow-[0_8px_20px_rgba(35,103,234,0.18)]"
          >
            {pending ? (
              <>
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </fieldset>
      </form>

      {demoMode && (
        <section
          aria-labelledby="demoTitle"
          className="mt-6 rounded-r-xl border-l-[3px] border-blue bg-[#eaf2ff] px-3.5 py-3"
        >
          <h2 id="demoTitle" className="text-xs font-extrabold tracking-[0.4px] text-blue-text uppercase">
            Demo access
          </h2>
          <p className="mt-0.5 text-xs text-[#4d5f78]">Tap an account to fill the form.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.username}
                type="button"
                disabled={pending}
                onClick={() => {
                  setUsername(a.username);
                  setPassword(a.password);
                  submitRef.current?.focus();
                }}
                className="tap-card flex min-h-11 flex-col items-start justify-center rounded-lg border border-line bg-card px-3 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:opacity-50"
              >
                <strong className="text-[13px] text-text">{a.role}</strong>
                <small className="text-xs text-[#4d5f78]">{a.username}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-auto pt-8 text-center text-xs text-muted-foreground">© 2026 Guardian</footer>

      <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto w-full max-w-[430px] rounded-t-3xl pb-[max(20px,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="px-5 pt-5 pb-0">
            <SheetTitle className="text-lg font-bold text-text">Forgot your password?</SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              Ask your admin to reset your password. Admins can reset a supervisor password in Settings › Access.
            </SheetDescription>
          </SheetHeader>
          <div className="px-5">
            <SheetClose asChild>
              <Button className="h-12 w-full">OK</Button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
