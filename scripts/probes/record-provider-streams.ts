#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Stream recorder: send a short prompt through the chat UI's real option
 * builders and provider factory, and save the raw server-sent events each
 * provider answers with. Use it to refresh the hand-built fixtures in
 * `webui/src/chat/sdk/tests/stream/` or to check one against a live API.
 *
 * Makes paid requests (a few cents at most per cell). Needs the same keys as
 * `provider-requests.ts` in the environment; nothing but the request URL,
 * body and the events is saved, never a header.
 *
 * Usage:
 *   node --env-file=.env scripts/probes/record-provider-streams.ts --route gemini
 *   node --env-file=.env scripts/probes/record-provider-streams.ts --route openai,anthropic --scenario tool
 *
 * Flags: --route anthropic,openai,gemini,mistral,openrouter,vercel,ollama,lmstudio
 *   (required)  --model <id> (default: the route's default model)
 *   --scenario text,tool (default both)  --level Default,Max,Off (default Default)
 *   --prompt <text> (replaces the scenario's prompt, e.g. a provider's test trigger)
 *   --max-output <tokens> (cap the answer, to bound the cost of a Max run)
 *   --out <dir> (default scratchpad/recorded-streams)
 *
 * Each file holds one HTTP response: `{ route, model, scenario, url, request,
 * events }`. `events` can be passed straight to the test harness's
 * `sseResponse()`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stepCountIs, streamText, tool, type LanguageModel } from "ai";
import { z } from "zod";
import {
  KEY_VARS,
  LOCAL_ROUTES,
  ROOT,
  loadChatBuilders,
  startModuleLoader,
} from "./chat-ui-loader.ts";

const LOCAL_MODEL = "local-model";
const PROMPTS: Record<string, string> = {
  text: "In one short sentence, say what 17 times 3 is.",
  tool: "What time is it? Use the get_time tool, then answer in one short sentence.",
};

/** One recorded HTTP response. */
interface Recording {
  url: string;
  request: unknown;
  events: unknown[];
}

/**
 * Read a flag's value from the command line.
 * @param argv - Arguments after the script name
 * @param flag - Flag name, such as `--route`
 * @returns The value, or null when the flag is absent
 */
function flagValue(argv: string[], flag: string): string | null {
  const i = argv.indexOf(flag);

  return i >= 0 ? (argv[i + 1] ?? null) : null;
}

/**
 * Read a comma-separated flag.
 * @param argv - Arguments after the script name
 * @param flag - Flag name, such as `--scenario`
 * @param fallback - Value when the flag is absent
 * @returns The listed values
 */
function listFlag(argv: string[], flag: string, fallback: string[]): string[] {
  return flagValue(argv, flag)?.split(",") ?? fallback;
}

/**
 * Parse server-sent events into the JSON objects on their `data:` lines. The
 * `[DONE]` marker is kept as that string; anything else that isn't JSON is
 * kept as text.
 * @param body - Whole response body
 * @returns One entry per event
 */
function parseEvents(body: string): unknown[] {
  return body
    .split(/\r?\n\r?\n/)
    .map((block) =>
      block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n"),
    )
    .filter((data) => data !== "")
    .map((data) => {
      try {
        return JSON.parse(data) as unknown;
      } catch {
        return data;
      }
    });
}

/**
 * The URL a fetch call targets.
 * @param input - First argument of `fetch`
 * @returns The URL as text
 */
function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}

/**
 * Parse a request body for saving.
 * @param body - The `init.body` passed to fetch
 * @returns Parsed JSON, or the text when it isn't JSON
 */
