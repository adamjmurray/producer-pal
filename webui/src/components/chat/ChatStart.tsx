interface ChatStartProps {
  mcpStatus: "connected" | "connecting" | "error";
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
  handleSend: (
    message: string,
    options?: { thinking?: string; temperature?: number },
  ) => Promise<void>;
}

/**
 * Start screen shown when no messages exist
 * @param {ChatStartProps} root0 - Component props
 * @param {"connected" | "connecting" | "error"} root0.mcpStatus - MCP connection status
 * @param {string | null} root0.mcpError - MCP error message
 * @param {() => Promise<void>} root0.checkMcpConnection - Check MCP connection callback
 * @param {(message: string) => Promise<void>} root0.handleSend - Send message callback
 * @returns {JSX.Element} - React component
 */
export function ChatStart({
  mcpStatus,
  mcpError,
  checkMcpConnection,
  handleSend,
}: ChatStartProps) {
  return (
    <div className="h-full items-center justify-center flex flex-col gap-8">
      {mcpStatus === "connected" && (
        <>
          <p className="text-gray-500 dark:text-gray-400">
            Start a conversation with Producer Pal
          </p>
          <button
            onClick={() => void handleSend("Connect to Ableton.")}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
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
            className="mt-2 px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Retry
          </button>
        </>
      )}
    </div>
  );
}
