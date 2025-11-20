import { GoogleGenAI, Modality } from "@google/genai";
import type { LiveServerToolCall, Session } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { useCallback, useRef, useState } from "preact/hooks";
import type { UIMessage, UIPart } from "../types/messages.js";
import {
  playAudioChunk as playAudio,
  processAudioInput,
} from "./voice-chat-audio-helpers.js";
import {
  closeMcpClient,
  handleToolCall as handleMcpToolCall,
} from "./voice-chat-mcp-helpers.js";
import { createMessageHandler } from "./voice-chat-message-handler.js";

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

  const sessionRef = useRef<Session | null>(null);
  const mcpClientRef = useRef<Client | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackAudioContextRef = useRef<AudioContext | null>(null);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isConnectedRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  const currentUserMessageRef = useRef<string>("");
  const currentAssistantMessageRef = useRef<string>("");

  const handleToolCall = useCallback(async (toolCall: LiveServerToolCall) => {
    const results = await handleMcpToolCall(
      toolCall,
      mcpClientRef.current,
      sessionRef.current,
    );

    // Add tool calls to the current assistant message
    if (results.length > 0) {
      setMessages((prev) => {
        const updated = [...prev];
        // Find or create the last assistant message
        let lastMessage = updated[updated.length - 1];

        if (lastMessage?.role !== "model") {
          lastMessage = {
            role: "model",
            parts: [],
            rawHistoryIndex: updated.length,
          };
          updated.push(lastMessage);
        }

        // Add tool parts
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

  const playAudioChunk = useCallback(async (base64Audio: string) => {
    await playAudio(
      base64Audio,
      playbackAudioContextRef,
      currentAudioSourceRef,
      nextPlayTimeRef,
    );
  }, []);

  const connect = useCallback(async () => {
    if (!apiKey) {
      setError("API key is required");
      return;
    }

    try {
      console.log("Connecting to Live API and MCP server...");
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

      console.log(`Loaded ${filteredTools.length} MCP tools for voice chat`);

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
            console.log("WebSocket opened");
            setIsConnected(true);
            isConnectedRef.current = true;
            setError(null);
          },
          onmessage: createMessageHandler(
            {
              currentAudioSourceRef,
              nextPlayTimeRef,
              currentUserMessageRef,
              currentAssistantMessageRef,
            },
            {
              setMessages,
              handleToolCall: (toolCall) =>
                void handleToolCall(toolCall as LiveServerToolCall),
              playAudioChunk: (data) => void playAudioChunk(data),
            },
          ),
          onerror: (e) => {
            console.error("WebSocket error:", e);
            setError(e.message || "An error occurred");
            setIsConnected(false);
            isConnectedRef.current = false;
          },
          onclose: (event) => {
            console.log(`WebSocket closed (code: ${event.code})`);
            setIsConnected(false);
            isConnectedRef.current = false;
          },
        },
      });

      console.log("Connected successfully");
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
  }, [apiKey, voiceName, mcpUrl, enabledTools, playAudioChunk, handleToolCall]);

  const startStreaming = useCallback(async () => {
    try {
      if (!sessionRef.current) {
        setError("Please connect first");
        return;
      }

      console.log("Starting audio streaming...");
      nextPlayTimeRef.current = 0;

      if (!playbackAudioContextRef.current) {
        playbackAudioContextRef.current = new AudioContext({
          sampleRate: 24000,
        });

        if (playbackAudioContextRef.current.state === "suspended") {
          await playbackAudioContextRef.current.resume();
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      console.log("Microphone access granted");
      mediaStreamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!isConnectedRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const base64Data = processAudioInput(
          inputData,
          audioContext.sampleRate,
        );

        try {
          sessionRef.current?.sendRealtimeInput({
            audio: {
              data: base64Data,
              mimeType: "audio/pcm;rate=16000",
            },
          });
        } catch (err) {
          console.error("Error sending audio:", err);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsStreaming(true);
      setError(null);
      console.log("Audio streaming started");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to start streaming";
      console.error("Failed to start streaming:", err);
      setError(errorMessage);
      setIsStreaming(false);
    }
  }, []);

  const stopStreaming = useCallback(() => {
    console.log("Stopping audio streaming...");

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (currentAudioSourceRef.current) {
      currentAudioSourceRef.current.stop();
      currentAudioSourceRef.current = null;
    }

    nextPlayTimeRef.current = 0;

    if (playbackAudioContextRef.current) {
      void playbackAudioContextRef.current.close();
      playbackAudioContextRef.current = null;
    }

    try {
      sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true });
    } catch (err) {
      console.error("Error sending audioStreamEnd:", err);
    }

    setIsStreaming(false);

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
