// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Shared set-up for the probes that exercise the chat UI's real provider code:
 * the API-key variables, a Vite loader for `webui/` modules, and the chat UI's
 * option builder and provider factory.
 */

import { fileURLToPath } from "node:url";
import { type LanguageModel } from "ai";
import { createServer, type ViteDevServer } from "vite";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Environment variable that holds each hosted route's API key. */
export const KEY_VARS = new Map([
  ["anthropic", "ANTHROPIC_KEY"],
  ["openai", "OPENAI_KEY"],
  ["gemini", "GEMINI_KEY"],
  ["mistral", "MISTRAL_KEY"],
  ["openrouter", "OPENROUTER_KEY"],
  ["vercel", "VERCEL_AI_GATEWAY_KEY"],
]);

/** Routes that run on the user's machine and need no key. */
export const LOCAL_ROUTES = ["ollama", "lmstudio"];

/** Loads a repo module (path from the repo root) through Vite. */
export type ModuleLoader = (path: string) => Promise<unknown>;

/** The chat UI's request builders. */
export interface ChatBuilders {
  buildProviderOptions: (...args: string[]) => unknown;
  createProviderModel: (...args: string[]) => LanguageModel;
}

/**
 * Start a Vite server that can load `webui/`, `src/` and `evals/` modules.
 * @returns The server, to close when done, and a module loader
 */
export async function startModuleLoader(): Promise<{
  server: ViteDevServer;
  load: ModuleLoader;
}> {
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

  return { server, load: (path) => server.ssrLoadModule(path) };
}

/**
 * Load the chat UI's provider option builder and model factory.
 * @param load - Module loader from {@link startModuleLoader}
 * @returns The two builders
 */
export async function loadChatBuilders(
  load: ModuleLoader,
): Promise<ChatBuilders> {
  const { buildProviderOptions } = (await load(
    "/webui/src/chat/sdk/provider/provider-options.ts",
  )) as Pick<ChatBuilders, "buildProviderOptions">;
  const { createProviderModel } = (await load(
    "/webui/src/chat/sdk/provider/provider-factories.ts",
  )) as Pick<ChatBuilders, "createProviderModel">;

  return { buildProviderOptions, createProviderModel };
}
