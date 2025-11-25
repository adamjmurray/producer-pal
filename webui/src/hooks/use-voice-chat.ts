import { GoogleGenAI, Modality } from "@google/genai";
import type { LiveServerToolCall, Session } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { useCallback, useRef, useState } from "preact/hooks";
import type { UIMessage, UIPart } from "../types/messages";
import { AudioRecorder } from "./audio-recorder";
import { AudioStreamer } from "./audio-streamer";
import {
  closeMcpClient,
  handleToolCall as handleMcpToolCall,
} from "./voice-chat-mcp-helpers";
import { createMessageHandler } from "./voice-chat-message-handler";

const DEBUG = localStorage.getItem("voice-debug") === "true";

function log(...args: unknown[]): void {
  if (DEBUG) console.log("[VoiceChat]", performance.now().toFixed(1), ...args);
}

export interface VoiceChatState {
  isConnected: boolean;
  isStreaming: boolean;
  error: string | null;
  messages: UIMessage[];
  connect: () => Promise<void>;
  disconnect: () => void;
  startStreaming: () => Promise<void>;
  stopStreaming: () => void;
}

/**
 * Custom hook for managing voice chat with Gemini Live API and MCP tools
 * @param apiKey - Gemini API key for authentication
 * @param voiceName - Optional voice name for text-to-speech
 * @param mcpUrl - URL of the MCP server (default: http://localhost:3350/mcp)
 * @param enabledTools - Record of enabled tool names
 * @returns {VoiceChatState} Voice chat state and control functions
 */
