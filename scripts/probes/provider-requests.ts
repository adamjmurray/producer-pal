#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Provider request probe: build the request the chat UI sends for every
 * (route, model, thinking level) and show the exact wire body. The real webui
 * builders run (`buildProviderOptions`, the provider factory and its request
 * rewrite) under AI SDK `streamText`; only `fetch` is stubbed.
 *
 * Stub-only by default (no network, no keys needed). `--real` sends each
 * distinct body to the provider and prints the HTTP status, error text and any
 * SDK warnings. Re-run it when a model list changes.
 *
 * Usage:
 *   node scripts/probes/provider-requests.ts                    # stub, all cells
 *   node scripts/probes/provider-requests.ts --route anthropic --level Off
 *   node --env-file=.env scripts/probes/provider-requests.ts --real --route openai
 *
 * Flags (comma lists allowed): --route anthropic,openai,gemini,mistral,
 *   openrouter,vercel,ollama,lmstudio  --model <substring>  --exclude <substring>  --level Default,Max,Off
 *   --real  --evals (use the evals CLI builders and levels off..ultra)
 *   --tools (add a dummy tool)  --max-tokens N  --dump (full bodies)
 *
 * Keys come from the environment (.env) and are never printed.
 */

import { fileURLToPath } from "node:url";
import { stepCountIs, streamText, tool, type LanguageModel } from "ai";
import { createServer } from "vite";
import { z } from "zod";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const KEY_VARS = new Map([
  ["anthropic", "ANTHROPIC_KEY"],
  ["openai", "OPENAI_KEY"],
  ["gemini", "GEMINI_KEY"],
  ["mistral", "MISTRAL_KEY"],
  ["openrouter", "OPENROUTER_KEY"],
  ["vercel", "VERCEL_AI_GATEWAY_KEY"],
]);
const LOCAL_ROUTES = ["ollama", "lmstudio"];
const LOCAL_MODELS: Record<string, string[]> = { lmstudio: ["local-model"] };
const LEVELS = ["Default", "Max", "Off"];
const EVAL_LEVELS = ["off", "low", "medium", "high", "ultra"];
const EVAL_ROUTES: Record<string, string> = { gemini: "google" };
const REAL_MAX_TOKENS = 16;
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
// Stand-in for OpenRouter's public model list, so Off resolves in stub mode.
// Models not listed here (e.g. z-ai/glm-5.3) behave as unknown ones.
const STUB_OPENROUTER_MODELS = {
  data: [
    { id: "anthropic/claude-sonnet-5.5", reasoning: { mandatory: true } },
    { id: "google/gemini-3.8-flash", reasoning: { mandatory: true } },
    {
      id: "deepseek/deepseek-v4.1-flash-1017",
      reasoning: { mandatory: false },
    },
    { id: "moonshotai/kimi-k3", reasoning: { mandatory: false } },
    { id: "poolside/laguna-xs-2.1:free", reasoning: { mandatory: false } },
  ],
};

interface Args {
  routes: string[] | null;
  model: string | null;
  exclude: string | null;
  levels: string[];
  real: boolean;
  tools: boolean;
  evals: boolean;
  dump: boolean;
  maxTokens: number | null;
}

interface Captured {
  url: string;
  body: unknown;
}

/**
 * Parse the command line.
 * @param argv - Arguments after the script name
 * @returns Parsed flags
 */
function parseArgs(argv: string[]): Args {
  const value = (flag: string): string | null => {
    const i = argv.indexOf(flag);

    return i >= 0 ? (argv[i + 1] ?? null) : null;
  };

  const list = (flag: string): string[] | null =>
    value(flag)?.split(",") ?? null;
  const real = argv.includes("--real");
  const maxTokens = value("--max-tokens");

  return {
    routes: list("--route"),
    model: value("--model"),
    exclude: value("--exclude"),
    evals: argv.includes("--evals"),
    levels:
      list("--level") ?? (argv.includes("--evals") ? EVAL_LEVELS : LEVELS),
    real,
    tools: argv.includes("--tools"),
    dump: argv.includes("--dump"),
    maxTokens: maxTokens ? Number(maxTokens) : real ? REAL_MAX_TOKENS : null,
  };
}

/**
 * Shorten long strings so a request body fits on a few lines.
 * @param _key - JSON key (unused)
 * @param value - JSON value
 * @returns The value, with long strings cut
 */
function elide(_key: string, value: unknown): unknown {
  return typeof value === "string" && value.length > 28
    ? `${value.slice(0, 24)}...`
    : value;
}

/**
 * Turn a fetch request body into parsed JSON (or the raw text).
 * @param body - The `init.body` passed to fetch
 * @returns Parsed JSON, or the string as is
 */
