// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { expect } from "vitest";
import { z, type ZodType } from "zod";
import { unsetEmptyParams } from "#src/tools/shared/tool-framework/unset-empty-params.ts";

/**
 * Parses args through a tool's schema after nulls are dropped, and expects the
 * null trackIndex and sceneIndex to be left unset rather than coerced to 0.
 * @param params - The tool's validating params, keyed by name
 * @param raw - The raw args, with null for every param the caller left blank
 * @returns The parsed args
 */
export function parseNullLocationArgs(
  params: Record<string, ZodType>,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const args = z.object(params).parse(unsetEmptyParams(raw, params));

  expect(args.trackIndex).toBeUndefined();
  expect(args.sceneIndex).toBeUndefined();

  return args;
}
