import { GoogleGenAI, FunctionCallingConfigMode } from "@google/genai/web";
import type { Chat, ThinkingConfig, Tool } from "@google/genai/web";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { GeminiMessage } from "../types/messages.js";

// Configuration for GeminiClient
export interface GeminiClientConfig {
  mcpUrl?: string;
  model?: string;
  temperature?: number;
  systemInstruction?: string;
  thinkingConfig?: ThinkingConfig;
  chatHistory?: GeminiMessage[];
  enabledTools?: Record<string, boolean>;
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
  chat: Chat | null;
  mcpClient: Client | null;
  chatHistory: GeminiMessage[];
  chatConfig: Record<string, unknown> | null;

  /**
   * @param apiKey - Gemini API key
   * @param config - Configuration options
   */
  constructor(apiKey: string, config: GeminiClientConfig = {}) {
    this.ai = new GoogleGenAI({ apiKey });
    this.mcpUrl = config.mcpUrl ?? "http://localhost:3350/mcp";
    this.config = config;
    this.chat = null;
    this.mcpClient = null;
    this.chatHistory = config.chatHistory ?? [];
    this.chatConfig = null;
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

    // List and filter MCP tools
    const toolsResult = await this.mcpClient.listTools();
    const enabledTools = this.config.enabledTools;
    const filteredTools = enabledTools
      ? toolsResult.tools.filter((tool) => enabledTools[tool.name] !== false)
      : toolsResult.tools;

    // Convert MCP tools to Gemini format
    const tools: Tool[] =
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

    // Get enabled tool names for validation
    const enabledToolNames =
      filteredTools.length > 0
        ? filteredTools.map((tool) => tool.name)
        : undefined;

    // Create chat with filtered MCP tools
    this.chatConfig = {
      ...(tools.length > 0 ? { tools } : {}),
      ...(enabledToolNames && enabledToolNames.length > 0
        ? {
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.VALIDATED,
                allowedFunctionNames: enabledToolNames,
              },
            },
          }
        : {}),
      ...this.config,
    };

    this.chat = this.ai.chats.create({
      model: this.config.model ?? "gemini-2.5-flash-lite",
      config: this.chatConfig,
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
   * With manual tool execution, the method will automatically execute tool calls
   * and continue the conversation until the model stops requesting tools.
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
    abortSignal?: AbortSignal,
  ): AsyncGenerator<GeminiMessage[], void, unknown> {
    if (!this.chat || !this.mcpClient) {
      throw new Error("Chat not initialized. Call initialize() first.");
    }

    // Add initial user message
    const userMessage: GeminiMessage = {
      role: "user",
      parts: [{ text: message }],
    };
    this.chatHistory.push(userMessage);
    yield this.chatHistory;

    // Manual tool calling loop
    let continueLoop = true;
    const maxIterations = 10;
    let iteration = 0;
    let isFirstMessage = true;

    while (continueLoop && iteration < maxIterations) {
      iteration++;

      // Send either the initial message or continue with empty message.
      // On continuation (after tool execution), the chat object has been recreated
      // with full history including function responses, so an empty message
      // prompts Gemini to continue the conversation based on that history.
      const stream = await this.chat.sendMessageStream({
        message: isFirstMessage ? message : "",
      });
      isFirstMessage = false;

      let currentTurn: GeminiMessage | null = null;

      for await (const chunk of stream) {
        // console.log("chunk:", JSON.stringify(chunk, null, 2));
        const response = chunk.candidates?.[0] ?? {};
        if (!response.content) continue;
        const { role, parts = [] } = response.content;

        for (const part of parts) {
          if (!currentTurn || currentTurn.role !== role) {
            currentTurn = { role, parts: [] };
            this.chatHistory.push(currentTurn);
          }

          // Ensure parts array exists (SDK type allows it to be optional)
          currentTurn.parts ??= [];

          // Merge text chunks: if current part is text and last part is also text with same thought flag,
          // append to existing text instead of creating a new part
          const lastPart = currentTurn.parts.at(-1);
          if (
            // if consecutive parts are text, we potentially can concatenate
            part.text &&
            lastPart?.text &&
            // if we switch between thoughts and normal text, don't concatenate:
            Boolean(part.thought) === Boolean(lastPart.thought) &&
            // if anything has a thoughtSignature, don't concatenate (https://ai.google.dev/gemini-api/docs/thinking#signatures):
            !lastPart.thoughtSignature &&
            !part.thoughtSignature
          ) {
            lastPart.text += part.text;
          } else {
            currentTurn.parts.push(part);
          }

          yield this.chatHistory;
        }
      }

      // Check for function calls in the last model message
      const lastMessage = this.chatHistory.at(-1);
      const hasFunctionCalls =
        lastMessage?.role === "model" &&
        lastMessage.parts?.some((part) => part.functionCall);

      if (hasFunctionCalls) {
        // Execute all function calls
        const functionResponseParts = [];

        for (const part of lastMessage.parts ?? []) {
          if (!part.functionCall) continue;

          try {
            const result = await this.mcpClient.callTool({
              name: part.functionCall.name ?? "",
              arguments: part.functionCall.args ?? {},
            });

            functionResponseParts.push({
              functionResponse: {
                name: part.functionCall.name,
                response: result.isError ? { error: result } : result,
              },
            });
          } catch (error) {
            functionResponseParts.push({
              functionResponse: {
                name: part.functionCall.name,
                response: {
                  error: error instanceof Error ? error.message : String(error),
                  isError: true,
                },
              },
            });
          }
        }

        // Add function responses as user turn
        const functionResponseMessage: GeminiMessage = {
          role: "user",
          parts: functionResponseParts,
        };
        this.chatHistory.push(functionResponseMessage);
        yield this.chatHistory;

        // Recreate chat with updated history to continue the conversation
        if (this.chatConfig) {
          this.chat = this.ai.chats.create({
            model: this.config.model ?? "gemini-2.5-flash-lite",
            config: this.chatConfig,
            history: this.chatHistory,
          });
        }

        // Continue loop to get model's response to tool results
        // Check for abort signal
        if (abortSignal?.aborted) {
          continueLoop = false;
        }
      } else {
        continueLoop = false;
      }
    }

    if (iteration >= maxIterations) {
      console.warn(
        "Gemini tool calling loop reached max iterations:",
        maxIterations,
      );
    }
  }
}
