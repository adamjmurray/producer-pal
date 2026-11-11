// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Turns the `--decider` flag into the decider settings a run uses, checking at
 * startup that the provider is known and has its key.
 */

import {
  parseDeciderSpec,
  resolveDecider,
} from "#evals/decider/decider-provider.ts";
import { type DeciderSettings } from "./decider-first-judge.ts";

/** The CLI flags that decide how the judge runs. */
export interface DeciderFlags {
  /** `--decider` value: `jev`, a hosted provider, or `provider/model` */
  decider?: string;
  skipJudge?: boolean;
}

/**
 * Settle the decider settings for a run.
 *
 * @param flags - Parsed CLI flags
 * @returns The settings, or undefined when no decider is used (no `--decider`,
 *   or `--skip-judge`, which wins)
 * @throws On a bad `--decider` value, or a hosted provider with no API key. The
 *   run stops here rather than quietly judging without the decider.
 */
export function resolveDeciderSettings(
  flags: DeciderFlags,
): DeciderSettings | undefined {
  if (flags.decider == null || flags.skipJudge === true) {
    return undefined;
  }

  const { provider, model } = resolveDecider(parseDeciderSpec(flags.decider));

  return { provider, model };
}

/**
 * Turn the saved options of a run made with `--jev` / `--jev-via` into the
 * `--decider` value they meant, so resuming that run still judges with Jev.
 *
 * @param options - A run record's options
 * @returns The options without `jev` and `jevVia`, plus `decider` when `jev` was set
 */
export function withLegacyDecider<Options extends object>(
  options: Options,
): Options {
  const { jev, jevVia, ...rest } = options as Options & {
    jev?: boolean;
    jevVia?: string;
  };

  if (jev !== true) {
    return rest as Options;
  }

  return { ...rest, decider: jevVia ?? "jev" } as Options;
}
