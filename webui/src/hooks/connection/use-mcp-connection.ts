// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { useCallback, useEffect, useState } from "preact/hooks";
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

/**
 * @returns {UseMcpConnectionReturn} - Hook return value
 */
export function useMcpConnection(): UseMcpConnectionReturn {
  const [mcpStatus, setMcpStatus] = useState<McpStatus>("connecting");
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [mcpTools, setMcpTools] = useState<McpTool[] | null>(null);

  const checkMcpConnection = useCallback(async () => {
    setMcpStatus("connecting");
    setMcpError(null);
    setMcpTools(null);

    const mcpUrl = getMcpUrl();

    try {
      const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
      const client = new Client({
        name: "producer-pal-chat-ui-test",
        version: "1.0.0",
      });

      await client.connect(transport);
      const { tools } = await client.listTools();

      setMcpTools(
        tools.map((tool) => ({
          id: tool.name,
          name: (tool as { title?: string }).title ?? tool.name,
          description: tool.description,
        })),
      );
      await client.close();
      setMcpStatus("connected");
    } catch (error: unknown) {
      setMcpStatus("error");
      const message = error instanceof Error ? error.message : "Unknown error";

      if (isViteDevServer() && (await detectCorsBlock(mcpUrl))) {
        setMcpError(
          "MCP server is running but blocking cross-origin requests. Rebuild in dev mode.",
        );
      } else {
        setMcpError(message);
      }
    }
  }, []);

  // Check connection on mount
  useEffect(() => {
    void checkMcpConnection();
  }, [checkMcpConnection]);

  return { mcpStatus, mcpError, mcpTools, checkMcpConnection };
}
