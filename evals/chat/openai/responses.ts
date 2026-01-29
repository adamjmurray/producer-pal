import OpenAI from "openai";
import type {
  ResponseCreateParamsBase,
  ResponseInput,
  Tool,
} from "openai/resources/responses/responses";
import {
  formatThought,
  debugLog,
  debugCall,
  DEBUG_SEPARATOR,
} from "../shared/formatting.ts";
import {
  connectMcp,
  getMcpToolsForOpenAI,
  type ResponsesTool,
} from "../shared/mcp.ts";
import { createMessageSource } from "../shared/message-source.ts";
import { createReadline, runChatLoop } from "../shared/readline.ts";
import {
  applyResponsesOptions,
  extractMessageText,
} from "../shared/responses-api-base.ts";
import {
  executeAndLogToolCall,
  parseToolArgs,
} from "../shared/tool-execution.ts";
import type {
  ChatOptions,
  OpenAIConversationItem,
  OpenAIResponseOutput,
  OpenAIResponsesResult,
  OpenAIStreamEvent,
  OpenAIStreamState,
  TurnResult,
} from "../shared/types.ts";
import {
  extractReasoningText,
  processStreamEvent,
} from "./responses-streaming.ts";

type SessionContext = {
  client: OpenAI;
  mcpClient: {
    callTool: (params: {
      name: string;
      arguments: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  tools: ResponsesTool[];
  conversation: OpenAIConversationItem[];
  model: string;
  options: ChatOptions;
};

/**
 * Run an interactive chat session with OpenAI Responses API
 *
 * @param initialText - Optional initial text to start the conversation
 * @param options - Chat configuration options
 */
export async function runOpenAIResponses(
  initialText: string,
  options: ChatOptions,
): Promise<void> {
  const apiKey = process.env.OPENAI_KEY;

  if (!apiKey) {
    console.error("Error: OPENAI_KEY environment variable is required");
    process.exit(1);
  }

  const model = options.model;
  const client = new OpenAI({ apiKey });
  const rl = createReadline();
  const { client: mcpClient } = await connectMcp();
  const tools = await getMcpToolsForOpenAI(mcpClient);

  console.log(`Model: ${model}`);
  console.log(`Provider: OpenAI (Responses API)`);
  console.log("Starting conversation (type 'exit', 'quit', or 'bye' to end)\n");

  const messageSource = createMessageSource(rl, options, initialText);

  try {
    await runChatLoop(
      { client, mcpClient, tools, conversation: [], model, options },
      messageSource,
      { once: options.once },
      { sendMessage },
    );
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  } finally {
    rl.close();
  }
}

/**
 * Sends a user message and handles the response
 *
 * @param ctx - Session context with client and conversation
 * @param input - User input text
 * @param turnCount - Current conversation turn number
 * @returns Turn result with response text and tool calls
 */
async function sendMessage(
  ctx: SessionContext,
  input: string,
  turnCount: number,
): Promise<TurnResult> {
  const { conversation, model, options } = ctx;

  conversation.push({ type: "message", role: "user", content: input });
  const requestBody = buildRequestBody(ctx, model, options);

  if (options.debug) {
    debugCall("responses.create", {
      ...requestBody,
      tools: "[...]",
      input: `[${conversation.length} items]`,
    });
  }

  console.log(`\n[Turn ${turnCount}] Assistant:`);

  return options.stream
    ? await handleStreaming(ctx, requestBody)
    : await handleNonStreaming(ctx, requestBody);
}

/**
 * Builds the Responses API request body
 *
 * @param ctx - Session context with conversation
 * @param model - Model identifier
 * @param options - Chat configuration options
 * @returns Request body for responses.create
 */
function buildRequestBody(
  ctx: SessionContext,
  model: string,
  options: ChatOptions,
): ResponseCreateParamsBase {
  const body: ResponseCreateParamsBase = {
    model,
    input: ctx.conversation as ResponseInput,
    tools: ctx.tools as Tool[],
  };

  applyResponsesOptions(body as Record<string, unknown>, options);

  return body;
}

/**
 * Handles non-streaming response flow with tool call loop
 *
 * @param ctx - Session context with client and MCP
 * @param requestBody - Initial request body
 * @returns Turn result with response text and tool calls
 */
async function handleNonStreaming(
  ctx: SessionContext,
  requestBody: ResponseCreateParamsBase,
): Promise<TurnResult> {
  const { client, conversation, model, options } = ctx;
  let text = "";
  const toolCalls: TurnResult["toolCalls"] = [];

  while (true) {
    const response = (await client.responses.create(
      requestBody,
    )) as OpenAIResponsesResult;

    if (options.debug) debugLog(response);

    const hasToolCalls = response.output.some(
      (item) => item.type === "function_call",
    );

    for (const item of response.output) {
      const result = await processOutputItem(item, ctx);

      if (result.text) text += result.text;
      if (result.toolCall) toolCalls.push(result.toolCall);
    }

    conversation.push(...(response.output as OpenAIConversationItem[]));

    if (!hasToolCalls) break;
    requestBody = buildRequestBody(ctx, model, options);

    if (options.debug) {
      debugCall("responses.create (tool continuation)", {
        ...requestBody,
        tools: "[...]",
        input: `[${conversation.length} items]`,
      });
    }
  }

  return { text, toolCalls };
}

/**
 * Handles streaming response flow with tool call loop
 *
 * @param ctx - Session context with client and MCP
 * @param requestBody - Initial request body
 * @returns Turn result with response text and tool calls
 */
async function handleStreaming(
  ctx: SessionContext,
  requestBody: ResponseCreateParamsBase,
): Promise<TurnResult> {
  const { client, conversation, model, options, mcpClient } = ctx;
  let text = "";
  const toolCalls: TurnResult["toolCalls"] = [];

  while (true) {
    const stream = await client.responses.create({
      ...requestBody,
      stream: true,
    });
    const state: OpenAIStreamState = {
      inThought: false,
      displayedReasoning: false,
      currentContent: "",
      pendingFunctionCalls: new Map(),
      toolResults: new Map(),
      hasToolCalls: false,
    };

    for await (const event of stream) {
      if (options.debug) {
        console.log(DEBUG_SEPARATOR);
        console.log("Stream event:", event.type);
        debugLog(event);
      }

      await processStreamEvent(
        event as OpenAIStreamEvent,
        state,
        mcpClient,
        conversation,
      );
    }

    text += state.currentContent;

    // Collect tool calls from state
    for (const [, call] of state.pendingFunctionCalls) {
      const result = state.toolResults.get(call.call_id);

      toolCalls.push({
        name: call.name,
        args: call.args ?? {},
        result,
      });
    }

    console.log();
    if (!state.hasToolCalls) break;
    requestBody = buildRequestBody(ctx, model, options);

    if (options.debug) {
      debugCall("responses.create (tool continuation)", {
        ...requestBody,
        tools: "[...]",
        input: `[${conversation.length} items]`,
      });
    }
  }

  return { text, toolCalls };
}

interface ProcessOutputResult {
  text?: string;
  toolCall?: TurnResult["toolCalls"][number];
}

/**
 * Processes a single output item (reasoning, message, or function call)
 *
 * @param item - Output item to process
 * @param ctx - Session context with MCP client
 * @returns Result with any text content and tool call info
 */
async function processOutputItem(
  item: OpenAIResponseOutput,
  ctx: SessionContext,
): Promise<ProcessOutputResult> {
  const { mcpClient, conversation } = ctx;

  if (item.type === "reasoning") {
    const text = extractReasoningText(item);

    if (text) console.log(formatThought(text));

    return {};
  } else if (item.type === "message" && item.content) {
    const text = extractMessageText(item.content);

    if (text) console.log(text);

    return { text };
  } else if (item.type === "function_call" && item.name && item.arguments) {
    const args = parseToolArgs(item.arguments);
    const toolResult = await executeAndLogToolCall(mcpClient, item.name, args);

    conversation.push({
      type: "function_call_output",
      call_id: item.call_id,
      output: toolResult.result,
    });

    return { toolCall: toolResult };
  }

  return {};
}
