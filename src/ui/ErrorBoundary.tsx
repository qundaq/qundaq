import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback: (error: Error) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches an error thrown while rendering a screen and shows `fallback` instead of a blank app. A class
 * component, because React 19 still offers error boundaries only as classes. React itself logs the caught
 * error with console.error (its default onCaughtError); nothing is reported anywhere. Shell keys it by tab,
 * so switching tabs starts over.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}
