/**
 * Evaluation session adapter - wraps chat-lib providers for evaluation
 */

import { GoogleGenAI, mcpToTool } from "@google/genai";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { connectMcp } from "../chat-lib/shared/mcp.ts";
import type { EvalProvider, TurnResult } from "./types.ts";

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
}

type ChatSession = ReturnType<GoogleGenAI["chats"]["create"]>;

/**
 * Session interface for evaluations
 */
export interface EvalSession {
  /** Send a message and get the response */
  sendMessage: (message: string, turnNumber: number) => Promise<TurnResult>;
  /** MCP client for state assertions */
  mcpClient: Client;
  /** Close the session */
  close: () => Promise<void>;
}

interface EvalSessionOptions {
  provider: EvalProvider;
  model?: string;
  instructions?: string;
}

/**
 * Create an evaluation session
 *
 * @param options - Session configuration
 * @returns Evaluation session with sendMessage and mcpClient
 */
export async function createEvalSession(
  options: EvalSessionOptions,
): Promise<EvalSession> {
  const { client: mcpClient } = await connectMcp();

  if (options.provider !== "gemini") {
    throw new Error(
      `Provider "${options.provider}" not yet implemented. Only "gemini" is supported.`,
    );
  }

  return await createGeminiSession(mcpClient, options);
}

/**
 * Create a Gemini-based evaluation session
 *
 * @param mcpClient - MCP client for tool calls
 * @param options - Session configuration
 * @returns Evaluation session
 */
async function createGeminiSession(
  mcpClient: Client,
  options: EvalSessionOptions,
): Promise<EvalSession> {
  const apiKey = process.env.GEMINI_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_KEY environment variable is required");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = options.model ?? "gemini-2.5-flash";

  const config: Record<string, unknown> = {
    tools: [mcpToTool(mcpClient)],
    automaticFunctionCalling: {},
  };

  if (options.instructions) {
    config.systemInstruction = options.instructions;
  }

  const chatSession = ai.chats.create({ model, config });

  return {
    mcpClient,
    sendMessage: (message: string, turnNumber: number) =>
      sendGeminiMessage(chatSession, message, turnNumber),
    close: async () => {
      await mcpClient.close();
    },
  };
}

/**
 * Send a message via Gemini and return structured result
 *
 * @param chatSession - The Gemini chat session
 * @param message - User message to send
 * @param turnNumber - Current turn number for logging
 * @returns Turn result with text and tool calls
 */
async function sendGeminiMessage(
  chatSession: ChatSession,
  message: string,
  turnNumber: number,
): Promise<TurnResult> {
  console.log(`\n[Turn ${turnNumber}] User: ${message}`);

  const response = (await chatSession.sendMessage({
    message,
  })) as GeminiResponse;

  const result = formatGeminiResponse(response);

  console.log(`[Turn ${turnNumber}] Assistant: ${result.text}`);

  if (result.toolCalls.length > 0) {
    console.log(
      `[Turn ${turnNumber}] Tools: ${result.toolCalls.map((t) => t.name).join(", ")}`,
    );
  }

  return result;
}

/**
 * Format Gemini response into TurnResult
 *
 * @param response - Raw Gemini response
 * @returns Formatted turn result
 */
function formatGeminiResponse(response: GeminiResponse): TurnResult {
  const toolCalls: TurnResult["toolCalls"] = [];
  const textParts: string[] = [];

  /**
   * Appends text content to the result
   *
   * @param t - Text to append
   */
  const appendText = (t: string): void => {
    textParts.push(t);
  };

  // Extract from automatic function calling history
  const history = response.automaticFunctionCallingHistory ?? [];

  for (const entry of history) {
    if (entry.role === "model") {
      processModelParts(entry.parts, toolCalls, appendText);
    }

    if (entry.role === "function") {
      processFunctionParts(entry.parts, toolCalls);
    }
  }

  // Extract final response from candidates
  const candidates = response.candidates ?? [];

  for (const candidate of candidates) {
    const parts = candidate.content?.parts ?? [];

    processModelParts(parts, toolCalls, appendText);
  }

  return { text: textParts.join("").trim(), toolCalls };
}

/**
 * Process model response parts
 *
 * @param parts - Response parts to process
 * @param toolCalls - Tool calls array to append to
 * @param appendText - Function to append text content
 */
function processModelParts(
  parts: ResponsePart[],
  toolCalls: TurnResult["toolCalls"],
  appendText: (text: string) => void,
): void {
  for (const part of parts) {
    if (part.text && !part.thought) {
      appendText(part.text);
    }

    if (part.functionCall) {
      toolCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args,
      });
    }
  }
}

/**
 * Process function response parts
 *
 * @param parts - Function response parts to process
 * @param toolCalls - Tool calls array to update with results
 */
function processFunctionParts(
  parts: ResponsePart[],
  toolCalls: TurnResult["toolCalls"],
): void {
  for (const part of parts) {
    if (part.functionResponse) {
      const lastCall = toolCalls.at(-1);

      if (lastCall && !lastCall.result) {
        const resultContent = part.functionResponse.response?.content;

        lastCall.result = resultContent?.[0]?.text ?? "";
      }
    }
  }
}
