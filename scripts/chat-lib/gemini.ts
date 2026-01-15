import { inspect } from "node:util";
import {
  GoogleGenAI,
  mcpToTool,
  type GenerateContentConfig,
} from "@google/genai";
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
import {
  createReadline,
  runChatLoop,
  type ChatLoopCallbacks,
} from "./shared/readline.ts";
import type { ChatOptions } from "./shared/types.ts";

// Default model for Gemini
const DEFAULT_MODEL = "gemini-2.5-flash-lite";

interface ResponsePart {
  text?: string;
  thought?: boolean;
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  functionResponse?: {
    response?: {
      content?: Array<{ text?: string }>;
    };
  };
}

interface ResponseCandidate {
  content?: {
    parts?: ResponsePart[];
  };
}

interface GeminiResponse {
  candidates?: ResponseCandidate[];
  automaticFunctionCallingHistory?: Array<{
    role: string;
    parts: ResponsePart[];
  }>;
  sdkHttpResponse?: unknown;
}

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

  const callbacks: ChatLoopCallbacks<GeminiSessionContext> = {
    sendMessage: sendMessage,
  };

  try {
    await runChatLoop(
      { chatSession, options },
      rl,
      { initialText, singleResponse: options.singleResponse },
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

// Maps thinking level strings to token budgets
const GEMINI_THINKING_MAP: Record<string, number> = {
  off: 0,
  low: 2048,
  medium: 4096,
  high: 8192,
  ultra: 16384,
  auto: -1,
};

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

  if (options.systemPrompt != null) {
    config.systemInstruction = options.systemPrompt;
  }

  return config;
}

async function sendMessage(
  ctx: GeminiSessionContext,
  input: string,
  turnCount: number,
): Promise<void> {
  const { chatSession, options } = ctx;
  const message = { message: input };
  const { stream, debug } = options;

  if (stream) {
    if (debug) debugCall("chat.sendMessageStream", message);
    const responseStream = await chatSession.sendMessageStream(message);

    console.log(`\n[Turn ${turnCount}] Assistant:`);
    await printStream(responseStream as AsyncIterable<GeminiResponse>, debug);
  } else {
    if (debug) debugCall("chat.sendMessage", message);
    const response = (await chatSession.sendMessage(message)) as GeminiResponse;

    console.log(`\n[Turn ${turnCount}] Assistant:`);

    if (debug) {
      debugResult(response);
    }

    console.log(formatResponse(response, input));
  }
}

async function printStream(
  stream: AsyncIterable<GeminiResponse>,
  debug: boolean,
): Promise<void> {
  let inThought = false;

  for await (const chunk of stream) {
    if (debug) {
      console.log(DEBUG_SEPARATOR);
      console.log("Stream chunk");
      debugResult(chunk);
    }

    for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
      inThought = processPart(part, inThought);
    }
  }

  console.log();
}

function processPart(part: ResponsePart, inThought: boolean): boolean {
  if (part.text) {
    if (part.thought) {
      process.stdout.write(
        inThought ? continueThought(part.text) : startThought(part.text),
      );

      return true;
    }

    if (inThought) {
      process.stdout.write(endThought());
    }

    process.stdout.write(part.text);

    return false;
  }

  if (part.functionCall) {
    process.stdout.write(
      `🔧 ${part.functionCall.name}(${inspect(part.functionCall.args, { compact: true, depth: 10 })})\n`,
    );

    return inThought;
  }

  if (part.functionResponse) {
    process.stdout.write(
      `   ↳ ${truncate(part.functionResponse.response?.content?.[0]?.text, 160)}\n`,
    );
  }

  return inThought;
}

function formatResponse(
  response: GeminiResponse,
  currentInput: string,
): string {
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
      ?.map(({ thought, text }) =>
        thought ? startThought(text ?? "") + endThought() : text,
      )
      .join("\n") ?? "<no content>";

  output.push(textResponse);

  return output.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Debug helpers
// ─────────────────────────────────────────────────────────────────────────────

function debugResult(result: GeminiResponse): void {
  const { candidates, ...rest } = result;

  debugLog({
    ...rest,
    candidates,
  });
}
