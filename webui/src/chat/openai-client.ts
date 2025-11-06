import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import OpenAI from "openai";
import type { OpenAIMessage, OpenAIToolCall } from "../types/messages.js";

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
 * @param delta - The delta object from a streaming chunk
 * @returns The reasoning text from this delta, or empty string if none
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
   * @param apiKey - OpenAI API key (or compatible provider key)
   * @param config - Configuration options
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
   * @param message - User message to send
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
  ): AsyncGenerator<OpenAIMessage[], void, unknown> {
    if (!this.mcpClient) {
      throw new Error("MCP client not initialized. Call initialize() first.");
    }

    // Add user message
    const userMessage: OpenAIMessage = { role: "user", content: message };
    this.chatHistory.push(userMessage);
    yield this.chatHistory;

    // Get MCP tools
    const toolsResult = await this.mcpClient.listTools();
    // Filter tools based on enabled settings
    const enabledTools = this.config.enabledTools;
    const filteredTools = enabledTools
      ? toolsResult.tools.filter((tool) => enabledTools[tool.name] !== false)
      : toolsResult.tools;
    const tools: OpenAI.Chat.ChatCompletionTool[] = filteredTools.map(
      (tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema as Record<string, unknown>,
        },
      }),
    );

    // Manual tool calling loop
    let continueLoop = true;
    const maxIterations = 10; // Prevent infinite loops
    let iteration = 0;

    while (continueLoop && iteration < maxIterations) {
      iteration++;

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
        // console.log("OpenAIClient chunk:", JSON.stringify(chunk, null, 2));
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // Accumulate regular content
        if (delta.content) {
          currentMessage.content =
            (typeof currentMessage.content === "string"
              ? currentMessage.content
              : "") + delta.content;
        }

        // Accumulate reasoning separately (don't merge into content)
        const reasoning = extractReasoningFromDelta(delta);
        if (reasoning) {
          reasoningText += reasoning;
        }

        // Accumulate tool calls
        if (delta.tool_calls) {
          for (const tcDelta of delta.tool_calls) {
            if (!toolCallsMap.has(tcDelta.index)) {
              toolCallsMap.set(tcDelta.index, {
                id: tcDelta.id ?? "",
                type: "function",
                function: { name: "", arguments: "" },
              });
            }
            const tc = toolCallsMap.get(tcDelta.index);
            if (!tc) continue;
            if (tc.type !== "function") continue;
            if (tcDelta.id) tc.id = tcDelta.id;
            if (tcDelta.function?.name)
              tc.function.name = tcDelta.function.name;
            if (tcDelta.function?.arguments)
              tc.function.arguments += tcDelta.function.arguments;
          }
        }

        // Build the message to add to history
        const messageToAdd: OpenAIAssistantMessageWithReasoning = {
          ...currentMessage,
          tool_calls:
            toolCallsMap.size > 0
              ? Array.from(toolCallsMap.values())
              : undefined,
        };

        // Add reasoning_details if we accumulated any reasoning
        if (reasoningText) {
          messageToAdd.reasoning_details = [
            {
              type: "reasoning.text",
              text: reasoningText,
              index: 0,
            },
          ];
        }

        // Update message in history
        const lastMsg = this.chatHistory.at(-1);
        if (lastMsg?.role === "assistant") {
          // Cast to OpenAIMessage - reasoning_details will be preserved as extra property
          this.chatHistory[this.chatHistory.length - 1] =
            messageToAdd as unknown as OpenAIMessage;
        } else {
          this.chatHistory.push(messageToAdd as unknown as OpenAIMessage);
        }

        yield this.chatHistory;
      }

      // Check for tool calls
      const finalMessage = this.chatHistory.at(-1);
      if (finalMessage?.role === "assistant" && finalMessage.tool_calls) {
        // Execute tools
        for (const toolCall of finalMessage.tool_calls) {
          // Only handle function tool calls
          if (toolCall.type !== "function") continue;

          try {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await this.mcpClient.callTool({
              name: toolCall.function.name,
              arguments: args,
            });

            const toolMessage: OpenAIMessage = {
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(result.content),
            };
            this.chatHistory.push(toolMessage);
            yield this.chatHistory;
          } catch (error) {
            // Add error as tool result
            const toolMessage: OpenAIMessage = {
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
                isError: true,
              }),
            };
            this.chatHistory.push(toolMessage);
            yield this.chatHistory;
          }
        }
        // Continue loop to get model's response to tool results
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
}
