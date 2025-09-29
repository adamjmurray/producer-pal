#!/usr/bin/env node

import { GoogleGenAI } from "@google/genai";
import { Command } from "commander";
import { createInterface } from "node:readline";
import { inspect } from "node:util";

const program = new Command();
program
  .name("chat")
  .description("Chat with Google Gemini API")
  .option("-m, --model <model>", "Gemini model to use", "gemini-2.5-flash-lite")
  .option("-d, --debug", "Debug mode (log all Gemini output)")
  .option(
    "-v, --verbose",
    "Verbose mode (debug mode with http response details)",
  )
  .option("-t, --thinking", "Enable includeThoughts")
  .option("-r, --randomness <number>", "Set temperature (0.0-1.0)", parseFloat)
  .option("-o, --output-tokens <number>", "Set maxOutputTokens", parseInt)
  .option(
    "-b, --thinking-budget <number>",
    "Set thinkingBudget (0=disabled, -1=automatic)",
    parseInt,
  )
  .argument("[text...]", "Optional text to start the conversation with")
  .action(chat);

// Run the program:
program.parse();

async function chat(
  textArray,
  { model, debug, verbose, thinking, randomness, outputTokens, thinkingBudget },
) {
  const apiKey = process.env.GEMINI_KEY;

  if (!apiKey) {
    console.error("Error: GEMINI_KEY environment variable is required");
    process.exit(1);
  }

  const genAI = new GoogleGenAI({ apiKey });
  const config = {};

  if (outputTokens != null) {
    config.maxOutputTokens = outputTokens;
  }

  if (randomness != null) {
    config.temperature = randomness;
  }

  if (thinking || thinkingBudget != null) {
    config.thinkingConfig = {};
    if (thinking) {
      config.thinkingConfig.includeThoughts = true;
    }
    if (thinkingBudget != null) {
      config.thinkingConfig.thinkingBudget = thinkingBudget;
    }
  }

  const contents = [];
  const initialText = textArray.length > 0 ? textArray.join(" ") : "";

  console.log(`Model: ${model}`);
  console.log("Starting conversation (type 'exit', 'quit', or 'bye' to end)\n");

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let turnCount = 0;

  try {
    let currentInput = initialText;

    while (true) {
      if (currentInput.trim() === "") {
        currentInput = await new Promise((resolve) =>
          rl.question("> ", resolve),
        );
      }

      if (isExitCommand(currentInput)) {
        console.log("Goodbye!");
        break;
      }

      turnCount++;
      console.log(`\n[Turn ${turnCount}] User: ${currentInput}`);

      contents.push({ role: "user", parts: [{ text: currentInput }] });

      const generateParams = {
        model,
        contents,
        config,
      };

      if (debug || verbose) {
        console.log(inspect(generateParams, { depth: 5 }), debugSeparator);
      }

      const result = await genAI.models.generateContent(generateParams);

      console.log(`\n[Turn ${turnCount}] Assistant:`);
      if (debug || verbose) {
        debugResult(result, verbose);
      }

      console.log(formatResponse(result));

      contents.push(result.candidates[0]?.content || { parts: [] });

      currentInput = await new Promise((resolve) =>
        rl.question("\n> ", resolve),
      );
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

function isExitCommand(input) {
  const trimmed = input.trim().toLowerCase();
  return trimmed === "exit" || trimmed === "quit" || trimmed === "bye";
}

function formatResponse(result) {
  return (
    result.candidates[0]?.content?.parts
      ?.map(({ thought, text }) =>
        thought
          ? `╔═══════════════════════════════════════════<THOUGHT>══════════════════════════════════════════\n${text
              .split("\n")
              .map((line) => `║ ${line}`)
              .join(
                "\n",
              )}\n╚═══════════════════════════════════════════════════════════════════════════════════════════════════`
          : text,
      )
      .join("\n\n") ?? "<no content>"
  );
}

const debugSeparator = "\n" + "-".repeat(80);

function debugResult(result, verbose) {
  const { sdkHttpResponse, candidates, ...rest } = result;
  console.log(
    inspect(
      {
        ...(verbose ? { sdkHttpResponse } : {}),
        ...rest,
        candidates,
      },
      { depth: 5 },
    ),
    debugSeparator,
  );
}
