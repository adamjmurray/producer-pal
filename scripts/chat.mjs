#!/usr/bin/env node

import { GoogleGenAI } from "@google/genai";
import { Command } from "commander";
import { createInterface } from "node:readline";
import { inspect } from "node:util";

const debugSeparator = "\n" + "-".repeat(80);

const program = new Command();
program
  .name("chat")
  .description("Chat with Google Gemini API")
  .option("-m, --model <model>", "Gemini model to use", "gemini-2.5-flash-lite")
  .option("-s, --stream", "Enable streaming mode")
  .option("-d, --debug", "Debug mode (log all Gemini output)")
  .option(
    "-v, --verbose",
    "Verbose mode (debug mode with http response details)",
  )
  .option("-t, --thinking", "Enable includeThoughts")
  .option(
    "-b, --thinking-budget <number>",
    "Set thinkingBudget (0=disabled, -1=automatic)",
    parseInt,
  )
  .option("-r, --randomness <number>", "Set temperature (0.0-1.0)", parseFloat)
  .option("-o, --output-tokens <number>", "Set maxOutputTokens", parseInt)
  .option("-p, --system-prompt <text>", "Set system instructions")
  .argument("[text...]", "Optional text to start the conversation with")
  .action(chat);

// Run the program:
program.parse();

async function chat(
  textArray,
  {
    model,
    debug,
    verbose,
    thinking,
    randomness,
    outputTokens,
    thinkingBudget,
    stream,
    systemPrompt,
  },
) {
  const apiKey = process.env.GEMINI_KEY;

  if (!apiKey) {
    console.error("Error: GEMINI_KEY environment variable is required");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
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

  if (systemPrompt != null) {
    config.systemInstruction = systemPrompt;
  }

  let turnCount = 0;
  const initialText = textArray.length > 0 ? textArray.join(" ") : "";

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  if (debug || verbose) debugCall("ai.chats.create", { model, config });
  const chat = ai.chats.create({ model, config });

  console.log(`Model: ${model}`);
  console.log("Starting conversation (type 'exit', 'quit', or 'bye' to end)\n");

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

      if (stream) {
        const message = { message: currentInput };
        if (debug || verbose) debugCall("chat.sendMessageStream", message);
        const stream = await chat.sendMessageStream(message);
        console.log(`\n[Turn ${turnCount}] Assistant:`);
        await printStream(stream, { debug, verbose });
      } else {
        const message = { message: currentInput };
        if (debug || verbose) debugCall("chat.sendMessage", message);
        const response = await chat.sendMessage(message);

        console.log(`\n[Turn ${turnCount}] Assistant:`);
        if (debug || verbose) {
          debugResult(response, verbose);
        }
        console.log(formatResponse(response));
      }

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

async function printStream(stream, { debug, verbose }) {
  let inThought = false;
  for await (const chunk of stream) {
    if (debug || verbose) {
      console.log(debugSeparator);
      console.log("Stream chunk");
      debugResult(chunk, verbose);
    }
    for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
      if (part.text) {
        if (part.thought) {
          process.stdout.write(
            inThought ? continueThought(part.text) : startThought(part.text),
          );
          inThought = true;
        } else {
          if (inThought) {
            process.stdout.write(endThought());
            inThought = false;
          }
          process.stdout.write(part.text);
        }
      }
    }
  }
  console.log();
}

function isExitCommand(input) {
  const trimmed = input.trim().toLowerCase();
  return trimmed === "exit" || trimmed === "quit" || trimmed === "bye";
}

function formatResponse(result) {
  return (
    result.candidates[0]?.content?.parts
      ?.map(({ thought, text }) =>
        thought ? startThought(text) + endThought() : text,
      )
      .join("\n") ?? "<no content>"
  );
}

function startThought(text) {
  return (
    "\n╔════════════════════════════════════════════════" +
    "═<THOUGHT>════════════════════════════════════════════" +
    continueThought(text)
  );
}

function continueThought(text) {
  return (
    "\n" +
    text
      .split("\n")
      .map((line) => `║ ${line}`)
      .join("\n")
  );
}

function endThought() {
  return (
    "\n╚═══════════════════════════════════════════════" +
    "═<end_thought>════════════════════════════════════════════\n\n"
  );
}

function debugResult(result, verbose) {
  const { sdkHttpResponse, candidates, ...rest } = result;
  debugLog(
    {
      ...(verbose ? { sdkHttpResponse } : {}),
      ...rest,
      candidates,
    },
    { depth: 5 },
  );
}

function debugLog(object) {
  console.log(inspect(object, { depth: 5 }), debugSeparator);
}

function debugCall(funcName, args) {
  console.log(`${funcName}(${inspect(args, { depth: 5 })})`, debugSeparator);
}
