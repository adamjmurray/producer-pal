import { useCallback, useEffect, useState } from "preact/hooks";
import { GeminiClient } from "../../chat/gemini-client";

type McpStatus = "connected" | "connecting" | "error";

interface UseMcpConnectionReturn {
  mcpStatus: McpStatus;
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
}

/**
 *
 * @returns {any} - Hook return value
 */
export function useMcpConnection(): UseMcpConnectionReturn {
  const [mcpStatus, setMcpStatus] = useState<McpStatus>("connecting");
  const [mcpError, setMcpError] = useState<string | null>(null);

  const checkMcpConnection = useCallback(async () => {
    setMcpStatus("connecting");
    setMcpError(null);
    try {
      await GeminiClient.testConnection();
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