function parseBody(body: unknown): unknown {
  if (typeof body !== "string") {
    return null;
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

/**
 * Replace `fetch` with a wrapper that records each streaming response.
 * @param recordings - Receives one entry per response
 * @param realFetch - The original fetch
 */
function installRecorder(
  recordings: Recording[],
  realFetch: typeof fetch,
): void {
  /**
   * Forward the request, then record a copy of what came back.
   * @param input - Request URL
   * @param init - Request options
   * @returns The untouched response
   */
  globalThis.fetch = async (input, init) => {
    const response = await realFetch(input, init);
    const type = response.headers.get("content-type") ?? "";

    if (type.includes("text/event-stream")) {
      const url = new URL(requestUrl(input));

      url.searchParams.delete("key");
      recordings.push({
        url: url.toString(),
        request: parseBody(init?.body),
        events: parseEvents(await response.clone().text()),
      });
    }

    return response;
  };
}

/**
 * Run one prompt and drain the stream.
 * @param model - Language model
 * @param providerOptions - Options from the webui builder
 * @param scenario - `text` or `tool`
 * @param maxOutputTokens - Cap on the answer, or undefined for the default
 * @param prompt - Replaces the scenario's prompt
 */
async function runScenario(
  model: LanguageModel,
  providerOptions: unknown,
  scenario: string,
  maxOutputTokens?: number,
  prompt?: string,
): Promise<void> {
  const result = streamText({
    model,
    maxRetries: 0,
    maxOutputTokens,
    messages: [{ role: "user", content: prompt ?? PROMPTS[scenario] ?? "" }],
    tools:
      scenario === "tool"
        ? {
            get_time: tool({
              description: "Get the current time.",
              inputSchema: z.object({}),
              execute: () => "12:00",
            }),
          }
        : undefined,
    stopWhen: stepCountIs(3),
    providerOptions: providerOptions as never,
    onError: ({ error }) => {
      console.error(`  stream error: ${String(error)}`);
    },
  });

  for await (const part of result.stream) {
    void part;
  }
}

/**
 * Record every selected (route, scenario, level).
 * @returns Nothing; files are written and their paths printed
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const routes = flagValue(argv, "--route")?.split(",");

  if (routes == null) {
    console.error("Pass --route (see the usage in this file's header).");
    process.exit(1);
  }

  const scenarios = listFlag(argv, "--scenario", ["text", "tool"]);
  const levels = listFlag(argv, "--level", ["Default"]);
  const maxOutput = Number(flagValue(argv, "--max-output")) || undefined;
  const prompt = flagValue(argv, "--prompt") ?? undefined;
  const out =
    flagValue(argv, "--out") ?? join(ROOT, "scratchpad/recorded-streams");
  const { server, load } = await startModuleLoader();
  const { DEFAULT_MODELS } = (await load(
    "/webui/src/lib/constants/models.ts",
  )) as { DEFAULT_MODELS: Record<string, string> };
  const { buildProviderOptions, createProviderModel } =
    await loadChatBuilders(load);
  const realFetch = globalThis.fetch;

  mkdirSync(out, { recursive: true });

  for (const route of routes) {
    const keyVar = KEY_VARS.get(route);
    const key = keyVar == null ? "" : process.env[keyVar];

    if (keyVar != null && !key) {
      console.log(`${route}: skipped, ${keyVar} is not set`);
      continue;
    }

    const modelId =
      flagValue(argv, "--model") ??
      (LOCAL_ROUTES.includes(route)
        ? LOCAL_MODEL
        : (DEFAULT_MODELS[route] ?? ""));
    const model = createProviderModel(route, modelId, key ?? "");

    for (const level of levels) {
      for (const scenario of scenarios) {
        const recordings: Recording[] = [];

        installRecorder(recordings, realFetch);
        await runScenario(
          model,
          buildProviderOptions(route, level, modelId),
          scenario,
          maxOutput,
          prompt,
        ).catch((error: unknown) => {
          console.error(`  ${route} ${scenario} failed: ${String(error)}`);
        });
        globalThis.fetch = realFetch;

        for (const [i, recording] of recordings.entries()) {
          const name = `${route}-${modelId.replaceAll(/[^\w.-]/g, "_")}-${level}-${scenario}-${i + 1}.json`;
          const file = join(out, name);

          writeFileSync(
            file,
            `${JSON.stringify({ route, model: modelId, scenario, ...recording }, null, 2)}\n`,
          );
          console.log(`${file} (${recording.events.length} events)`);
        }
      }
    }
  }

  await server.close();
}

await main();
