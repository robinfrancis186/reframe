import { Component, type ReactNode } from 'react';
export default class RecoveryBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="app-recovery" role="alert">
        <h1>This view could not load.</h1>
        <p>Reload to retry. Your saved clipboard has not been cleared.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload Reframe
        </button>
        <p>If the problem continues, check that the local Reframe server is running.</p>
      </main>
    ) : (
      this.props.children
    );
  }
}
