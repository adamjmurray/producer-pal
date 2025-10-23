export function ChatStart({
  mcpStatus,
  mcpError,
  checkMcpConnection,
  handleSend,
}) {
  return (
    <div className="h-full items-center justify-center flex flex-col gap-8">
      {mcpStatus === "connected" && (
        <>
          <p className="text-gray-500 dark:text-gray-400">
            Start a conversation with Producer Pal
          </p>
          <button
            onClick={() => handleSend("Connect to Ableton.")}
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
            onClick={checkMcpConnection}
            className="mt-2 px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Retry
          </button>
        </>
      )}
    </div>
  );
}
