#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command } from "commander";
import "#evals/shared/install-fetch-dispatcher.ts";
import {
  type AgentCliChatOptions,
  runAgentCliChat,
} from "#evals/chat/agent-cli/agent-cli-chat.ts";
import { getAgentCliTransport } from "#evals/chat/agent-cli/agent-cli-registry.ts";
import { listModels } from "#evals/shared/list-models.ts";
import {
  LIST_MODELS_HINT,
  parseModelArgOrExit,
} from "#evals/shared/parse-model-arg.ts";
import { SYSTEM_INSTRUCTION } from "#src/shared/config.ts";
import { runChat } from "./chat.ts";
import { collapseStdoutNewlines } from "./shared/collapse-stdout-newlines.ts";
import { type ChatOptions } from "./shared/types.ts";

collapseStdoutNewlines();

const program = new Command();

interface RawChatOptions extends Omit<ChatOptions, "provider" | "model"> {
  model?: string | boolean;
  listModels?: string | boolean;
  baseUrl?: string;
}

program
  .name("chat")
  .description("Chat with AI providers")
  .showHelpAfterError(true)
  .option(
    "-m, --model [model]",
    "Model as provider/model (e.g., google/gemini-3.8-flash). The provider can be omitted for claude-*, gpt-* and gemini-* models (e.g., claude-sonnet-5)",
  )
  .option(
    "--list-models [provider]",
    "List models for a provider (omit to list providers), then exit without chatting",
  )
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
  .option(
    "-i, --instructions <text>",
    'System instructions (default: built-in, "" to disable)',
  )
  .option("-1, --once", "Exit after generating one response")
  .option(
    "-s, --sequence <messages...>",
    "Multiple messages to send in sequence",
  )
  .option("-f, --file <path>", "File containing messages (one per line)")
  .option("-u, --usage", "Show per-step token usage")
  .option(
    "-b, --base-url <url>",
    "Base URL for local provider (default: http://localhost:11434/v1)",
  )
  .argument("[text...]", "Initial text to start conversation")
  .action(async (textArray: string[], rawOptions: RawChatOptions) => {
    // Apply --base-url to env so local provider picks it up
    if (rawOptions.baseUrl) {
      process.env.LOCAL_BASE_URL = rawOptions.baseUrl;
    }

    if (rawOptions.listModels != null) {
      process.exit(
        await listModels(rawOptions.listModels, {
          baseUrl: rawOptions.baseUrl,
        }),
      );
    }

    const modelArg =
      typeof rawOptions.model === "string" ? rawOptions.model : "";

    if (!modelArg) {
      program.error(
        `required option '-m, --model <model>' not specified. ${LIST_MODELS_HINT}`,
      );
    }

    const initialText = textArray.join(" ");

    const { provider, model } = parseModelArgOrExit(program, modelArg);

    // The agent-CLI providers run through a spawned subprocess, not the AI SDK
    // this CLI streams from, so they get their own loop.
    const isAgentCli = getAgentCliTransport(provider) != null;
    // Undefined lets the agent-CLI session use its own prompt, written for a
    // CLI that replaces its agent prompt with it. An explicit -i still wins,
    // including -i "" to disable.
    const instructions = isAgentCli
      ? rawOptions.instructions
      : (rawOptions.instructions ?? SYSTEM_INSTRUCTION);
    // Typed wider than ChatOptions so the agent-CLI loop can see --base-url
    // and name it among the flags it ignores.
    const options: AgentCliChatOptions = {
      ...rawOptions,
      provider,
      model,
      instructions,
    };

    if (isAgentCli) {
      await runAgentCliChat(initialText, options);

      return;
    }

    await runChat(initialText, options);
  });

program.parse();
