// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Unified chat function using Vercel AI SDK streamText().
 * Replaces all provider-specific run*() functions.
 */

import { type ModelMessage, stepCountIs, streamText } from "ai";
import { type TokenUsage, toTokenUsage } from "#webui/chat/sdk/types.ts";
import { createMcpTools } from "./mcp.ts";
import { createProviderModel } from "./provider.ts";
import { formatAssistantLabel, printStepUsage } from "./shared/formatting.ts";
import { createMessageSource } from "./shared/message-source.ts";
import { createReadline, runChatLoop } from "./shared/readline.ts";
import { type ChatOptions, type TurnResult } from "./shared/types.ts";
import { processCliStream } from "./stream.ts";
import { buildProviderOptions } from "./thinking.ts";

const MAX_TOOL_STEPS = 10;
const DEFAULT_MAX_TOKENS = 8192;

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
  const { tools, mcpClient } = await createMcpTools();
  const providerOptions = buildProviderOptions(
    options.provider,
    options.thinking,
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
  const hasTools = Object.keys(tools).length > 0;
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

          const stepUsages: TokenUsage[] = [];

          const result = streamText({
            model,
            messages: sess.messages,
            tools: hasTools ? tools : undefined,
            stopWhen: stepCountIs(MAX_TOOL_STEPS),
            providerOptions,
            temperature: suppressTemperature
              ? undefined
              : sess.options.randomness,
            maxOutputTokens: sess.options.outputTokens ?? DEFAULT_MAX_TOKENS,
            system: sess.options.instructions,
            onStepFinish: (event) => {
              const usage = toTokenUsage(event.usage);
              const isTextStep = event.toolCalls.length === 0;

              stepUsages.push(usage);

              if (sess.options.usage) {
                printStepUsage(usage, prevUsage, isTextStep);
              }

              prevUsage = usage;
            },
          });

          const turnResult = await processCliStream(result, {
            showUsage: sess.options.usage,
          });

          // Append generated messages to history for multi-turn
          const response = await result.response;

          sess.messages.push(...response.messages);

          return { ...turnResult, stepUsages };
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("Error:", message);
    process.exit(1);
  } finally {
    rl.close();
    await mcpClient.close();
  }
}
