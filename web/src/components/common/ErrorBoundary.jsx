import { Component } from "react";
import { ErrorState } from "./States.jsx";
// Last line of defence: a rendering bug shows a recoverable screen instead of a blank page. Details go to the console only.
export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error(error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="container page"><ErrorState title="Something went wrong" error={{ message: "An unexpected error occurred. Reloading usually fixes it.", status: 500 }} onRetry={() => window.location.reload()} /></div>;
  }
}