function parseBody(body: unknown): unknown {
  if (typeof body !== "string") {
    return String(body);
  }

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

/**
 * Describe a thrown provider error: HTTP status plus the provider's message.
 * @param error - Error from the stream
 * @returns Short text such as `HTTP 400 ... message`
 */
function describeError(error: unknown): string {
  const e = error as {
    statusCode?: number;
    message?: string;
    responseBody?: string;
  };
  let text = e.message ?? String(error);

  if (e.responseBody) {
    try {
      const parsed = JSON.parse(e.responseBody) as {
        error?: { message?: string };
        message?: string;
      };

      text = parsed.error?.message ?? parsed.message ?? text;
    } catch {
      text = e.responseBody;
    }
  }

  return `HTTP ${e.statusCode ?? "?"} ${text}`
    .replaceAll(/\s+/g, " ")
    .slice(0, 400);
}

/**
 * Run one streamText call and report what happened.
 * @param model - Language model to call
 * @param providerOptions - Options from the webui builder
 * @param args - Parsed flags
 * @returns Status text and any SDK warnings
 */
async function runCall(
  model: LanguageModel,
  providerOptions: unknown,
  args: Args,
): Promise<{ status: string; warnings: unknown[] }> {
  const errors: unknown[] = [];
  const result = streamText({
    model,
    maxRetries: 0,
    instructions: "Reply with one word.",
    messages: [{ role: "user", content: "Say hi." }],
    tools: args.tools
      ? {
          get_time: tool({
            description: "Get the time.",
            inputSchema: z.object({}),
            execute: () => "12:00",
          }),
        }
      : undefined,
    stopWhen: stepCountIs(1),
    providerOptions: providerOptions as never,
    ...(args.maxTokens == null ? {} : { maxOutputTokens: args.maxTokens }),
    onError: ({ error }) => {
      errors.push(error);
    },
  });

  let reasoningParts = 0;
  let text = "";

  try {
    for await (const part of result.stream) {
      if (part.type === "reasoning-delta") {
        reasoningParts++;
      } else if (part.type === "text-delta") {
        text += part.text;
      }
    }
  } catch (error) {
    errors.push(error);
  }

  const usage = await Promise.resolve(result.usage).catch(() => null);
  const warnings =
    (await Promise.resolve(result.warnings).catch(() => [])) ?? [];
  const reasoningTokens = usage?.outputTokenDetails.reasoningTokens;

  return {
    status:
      errors.length > 0
        ? describeError(errors[0])
        : `HTTP 200 ok | reasoning parts=${reasoningParts} tokens=${reasoningTokens ?? "?"} | text=${JSON.stringify(text.slice(0, 40))}`,
    warnings,
  };
}

/**
 * List the (route, model) pairs to probe from the webui model lists.
 * @param presets - `PROVIDER_MODELS` from webui
 * @param args - Parsed flags
 * @returns Pairs, in route order
 */
function listTargets(
  presets: Record<string, Array<{ value: string; kind?: string }>>,
  args: Args,
): Array<{ route: string; model: string }> {
  const routes = [...KEY_VARS.keys(), ...LOCAL_ROUTES].filter(
    (r) => args.routes == null || args.routes.includes(r),
  );

  return routes.flatMap((route) => {
    const models =
      LOCAL_MODELS[route] ??
      (presets[route] ?? [])
        .filter((m) => m.kind !== "realtime" && m.value !== "OTHER")
        .map((m) => m.value);

    return models
      .filter((m) => args.model == null || m.includes(args.model))
      .filter((m) => args.exclude == null || !m.includes(args.exclude))
      .map((model) => ({ route, model }));
  });
}

/**
 * Load the request builders under test: the chat UI's, or with `--evals` the
 * evals CLI's (its own thinking levels and provider factory).
 * @param load - Vite module loader
 * @param evals - True to load the evals builders
 * @returns One option builder and one model factory
 */
async function loadBuilders(
  load: (path: string) => Promise<unknown>,
  evals: boolean,
): Promise<{
  buildOptions: (route: string, level: string, model: string) => unknown;
  createModel: (route: string, model: string, key: string) => LanguageModel;
}> {
  if (evals) {
    const { buildProviderOptions } = (await load(
      "/evals/chat/thinking-provider-options.ts",
    )) as { buildProviderOptions: (...a: string[]) => unknown };
    const { createProviderModel } = (await load("/evals/chat/provider.ts")) as {
      createProviderModel: (...a: string[]) => LanguageModel;
    };
    const evalRoute = (r: string): string => EVAL_ROUTES[r] ?? r;

    for (const name of KEY_VARS.values()) {
      process.env[name] ??= "stub-key";
    }

    return {
      buildOptions: (route, level, model) =>
        buildProviderOptions(evalRoute(route), level, model),
      createModel: (route, model) =>
        createProviderModel(evalRoute(route), model),
    };
  }

  const { buildProviderOptions } = (await load(
    "/webui/src/chat/sdk/provider/provider-options.ts",
  )) as { buildProviderOptions: (...a: string[]) => unknown };
  const { createProviderModel } = (await load(
    "/webui/src/chat/sdk/provider/provider-factories.ts",
  )) as { createProviderModel: (...a: string[]) => LanguageModel };

  return {
    buildOptions: buildProviderOptions,
    createModel: createProviderModel,
  };
}

/** Shared state for one probe run. */
interface Run {
  args: Args;
  builders: Awaited<ReturnType<typeof loadBuilders>>;
  /** Last request the stub fetch saw. */
  captured: Captured | null;
  /** True while a call should go to the network. */
  live: boolean;
  /** Real-call result per distinct (route, model, body). */
  sent: Map<string, string>;
  realCalls: number;
}

/**
 * Replace `fetch` with a stub that records the request, and either answers
 * with a fake error or (while `run.live`) forwards to the network.
 * @param run - Run state to record into
 * @param realFetch - The original fetch
 */
function installFetchStub(run: Run, realFetch: typeof fetch): void {
  /**
   * Record the request, then answer it as described above. The OpenRouter
   * model-list lookup isn't recorded: the fixture answers it unless `--real`.
   * @param input - Request URL
   * @param init - Request options
   * @returns A fake error, or the real response while live
   */
  globalThis.fetch = (input, init) => {
    if (input === OPENROUTER_MODELS_URL) {
      return run.args.real
        ? realFetch(input, init)
        : Promise.resolve(Response.json(STUB_OPENROUTER_MODELS));
    }

    run.captured = {
      url: typeof input === "string" ? input : "(request)",
      body: parseBody(init?.body),
    };

    return run.live
      ? realFetch(input, init)
      : Promise.resolve(new Response("{}", { status: 599 }));
  };
}

/**
 * Probe one (route, model, level): capture the body, and with `--real` send
 * it once per distinct body.
 * @param run - Run state
 * @param route - Provider route
 * @param model - Model id
 * @param level - Thinking level
 * @returns The text to print for this cell
 */
async function probeCell(
  run: Run,
  route: string,
  model: string,
  level: string,
): Promise<string> {
  const { args, builders } = run;
  const label = `${route} | ${model} | ${level}`;
  const keyVar = KEY_VARS.get(route);
  const key = (keyVar == null ? null : process.env[keyVar]) ?? "stub-key";

  if (args.real && key === "stub-key" && !LOCAL_ROUTES.includes(route)) {
    return `${label} | skipped: no key in env`;
  }

  const options = builders.buildOptions(route, level, model);
  const lm = builders.createModel(route, model, key);

  run.live = false;
  await runCall(lm, options, args);

  const body = JSON.stringify(
    run.captured?.body,
    args.dump ? undefined : elide,
  );
  const head = `${label} | opts=${options == null ? "none" : JSON.stringify(options)}\n  body=${body}`;

  if (!args.real) {
    return head;
  }

  const dedupe = `${route}|${model}|${body}`;
  const earlier = run.sent.get(dedupe);

  if (earlier != null) {
    return `${head}\n  => same body as an earlier cell: ${earlier}`;
  }

  run.live = true;
  run.realCalls++;

  const call = await runCall(lm, options, args);
  const warn =
    call.warnings.length > 0 ? ` WARN ${JSON.stringify(call.warnings)}` : "";

  run.live = false;
  run.sent.set(dedupe, call.status + warn);

  return `${head}\n  => ${call.status}${warn}`;
}

/**
 * Probe every selected cell.
 * @returns Nothing; results are printed
 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true },
    resolve: {
      alias: {
        "#webui": `${ROOT}webui/src`,
        "#src": `${ROOT}src`,
        "#evals": `${ROOT}evals`,
      },
    },
  });
  const load = (path: string): Promise<unknown> => server.ssrLoadModule(path);
  const { PROVIDER_MODELS } = (await load(
    "/webui/src/lib/constants/models.ts",
  )) as { PROVIDER_MODELS: Record<string, Array<{ value: string }>> };
  const run: Run = {
    args,
    builders: await loadBuilders(load, args.evals),
    captured: null,
    live: false,
    sent: new Map(),
    realCalls: 0,
  };
  const realFetch = globalThis.fetch;

  installFetchStub(run, realFetch);

  for (const { route, model } of listTargets(PROVIDER_MODELS, args)) {
    for (const level of args.levels) {
      console.log(await probeCell(run, route, model, level));
    }
  }

  globalThis.fetch = realFetch;
  await server.close();

  if (args.real) {
    console.log(`real calls sent: ${run.realCalls}`);
  }
}

await main();
