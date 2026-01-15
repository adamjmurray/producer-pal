#!/usr/bin/env node

import { Command } from "commander";
import { runGemini } from "./gemini.ts";
import { runOpenAI } from "./openai/index.ts";
import { runOpenRouter } from "./openrouter/index.ts";
import type { ChatOptions } from "./shared/types.ts";

const program = new Command();

program
  .name("chat")
  .description("Chat with AI providers")
  .showHelpAfterError(true)
  .requiredOption(
    "--provider <provider>",
    "AI provider (gemini, openai, openrouter)",
  )
  .option(
    "--api <api>",
    "API style (chat, responses) - defaults: openai=responses, openrouter=chat",
  )
  .option("-m, --model <model>", "Model to use")
  .option("-s, --stream", "Enable streaming mode")
  .option("-d, --debug", "Debug mode (log all API responses)")
  .option(
    "-t, --thinking <level>",
    "Thinking/reasoning level (provider-specific)",
  )
  .option(
    "--thinking-summary <level>",
    "Reasoning summary detail (auto, concise, detailed) - provider-specific",
    "auto",
  )
  .option(
    "-r, --randomness <number>",
    "Temperature (0.0-1.0)",
    Number.parseFloat,
  )
  .option("-o, --output-tokens <number>", "Max output tokens", Number.parseInt)
  .option("-p, --system-prompt <text>", "System instructions")
  .option("--single-response", "Exit after generating one response")
  .argument("[text...]", "Initial text to start conversation")
  .action(async (textArray: string[], options: ChatOptions) => {
    const initialText = textArray.join(" ");

    // Warn if --api is used with Gemini (only applies to openai/openrouter)
    if (options.api && options.provider === "gemini") {
      console.warn(
        `Warning: --api flag does not apply to Gemini provider (ignored)`,
      );
    }

    switch (options.provider) {
      case "gemini":
        await runGemini(initialText, options);
        break;
      case "openai":
        await runOpenAI(initialText, options);
        break;
      case "openrouter":
        await runOpenRouter(initialText, options);
        break;
      default:
        console.error(`Unknown provider: ${options.provider}`);
        process.exit(1);
    }
  });

program.parse();
