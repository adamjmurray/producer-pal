import {
  formatThought,
  formatToolCall,
  formatToolResult,
  startThought,
  continueThought,
  endThought,
  debugLog,
  debugCall,
  DEBUG_SEPARATOR,
} from "../shared/formatting.ts";
import {
  connectMcp,
  extractToolResultText,
  getMcpToolsForResponses,
} from "../shared/mcp.ts";
import { createReadline, runChatLoop } from "../shared/readline.ts";
import type {
  ChatOptions,
  ChatTool,
  OpenRouterReasoningConfig,
  ResponsesAPIResponse,
  ResponsesConversationItem,
  ResponsesOutputItem,
  ResponsesRequestBody,
  ResponsesStreamEvent,
  ResponsesStreamState,
} from "../shared/types.ts";

const OPENROUTER_RESPONSES_URL = "https://openrouter.ai/api/v1/responses";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4";
const OPENROUTER_HEADERS = {
  "Content-Type": "application/json",
  "HTTP-Referer": "https://producer-pal.org",
  "X-Title": "Producer Pal CLI",
};

interface SessionContext {
  mcpClient: Awaited<ReturnType<typeof connectMcp>>["client"];
  tools: ChatTool[];
  conversation: ResponsesConversationItem[];
  model: string;
  options: ChatOptions;
}

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

  try {
    await runChatLoop(
      { mcpClient, tools, conversation, model, options },
      rl,
      initialText,
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

async function sendMessageResponses(
  ctx: SessionContext,
  input: string,
  turnCount: number,
): Promise<void> {
  ctx.conversation.push({ type: "message", role: "user", content: input });
  console.log(`\n[Turn ${turnCount}] Assistant:`);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const shouldContinue = ctx.options.stream
      ? await handleResponsesStreaming(ctx)
      : await handleResponsesNonStreaming(ctx);

    if (!shouldContinue) break;
  }
}

function buildResponsesRequestBody(ctx: SessionContext): ResponsesRequestBody {
  const { conversation, model, tools, options } = ctx;
  const body: ResponsesRequestBody = { model, input: conversation, tools };

  if (options.thinking)
    body.reasoning = {
      effort: options.thinking as OpenRouterReasoningConfig["effort"],
    };
  if (options.outputTokens != null)
    body.max_output_tokens = options.outputTokens;
  if (options.randomness != null) body.temperature = options.randomness;
  if (options.systemPrompt != null) body.instructions = options.systemPrompt;

  return body;
}

async function handleResponsesNonStreaming(
  ctx: SessionContext,
): Promise<boolean> {
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

async function handleResponsesStreaming(ctx: SessionContext): Promise<boolean> {
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

  if (state.functionCalls.size > 0)
    return await handleResponsesFunctionCalls(ctx, state);

  if (state.currentContent) {
    ctx.conversation.push({
      type: "message",
      role: "assistant",
      content: state.currentContent,
    });
  }

  return false;
}

async function readSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  options: ChatOptions,
  state: ResponsesStreamState,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");

    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);

      if (data === "[DONE]") continue;

      try {
        const event = JSON.parse(data) as ResponsesStreamEvent;

        if (options.debug) {
          console.log(DEBUG_SEPARATOR);
          debugLog(event);
        }

        processResponsesStreamEvent(event, state);
      } catch {
        // Skip invalid JSON
      }
    }
  }
}

function processResponsesStreamEvent(
  event: ResponsesStreamEvent,
  state: ResponsesStreamState,
): void {
  if (event.type === "response.reasoning.delta" && event.delta?.text) {
    state.currentReasoning += event.delta.text;

    if (!state.inThought) {
      process.stdout.write(startThought(event.delta.text));
      state.inThought = true;
    } else {
      process.stdout.write(continueThought(event.delta.text));
    }
  }

  if (event.type === "response.output_text.delta" && event.delta?.text) {
    if (state.inThought) {
      process.stdout.write(endThought());
      state.inThought = false;
    }

    process.stdout.write(event.delta.text);
    state.currentContent += event.delta.text;
  }

  if (event.type === "response.function_call_arguments.delta") {
    const callId = event.call_id ?? "";
    const existing = state.functionCalls.get(callId);

    if (existing) {
      existing.arguments += event.arguments ?? "";
    } else {
      state.functionCalls.set(callId, {
        name: event.name ?? "",
        arguments: event.arguments ?? "",
      });
    }
  }
}

async function handleResponsesFunctionCalls(
  ctx: SessionContext,
  state: ResponsesStreamState,
): Promise<boolean> {
  for (const [callId, fc] of state.functionCalls) {
    ctx.conversation.push({
      type: "function_call",
      id: `fc_${callId}`,
      call_id: callId,
      name: fc.name,
      arguments: fc.arguments,
    });
    await executeResponsesToolCall(ctx, callId, fc.name, fc.arguments);
  }

  return true;
}

async function executeResponsesToolCall(
  ctx: SessionContext,
  callId: string,
  name: string,
  argsJson: string,
): Promise<void> {
  const { mcpClient, conversation } = ctx;
  let args: Record<string, unknown>;

  try {
    args = JSON.parse(argsJson) as Record<string, unknown>;
  } catch {
    args = {};
  }

  console.log(formatToolCall(name, args));

  try {
    const result = await mcpClient.callTool({ name, arguments: args });
    const resultText = extractToolResultText(result);

    console.log(formatToolResult(resultText));
    conversation.push({
      type: "function_call_output",
      call_id: callId,
      output: resultText,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    console.log(formatToolResult(`Error: ${errorMsg}`));
    conversation.push({
      type: "function_call_output",
      call_id: callId,
      output: `Error: ${errorMsg}`,
    });
  }
}

async function processResponsesOutput(
  ctx: SessionContext,
  output: ResponsesOutputItem[],
): Promise<boolean> {
  const { conversation } = ctx;
  let hasFunctionCalls = false;

  for (const item of output) {
    if (item.type === "reasoning" && item.summary)
      console.log(formatThought(item.summary));

    if (item.type === "message" && item.content) {
      const text = item.content
        .filter((c) => c.type === "output_text")
        .map((c) => c.text)
        .join("");

      if (text) {
        console.log(text);
        conversation.push({
          type: "message",
          role: "assistant",
          content: text,
        });
      }
    }

    if (item.type === "function_call" && item.name && item.call_id) {
      hasFunctionCalls = true;
      conversation.push({
        type: "function_call",
        id: item.id ?? `fc_${item.call_id}`,
        call_id: item.call_id,
        name: item.name,
        arguments: item.arguments ?? "{}",
      });
      await executeResponsesToolCall(
        ctx,
        item.call_id,
        item.name,
        item.arguments ?? "{}",
      );
    }
  }

  return hasFunctionCalls;
}
