import { useEffect, useState } from "preact/hooks";
import { GeminiChat } from "./gemini-chat.js";

export function useMcpConnection() {
  const [mcpStatus, setMcpStatus] = useState("connecting");
  const [mcpError, setMcpError] = useState("");

  const checkMcpConnection = async () => {
    setMcpStatus("connecting");
    setMcpError("");
    try {
      await GeminiChat.testConnection();
      setMcpStatus("connected");
    } catch (error) {
      setMcpStatus("error");
      setMcpError(error.message);
    }
  };

  // Check connection on mount
  useEffect(() => {
    checkMcpConnection();
  }, []);

  return { mcpStatus, mcpError, checkMcpConnection };
}
