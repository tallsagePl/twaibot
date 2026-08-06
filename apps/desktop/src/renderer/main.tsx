import './shared/styles.css';
import { StrictMode, Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

class RootErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Renderer crash', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="boot-screen">
          <div className="welcome__panel">
            <h1>Ошибка интерфейса</h1>
            <p className="error">{this.state.error.message}</p>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
              {this.state.error.stack}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function showBootError(err: unknown): void {
  const root = document.getElementById('root');
  if (!root) {
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack ?? '' : '';
  root.innerHTML = `<div class="boot-screen"><div class="welcome__panel"><h1>Не удалось загрузить UI</h1><p class="error">${message}</p><pre style="white-space:pre-wrap;font-size:12px">${stack}</pre></div></div>`;
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element not found');
}

void import('./app/App')
  .then(({ App }) => {
    createRoot(rootEl).render(
      <StrictMode>
        <RootErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </RootErrorBoundary>
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    console.error(err);
    showBootError(err);
  });
