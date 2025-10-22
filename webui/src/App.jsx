import { marked } from "marked";
import { useEffect, useRef, useState } from "preact/hooks";
import { GeminiChat } from "./gemini-chat";

export function App() {
  const [apiKey, setApiKey] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState("system");
  const [showSettings, setShowSettings] = useState(true);
  const [model, setModel] = useState("gemini-2.5-flash");
  const [activeModel, setActiveModel] = useState(null);
  const [thinking, setThinking] = useState("Auto");
  const [activeThinking, setActiveThinking] = useState(null);
  const [temperature, setTemperature] = useState(1.0);
  const [activeTemperature, setActiveTemperature] = useState(null);
  const [showThoughts, setShowThoughts] = useState(true);
  const [mcpStatus, setMcpStatus] = useState("connecting");
  const [mcpError, setMcpError] = useState("");
  const chatRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Load API key, theme, model, thinking, and temperature from localStorage
  useEffect(() => {
    const savedKey = localStorage.getItem("gemini_api_key");
    if (savedKey) {
      setApiKey(savedKey);
      setShowSettings(false);
    }
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      setTheme(savedTheme);
    }
    const savedModel = localStorage.getItem("gemini_model");
    if (savedModel) {
      setModel(savedModel);
    }
    const savedThinking = localStorage.getItem("gemini_thinking");
    if (savedThinking) {
      setThinking(savedThinking);
    }
    const savedTemperature = localStorage.getItem("gemini_temperature");
    if (savedTemperature != null) {
      setTemperature(parseFloat(savedTemperature));
    }
    const savedShowThoughts = localStorage.getItem("gemini_showThoughts");
    if (savedShowThoughts != null) {
      setShowThoughts(savedShowThoughts === "true");
    }
  }, []);

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      if (theme === "system") {
        root.classList.toggle("dark", mediaQuery.matches);
      } else {
        root.classList.toggle("dark", theme === "dark");
      }
    };

    applyTheme();
    localStorage.setItem("theme", theme);

    // Listen for system theme changes when using "system" theme
    if (theme === "system") {
      mediaQuery.addEventListener("change", applyTheme);
      return () => mediaQuery.removeEventListener("change", applyTheme);
    }
  }, [theme]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check MCP connection on mount
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

  useEffect(() => {
    checkMcpConnection();
  }, []);

  const saveApiKey = () => {
    localStorage.setItem("gemini_api_key", apiKey);
    localStorage.setItem("gemini_model", model);
    localStorage.setItem("gemini_thinking", thinking);
    localStorage.setItem("gemini_temperature", temperature.toString());
    localStorage.setItem("gemini_showThoughts", showThoughts.toString());
    setShowSettings(false);
  };

  const cancelSettings = () => {
    // Reload values from localStorage
    const savedKey = localStorage.getItem("gemini_api_key");
    if (savedKey) {
      setApiKey(savedKey);
    }
    const savedModel = localStorage.getItem("gemini_model");
    if (savedModel) {
      setModel(savedModel);
    }
    const savedThinking = localStorage.getItem("gemini_thinking");
    if (savedThinking) {
      setThinking(savedThinking);
    }
    const savedTemperature = localStorage.getItem("gemini_temperature");
    if (savedTemperature != null) {
      setTemperature(parseFloat(savedTemperature));
    }
    const savedShowThoughts = localStorage.getItem("gemini_showThoughts");
    if (savedShowThoughts != null) {
      setShowThoughts(savedShowThoughts === "true");
    }
    setShowSettings(false);
  };

  const clearConversation = () => {
    setMessages([]);
    chatRef.current = null;
    setActiveModel(null);
    setActiveThinking(null);
    setActiveTemperature(null);
  };

  const handleSend = async (message) => {
    if (!apiKey) return;
    if (!message?.trim()) return;

    const userMessage = message.trim();
    setInput("");
    setMessages((msgs) => [...msgs, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      if (!chatRef.current) {
        // Auto-retry MCP connection if it failed
        if (mcpStatus === "error") {
          await checkMcpConnection();
          if (mcpStatus === "error") {
            throw new Error(`MCP connection failed: ${mcpError}`);
          }
        }

        const thinkingBudget = getThinkingBudget(thinking);
        const config = {
          model,
          temperature,
        };

        config.thinkingConfig = { thinkingBudget };
        if (thinkingBudget > 0) {
          config.thinkingConfig.includeThoughts = showThoughts;
        }

        chatRef.current = new GeminiChat(apiKey, config);
        await chatRef.current.initialize();
        setActiveModel(model);
        setActiveThinking(thinking);
        setActiveTemperature(temperature);
        setMcpStatus("connected");
      }

      const assistantMessage = {
        role: "assistant",
        parts: [],
      };
      setMessages((msgs) => [...msgs, assistantMessage]);

      const streamGen = chatRef.current.sendMessageStream(userMessage);

      for await (const chunk of streamGen) {
        if (chunk.type === "text" || chunk.type === "thought") {
          setMessages((msgs) => {
            const newMsgs = [...msgs];
            const lastMsg = newMsgs[newMsgs.length - 1];
            const lastPart = lastMsg.parts[lastMsg.parts.length - 1];

            // If last part is same type, append to it
            if (lastPart && lastPart.type === chunk.type) {
              lastPart.content += chunk.content;
            } else {
              // Create new part
              lastMsg.parts.push({
                type: chunk.type,
                content: chunk.content,
              });
            }
            return newMsgs;
          });
        } else if (chunk.type === "toolCall") {
          setMessages((msgs) => {
            const newMsgs = [...msgs];
            const lastMsg = newMsgs[newMsgs.length - 1];
            lastMsg.parts.push({
              type: "tool",
              name: chunk.name,
              args: chunk.args,
              result: "...",
            });
            return newMsgs;
          });
        } else if (chunk.type === "toolResult") {
          setMessages((msgs) => {
            const newMsgs = [...msgs];
            const lastMsg = newMsgs[newMsgs.length - 1];
            // Find the last tool part and update its result
            for (let i = lastMsg.parts.length - 1; i >= 0; i--) {
              if (lastMsg.parts[i].type === "tool") {
                lastMsg.parts[i].result = chunk.result;
                break;
              }
            }
            return newMsgs;
          });
        }
      }
    } catch (error) {
      // Check if this is an MCP connection error
      if (
        error.message?.includes("MCP") ||
        error.message?.includes("connect")
      ) {
        setMcpStatus("error");
        setMcpError(error.message);
      }

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
      handleSend(input);
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
          <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
            <a
              href="https://aistudio.google.com/api-keys"
              target="_blank"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Get a Gemini API Key
            </a>{" "}
            <span>(free, requires Google account)</span>
          </p>
          <div>
            <label className="block text-sm mb-2">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
            >
              <option value="gemini-2.5-pro">
                Gemini 2.5 Pro (most advanced)
              </option>
              <option value="gemini-2.5-flash">
                Gemini 2.5 Flash (fast & intelligent)
              </option>
              <option value="gemini-2.5-flash-lite">
                Gemini 2.5 Flash-Lite (ultra fast)
              </option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-2">Thinking</label>
            <select
              value={thinking}
              onChange={(e) => setThinking(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
            >
              <option value="Off">Off</option>
              <option value="Auto">Auto</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Ultra">Ultra</option>
            </select>
          </div>
          {thinking !== "Off" && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="showThoughts"
                checked={showThoughts}
                onChange={(e) => setShowThoughts(e.target.checked)}
              />
              <label htmlFor="showThoughts" className="text-sm">
                Show thinking process
              </label>
            </div>
          )}
          <div>
            <label className="block text-sm mb-2">
              Randomness: {Math.round((temperature / 2) * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onInput={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Note: Settings changes apply to new conversations
          </p>
          <div className="flex gap-2">
            <button
              onClick={saveApiKey}
              disabled={!apiKey}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            >
              Save
            </button>
            {localStorage.getItem("gemini_api_key") && (
              <button
                onClick={cancelSettings}
                className="px-4 py-2 bg-gray-600 text-white rounded"
              >
                Cancel
              </button>
            )}
          </div>
          {(messages.length > 0 || activeModel) && (
            <div className="pt-2 border-t border-gray-300 dark:border-gray-600">
              <button
                onClick={clearConversation}
                className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Clear & Restart Conversation
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const getModelName = (modelId) => {
    switch (modelId) {
      case "gemini-2.5-pro":
        return "Gemini 2.5 Pro";
      case "gemini-2.5-flash":
        return "Gemini 2.5 Flash";
      case "gemini-2.5-flash-lite":
        return "Gemini 2.5 Flash-Lite";
      default:
        return modelId;
    }
  };

  const getThinkingBudget = (level) => {
    switch (level) {
      case "Off":
        return 0;
      case "Low":
        return 2048;
      case "Medium":
        return 4096;
      case "High":
        return 8192;
      case "Ultra":
        return 16384;
      case "Auto":
        return -1;
      default:
        return 0;
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-300 dark:border-gray-700 flex items-baseline">
        <h1 className="text-lg font-semibold">Producer Pal Chat</h1>
        <div className="ml-2 flex gap-1 text-xs">
          {mcpStatus === "connected" && (
            <span className="text-green-600 dark:text-green-400">✓ Ready</span>
          )}
          {mcpStatus === "connecting" && (
            <span className="text-gray-500 dark:text-gray-400">
              👀 Looking for Producer Pal...
            </span>
          )}
          {mcpStatus === "error" && (
            <span className="text-red-600 dark:text-red-400">✗ Error</span>
          )}
        </div>
        <div className="ml-auto flex gap-3 items-baseline">
          {activeModel && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {getModelName(activeModel)}
            </span>
          )}
          {activeThinking && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Thinking: {activeThinking}
            </span>
          )}
          {activeTemperature != null && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {Math.round((activeTemperature / 2) * 100)}% random
            </span>
          )}
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
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
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
                <p className="text-sm text-red-600 dark:text-red-400">
                  {mcpError}
                </p>
                <button
                  onClick={checkMcpConnection}
                  className="mt-2 px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Retry
                </button>
              </>
            )}
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`${
              msg.role === "user"
                ? "ml-auto text-black bg-blue-300 dark:text-white dark:bg-blue-600"
                : msg.role === "error"
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800"
            } rounded-lg py-0.5 px-3 max-w-[90%]`}
          >
            {msg.role === "assistant" && (
              <div className="flex flex-col gap-3 py-1">
                {msg.parts?.map((part, i) => {
                  if (part.type === "thought") {
                    return (
                      <details
                        key={i}
                        className="p-2 bg-gray-200 dark:bg-gray-700 rounded text-xs border-l-3 border-green-500"
                        open
                      >
                        <summary className="font-semibold">
                          💭 Thinking:
                        </summary>
                        <div
                          className="pt-2 prose dark:prose-invert prose-sm text-xs max-w-none"
                          dangerouslySetInnerHTML={{
                            __html: marked(part.content.trim()),
                          }}
                        />
                      </details>
                    );
                  } else if (part.type === "tool") {
                    return (
                      <div key={i}>
                        <div className="text-xs p-2 font-mono bg-gray-200 dark:bg-gray-900 rounded">
                          <details>
                            <summary>🔧 {part.name}</summary>
                            <div className="mt-1 p-1 border-t break-all text-gray-500 dark:text-gray-500">
                              {part.name}({JSON.stringify(part.args, null, 0)})
                            </div>
                          </details>
                          <details>
                            <summary className="my-1 truncate text-gray-600 dark:text-gray-400">
                              &nbsp;&nbsp;&nbsp;↳ {part.result}
                            </summary>
                            <div className="mt-1 p-1 border-t break-all text-gray-500 dark:text-gray-500">
                              {part.result}
                            </div>
                          </details>
                        </div>
                      </div>
                    );
                  } else if (part.type === "text") {
                    return (
                      <div
                        key={i}
                        className="prose dark:prose-invert prose-sm max-w-none"
                        dangerouslySetInnerHTML={{
                          __html: marked(part.content),
                        }}
                      />
                    );
                  }
                  return null;
                })}
              </div>
            )}

            {msg.role === "user" && (
              <div className="prose dark:prose-invert prose-sm">
                {msg.content}
              </div>
            )}
            {msg.role === "error" && (
              <div className="prose dark:prose-invert prose-sm">
                {msg.content}
              </div>
            )}
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
            className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded resize-none placeholder:dark:text-gray-400 placeholder:text-gray-500"
            rows="2"
          />
          <button
            onClick={() => handleSend(input)}
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
