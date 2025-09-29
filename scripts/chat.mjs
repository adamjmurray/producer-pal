#!/usr/bin/env node

import { GoogleGenAI } from "@google/genai";
import { Command } from "commander";
import { inspect } from "node:util";

const program = new Command();

const debugSeparator = "\n" + "-".repeat(80);

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
  .argument("<text...>", "Text to send to the model")
  .action(
    async (
      textArray,
      {
        model,
        debug,
        verbose,
        thinking,
        randomness,
        outputTokens,
        thinkingBudget,
      },
    ) => {
      const apiKey = process.env.GEMINI_KEY;

      if (!apiKey) {
        console.error("Error: GEMINI_KEY environment variable is required");
        process.exit(1);
      }

      const text = textArray.join(" ");

      try {
        const genAI = new GoogleGenAI({ apiKey });

        console.log(`Model: ${model}`);
        console.log(`Input: ${text}`);

        const config = {};
        const generateParams = {
          model,
          contents: [{ role: "user", parts: [{ text }] }],
          config,
        };

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

        if (debug || verbose) {
          console.log(inspect(generateParams, { depth: 5 }), debugSeparator);
        }

        const result = await genAI.models.generateContent(generateParams);

        console.log("Response:");
        if (debug || verbose) {
          const { sdkHttpResponse, candidates, ...rest } = result;
          console.log(
            inspect(
              { ...(verbose ? { sdkHttpResponse } : {}), ...rest, candidates },
              { depth: 5 },
            ),
            debugSeparator,
          );
        }
        console.log(
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
            .join("\n\n") ?? "<no content>",
        );
      } catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
      }
    },
  );

program.parse();
