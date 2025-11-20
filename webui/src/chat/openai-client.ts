import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import OpenAI from "openai";
import type { OpenAIMessage, OpenAIToolCall } from "../types/messages.js";

const MCP_NOT_INITIALIZED_ERROR =
  "MCP client not initialized. Call initialize() first.";

/**
 * Reasoning detail structure from OpenRouter/OpenAI streaming responses.
 */
export interface ReasoningDetail {
  type: string;
  text?: string;
  index?: number;
}

/**
 * Extended OpenAI assistant message type that includes reasoning fields.
 * These fields are not in the official types yet but are supported by OpenRouter and OpenAI o-series models.
 */
export interface OpenAIAssistantMessageWithReasoning {
  role: "assistant";
  content: string;
  tool_calls?: OpenAIToolCall[];
  reasoning_details?: ReasoningDetail[];
}

/**
 * Processes a streaming delta chunk to extract reasoning content.
 * Handles both OpenAI's reasoning_content field and OpenRouter's reasoning_details array.
 *
 * @param {OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta} delta - The delta object from a streaming chunk
 * @returns {string} - The reasoning text from this delta, or empty string if none
 */
export function extractReasoningFromDelta(
  delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta,
): string {
  // @ts-expect-error - reasoning fields not in official types yet
  if (delta.reasoning_content) {
    // @ts-expect-error - reasoning fields not in official types yet
    return delta.reasoning_content;
  }

  // @ts-expect-error - reasoning fields not in official types yet
  if (delta.reasoning_details) {
    let text = "";
    // Extract text from reasoning_details array (standard OpenRouter format)
    // @ts-expect-error - reasoning fields not in official types yet
    for (const detail of delta.reasoning_details) {
      if (detail.type === "reasoning.text" && detail.text) {
        text += detail.text;
      }
    }
    return text;
  }

  return "";
}

// Configuration for OpenAIClient
export interface OpenAIClientConfig {
  mcpUrl?: string;
  model: string;
  temperature?: number;
  systemInstruction?: string;
  reasoningEffort?: "low" | "medium" | "high"; // For o1/o3 models
  chatHistory?: OpenAIMessage[];
  baseUrl?: string; // For OpenAI-compatible providers
  enabledTools?: Record<string, boolean>;
}

/**
 * Client for interacting with OpenAI-compatible APIs with MCP (Model Context Protocol) tool support.
 *
 * Returns chat history in OpenAI's raw API format:
 * - `{ role: "system", content: string }` - system prompt (internal)
 * - `{ role: "user", content: string }` - user messages
 * - `{ role: "assistant", content: string, tool_calls?: [...], reasoning_details?: [...] }` - assistant responses
 * - `{ role: "tool", tool_call_id: string, content: string }` - tool results
 *
 * The `reasoning_details` field contains thinking/reasoning content from models that support it
 * (OpenAI o-series, OpenRouter reasoning models). This is kept separate from regular content
 * to maintain proper API contract and enable the UI to display it as collapsible thoughts.
 *
 * Example raw history:
 * ```js
 * [
 *   { role: "system", content: "System prompt" },
 *   { role: "user", content: "Hello" },
 *   { role: "assistant", content: "Hi there!", reasoning_details: [{ type: "reasoning.text", text: "Thinking...", index: 0 }] },
 *   { role: "assistant", content: "", tool_calls: [{ id: "call_123", function: { name: "search", arguments: '{"query":"foo"}' } }] },
 *   { role: "tool", tool_call_id: "call_123", content: '{"text":"result"}' },
 *   { role: "assistant", content: "Based on the search..." }
 * ]
 * ```
 *
 * For UI-friendly format, use formatOpenAIMessages() from openai-formatter.js
 */
export class OpenAIClient {
  ai: OpenAI;
  mcpUrl: string;
  config: OpenAIClientConfig;
  mcpClient: Client | null;
  chatHistory: OpenAIMessage[];

