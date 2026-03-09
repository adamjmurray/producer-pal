// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type McpStatus } from "#webui/hooks/connection/use-mcp-connection";

interface HeaderStatusProps {
  mcpStatus: McpStatus;
}

/**
 * Responsive MCP connection status indicator.
 * Shows full text at sm+, icon-only below sm.
 * @param props - Component props
 * @param props.mcpStatus - MCP connection status
 * @returns Status indicator element
 */
export function HeaderStatus({ mcpStatus }: HeaderStatusProps) {
  if (mcpStatus === "connected") {
    return (
      <span
        className="text-green-600 dark:text-green-400"
        title="Connected to Producer Pal"
      >
        ✓<span className="hidden sm:inline"> Ready</span>
      </span>
    );
  }

  if (mcpStatus === "connecting") {
    return (
      <span
        className="text-gray-500 dark:text-gray-400"
        title="Looking for Producer Pal..."
      >
        👀<span className="hidden sm:inline"> Looking for Producer Pal...</span>
      </span>
    );
  }

  return (
    <span className="text-red-600 dark:text-red-400" title="Connection error">
      ✗<span className="hidden sm:inline"> Error</span>
    </span>
  );
}
