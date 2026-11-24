// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { DEFAULT_LOCAL_URLS } from "#webui/lib/constants/provider-urls";
import { localServerRoot } from "#webui/chat/sdk/provider/local-model/local-server-root";
import { type Provider } from "#webui/types/settings";
import { withDefaultUrl } from "#webui/utils/provider-url";

/** A chat model a local server has downloaded */
export interface LocalModel {
  /** The id to chat with */
  id: string;
  /** Whether it's loaded in memory now */
  loaded: boolean;
  /** Context length it was loaded with; absent when not loaded or unknown */
  contextLength?: number;
}

export type LocalProvider = "lmstudio" | "ollama";

const LOOKUP_TIMEOUT_MS = 3000;

interface LmStudioModel {
  key: string;
  type?: string;
  loaded_instances?: { config?: { context_length?: number } }[];
}

interface OllamaTag {
  name: string;
  capabilities?: string[];
}

interface OllamaLoaded {
  name: string;
  context_length?: number;
}

/**
 * List the chat models a local server has downloaded, from its own API (the
 * OpenAI-style `/v1/models` doesn't say what's loaded). Never throws.
 *
 * Read the context length back from here, never assume the configured one:
 * LM Studio pads it per parallel slot. LM Studio also lists a loaded model as
 * unloaded when a different variant of it is selected, so a missing context
 * length means "unknown", never "use the model's maximum".
 * @param provider - Local provider
 * @param baseUrl - The provider's URL setting, with or without `/v1`
 * @returns The models, or undefined when the server can't be read
 */
export async function fetchLocalModels(
  provider: LocalProvider,
  baseUrl: string | undefined,
): Promise<LocalModel[] | undefined> {
  const root = serverRoot(provider, baseUrl);

  if (root == null) {
    return undefined;
  }

  return provider === "lmstudio"
    ? await fetchLmStudioModels(root)
    : await fetchOllamaModels(root);
}

/**
 * A lookup of the context length a local model is loaded with, for the chat
 * client to call each turn, or undefined for a cloud provider.
 * @param provider - Chat provider
 * @param baseUrl - The provider's URL setting
 * @param modelId - Model the chat uses
 * @returns The lookup, or undefined when the provider can't report one
 */
export function contextLengthLookup(
  provider: Provider,
  baseUrl: string | undefined,
  modelId: string,
): (() => Promise<number | undefined>) | undefined {
  if (provider !== "lmstudio" && provider !== "ollama") {
    return undefined;
  }

  const key = modelKey(provider, modelId);

  return async () => {
    const models = await fetchLocalModels(provider, baseUrl);

    return models?.find((m) => modelKey(provider, m.id) === key)?.contextLength;
  };
}

// The id the server lists a model under: LM Studio drops `@variant`, Ollama
// drops `:latest`.
function modelKey(provider: LocalProvider, id: string): string {
  const key = id.trim().toLowerCase();

  return provider === "lmstudio"
    ? (key.split("@")[0] as string)
    : key.replace(/:latest$/, "");
}

async function fetchLmStudioModels(
  root: string,
): Promise<LocalModel[] | undefined> {
  const body = (await getJson(`${root}/api/v1/models`)) as
    | { models?: LmStudioModel[] }
    | undefined;

  if (!Array.isArray(body?.models)) {
    return undefined;
  }

  return body.models
    .filter((m) => m.type == null || m.type === "llm")
    .map((m) => {
      const instance = m.loaded_instances?.[0];

      return withContextLength(
        { id: m.key, loaded: instance != null },
        instance?.config?.context_length,
      );
    });
}

async function fetchOllamaModels(
  root: string,
): Promise<LocalModel[] | undefined> {
  const [tags, ps] = await Promise.all([
    getJson(`${root}/api/tags`) as Promise<
      { models?: OllamaTag[] } | undefined
    >,
    getJson(`${root}/api/ps`) as Promise<
      { models?: OllamaLoaded[] } | undefined
    >,
  ]);

  if (!Array.isArray(tags?.models)) {
    return undefined;
  }

  const loaded = new Map((ps?.models ?? []).map((m) => [m.name, m]));

  return tags.models
    .filter((m) => m.capabilities?.includes("embedding") !== true)
    .map((m) => {
      const running = loaded.get(m.name);

      return withContextLength(
        { id: shortOllamaName(m.name), loaded: running != null },
        running?.context_length,
      );
    });
}

// Ollama runs `:latest` for a bare name, so show it bare like the presets.
function shortOllamaName(name: string): string {
  return name.replace(/:latest$/, "");
}

function withContextLength(
  model: LocalModel,
  contextLength: number | undefined,
): LocalModel {
  return typeof contextLength === "number" && contextLength > 0
    ? { ...model, contextLength }
    : model;
}

function serverRoot(
  provider: LocalProvider,
  baseUrl: string | undefined,
): string | undefined {
  try {
    return localServerRoot(
      withDefaultUrl(baseUrl, DEFAULT_LOCAL_URLS[provider] as string),
    );
  } catch {
    return undefined;
  }
}

async function getJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });

    return response.ok ? await response.json() : undefined;
  } catch {
    return undefined;
  }
}
