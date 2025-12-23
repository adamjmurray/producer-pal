#!/usr/bin/env node

import { Command } from "commander";
import { runGemini } from "./gemini.ts";

export interface ChatOptions {
  provider: string;
  model?: string;
  stream: boolean;
  debug: boolean;
  verbose: boolean;
  thinking: boolean;
  thinkingBudget?: number;
  randomness?: number;
  outputTokens?: number;
  systemPrompt?: string;
}

const program = new Command();

program
  .name("chat")
  .description("Chat with AI providers")
  .option(
    "--provider <provider>",
    "AI provider (gemini, openai, openrouter)",
    "gemini",
  )
  .option("-m, --model <model>", "Model to use")
  .option("-s, --stream", "Enable streaming mode")
  .option("-d, --debug", "Debug mode (log all output)")
  .option("-v, --verbose", "Verbose mode (debug + HTTP response details)")
  .option("-t, --thinking", "Enable thinking/reasoning tokens")
  .option("-b, --thinking-budget <number>", "Thinking token budget", parseInt)
  .option("-r, --randomness <number>", "Temperature (0.0-1.0)", parseFloat)
  .option("-o, --output-tokens <number>", "Max output tokens", parseInt)
  .option("-p, --system-prompt <text>", "System instructions")
  .argument("[text...]", "Initial text to start conversation")
  .action(async (textArray: string[], options: ChatOptions) => {
    const initialText = textArray.join(" ");

    switch (options.provider) {
      case "gemini":
        await runGemini(initialText, options);
        break;
      case "openai":
        console.error("OpenAI provider not yet implemented");
        process.exit(1);
        break;
      case "openrouter":
        console.error("OpenRouter provider not yet implemented");
        process.exit(1);
        break;
      default:
        console.error(`Unknown provider: ${options.provider}`);
        process.exit(1);
    }
  });

program.parse();
