// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  detectCorsBlock,
  getMcpUrl,
  isViteDevServer,
} from "#webui/utils/mcp-url";

export type McpStatus = "connected" | "connecting" | "error";

export interface McpTool {
  id: string;
  name: string;
  description?: string;
}

interface UseMcpConnectionReturn {
  mcpStatus: McpStatus;
  mcpError: string | null;
  mcpTools: McpTool[] | null;
  checkMcpConnection: () => Promise<void>;
}

type FetchToolsResult =
  | { ok: true; tools: McpTool[] }
  | { ok: false; error: string; corsBlocked: boolean };

/**
 * @returns {UseMcpConnectionReturn} - Hook return value
 */
export function useMcpConnection(): UseMcpConnectionReturn {
  const [mcpStatus, setMcpStatus] = useState<McpStatus>("connecting");
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [mcpTools, setMcpTools] = useState<McpTool[] | null>(null);
  const mcpStatusRef = useRef(mcpStatus);
  const fetchSeqRef = useRef(0);

  // Mirror status into a ref so the focus listener (registered once) can
  // read the latest value without re-binding on every change.
  useEffect(() => {
    mcpStatusRef.current = mcpStatus;
  }, [mcpStatus]);

  const checkMcpConnection = useCallback(async (): Promise<void> => {
    setMcpStatus("connecting");
    setMcpError(null);
    setMcpTools(null);

    const result = await fetchToolsFromServer();

    if (result.ok) {
      setMcpTools(result.tools);
      setMcpStatus("connected");
    } else {
      setMcpStatus("error");
      setMcpError(result.error);
    }
  }, []);

  // Check connection on mount
  useEffect(() => {
    void checkMcpConnection();
  }, [checkMcpConnection]);

  // Re-list tools when the window regains focus so device-side changes
  // (e.g. toggling liveApiEnabled in the Setup tab adds/removes
  // ppal-live-api) surface in Settings → Tools without a reload. We
  // deliberately don't reset status to "connecting" — a transient
  // refresh failure shouldn't masquerade as a disconnect, and only fires
  // when already connected so initial mount isn't double-fetched.
  useEffect(() => {
    const handleFocus = (): void => {
      if (mcpStatusRef.current !== "connected") return;

      void (async (): Promise<void> => {
        // Monotonic seq guards against slow-then-fast resolution: if the
        // user thrashes focus and an earlier fetch resolves after a later
        // one, the stale result would otherwise stomp the fresh tool list.
        const mySeq = ++fetchSeqRef.current;
        const result = await fetchToolsFromServer();

        if (mySeq !== fetchSeqRef.current) return;

        if (result.ok) {
          setMcpTools(result.tools);
        }
      })();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return { mcpStatus, mcpError, mcpTools, checkMcpConnection };
}

// --- Helpers below main export ---

/**
 * Connect to the MCP server, list tools, and disconnect. The connect/list
 * pair is fused so callers can't observe a half-loaded state. Always closes
 * the client (swallowing close() failures) — leaving the client open after
 * a thrown listTools() leaks the underlying HTTP connection.
 * @returns Tools on success, or an error message + CORS-blocked flag on failure
 */
async function fetchToolsFromServer(): Promise<FetchToolsResult> {
  const mcpUrl = getMcpUrl();
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
  const client = new Client({
    name: "producer-pal-chat-ui",
    version: "1.0.0",
  });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const mapped: McpTool[] = tools.map((tool) => ({
      id: tool.name,
      name: (tool as { title?: string }).title ?? tool.name,
      description: tool.description,
    }));

    return { ok: true, tools: mapped };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const corsBlocked = isViteDevServer() && (await detectCorsBlock(mcpUrl));
    const finalMessage = corsBlocked
      ? "MCP server is running but blocking cross-origin requests. Rebuild in dev mode."
      : message;

    return { ok: false, error: finalMessage, corsBlocked };
  } finally {
    try {
      await client.close();
    } catch {
      // close() can throw if connect() never succeeded; we don't care here.
    }
  }
}
