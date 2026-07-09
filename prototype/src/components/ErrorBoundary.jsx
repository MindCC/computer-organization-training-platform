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
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h2>页面出错了</h2>
          <p>{this.state.error?.message || "未知错误"}</p>
          <button onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            style={{ marginTop: "1rem", padding: "0.5rem 1.5rem", borderRadius: "8px", border: "none", cursor: "pointer" }}>
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
