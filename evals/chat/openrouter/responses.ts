import {
  formatThought,
  endThought,
  debugLog,
  debugCall,
} from "../shared/formatting.ts";
import {
  connectMcp,
  getMcpToolsForResponses,
  type ResponsesTool,
} from "../shared/mcp.ts";
import { createMessageSource } from "../shared/message-source.ts";
import { createReadline, runChatLoop } from "../shared/readline.ts";
import {
  applyResponsesOptions,
  extractMessageText,
} from "../shared/responses-api-base.ts";
import {
  executeToolCallSafe,
  parseToolArgs,
} from "../shared/tool-execution.ts";
import type {
  ChatOptions,
  ResponsesAPIResponse,
  ResponsesConversationItem,
  ResponsesOutputItem,
  ResponsesRequestBody,
  ResponsesStreamState,
  TurnResult,
} from "../shared/types.ts";
import { DEFAULT_MODEL } from "./config.ts";
import { readSseStream } from "./responses-streaming.ts";

const OPENROUTER_RESPONSES_URL = "https://openrouter.ai/api/v1/responses";
const OPENROUTER_HEADERS = {
  "Content-Type": "application/json",
  "HTTP-Referer": "https://producer-pal.org",
  "X-Title": "Producer Pal CLI",
};

interface SessionContext {
  mcpClient: Awaited<ReturnType<typeof connectMcp>>["client"];
  tools: ResponsesTool[];
  conversation: ResponsesConversationItem[];
  model: string;
  options: ChatOptions;
}

/**
 * Makes a fetch request to the OpenRouter Responses API
 *
 * @param body - Request body to send
 * @returns Fetch response
 */
