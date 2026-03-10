// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { type MessageOverrides } from "#webui/hooks/chat/use-chat";

export interface ChatStartProps {
  mcpStatus: "connected" | "connecting" | "error";
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
  handleSend: (message: string, options?: MessageOverrides) => Promise<void>;
  overrides: MessageOverrides;
}

/**
 * Start screen shown when no messages exist
 * @param {ChatStartProps} props - Component props
 * @param {"connected" | "connecting" | "error"} props.mcpStatus - MCP connection status
 * @param {string | null} props.mcpError - MCP error message
 * @param {() => Promise<void>} props.checkMcpConnection - Check MCP connection callback
 * @param {(message: string, options?: MessageOverrides) => Promise<void>} props.handleSend - Send message callback
 * @param {MessageOverrides} props.overrides - Per-message overrides
 * @returns {JSX.Element} - React component
 */
export function ChatStart({
  mcpStatus,
  mcpError,
  checkMcpConnection,
  handleSend,
  overrides,
}: ChatStartProps) {
  return (
    <div className="h-full items-center justify-center flex flex-col gap-8">
      {mcpStatus === "connected" && (
        <>
          <p className="text-zinc-500 dark:text-zinc-400">
            Start a conversation with Producer Pal
          </p>
          <button
            onClick={() => void handleSend("Connect to Ableton.", overrides)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            Quick Connect
          </button>
        </>
      )}

      {mcpStatus === "error" && (
        <>
          <h1 className="font-bold text-red-600 dark:text-red-400">
            Producer Pal Not Found
          </h1>
          <p className="text-sm text-red-600 dark:text-red-400">{mcpError}</p>
          <button
            onClick={() => void checkMcpConnection()}
            className="mt-2 px-2 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded hover:bg-zinc-300 dark:hover:bg-zinc-800"
          >
            Retry
          </button>
        </>
      )}
    </div>
  );
}
