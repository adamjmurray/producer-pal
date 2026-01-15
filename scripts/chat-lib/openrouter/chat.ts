import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";
import {
  createStreamState,
  processStreamChunk,
  buildToolCallsArray,
  executeToolCall,
} from "../shared/chat-streaming.ts";
import {
  formatThought,
  debugLog,
  debugCall,
  DEBUG_SEPARATOR,
  endThought,
} from "../shared/formatting.ts";
import { connectMcp, getMcpToolsForChat } from "../shared/mcp.ts";
import { createReadline, runChatLoop } from "../shared/readline.ts";
import type {
  ChatOptions,
  ChatTool,
  OpenRouterMessage,
  OpenRouterReasoningConfig,
  OpenRouterRequestBody,
  OpenRouterResponse,
  OpenRouterStreamChunk,
} from "../shared/types.ts";

// OpenRouter extends OpenAI's API with additional fields like `reasoning`
type OpenRouterNonStreamingParams = ChatCompletionCreateParamsNonStreaming & {
  reasoning?: OpenRouterReasoningConfig;
};

type OpenRouterStreamingParams = ChatCompletionCreateParamsStreaming & {
  reasoning?: OpenRouterReasoningConfig;
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4";
const HTTP_REFERER_HEADER = "HTTP-Referer";
const REFERER_URL = "https://producer-pal.org";
const X_TITLE_HEADER = "X-Title";
const APP_TITLE = "Producer Pal CLI";

interface SessionContext {
  client: OpenAI;
  mcpClient: Awaited<ReturnType<typeof connectMcp>>["client"];
  tools: ChatTool[];
  messages: OpenRouterMessage[];
  model: string;
  options: ChatOptions;
}

/**
 * Run an interactive chat session with OpenRouter Chat API
 *
 * @param initialText - Optional initial text to start the conversation
 * @param options - Chat configuration options
 */
export async function runOpenRouterChat(
  initialText: string,
  options: ChatOptions,
): Promise<void> {
  const apiKey = process.env.OPENROUTER_KEY;

  if (!apiKey) {
    console.error("Error: OPENROUTER_KEY environment variable is required");
    process.exit(1);
  }

  const model = options.model ?? DEFAULT_MODEL;

  const client = new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      [HTTP_REFERER_HEADER]: REFERER_URL,
      [X_TITLE_HEADER]: APP_TITLE,
    },
  });

  const rl = createReadline();
  const { client: mcpClient } = await connectMcp();
  const tools = await getMcpToolsForChat(mcpClient);

  console.log(`Model: ${model}`);
  console.log(`Provider: OpenRouter (Chat API)`);
  console.log("Starting conversation (type 'exit', 'quit', or 'bye' to end)\n");

  const messages: OpenRouterMessage[] = [];

  try {
    await runChatLoop(
      { client, mcpClient, tools, messages, model, options },
      rl,
      initialText,
      { sendMessage: sendMessageChat },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("Error:", message);

    if (options.debug) {
      console.error(error);
    }

    process.exit(1);
  } finally {
    rl.close();
  }
}

async function sendMessageChat(
  ctx: SessionContext,
  input: string,
  turnCount: number,
): Promise<void> {
  const { messages, options } = ctx;

  messages.push({
    role: "user",
    content: input,
  });

  console.log(`\n[Turn ${turnCount}] Assistant:`);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const shouldContinue = options.stream
      ? await handleStreamingResponse(ctx)
      : await handleNonStreamingResponse(ctx);

    if (!shouldContinue) break;
  }
}

function buildRequestBody(ctx: SessionContext): OpenRouterRequestBody {
  const { messages, model, tools, options } = ctx;

  const body: OpenRouterRequestBody = {
    model,
    messages,
    tools,
  };

  if (options.thinking) {
    body.reasoning = {
      effort: options.thinking as OpenRouterReasoningConfig["effort"],
    };
  }

  if (options.outputTokens != null) {
    body.max_tokens = options.outputTokens;
  }

  if (options.randomness != null) {
    body.temperature = options.randomness;
  }

  if (options.systemPrompt != null) {
    const hasSystem = messages.some((m) => m.role === "system");

    if (!hasSystem) {
      messages.unshift({
        role: "system",
        content: options.systemPrompt,
      });
    }
  }

  return body;
}

async function handleNonStreamingResponse(
  ctx: SessionContext,
): Promise<boolean> {
  const { client, messages, options } = ctx;
  const body = buildRequestBody(ctx);

  if (options.debug) {
    debugCall("chat.completions.create", {
      ...body,
      tools: "[...]",
      messages: `[${messages.length} messages]`,
    });
  }

  const response = (await client.chat.completions.create(
    body as OpenRouterNonStreamingParams,
  )) as unknown as OpenRouterResponse;

  if (options.debug) {
    debugLog(response);
  }

  const choice = response.choices[0];

  if (!choice) {
    console.log("<no response>");

    return false;
  }

  const assistantMessage = choice.message;

  if (assistantMessage.reasoning) {
    console.log(formatThought(assistantMessage.reasoning));
  }

  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    messages.push({
      role: "assistant",
      content: assistantMessage.content,
      tool_calls: assistantMessage.tool_calls,
      reasoning_details: assistantMessage.reasoning_details,
    });

    for (const toolCall of assistantMessage.tool_calls) {
      await executeToolCall(ctx.mcpClient, messages, toolCall);
    }

    return true;
  }

  if (assistantMessage.content) {
    console.log(assistantMessage.content);
  }

  messages.push({
    role: "assistant",
    content: assistantMessage.content,
    reasoning_details: assistantMessage.reasoning_details,
  });

  return false;
}

async function handleStreamingResponse(ctx: SessionContext): Promise<boolean> {
  const { client, messages, options } = ctx;
  const body = buildRequestBody(ctx);

  if (options.debug) {
    debugCall("chat.completions.create (stream)", {
      ...body,
      tools: "[...]",
      messages: `[${messages.length} messages]`,
    });
  }

  const stream = await client.chat.completions.create({
    ...body,
    stream: true,
  } as OpenRouterStreamingParams);

  const state = createStreamState();

  for await (const chunk of stream as AsyncIterable<OpenRouterStreamChunk>) {
    if (options.debug) {
      console.log(DEBUG_SEPARATOR);
      debugLog(chunk);
    }

    processStreamChunk(chunk, state);
  }

  if (state.inThought) {
    process.stdout.write(endThought());
  }

  console.log();

  if (state.toolCalls.size > 0) {
    const toolCallsArray = buildToolCallsArray(state);

    messages.push({
      role: "assistant",
      content: state.currentContent || null,
      tool_calls: toolCallsArray,
      reasoning: state.currentReasoning || undefined,
      reasoning_details:
        state.reasoningDetails.length > 0 ? state.reasoningDetails : undefined,
    });

    for (const toolCall of toolCallsArray) {
      await executeToolCall(ctx.mcpClient, messages, toolCall);
    }

    return true;
  }

  messages.push({
    role: "assistant",
    content: state.currentContent || null,
    reasoning: state.currentReasoning || undefined,
    reasoning_details:
      state.reasoningDetails.length > 0 ? state.reasoningDetails : undefined,
  });

  return false;
}
