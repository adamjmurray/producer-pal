#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later


import { Command } from "commander";
import { parseModelArg } from "#evals/shared/parse-model-arg.ts";
import { runAnthropic } from "./anthropic.ts";
import { runGemini } from "./gemini.ts";
import { runOpenAI } from "./openai/index.ts";
import { runOpenRouter } from "./openrouter/index.ts";
import type { ChatOptions } from "./shared/types.ts";

const program = new Command();

interface RawChatOptions extends Omit<ChatOptions, "provider" | "model"> {
  model: string;
}

program
  .name("chat")
  .description("Chat with AI providers")
  .showHelpAfterError(true)
  .requiredOption(
    "-m, --model <model>",
    "Model (e.g., claude-sonnet-4-5, google/gemini-2.0-flash)",
  )
  .option(
    "-a, --api <api>",
    "API style (chat, responses) - defaults: openai=responses, openrouter=chat",
  )
  .option("-n, --no-stream", "Disable streaming mode")
  .option("-d, --debug", "Debug mode (log all API responses)")
  .option(
    "-t, --thinking <level>",
    "Thinking/reasoning level (provider-specific)",
  )
  .option(
    "-T, --thinking-summary <level>",
    "Reasoning summary detail (auto, concise, detailed) - provider-specific",
    "auto",
  )
  .option(
    "-r, --randomness <number>",
    "Temperature (0.0-1.0)",
    Number.parseFloat,
  )
  .option("-o, --output-tokens <number>", "Max output tokens", Number.parseInt)
  .option("-i, --instructions <text>", "System instructions")
  .option("-1, --once", "Exit after generating one response")
  .option(
    "-s, --sequence <messages...>",
    "Multiple messages to send in sequence",
  )
  .option("-f, --file <path>", "File containing messages (one per line)")
  .argument("[text...]", "Initial text to start conversation")
  .action(async (textArray: string[], rawOptions: RawChatOptions) => {
    const initialText = textArray.join(" ");

    // Parse model argument to get provider and model
    const { provider, model } = parseModelArg(rawOptions.model);
    const options: ChatOptions = { ...rawOptions, provider, model };

    // Warn if --api is used with Anthropic/Google (only applies to openai/openrouter)
    if (
      options.api &&
      (options.provider === "anthropic" || options.provider === "google")
    ) {
      console.warn(
        `Warning: --api flag does not apply to ${options.provider} provider (ignored)`,
      );
    }

    switch (options.provider) {
      case "anthropic":
        await runAnthropic(initialText, options);
        break;
      case "google":
        await runGemini(initialText, options);
        break;
      case "openai":
        await runOpenAI(initialText, options);
        break;
      case "openrouter":
        await runOpenRouter(initialText, options);
        break;

      default: {
        const _exhaustiveCheck: never = options.provider;

        console.error(`Unknown provider: ${String(_exhaustiveCheck)}`);
        process.exit(1);
      }
    }
  });

program.parse();