async function fetchResponses(body: ResponsesRequestBody): Promise<Response> {
  const response = await fetch(OPENROUTER_RESPONSES_URL, {
    method: "POST",
    headers: {
      ...OPENROUTER_HEADERS,
      Authorization: `Bearer ${process.env.OPENROUTER_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok)
    throw new Error(
      `Responses API error: ${response.status} ${await response.text()}`,
    );

  return response;
}

/**
 * Run an interactive chat session with OpenRouter Responses API
 *
 * @param initialText - Optional initial text to start the conversation
 * @param options - Chat configuration options
 */
export async function runOpenRouterResponses(
  initialText: string,
  options: ChatOptions,
): Promise<void> {
  const apiKey = process.env.OPENROUTER_KEY;

  if (!apiKey) {
    console.error("Error: OPENROUTER_KEY environment variable is required");
    process.exit(1);
  }

  const model = options.model ?? DEFAULT_MODEL;
  const rl = createReadline();
  const { client: mcpClient } = await connectMcp();
  const tools = await getMcpToolsForResponses(mcpClient);

  console.log(`Model: ${model}`);
  console.log(`Provider: OpenRouter (Responses API)`);
  console.log("Starting conversation (type 'exit', 'quit', or 'bye' to end)\n");

  const conversation: ResponsesConversationItem[] = [];
  const messageSource = createMessageSource(rl, options, initialText);

  try {
    await runChatLoop(
      { mcpClient, tools, conversation, model, options },
      messageSource,
      { once: options.once },
      { sendMessage: sendMessageResponses },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("Error:", message);
    if (options.debug) console.error(error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

/**
 * Sends a message in the Responses API session
 *
 * @param ctx - Session context with conversation and tools
 * @param input - User input text
 * @param turnCount - Current conversation turn number
 * @returns Turn result with response text and tool calls
 */
async function sendMessageResponses(
  ctx: SessionContext,
  input: string,
  turnCount: number,
): Promise<TurnResult> {
  ctx.conversation.push({ type: "message", role: "user", content: input });
  console.log(`\n[Turn ${turnCount}] Assistant:`);

  let text = "";
  const toolCalls: TurnResult["toolCalls"] = [];

  while (true) {
    const result = ctx.options.stream
      ? await handleResponsesStreaming(ctx)
      : await handleResponsesNonStreaming(ctx);

    text += result.text;
    toolCalls.push(...result.toolCalls);

    if (!result.shouldContinue) break;
  }

  return { text, toolCalls };
}

/**
 * Builds the Responses API request body from context
 *
 * @param ctx - Session context with conversation and options
 * @returns Request body for the Responses API
 */
function buildResponsesRequestBody(ctx: SessionContext): ResponsesRequestBody {
  const { conversation, model, tools, options } = ctx;
  const body: ResponsesRequestBody = { model, input: conversation, tools };

  applyResponsesOptions(body as unknown as Record<string, unknown>, options);

  return body;
}

interface ResponseHandlerResult {
  text: string;
  toolCalls: TurnResult["toolCalls"];
  shouldContinue: boolean;
}

/**
 * Handles non-streaming response from Responses API
 *
 * @param ctx - Session context
 * @returns Response result with text, tool calls, and continuation flag
 */
async function handleResponsesNonStreaming(
  ctx: SessionContext,
): Promise<ResponseHandlerResult> {
  const { options } = ctx;
  const body = buildResponsesRequestBody(ctx);

  if (options.debug) {
    debugCall("responses (non-streaming)", {
      ...body,
      tools: "[...]",
      input: `[${ctx.conversation.length} items]`,
    });
  }

  const response = await fetchResponses(body);
  const data = (await response.json()) as ResponsesAPIResponse;

  if (options.debug) debugLog(data);

  return await processResponsesOutput(ctx, data.output);
}

/**
 * Handles streaming response from Responses API
 *
 * @param ctx - Session context
 * @returns Response result with text, tool calls, and continuation flag
 */
async function handleResponsesStreaming(
  ctx: SessionContext,
): Promise<ResponseHandlerResult> {
  const { options } = ctx;
  const body = { ...buildResponsesRequestBody(ctx), stream: true };

  if (options.debug) {
    debugCall("responses (streaming)", {
      ...body,
      tools: "[...]",
      input: `[${ctx.conversation.length} items]`,
    });
  }

  const response = await fetchResponses(body);
  const state: ResponsesStreamState = {
    inThought: false,
    currentContent: "",
    currentReasoning: "",
    functionCalls: new Map<string, { name: string; arguments: string }>(),
  };

  const reader = response.body?.getReader();

  if (!reader) throw new Error("No response body");
  await readSseStream(reader, options, state);

  if (state.inThought) process.stdout.write(endThought());
  console.log();

  if (state.functionCalls.size > 0) {
    return await handleResponsesFunctionCalls(ctx, state);
  }

  if (state.currentContent) {
    ctx.conversation.push({
      type: "message",
      role: "assistant",
      content: state.currentContent,
    });
  }

  return {
    text: state.currentContent,
    toolCalls: [],
    shouldContinue: false,
  };
}

/**
 * Handles accumulated function calls from streaming
 *
 * @param ctx - Session context with MCP client
 * @param state - Stream state with function calls
 * @returns Result with tool calls and shouldContinue=true
 */
async function handleResponsesFunctionCalls(
  ctx: SessionContext,
  state: ResponsesStreamState,
): Promise<ResponseHandlerResult> {
  const toolCalls: TurnResult["toolCalls"] = [];

  for (const [callId, fc] of state.functionCalls) {
    ctx.conversation.push({
      type: "function_call",
      id: `fc_${callId}`,
      call_id: callId,
      name: fc.name,
      arguments: fc.arguments,
    });
    const result = await executeResponsesToolCall(
      ctx,
      callId,
      fc.name,
      fc.arguments,
    );

    toolCalls.push(result);
  }

  return {
    text: state.currentContent,
    toolCalls,
    shouldContinue: true,
  };
}

/**
 * Executes a tool call and adds result to conversation
 *
 * @param ctx - Session context with MCP client
 * @param callId - Unique call identifier
 * @param name - Tool name to call
 * @param argsJson - JSON-encoded arguments
 * @returns Tool call info with name, args, and result
 */
async function executeResponsesToolCall(
  ctx: SessionContext,
  callId: string,
  name: string,
  argsJson: string,
): Promise<TurnResult["toolCalls"][number]> {
  const { mcpClient, conversation } = ctx;
  const args = parseToolArgs(argsJson);
  const toolResult = await executeToolCallSafe(mcpClient, name, args);

  conversation.push({
    type: "function_call_output",
    call_id: callId,
    output: toolResult.result,
  });

  return toolResult;
}

/**
 * Processes non-streaming output items
 *
 * @param ctx - Session context with MCP client
 * @param output - Output items to process
 * @returns Result with text, tool calls, and continuation flag
 */
async function processResponsesOutput(
  ctx: SessionContext,
  output: ResponsesOutputItem[],
): Promise<ResponseHandlerResult> {
  const { conversation } = ctx;
  let text = "";
  const toolCalls: TurnResult["toolCalls"] = [];

  for (const item of output) {
    if (item.type === "reasoning" && item.summary)
      console.log(formatThought(item.summary));

    if (item.type === "message" && item.content) {
      const messageText = extractMessageText(item.content);

      if (messageText) {
        console.log(messageText);
        text += messageText;
        conversation.push({
          type: "message",
          role: "assistant",
          content: messageText,
        });
      }
    }

    if (item.type === "function_call" && item.name && item.call_id) {
      conversation.push({
        type: "function_call",
        id: item.id ?? `fc_${item.call_id}`,
        call_id: item.call_id,
        name: item.name,
        arguments: item.arguments ?? "{}",
      });
      const toolCall = await executeResponsesToolCall(
        ctx,
        item.call_id,
        item.name,
        item.arguments ?? "{}",
      );

      toolCalls.push(toolCall);
    }
  }

  return {
    text,
    toolCalls,
    shouldContinue: toolCalls.length > 0,
  };
}