  /**
   * @param {string} apiKey - OpenAI API key (or compatible provider key)
   * @param {OpenAIClientConfig} config - Configuration options
   */
  constructor(apiKey: string, config: OpenAIClientConfig) {
    // Suppress x-stainless headers for non-OpenAI providers (e.g., Mistral)
    // These headers cause CORS issues with some OpenAI-compatible APIs
    const isNonOpenAI =
      config.baseUrl && config.baseUrl !== "https://api.openai.com/v1";

    this.ai = new OpenAI({
      apiKey,
      baseURL: config.baseUrl ?? "https://api.openai.com/v1",
      dangerouslyAllowBrowser: true,
      ...(isNonOpenAI && {
        defaultHeaders: {
          "X-Stainless-Lang": null,
          "X-Stainless-Package-Version": null,
          "X-Stainless-OS": null,
          "X-Stainless-Arch": null,
          "X-Stainless-Runtime": null,
          "X-Stainless-Runtime-Version": null,
          "X-Stainless-Retry-Count": null,
          "X-Stainless-Timeout": null,
        },
      }),
    });
    this.mcpUrl = config.mcpUrl ?? "http://localhost:3350/mcp";
    this.config = config;
    this.mcpClient = null;
    this.chatHistory = config.chatHistory ?? [];

    // Add system message if provided and not in history
    if (
      config.systemInstruction &&
      this.chatHistory.length === 0 &&
      !this.chatHistory.find((msg) => msg.role === "system")
    ) {
      this.chatHistory.push({
        role: "system",
        content: config.systemInstruction,
      });
    }
  }

  /**
   * Tests connection to the MCP server without creating a client instance.
   * @param {string} [mcpUrl="http://localhost:3350/mcp"] - MCP server URL to test
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
   * Initializes the MCP connection.
   * Must be called before sending messages.
   * @throws If MCP connection fails
   */
  async initialize(): Promise<void> {
    const transport = new StreamableHTTPClientTransport(new URL(this.mcpUrl));
    this.mcpClient = new Client({
      name: "producer-pal-chat-ui",
      version: "1.0.0",
    });
    await this.mcpClient.connect(transport);
  }

