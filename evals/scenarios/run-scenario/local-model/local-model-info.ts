// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Looks up which build of a local model served a run (quantization, format,
 * loaded context length) from LM Studio's `/api/v1/models` or Ollama's
 * `/api/ps`. The OpenAI-style endpoint the evals chat through reports only the
 * model id.
 */

import { LOCAL_DEFAULT_BASE_URL } from "#evals/shared/provider-configs.ts";
import { fetchLocalServerJson } from "./local-server-fetch.ts";
import { fetchOllamaModelInfo } from "./ollama-model-info.ts";

/** The local model build that served a run */
export interface LocalModelInfo {
  /** Variant id: "google/gemma-4-e4b@q4_k_m" (LM Studio) or
   *  "qwen3.8:latest" (Ollama) */
  variant: string;
  /** e.g. "Q4_K_M" or "4bit". Absent when the variant isn't LM Studio's
   *  selected one, since the listing describes only that one. */
  quantization?: string;
  bitsPerWeight?: number;
  /** "gguf" or "mlx" (LM Studio); "gguf" or "safetensors" (Ollama) */
  format?: string;
  /** Parameter count, e.g. "7.5B" */
  params?: string;
  /** File size (LM Studio only) */
  sizeBytes?: number;
  /** Ollama only: "llamacpp" or "mlx" */
  runner?: string;
  /** Ollama only: model digest */
  digest?: string;
  /** Ollama only: memory the loaded model uses, weights plus context cache.
   *  Not a file size. */
  memoryBytes?: number;
  /** Context length the model was loaded with, often far below its max */
  contextLength?: number;
}

interface LmStudioModel {
  key: string;
  quantization?: { name?: string; bits_per_weight?: number };
  format?: string;
  params_string?: string;
  size_bytes?: number;
  variants?: string[];
  selected_variant?: string;
  loaded_instances?: { id: string; config?: { context_length?: number } }[];
}

/**
 * Fetch the build details of a local model from LM Studio, else Ollama. Never
 * throws: a server with neither API just yields nothing.
 *
 * @param modelId - Model id the run requested, optionally with `@variant`
 * @param baseUrl - Local server base URL (defaults like the local provider)
 * @returns Model build details, or undefined when unavailable
 */
export async function fetchLocalModelInfo(
  modelId: string,
  baseUrl: string = process.env.LOCAL_BASE_URL ?? LOCAL_DEFAULT_BASE_URL,
): Promise<LocalModelInfo | undefined> {
  const lmStudio = (await fetchLocalServerJson("/api/v1/models", baseUrl)) as
    | { models?: LmStudioModel[] }
    | undefined;
  const info = pickLocalModelInfo(lmStudio?.models ?? [], modelId);

  return info ?? (await fetchOllamaModelInfo(modelId, baseUrl));
}

/**
 * Find the requested model in an LM Studio listing and describe its build.
 *
 * @param models - The `models` array from `/api/v1/models`
 * @param modelId - Model id the run requested, optionally with `@variant`
 * @returns Model build details, or undefined when the model isn't listed
 */
export function pickLocalModelInfo(
  models: LmStudioModel[],
  modelId: string,
): LocalModelInfo | undefined {
  const id = modelId.toLowerCase();
  const key = id.split("@")[0];
  const model = models.find((m) => m.key.toLowerCase() === key);

  if (model == null) {
    return undefined;
  }

  // A bare key runs LM Studio's selected variant.
  const variant = id.includes("@") ? id : model.selected_variant;

  if (variant == null) {
    return undefined;
  }

  const isSelected =
    variant.toLowerCase() === model.selected_variant?.toLowerCase();
  const instances = model.loaded_instances ?? [];
  const instance =
    instances.find((i) => i.id.toLowerCase() === id) ?? instances[0];

  return {
    variant,
    ...(isSelected && {
      quantization: model.quantization?.name,
      bitsPerWeight: model.quantization?.bits_per_weight,
    }),
    format: model.format,
    params: model.params_string,
    sizeBytes: model.size_bytes,
    contextLength: instance?.config?.context_length,
  };
}
