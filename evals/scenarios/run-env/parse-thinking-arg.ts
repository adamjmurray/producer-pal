// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Parser for the eval CLI's `--thinking` option.
 *
 * Each value is a comma list of `<level>` (every `-m` model) or
 * `<provider/model>=<level>` (one model, overriding the all-models level).
 * Levels are the chat CLI's: off, low, medium, high, ultra.
 */

import { getAgentCliTransport } from "#evals/chat/agent-cli/agent-cli-registry.ts";
import { agentCliEffort } from "#evals/chat/agent-cli/agent-cli-transport.ts";
import {
  type NamedThinkingLevel,
  type ThinkingLevel,
} from "#evals/chat/shared/types.ts";
import {
  type ModelSpec,
  parseModelArg,
} from "#evals/shared/parse-model-arg.ts";

/** Thinking level per model, keyed `provider/model`. A model not in it runs
 *  with nothing sent. */
export type ThinkingByModel = ReadonlyMap<string, ThinkingLevel>;

const NAMED_LEVELS: readonly NamedThinkingLevel[] = [
  "off",
  "low",
  "medium",
  "high",
  "ultra",
];

/**
 * Settle which thinking level each `-m` model runs at, refusing anything that
 * can't be expressed before a run starts.
 *
 * @param values - Collected `--thinking` values (each may be a comma list)
 * @param modelSpecs - The run's models, already parsed from `-m`
 * @returns Level per model key; models without one are left out
 * @throws Error on a bad level, an unknown model key, a repeat, or a level the
 *   model's provider can't express
 */
export function parseThinkingArgs(
  values: string[],
  modelSpecs: ModelSpec[],
): ThinkingByModel {
  const modelKeys = modelSpecs.map(modelKey);
  const perModel = new Map<string, string>();
  let everyModel: string | undefined;

  for (const entry of splitEntries(values)) {
    const eq = entry.lastIndexOf("=");

    if (eq === -1) {
      if (everyModel != null) {
        throw new Error(`--thinking: more than one level for every model`);
      }

      everyModel = validLevel(entry);
      continue;
    }

    const key = modelKey(parseModelArg(entry.slice(0, eq)));

    if (!modelKeys.includes(key)) {
      throw new Error(
        `--thinking: ${key} is not one of the -m models (${modelKeys.join(", ")})`,
      );
    }

    if (perModel.has(key)) {
      throw new Error(`--thinking: more than one level for ${key}`);
    }

    perModel.set(key, validLevel(entry.slice(eq + 1)));
  }

  const result = new Map<string, ThinkingLevel>();

  for (const spec of modelSpecs) {
    const key = modelKey(spec);
    const level = perModel.get(key) ?? everyModel;

    if (level != null) {
      assertExpressible(spec, level);
      result.set(key, level);
    }
  }

  return result;
}

/**
 * Format the levels for the run header.
 *
 * @param thinking - Level per model key
 * @returns Text like `codex-code/luna=high, openai/gpt-6.1-sol=low`
 */
export function describeThinking(thinking: ThinkingByModel): string {
  return [...thinking].map(([key, level]) => `${key}=${level}`).join(", ");
}

/**
 * @param spec - A parsed model
 * @returns Its `provider/model` key
 */
function modelKey(spec: ModelSpec): string {
  return `${spec.provider}/${spec.model}`;
}

/**
 * @param values - Collected option values
 * @returns Every comma-separated entry, trimmed, blanks dropped
 */
function splitEntries(values: string[]): string[] {
  return values
    .flatMap((value) => value.split(","))
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

/**
 * @param level - A level as typed
 * @returns The level when it's a named level or a token budget
 * @throws Error when it's neither
 */
function validLevel(level: string): string {
  if (
    NAMED_LEVELS.includes(level as NamedThinkingLevel) ||
    /^\d+$/.test(level)
  ) {
    return level;
  }

  throw new Error(
    `--thinking: unknown level "${level}". Use ${NAMED_LEVELS.join(", ")} ` +
      `(or a token budget for google models).`,
  );
}

/**
 * Refuse a level the model's provider would silently drop or can't pass on.
 *
 * @param spec - The model
 * @param level - A valid level
 * @throws Error when the provider can't express the level
 */
function assertExpressible(spec: ModelSpec, level: string): void {
  const key = modelKey(spec);
  const transport = getAgentCliTransport(spec.provider);

  if (transport != null) {
    if (agentCliEffort(transport, level) == null) {
      const supported = Object.keys(transport.efforts).join(", ");

      throw new Error(
        `--thinking ${level} can't be set for ${key}: the ${transport.label} ` +
          `takes ${supported}.`,
      );
    }

    return;
  }

  if (spec.provider === "local") {
    throw new Error(
      `--thinking can't be set for ${key}: local models have no thinking setting.`,
    );
  }

  if (/^\d+$/.test(level) && spec.provider !== "google") {
    throw new Error(
      `--thinking ${level} can't be set for ${key}: a token budget is for google models only.`,
    );
  }
}
