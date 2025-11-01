import { GoogleGenAI, mcpToTool } from "@google/genai/web";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { GeminiMessage } from "../types/messages.js";

// Configuration for GeminiClient
interface GeminiClientConfig {
  mcpUrl?: string;
  model?: string;
  temperature?: number;
  systemInstruction?: string;
  thinkingConfig?: any;
  chatHistory?: GeminiMessage[];
}

/**
 * Client for interacting with the Gemini API with MCP (Model Context Protocol) tool support.
 *
 * Returns chat history in Gemini's raw API format:
 * - Each turn has a `role` ("user" or "model")
 * - Each turn has `parts` array containing:
 *   - `{ text: string }` - text content
 *   - `{ text: string, thought: true }` - thinking content
 *   - `{ functionCall: { name: string, args: object } }` - tool call request
 *   - `{ functionResponse: { name: string, response: object } }` - tool call result (in separate user turn)
 *
 * Example raw history:
 * ```js
 * [
 *   { role: "user", parts: [{ text: "Hello" }] },
 *   { role: "model", parts: [{ text: "Hi there!" }] },
 *   { role: "model", parts: [{ functionCall: { name: "search", args: { query: "foo" } } }] },
 *   { role: "user", parts: [{ functionResponse: { name: "search", response: { content: [{ text: "result" }] } } }] },
 *   { role: "model", parts: [{ text: "Based on the search..." }] }
 * ]
 * ```
 *
 * For UI-friendly format, use formatGeminiMessages() from gemini-formatter.js
 */
export class GeminiClient {
  ai: GoogleGenAI;
  mcpUrl: string;
  config: GeminiClientConfig;
  chat: any; // Gemini SDK doesn't export a type for this
  mcpClient: Client | null;
  chatHistory: GeminiMessage[];

  /**
   * @param apiKey - Gemini API key
   * @param config - Configuration options
   */
  constructor(apiKey: string, config: GeminiClientConfig = {}) {
    this.ai = new GoogleGenAI({ apiKey });
    this.mcpUrl = config.mcpUrl || "http://localhost:3350/mcp";
    this.config = config;
    this.chat = null;
    this.mcpClient = null;
    this.chatHistory = config.chatHistory || [];
  }

  /**
   * Tests connection to the MCP server without creating a client instance.
   * @param mcpUrl - MCP server URL to test
   * @throws If connection fails
   */
  static async testConnection(
    mcpUrl = "http://localhost:3350/mcp",
  ): Promise<void> {
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
    const client = new Client({
      name: "producer-pal-chat-ui-test",
      version: "1.0.0",
    });
    await client.connect(transport);
    await client.close();
  }

  /**
   * Initializes the MCP connection and creates a Gemini chat session with MCP tools.
   * Must be called before sending messages.
   * @throws If MCP connection or chat creation fails
   */
  async initialize(): Promise<void> {
    // Connect to MCP server
    const transport = new StreamableHTTPClientTransport(new URL(this.mcpUrl));
    this.mcpClient = new Client({
      name: "producer-pal-chat-ui",
      version: "1.0.0",
    });
    await this.mcpClient.connect(transport);

    // Create chat with MCP tools
    const chatConfig = {
      tools: [mcpToTool(this.mcpClient)],
      automaticFunctionCalling: {
        // Gemini will automatically execute MCP tools
      },
      ...this.config,
    };

    this.chat = this.ai.chats.create({
      model: this.config.model || "gemini-2.5-flash-lite",
      config: chatConfig,
      history: this.chatHistory,
    });
  }

  /**
   * Sends a message to Gemini and streams back the chat history as it updates.
   *
   * This async generator yields the full chat history after each update, allowing
   * consumers to track the conversation state in real-time. The history includes
   * the user's message, model responses, tool calls, and tool results.
   *
   * @param message - User message to send
   * @yields Complete chat history in Gemini's raw format after each update
   * @throws If chat is not initialized or if message sending fails
   *
   * @example
   * const stream = client.sendMessage("Hello");
   * for await (const history of stream) {
   *   console.log("Current history:", history);
   *   // History grows as model responds:
   *   // [{ role: "user", parts: [{ text: "Hello" }] }]
   *   // [{ role: "user", ... }, { role: "model", parts: [{ text: "Hi" }] }]
   * }
   */
  async *sendMessage(
    message: string,
  ): AsyncGenerator<GeminiMessage[], void, unknown> {
    if (!this.chat) {
      throw new Error("Chat not initialized. Call initialize() first.");
    }

    let currentTurn: GeminiMessage = {
      role: "user",
      parts: [{ text: message }],
    };

    this.chatHistory.push(currentTurn);

    yield this.chatHistory;

    const stream = await this.chat.sendMessageStream({ message });

    for await (const chunk of stream) {
      // console.log("chunk:", JSON.stringify(chunk, null, 2));
      const response = chunk.candidates?.[0] ?? {};
      const { role, parts = [] } = response.content;

      for (const part of parts) {
        if (currentTurn?.role !== role) {
          currentTurn = { role, parts: [] };
          this.chatHistory.push(currentTurn);
        }

        // Merge text chunks: if current part is text and last part is also text with same thought flag,
        // append to existing text instead of creating a new part
        const lastPart = currentTurn.parts.at(-1);
        if (
          // if consecutive parts are text, we potentially can concatenate
          part.text &&
          lastPart?.text &&
          // if we switch between thoughts and normal text, don't concatenate:
          !!(part as any).thought === !!(lastPart as any).thought &&
          // if anything has a thoughtSignature, don't concatenate (https://ai.google.dev/gemini-api/docs/thinking#signatures):
          !(lastPart as any).thoughtSignature &&
          !(part as any).thoughtSignature
        ) {
          lastPart.text += part.text;
        } else {
          currentTurn.parts.push(part);
        }

        yield this.chatHistory;
      }
    }
  }
}
