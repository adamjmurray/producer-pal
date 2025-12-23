import { createInterface, type Interface } from "node:readline";
import { inspect } from "node:util";
import { GoogleGenAI, mcpToTool } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ChatOptions } from "./index.ts";

const DEBUG_SEPARATOR = "\n" + "-".repeat(80);
const MCP_URL = "http://localhost:3350/mcp";

// Default model for Gemini
const DEFAULT_MODEL = "gemini-2.5-flash-lite";

interface GeminiConfig {
  maxOutputTokens?: number;
  temperature?: number;
  thinkingConfig?: {
    includeThoughts?: boolean;
    thinkingBudget?: number;
  };
  systemInstruction?: string;
  tools?: unknown[];
  automaticFunctionCalling?: Record<string, unknown>;
}

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

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Connect to MCP server
  const transport = new StreamableHTTPClientTransport(MCP_URL);
  const client = new Client({
    name: "producer-pal-chat",
    version: "1.0.0",
  });

  await client.connect(transport);
  config.tools = [mcpToTool(client)];
  config.automaticFunctionCalling = {};

  if (options.debug || options.verbose) {
    debugCall("ai.chats.create", {
      model,
      config: { ...config, tools: "[...]" },
    });
  }

  const chatSession = ai.chats.create({ model, config });

  console.log(`Model: ${model}`);
  console.log("Starting conversation (type 'exit', 'quit', or 'bye' to end)\n");

  try {
    await chatLoop(chatSession, rl, initialText, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("Error:", message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

function buildConfig(options: ChatOptions): GeminiConfig {
  const config: GeminiConfig = {};

  if (options.outputTokens != null) {
    config.maxOutputTokens = options.outputTokens;
  }

  if (options.randomness != null) {
    config.temperature = options.randomness;
  }

  if (options.thinking || options.thinkingBudget != null) {
    config.thinkingConfig = {};

    if (options.thinking) {
      config.thinkingConfig.includeThoughts = true;
    }

    if (options.thinkingBudget != null) {
      config.thinkingConfig.thinkingBudget = options.thinkingBudget;
    }
  }

  if (options.systemPrompt != null) {
    config.systemInstruction = options.systemPrompt;
  }

  return config;
}

async function chatLoop(
  chatSession: ChatSession,
  rl: Interface,
  initialText: string,
  options: ChatOptions,
): Promise<void> {
  let turnCount = 0;
  let currentInput = initialText;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    if (currentInput.trim() === "") {
      currentInput = await question(rl, "> ");
    }

    if (isExitCommand(currentInput)) {
      console.log("Goodbye!");
      break;
    }

    turnCount++;
    console.log(`\n[Turn ${turnCount}] User: ${currentInput}`);

    await sendMessage(chatSession, currentInput, turnCount, options);

    currentInput = await question(rl, "\n> ");
  }
}

async function sendMessage(
  chatSession: ChatSession,
  input: string,
  turnCount: number,
  options: ChatOptions,
): Promise<void> {
  const message = { message: input };
  const { stream, debug, verbose } = options;

  if (stream) {
    if (debug || verbose) debugCall("chat.sendMessageStream", message);
    const responseStream = await chatSession.sendMessageStream(message);

    console.log(`\n[Turn ${turnCount}] Assistant:`);
    await printStream(responseStream, { debug, verbose });
  } else {
    if (debug || verbose) debugCall("chat.sendMessage", message);
    const response = (await chatSession.sendMessage(message)) as GeminiResponse;

    console.log(`\n[Turn ${turnCount}] Assistant:`);

    if (debug || verbose) {
      debugResult(response, verbose);
    }

    console.log(formatResponse(response, input));
  }
}

async function printStream(
  stream: AsyncIterable<GeminiResponse>,
  options: { debug: boolean; verbose: boolean },
): Promise<void> {
  let inThought = false;

  for await (const chunk of stream) {
    if (options.debug || options.verbose) {
      console.log(DEBUG_SEPARATOR);
      console.log("Stream chunk");
      debugResult(chunk, options.verbose);
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
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

function startThought(text: string): string {
  return (
    "\n╔══════════════════════════════════════════════" +
    "═<THOUGHT>══════════════════════════════════════════════" +
    continueThought(text)
  );
}

function continueThought(text: string): string {
  return (
    "\n" +
    text
      .split("\n")
      .map((line) => `║ ${line}`)
      .join("\n")
  );
}

function endThought(): string {
  return (
    "\n╚══════════════════════════════════════════════" +
    "═<end_thought>══════════════════════════════════════════════\n\n"
  );
}

function truncate(
  str: string | undefined,
  maxLength: number,
  suffix = "…",
): string {
  if (!str || str.length <= maxLength) return str ?? "";
  const cutoff = Math.max(0, maxLength - suffix.length);

  return str.slice(0, cutoff) + suffix;
}

// ─────────────────────────────────────────────────────────────────────────────
// Debug helpers
// ─────────────────────────────────────────────────────────────────────────────

function debugResult(result: GeminiResponse, verbose: boolean): void {
  const { sdkHttpResponse, candidates, ...rest } = result;

  debugLog({
    ...(verbose ? { sdkHttpResponse } : {}),
    ...rest,
    candidates,
  });
}

function debugLog(object: unknown): void {
  console.log(inspect(object, { depth: 10 }), DEBUG_SEPARATOR);
}

function debugCall(funcName: string, args: unknown): void {
  console.log(`${funcName}(${inspect(args, { depth: 10 })})`, DEBUG_SEPARATOR);
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

function question(rl: Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function isExitCommand(input: string): boolean {
  const trimmed = input.trim().toLowerCase();

  return trimmed === "exit" || trimmed === "quit" || trimmed === "bye";
}
