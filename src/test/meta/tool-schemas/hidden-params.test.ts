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

/**
 * What each (tool, alias) pair actually does with its canonical param.
 * @param aliases - Tool name and alias param name pairs
 * @param canonical - The param the aliases fold onto
 * @returns One shape per pair, keyed "tool.alias"
 */
function aliasShapes(
  aliases: Array<[string, string]>,
  canonical: string,
): Record<string, unknown> {
  return Object.fromEntries(
    aliases.map(([toolName, alias]) => {
      const def = STANDARD_TOOL_DEFS.find(
        (td: ToolDefFunction) => td.toolName === toolName,
      ) as ToolDefFunction;
      const { validating, hidden } = resolveToolSchema(
        def.toolOptions.inputSchema,
        {},
      );
      const published = publishedParams(toolName);

      return [
        `${toolName}.${alias}`,
        {
          publishesCanonical: published.includes(canonical),
          publishesAlias: published.includes(alias),
          validatesAlias: Object.keys(validating).includes(alias),
          alias: hidden[alias],
        },
      ];
    }),
  );
}

/**
 * The shape every folded alias must have: canonical published, alias accepted
 * but not published.
 * @param aliases - Tool name and alias param name pairs
 * @param canonical - The param the aliases fold onto
 * @param extra - Extra alias-info fields these aliases carry
 * @returns The expected shapes, keyed the same way as {@link aliasShapes}
 */
function foldedShapes(
  aliases: Array<[string, string]>,
  canonical: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return Object.fromEntries(
    aliases.map(([toolName, alias]) => [
      `${toolName}.${alias}`,
      {
        publishesCanonical: true,
        publishesAlias: false,
        validatesAlias: true,
        alias: { kind: "alias", canonical, ...extra },
      },
    ]),
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

  // playback was the last tool publishing an index param, so a model reading
  // its schema saw two spellings for one scene.
  it("publishes path and hides playback's index params", () => {
    const playback = publishedParams("ppal-playback");

    expect(playback).toContain("path");
    expect(playback).not.toContain("sceneIndex");
    expect(playback).not.toContain("slots");

    const def = STANDARD_TOOL_DEFS.find(
      (td: ToolDefFunction) => td.toolName === "ppal-playback",
    ) as ToolDefFunction;
    const { validating, hidden } = resolveToolSchema(
      def.toolOptions.inputSchema,
      {},
    );

    expect(Object.keys(validating)).toContain("sceneIndex");
    expect(hidden.sceneIndex).toStrictEqual({
      kind: "deprecated",
      replacedBy: "path",
    });
  });

  // Every tool names its target with "id". The prefixed spellings a model
  // reaches for on its own stay accepted for good, so a well-founded guess
  // costs a warning rather than a round trip.
  it("publishes id and hides the spelling it replaced", () => {
    const aliases: Array<[string, string]> = [
      ["ppal-read-clip", "clipId"],
      ["ppal-read-track", "trackId"],
      ["ppal-read-scene", "sceneId"],
      ["ppal-read-device", "deviceId"],
      ["ppal-update-track", "ids"],
      ["ppal-update-scene", "ids"],
      ["ppal-update-clip", "ids"],
      ["ppal-update-device", "ids"],
      ["ppal-delete", "ids"],
      ["ppal-playback", "ids"],
      // Takes one source, so `ids` is a guess rather than a rename — caught all
      // the same, and refused by name when it holds a list.
      ["ppal-duplicate", "ids"],
    ];

    expect(aliasShapes(aliases, "id")).toStrictEqual(
      foldedShapes(aliases, "id"),
    );
  });

  // select is the only tool that takes every object type by id, so all four
  // prefixed spellings are ones a model reaches for here. They are independent:
  // each selects its own object, so several of them can't fold into one `id`.
  it("folds every prefixed spelling onto select's id", () => {
    const aliases: Array<[string, string]> = [
      ["ppal-select", "trackId"],
      ["ppal-select", "sceneId"],
      ["ppal-select", "clipId"],
      ["ppal-select", "deviceId"],
    ];

    expect(aliasShapes(aliases, "id")).toStrictEqual(
      foldedShapes(aliases, "id", { independent: true }),
    );
  });

  // `path` takes a comma-separated list on these four, so the plural is the
  // same well-founded guess `ids` is.
  it("publishes path and accepts paths as a fallback", () => {
    const aliases: Array<[string, string]> = [
      ["ppal-update-clip", "paths"],
      ["ppal-update-device", "paths"],
      ["ppal-delete", "paths"],
      ["ppal-playback", "paths"],
    ];

    expect(aliasShapes(aliases, "path")).toStrictEqual(
      foldedShapes(aliases, "path"),
    );
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