// eslint-disable-next-line max-lines-per-function -- Voice chat hook requires complex initialization
export function useVoiceChat(
  apiKey: string,
  voiceName?: string,
  mcpUrl = "http://localhost:3350/mcp",
  enabledTools?: Record<string, boolean>,
): VoiceChatState {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);

  // Core refs
  const sessionRef = useRef<Session | null>(null);
  const mcpClientRef = useRef<Client | null>(null);
  const isConnectedRef = useRef(false);

  // Audio handling refs - using proper classes now
  const streamerRef = useRef<AudioStreamer | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);

  // Message tracking refs
  const currentUserMessageRef = useRef<string>("");
  const currentAssistantMessageRef = useRef<string>("");

  const handleToolCall = useCallback(async (toolCall: LiveServerToolCall) => {
    const results = await handleMcpToolCall(
      toolCall,
      mcpClientRef.current,
      sessionRef.current,
    );

    if (results.length > 0) {
      setMessages((prev) => {
        const updated = [...prev];
        let lastMessage = updated[updated.length - 1];

        if (lastMessage?.role !== "model") {
          lastMessage = {
            role: "model",
            parts: [],
            rawHistoryIndex: updated.length,
          };
          updated.push(lastMessage);
        }

        for (const result of results) {
          const toolPart: UIPart = {
            type: "tool",
            name: result.name,
            args: result.args,
            result: result.result,
            isError: result.isError,
          };
          lastMessage.parts.push(toolPart);
        }

        return updated;
      });
    }
  }, []);

  const connect = useCallback(async () => {
    if (!apiKey) {
      setError("API key is required");
      return;
    }

    try {
      log("Connecting to Live API and MCP server...");
      const ai = new GoogleGenAI({ apiKey });
      const model = "gemini-2.5-flash-native-audio-preview-09-2025";

      // Connect to MCP server
      const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));

      mcpClientRef.current = new Client({
        name: "producer-pal-voice-chat",
        version: "1.0.0",
      });
      await mcpClientRef.current.connect(transport);

      // List and filter MCP tools
      const toolsResult = await mcpClientRef.current.listTools();
      const filteredTools = enabledTools
        ? toolsResult.tools.filter((tool) => enabledTools[tool.name] !== false)
        : toolsResult.tools;

      log(`Loaded ${filteredTools.length} MCP tools for voice chat`);

      // Convert to Gemini format
      const tools =
        filteredTools.length > 0
          ? [
              {
                functionDeclarations: filteredTools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  parametersJsonSchema: tool.inputSchema,
                })),
              },
            ]
          : [];

      const config: {
        responseModalities: Modality[];
        systemInstruction: string;
        tools?: typeof tools;
        speechConfig?: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: string } };
        };
      } = {
        responseModalities: [Modality.AUDIO],
        systemInstruction:
          "You are a helpful voice assistant for music production. Keep responses concise and natural.",
        ...(tools.length > 0 ? { tools } : {}),
      };

      if (voiceName) {
        config.speechConfig = {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        };
      }

      const session = await ai.live.connect({
        model,
        config,
        callbacks: {
          onopen: () => {
            log("WebSocket opened");
            setIsConnected(true);
            isConnectedRef.current = true;
            setError(null);
          },
          onmessage: createMessageHandler(
            {
              currentUserMessageRef,
              currentAssistantMessageRef,
              streamerRef,
            },
            {
              setMessages,
              handleToolCall: (toolCall) =>
                void handleToolCall(toolCall as LiveServerToolCall),
            },
          ),
          onerror: (e) => {
            console.error("WebSocket error:", e);
            setError(e.message || "An error occurred");
            setIsConnected(false);
            isConnectedRef.current = false;
          },
          onclose: (event) => {
            log(`WebSocket closed (code: ${event.code})`);
            setIsConnected(false);
            isConnectedRef.current = false;
          },
        },
      });

      log("Connected successfully");
      sessionRef.current = session;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Connection failed";
      console.error("Connection failed:", err);
      setError(errorMessage);

      await closeMcpClient(mcpClientRef.current);
      // eslint-disable-next-line require-atomic-updates -- Cleanup after error is safe
      mcpClientRef.current = null;
    }
  }, [apiKey, voiceName, mcpUrl, enabledTools, handleToolCall]);

  const startStreaming = useCallback(async () => {
    try {
      if (!sessionRef.current) {
        setError("Please connect first");
        return;
      }

      log("Starting audio streaming...");

      // Create playback AudioContext at 24kHz for output
      if (!playbackContextRef.current) {
        playbackContextRef.current = new AudioContext({ sampleRate: 24000 });

        if (playbackContextRef.current.state === "suspended") {
          await playbackContextRef.current.resume();
        }
      }

      // Create AudioStreamer for playback
      streamerRef.current = new AudioStreamer(playbackContextRef.current);
      await streamerRef.current.resume();

      // Create AudioRecorder for input (worklet resamples to 16kHz)
      recorderRef.current = new AudioRecorder();
      recorderRef.current.setCallbacks({
        onData: (base64Audio) => {
          if (!isConnectedRef.current) return;

          try {
            sessionRef.current?.sendRealtimeInput({
              audio: {
                data: base64Audio,
                mimeType: "audio/pcm;rate=16000",
              },
            });
          } catch (err) {
            console.error("Error sending audio:", err);
          }
        },
      });

      await recorderRef.current.start();

      setIsStreaming(true);
      setError(null);
      log("Audio streaming started");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to start streaming";
      console.error("Failed to start streaming:", err);
      setError(errorMessage);
      setIsStreaming(false);
    }
  }, []);

  const stopStreaming = useCallback(() => {
    log("Stopping audio streaming...");

    // Stop recorder
    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
    }

    // Stop streamer with fade-out
    if (streamerRef.current) {
      streamerRef.current.stop();
      streamerRef.current = null;
    }

    // Close playback context
    if (playbackContextRef.current) {
      void playbackContextRef.current.close();
      playbackContextRef.current = null;
    }

    // Notify server of stream end
    try {
      sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true });
    } catch (err) {
      console.error("Error sending audioStreamEnd:", err);
    }

    setIsStreaming(false);

    // Close session and MCP client
    isConnectedRef.current = false;
    try {
      sessionRef.current?.close();
    } catch (err) {
      console.error("Error closing session:", err);
    }
    sessionRef.current = null;

    void closeMcpClient(mcpClientRef.current);
    mcpClientRef.current = null;

    setIsConnected(false);
  }, []);

  const disconnect = useCallback(() => {
    if (isStreaming) {
      stopStreaming();
    } else {
      isConnectedRef.current = false;
      try {
        sessionRef.current?.close();
      } catch (err) {
        console.error("Error closing session:", err);
      }
      sessionRef.current = null;

      void closeMcpClient(mcpClientRef.current);
      mcpClientRef.current = null;

      setIsConnected(false);
    }
  }, [isStreaming, stopStreaming]);

  return {
    isConnected,
    isStreaming,
    error,
    messages,
    connect,
    disconnect,
    startStreaming,
    stopStreaming,
  };
}
