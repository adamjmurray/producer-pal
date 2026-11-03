// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Turns the `--jev` / `--jev-via` flags into the Jev settings a run uses,
 * checking at startup that a route has its key.
 */

import { parseJevRoute, resolveJevRoute } from "#evals/jev/jev-client.ts";
import { type JevSettings } from "./jev-first-judge.ts";

/** The CLI flags that decide how the judge runs. */
export interface JevFlags {
  jev?: boolean;
  jevVia?: string;
  skipJudge?: boolean;
}

/**
 * Settle the Jev settings for a run.
 *
 * @param flags - Parsed CLI flags
 * @returns The settings, or undefined when Jev is not used (no `--jev`, or
 *   `--skip-judge`, which wins)
 * @throws On `--jev-via` without `--jev`, an unknown route, or a route with no
 *   API key. The run stops here rather than quietly judging without Jev.
 */
export function resolveJevSettings(flags: JevFlags): JevSettings | undefined {
  if (flags.jev !== true) {
    if (flags.jevVia != null) {
      throw new Error("--jev-via needs --jev");
    }

    return undefined;
  }

  if (flags.skipJudge === true) {
    return undefined;
  }

  const { route } = resolveJevRoute(parseJevRoute(flags.jevVia, "--jev-via"));

  return { route };
}
