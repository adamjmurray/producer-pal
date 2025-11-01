import { useCallback, useEffect, useState } from "preact/hooks";
import { GeminiClient } from "../chat/gemini-client.js";

type McpStatus = "connected" | "connecting" | "error";

interface UseMcpConnectionReturn {
  mcpStatus: McpStatus;
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
}

export function useMcpConnection(): UseMcpConnectionReturn {
  const [mcpStatus, setMcpStatus] = useState<McpStatus>("connecting");
  const [mcpError, setMcpError] = useState<string | null>(null);

  const checkMcpConnection = useCallback(async () => {
    setMcpStatus("connecting");
    setMcpError(null);
    try {
      await GeminiClient.testConnection();
      setMcpStatus("connected");
    } catch (error: any) {
      setMcpStatus("error");
      setMcpError(error?.message ?? "Unknown error");
    }
  }, []);

  // Check connection on mount
  useEffect(() => {
    checkMcpConnection();
  }, [checkMcpConnection]);

  return { mcpStatus, mcpError, checkMcpConnection };
}
