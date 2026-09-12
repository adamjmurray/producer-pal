// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Asks one probe question, over whichever transport the model needs.
 *
 * Both paths point at the same probe MCP server, so the schemas in context are
 * identical and only the model differs. Agent CLIs get a fresh session per
 * question — they own their conversation history, and reusing one would let an
 * earlier answer teach a later probe.
 */

import { generateText } from "ai";
import { createAgentCliSession } from "#evals/chat/agent-cli/agent-cli-session.ts";
import { requireAgentCliTransport } from "#evals/chat/agent-cli/agent-cli-registry.ts";
import { createMcpTools } from "#evals/chat/mcp.ts";
import { createProviderModel } from "#evals/chat/provider.ts";
import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";

/** Everything an ask needs that does not change between probes. */
export interface AskContext {
  /** The assembled skills blob, delivered as instructions. */
  skills: string;
  /** The probe MCP server publishing the real tool schemas. */
  mcpUrl: string;
  spec: ModelSpec;
}

/** Keeps replies short: probes match tokens, and length only adds cost. */
export const SYSTEM_SUFFIX =
  "\n\nAnswer the next question as briefly as possible. No preamble, no " +
  "explanation. Answer from what you already know here — do not call a tool.";

/**
 * Ask one question through the AI SDK, with MCP tools in context.
 *
 * @param question - The probe question
 * @param context - Skills, probe server URL, and model spec
 * @returns The model's reply text
 */
export async function askViaAiSdk(
  question: string,
  context: AskContext,
): Promise<string> {
  const { tools, mcpClient } = await createMcpTools(context.mcpUrl);

  try {
    const { text } = await generateText({
      model: createProviderModel(context.spec.provider, context.spec.model),
      instructions: context.skills + SYSTEM_SUFFIX,
      prompt: question,
      tools,
      // The schemas stay in context; the model just cannot answer by calling.
      toolChoice: "none",
    });

    return text;
  } finally {
    await mcpClient.close();
  }
}

/**
 * Ask one question through an agent CLI (codex, claude), over the same server.
 *
 * @param question - The probe question
 * @param context - Skills, probe server URL, and model spec
 * @returns The model's reply text
 */
export async function askViaAgentCli(
  question: string,
  context: AskContext,
): Promise<string> {
  const session = await createAgentCliSession(
    requireAgentCliTransport(context.spec.provider),
    {
      instructions: context.skills + SYSTEM_SUFFIX,
      mcpUrl: context.mcpUrl,
      model: context.spec.model,
    },
  );

  try {
    const result = await session.sendMessage(question, 0);

    return result.text;
  } finally {
    await session.close();
  }
}
