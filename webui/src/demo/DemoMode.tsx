// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Demo mode for visual testing of tool result UI.
 * Renders a fake conversation with realistic fixture data,
 * bypassing all MCP/AI SDK connections.
 *
 * Activate via ?demo query parameter.
 */

import { MessageList } from "#webui/components/chat/MessageList";
import { ToolNamesContext } from "#webui/hooks/connection/tool-names-context";
import { DEMO_TOOL_NAMES, demoMessages } from "./demo-fixtures";

const NO_OP_RETRY = async () => {};

// The last fixture message has a pending tool call (result: null)
const lastMsg = demoMessages.at(-1);
const hasPendingTool =
  lastMsg?.parts.some((p) => p.type === "tool" && p.result == null) ?? false;

/**
 * Renders a static conversation with all tool result scenarios.
 * @returns Demo mode component
 */
export function DemoMode() {
  return (
    <ToolNamesContext.Provider value={DEMO_TOOL_NAMES}>
      <div className="flex flex-col h-screen">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/30">
          <span className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
            Demo Mode — Visual Testing
          </span>
          <a
            href="?"
            className="text-xs text-blue-600 dark:text-blue-400 underline"
          >
            Exit Demo
          </a>
        </div>
        <div className="flex-1 overflow-y-auto">
          <MessageList
            messages={demoMessages}
            isAssistantResponding={hasPendingTool}
            handleRetry={NO_OP_RETRY}
          />
        </div>
      </div>
    </ToolNamesContext.Provider>
  );
}
