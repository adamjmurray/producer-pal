#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command } from "commander";
import { parseModelArg } from "#evals/shared/parse-model-arg.ts";
import { runAiSdkChat } from "./ai-sdk-chat.ts";
import { type ChatOptions } from "./shared/types.ts";

const program = new Command();

interface RawChatOptions extends Omit<ChatOptions, "provider" | "model"> {
  model: string;
  baseUrl?: string;
}

program
  .name("chat")
  .description("Chat with AI providers")
  .showHelpAfterError(true)
  .requiredOption(
    "-m, --model <model>",
    "Model (e.g., claude-sonnet-4-5, google/gemini-2.0-flash)",
  )
  .option("-a, --api <api>", "(deprecated, ignored) API style")
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
  .option(
    "-b, --base-url <url>",
    "Base URL for local provider (default: http://localhost:11434/v1)",
  )
  .argument("[text...]", "Initial text to start conversation")
  .action(async (textArray: string[], rawOptions: RawChatOptions) => {
    const initialText = textArray.join(" ");

    // Parse model argument to get provider and model
    const { provider, model } = parseModelArg(rawOptions.model);
    const options: ChatOptions = { ...rawOptions, provider, model };

    // Apply --base-url to env so local provider picks it up
    if (rawOptions.baseUrl) {
      process.env.LOCAL_BASE_URL = rawOptions.baseUrl;
    }

    if (options.api) {
      console.warn(
        "Warning: --api flag is deprecated (AI SDK handles API selection internally)",
      );
    }

    await runAiSdkChat(initialText, options);
  });

program.parse();
