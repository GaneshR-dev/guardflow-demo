import { Button } from '@/components/ui/button';

// Placeholder until Phase 2 moves the first screen. The old app stays at /app.
export default function App() {
  return (
    <main className="mx-auto min-h-svh max-w-[480px] p-[22px] max-[379px]:p-4">
      <h1 className="text-[27px] font-bold text-navy">Guardian</h1>
      <section className="mt-4 rounded-2xl border bg-card p-5 shadow-card">
        <h2 className="text-base font-bold">New app in progress</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The screens move here one at a time. Use the current app for now.
        </p>
        <Button asChild size="lg" className="mt-4 h-11 w-full">
          <a href="/app">Open the current app</a>
        </Button>
      </section>
    </main>
  );
}
