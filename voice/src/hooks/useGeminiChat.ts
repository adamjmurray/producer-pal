import { useState, useCallback, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function useGeminiChat(apiKey: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (userMessage: string) => {
      if (!apiKey) {
        setError('API key is required');
        return;
      }

      if (!userMessage.trim()) {
        return;
      }

      // Add user message
      const newUserMessage: Message = {
        role: 'user',
        content: userMessage,
      };

      setMessages((prev) => [...prev, newUserMessage]);
      setIsLoading(true);
      setError(null);

      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Build chat history for context
        const chatHistory = messages.map((msg) => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        }));

        const chat = model.startChat({
          history: chatHistory,
        });

        const result = await chat.sendMessageStream(userMessage);

        let assistantMessage = '';

        // Process streaming response
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          assistantMessage += chunkText;

          // Update the assistant's message incrementally
          setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.role === 'assistant') {
              // Update existing assistant message
              return [
                ...prev.slice(0, -1),
                { ...lastMessage, content: assistantMessage },
              ];
            } else {
              // Add new assistant message
              return [
                ...prev,
                { role: 'assistant', content: assistantMessage },
              ];
            }
          });
        }

        setIsLoading(false);
      } catch (err) {
        setIsLoading(false);
        const errorMessage =
          err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Chat error:', err);
      }
    },
    [apiKey, messages]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearChat,
    cancelRequest,
  };
}
