import { useRef, useState } from "preact/hooks";
import { getThinkingBudget, SYSTEM_INSTRUCTION } from "../config.js";
import { GeminiChat } from "./gemini-chat.js";

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
    setMessages((msgs) => [...msgs, { role: "user", content: userMessage }]);
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
              // When adding a new thought or text part, close all previous thoughts
              if (chunk.type === "thought" || chunk.type === "text") {
                for (const part of lastMsg.parts) {
                  if (part.type === "thought" && part.isOpen) {
                    part.isOpen = false;
                  }
                }
              }

              // Create new part
              const newPart = {
                type: chunk.type,
                content: chunk.content,
              };
              if (chunk.type === "thought") {
                newPart.isOpen = true;
              }
              lastMsg.parts.push(newPart);
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
              result: null,
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
        // Note: We can't call setMcpStatus here since it's managed by useMcpConnection
        // The error message will inform the user
      }

      setMessages((msgs) => [
        ...msgs,
        { role: "error", content: `Error: ${error.message}` },
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
