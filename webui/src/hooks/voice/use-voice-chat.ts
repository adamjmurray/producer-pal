import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  OpenAIRealtimeWebRTC,
  RealtimeSession,
  type RealtimeItem,
} from "@openai/agents/realtime";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { UIMessage } from "#webui/types/messages";
import { createSupervisorTool } from "#webui/voice/supervisor-tool";
import { createVoiceAgent } from "#webui/voice/voice-agent-config";
import { convertRealtimeHistoryToUIMessages } from "#webui/voice/voice-message-converter";

interface SupervisorActivityPart {
  type: "thought" | "tool" | "text";
  content?: string;
  name?: string;
  args?: Record<string, unknown>;
  result?: string | null;
  isError?: boolean;
}

interface SupervisorActivitiesWithTimestamp {
  activities: SupervisorActivityPart[];
  timestamp: number;
  targetHistoryIndex: number;
}

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
      model: "gpt-realtime",
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
// eslint-disable-next-line max-lines-per-function -- Main hook function allowed to exceed limit
export function useVoiceChat({
  apiKey,
  model,
}: UseVoiceChatProps): UseVoiceChatReturn {
  const [status, setStatus] = useState<VoiceStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RealtimeItem[]>([]);
  const [supervisorActivities, setSupervisorActivities] = useState<
    Map<number, SupervisorActivitiesWithTimestamp>
  >(new Map());
  const [streamingText, setStreamingText] = useState<string>("");

  const sessionRef = useRef<RealtimeSession | null>(null);
  const mcpClientRef = useRef<Client | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const historyRef = useRef<RealtimeItem[]>([]);

  /* istanbul ignore next -- @preserve lifecycle effect for browser audio */
  // Create audio element on mount
  useEffect(() => {
    audioRef.current = document.createElement("audio");
    audioRef.current.autoplay = true;
    return () => {
      audioRef.current = null;
    };
  }, []);

  // Keep historyRef in sync with history state for use in closures
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

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
        model: "gpt-realtime",
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
            return historyRef.current;
          },
          onSupervisorActivity: (activities: SupervisorActivityPart[]) => {
            console.log(
              "[Voice Chat] onSupervisorActivity called with:",
              activities,
            );
            // Store activities with timestamp for proper ordering
            // Use historyRef to get the current history length (avoid stale closure)
            const timestamp = Date.now();
            const currentHistory = historyRef.current;
            // Target the next assistant message that will be added after the supervisor returns
            // The history at this point has: user, assistant initial, function_call
            // The final assistant response will be added next
            const targetIndex = currentHistory.length;
            console.log(
              "[Voice Chat] Storing supervisor activities with timestamp:",
              timestamp,
              "target index:",
              targetIndex,
              "current history length:",
              currentHistory.length,
            );
            setSupervisorActivities((prevActivities) => {
              const next = new Map(prevActivities);
              next.set(targetIndex, {
                activities,
                timestamp,
                targetHistoryIndex: targetIndex,
              });
              return next;
            });
            // Clear streaming text when activities are finalized (contains thought)
            const hasThought = activities.some((a) => a.type === "thought");
            if (hasThought) {
              setStreamingText("");
            }
          },
          onSupervisorTextDelta: (_delta: string, snapshot: string) => {
            setStreamingText(snapshot);
          },
        },
      });

      // Set up event listeners
      sessionRef.current.on("history_updated", (items: RealtimeItem[]) => {
        console.log("[Voice Chat] history_updated:", items.length, "items");
        setHistory([...items]);
      });

      sessionRef.current.on("history_added", (item: RealtimeItem) => {
        // Access optional properties safely for debug logging
        const itemAny = item as Record<string, unknown>;
        console.log("[Voice Chat] history_added:", {
          type: item.type,
          role: itemAny.role,
        });

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
  }, [apiKey, model]);

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
    setSupervisorActivities(new Map());
    setStreamingText("");
  }, []);

  /* istanbul ignore next -- @preserve requires live session */
  const sendText = useCallback((text: string) => {
    if (!sessionRef.current) return;
    sessionRef.current.sendMessage(text);
  }, []);

  // Convert realtime history to UI messages
  const voiceMessages = convertRealtimeHistoryToUIMessages(
    history,
    supervisorActivities,
    streamingText,
  );

  return {
    status,
    connect,
    disconnect,
    sendText,
    voiceMessages,
    error,
  };
}
