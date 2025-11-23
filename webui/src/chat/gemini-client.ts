import { GoogleGenAI, FunctionCallingConfigMode } from "@google/genai/web";
import type { Chat, ThinkingConfig, Tool, Part } from "@google/genai/web";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { GeminiMessage } from "@/types/messages";

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
  hadFunctionCallsInLastTurn: boolean;

  /**
   * @param {string} apiKey - Gemini API key
   * @param {GeminiClientConfig} config - Configuration options
   */
  constructor(apiKey: string, config: GeminiClientConfig = {}) {
    this.ai = new GoogleGenAI({ apiKey });
    this.mcpUrl = config.mcpUrl ?? "http://localhost:3350/mcp";
    this.config = config;
    this.chat = null;
    this.mcpClient = null;
    this.chatHistory = config.chatHistory ?? [];
    this.chatConfig = null;
    this.hadFunctionCallsInLastTurn = false;
  }

  /**
   * Tests connection to the MCP server without creating a client instance.
   * @param {string} mcpUrl - MCP server URL to test
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
   * @param {string} message - User message to send
   * @param {AbortSignal} [abortSignal] - Optional abort signal
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
    this.validateInitialized();

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

      // Process message turn and yield updates
      yield* this.processMessageTurn(message, isFirstMessage);

      continueLoop = await this.shouldContinueLoop(abortSignal);
      isFirstMessage = false;
    }

    this.warnIfMaxIterationsReached(iteration, maxIterations);
  }

  /**
   * Validates that the chat and MCP client are initialized
   * @throws If not initialized
   */
  private validateInitialized(): void {
    if (!this.chat || !this.mcpClient) {
      throw new Error("Chat not initialized. Call initialize() first.");
    }
  }

  /**
   * Processes a single turn: sends message, processes response, and executes tools
   * Yields history updates as they occur
   * @param {string} message - User message to send
   * @param {boolean} isFirstMessage - Whether this is the first message in the turn
   * @returns {AsyncGenerator} - Generator yielding chat history updates
   */
  private async *processMessageTurn(
    message: string,
    isFirstMessage: boolean,
  ): AsyncGenerator<GeminiMessage[], void, unknown> {
    // Send message and stream response
    if (!this.chat) return;

    const stream = await this.chat.sendMessageStream({
      message: isFirstMessage ? message : "",
    });

    // Process stream chunks and yield updates
    yield* this.processStreamChunks(stream);

    // Execute tool calls if present
    yield* this.executePendingToolCalls();
  }

  /**
   * Processes incoming stream chunks from the model response
   * @param {AsyncIterable<unknown>} stream - Stream of response chunks from the model
   * @returns {AsyncGenerator} - Generator yielding chat history updates
   */
  private async *processStreamChunks(
    stream: AsyncIterable<unknown>,
  ): AsyncGenerator<GeminiMessage[], void, unknown> {
    let currentTurn: GeminiMessage | null = null;

    for await (const chunk of stream) {
      const chunkAny = chunk as {
        candidates?: { content?: { role?: string; parts?: Part[] } }[];
      };
      const response = chunkAny.candidates?.[0];
      if (!response?.content) continue;
      const content = response.content;
      const role = content.role;
      const parts = content.parts ?? [];

      if (!role) continue;

      for (const part of parts) {
        // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
        if (!currentTurn || currentTurn.role !== role) {
          currentTurn = { role, parts: [] } as GeminiMessage;
          this.chatHistory.push(currentTurn);
        }

        // Ensure parts array exists (SDK type allows it to be optional)
        currentTurn.parts ??= [];

        // Handle text merging or add new part
        this.addOrMergePartToTurn(currentTurn, part);

        yield this.chatHistory;
      }
    }
  }

  /**
   * Executes pending tool calls from the last message
   */
  private async *executePendingToolCalls(): AsyncGenerator<
    GeminiMessage[],
    void,
    unknown
  > {
    const lastMessage = this.chatHistory.at(-1);

    const hasFunctionCalls = this.hasUnexecutedFunctionCalls(lastMessage);
    this.hadFunctionCallsInLastTurn = hasFunctionCalls;

    if (!hasFunctionCalls) {
      return;
    }

    // Execute tool calls
    const functionResponseParts = await this.executeToolCalls(lastMessage);

    // Add function responses
    const functionResponseMessage: GeminiMessage = {
      role: "user",
      parts: functionResponseParts as Part[],
    };
    this.chatHistory.push(functionResponseMessage);
    yield this.chatHistory;

    // Recreate chat with updated history
    this.recreateChatWithHistory();
  }

  /**
   * Determines if the loop should continue
   * @param {AbortSignal} [abortSignal] - Optional abort signal to check
   * @returns {boolean} - Whether the loop should continue
   */
  private async shouldContinueLoop(
    abortSignal?: AbortSignal,
  ): Promise<boolean> {
    if (abortSignal?.aborted) {
      return false;
    }
    // Continue the loop if the last turn had tool calls
    // (chat has been recreated with tool responses included)
    return this.hadFunctionCallsInLastTurn;
  }

  /**
   * Warns if max iterations reached
   * @param {number} iteration - Current iteration count
   * @param {number} maxIterations - Maximum allowed iterations
   */
  private warnIfMaxIterationsReached(
    iteration: number,
    maxIterations: number,
  ): void {
    if (iteration >= maxIterations) {
      console.warn(
        "Gemini tool calling loop reached max iterations:",
        maxIterations,
      );
    }
  }

  /**
   * Adds a part to the current turn, merging text if possible
   * @param {GeminiMessage} currentTurn - Current message turn being built
   * @param {Part} part - Part to add to the turn
   */
  private addOrMergePartToTurn(currentTurn: GeminiMessage, part: Part): void {
    const lastPart = currentTurn.parts?.at(-1);
    const partAny = part as {
      text?: string;
      thought?: boolean;
      thoughtSignature?: unknown;
    };

    if (this.shouldMergeWithLastPart(partAny, lastPart)) {
      const lastPartAny = lastPart as { text?: string };
      if (lastPartAny.text && partAny.text) {
        lastPartAny.text += partAny.text;
      }
    } else {
      currentTurn.parts?.push(part);
    }
  }

  /**
   * Determines if a text part should be merged with the last part
   * @param {object} part - Part being evaluated for merging
   * @param {string} [part.text] - Text content of the part
   * @param {boolean} [part.thought] - Whether this is a thought part
   * @param {unknown} [part.thoughtSignature] - Thought signature if present
   * @param {unknown} lastPart - Last part in the current turn
   * @returns {boolean} - Whether the part should be merged with the last part
   */
  private shouldMergeWithLastPart(
    part: { text?: string; thought?: boolean; thoughtSignature?: unknown },
    lastPart: unknown | undefined,
  ): boolean {
    const lastPartAny = lastPart as
      | {
          text?: string;
          thought?: boolean;
          thoughtSignature?: unknown;
        }
      | undefined;

    return (
      // if consecutive parts are text, we potentially can concatenate
      Boolean(part.text) &&
      Boolean(lastPartAny?.text) &&
      // if we switch between thoughts and normal text, don't concatenate:
      Boolean(part.thought) === Boolean(lastPartAny?.thought) &&
      // if anything has a thoughtSignature, don't concatenate:
      !lastPartAny?.thoughtSignature &&
      !part.thoughtSignature
    );
  }

  /**
   * Checks if the last message contains unexecuted function calls
   * @param {GeminiMessage} [lastMessage] - Last message in chat history
   * @returns {boolean} - Whether the message contains unexecuted function calls
   */
  private hasUnexecutedFunctionCalls(
    lastMessage: GeminiMessage | undefined,
  ): boolean {
    return (
      lastMessage?.role === "model" &&
      Boolean(lastMessage.parts?.some((part) => this.isToolCall(part)))
    );
  }

  /**
   * Checks if a part is a tool call
   * @param {unknown} part - Part to check
   * @returns {boolean} - Whether the part is a tool call
   */
  private isToolCall(part: unknown): boolean {
    const partAny = part as { functionCall?: unknown };
    return Boolean(partAny.functionCall);
  }

  /**
   * Executes all tool calls in the message
   * @param {GeminiMessage} [lastMessage] - Last message containing tool calls
   * @returns {Array} - Array of function response parts
   */
  private async executeToolCalls(
    lastMessage: GeminiMessage | undefined,
  ): Promise<unknown[]> {
    const functionResponseParts: unknown[] = [];

    for (const part of lastMessage?.parts ?? []) {
      if (!this.isToolCall(part)) continue;

      const toolResponsePart = await this.executeSingleTool(
        part as {
          functionCall?: { name?: string; args?: unknown };
        },
      );
      functionResponseParts.push(toolResponsePart);
    }

    return functionResponseParts;
  }

  /**
   * Executes a single tool call and returns the response part
   * @param {object} part - Part containing the function call
   * @param {object} [part.functionCall] - Function call details
   * @param {string} [part.functionCall.name] - Name of the function to call
   * @param {unknown} [part.functionCall.args] - Arguments for the function call
   * @returns {object} - Function response part
   */
  private async executeSingleTool(part: {
    functionCall?: { name?: string; args?: unknown };
  }): Promise<unknown> {
    const functionCall = part.functionCall;

    if (!this.mcpClient) {
      return this.buildErrorResponse(
        new Error("MCP client not initialized"),
        functionCall?.name,
      );
    }

    try {
      const result = await this.mcpClient.callTool({
        name: functionCall?.name ?? "",
        arguments: functionCall?.args as Record<string, unknown>,
      });

      return {
        functionResponse: {
          name: functionCall?.name,
          response: this.isErrorResult(result) ? { error: result } : result,
        },
      };
    } catch (error) {
      return this.buildErrorResponse(error, functionCall?.name);
    }
  }

  /**
   * Checks if a tool result is an error
   * @param {unknown} result - Tool result to check
   * @returns {boolean} - Whether the result is an error
   */
  private isErrorResult(result: unknown): boolean {
    const resultAny = result as { isError?: boolean };
    return Boolean(resultAny.isError);
  }

  /**
   * Builds an error response part from a caught error
   * @param {unknown} error - Error that was caught
   * @param {string} [toolName] - Name of the tool that failed
   * @returns {object} - Error response part
   */
  private buildErrorResponse(
    error: unknown,
    toolName: string | undefined,
  ): unknown {
    return {
      functionResponse: {
        name: toolName,
        response: {
          error: error instanceof Error ? error.message : String(error),
          isError: true,
        },
      },
    };
  }

  /**
   * Recreates the chat instance with updated history
   */
  private recreateChatWithHistory(): void {
    if (this.chatConfig) {
      this.chat = this.ai.chats.create({
        model: this.config.model ?? "gemini-2.5-flash-lite",
        config: this.chatConfig,
        history: this.chatHistory,
      });
    }
  }
}
