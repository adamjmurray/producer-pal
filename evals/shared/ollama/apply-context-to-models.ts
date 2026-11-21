// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Command } from "commander";
import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";
import { ensureOllamaContextModel } from "./ollama-context-model.ts";
import { LOCAL_DEFAULT_BASE_URL } from "#evals/shared/provider-configs.ts";
import { errorMessage } from "#src/shared/error-message.ts";

/**
 * Point every `local/...` model at a copy with the given context size.
 *
 * @param specs - The run's models
 * @param numCtx - Context size in tokens
 * @param baseUrl - Local server base URL
 * @returns The models, in order, with local ones renamed to their copy
 * @throws Error when no model is local, or a copy can't be made
 */
export async function applyContextToModels(
  specs: ModelSpec[],
  numCtx: number,
  baseUrl: string,
): Promise<ModelSpec[]> {
  if (!specs.some((spec) => spec.provider === "local")) {
    throw new Error(
      "--context needs a local/... model; it only applies to local models.",
    );
  }

  const copies = new Map<string, string>();
  const result: ModelSpec[] = [];

  for (const spec of specs) {
    if (spec.provider !== "local") {
      result.push(spec);
      continue;
    }

    let copy = copies.get(spec.model);

    if (copy == null) {
      copy = await ensureOllamaContextModel(spec.model, numCtx, baseUrl);
      copies.set(spec.model, copy);
    }

    result.push({ ...spec, model: copy });
  }

  return result;
}

/**
 * Apply `--context` to the local provider's server, reporting a failure as a
 * CLI usage error. Does not return on failure — commander exits.
 *
 * @param program - The commander program the option came from
 * @param specs - The run's models
 * @param numCtx - Context size in tokens
 * @returns The models with local ones renamed to their copy
 */
export async function applyContextOrExit(
  program: Command,
  specs: ModelSpec[],
  numCtx: number,
): Promise<ModelSpec[]> {
  try {
    return await applyContextToModels(
      specs,
      numCtx,
      process.env.LOCAL_BASE_URL ?? LOCAL_DEFAULT_BASE_URL,
    );
  } catch (error) {
    return program.error(errorMessage(error));
  }
}
