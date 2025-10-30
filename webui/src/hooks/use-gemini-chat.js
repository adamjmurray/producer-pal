import { useRef, useState } from "preact/hooks";
import { getThinkingBudget, SYSTEM_INSTRUCTION } from "../config.js";
import { GeminiChat } from "./gemini-chat.js";
import { mergeMessages } from "./merge-messages.js";

export function useGeminiChat({
  apiKey,
  model,
  thinking,
  temperature,
  showThoughts,
  mcpStatus,
  mcpError,
  checkMcpConnection,
}) {
  const [messages, setMessages] = useState([]);
  const [isAssistantResponding, setIsAssistantResponding] = useState(false);
  const [activeModel, setActiveModel] = useState(null);
  const [activeThinking, setActiveThinking] = useState(null);
  const [activeTemperature, setActiveTemperature] = useState(null);
  const chatRef = useRef(null);

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
    setIsAssistantResponding(true);

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
          systemInstruction: SYSTEM_INSTRUCTION,
        };

        // Only set thinkingConfig if thinking is not disabled (0)
        // For Auto mode (-1) or specific budgets (>0), include thoughts based on user setting
        if (thinkingBudget !== 0) {
          config.thinkingConfig = {
            thinkingBudget,
            includeThoughts: showThoughts,
          };
        }

        chatRef.current = new GeminiChat(apiKey, config);
        await chatRef.current.initialize();
        setActiveModel(model);
        setActiveThinking(thinking);
        setActiveTemperature(temperature);
      }

      const stream = chatRef.current.sendMessage(userMessage);

      for await (const chatHistory of stream) {
        // console.log(
        //   "useGeminiChat received chunk, now history is",
        //   JSON.stringify(chatHistory, null, 2),
        // );
        setMessages(mergeMessages(chatHistory));
      }
    } catch (error) {
      console.error(error);
      let errorMessage = `${error}`;
      if (!errorMessage.startsWith("Error")) {
        errorMessage = `Error: ${errorMessage}`;
      }
      // TODO? Should the latest/current error be separate state from the list of messages?
      setMessages((msgs) => [
        ...msgs,
        {
          role: "error",
          parts: [
            {
              type: "text",
              content: errorMessage,
            },
          ],
        },
      ]);
    } finally {
      setIsAssistantResponding(false);
    }
  };

  return {
    messages,
    isAssistantResponding,
    activeModel,
    activeThinking,
    activeTemperature,
    handleSend,
    clearConversation,
  };
}
