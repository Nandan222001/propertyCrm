import React from 'react';

/**
 * Last line of defence: a render error shows a recoverable screen instead of a
 * blank page, and the stack is logged locally (never posted to a third party).
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ui-error]', error?.message, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 48, fontFamily: 'DM Sans, sans-serif' }}>
        <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
        <p style={{ color: '#8f99a9', fontSize: 12 }}>
          The screen failed to render. Reload to continue — no data was lost.
        </p>
        <button className="button button-primary" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}
