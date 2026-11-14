// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type LocalModelInfo } from "./local-model-info.ts";
import { fetchLocalServerJson } from "./local-server-fetch.ts";

interface OllamaDetails {
  format?: string;
  parameter_size?: string;
  quantization_level?: string;
  runner?: string;
}

interface OllamaLoadedModel {
  name: string;
  digest?: string;
  size?: number;
  context_length?: number;
  runner?: string;
  details?: OllamaDetails;
}

interface OllamaShow {
  details?: OllamaDetails;
  parameters?: string;
}

/**
 * Describe a model on an Ollama server. Uses `/api/ps` when the model is
 * loaded (adds loaded context length and memory), else `/api/show`.
 *
 * @param modelId - Model id the run requested; a bare id means `:latest`
 * @param baseUrl - Local server base URL
 * @returns Model build details, or undefined when unavailable
 */
export async function fetchOllamaModelInfo(
  modelId: string,
  baseUrl: string,
): Promise<LocalModelInfo | undefined> {
  const name = withTag(modelId);
  const ps = (await fetchLocalServerJson("/api/ps", baseUrl)) as
    | { models?: OllamaLoadedModel[] }
    | undefined;
  const loaded = ps?.models?.find((m) => m.name.toLowerCase() === name);

  if (loaded != null) {
    return describe(loaded.name, loaded.details, {
      runner: loaded.runner,
      digest: loaded.digest,
      memoryBytes: loaded.size,
      contextLength: loaded.context_length,
    });
  }

  const show = (await fetchLocalServerJson("/api/show", baseUrl, {
    model: name,
  })) as OllamaShow | undefined;

  return describe(name, show?.details, {
    contextLength: parseNumCtx(show?.parameters),
  });
}

// A bare id (no tag after the last "/") runs Ollama's `:latest`.
function withTag(modelId: string): string {
  const id = modelId.toLowerCase();

  return id.slice(id.lastIndexOf("/") + 1).includes(":") ? id : `${id}:latest`;
}

// `/api/show` lists parameters as text lines, e.g. "num_ctx 65536".
function parseNumCtx(parameters: string | undefined): number | undefined {
  const match = /^num_ctx\s+(\d+)/m.exec(parameters ?? "");

  return match?.[1] != null ? Number(match[1]) : undefined;
}

function describe(
  variant: string,
  details: OllamaDetails | undefined,
  extra: Partial<LocalModelInfo> & { runner?: string },
): LocalModelInfo | undefined {
  if (details == null) {
    return undefined;
  }

  const fields = {
    quantization: details.quantization_level,
    format: details.format,
    params: details.parameter_size,
    ...extra,
    runner: extra.runner ?? details.runner,
  };
  const info: Record<string, unknown> = { variant };

  for (const [key, value] of Object.entries(fields)) {
    if (value != null && value !== "") {
      info[key] = value;
    }
  }

  return info as unknown as LocalModelInfo;
}
