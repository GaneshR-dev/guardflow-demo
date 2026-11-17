import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { Toaster } from '@/components/ui/sonner';
import { AppRoutes } from './routes';

export default function App({ queryClient }: { queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/next">
        <AppRoutes />
      </BrowserRouter>
      <Toaster
        position="bottom-center"
        offset={84}
        mobileOffset={84}
        toastOptions={{ style: { background: 'var(--navy)', color: '#fff', border: 0, fontSize: 13 } }}
      />
    </QueryClientProvider>
  );
}
