import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30 text-xs text-destructive">
          <span className="font-semibold">Component error:</span>{' '}
          {this.state.error?.message ?? 'Unknown error'}
        </div>
      );
    }
    return this.props.children;
  }
}


// export function ErrorFallback() {
//   return (
//     <div style={{ padding: 20 }}>
//       <h2>⚠️ Oops! Something went wrong.</h2>
//       <p>Please refresh the page or try again later.</p>
//     </div>
//   );
// }
