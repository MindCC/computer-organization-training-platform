import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (process.env.NODE_ENV !== "test") {
      console.error("ErrorBoundary caught:", error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <section className="section-panel feature-error" role="alert">
          <h2>这个页面暂时无法打开</h2>
          <p>请刷新后重试。服务器中已保存的记录不会被删除。</p>
          <button onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            type="button" className="primary-button">
            刷新页面
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}
