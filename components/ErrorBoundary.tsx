import React, { ErrorInfo, ReactNode } from "react";
import { ErrorCard } from "./ErrorCard";

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  componentDidMount() {
    window.addEventListener('popstate', this.handleReset);
    window.addEventListener('hashchange', this.handleReset);
  }

  componentWillUnmount() {
    window.removeEventListener('popstate', this.handleReset);
    window.removeEventListener('hashchange', this.handleReset);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorCard 
            error={this.state.error} 
            resetErrorBoundary={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}