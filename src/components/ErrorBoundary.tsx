import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    // Log to console so it appears in Tauri's stderr/webview devtools
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, info } = this.state;

    return (
      <div className="min-h-screen bg-base flex items-center justify-center p-8">
        <div className="max-w-lg w-full space-y-4">
          <div className="flex items-center gap-3 text-red-400">
            <AlertTriangle size={20} />
            <h1 className="text-base font-semibold">Something went wrong</h1>
          </div>

          <p className="text-sm text-slate-400">
            An unexpected error occurred in the UI. You can try reloading the window.
          </p>

          {error && (
            <pre className="bg-panel border border-border rounded-lg p-3 text-xs font-mono text-red-300 whitespace-pre-wrap break-all overflow-auto max-h-40">
              {error.message}
            </pre>
          )}

          {info?.componentStack && (
            <details className="text-xs text-slate-600">
              <summary className="cursor-default hover:text-slate-400 transition-colors select-none">
                Component stack
              </summary>
              <pre className="mt-2 bg-panel border border-border rounded-lg p-3 font-mono text-slate-500 whitespace-pre-wrap break-all overflow-auto max-h-48">
                {info.componentStack}
              </pre>
            </details>
          )}

          <button
            onClick={() => this.setState({ hasError: false, error: null, info: null })}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-300 bg-panel border border-border rounded-md hover:border-slate-500 transition-colors cursor-default"
          >
            <RefreshCw size={13} />
            Retry
          </button>
        </div>
      </div>
    );
  }
}