  /**
   * Sends a message to OpenAI and streams back the chat history as it updates.
   *
   * This async generator yields the full chat history after each update, allowing
   * consumers to track the conversation state in real-time. The history includes
   * the user's message, model responses, tool calls, and tool results.
   *
   * Unlike Gemini, OpenAI requires manual tool calling loop:
   * 1. Stream assistant response
   * 2. If tool_calls present, execute each via MCP
   * 3. Add tool result messages
   * 4. Continue streaming with updated history
   * 5. Repeat until no tool_calls
   *
   * @param {string} message - User message to send
   * @param {AbortSignal} [abortSignal] - Optional abort signal
   * @yields Complete chat history in OpenAI's raw format after each update
   * @throws If MCP client is not initialized or if message sending fails
   *
   * @example
   * const stream = client.sendMessage("Hello");
   * for await (const history of stream) {
   *   console.log("Current history:", history);
   * }
   */
  async *sendMessage(
    message: string,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<OpenAIMessage[], void, unknown> {
    if (!this.mcpClient) {
      throw new Error(MCP_NOT_INITIALIZED_ERROR);
    }

    // Add user message
    const userMessage: OpenAIMessage = { role: "user", content: message };
    this.chatHistory.push(userMessage);
    yield this.chatHistory;

    // Get filtered tools
    const tools = await this.getFilteredTools();

    // Manual tool calling loop
    let continueLoop = true;
    const maxIterations = 10; // Prevent infinite loops
    let iteration = 0;

    while (continueLoop && iteration < maxIterations) {
      iteration++;

      // Process the stream and update history with assistant response
      yield* this.processStreamAndUpdateHistory(tools);

      // Handle any tool calls from the assistant's response
      const toolCalls = this.getToolCallsFromLastMessage();
      if (toolCalls) {
        yield* this.executeToolCalls(toolCalls);
        if (abortSignal?.aborted) {
          continueLoop = false;
        }
      } else {
        continueLoop = false;
      }
    }

    if (iteration >= maxIterations) {
      console.warn(
        "OpenAI tool calling loop reached max iterations:",
        maxIterations,
      );
    }
  }

  /**
   * Retrieves and filters MCP tools based on enabled settings.
   * @returns {Promise<OpenAI.Chat.ChatCompletionTool[]>} - Filtered tools
   */
  private async getFilteredTools(): Promise<OpenAI.Chat.ChatCompletionTool[]> {
    const toolsResult = await this.mcpClient?.listTools();
    if (!toolsResult) {
      throw new Error(MCP_NOT_INITIALIZED_ERROR);
    }
    const enabledTools = this.config.enabledTools;
    const filteredTools = enabledTools
      ? toolsResult.tools.filter((tool) => enabledTools[tool.name] !== false)
      : toolsResult.tools;

    return filteredTools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema as Record<string, unknown>,
      },
    }));
  }

  /**
   * Processes the OpenAI stream and updates chat history with each chunk.
   * @param {OpenAI.Chat.ChatCompletionTool[]} tools - Array of available tools
   * @returns {AsyncGenerator} - Generator yielding chat history updates
   */
  private async *processStreamAndUpdateHistory(
    tools: OpenAI.Chat.ChatCompletionTool[],
  ): AsyncGenerator<OpenAIMessage[]> {
    const stream = await this.ai.chat.completions.create({
      model: this.config.model,
      messages: this.chatHistory,
      tools: tools.length > 0 ? tools : undefined,
      temperature: this.config.temperature,
      reasoning_effort: this.config.reasoningEffort,
      stream: true,
    });

    // Accumulate streaming response
    const currentMessage: OpenAIAssistantMessageWithReasoning = {
      role: "assistant",
      content: "",
    };
    const toolCallsMap = new Map<number, OpenAIToolCall>();
    let reasoningText = ""; // Accumulate reasoning separately

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Process delta chunks
      this.processContentDelta(delta, currentMessage);
      reasoningText = this.processReasoningDelta(delta, reasoningText);
      this.processToolCallDeltas(delta, toolCallsMap);

      // Build and update message
      const messageToAdd = this.buildStreamMessage(
        currentMessage,
        toolCallsMap,
        reasoningText,
      );
      this.updateChatHistoryWithMessage(messageToAdd);

      yield this.chatHistory;
    }
  }

  /**
   * Processes content delta from a stream chunk.
   * @param {OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta} delta - Delta object from stream chunk
   * @param {OpenAIAssistantMessageWithReasoning} currentMessage - Current message being built
   */
  private processContentDelta(
    delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta,
    currentMessage: OpenAIAssistantMessageWithReasoning,
  ): void {
    if (delta.content) {
      currentMessage.content =
        (typeof currentMessage.content === "string"
          ? currentMessage.content
          : "") + delta.content;
    }
  }

  /**
   * Processes reasoning delta from a stream chunk and returns updated reasoning text.
   * @param {OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta} delta - Delta object from stream chunk
   * @param {string} reasoningText - Accumulated reasoning text so far
   * @returns {string} - Updated reasoning text
   */
  private processReasoningDelta(
    delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta,
    reasoningText: string,
  ): string {
    const reasoning = extractReasoningFromDelta(delta);
    return reasoning ? reasoningText + reasoning : reasoningText;
  }

  /**
   * Processes tool call deltas from a stream chunk.
   * @param {OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta} delta - Delta object from stream chunk
   * @param {Map<number, OpenAIToolCall>} toolCallsMap - Map of tool calls being accumulated
   */
  private processToolCallDeltas(
    delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta,
    toolCallsMap: Map<number, OpenAIToolCall>,
  ): void {
    if (!delta.tool_calls) return;

    for (const tcDelta of delta.tool_calls) {
      this.accumulateToolCall(tcDelta, toolCallsMap);
    }
  }

  /**
   * Accumulates a single tool call delta into the tool calls map.
   * @param {OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall} tcDelta - Tool call delta from stream
   * @param {Map<number, OpenAIToolCall>} toolCallsMap - Map of tool calls being accumulated
   */
  private accumulateToolCall(
    tcDelta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall,
    toolCallsMap: Map<number, OpenAIToolCall>,
  ): void {
    if (!toolCallsMap.has(tcDelta.index)) {
      toolCallsMap.set(tcDelta.index, {
        id: tcDelta.id ?? "",
        type: "function",
        function: { name: "", arguments: "" },
      });
    }

    const tc = toolCallsMap.get(tcDelta.index);
    if (tc?.type !== "function") return;

    if (tcDelta.id) tc.id = tcDelta.id;
    if (tcDelta.function?.name) tc.function.name = tcDelta.function.name;
    if (tcDelta.function?.arguments)
      tc.function.arguments += tcDelta.function.arguments;
  }

  /**
   * Builds the assistant message with tool calls and reasoning details.
   * @param {OpenAIAssistantMessageWithReasoning} currentMessage - Current message being built
   * @param {Map<number, OpenAIToolCall>} toolCallsMap - Map of accumulated tool calls
   * @param {string} reasoningText - Accumulated reasoning text
   * @returns {object} - Complete assistant message with all parts
   */
  private buildStreamMessage(
    currentMessage: OpenAIAssistantMessageWithReasoning,
    toolCallsMap: Map<number, OpenAIToolCall>,
    reasoningText: string,
  ): OpenAIAssistantMessageWithReasoning {
    const messageToAdd: OpenAIAssistantMessageWithReasoning = {
      ...currentMessage,
      tool_calls:
        toolCallsMap.size > 0 ? Array.from(toolCallsMap.values()) : undefined,
    };

    if (reasoningText) {
      messageToAdd.reasoning_details = [
        {
          type: "reasoning.text",
          text: reasoningText,
          index: 0,
        },
      ];
    }

    return messageToAdd;
  }

  /**
   * Updates chat history with a new assistant message.
   * @param {OpenAIAssistantMessageWithReasoning} message - Assistant message to add to history
   */
  private updateChatHistoryWithMessage(
    message: OpenAIAssistantMessageWithReasoning,
  ): void {
    const lastMsg = this.chatHistory.at(-1);
    if (lastMsg?.role === "assistant") {
      this.chatHistory[this.chatHistory.length - 1] =
        message as unknown as OpenAIMessage;
    } else {
      this.chatHistory.push(message as unknown as OpenAIMessage);
    }
  }

  /**
   * Extracts tool calls from the last message in chat history.
   * @returns {OpenAIToolCall[] | null} - Tool calls or null
   */
  private getToolCallsFromLastMessage(): OpenAIToolCall[] | null {
    const finalMessage = this.chatHistory.at(-1);
    return finalMessage?.role === "assistant" && finalMessage.tool_calls
      ? finalMessage.tool_calls
      : null;
  }

  /**
   * Executes all provided tool calls via MCP.
   * @param {OpenAIToolCall[]} toolCalls - Array of tool calls to execute
   * @returns {AsyncGenerator} - Generator yielding chat history updates
   */
  private async *executeToolCalls(
    toolCalls: OpenAIToolCall[],
  ): AsyncGenerator<OpenAIMessage[]> {
    for (const toolCall of toolCalls) {
      if (toolCall.type !== "function") continue;

      try {
        const result = await this.executeSingleToolCall(toolCall);
        const toolMessage: OpenAIMessage = {
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        };
        this.chatHistory.push(toolMessage);
        yield this.chatHistory;
      } catch (error) {
        this.addErrorToolMessage(toolCall, error);
        yield this.chatHistory;
      }
    }
  }

  /**
   * Executes a single tool call and returns the result.
   * @param {OpenAIToolCall} toolCall - Tool call to execute
   * @returns {object} - Tool call result
   */
  private async executeSingleToolCall(
    toolCall: OpenAIToolCall,
  ): Promise<unknown> {
    // Type guard: ensure this is a function tool call
    if (toolCall.type !== "function") {
      throw new Error("Invalid tool call type");
    }

    const args = JSON.parse(toolCall.function.arguments);
    const result = await this.mcpClient?.callTool({
      name: toolCall.function.name,
      arguments: args,
    });
    if (!result) {
      throw new Error(MCP_NOT_INITIALIZED_ERROR);
    }
    return result.content;
  }

  /**
   * Adds an error tool message to the chat history.
   * @param {OpenAIToolCall} toolCall - Tool call that failed
   * @param {unknown} error - Error that occurred
   */
  private addErrorToolMessage(toolCall: OpenAIToolCall, error: unknown): void {
    const toolMessage: OpenAIMessage = {
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        isError: true,
      }),
    };
    this.chatHistory.push(toolMessage);
  }
}
