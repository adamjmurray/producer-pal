// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeItem } from "@openai/agents/realtime";

interface HistoryPaneProps {
  history: RealtimeItem[];
}

/**
 * Render the live RealtimeSession history: user/assistant transcripts and
 * function-call items with their tool name + output.
 *
 * @param props - component props
 * @param props.history - the realtime history items
 * @returns History list
 */
export function HistoryPane({ history }: HistoryPaneProps) {
  if (history.length === 0) {
    return (
      <div className="text-sm text-zinc-500 text-center py-8">
        Conversation will appear here once you start talking.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {history.map((item) => (
        <HistoryItem key={item.itemId} item={item} />
      ))}
    </div>
  );
}

/**
 * Render one realtime history item by type.
 *
 * @param props - component props
 * @param props.item - the realtime item
 * @returns Item view
 */
function HistoryItem({ item }: { item: RealtimeItem }) {
  if (item.type === "message") {
    return <MessageItem item={item} />;
  }

  if (item.type === "function_call") {
    return <FunctionCallItem item={item} />;
  }

  if (item.type === "mcp_call" || item.type === "mcp_tool_call") {
    return <McpCallItem item={item} />;
  }

  return null;
}

/**
 * Render a user/assistant/system message with its transcript or text.
 *
 * @param props - component props
 * @param props.item - the message item
 * @returns Message view
 */
function MessageItem({
  item,
}: {
  item: Extract<RealtimeItem, { type: "message" }>;
}) {
  const text = item.content
    .map((c) => {
      if (c.type === "input_text" || c.type === "output_text") return c.text;

      // Remaining variants are input_audio | output_audio; both carry transcript.
      return c.transcript ?? "";
    })
    .filter(Boolean)
    .join(" ");

  if (!text) return null;

  const align = item.role === "user" ? "items-end" : "items-start";
  const bubble =
    item.role === "user"
      ? "bg-blue-600 text-white"
      : item.role === "assistant"
        ? "bg-zinc-200 dark:bg-zinc-800"
        : "bg-zinc-100 dark:bg-zinc-900 text-zinc-500 italic";

  return (
    <div className={`flex flex-col ${align}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${bubble}`}
      >
        {text}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 mt-0.5">
        {item.role}
      </div>
    </div>
  );
}

/**
 * Render a function-call item (local tool execution).
 *
 * @param props - component props
 * @param props.item - the function-call item
 * @returns Function-call view
 */
function FunctionCallItem({
  item,
}: {
  item: Extract<RealtimeItem, { type: "function_call" }>;
}) {
  return (
    <div className="rounded border border-zinc-300 dark:border-zinc-700 p-2 text-xs font-mono">
      <div className="font-semibold">
        ▸ {item.name} <span className="text-zinc-500">({item.status})</span>
      </div>
      {item.arguments && (
        <pre className="mt-1 overflow-x-auto text-zinc-600 dark:text-zinc-400">
          {item.arguments}
        </pre>
      )}
      {item.output && (
        <pre className="mt-1 overflow-x-auto bg-zinc-100 dark:bg-zinc-900 p-1 max-h-32">
          {item.output}
        </pre>
      )}
    </div>
  );
}

/**
 * Render an MCP-call item (remote hosted MCP).
 *
 * @param props - component props
 * @param props.item - the MCP-call item
 * @returns MCP-call view
 */
function McpCallItem({
  item,
}: {
  item: Extract<RealtimeItem, { type: "mcp_call" | "mcp_tool_call" }>;
}) {
  return (
    <div className="rounded border border-purple-300 dark:border-purple-700 p-2 text-xs font-mono">
      <div className="font-semibold">
        ▸ MCP: {item.name}{" "}
        <span className="text-zinc-500">({item.status})</span>
      </div>
      {item.output && (
        <pre className="mt-1 overflow-x-auto bg-zinc-100 dark:bg-zinc-900 p-1 max-h-32">
          {item.output}
        </pre>
      )}
    </div>
  );
}
