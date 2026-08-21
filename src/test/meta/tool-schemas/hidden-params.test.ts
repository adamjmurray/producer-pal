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
// deprecatedParam()/aliasParam() wrapper to a plain schema republishes the
// hidden name with no test failing — the framework tests only cover synthetic
// tools, and the e2e suite needs Ableton running.

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

describe("hidden params", () => {
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

  // Publishing any of these three is the bug: an index-shaped param next to a
  // description naming a track and a scene is what taught models to guess.
  it("publishes path and hides the index params it replaced on create-clip", () => {
    const createClip = publishedParams("ppal-create-clip");

    expect(createClip).toContain("path");
    expect(createClip).not.toContain("slot");
    expect(createClip).not.toContain("trackIndex");
    expect(createClip).not.toContain("sceneIndex");
  });

  it("keeps the create-clip index params as permanent aliases, not deprecations", () => {
    const def = STANDARD_TOOL_DEFS.find(
      (td: ToolDefFunction) => td.toolName === "ppal-create-clip",
    ) as ToolDefFunction;
    const { validating, hidden } = resolveToolSchema(
      def.toolOptions.inputSchema,
      {},
    );

    expect(Object.keys(validating)).toContain("trackIndex");
    expect(hidden.trackIndex).toStrictEqual({
      kind: "alias",
      canonical: "path",
      example: "t0/s0",
    });
    expect(hidden.slot).toStrictEqual({
      kind: "deprecated",
      replacedBy: "path",
    });
  });

  // Every tool names its target with "id". The prefixed spellings a model
  // reaches for on its own stay accepted for good, so a well-founded guess
  // costs a warning rather than a round trip.
  it("publishes id and hides the spelling it replaced", () => {
    const aliases = {
      "ppal-read-clip": "clipId",
      "ppal-read-track": "trackId",
      "ppal-read-scene": "sceneId",
      "ppal-read-device": "deviceId",
      "ppal-update-track": "ids",
      "ppal-update-scene": "ids",
      "ppal-update-clip": "ids",
      "ppal-update-device": "ids",
      "ppal-delete": "ids",
      "ppal-playback": "ids",
    };

    const shape = Object.fromEntries(
      Object.entries(aliases).map(([toolName, alias]) => {
        const def = STANDARD_TOOL_DEFS.find(
          (td: ToolDefFunction) => td.toolName === toolName,
        ) as ToolDefFunction;
        const { validating, hidden } = resolveToolSchema(
          def.toolOptions.inputSchema,
          {},
        );
        const published = publishedParams(toolName);

        return [
          toolName,
          {
            publishesId: published.includes("id"),
            publishesAlias: published.includes(alias),
            validatesAlias: Object.keys(validating).includes(alias),
            alias: hidden[alias],
          },
        ];
      }),
    );

    const folded = {
      publishesId: true,
      publishesAlias: false,
      validatesAlias: true,
      alias: { kind: "alias", canonical: "id" },
    };

    expect(shape).toStrictEqual({
      "ppal-read-clip": folded,
      "ppal-read-track": folded,
      "ppal-read-scene": folded,
      "ppal-read-device": folded,
      "ppal-update-track": folded,
      "ppal-update-clip": folded,
      "ppal-update-device": folded,
      "ppal-delete": folded,
      "ppal-playback": folded,
      "ppal-update-scene": folded,
    });
  });

  it("still validates the params it stopped publishing", () => {
    for (const toolName of ["ppal-duplicate", "ppal-update-clip"]) {
      const def = STANDARD_TOOL_DEFS.find(
        (td: ToolDefFunction) => td.toolName === toolName,
      ) as ToolDefFunction;
      const { validating, hidden } = resolveToolSchema(
        def.toolOptions.inputSchema,
        {},
      );

      expect(Object.keys(validating)).toContain("toSlot");
      expect(hidden.toSlot).toStrictEqual({
        kind: "deprecated",
        replacedBy: "toPath",
      });
    }
  });

  // The eval framework skips a scenario when it needs a param the model never
  // receives. A hidden param is exactly that, so it belongs in the set —
  // otherwise a scenario naming one silently fails instead of skipping.
  it("counts a hidden param as one a small model never receives", () => {
    expect(SMALL_MODEL_EXCLUDED_PARAMS).toContain("toSlot");
    // Still holds what small-model mode hides on its own.
    expect(SMALL_MODEL_EXCLUDED_PARAMS).toContain("split");
  });
});
