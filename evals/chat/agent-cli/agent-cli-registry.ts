// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Which eval providers are backed by a spawned agent CLI rather than the AI SDK.
 *
 * The place to ask "is this an AI SDK model or a subprocess?" — adding a CLI is
 * one entry here plus its protocol module. Not the only mention of a CLI provider
 * name, though: a few exhaustive `switch`es still name providers individually to
 * get the compiler's `never` check on the last branch, and those need the new case
 * added by hand.
 */

import { type EvalProvider } from "#evals/scenarios/types.ts";
import { CLAUDE_CODE_TRANSPORT } from "../claude-code/claude-code-protocol.ts";
import { CODEX_CLI_TRANSPORT } from "../codex/codex-cli-protocol.ts";
import { type AgentCliTransport } from "./agent-cli-transport.ts";

const AGENT_CLI_TRANSPORTS: Partial<Record<EvalProvider, AgentCliTransport>> = {
  "claude-code": CLAUDE_CODE_TRANSPORT,
  "codex-code": CODEX_CLI_TRANSPORT,
};

/**
 * Look up the agent-CLI transport backing a provider.
 *
 * @param provider - The eval provider
 * @returns Its transport, or undefined when the provider runs through the AI SDK
 */
export function getAgentCliTransport(
  provider: EvalProvider,
): AgentCliTransport | undefined {
  return AGENT_CLI_TRANSPORTS[provider];
}

/**
 * Require the agent-CLI transport backing a provider.
 *
 * @param provider - The eval provider
 * @returns Its transport
 * @throws Error when the provider is not backed by an agent CLI
 */
export function requireAgentCliTransport(
  provider: EvalProvider,
): AgentCliTransport {
  const transport = AGENT_CLI_TRANSPORTS[provider];

  if (transport == null) {
    throw new Error(`Provider "${provider}" has no agent CLI transport.`);
  }

  return transport;
}
