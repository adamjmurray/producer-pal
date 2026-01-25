import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageParam,
  ThinkingConfigParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ANTHROPIC_THINKING_MAP, DEFAULT_MODEL } from "./anthropic/config.ts";
import {
  formatNonStreamingResponse,
  handleStreamingResponse,
} from "./anthropic/streaming.ts";
import { debugCall, debugLog, truncate } from "./shared/formatting.ts";
import {
  connectMcp,
  extractToolResultText,
  getMcpToolsForAnthropic,
} from "./shared/mcp.ts";
import { createMessageSource } from "./shared/message-source.ts";
import {
  createReadline,
  runChatLoop,
  type ChatLoopCallbacks,
} from "./shared/readline.ts";
import type { ChatOptions, TurnResult } from "./shared/types.ts";

interface AnthropicSessionContext {
  client: Anthropic;
  mcpClient: Client;
  tools: Tool[];
  messages: MessageParam[];
  model: string;
  options: ChatOptions;
}

const DEFAULT_MAX_TOKENS = 8192;

/**
 * Run an interactive chat session with Anthropic API
 *
 * @param initialText - Optional initial text to start the conversation
 * @param options - Chat configuration options
 */
export async function runAnthropic(
  initialText: string,
  options: ChatOptions,
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_KEY;

  if (!apiKey) {
    console.error("Error: ANTHROPIC_KEY environment variable is required");
    process.exit(1);
  }

  const model = options.model ?? DEFAULT_MODEL;
  const client = new Anthropic({ apiKey });

  const rl = createReadline();
  const { client: mcpClient } = await connectMcp();
  const mcpTools = await getMcpToolsForAnthropic(mcpClient);

  // Convert to Anthropic Tool format
  const tools: Tool[] = mcpTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
  }));

  if (options.debug) {
    debugCall("Anthropic client created", { model, toolCount: tools.length });
  }

  console.log(`Model: ${model}`);
  console.log(`Provider: Anthropic`);
  console.log("Starting conversation (type 'exit', 'quit', or 'bye' to end)\n");

  const messageSource = createMessageSource(rl, options, initialText);

  const ctx: AnthropicSessionContext = {
    client,
    mcpClient,
    tools,
    messages: [],
    model,
    options,
  };

  const callbacks: ChatLoopCallbacks<AnthropicSessionContext> = {
    sendMessage: sendMessage,
  };

  try {
    await runChatLoop(ctx, messageSource, { once: options.once }, callbacks);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("Error:", message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

/**
 * Sends a message to Anthropic and handles tool calls
 *
 * @param ctx - Session context
 * @param input - User input text
 * @param turnCount - Current conversation turn number
 * @returns Turn result with response text and tool calls
 */
async function sendMessage(
  ctx: AnthropicSessionContext,
  input: string,
  turnCount: number,
): Promise<TurnResult> {
  const { client, mcpClient, tools, messages, model, options } = ctx;
  const { stream, debug } = options;

  // Add user message to history
  messages.push({ role: "user", content: input });

  console.log(`\n[Turn ${turnCount}] Assistant:`);

  const allToolCalls: TurnResult["toolCalls"] = [];
  let finalText = "";

  // Tool call loop - continue until no more tool_use blocks
  while (true) {
    const requestBody = buildRequestBody(messages, model, tools, options);

    if (debug) debugCall("messages.create", { ...requestBody, tools: "[...]" });

    let response: Message;
    let turnText: string;
    let turnToolCalls: TurnResult["toolCalls"];

    if (stream) {
      const result = await handleStreamingResponse(client, requestBody, debug);

      response = result.response;
      turnText = result.text;
      turnToolCalls = result.toolCalls;
    } else {
      response = await client.messages.create({
        ...requestBody,
        stream: false,
      });

      if (debug) debugLog(response);

      const result = formatNonStreamingResponse(response);

      turnText = result.text;
      turnToolCalls = result.toolCalls;
      console.log(turnText);
    }

    finalText += turnText;
    allToolCalls.push(...turnToolCalls);

    // Check for tool_use blocks
    const toolUseBlocks = response.content.filter(
      (block): block is ToolUseBlock => block.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) {
      // No more tool calls, we're done
      break;
    }

    // Add assistant message with tool_use blocks to history
    messages.push({ role: "assistant", content: response.content });

    // Execute tools and collect results
    const toolResults = await executeToolCalls(
      toolUseBlocks,
      mcpClient,
      allToolCalls,
    );

    // Add tool results as user message
    messages.push({ role: "user", content: toolResults });

    console.log();
  }

  // Add final assistant response to history (text only)
  const lastMessage = messages.at(-1);

  if (lastMessage?.role !== "assistant") {
    messages.push({ role: "assistant", content: finalText });
  }

  return { text: finalText, toolCalls: allToolCalls };
}

/**
 * Executes tool calls and returns tool results for Anthropic
 *
 * @param toolUseBlocks - Tool use blocks from the response
 * @param mcpClient - MCP client for tool execution
 * @param allToolCalls - Array to track all tool calls (mutated with results)
 * @returns Tool result blocks to send back to Anthropic
 */
async function executeToolCalls(
  toolUseBlocks: ToolUseBlock[],
  mcpClient: Client,
  allToolCalls: TurnResult["toolCalls"],
): Promise<ToolResultBlockParam[]> {
  const toolResults: ToolResultBlockParam[] = [];

  for (const toolUse of toolUseBlocks) {
    const result = await mcpClient.callTool({
      name: toolUse.name,
      arguments: toolUse.input as Record<string, unknown>,
    });
    const resultText = extractToolResultText(result);

    toolResults.push({
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: resultText,
    });

    // Update tool call result in our tracking
    const tracked = allToolCalls.find(
      (tc) =>
        tc.name === toolUse.name &&
        JSON.stringify(tc.args) === JSON.stringify(toolUse.input),
    );

    if (tracked) tracked.result = resultText;

    console.log(`   \u21b3 ${truncate(resultText, 160)}`);
  }

  return toolResults;
}

/**
 * Builds the request body for Anthropic messages.create
 *
 * @param messages - Conversation history
 * @param model - Model identifier
 * @param tools - Available tools
 * @param options - Chat options
 * @returns Request parameters for messages.create
 */
function buildRequestBody(
  messages: MessageParam[],
  model: string,
  tools: Tool[],
  options: ChatOptions,
): Anthropic.MessageCreateParams {
  const body: Anthropic.MessageCreateParams = {
    model,
    messages,
    tools,
    max_tokens: options.outputTokens ?? DEFAULT_MAX_TOKENS,
  };

  if (options.randomness != null) {
    body.temperature = options.randomness;
  }

  if (options.instructions != null) {
    body.system = options.instructions;
  }

  if (options.thinking) {
    const thinkingConfig = buildThinkingConfig(options.thinking as string);

    if (thinkingConfig) {
      body.thinking = thinkingConfig;
    }
  }

  return body;
}

/**
 * Builds thinking configuration from thinking level string
 *
 * @param thinking - Thinking level (off, low, medium, high, ultra, auto, or numeric)
 * @returns Thinking config or null if disabled
 */
function buildThinkingConfig(thinking: string): ThinkingConfigParam | null {
  const budget =
    ANTHROPIC_THINKING_MAP[thinking] ?? Number.parseInt(thinking, 10);

  if (budget === 0 || Number.isNaN(budget)) {
    return { type: "disabled" };
  }

  return {
    type: "enabled",
    budget_tokens: budget > 0 ? budget : 4096, // Default for "auto"
  };
}
