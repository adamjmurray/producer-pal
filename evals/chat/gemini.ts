import { inspect } from "node:util";
import {
  GoogleGenAI,
  mcpToTool,
  type GenerateContentConfig,
} from "@google/genai";
import type {
  GeminiResponse,
  GeminiResponsePart as ResponsePart,
} from "#evals/shared/gemini-types.ts";
import { DEFAULT_MODEL } from "./gemini/config.ts";
import {
  startThought,
  continueThought,
  endThought,
  debugCall,
  debugLog,
  truncate,
  DEBUG_SEPARATOR,
} from "./shared/formatting.ts";
import { connectMcp } from "./shared/mcp.ts";
import { createMessageSource } from "./shared/message-source.ts";
import {
  createReadline,
  runChatLoop,
  type ChatLoopCallbacks,
} from "./shared/readline.ts";
import { GEMINI_THINKING_MAP } from "./shared/thinking-maps.ts";
import type { ChatOptions, TurnResult } from "./shared/types.ts";

type ChatSession = ReturnType<GoogleGenAI["chats"]["create"]>;

interface GeminiSessionContext {
  chatSession: ChatSession;
  options: ChatOptions;
}

/**
 * Run an interactive chat session with Gemini API
 *
 * @param initialText - Optional initial text to start the conversation
 * @param options - Chat configuration options
 */
