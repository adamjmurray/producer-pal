import type { UIMessage } from "#webui/types/messages";
import { createSupervisorTool } from "#webui/voice/supervisor-tool";
import { createVoiceAgent } from "#webui/voice/voice-agent-config";
import { convertRealtimeHistoryToUIMessages } from "#webui/voice/voice-message-converter";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  OpenAIRealtimeWebRTC,
  RealtimeSession,
  type RealtimeItem,
} from "@openai/agents/realtime";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

export type VoiceStatus = "disconnected" | "connecting" | "connected";

// Use relative URL so it works with both dev server and production
const getMcpUrl = () => {
  // TODO: support alternate ports
  return "http://localhost:3350/mcp";
};

interface UseVoiceChatProps {
  apiKey: string;
  model: string;
}

interface UseVoiceChatReturn {
  status: VoiceStatus;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendText: (text: string) => void;
  voiceMessages: UIMessage[];
  error: string | null;
}

/* istanbul ignore next -- @preserve requires live OpenAI API */
/**
 * Fetches an ephemeral API key for WebRTC connection to OpenAI Realtime
 * @param {string} apiKey - The user's OpenAI API key
 * @returns {Promise<string>} The ephemeral key for WebRTC
 */
async function getEphemeralKey(apiKey: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-realtime-preview-2025-06-03",
      voice: "sage",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get ephemeral key: ${error}`);
  }

  const data = await response.json();
  return data.client_secret.value;
}

/* istanbul ignore next -- @preserve requires live MCP server */
/**
 * Creates an MCP client and connects to the MCP server
 * @returns {Promise<Client>} Connected MCP client
 */
async function createMcpClient(): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(getMcpUrl()));
  const client = new Client({
    name: "producer-pal-voice",
    version: "1.0.0",
  });
  await client.connect(transport);
  return client;
}

/**
 * Hook for managing voice chat sessions using OpenAI Realtime API
 * @param {UseVoiceChatProps} props - Configuration props
 * @returns {UseVoiceChatReturn} Voice chat state and controls
 */
export function useVoiceChat({
  apiKey,
  model,
}: UseVoiceChatProps): UseVoiceChatReturn {
  const [status, setStatus] = useState<VoiceStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RealtimeItem[]>([]);

  const sessionRef = useRef<RealtimeSession | null>(null);
  const mcpClientRef = useRef<Client | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /* istanbul ignore next -- @preserve lifecycle effect for browser audio */
  // Create audio element on mount
  useEffect(() => {
    audioRef.current = document.createElement("audio");
    audioRef.current.autoplay = true;
    return () => {
      audioRef.current = null;
    };
  }, []);

  /* istanbul ignore next -- @preserve cleanup effect for unmount */
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.close();
        sessionRef.current = null;
      }
      if (mcpClientRef.current) {
        void mcpClientRef.current.close();
        mcpClientRef.current = null;
      }
    };
  }, []);

  /* istanbul ignore next -- @preserve requires live WebRTC/MCP connections */
  const connect = useCallback(async () => {
    if (sessionRef.current) return; // Already connected
    if (!apiKey) {
      setError("OpenAI API key is required");
      return;
    }

    setError(null);
    setStatus("connecting");

    try {
      // Create MCP client for supervisor tool calls
      const mcpClient = await createMcpClient();
      mcpClientRef.current = mcpClient;

      // Get ephemeral key
      const ephemeralKey = await getEphemeralKey(apiKey);

      // Create supervisor tool
      const supervisorTool = createSupervisorTool();

      // Create voice agent with supervisor tool
      const voiceAgent = createVoiceAgent(supervisorTool);

      // Create session
      // eslint-disable-next-line require-atomic-updates -- safe in React callback
      sessionRef.current = new RealtimeSession(voiceAgent, {
        transport: new OpenAIRealtimeWebRTC({
          audioElement: audioRef.current ?? undefined,
        }),
        model: "gpt-4o-realtime-preview-2025-06-03",
        config: {
          inputAudioTranscription: {
            model: "gpt-4o-mini-transcribe",
          },
        },
        // Pass context for supervisor tool (older SDK version supports objects)
        context: {
          apiKey,
          model,
          mcpClient,
          get history() {
            return history;
          },
        },
      });

      // Set up event listeners
      sessionRef.current.on("history_updated", (items: RealtimeItem[]) => {
        setHistory([...items]);
      });

      sessionRef.current.on("history_added", (item: RealtimeItem) => {
        setHistory((prev) => [...prev, item]);
      });

      sessionRef.current.on("error", (err: unknown) => {
        console.error("Voice session error:", err);
        if (err && typeof err === "object" && "message" in err) {
          setError(String(err.message));
        } else {
          setError(String(err));
        }
      });

      // Connect
      await sessionRef.current.connect({ apiKey: ephemeralKey });
      setStatus("connected");
    } catch (err) {
      console.error("Failed to connect voice session:", err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus("disconnected");
      // eslint-disable-next-line require-atomic-updates -- safe in React callback
      sessionRef.current = null;
      if (mcpClientRef.current) {
        void mcpClientRef.current.close();
        mcpClientRef.current = null;
      }
    }
  }, [apiKey, model, history]);

  /* istanbul ignore next -- @preserve requires live session */
  const disconnect = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (mcpClientRef.current) {
      void mcpClientRef.current.close();
      mcpClientRef.current = null;
    }
    setStatus("disconnected");
    setHistory([]);
  }, []);

  /* istanbul ignore next -- @preserve requires live session */
  const sendText = useCallback((text: string) => {
    if (!sessionRef.current) return;
    sessionRef.current.sendMessage(text);
  }, []);

  // Convert realtime history to UI messages
  const voiceMessages = convertRealtimeHistoryToUIMessages(history);

  return {
    status,
    connect,
    disconnect,
    sendText,
    voiceMessages,
    error,
  };
}
