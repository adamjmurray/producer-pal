// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Component, type ComponentChildren, type VNode } from "preact";

interface ErrorBoundaryProps {
  fallback: VNode;
  children: ComponentChildren;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches render errors in child components and displays a fallback UI.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { hasError: false };

  static override getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error("ErrorBoundary caught render error:", error);
  }

  override render() {
    if (this.state.hasError) return this.props.fallback;

    return this.props.children;
  }
}
