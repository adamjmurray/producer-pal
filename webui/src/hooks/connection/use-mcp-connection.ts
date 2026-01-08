import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { useCallback, useEffect, useState } from "preact/hooks";
import { getMcpUrl } from "#webui/utils/mcp-url";

type McpStatus = "connected" | "connecting" | "error";

interface UseMcpConnectionReturn {
  mcpStatus: McpStatus;
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
}

/**
 * @returns {UseMcpConnectionReturn} - Hook return value
 */
export function useMcpConnection(): UseMcpConnectionReturn {
  const [mcpStatus, setMcpStatus] = useState<McpStatus>("connecting");
  const [mcpError, setMcpError] = useState<string | null>(null);

  const checkMcpConnection = useCallback(async () => {
    setMcpStatus("connecting");
    setMcpError(null);

    try {
      const transport = new StreamableHTTPClientTransport(new URL(getMcpUrl()));
      const client = new Client({
        name: "producer-pal-chat-ui-test",
        version: "1.0.0",
      });

      await client.connect(transport);
      await client.close();
      setMcpStatus("connected");
    } catch (error: unknown) {
      setMcpStatus("error");
      setMcpError(error instanceof Error ? error.message : "Unknown error");
    }
  }, []);

  // Check connection on mount
  useEffect(() => {
    void checkMcpConnection();
  }, [checkMcpConnection]);

  return { mcpStatus, mcpError, checkMcpConnection };
}