export async function runGemini(
  initialText: string,
  options: ChatOptions,
): Promise<void> {
  const apiKey = process.env.GEMINI_KEY;

  if (!apiKey) {
    console.error("Error: GEMINI_KEY environment variable is required");
    process.exit(1);
  }

  const model = options.model ?? DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey });
  const config = buildConfig(options);

  const rl = createReadline();
  const { client: mcpClient } = await connectMcp();

  config.tools = [mcpToTool(mcpClient)];
  config.automaticFunctionCalling = {};

  if (options.debug) {
    debugCall("ai.chats.create", {
      model,
      config: { ...config, tools: "[...]" },
    });
  }

  const chatSession = ai.chats.create({ model, config });

  console.log(`Model: ${model}`);
  console.log(`Provider: Gemini`);
  console.log("Starting conversation (type 'exit', 'quit', or 'bye' to end)\n");

  const messageSource = createMessageSource(rl, options, initialText);

  const callbacks: ChatLoopCallbacks<GeminiSessionContext> = {
    sendMessage: sendMessage,
  };

  try {
    await runChatLoop(
      { chatSession, options },
      messageSource,
      { once: options.once },
      callbacks,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("Error:", message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

/**
 * Builds Gemini API configuration from chat options
 *
 * @param options - Chat configuration options
 * @returns Gemini content generation config
 */
function buildConfig(options: ChatOptions): GenerateContentConfig {
  const config: GenerateContentConfig = {};

  if (options.outputTokens != null) {
    config.maxOutputTokens = options.outputTokens;
  }

  if (options.randomness != null) {
    config.temperature = options.randomness;
  }

  if (options.thinking) {
    const budget =
      GEMINI_THINKING_MAP[options.thinking] ??
      Number.parseInt(options.thinking, 10);

    config.thinkingConfig = {
      includeThoughts: budget !== 0,
      thinkingBudget: budget > 0 ? budget : undefined,
    };
  }

  if (options.instructions != null) {
    config.systemInstruction = options.instructions;
  }

  return config;
}

/**
 * Sends a message to Gemini and displays the response
 *
 * @param ctx - Session context with chat session and options
 * @param input - User input text
 * @param turnCount - Current conversation turn number
 * @returns Turn result with response text and tool calls
 */
async function sendMessage(
  ctx: GeminiSessionContext,
  input: string,
  turnCount: number,
): Promise<TurnResult> {
  const { chatSession, options } = ctx;
  const message = { message: input };
  const { stream, debug } = options;

  if (stream) {
    if (debug) debugCall("chat.sendMessageStream", message);
    const responseStream = await chatSession.sendMessageStream(message);

    console.log(`\n[Turn ${turnCount}] Assistant:`);

    return await printStream(
      responseStream as AsyncIterable<GeminiResponse>,
      debug,
    );
  }

  if (debug) debugCall("chat.sendMessage", message);
  const response = (await chatSession.sendMessage(message)) as GeminiResponse;

  console.log(`\n[Turn ${turnCount}] Assistant:`);

  if (debug) {
    debugResult(response);
  }

  const formatted = formatResponse(response, input);

  console.log(formatted.text);

  return formatted;
}

/**
 * Prints streaming response chunks to stdout
 *
 * @param stream - Async iterable of response chunks
 * @param debug - Whether to log debug information
 * @returns Turn result with collected response text and tool calls
 */
async function printStream(
  stream: AsyncIterable<GeminiResponse>,
  debug: boolean,
): Promise<TurnResult> {
  let inThought = false;
  let text = "";
  const toolCalls: TurnResult["toolCalls"] = [];

  for await (const chunk of stream) {
    if (debug) {
      console.log(DEBUG_SEPARATOR);
      console.log("Stream chunk");
      debugResult(chunk);
    }

    for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
      const result = processPart(part, inThought);

      inThought = result.inThought;

      if (result.text) {
        text += result.text;
      }

      if (result.toolCall) {
        toolCalls.push(result.toolCall);
      }
    }
  }

  console.log();

  return { text, toolCalls };
}

interface ProcessPartResult {
  inThought: boolean;
  text?: string;
  toolCall?: TurnResult["toolCalls"][number];
}

/**
 * Processes a single response part and writes to stdout
 *
 * @param part - Response part containing text, thought, or function call
 * @param inThought - Whether currently inside a thought block
 * @returns Result with updated thought state and any collected text/toolCall
 */
function processPart(
  part: ResponsePart,
  inThought: boolean,
): ProcessPartResult {
  if (part.text) {
    if (part.thought) {
      process.stdout.write(
        inThought ? continueThought(part.text) : startThought(part.text),
      );

      return { inThought: true };
    }

    if (inThought) {
      process.stdout.write(endThought());
    }

    process.stdout.write(part.text);

    return { inThought: false, text: part.text };
  }

  if (part.functionCall) {
    process.stdout.write(
      `🔧 ${part.functionCall.name}(${inspect(part.functionCall.args, { compact: true, depth: 10 })})\n`,
    );

    return {
      inThought,
      toolCall: { name: part.functionCall.name, args: part.functionCall.args },
    };
  }

  if (part.functionResponse) {
    process.stdout.write(
      `   ↳ ${truncate(part.functionResponse.response?.content?.[0]?.text, 160)}\n`,
    );
  }

  return { inThought };
}

/**
 * Formats a non-streaming response for display
 *
 * @param response - Complete Gemini response
 * @param currentInput - Current user input for context
 * @returns Turn result with formatted text and tool calls
 */
function formatResponse(
  response: GeminiResponse,
  currentInput: string,
): TurnResult {
  const history = response.automaticFunctionCallingHistory ?? [];

  interface FunctionCall {
    name: string;
    args: Record<string, unknown>;
    result?: string;
  }

  const { calls } = history.reduce<{
    pastInput: boolean;
    calls: FunctionCall[];
    responses: unknown[];
  }>(
    (result, { parts, role }) => {
      if (
        !result.pastInput &&
        role === "user" &&
        parts[0]?.text === currentInput
      ) {
        result.pastInput = true;
      }

      if (result.pastInput) {
        for (const { functionCall, functionResponse } of parts) {
          if (functionCall) {
            result.calls.push({
              name: functionCall.name,
              args: functionCall.args,
            });
          }

          if (functionResponse) {
            const lastCall = result.calls[result.responses.length];

            if (lastCall) {
              lastCall.result = functionResponse.response?.content?.[0]?.text;
            }

            result.responses.push(functionResponse);
          }
        }
      }

      return result;
    },
    { pastInput: false, calls: [], responses: [] },
  );

  const output: string[] = [];

  for (const { name, args, result } of calls) {
    output.push(
      `🔧 ${name}(${inspect(args, { compact: true })})\n   ↳ ${truncate(result, 160)}`,
    );
  }

  if (calls.length > 0) {
    output.push("");
  }

  const textResponse =
    response.candidates?.[0]?.content?.parts
      ?.filter(({ thought }) => !thought)
      .map(({ text }) => text)
      .join("\n") ?? "<no content>";

  output.push(textResponse);

  const toolCalls: TurnResult["toolCalls"] = calls.map(({ name, args }) => ({
    name,
    args,
  }));

  return { text: output.join("\n"), toolCalls };
}

// ─────────────────────────────────────────────────────────────────────────────
// Debug helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Logs debug information for a Gemini response
 *
 * @param result - Response to log
 */
function debugResult(result: GeminiResponse): void {
  const { candidates, ...rest } = result;

  debugLog({
    ...rest,
    candidates,
  });
}
