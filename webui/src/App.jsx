import { marked } from "marked";
import { useEffect, useRef, useState } from "preact/hooks";
import { GeminiChat } from "./gemini-chat";

export function App() {
  const [apiKey, setApiKey] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [showSettings, setShowSettings] = useState(true);
  const [stream, setStream] = useState(true);
  const chatRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Load API key from localStorage
  useEffect(() => {
    const savedKey = localStorage.getItem("gemini_api_key");
    if (savedKey) {
      setApiKey(savedKey);
      setShowSettings(false);
    }
  }, []);

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const saveApiKey = () => {
    localStorage.setItem("gemini_api_key", apiKey);
    setShowSettings(false);
  };

  const handleSend = async () => {
    if (!input.trim() || !apiKey) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((msgs) => [...msgs, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      if (!chatRef.current) {
        chatRef.current = new GeminiChat(apiKey);
        await chatRef.current.initialize();
      }

      if (stream) {
        const assistantMessage = {
          role: "assistant",
          content: "",
          thoughts: "",
          toolCalls: [],
        };
        setMessages((msgs) => [...msgs, assistantMessage]);

        const streamGen = chatRef.current.sendMessageStream(userMessage);

        for await (const chunk of streamGen) {
          if (chunk.type === "text") {
            setMessages((msgs) => {
              const newMsgs = [...msgs];
              newMsgs[newMsgs.length - 1].content += chunk.content;
              return newMsgs;
            });
          } else if (chunk.type === "thought") {
            setMessages((msgs) => {
              const newMsgs = [...msgs];
              newMsgs[newMsgs.length - 1].thoughts += chunk.content;
              return newMsgs;
            });
          } else if (chunk.type === "toolCall") {
            setMessages((msgs) => {
              const newMsgs = [...msgs];
              newMsgs[newMsgs.length - 1].toolCalls.push({
                name: chunk.name,
                args: chunk.args,
                result: "...",
              });
              return newMsgs;
            });
          } else if (chunk.type === "toolResult") {
            setMessages((msgs) => {
              const newMsgs = [...msgs];
              const calls = newMsgs[newMsgs.length - 1].toolCalls;
              if (calls.length > 0) {
                calls[calls.length - 1].result = chunk.result;
              }
              return newMsgs;
            });
          }
        }
      } else {
        const response = await chatRef.current.sendMessage(userMessage);
        setMessages((msgs) => [
          ...msgs,
          {
            role: "assistant",
            content: response.text,
            thoughts: response.thoughts,
            toolCalls: response.toolCalls,
          },
        ]);
      }
    } catch (error) {
      setMessages((msgs) => [
        ...msgs,
        { role: "error", content: `Error: ${error.message}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (showSettings) {
    return (
      <div className="flex items-center justify-center h-screen p-4">
        <div className="max-w-md w-full bg-gray-100 dark:bg-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold">Settings</h2>
          <div>
            <label className="block text-sm mb-2">Gemini API Key</label>
            <input
              type="password"
              value={apiKey}
              onInput={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
              placeholder="Enter your API key"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="stream"
              checked={stream}
              onChange={(e) => setStream(e.target.checked)}
            />
            <label htmlFor="stream" className="text-sm">
              Enable streaming
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveApiKey}
              disabled={!apiKey}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            >
              Save
            </button>
            {messages.length > 0 && (
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-300 dark:border-gray-700 flex items-center">
        <h1 className="text-lg font-semibold">Producer Pal Chat</h1>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setShowSettings(true)}
            className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Settings
          </button>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            className="text-xs bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <p>Start a conversation with Producer Pal</p>
            <p className="text-sm mt-2">
              Connected to MCP server at localhost:3350
            </p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`${
              msg.role === "user"
                ? "ml-auto bg-blue-600 text-white"
                : msg.role === "error"
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800"
            } rounded-lg p-3 max-w-[90%] ${msg.role === "user" ? "ml-auto" : ""}`}
          >
            {msg.role === "assistant" && (
              <>
                {msg.thoughts && (
                  <div className="mb-2 p-2 bg-gray-200 dark:bg-gray-700 rounded text-xs border-l-4 border-yellow-500">
                    <div className="font-semibold mb-1">💭 Thinking:</div>
                    <div className="whitespace-pre-wrap">{msg.thoughts}</div>
                  </div>
                )}

                {msg.toolCalls?.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {msg.toolCalls.map((call, i) => (
                      <div
                        key={i}
                        className="text-xs p-2 bg-gray-200 dark:bg-gray-900 rounded"
                      >
                        <div className="font-mono">
                          🔧 {call.name}({JSON.stringify(call.args, null, 0)})
                        </div>
                        <details>
                          <summary className="m-1 truncate text-gray-600 dark:text-gray-400">
                            <span className="px-2">↳ {call.result}</span>
                          </summary>
                          <div className="mt-1 p-1 border-t break-all text-gray-600 dark:text-gray-500">
                            {call.result}
                          </div>
                        </details>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  className="prose dark:prose-invert prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: marked(msg.content) }}
                />
              </>
            )}

            {msg.role === "user" && <div>{msg.content}</div>}
            {msg.role === "error" && <div>{msg.content}</div>}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-300 dark:border-gray-700 p-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onInput={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Type a message... (Shift+Enter for new line)"
            className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded resize-none"
            rows="2"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50 hover:bg-blue-700"
          >
            {isLoading ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
