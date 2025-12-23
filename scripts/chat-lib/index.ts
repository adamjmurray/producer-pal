#!/usr/bin/env node

import { Command } from "commander";
import { runGemini } from "./gemini.ts";
import { runOpenAI } from "./openai.ts";
import { runOpenRouter } from "./openrouter.ts";
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
  .option("--api <api>", "API style for OpenRouter (chat, responses)", "chat")
  .option("-m, --model <model>", "Model to use")
  .option("-s, --stream", "Enable streaming mode")
  .option("-d, --debug", "Debug mode (log all output)")
  .option("-v, --verbose", "Verbose mode (debug + HTTP response details)")
  .option(
    "-t, --thinking <level>",
    "Thinking/reasoning level (provider-specific)",
  )
  .option("-r, --randomness <number>", "Temperature (0.0-1.0)", parseFloat)
  .option("-o, --output-tokens <number>", "Max output tokens", parseInt)
  .option("-p, --system-prompt <text>", "System instructions")
  .argument("[text...]", "Initial text to start conversation")
  .action(async (textArray: string[], options: ChatOptions) => {
    const initialText = textArray.join(" ");

    // Warn if --api is used with non-OpenRouter providers
    if (
      options.api &&
      options.api !== "chat" &&
      options.provider !== "openrouter"
    ) {
      console.warn(
        `Warning: --api flag only applies to OpenRouter provider (ignored for ${options.provider})`,
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
