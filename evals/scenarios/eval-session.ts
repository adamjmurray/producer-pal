// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Codex (OpenAI)
// SPDX-License-Identifier: MIT

/**
 * Evaluation session adapter — uses AI SDK for all providers.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type ModelMessage } from "ai";
import { getAgentCliTransport } from "#evals/chat/agent-cli/agent-cli-registry.ts";
import { createAgentCliSession } from "#evals/chat/agent-cli/agent-cli-session.ts";
import { createMcpTools } from "#evals/chat/mcp.ts";
import { createProviderModel } from "#evals/chat/provider.ts";
import { runModelTurn } from "#evals/chat/shared/model-turn.ts";
import { PROVIDER_CONFIGS } from "#evals/shared/provider-configs.ts";
import { type TokenUsage } from "#webui/chat/sdk/types.ts";
import { logTurnStart } from "./helpers/turn-logging.ts";
import {
  buildSeededMessages,
  type SeededTurn,
} from "./helpers/seed-connect/seeded-turn.ts";
import { type EvalProvider, type TurnResult } from "./types.ts";

/**
 * Get the default model for a provider
 *
 * @param provider - The LLM provider
 * @returns Default model string for the provider
 */
export function getDefaultModel(provider: EvalProvider): string {
  const { defaultModel } = PROVIDER_CONFIGS[provider];

  if (!defaultModel) {
    throw new Error(
      `No default model for ${provider} provider. Specify with -m ${provider}/model-name`,
    );
  }

  return defaultModel;
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
  /** MCP endpoint to use instead of the real one (a tool-override proxy). */
  mcpUrl?: string;
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
      ...(options.mcpUrl != null ? { mcpUrl: options.mcpUrl } : {}),
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
  const { tools, mcpClient, erroredToolCallIds } = await createMcpTools(
    options.mcpUrl,
  );
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

      const turn = await runModelTurn({
        model,
        messages,
        tools,
        erroredToolCallIds,
        prevUsage,
        showUsage: options.usage,
        instructions: options.instructions,
      });

      prevUsage = turn.lastUsage;
      messages.push(...turn.responseMessages);

      return {
        ...turn.turnResult,
        stepUsages: turn.stepUsages,
        stepTimings: turn.stepTimings,
      };
    },

    close: async () => {
      await mcpClient.close();
    },
  };
}
