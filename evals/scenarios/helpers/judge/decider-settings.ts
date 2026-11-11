// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Turns the `--jev` / `--jev-via` flags into the decider settings a run uses,
 * checking at startup that a route has its key.
 */

import {
  parseDeciderRoute,
  resolveDeciderRoute,
} from "#evals/decider/decider-client.ts";
import { type DeciderSettings } from "./decider-first-judge.ts";

/** The CLI flags that decide how the judge runs. */
export interface DeciderFlags {
  jev?: boolean;
  jevVia?: string;
  skipJudge?: boolean;
}

/**
 * Settle the decider settings for a run.
 *
 * @param flags - Parsed CLI flags
 * @returns The settings, or undefined when the decider is not used (no `--jev`, or
 *   `--skip-judge`, which wins)
 * @throws On `--jev-via` without `--jev`, an unknown route, or a route with no
 *   API key. The run stops here rather than quietly judging without the decider.
 */
export function resolveDeciderSettings(
  flags: DeciderFlags,
): DeciderSettings | undefined {
  if (flags.jev !== true) {
    if (flags.jevVia != null) {
      throw new Error("--jev-via needs --jev");
    }

    return undefined;
  }

  if (flags.skipJudge === true) {
    return undefined;
  }

  const { route } = resolveDeciderRoute(
    parseDeciderRoute(flags.jevVia, "--jev-via"),
  );

  return { route };
}
