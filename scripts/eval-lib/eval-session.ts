/**
 * Evaluation session adapter - wraps chat-lib providers for evaluation
 */

import { GoogleGenAI, mcpToTool } from "@google/genai";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { connectMcp } from "../chat-lib/shared/mcp.ts";
import { printGeminiStream } from "../shared/gemini-streaming.ts";
import type { GeminiResponse } from "../shared/gemini-types.ts";
import type { EvalProvider, TurnResult } from "./types.ts";

/** Default model for Gemini provider */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

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
  const model = options.model ?? DEFAULT_GEMINI_MODEL;

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
 * Send a message via Gemini with streaming output
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
  console.log(`[Turn ${turnNumber}] Assistant:`);

  const stream = await chatSession.sendMessageStream({ message });

  return await printGeminiStream(stream as AsyncIterable<GeminiResponse>);
}
