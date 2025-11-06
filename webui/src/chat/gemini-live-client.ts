/**
 * Gemini Live API WebSocket Client
 * Enables real-time bidirectional voice communication with Gemini
 *
 * Based on: https://ai.google.dev/api/live
 */

import { int16ArrayToBase64 } from "../utils/audio-utils.js";

/**
 * Message types for Live API WebSocket protocol
 */
interface LiveAPISetupMessage {
  setup: {
    model: string;
    generation_config?: {
      temperature?: number;
      response_modalities?: string[];
    };
  };
}

interface LiveAPIClientContentMessage {
  client_content: {
    turns: Array<{
      role: string;
      parts: Array<{
        text?: string;
        inline_data?: {
          mime_type: string;
          data: string;
        };
      }>;
    }>;
    turn_complete: boolean;
  };
}

interface LiveAPIServerContentMessage {
  server_content: {
    model_turn?: {
      parts: Array<{
        text?: string;
        inline_data?: {
          mime_type: string;
          data: string;
        };
      }>;
    };
    turn_complete?: boolean;
  };
}

interface LiveAPIToolCallMessage {
  tool_call: {
    function_calls: Array<{
      name: string;
      args: Record<string, unknown>;
      id: string;
    }>;
  };
}

interface LiveAPIToolResponseMessage {
  tool_response: {
    function_responses: Array<{
      response: Record<string, unknown>;
      id: string;
    }>;
  };
}

type LiveAPIMessage =
  | LiveAPISetupMessage
  | LiveAPIClientContentMessage
  | LiveAPIServerContentMessage
  | LiveAPIToolCallMessage
  | LiveAPIToolResponseMessage;

export interface GeminiLiveClientConfig {
  model?: string;
  temperature?: number;
  onTextResponse?: (text: string) => void;
  onAudioResponse?: (audioData: string) => void;
  onError?: (error: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

/**
 * Client for Gemini Live API (WebSocket-based bidirectional streaming)
 */
export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private config: GeminiLiveClientConfig;
  private isConnected = false;
  private currentTranscript = "";

  constructor(apiKey: string, config: GeminiLiveClientConfig = {}) {
    this.apiKey = apiKey;
    this.config = {
      model: config.model ?? "models/gemini-2.0-flash-exp",
      temperature: config.temperature ?? 1.0,
      ...config,
    };
  }

  /**
   * Connect to Gemini Live API via WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("Gemini Live API connected");
        this.isConnected = true;

        // Send setup message
        const setupMessage: LiveAPISetupMessage = {
          setup: {
            model: this.config.model ?? "models/gemini-2.0-flash-exp",
            generation_config: {
              temperature: this.config.temperature,
              response_modalities: ["TEXT"], // Start with text-only for simplicity
            },
          },
        };

        this.send(setupMessage);
        this.config.onConnected?.();
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as LiveAPIMessage;
          this.handleMessage(message);
        } catch (error) {
          console.error("Failed to parse Live API message:", error);
        }
      };

      this.ws.onerror = (event) => {
        console.error("WebSocket error:", event);
        const errorMsg = "WebSocket connection error";
        this.config.onError?.(errorMsg);
        reject(new Error(errorMsg));
      };

      this.ws.onclose = () => {
        console.log("Gemini Live API disconnected");
        this.isConnected = false;
        this.config.onDisconnected?.();
      };
    });
  }

  /**
   * Send a message to the Live API
   */
  private send(message: LiveAPIMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not open, cannot send message");
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Handle incoming messages from Live API
   */
  private handleMessage(message: LiveAPIMessage): void {
    if ("server_content" in message) {
      const content = message.server_content;

      if (content.model_turn?.parts) {
        for (const part of content.model_turn.parts) {
          if (part.text) {
            this.currentTranscript += part.text;
            this.config.onTextResponse?.(part.text);
          }
          if (part.inline_data?.mime_type.startsWith("audio/")) {
            this.config.onAudioResponse?.(part.inline_data.data);
          }
        }
      }

      if (content.turn_complete) {
        // Reset transcript for next turn
        this.currentTranscript = "";
      }
    } else if ("tool_call" in message) {
      console.log("Tool call received:", message.tool_call);
      // TODO: Handle tool calls if needed
    }
  }

  /**
   * Send audio data to Live API
   * @param audioData 16-bit PCM audio data (Int16Array)
   */
  sendAudio(audioData: Int16Array): void {
    if (!this.isConnected) {
      console.warn("Not connected to Live API");
      return;
    }

    const base64Audio = int16ArrayToBase64(audioData);

    const message: LiveAPIClientContentMessage = {
      client_content: {
        turns: [
          {
            role: "user",
            parts: [
              {
                inline_data: {
                  mime_type: "audio/pcm",
                  data: base64Audio,
                },
              },
            ],
          },
        ],
        turn_complete: false,
      },
    };

    this.send(message);
  }

  /**
   * Send text message to Live API
   */
  sendText(text: string): void {
    if (!this.isConnected) {
      console.warn("Not connected to Live API");
      return;
    }

    const message: LiveAPIClientContentMessage = {
      client_content: {
        turns: [
          {
            role: "user",
            parts: [{ text }],
          },
        ],
        turn_complete: true,
      },
    };

    this.send(message);
  }

  /**
   * Signal end of audio input (turn complete)
   */
  endTurn(): void {
    if (!this.isConnected) {
      return;
    }

    const message: LiveAPIClientContentMessage = {
      client_content: {
        turns: [],
        turn_complete: true,
      },
    };

    this.send(message);
  }

  /**
   * Disconnect from Live API
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  /**
   * Check if connected
   */
  connected(): boolean {
    return this.isConnected;
  }
}
