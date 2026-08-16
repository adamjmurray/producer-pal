// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  SMALL_MODEL_EXCLUDED_PARAMS,
  STANDARD_TOOL_DEFS,
} from "#src/mcp-server/create-mcp-server.ts";
import { type ToolDefFunction } from "#src/tools/shared/tool-framework/define-tool.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";

// Pins the published shape of the real tools. Without this, reverting a
// deprecatedParam() wrapper to a plain schema republishes the retired name with
// no test failing — the framework tests only cover synthetic tools, and the e2e
// suite needs Ableton running.

/**
 * Read the params a tool publishes to the model.
 * @param toolName - Tool to look up
 * @returns Published param names
 */
function publishedParams(toolName: string): string[] {
  const def = STANDARD_TOOL_DEFS.find(
    (td: ToolDefFunction) => td.toolName === toolName,
  );

  expect(def, `tool ${toolName} not found`).toBeDefined();

  return Object.keys(
    resolveToolSchema((def as ToolDefFunction).toolOptions.inputSchema, {})
      .published,
  );
}

describe("deprecated params", () => {
  it("publishes toPath and hides the destination params it replaced", () => {
    const duplicate = publishedParams("ppal-duplicate");

    expect(duplicate).toContain("toPath");
    expect(duplicate).not.toContain("toSlot");
    // toTrack was never released — it existed only between the fix and this
    // unification, so it should be absent everywhere, not merely deprecated.
    expect(duplicate).not.toContain("toTrack");

    const updateClip = publishedParams("ppal-update-clip");

    expect(updateClip).toContain("toPath");
    expect(updateClip).not.toContain("toSlot");
  });

  it("still validates the params it stopped publishing", () => {
    for (const toolName of ["ppal-duplicate", "ppal-update-clip"]) {
      const def = STANDARD_TOOL_DEFS.find(
        (td: ToolDefFunction) => td.toolName === toolName,
      ) as ToolDefFunction;
      const { validating, deprecated } = resolveToolSchema(
        def.toolOptions.inputSchema,
        {},
      );

      expect(Object.keys(validating)).toContain("toSlot");
      expect(deprecated.toSlot).toStrictEqual({ replacedBy: "toPath" });
    }
  });

  // The eval framework skips a scenario when it needs a param the model never
  // receives. A deprecated param is exactly that, so it belongs in the set —
  // otherwise a scenario naming one silently fails instead of skipping.
  it("counts a deprecated param as one a small model never receives", () => {
    expect(SMALL_MODEL_EXCLUDED_PARAMS).toContain("toSlot");
    // Still holds what small-model mode hides on its own.
    expect(SMALL_MODEL_EXCLUDED_PARAMS).toContain("split");
  });
});
