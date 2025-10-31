import { useCallback, useEffect, useState } from "preact/hooks";
import { GeminiClient } from "../chat/gemini-client.js";

export function useMcpConnection() {
  const [mcpStatus, setMcpStatus] = useState("connecting");
  const [mcpError, setMcpError] = useState("");

  const checkMcpConnection = useCallback(async () => {
    setMcpStatus("connecting");
    setMcpError("");
    try {
      await GeminiClient.testConnection();
      setMcpStatus("connected");
    } catch (error) {
      setMcpStatus("error");
      setMcpError(error.message);
    }
  }, []);

  // Check connection on mount
  useEffect(() => {
    checkMcpConnection();
  }, [checkMcpConnection]);

  return { mcpStatus, mcpError, checkMcpConnection };
}
