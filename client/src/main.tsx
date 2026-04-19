import { trpc } from '@/lib/trpc';
import { supabase } from '@/lib/supabase';
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, TRPCClientError } from '@trpc/client';
import { createRoot } from 'react-dom/client';
import superjson from 'superjson';
import App from './App';
import './index.css';

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === 'undefined') return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = import.meta.env.BASE_URL + 'login';
};

queryClient.getQueryCache().subscribe((event) => {
  if (event.type === 'updated' && event.action.type === 'error') {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error('[API Query Error]', error);
  }
});

queryClient.getMutationCache().subscribe((event) => {
  if (event.type === 'updated' && event.action.type === 'error') {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error('[API Mutation Error]', error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${import.meta.env.VITE_API_URL}/trpc`,
      transformer: superjson,
      async headers() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return {};
        return { Authorization: `Bearer ${session.access_token}` };
      },
    }),
  ],
});

createRoot(document.getElementById('root')!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
