// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Unified chat function using Vercel AI SDK streamText().
 * Replaces all provider-specific run*() functions.
 */

import { type ModelMessage } from "ai";
import { type TokenUsage } from "#webui/chat/sdk/types.ts";
import { createMcpTools } from "./mcp.ts";
import { createProviderModel } from "./provider.ts";
import { formatAssistantLabel } from "./shared/formatting.ts";
import { createMessageSource } from "./shared/message-source.ts";
import { runModelTurn } from "./shared/model-turn.ts";
import { createReadline, runChatLoop } from "./shared/readline.ts";
import { type ChatOptions, type TurnResult } from "./shared/types.ts";
import { buildProviderOptions } from "./thinking-provider-options.ts";
import { errorMessage } from "#src/shared/error-message.ts";

interface ChatSession {
  messages: ModelMessage[];
  options: ChatOptions;
}

/**
 * Run an interactive chat session using the AI SDK.
 * All providers are handled through a single streamText() code path.
 *
 * @param initialText - Optional initial text to start the conversation
 * @param options - Chat configuration options
 */
export async function runChat(
  initialText: string,
  options: ChatOptions,
): Promise<void> {
  const model = createProviderModel(options.provider, options.model);
  const { tools, mcpClient, erroredToolCallIds } = await createMcpTools();
  const providerOptions = buildProviderOptions(
    options.provider,
    options.thinking,
    options.model,
  );

  const rl = createReadline();
  const messageSource = createMessageSource(rl, options, initialText);

  console.log(`Model: ${options.model}`);
  console.log(`Provider: ${options.provider}`);

  if (options.instructions) {
    console.log("Instructions: (active)");
  }

  console.log("Starting conversation (type 'exit', 'quit', or 'bye' to end)\n");

  const session: ChatSession = { messages: [], options };
  let prevUsage: TokenUsage | undefined;

  try {
    await runChatLoop(
      session,
      messageSource,
      { once: options.once },
      {
        sendMessage: async (
          sess: ChatSession,
          input: string,
        ): Promise<TurnResult> => {
          sess.messages.push({ role: "user", content: input });
          console.log(`\n${formatAssistantLabel()}`);

          const suppressTemperature =
            providerOptions?.anthropic?.thinking != null ||
            providerOptions?.openai?.reasoningEffort != null;

          const turn = await runModelTurn({
            model,
            messages: sess.messages,
            tools,
            erroredToolCallIds,
            prevUsage,
            showUsage: sess.options.usage,
            instructions: sess.options.instructions,
            providerOptions,
            temperature: suppressTemperature
              ? undefined
              : sess.options.randomness,
            maxOutputTokens: sess.options.outputTokens,
          });

          prevUsage = turn.lastUsage;

          // The error was already shown by processCliStream: flag a non-zero
          // exit and keep the failed turn out of the history.
          if (turn.turnResult.error != null) {
            process.exitCode = 1;
          }

          sess.messages.push(...turn.responseMessages);

          return { ...turn.turnResult, stepUsages: turn.stepUsages };
        },
      },
    );
  } catch (error) {
    const message = errorMessage(error);

    console.error("Error:", message);
    process.exit(1);
  } finally {
    rl.close();
    await mcpClient.close();
  }
}
