import { Component } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import './ErrorBoundary.css';

/**
 * Catches render errors in a subtree so one broken widget can't take down the page.
 * Wrap every component you import from another feature's public.js:
 *   <ErrorBoundary name="HotThreads"><HotThreads n={5} /></ErrorBoundary>
 *
 * @param {string} name      shown in the console message ("[DSBA Hub] HotThreads crashed")
 * @param {node|((error, reset) => node)|null} fallback
 *        default: a compact "This section didn't load" line with a Try again button.
 *        Pass null to render nothing (the shell does this for global overlays).
 * @param {any} resetKey     when it changes, the boundary clears its error (e.g. a route param)
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[DSBA Hub] ${this.props.name || 'A component'} crashed:`, error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.reset();
  }

  reset() {
    this.setState({ error: null });
  }

  render() {
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
