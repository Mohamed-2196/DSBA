import { Component, type ErrorInfo, type ReactNode } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import './ErrorBoundary.css';

export interface ErrorBoundaryProps {
  /** shown in the console message ("[DSBA Hub] HotThreads crashed") */
  name?: string;
  /**
   * default: a compact "This section didn't load" line with a Try again button.
   * Pass null to render nothing (the shell does this for global overlays).
   */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /** when it changes, the boundary clears its error (e.g. a route param) */
  resetKey?: unknown;
  children?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render errors in a subtree so one broken widget can't take down the page.
 * Wrap every component you import from another feature's public module:
 *   <ErrorBoundary name="HotThreads"><HotThreads n={5} /></ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[DSBA Hub] ${this.props.name || 'A component'} crashed:`, error, info?.componentStack);
  }

  override componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.reset();
  }

  reset = () => {
    this.setState({ error: null });
  };

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { fallback } = this.props;
    if (fallback === null) return null;
    if (typeof fallback === 'function') return fallback(error, this.reset);
    if (fallback !== undefined) return fallback;
    return (
      <div className="ui-boundary" role="alert">
        <WarningCircle className="ui-boundary__icon" aria-hidden="true" weight="fill" />
        <span>This section didn’t load.</span>
        <button type="button" className="ui-boundary__retry" onClick={this.reset}>
          Try again
        </button>
      </div>
    );
  }
}
