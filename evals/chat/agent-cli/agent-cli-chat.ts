// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The chat CLI's loop for the agent-CLI providers (claude-code, codex-code).
 *
 * Same shape as runChat() in ../chat.ts, but a turn is a spawned CLI
 * subprocess instead of an AI SDK stream, so the session owns the conversation
 * history and there is nothing to accumulate here.
 */

import { type EvalSession } from "#evals/scenarios/eval-session.ts";
import { formatAssistantLabel } from "../shared/formatting.ts";
import { createMessageSource } from "../shared/message-source.ts";
import { createReadline, runChatLoop } from "../shared/readline.ts";
import { type ChatOptions, type TurnResult } from "../shared/types.ts";
import { requireAgentCliTransport } from "./agent-cli-registry.ts";
import { createAgentCliSession } from "./agent-cli-session.ts";

export interface AgentCliChatOptions extends ChatOptions {
  /** Carried only so the ignored-flag warning can name it. */
  baseUrl?: string;
}

/** AI SDK knobs the spawned CLIs expose no equivalent for. */
const UNSUPPORTED_FLAGS: Array<[keyof AgentCliChatOptions, string]> = [
  ["thinking", "--thinking"],
  ["randomness", "--randomness"],
  ["outputTokens", "--output-tokens"],
  ["baseUrl", "--base-url"],
];

/**
 * Run an interactive chat session against a spawned agent CLI.
 *
 * @param initialText - Optional initial text to start the conversation
 * @param options - Chat configuration options
 */
export async function runAgentCliChat(
  initialText: string,
  options: AgentCliChatOptions,
): Promise<void> {
  const transport = requireAgentCliTransport(options.provider);
  const session = await createAgentCliSession(transport, {
    model: options.model,
    instructions: options.instructions,
    usage: options.usage,
    // The message source and the loop below print the preamble instead.
    logTurns: false,
  });

  const rl = createReadline();
  const messageSource = createMessageSource(rl, options, initialText);

  console.log(`Model: ${options.model}`);
  console.log(`Provider: ${options.provider}`);
  console.log(`Instructions: ${describeInstructions(options.instructions)}`);
  warnUnsupportedFlags(options);
  console.log("Starting conversation (type 'exit', 'quit', or 'bye' to end)\n");

  try {
    await runChatLoop(
      session,
      messageSource,
      { once: options.once },
      {
        sendMessage: async (
          sess: EvalSession,
          input: string,
          turnCount: number,
        ): Promise<TurnResult> => {
          // Only the label: the session prints the tool calls and the reply.
          console.log(`\n${formatAssistantLabel()}`);

          const result = await sess.sendMessage(input, turnCount);

          if (result.error != null) {
            process.exitCode = 1;
          }

          return result;
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("Error:", message);
    // Not process.exit(): that would skip the finally below and leave the
    // session's temp dir behind.
    process.exitCode = 1;
  } finally {
    rl.close();
    await session.close();
  }
}

/**
 * Describe which system instructions the session will run with.
 *
 * @param instructions - The -i value, or undefined when the flag was omitted
 * @returns A parenthesized phrase for the header line
 */
function describeInstructions(instructions: string | undefined): string {
  if (instructions == null) {
    return "(agent CLI default)";
  }

  return instructions === "" ? "(disabled)" : "(active)";
}

/**
 * Warn once about flags that do not reach a spawned CLI.
 *
 * @param options - The chat options as parsed from argv
 */
function warnUnsupportedFlags(options: AgentCliChatOptions): void {
  const ignored = UNSUPPORTED_FLAGS.filter(([key]) => options[key] != null).map(
    ([, flag]) => flag,
  );

  if (ignored.length > 0) {
    console.warn(
      `Warning: ${ignored.join(", ")} ignored — ${options.provider} runs a CLI subprocess that takes no such setting`,
    );
  }
}
