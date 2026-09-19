// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Evaluation session adapter — uses AI SDK for all providers.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type ModelMessage, stepCountIs, streamText } from "ai";
import { getAgentCliTransport } from "#evals/chat/agent-cli/agent-cli-registry.ts";
import { createAgentCliSession } from "#evals/chat/agent-cli/agent-cli-session.ts";
import { createMcpTools } from "#evals/chat/mcp.ts";
import { createProviderModel } from "#evals/chat/provider.ts";
import { processCliStream } from "#evals/chat/stream.ts";
import {
  ANTHROPIC_CONFIG,
  CLAUDE_CODE_CONFIG,
  CODEX_CODE_CONFIG,
  GEMINI_CONFIG,
  OPENAI_CONFIG,
  OPENROUTER_CONFIG,
} from "#evals/shared/provider-configs.ts";
import { MAX_TOOL_STEPS } from "#evals/shared/step-budget.ts";
import {
  type StepTiming,
  type TokenUsage,
  toStepTiming,
  toTokenUsage,
} from "#webui/chat/sdk/types.ts";
import { logTurnStart } from "./helpers/turn-logging.ts";
import {
  buildSeededMessages,
  type SeededTurn,
} from "./helpers/seed-connect/seeded-turn.ts";
import { type EvalProvider, type TurnResult } from "./types.ts";

const DEFAULT_MAX_TOKENS = 8192;

/**
 * Get the default model for a provider
 *
 * @param provider - The LLM provider
 * @returns Default model string for the provider
 */
export function getDefaultModel(provider: EvalProvider): string {
  switch (provider) {
    case "anthropic":
      return ANTHROPIC_CONFIG.defaultModel;
    case "claude-code":
      return CLAUDE_CODE_CONFIG.defaultModel;
    case "codex-code":
      return CODEX_CODE_CONFIG.defaultModel;
    case "google":
      return GEMINI_CONFIG.defaultModel;
    case "openai":
      return OPENAI_CONFIG.defaultModel;
    case "openrouter":
      return OPENROUTER_CONFIG.defaultModel;
    case "local":
      throw new Error(
        "No default model for local provider. Specify with -m local/model-name",
      );

    default: {
      const _exhaustiveCheck: never = provider;

      throw new Error(`Unknown provider: ${String(_exhaustiveCheck)}`);
    }
  }
}

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
  /** Append a pre-built turn to history without calling the model. Absent on
   *  transports that own their conversation state (the agent CLIs resume a
   *  session by id, so there is no history array to write into) — callers must
   *  fall back to a real `sendMessage` turn when this is undefined. */
  seedTurn?: (turn: SeededTurn) => void;
}

interface EvalSessionOptions {
  provider: EvalProvider;
  model?: string;
  instructions?: string;
  usage?: boolean;
}

/**
 * Create an evaluation session using AI SDK
 *
 * @param options - Session configuration
 * @returns Evaluation session with sendMessage and mcpClient
 */
export async function createEvalSession(
  options: EvalSessionOptions,
): Promise<EvalSession> {
  const agentCli = getAgentCliTransport(options.provider);

  if (agentCli != null) {
    return await createAgentCliSession(agentCli, {
      ...(options.model != null ? { model: options.model } : {}),
      ...(options.instructions != null
        ? { instructions: options.instructions }
        : {}),
      ...(options.usage != null ? { usage: options.usage } : {}),
    });
  }

  const model = createProviderModel(
    options.provider,
    options.model ?? getDefaultModel(options.provider),
  );
  const { tools, mcpClient, erroredToolCallIds } = await createMcpTools();
  const hasTools = Object.keys(tools).length > 0;
  const messages: ModelMessage[] = [];
  let prevUsage: TokenUsage | undefined;

  return {
    mcpClient,

    seedTurn: (turn: SeededTurn): void => {
      const toolCallId = `seeded-${turn.toolName}-${messages.length}`;

      messages.push(...buildSeededMessages(turn, toolCallId));
    },

    sendMessage: async (
      message: string,
      turnNumber: number,
    ): Promise<TurnResult> => {
      logTurnStart(turnNumber, message);
      messages.push({ role: "user", content: message });

      const stepUsages: TokenUsage[] = [];
      const stepTimings: StepTiming[] = [];

      const result = streamText({
        model,
        messages,
        tools: hasTools ? tools : undefined,
        stopWhen: stepCountIs(MAX_TOOL_STEPS),
        maxOutputTokens: DEFAULT_MAX_TOKENS,
        instructions: options.instructions,
        // Errors are rendered (in red) by processCliStream via the stream's
        // "error" part; suppress the SDK's default raw dump.
        onError: () => {},
        // The usage line itself is printed by processCliStream, off the
        // finish-step part that carries both usage and timings.
        onStepEnd: (event) => {
          stepUsages.push(toTokenUsage(event.usage));
          // Empty when nothing was measurable, so the two arrays stay aligned
          // and each rate keeps the step's output tokens as its weight.
          stepTimings.push(toStepTiming(event.performance) ?? {});
        },
      });

      const turnResult = await processCliStream(result, {
        showUsage: options.usage,
        prevUsage,
        erroredToolCallIds,
      });

      // Carry the last step's usage into the next turn so its "new content"
      // figure counts the user's next message.
      prevUsage = stepUsages.at(-1) ?? prevUsage;

      // On a stream error, result.responseMessages rejects; the error was already
      // shown by processCliStream. Skip history so the scenario can grade the miss.
      if (turnResult.error != null) {
        return { ...turnResult, stepUsages, stepTimings };
      }

      // Append generated messages to history for multi-turn. See the note in
      // evals/chat/chat.ts: responseMessages accumulates across every step,
      // while finalStep.response.messages holds only the last step's.
      messages.push(...(await result.responseMessages));

      return { ...turnResult, stepUsages, stepTimings };
    },

    close: async () => {
      await mcpClient.close();
    },
  };
}
