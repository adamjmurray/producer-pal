#!/usr/bin/env node

import { GoogleGenAI } from "@google/genai";
import { Command } from "commander";
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
  .argument("<text...>", "Text to send to the model")
  .action(async (textArray, { model, debug, verbose }) => {
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

      const result = await genAI.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text }] }],
      });

      console.log("Response:");
      if (debug || verbose) {
        const { sdkHttpResponse, candidates, ...rest } = result;
        console.log(
          inspect(
            { ...(verbose ? { sdkHttpResponse } : {}), ...rest, candidates },
            { depth: 5 },
          ),
          "\n" + "-".repeat(80),
        );
      }
      console.log(result.candidates[0]?.content?.parts[0]?.text);
    } catch (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  });

program.parse();
