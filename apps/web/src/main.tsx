import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRouter } from './app/router';
import { ThemeProvider } from './app/theme';
import { ApiError } from './lib/api';
import './lib/format';
import './styles/global.css';
import './styles/print.css';

const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <AppRouter />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
