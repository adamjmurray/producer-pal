import OpenAI from "openai";
import type {
  ResponseCreateParamsBase,
  ResponseInput,
  Tool,
} from "openai/resources/responses/responses";
import {
  formatThought,
  formatToolCall,
  formatToolResult,
  debugLog,
  debugCall,
  DEBUG_SEPARATOR,
} from "../shared/formatting.ts";
import {
  connectMcp,
  extractToolResultText,
  getMcpToolsForOpenAI,
  type ResponsesTool,
} from "../shared/mcp.ts";
import { createReadline, runChatLoop } from "../shared/readline.ts";
import type {
  ChatOptions,
  OpenAIConversationItem,
  OpenAIResponseOutput,
  OpenAIResponsesResult,
  OpenAIStreamEvent,
  OpenAIThinkingLevel,
  OpenAIStreamState,
} from "../shared/types.ts";
import {
  extractReasoningText,
  processStreamEvent,
} from "./responses-streaming.ts";

const DEFAULT_MODEL = "gpt-5.2-2025-12-11";

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

  const model = options.model ?? DEFAULT_MODEL;
  const client = new OpenAI({ apiKey });
  const rl = createReadline();
  const { client: mcpClient } = await connectMcp();
  const tools = await getMcpToolsForOpenAI(mcpClient);

  console.log(`Model: ${model}`);
  console.log(`Provider: OpenAI (Responses API)`);
  console.log("Starting conversation (type 'exit', 'quit', or 'bye' to end)\n");

  try {
    await runChatLoop(
      { client, mcpClient, tools, conversation: [], model, options },
      rl,
      { initialText, singleResponse: options.singleResponse },
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

async function sendMessage(
  ctx: SessionContext,
  input: string,
  turnCount: number,
): Promise<void> {
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
  await (options.stream
    ? handleStreaming(ctx, requestBody)
    : handleNonStreaming(ctx, requestBody));
}

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

  if (options.thinking)
    body.reasoning = {
      effort: options.thinking as OpenAIThinkingLevel,
      summary: options.thinkingSummary ?? "auto",
    };
  if (options.outputTokens != null)
    body.max_output_tokens = options.outputTokens;
  if (options.randomness != null) body.temperature = options.randomness;
  if (options.systemPrompt != null) body.instructions = options.systemPrompt;

  return body;
}

async function handleNonStreaming(
  ctx: SessionContext,
  requestBody: ResponseCreateParamsBase,
): Promise<void> {
  const { client, conversation, model, options } = ctx;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const response = (await client.responses.create(
      requestBody,
    )) as OpenAIResponsesResult;

    if (options.debug) debugLog(response);

    const hasToolCalls = response.output.some(
      (item) => item.type === "function_call",
    );

    for (const item of response.output) await processOutputItem(item, ctx);
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
}

async function handleStreaming(
  ctx: SessionContext,
  requestBody: ResponseCreateParamsBase,
): Promise<void> {
  const { client, conversation, model, options, mcpClient } = ctx;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const stream = await client.responses.create({
      ...requestBody,
      stream: true,
    });
    const state: OpenAIStreamState = {
      inThought: false,
      displayedReasoning: false,
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
}

async function processOutputItem(
  item: OpenAIResponseOutput,
  ctx: SessionContext,
): Promise<void> {
  const { mcpClient, conversation } = ctx;

  if (item.type === "reasoning") {
    const text = extractReasoningText(item);

    if (text) console.log(formatThought(text));
  } else if (item.type === "message" && item.content) {
    const text = item.content
      .filter((c) => c.type === "output_text")
      .map((c) => c.text)
      .join("");

    if (text) console.log(text);
  } else if (item.type === "function_call" && item.name && item.arguments) {
    const args = JSON.parse(item.arguments) as Record<string, unknown>;

    console.log(formatToolCall(item.name, args));
    const result = await mcpClient.callTool({
      name: item.name,
      arguments: args,
    });
    const resultText = extractToolResultText(result);

    console.log(formatToolResult(resultText));
    conversation.push({
      type: "function_call_output",
      call_id: item.call_id,
      output: resultText,
    });
  }
}
